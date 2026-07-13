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
  reason: z.string().optional().default(""),
});

export const approvalCompletionSchema = z.object({
  action: z.enum(["APPROVE", "VETO"]),
  reason: z.string().optional().default(""),
});

export type ApprovalCompletionAction = z.infer<
  typeof approvalCompletionSchema
>["action"];

export const transactionQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  status: z.nativeEnum(TransactionStatus).optional(),
  risk: z.nativeEnum(RiskLevel).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export const transactionIdSchema = z
  .string()
  .regex(/^TRX-2026-\d{6}$/);

export const approvalIdSchema = z
  .string()
  .regex(
    /^APR-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );

export function extractActionLabel(
  value: unknown,
  fallback = "DECISION_ATTEMPT",
): string {
  if (typeof value !== "object" || value === null || !("action" in value)) {
    return fallback;
  }

  const action = value.action;
  return typeof action === "string" &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(action)
    ? action
    : fallback;
}
