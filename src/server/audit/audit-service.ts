import {
  AuditOutcome,
  type Prisma,
  type TransactionStatus,
  type User,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";

type AuditClient = Prisma.TransactionClient | typeof prisma;

interface AuditEventInput {
  actor: User;
  action: string;
  resourceType: string;
  resourceId: string;
  previousState: TransactionStatus | null;
  newState: TransactionStatus | null;
  reason: string | null;
  outcome: AuditOutcome;
}

export async function createAuditEvent(
  input: AuditEventInput,
  client: AuditClient = prisma,
) {
  return client.auditEvent.create({
    data: {
      id: `AUD-${randomUUID()}`,
      actorId: input.actor.id,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      previousState: input.previousState,
      newState: input.newState,
      reason: input.reason,
      outcome: input.outcome,
    },
  });
}

export async function recordDeniedAuditAccess(actor: User) {
  return createAuditEvent({
    actor,
    action: "VIEW_AUDIT_TRAIL",
    resourceType: "AUDIT_TRAIL",
    resourceId: "COMPLETE",
    previousState: null,
    newState: null,
    reason: null,
    outcome: AuditOutcome.DENIED,
  });
}

export async function listAuditEvents() {
  return prisma.auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 250,
  });
}
