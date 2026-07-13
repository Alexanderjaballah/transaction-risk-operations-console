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
import {
  createApprovalRequest,
  HIGH_VALUE_THRESHOLD_MINOR,
} from "@/server/approvals/approval-service";
import { createAuditEvent } from "@/server/audit/audit-service";
import { prisma } from "@/server/db";
import {
  decisionPayloadSchema,
  extractActionLabel,
} from "@/server/transactions/schemas";
import { getDecisionTarget } from "@/server/transactions/transitions";

interface DecisionFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
}

interface DirectDecisionSuccess {
  ok: true;
  kind: "DECIDED";
  transaction: Transaction;
}

interface PendingApprovalSuccess {
  ok: true;
  kind: "PENDING_APPROVAL";
  transaction: Transaction;
  approvalRequest: ApprovalRequest;
}

export type DecisionResult =
  | DecisionFailure
  | DirectDecisionSuccess
  | PendingApprovalSuccess;

export async function recordForbiddenDecision(
  actor: User,
  transactionId: string,
): Promise<DecisionFailure> {
  await createAuditEvent({
    actor,
    action: "DECISION_ATTEMPT",
    resourceType: "TRANSACTION",
    resourceId: transactionId,
    previousState: null,
    newState: null,
    reason: null,
    outcome: AuditOutcome.DENIED,
  });

  return {
    ok: false,
    status: 403,
    code: "DECISION_FORBIDDEN",
    message: "You are not authorized to make transaction decisions.",
  };
}

export async function executeDecision(
  actor: User,
  transactionId: string,
  rawPayload: unknown,
): Promise<DecisionResult> {
  try {
    return await prisma.$transaction(async (client) => {
      const transaction = await client.transaction.findUnique({
        where: { id: transactionId },
      });
      const attemptedAction = extractActionLabel(rawPayload);

      if (!transaction) {
        await createAuditEvent(
          {
            actor,
            action: attemptedAction,
            resourceType: "TRANSACTION",
            resourceId: transactionId,
            previousState: null,
            newState: null,
            reason: null,
            outcome: AuditOutcome.DENIED,
          },
          client,
        );

        return {
          ok: false,
          status: 404,
          code: "TRANSACTION_NOT_FOUND",
          message: "The requested transaction was not found.",
        };
      }

      const parsed = decisionPayloadSchema.safeParse(rawPayload);

      if (!parsed.success) {
        await createAuditEvent(
          {
            actor,
            action: attemptedAction,
            resourceType: "TRANSACTION",
            resourceId: transaction.id,
            previousState: transaction.status,
            newState: transaction.status,
            reason: null,
            outcome: AuditOutcome.DENIED,
          },
          client,
        );

        return {
          ok: false,
          status: 400,
          code: "DECISION_INVALID_PAYLOAD",
          message: "The decision request is invalid.",
        };
      }

      const reason = parsed.data.reason.trim();

      if (!reason) {
        await createAuditEvent(
          {
            actor,
            action: parsed.data.action,
            resourceType: "TRANSACTION",
            resourceId: transaction.id,
            previousState: transaction.status,
            newState: transaction.status,
            reason: null,
            outcome: AuditOutcome.DENIED,
          },
          client,
        );

        return {
          ok: false,
          status: 422,
          code: "DECISION_REASON_REQUIRED",
          message: "A written reason is required.",
        };
      }

      const newStatus = getDecisionTarget(
        transaction.status,
        parsed.data.action,
      );

      if (!newStatus) {
        await createAuditEvent(
          {
            actor,
            action: parsed.data.action,
            resourceType: "TRANSACTION",
            resourceId: transaction.id,
            previousState: transaction.status,
            newState: transaction.status,
            reason,
            outcome: AuditOutcome.DENIED,
          },
          client,
        );

        return {
          ok: false,
          status: 409,
          code: "DECISION_INVALID_TRANSITION",
          message: "This transaction is already in a terminal state.",
        };
      }

      const pendingRequest = await client.approvalRequest.findUnique({
        where: { activeTransactionId: transaction.id },
      });

      if (pendingRequest) {
        await createAuditEvent(
          {
            actor,
            action: parsed.data.action,
            resourceType:
              parsed.data.action === "ESCALATE"
                ? "TRANSACTION"
                : "APPROVAL_REQUEST",
            resourceId:
              parsed.data.action === "ESCALATE"
                ? transaction.id
                : pendingRequest.id,
            previousState: transaction.status,
            newState: transaction.status,
            reason,
            outcome: AuditOutcome.DENIED,
          },
          client,
        );

        return {
          ok: false,
          status: 409,
          code:
            parsed.data.action === "ESCALATE"
              ? "TRANSACTION_STATE_CONFLICT"
              : "APPROVAL_ALREADY_PENDING",
          message:
            parsed.data.action === "ESCALATE"
              ? "This transaction has a pending approval request."
              : "This transaction already has a pending approval request.",
        };
      }

      if (
        parsed.data.action !== "ESCALATE" &&
        transaction.amountMinor > HIGH_VALUE_THRESHOLD_MINOR
      ) {
        const action =
          parsed.data.action === "APPROVE"
            ? ApprovalAction.APPROVE
            : ApprovalAction.REJECT;
        const approvalRequest = await createApprovalRequest(
          actor,
          transaction,
          action,
          reason,
          client,
        );

        return {
          ok: true,
          kind: "PENDING_APPROVAL",
          transaction,
          approvalRequest,
        };
      }

      const updatedCount = await client.transaction.updateMany({
        where: {
          id: transaction.id,
          status: TransactionStatus.FLAGGED,
          approvalRequests: {
            none: { status: ApprovalStatus.PENDING },
          },
        },
        data: { status: newStatus },
      });

      if (updatedCount.count !== 1) {
        await createAuditEvent(
          {
            actor,
            action: parsed.data.action,
            resourceType: "TRANSACTION",
            resourceId: transaction.id,
            previousState: transaction.status,
            newState: transaction.status,
            reason,
            outcome: AuditOutcome.DENIED,
          },
          client,
        );

        return {
          ok: false,
          status: 409,
          code: "TRANSACTION_STATE_CONFLICT",
          message: "The transaction state changed before this decision.",
        };
      }

      const updated = await client.transaction.findUniqueOrThrow({
        where: { id: transaction.id },
      });

      await createAuditEvent(
        {
          actor,
          action: parsed.data.action,
          resourceType: "TRANSACTION",
          resourceId: transaction.id,
          previousState: transaction.status,
          newState: updated.status,
          reason,
          outcome: AuditOutcome.SUCCESS,
        },
        client,
      );

      return {
        ok: true,
        kind: "DECIDED",
        transaction: updated,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const parsed = decisionPayloadSchema.safeParse(rawPayload);
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      });
      const activeRequest = await prisma.approvalRequest.findUnique({
        where: { activeTransactionId: transactionId },
      });

      if (parsed.success && transaction) {
        try {
          await createAuditEvent({
            actor,
            action: parsed.data.action,
            resourceType: "APPROVAL_REQUEST",
            resourceId: activeRequest?.id ?? transactionId,
            previousState: transaction.status,
            newState: transaction.status,
            reason: parsed.data.reason.trim() || null,
            outcome: AuditOutcome.DENIED,
          });
        } catch {
          console.error(
            "Duplicate approval denial audit event could not be recorded.",
          );
        }
      }

      return {
        ok: false,
        status: 409,
        code: "APPROVAL_ALREADY_PENDING",
        message: "This transaction already has a pending approval request.",
      };
    }

    throw error;
  }
}
