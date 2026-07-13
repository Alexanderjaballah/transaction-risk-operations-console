import { AuditOutcome } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/audit-events/route";
import { prisma } from "@/server/db";
import { readErrorCode, requestWithIdentity } from "../helpers";

describe("audit trail access", () => {
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
});
