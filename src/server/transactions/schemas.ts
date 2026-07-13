import { RiskLevel, TransactionStatus } from "@prisma/client";
import { z } from "zod";

export const decisionActionSchema = z.enum([
  "APPROVE",
  "REJECT",
  "ESCALATE",
]);

export type DecisionAction = z.infer<typeof decisionActionSchema>;

export const decisionPayloadSchema = z.object({
  action: decisionActionSchema,
  reason: z.string().max(1000).optional().default(""),
});

export const transactionQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  status: z.nativeEnum(TransactionStatus).optional(),
  risk: z.nativeEnum(RiskLevel).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export function extractActionLabel(value: unknown): string {
  if (typeof value !== "object" || value === null || !("action" in value)) {
    return "DECISION_ATTEMPT";
  }

  const action = value.action;
  return typeof action === "string" && action.length <= 64
    ? action
    : "DECISION_ATTEMPT";
}
