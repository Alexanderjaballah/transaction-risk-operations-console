import { Role } from "@prisma/client";

export function canViewTransactions(role: Role) {
  return (
    role === Role.SUPPORT ||
    role === Role.OPERATIONS ||
    role === Role.APPROVER
  );
}

export function canDecide(role: Role) {
  return role === Role.OPERATIONS;
}

export function canViewAuditTrail(role: Role) {
  return role === Role.APPROVER;
}

export function canCreateApprovalRequest(role: Role) {
  return role === Role.OPERATIONS;
}

export function canViewPendingApprovals(role: Role) {
  return role === Role.APPROVER;
}

export function canCompleteApproval(role: Role) {
  return role === Role.APPROVER;
}
