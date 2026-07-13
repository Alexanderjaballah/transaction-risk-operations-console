import { TransactionStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as completeApproval } from "@/app/api/approvals/[approvalId]/complete/route";
import { POST as selectIdentity } from "@/app/api/demo-session/route";
import { POST as decide } from "@/app/api/transactions/[transactionId]/decision/route";
import { prisma } from "@/server/db";
import { readErrorCode, requestWithIdentity } from "../helpers";

const directDecisionId = "TRX-2026-000041";
const highValueId = "TRX-2026-000042";
const missingApprovalId = "APR-00000000-0000-4000-8000-000000000000";

function decisionContext(transactionId: string) {
  return { params: Promise.resolve({ transactionId }) };
}

function completionContext(approvalId: string) {
  return { params: Promise.resolve({ approvalId }) };
}

function identityRequest(
  headers: HeadersInit,
  body = JSON.stringify({ userId: "USR-2026-0002" }),
) {
  return new NextRequest("http://localhost/api/demo-session", {
    method: "POST",
    headers,
    body,
  });
}

describe("mutation request boundary", () => {
  it("accepts same-origin JSON with a charset", async () => {
    const response = await selectIdentity(
      identityRequest({
        "Content-Type": "application/json; charset=utf-8",
        Origin: "http://localhost",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "transaction_console_demo_user=USR-2026-0002",
    );
  });

  it("rejects missing, null, and mismatched origins without business effects", async () => {
    const missing = await selectIdentity(
      identityRequest({ "Content-Type": "application/json" }),
    );
    const nullOrigin = await decide(
      requestWithIdentity(
        `http://localhost/api/transactions/${directDecisionId}/decision`,
        "USR-2026-0002",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "null",
          },
          body: JSON.stringify({
            action: "APPROVE",
            reason: "Cross-origin attempt.",
          }),
        },
      ),
      decisionContext(directDecisionId),
    );
    const mismatched = await completeApproval(
      requestWithIdentity(
        `http://localhost/api/approvals/${missingApprovalId}/complete`,
        "USR-2026-0003",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://attacker.example.test",
          },
          body: JSON.stringify({
            action: "APPROVE",
            reason: "Cross-origin attempt.",
          }),
        },
      ),
      completionContext(missingApprovalId),
    );

    for (const response of [missing, nullOrigin, mismatched]) {
      expect(response.status).toBe(403);
      expect(await readErrorCode(response)).toMatchObject({
        code: "ORIGIN_FORBIDDEN",
      });
    }

    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: directDecisionId } }),
    ).resolves.toMatchObject({ status: TransactionStatus.FLAGGED });
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it.each([
    ["text", "text/plain"],
    ["form", "application/x-www-form-urlencoded"],
    ["missing", null],
    ["unsupported", "application/xml"],
  ])("rejects %s mutation media types", async (_label, contentType) => {
    const headers = new Headers({ Origin: "http://localhost" });

    if (contentType) {
      headers.set("Content-Type", contentType);
    }

    const response = await selectIdentity(identityRequest(headers));

    expect(response.status).toBe(415);
    expect(await readErrorCode(response)).toMatchObject({
      code: "CONTENT_TYPE_UNSUPPORTED",
    });
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it("rejects a declared body over 16 KiB before reading it", async () => {
    const response = await selectIdentity(
      identityRequest(
        {
          "Content-Length": String(16 * 1024 + 1),
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        "{}",
      ),
    );

    expect(response.status).toBe(413);
    expect(await readErrorCode(response)).toMatchObject({
      code: "REQUEST_BODY_TOO_LARGE",
    });
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it("counts streamed bytes and rejects a chunked body over 16 KiB", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("a".repeat(9000)));
        controller.enqueue(encoder.encode("b".repeat(9000)));
        controller.close();
      },
    });
    const requestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body,
      duplex: "half" as const,
    };
    const request = new NextRequest(
      "http://localhost/api/demo-session",
      requestInit,
    );

    const response = await selectIdentity(request);

    expect(response.status).toBe(413);
    expect(await readErrorCode(response)).toMatchObject({
      code: "REQUEST_BODY_TOO_LARGE",
    });
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it("returns safe malformed-JSON errors without mutation or audit events", async () => {
    const response = await decide(
      requestWithIdentity(
        `http://localhost/api/transactions/${directDecisionId}/decision`,
        "USR-2026-0002",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        },
      ),
      decisionContext(directDecisionId),
    );

    expect(response.status).toBe(400);
    expect(await readErrorCode(response)).toMatchObject({
      code: "MALFORMED_JSON",
    });
    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: directDecisionId } }),
    ).resolves.toMatchObject({ status: TransactionStatus.FLAGGED });
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });
});

