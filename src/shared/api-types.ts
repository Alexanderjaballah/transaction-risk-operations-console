export type Role = "SUPPORT" | "OPERATIONS" | "APPROVER";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type TransactionStatus =
  | "FLAGGED"
  | "APPROVED"
  | "REJECTED"
  | "ESCALATED";

export interface DemoUser {
  id: string;
  name: string;
  role: Role;
}

export interface TransactionSummary {
  id: string;
  merchant: string;
  amountMinor: number;
  currency: string;
  paymentMethod: string;
  riskLevel: RiskLevel;
  flagReason: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    accountStatus: string;
    maskedAccountReference: string;
  };
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  action: string;
  resourceType: string;
  resourceId: string;
  previousState: TransactionStatus | null;
  newState: TransactionStatus | null;
  reason: string | null;
  outcome: "SUCCESS" | "DENIED" | "PENDING";
  createdAt: string;
}
