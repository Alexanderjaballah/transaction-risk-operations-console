import {
  ApprovalAction,
  ApprovalStatus,
  AuditOutcome,
  Prisma,
  TransactionStatus,
  type ApprovalRequest,
  type Transaction,
  type User,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createAuditEvent } from "@/server/audit/audit-service";
import { prisma } from "@/server/db";
import { HIGH_VALUE_THRESHOLD_MINOR } from "@/shared/workflow";
import {
  approvalCompletionSchema,
  extractActionLabel,
} from "@/server/transactions/schemas";
import { getApprovalTarget } from "@/server/transactions/transitions";

type ApprovalClient = Prisma.TransactionClient;

interface ApprovalFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
}

interface ApprovalSuccess {
  ok: true;
  approvalRequest: ApprovalRequest;
  transaction: Transaction;
}

export type ApprovalCompletionResult = ApprovalFailure | ApprovalSuccess;

export { HIGH_VALUE_THRESHOLD_MINOR };

export async function createApprovalRequest(
  actor: User,
  transaction: Transaction,
  action: ApprovalAction,
  reason: string,
  client: ApprovalClient,
) {
  const requestedTargetState = getApprovalTarget(action);
  const approvalRequest = await client.approvalRequest.create({
    data: {
      id: `APR-${randomUUID()}`,
      transactionId: transaction.id,
      requestedAction: action,
      requestedTargetState,
      requestedById: actor.id,
      requestedByName: actor.name,
      requestedByRole: actor.role,
      requestReason: reason,
      status: ApprovalStatus.PENDING,
      activeTransactionId: transaction.id,
    },
  });

  await createAuditEvent(
    {
      actor,
      action,
      resourceType: "APPROVAL_REQUEST",
      resourceId: approvalRequest.id,
      previousState: transaction.status,
      newState: transaction.status,
      reason,
      outcome: AuditOutcome.PENDING,
    },
    client,
  );

  return approvalRequest;
}

