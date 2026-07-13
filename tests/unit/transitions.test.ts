import { ApprovalAction, TransactionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  getApprovalTarget,
  getDecisionTarget,
} from "@/server/transactions/transitions";

describe("transaction transitions", () => {
  it.each([
    ["APPROVE", TransactionStatus.APPROVED],
    ["REJECT", TransactionStatus.REJECTED],
    ["ESCALATE", TransactionStatus.ESCALATED],
  ] as const)("maps FLAGGED + %s to %s", (action, expected) => {
    expect(getDecisionTarget(TransactionStatus.FLAGGED, action)).toBe(expected);
  });

  it.each([
    TransactionStatus.APPROVED,
    TransactionStatus.REJECTED,
    TransactionStatus.ESCALATED,
  ])("treats %s as terminal", (status) => {
    expect(getDecisionTarget(status, "APPROVE")).toBeNull();
    expect(getDecisionTarget(status, "REJECT")).toBeNull();
    expect(getDecisionTarget(status, "ESCALATE")).toBeNull();
  });

  it("derives approval targets from the typed requested action", () => {
    expect(getApprovalTarget(ApprovalAction.APPROVE)).toBe(
      TransactionStatus.APPROVED,
    );
    expect(getApprovalTarget(ApprovalAction.REJECT)).toBe(
      TransactionStatus.REJECTED,
    );
  });
});
