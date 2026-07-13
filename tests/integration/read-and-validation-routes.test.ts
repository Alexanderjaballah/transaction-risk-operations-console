import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  GET as listDemoUsers,
  POST as selectIdentity,
} from "@/app/api/demo-session/route";
import { GET as getMe } from "@/app/api/me/route";
import { GET as getTransaction } from "@/app/api/transactions/[transactionId]/route";
import { POST as decide } from "@/app/api/transactions/[transactionId]/decision/route";
import { GET as listTransactions } from "@/app/api/transactions/route";
import { prisma } from "@/server/db";
import { readErrorCode, requestWithIdentity } from "../helpers";

describe("read and validation routes", () => {
  it("returns the current database-backed user", async () => {
    const response = await getMe(
      requestWithIdentity("http://localhost/api/me", "USR-2026-0002"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "USR-2026-0002",
        name: "Olivia Operations",
        role: "OPERATIONS",
      },
    });
  });

  it("requires a selected identity for current-user and transaction reads", async () => {
    const meResponse = await getMe(new NextRequest("http://localhost/api/me"));
    const listResponse = await listTransactions(
      new NextRequest("http://localhost/api/transactions"),
    );
    const detailResponse = await getTransaction(
      new NextRequest(
        "http://localhost/api/transactions/TRX-2026-000041",
      ),
      {
        params: Promise.resolve({ transactionId: "TRX-2026-000041" }),
      },
    );

    expect(meResponse.status).toBe(401);
    expect(listResponse.status).toBe(401);
    expect(detailResponse.status).toBe(401);
  });

  it("lists seeded demo users without exposing email addresses", async () => {
    const response = await listDemoUsers();
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(serialized).toContain("Sam Support");
    expect(serialized).not.toContain("@example.test");
  });

  it("rejects invalid identity payloads and malformed JSON safely", async () => {
    const invalidPayload = await selectIdentity(
      new NextRequest("http://localhost/api/demo-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({ userId: "" }),
      }),
    );
    const malformedJson = await selectIdentity(
      new NextRequest("http://localhost/api/demo-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: "{",
      }),
    );

    expect(invalidPayload.status).toBe(400);
    expect(malformedJson.status).toBe(400);
  });

  it("returns safe errors for invalid query and unknown detail IDs", async () => {
    const invalidQuery = await listTransactions(
      requestWithIdentity(
        "http://localhost/api/transactions?status=NOT_A_STATUS",
        "USR-2026-0001",
      ),
    );
    const unknownDetail = await getTransaction(
      requestWithIdentity(
        "http://localhost/api/transactions/TRX-2026-999999",
        "USR-2026-0001",
      ),
      {
        params: Promise.resolve({ transactionId: "TRX-2026-999999" }),
      },
    );

    expect(invalidQuery.status).toBe(400);
    expect(unknownDetail.status).toBe(404);
    expect(JSON.stringify(await invalidQuery.json())).not.toContain("stack");
    expect(JSON.stringify(await unknownDetail.json())).not.toContain("stack");
  });

  it("requires identity before evaluating a decision", async () => {
    const response = await decide(
      new NextRequest(
        "http://localhost/api/transactions/TRX-2026-000041/decision",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://localhost",
          },
          body: JSON.stringify({
            action: "APPROVE",
            reason: "No identity supplied.",
          }),
        },
      ),
      {
        params: Promise.resolve({ transactionId: "TRX-2026-000041" }),
      },
    );

    expect(response.status).toBe(401);
    expect(await readErrorCode(response)).toMatchObject({
      code: "DEMO_IDENTITY_REQUIRED",
    });
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it("audits an invalid action against the actual persisted state", async () => {
    const response = await decide(
      requestWithIdentity(
        "http://localhost/api/transactions/TRX-2026-000041/decision",
        "USR-2026-0002",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "OVERRIDE",
            reason: "Invalid action.",
          }),
        },
      ),
      {
        params: Promise.resolve({ transactionId: "TRX-2026-000041" }),
      },
    );

    expect(response.status).toBe(400);
    expect(await readErrorCode(response)).toMatchObject({
      code: "DECISION_INVALID_PAYLOAD",
    });
    await expect(
      prisma.auditEvent.findFirstOrThrow(),
    ).resolves.toMatchObject({
      action: "OVERRIDE",
      previousState: "FLAGGED",
      newState: "FLAGGED",
      reason: null,
      outcome: "DENIED",
    });
  });
});
