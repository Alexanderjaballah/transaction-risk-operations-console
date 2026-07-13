import {
  ApprovalStatus,
  AuditOutcome,
  TransactionStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { POST as completeApproval } from "@/app/api/approvals/[approvalId]/complete/route";
import { POST as decide } from "@/app/api/transactions/[transactionId]/decision/route";
import { prisma } from "@/server/db";
import { readErrorCode, requestWithIdentity } from "../helpers";

const operationsId = "USR-2026-0002";
const approverId = "USR-2026-0003";
const directDecisionId = "TRX-2026-000041";
const highValueId = "TRX-2026-000042";

function decisionContext(transactionId: string) {
  return { params: Promise.resolve({ transactionId }) };
}

function completionContext(approvalId: string) {
  return { params: Promise.resolve({ approvalId }) };
}

function decisionRequest(transactionId: string, reason: string) {
  return requestWithIdentity(
    `http://localhost/api/transactions/${transactionId}/decision`,
    operationsId,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE", reason }),
    },
  );
}

async function createPendingApproval() {
  const response = await decide(
    decisionRequest(highValueId, "Visible maker reason."),
    decisionContext(highValueId),
  );
  const body: { approvalRequest: { id: string } } = await response.json();

  return body.approvalRequest.id;
}

function completionRequest(approvalId: string, reason: string) {
  return requestWithIdentity(
    `http://localhost/api/approvals/${approvalId}/complete`,
    approverId,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE", reason }),
    },
  );
}

describe("reason validation at business routes", () => {
  it.each([
    ["zero-width maker reason", highValueId, "\u200B"],
    ["bidirectional-control reason", directDecisionId, "\u202E"],
    ["NUL reason", directDecisionId, "\u0000"],
    ["oversized reason", directDecisionId, "a".repeat(1001)],
  ])("rejects %s without applying state", async (_label, transactionId, reason) => {
    const response = await decide(
      decisionRequest(transactionId, reason),
      decisionContext(transactionId),
    );

    expect(response.status).toBe(422);
    expect(await readErrorCode(response)).toMatchObject({
      code: "DECISION_REASON_INVALID",
    });
    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } }),
    ).resolves.toMatchObject({ status: TransactionStatus.FLAGGED });
    await expect(prisma.approvalRequest.count()).resolves.toBe(0);
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { resourceId: transactionId },
      }),
    ).resolves.toMatchObject({
      reason: null,
      outcome: AuditOutcome.DENIED,
      previousState: TransactionStatus.FLAGGED,
      newState: TransactionStatus.FLAGGED,
    });
  });

  it("normalizes visible Unicode and preserves intentional multiline text", async () => {
    const response = await decide(
      decisionRequest(
        directDecisionId,
        "  Cafe\u0301 résumé\nSecond-line confirmation ✅  ",
      ),
      decisionContext(directDecisionId),
    );

    expect(response.status).toBe(200);
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { resourceId: directDecisionId },
      }),
    ).resolves.toMatchObject({
      reason: "Café résumé\nSecond-line confirmation ✅",
      outcome: AuditOutcome.SUCCESS,
      newState: TransactionStatus.APPROVED,
    });
  });

  it("accepts and stores HTML-like text without interpreting it", async () => {
    const reason = '<img src=x onerror="alert(1)"> reviewed as text';
    const response = await decide(
      decisionRequest(directDecisionId, reason),
      decisionContext(directDecisionId),
    );

    expect(response.status).toBe(200);
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { resourceId: directDecisionId },
      }),
    ).resolves.toMatchObject({ reason });
  });

  it.each([
    ["zero-width", "\u200B"],
    ["bidirectional control", "\u202E"],
    ["NUL", "\u0000"],
    ["oversized", "a".repeat(1001)],
  ])("rejects an invalid %s checker reason", async (_label, reason) => {
    const approvalId = await createPendingApproval();
    const response = await completeApproval(
      completionRequest(approvalId, reason),
      completionContext(approvalId),
    );

    expect(response.status).toBe(422);
    expect(await readErrorCode(response)).toMatchObject({
      code: "REVIEW_REASON_INVALID",
    });
    await expect(
      prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } }),
    ).resolves.toMatchObject({
      status: ApprovalStatus.PENDING,
      activeTransactionId: highValueId,
      reviewedById: null,
    });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: {
          resourceId: approvalId,
          outcome: AuditOutcome.DENIED,
        },
      }),
    ).resolves.toMatchObject({
      reason: null,
      previousState: TransactionStatus.FLAGGED,
      newState: TransactionStatus.FLAGGED,
    });
  });
});
