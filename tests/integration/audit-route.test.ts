import { AuditOutcome } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/audit-events/route";
import { prisma } from "@/server/db";
import { readErrorCode, requestWithIdentity } from "../helpers";

describe("audit trail access", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a demo identity and records nothing", async () => {
    const before = await prisma.auditEvent.count();
    const response = await GET(
      new NextRequest("http://localhost/api/audit-events"),
    );

    expect(response.status).toBe(401);
    expect(await readErrorCode(response)).toMatchObject({
      code: "DEMO_IDENTITY_REQUIRED",
    });
    expect(await prisma.auditEvent.count()).toBe(before);
  });

  it("rejects an unknown demo identity", async () => {
    const response = await GET(
      requestWithIdentity(
        "http://localhost/api/audit-events",
        "USR-2026-9999",
      ),
    );

    expect(response.status).toBe(401);
    expect(await readErrorCode(response)).toMatchObject({
      code: "DEMO_IDENTITY_REQUIRED",
    });
  });

  it("denies Support and records a null-reason audit event", async () => {
    const response = await GET(
      requestWithIdentity(
        "http://localhost/api/audit-events",
        "USR-2026-0001",
      ),
    );

    expect(response.status).toBe(403);
    expect(await readErrorCode(response)).toMatchObject({
      code: "AUDIT_FORBIDDEN",
    });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        orderBy: { createdAt: "desc" },
      }),
    ).resolves.toMatchObject({
      actorRole: "SUPPORT",
      action: "VIEW_AUDIT_TRAIL",
      resourceType: "AUDIT_TRAIL",
      previousState: null,
      newState: null,
      reason: null,
      outcome: AuditOutcome.DENIED,
    });
  });

  it("allows Approver without creating an audit event", async () => {
    const before = await prisma.auditEvent.count();
    const response = await GET(
      requestWithIdentity(
        "http://localhost/api/audit-events",
        "USR-2026-0003",
      ),
    );

    expect(response.status).toBe(200);
    expect(await prisma.auditEvent.count()).toBe(before);
  });

  it("returns a generic 500 without leaking the error when the audit read fails", async () => {
    vi.spyOn(prisma.auditEvent, "findMany").mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const response = await GET(
      requestWithIdentity(
        "http://localhost/api/audit-events",
        "USR-2026-0003",
      ),
    );

    expect(response.status).toBe(500);
    expect(await readErrorCode(response)).toEqual({
      code: "INTERNAL_ERROR",
      message: "The request could not be completed.",
    });
  });
});
