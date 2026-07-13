import { TransactionStatus } from "@prisma/client";
import type { DecisionAction } from "@/server/transactions/schemas";

const flaggedTransitions: Record<DecisionAction, TransactionStatus> = {
  APPROVE: TransactionStatus.APPROVED,
  REJECT: TransactionStatus.REJECTED,
  ESCALATE: TransactionStatus.ESCALATED,
};

export function getDecisionTarget(
  currentStatus: TransactionStatus,
  action: DecisionAction,
): TransactionStatus | null {
  if (currentStatus !== TransactionStatus.FLAGGED) {
    return null;
  }

  return flaggedTransitions[action];
}
