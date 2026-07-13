import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  canCompleteApproval,
  canCreateApprovalRequest,
  canDecide,
  canViewAuditTrail,
  canViewPendingApprovals,
  canViewTransactions,
} from "@/server/authorization/policies";

describe("role policies", () => {
  it.each([Role.SUPPORT, Role.OPERATIONS, Role.APPROVER])(
    "allows %s to view transactions",
    (role) => {
      expect(canViewTransactions(role)).toBe(true);
    },
  );

  it("only allows Operations to decide", () => {
    expect(canDecide(Role.SUPPORT)).toBe(false);
    expect(canDecide(Role.OPERATIONS)).toBe(true);
    expect(canDecide(Role.APPROVER)).toBe(false);
  });

  it("only allows Approver to view the complete audit trail", () => {
    expect(canViewAuditTrail(Role.SUPPORT)).toBe(false);
    expect(canViewAuditTrail(Role.OPERATIONS)).toBe(false);
    expect(canViewAuditTrail(Role.APPROVER)).toBe(true);
  });

  it("only allows Operations to create approval requests", () => {
    expect(canCreateApprovalRequest(Role.SUPPORT)).toBe(false);
    expect(canCreateApprovalRequest(Role.OPERATIONS)).toBe(true);
    expect(canCreateApprovalRequest(Role.APPROVER)).toBe(false);
  });

  it("only allows Approver to view and complete pending approvals", () => {
    expect(canViewPendingApprovals(Role.SUPPORT)).toBe(false);
    expect(canViewPendingApprovals(Role.OPERATIONS)).toBe(false);
    expect(canViewPendingApprovals(Role.APPROVER)).toBe(true);
    expect(canCompleteApproval(Role.SUPPORT)).toBe(false);
    expect(canCompleteApproval(Role.OPERATIONS)).toBe(false);
    expect(canCompleteApproval(Role.APPROVER)).toBe(true);
  });
});
