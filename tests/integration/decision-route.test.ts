import { AuditOutcome, TransactionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/transactions/[transactionId]/decision/route";
import { prisma } from "@/server/db";
import { readErrorCode, requestWithIdentity } from "../helpers";

const supportId = "USR-2026-0001";
const operationsId = "USR-2026-0002";
const directDecisionId = "TRX-2026-000041";
const terminalId = "TRX-2026-000043";

function decisionRequest(
  userId: string,
  transactionId: string,
  payload: unknown,
) {
  return requestWithIdentity(
    `http://localhost/api/transactions/${transactionId}/decision`,
    userId,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

function context(transactionId: string) {
  return { params: Promise.resolve({ transactionId }) };
}

describe("decision API controls", () => {
  it.each(["APPROVE", "REJECT", "ESCALATE"])(
    "denies Support attempting %s on the server",
    async (action) => {
      const response = await POST(
        decisionRequest(supportId, directDecisionId, {
          action,
          reason: "Attempted support decision",
        }),
        context(directDecisionId),
      );

      expect(response.status).toBe(403);
      expect(await readErrorCode(response)).toMatchObject({
        code: "DECISION_FORBIDDEN",
      });
      await expect(
        prisma.transaction.findUniqueOrThrow({ where: { id: directDecisionId } }),
      ).resolves.toMatchObject({ status: TransactionStatus.FLAGGED });
      await expect(
        prisma.auditEvent.findFirstOrThrow({
          where: { resourceId: directDecisionId },
          orderBy: { createdAt: "desc" },
        }),
      ).resolves.toMatchObject({
        action: "DECISION_ATTEMPT",
        outcome: AuditOutcome.DENIED,
        previousState: null,
        newState: null,
        reason: null,
      });
    },
  );

  it("ignores a client-supplied role", async () => {
    const response = await POST(
      decisionRequest(supportId, directDecisionId, {
        action: "APPROVE",
        reason: "Browser claims Operations privileges",
        role: "OPERATIONS",
      }),
      context(directDecisionId),
    );

    expect(response.status).toBe(403);
    expect(await readErrorCode(response)).toMatchObject({
      code: "DECISION_FORBIDDEN",
    });
    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: directDecisionId } }),
    ).resolves.toMatchObject({ status: TransactionStatus.FLAGGED });
  });

  it.each([
    ["missing", { action: "APPROVE" }],
    ["empty", { action: "APPROVE", reason: "" }],
    ["whitespace", { action: "APPROVE", reason: "   \n  " }],
  ])("rejects a %s reason and audits null reason", async (_label, payload) => {
    const response = await POST(
      decisionRequest(operationsId, directDecisionId, payload),
      context(directDecisionId),
    );

    expect(response.status).toBe(422);
    expect(await readErrorCode(response)).toMatchObject({
      code: "DECISION_REASON_REQUIRED",
    });
    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: directDecisionId } }),
    ).resolves.toMatchObject({ status: TransactionStatus.FLAGGED });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { resourceId: directDecisionId },
        orderBy: { createdAt: "desc" },
      }),
    ).resolves.toMatchObject({
      action: "APPROVE",
      previousState: TransactionStatus.FLAGGED,
      newState: TransactionStatus.FLAGGED,
      reason: null,
      outcome: AuditOutcome.DENIED,
    });
  });

  it("updates a valid Operations decision and creates the exact audit event", async () => {
    const response = await POST(
      decisionRequest(operationsId, directDecisionId, {
        action: "APPROVE",
        reason: "Customer confirmed the purchase and device.",
      }),
      context(directDecisionId),
    );

    expect(response.status).toBe(200);
    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: directDecisionId } }),
    ).resolves.toMatchObject({ status: TransactionStatus.APPROVED });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { resourceId: directDecisionId },
        orderBy: { createdAt: "desc" },
      }),
    ).resolves.toMatchObject({
      actorId: operationsId,
      actorName: "Olivia Operations",
      actorRole: "OPERATIONS",
      action: "APPROVE",
      resourceType: "TRANSACTION",
      previousState: TransactionStatus.FLAGGED,
      newState: TransactionStatus.APPROVED,
      reason: "Customer confirmed the purchase and device.",
      outcome: AuditOutcome.SUCCESS,
    });
  });

  it("rejects a repeated decision with the actual persisted state", async () => {
    const first = await POST(
      decisionRequest(operationsId, directDecisionId, {
        action: "APPROVE",
        reason: "Initial verified approval.",
      }),
      context(directDecisionId),
    );
    expect(first.status).toBe(200);

    const repeated = await POST(
      decisionRequest(operationsId, directDecisionId, {
        action: "APPROVE",
        reason: "Repeated approval attempt.",
      }),
      context(directDecisionId),
    );

    expect(repeated.status).toBe(409);
    expect(await readErrorCode(repeated)).toMatchObject({
      code: "DECISION_INVALID_TRANSITION",
    });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: {
          resourceId: directDecisionId,
          outcome: AuditOutcome.DENIED,
        },
        orderBy: { createdAt: "desc" },
      }),
    ).resolves.toMatchObject({
      action: "APPROVE",
      previousState: TransactionStatus.APPROVED,
      newState: TransactionStatus.APPROVED,
      reason: "Repeated approval attempt.",
    });
  });

  it.each(["APPROVE", "REJECT", "ESCALATE"])(
    "rejects %s against a terminal transaction",
    async (action) => {
      const response = await POST(
        decisionRequest(operationsId, terminalId, {
          action,
          reason: "Attempted terminal-state change.",
        }),
        context(terminalId),
      );

      expect(response.status).toBe(409);
      await expect(
        prisma.transaction.findUniqueOrThrow({ where: { id: terminalId } }),
      ).resolves.toMatchObject({ status: TransactionStatus.APPROVED });
      await expect(
        prisma.auditEvent.findFirstOrThrow({
          where: { resourceId: terminalId },
          orderBy: { createdAt: "desc" },
        }),
      ).resolves.toMatchObject({
        action,
        previousState: TransactionStatus.APPROVED,
        newState: TransactionStatus.APPROVED,
        outcome: AuditOutcome.DENIED,
      });
    },
  );

  it("returns a safe 404 and null-state audit for an authorized unknown ID", async () => {
    const unknownId = "TRX-2026-999999";
    const response = await POST(
      decisionRequest(operationsId, unknownId, {
        action: "ESCALATE",
        reason: "Investigate this transaction.",
      }),
      context(unknownId),
    );

    expect(response.status).toBe(404);
    expect(await readErrorCode(response)).toMatchObject({
      code: "TRANSACTION_NOT_FOUND",
    });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { resourceId: unknownId },
      }),
    ).resolves.toMatchObject({
      action: "ESCALATE",
      previousState: null,
      newState: null,
      reason: null,
      outcome: AuditOutcome.DENIED,
    });
  });

  it("returns the same forbidden response without revealing transaction existence", async () => {
    const requestBody = {
      action: "APPROVE",
      reason: "Unauthorized attempt.",
    };
    const existingResponse = await POST(
      decisionRequest(supportId, directDecisionId, requestBody),
      context(directDecisionId),
    );
    const unknownResponse = await POST(
      decisionRequest(supportId, "TRX-2026-999999", requestBody),
      context("TRX-2026-999999"),
    );

    expect(existingResponse.status).toBe(403);
    expect(unknownResponse.status).toBe(403);
    expect(await readErrorCode(existingResponse)).toEqual(
      await readErrorCode(unknownResponse),
    );
  });
});
