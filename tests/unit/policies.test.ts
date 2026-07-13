import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  canDecide,
  canViewAuditTrail,
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
});
