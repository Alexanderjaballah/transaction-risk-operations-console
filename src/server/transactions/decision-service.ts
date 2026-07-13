import {
  AuditOutcome,
  type Transaction,
  type User,
} from "@prisma/client";
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

interface DecisionSuccess {
  ok: true;
  transaction: Transaction;
}

export type DecisionResult = DecisionFailure | DecisionSuccess;

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
  return prisma.$transaction(async (client) => {
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

    const newStatus = getDecisionTarget(transaction.status, parsed.data.action);

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

    const updated = await client.transaction.update({
      where: { id: transaction.id },
      data: { status: newStatus },
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
      transaction: updated,
    };
  });
}