export async function listPendingApprovals() {
  return prisma.approvalRequest.findMany({
    where: { status: ApprovalStatus.PENDING },
    include: {
      transaction: {
        include: {
          customer: {
            select: {
              name: true,
              accountLastFour: true,
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function auditApprovalDenial(
  actor: User,
  approvalId: string,
  action: string,
  reason: string | null,
) {
  try {
    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id: approvalId },
      include: { transaction: true },
    });
    const state = approvalRequest?.transaction.status ?? null;

    await createAuditEvent({
      actor,
      action,
      resourceType: "APPROVAL_REQUEST",
      resourceId: approvalId,
      previousState: state,
      newState: state,
      reason,
      outcome: AuditOutcome.DENIED,
    });
  } catch {
    console.error("Approval denial audit event could not be recorded.");
  }
}

export async function recordForbiddenApprovalCompletion(
  actor: User,
  approvalId: string,
) {
  await auditApprovalDenial(
    actor,
    approvalId,
    "APPROVAL_COMPLETION_ATTEMPT",
    null,
  );

  return {
    ok: false,
    status: 403,
    code: "APPROVAL_FORBIDDEN",
    message: "You are not authorized to complete approval requests.",
  } satisfies ApprovalFailure;
}

export async function recordForbiddenApprovalView(actor: User) {
  await createAuditEvent({
    actor,
    action: "VIEW_PENDING_APPROVALS",
    resourceType: "APPROVAL_QUEUE",
    resourceId: "PENDING",
    previousState: null,
    newState: null,
    reason: null,
    outcome: AuditOutcome.DENIED,
  });
}

class ApprovalStateConflict extends Error {
  constructor(
    readonly failure: ApprovalFailure,
    readonly action: string,
    readonly reason: string,
  ) {
    super(failure.code);
  }
}

function completionFailure(
  status: number,
  code: string,
  message: string,
): ApprovalFailure {
  return { ok: false, status, code, message };
}

export async function completeApproval(
  actor: User,
  approvalId: string,
  rawPayload: unknown,
): Promise<ApprovalCompletionResult> {
  const parsed = approvalCompletionSchema.safeParse(rawPayload);
  const attemptedAction = extractActionLabel(rawPayload);

  if (!parsed.success) {
    await auditApprovalDenial(actor, approvalId, attemptedAction, null);
    return completionFailure(
      400,
      "APPROVAL_INVALID_PAYLOAD",
      "The approval request is invalid.",
    );
  }

  const reason = parsed.data.reason.trim();

  if (!reason) {
    await auditApprovalDenial(actor, approvalId, parsed.data.action, null);
    return completionFailure(
      422,
      "REVIEW_REASON_REQUIRED",
      "A written review reason is required.",
    );
  }

  const nextStatus =
    parsed.data.action === "APPROVE"
      ? ApprovalStatus.APPROVED
      : ApprovalStatus.VETOED;

  try {
    return await prisma.$transaction(async (client) => {
      const completed = await client.approvalRequest.updateMany({
        where: {
          id: approvalId,
          status: ApprovalStatus.PENDING,
          requestedById: { not: actor.id },
        },
        data: {
          status: nextStatus,
          activeTransactionId: null,
          reviewedById: actor.id,
          reviewedByName: actor.name,
          reviewedByRole: actor.role,
          reviewReason: reason,
          reviewedAt: new Date(),
        },
      });

      if (completed.count !== 1) {
        const current = await client.approvalRequest.findUnique({
          where: { id: approvalId },
          include: { transaction: true },
        });

        if (!current) {
          await createAuditEvent(
            {
              actor,
              action: parsed.data.action,
              resourceType: "APPROVAL_REQUEST",
              resourceId: approvalId,
              previousState: null,
              newState: null,
              reason,
              outcome: AuditOutcome.DENIED,
            },
            client,
          );
          return completionFailure(
            404,
            "APPROVAL_NOT_FOUND",
            "The requested approval was not found.",
          );
        }

        if (current.requestedById === actor.id) {
          await createAuditEvent(
            {
              actor,
              action: parsed.data.action,
              resourceType: "APPROVAL_REQUEST",
              resourceId: current.id,
              previousState: current.transaction.status,
              newState: current.transaction.status,
              reason,
              outcome: AuditOutcome.DENIED,
            },
            client,
          );
          return completionFailure(
            403,
            "SELF_APPROVAL_FORBIDDEN",
            "You cannot complete your own approval request.",
          );
        }

        await createAuditEvent(
          {
            actor,
            action: parsed.data.action,
            resourceType: "APPROVAL_REQUEST",
            resourceId: current.id,
            previousState: current.transaction.status,
            newState: current.transaction.status,
            reason,
            outcome: AuditOutcome.DENIED,
          },
          client,
        );
        return completionFailure(
          409,
          "APPROVAL_ALREADY_COMPLETED",
          "This approval request has already been completed.",
        );
      }

      const approvalRequest = await client.approvalRequest.findUniqueOrThrow({
        where: { id: approvalId },
        include: { transaction: true },
      });
      const expectedTarget = getApprovalTarget(
        approvalRequest.requestedAction,
      );

      if (
        approvalRequest.transaction.status !== TransactionStatus.FLAGGED ||
        approvalRequest.requestedTargetState !== expectedTarget
      ) {
        throw new ApprovalStateConflict(
          completionFailure(
            409,
            "TRANSACTION_STATE_CONFLICT",
            "The transaction is no longer eligible for this approval.",
          ),
          parsed.data.action,
          reason,
        );
      }

      let transaction = approvalRequest.transaction;

      if (parsed.data.action === "APPROVE") {
        const updated = await client.transaction.updateMany({
          where: {
            id: transaction.id,
            status: TransactionStatus.FLAGGED,
          },
          data: { status: approvalRequest.requestedTargetState },
        });

        if (updated.count !== 1) {
          throw new ApprovalStateConflict(
            completionFailure(
              409,
              "TRANSACTION_STATE_CONFLICT",
              "The transaction is no longer eligible for this approval.",
            ),
            parsed.data.action,
            reason,
          );
        }

        transaction = await client.transaction.findUniqueOrThrow({
          where: { id: transaction.id },
        });
      }

      await createAuditEvent(
        {
          actor,
          action:
            parsed.data.action === "APPROVE"
              ? `APPROVE_${approvalRequest.requestedAction}_REQUEST`
              : `VETO_${approvalRequest.requestedAction}_REQUEST`,
          resourceType: "APPROVAL_REQUEST",
          resourceId: approvalRequest.id,
          previousState: TransactionStatus.FLAGGED,
          newState: transaction.status,
          reason,
          outcome: AuditOutcome.SUCCESS,
        },
        client,
      );

      return {
        ok: true,
        approvalRequest: {
          ...approvalRequest,
          status: nextStatus,
          activeTransactionId: null,
          reviewedById: actor.id,
          reviewedByName: actor.name,
          reviewedByRole: actor.role,
          reviewReason: reason,
        },
        transaction,
      };
    });
  } catch (error) {
    if (error instanceof ApprovalStateConflict) {
      await auditApprovalDenial(
        actor,
        approvalId,
        error.action,
        error.reason,
      );
      return error.failure;
    }

    const current = await prisma.approvalRequest.findUnique({
      where: { id: approvalId },
    });

    if (current && current.status !== ApprovalStatus.PENDING) {
      await auditApprovalDenial(
        actor,
        approvalId,
        parsed.data.action,
        reason,
      );
      return completionFailure(
        409,
        "APPROVAL_ALREADY_COMPLETED",
        "This approval request has already been completed.",
      );
    }

    throw error;
  }
}

export function serializeApprovalRequest<
  T extends {
    createdAt: Date;
    reviewedAt: Date | null;
    transaction: {
      createdAt: Date;
      updatedAt: Date;
      customer: {
        accountLastFour: string;
      };
    };
  },
>(approvalRequest: T) {
  return {
    ...approvalRequest,
    createdAt: approvalRequest.createdAt.toISOString(),
    reviewedAt: approvalRequest.reviewedAt?.toISOString() ?? null,
    transaction: {
      ...approvalRequest.transaction,
      createdAt: approvalRequest.transaction.createdAt.toISOString(),
      updatedAt: approvalRequest.transaction.updatedAt.toISOString(),
      customer: {
        ...approvalRequest.transaction.customer,
        maskedAccountReference: `•••• ${approvalRequest.transaction.customer.accountLastFour}`,
        accountLastFour: undefined,
      },
    },
  };
}
