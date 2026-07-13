import { ApprovalAction, TransactionStatus } from "@prisma/client";
import type { DecisionAction } from "@/server/transactions/schemas";

const flaggedTransitions: Record<DecisionAction, TransactionStatus> = {
  APPROVE: TransactionStatus.APPROVED,
  REJECT: TransactionStatus.REJECTED,
  ESCALATE: TransactionStatus.ESCALATED,
};

const approvalTargets: Record<ApprovalAction, TransactionStatus> = {
  APPROVE: TransactionStatus.APPROVED,
  REJECT: TransactionStatus.REJECTED,
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

export function getApprovalTarget(action: ApprovalAction): TransactionStatus {
  return approvalTargets[action];
}