describe("identifier and audit label validation", () => {
  it("rejects an invalid transaction ID before lookup or business audit", async () => {
    const invalidId = "TRX-2026-\u202E000041";
    const response = await decide(
      requestWithIdentity(
        `http://localhost/api/transactions/${encodeURIComponent(invalidId)}/decision`,
        "USR-2026-0002",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "APPROVE",
            reason: "Invalid identifier attempt.",
          }),
        },
      ),
      decisionContext(invalidId),
    );

    expect(response.status).toBe(400);
    expect(await readErrorCode(response)).toMatchObject({
      code: "TRANSACTION_ID_INVALID",
    });
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it("rejects an invalid approval ID before lookup or business audit", async () => {
    const invalidId = "APR-\u202E";
    const response = await completeApproval(
      requestWithIdentity(
        `http://localhost/api/approvals/${encodeURIComponent(invalidId)}/complete`,
        "USR-2026-0003",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "APPROVE",
            reason: "Invalid identifier attempt.",
          }),
        },
      ),
      completionContext(invalidId),
    );

    expect(response.status).toBe(400);
    expect(await readErrorCode(response)).toMatchObject({
      code: "APPROVAL_ID_INVALID",
    });
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it("uses a server fallback for unsafe invalid action labels", async () => {
    const response = await decide(
      requestWithIdentity(
        `http://localhost/api/transactions/${directDecisionId}/decision`,
        "USR-2026-0002",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "\u202EOVERRIDE",
            reason: "Invalid action attempt.",
          }),
        },
      ),
      decisionContext(directDecisionId),
    );

    expect(response.status).toBe(400);
    expect(await readErrorCode(response)).toMatchObject({
      code: "DECISION_INVALID_PAYLOAD",
    });
    await expect(
      prisma.auditEvent.findFirstOrThrow(),
    ).resolves.toMatchObject({
      action: "DECISION_ATTEMPT",
      resourceId: directDecisionId,
      outcome: "DENIED",
    });
  });

  it("uses a server fallback for unsafe approval action labels", async () => {
    const pendingResponse = await decide(
      requestWithIdentity(
        `http://localhost/api/transactions/${highValueId}/decision`,
        "USR-2026-0002",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REJECT",
            reason: "Create a valid pending request.",
          }),
        },
      ),
      decisionContext(highValueId),
    );
    const pendingBody: { approvalRequest: { id: string } } =
      await pendingResponse.json();
    const approvalId = pendingBody.approvalRequest.id;
    const response = await completeApproval(
      requestWithIdentity(
        `http://localhost/api/approvals/${approvalId}/complete`,
        "USR-2026-0003",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "\u202EAPPROVE",
            reason: "Invalid completion action.",
          }),
        },
      ),
      completionContext(approvalId),
    );

    expect(response.status).toBe(400);
    expect(await readErrorCode(response)).toMatchObject({
      code: "APPROVAL_INVALID_PAYLOAD",
    });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { resourceId: approvalId, outcome: "DENIED" },
      }),
    ).resolves.toMatchObject({
      action: "APPROVAL_COMPLETION_ATTEMPT",
    });
  });

  it("does not disclose approval existence to an unauthorized caller", async () => {
    const pendingResponse = await decide(
      requestWithIdentity(
        `http://localhost/api/transactions/${highValueId}/decision`,
        "USR-2026-0002",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REJECT",
            reason: "Create a valid pending request.",
          }),
        },
      ),
      decisionContext(highValueId),
    );
    const pendingBody: { approvalRequest: { id: string } } =
      await pendingResponse.json();
    const requestBody = JSON.stringify({
      action: "APPROVE",
      reason: "Unauthorized completion.",
    });
    const existing = await completeApproval(
      requestWithIdentity(
        `http://localhost/api/approvals/${pendingBody.approvalRequest.id}/complete`,
        "USR-2026-0002",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        },
      ),
      completionContext(pendingBody.approvalRequest.id),
    );
    const nonexistent = await completeApproval(
      requestWithIdentity(
        `http://localhost/api/approvals/${missingApprovalId}/complete`,
        "USR-2026-0002",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        },
      ),
      completionContext(missingApprovalId),
    );

    expect(existing.status).toBe(403);
    expect(nonexistent.status).toBe(403);
    expect(await existing.json()).toEqual(await nonexistent.json());
  });
});
