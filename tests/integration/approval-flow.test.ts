import {
  ApprovalAction,
  ApprovalStatus,
  AuditOutcome,
  Role,
  TransactionStatus,
} from "@prisma/client";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET as getApprovals } from "@/app/api/approvals/route";
import { POST as completeApproval } from "@/app/api/approvals/[approvalId]/complete/route";
import { POST as decide } from "@/app/api/transactions/[transactionId]/decision/route";
import { prisma } from "@/server/db";
import { readErrorCode, requestWithIdentity } from "../helpers";

const supportId = "USR-2026-0001";
const operationsId = "USR-2026-0002";
const approverId = "USR-2026-0003";
const directDecisionId = "TRX-2026-000041";
const highValueId = "TRX-2026-000042";

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

function decisionContext(transactionId: string) {
  return { params: Promise.resolve({ transactionId }) };
}

function completionRequest(
  userId: string,
  approvalId: string,
  payload: unknown,
) {
  return requestWithIdentity(
    `http://localhost/api/approvals/${approvalId}/complete`,
    userId,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

function completionContext(approvalId: string) {
  return { params: Promise.resolve({ approvalId }) };
}

async function createPendingRequest(
  action: "APPROVE" | "REJECT" = "REJECT",
) {
  const response = await decide(
    decisionRequest(operationsId, highValueId, {
      action,
      reason: `Operations requests ${action.toLowerCase()} review.`,
    }),
    decisionContext(highValueId),
  );
  expect(response.status).toBe(200);
  const body: {
    kind: string;
    approvalRequest: { id: string };
  } = await response.json();
  expect(body.kind).toBe("PENDING_APPROVAL");
  return body.approvalRequest.id;
}

describe("maker-checker approval controls", () => {
  it("requires a server-managed identity for approval reads and completion", async () => {
    const listResponse = await getApprovals(
      new NextRequest("http://localhost/api/approvals"),
    );
    expect(listResponse.status).toBe(401);
    expect(await readErrorCode(listResponse)).toMatchObject({
      code: "DEMO_IDENTITY_REQUIRED",
    });

    const completionResponse = await completeApproval(
      new NextRequest("http://localhost/api/approvals/unknown/complete", {
        method: "POST",
        body: JSON.stringify({
          action: "APPROVE",
          reason: "No identity.",
        }),
      }),
      completionContext("unknown"),
    );
    expect(completionResponse.status).toBe(401);
  });

  it.each([
    ["APPROVE", ApprovalAction.APPROVE, TransactionStatus.APPROVED],
    ["REJECT", ApprovalAction.REJECT, TransactionStatus.REJECTED],
  ] as const)(
    "creates a typed PENDING request for high-value %s without changing the transaction",
    async (action, requestedAction, requestedTargetState) => {
      const response = await decide(
        decisionRequest(operationsId, highValueId, {
          action,
          reason: "High-value decision needs checker review.",
          requestedAction: "ESCALATE",
          requestedTargetState: "ESCALATED",
          requestedById: supportId,
          requestedByRole: "APPROVER",
          status: "APPROVED",
        }),
        decisionContext(highValueId),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        kind: "PENDING_APPROVAL",
        transaction: {
          id: highValueId,
          status: TransactionStatus.FLAGGED,
        },
        approvalRequest: {
          status: ApprovalStatus.PENDING,
          requestedAction,
          requestedTargetState,
        },
      });

      await expect(
        prisma.transaction.findUniqueOrThrow({ where: { id: highValueId } }),
      ).resolves.toMatchObject({ status: TransactionStatus.FLAGGED });
      await expect(
        prisma.approvalRequest.findFirstOrThrow({
          where: { transactionId: highValueId },
        }),
      ).resolves.toMatchObject({
        requestedAction,
        requestedTargetState,
        requestedById: operationsId,
        requestedByName: "Olivia Operations",
        requestedByRole: Role.OPERATIONS,
        requestReason: "High-value decision needs checker review.",
        status: ApprovalStatus.PENDING,
        activeTransactionId: highValueId,
      });
      await expect(
        prisma.auditEvent.findFirstOrThrow({
          where: {
            resourceType: "APPROVAL_REQUEST",
            outcome: AuditOutcome.PENDING,
          },
        }),
      ).resolves.toMatchObject({
        actorId: operationsId,
        action,
        previousState: TransactionStatus.FLAGGED,
        newState: TransactionStatus.FLAGGED,
      });
    },
  );

  it("rejects approval actions outside APPROVE and REJECT", async () => {
    const response = await decide(
      decisionRequest(operationsId, highValueId, {
        action: "VETO",
        reason: "Not a transaction decision.",
      }),
      decisionContext(highValueId),
    );

    expect(response.status).toBe(400);
    expect(await readErrorCode(response)).toMatchObject({
      code: "DECISION_INVALID_PAYLOAD",
    });
    await expect(prisma.approvalRequest.count()).resolves.toBe(0);
  });

  it("keeps Session 1 direct-decision request and response compatible", async () => {
    const response = await decide(
      decisionRequest(operationsId, directDecisionId, {
        action: "APPROVE",
        reason: "Verified direct decision.",
      }),
      decisionContext(directDecisionId),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: "DECIDED",
      transaction: {
        id: directDecisionId,
        status: TransactionStatus.APPROVED,
      },
    });
  });

  it("keeps ESCALATE direct above the threshold when no request is pending", async () => {
    const response = await decide(
      decisionRequest(operationsId, highValueId, {
        action: "ESCALATE",
        reason: "Send directly to investigation.",
      }),
      decisionContext(highValueId),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: "DECIDED",
      transaction: { status: TransactionStatus.ESCALATED },
    });
    await expect(prisma.approvalRequest.count()).resolves.toBe(0);
  });

  it("blocks APPROVE, REJECT, and ESCALATE while a request is pending", async () => {
    await createPendingRequest();

    for (const action of ["APPROVE", "REJECT"] as const) {
      const duplicate = await decide(
        decisionRequest(operationsId, highValueId, {
          action,
          reason: `Second active ${action.toLowerCase()} request.`,
        }),
        decisionContext(highValueId),
      );
      expect(duplicate.status).toBe(409);
      expect(await readErrorCode(duplicate)).toMatchObject({
        code: "APPROVAL_ALREADY_PENDING",
      });
    }

    const escalate = await decide(
      decisionRequest(operationsId, highValueId, {
        action: "ESCALATE",
        reason: "Attempt to bypass checker.",
      }),
      decisionContext(highValueId),
    );
    expect(escalate.status).toBe(409);
    expect(await readErrorCode(escalate)).toMatchObject({
      code: "TRANSACTION_STATE_CONFLICT",
    });
    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: highValueId } }),
    ).resolves.toMatchObject({ status: TransactionStatus.FLAGGED });
    await expect(prisma.approvalRequest.count()).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({
        where: { outcome: AuditOutcome.DENIED },
      }),
    ).resolves.toBe(3);
  });

  it("denies Support creating or viewing approval requests", async () => {
    const createResponse = await decide(
      decisionRequest(supportId, highValueId, {
        action: "REJECT",
        reason: "Unauthorized request.",
      }),
      decisionContext(highValueId),
    );
    expect(createResponse.status).toBe(403);
    expect(await readErrorCode(createResponse)).toMatchObject({
      code: "DECISION_FORBIDDEN",
    });

    const listResponse = await getApprovals(
      requestWithIdentity("http://localhost/api/approvals", supportId),
    );
    expect(listResponse.status).toBe(403);
    expect(await readErrorCode(listResponse)).toMatchObject({
      code: "APPROVAL_FORBIDDEN",
    });
  });

  it.each(["APPROVE", "VETO"] as const)(
    "denies Operations attempting to %s a pending request",
    async (action) => {
      const approvalId = await createPendingRequest();
      const response = await completeApproval(
        completionRequest(operationsId, approvalId, {
          action,
          reason: "Operations cannot check its own work.",
        }),
        completionContext(approvalId),
      );

      expect(response.status).toBe(403);
      expect(await readErrorCode(response)).toMatchObject({
        code: "APPROVAL_FORBIDDEN",
      });
      await expect(
        prisma.approvalRequest.findUniqueOrThrow({
          where: { id: approvalId },
        }),
      ).resolves.toMatchObject({
        status: ApprovalStatus.PENDING,
        activeTransactionId: highValueId,
      });
    },
  );

  it.each(["APPROVE", "VETO"] as const)(
    "blocks self-%s after the requester's persisted role changes",
    async (action) => {
      const approvalId = await createPendingRequest();
      await prisma.user.update({
        where: { id: operationsId },
        data: { role: Role.APPROVER },
      });

      const response = await completeApproval(
        completionRequest(operationsId, approvalId, {
          action,
          reason: "Attempt after role change.",
          reviewedById: approverId,
          reviewedByRole: "APPROVER",
          status: "APPROVED",
        }),
        completionContext(approvalId),
      );

      expect(response.status).toBe(403);
      expect(await readErrorCode(response)).toMatchObject({
        code: "SELF_APPROVAL_FORBIDDEN",
      });
      await expect(
        prisma.approvalRequest.findUniqueOrThrow({
          where: { id: approvalId },
        }),
      ).resolves.toMatchObject({
        status: ApprovalStatus.PENDING,
        activeTransactionId: highValueId,
        reviewedById: null,
      });
      await expect(
        prisma.transaction.findUniqueOrThrow({ where: { id: highValueId } }),
      ).resolves.toMatchObject({ status: TransactionStatus.FLAGGED });
      await expect(
        prisma.auditEvent.findFirstOrThrow({
          where: {
            actorId: operationsId,
            resourceId: approvalId,
            outcome: AuditOutcome.DENIED,
          },
          orderBy: { createdAt: "desc" },
        }),
      ).resolves.toMatchObject({
        action,
        previousState: TransactionStatus.FLAGGED,
        newState: TransactionStatus.FLAGGED,
        reason: "Attempt after role change.",
      });
    },
  );

  it("requires a non-empty review reason", async () => {
    const approvalId = await createPendingRequest();
    const response = await completeApproval(
      completionRequest(approverId, approvalId, {
        action: "APPROVE",
        reason: " \n ",
      }),
      completionContext(approvalId),
    );

    expect(response.status).toBe(422);
    expect(await readErrorCode(response)).toMatchObject({
      code: "REVIEW_REASON_REQUIRED",
    });
    await expect(
      prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } }),
    ).resolves.toMatchObject({ status: ApprovalStatus.PENDING });
  });

  it("returns a safe not-found response and null-state denied audit", async () => {
    const approvalId = "APR-UNKNOWN";
    const response = await completeApproval(
      completionRequest(approverId, approvalId, {
        action: "APPROVE",
        reason: "Review unknown request.",
      }),
      completionContext(approvalId),
    );

    expect(response.status).toBe(404);
    expect(await readErrorCode(response)).toMatchObject({
      code: "APPROVAL_NOT_FOUND",
    });
    await expect(
      prisma.auditEvent.findFirstOrThrow({ where: { resourceId: approvalId } }),
    ).resolves.toMatchObject({
      previousState: null,
      newState: null,
      outcome: AuditOutcome.DENIED,
    });
  });

  it("rejects an invalid completion payload", async () => {
    const approvalId = await createPendingRequest();
    const response = await completeApproval(
      completionRequest(approverId, approvalId, {
        action: "REJECT",
        reason: "Not a checker action.",
      }),
      completionContext(approvalId),
    );

    expect(response.status).toBe(400);
    expect(await readErrorCode(response)).toMatchObject({
      code: "APPROVAL_INVALID_PAYLOAD",
    });
    await expect(
      prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } }),
    ).resolves.toMatchObject({ status: ApprovalStatus.PENDING });
  });

  it("rolls back completion when the transaction state has changed", async () => {
    const approvalId = await createPendingRequest();
    await prisma.transaction.update({
      where: { id: highValueId },
      data: { status: TransactionStatus.ESCALATED },
    });

    const response = await completeApproval(
      completionRequest(approverId, approvalId, {
        action: "APPROVE",
        reason: "Attempt against stale transaction state.",
      }),
      completionContext(approvalId),
    );

    expect(response.status).toBe(409);
    expect(await readErrorCode(response)).toMatchObject({
      code: "TRANSACTION_STATE_CONFLICT",
    });
    await expect(
      prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } }),
    ).resolves.toMatchObject({
      status: ApprovalStatus.PENDING,
      activeTransactionId: highValueId,
    });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { resourceId: approvalId, outcome: AuditOutcome.DENIED },
      }),
    ).resolves.toMatchObject({
      previousState: TransactionStatus.ESCALATED,
      newState: TransactionStatus.ESCALATED,
    });
  });

  it("allows Aaron Approver to approve and atomically clears active ownership", async () => {
    const approvalId = await createPendingRequest("REJECT");
    const response = await completeApproval(
      completionRequest(approverId, approvalId, {
        action: "APPROVE",
        reason: "Checker confirms the rejection evidence.",
        reviewedById: supportId,
        reviewedByRole: "SUPPORT",
        status: "VETOED",
        requestedTargetState: "APPROVED",
      }),
      completionContext(approvalId),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      approvalRequest: {
        id: approvalId,
        status: ApprovalStatus.APPROVED,
        activeTransactionId: null,
        reviewedById: approverId,
        reviewedByName: "Aaron Approver",
        reviewedByRole: Role.APPROVER,
      },
      transaction: {
        id: highValueId,
        status: TransactionStatus.REJECTED,
      },
    });
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { resourceId: approvalId, outcome: AuditOutcome.SUCCESS },
      }),
    ).resolves.toMatchObject({
      action: "APPROVE_REJECT_REQUEST",
      previousState: TransactionStatus.FLAGGED,
      newState: TransactionStatus.REJECTED,
      reason: "Checker confirms the rejection evidence.",
    });
    await expect(
      prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } }),
    ).resolves.toMatchObject({
      status: ApprovalStatus.APPROVED,
      activeTransactionId: null,
    });
  });

  it("allows veto, clears active ownership, and permits a new request", async () => {
    const approvalId = await createPendingRequest("APPROVE");
    const veto = await completeApproval(
      completionRequest(approverId, approvalId, {
        action: "VETO",
        reason: "Evidence is insufficient.",
      }),
      completionContext(approvalId),
    );
    expect(veto.status).toBe(200);
    await expect(veto.json()).resolves.toMatchObject({
      approvalRequest: {
        status: ApprovalStatus.VETOED,
        activeTransactionId: null,
      },
      transaction: { status: TransactionStatus.FLAGGED },
    });
    await expect(
      prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } }),
    ).resolves.toMatchObject({
      status: ApprovalStatus.VETOED,
      activeTransactionId: null,
    });

    const replacement = await decide(
      decisionRequest(operationsId, highValueId, {
        action: "REJECT",
        reason: "Additional evidence supports rejection.",
      }),
      decisionContext(highValueId),
    );
    expect(replacement.status).toBe(200);
    await expect(replacement.json()).resolves.toMatchObject({
      kind: "PENDING_APPROVAL",
    });
    await expect(
      prisma.approvalRequest.count({
        where: { transactionId: highValueId },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.auditEvent.findFirstOrThrow({
        where: { resourceId: approvalId, outcome: AuditOutcome.SUCCESS },
      }),
    ).resolves.toMatchObject({
      action: "VETO_APPROVE_REQUEST",
      previousState: TransactionStatus.FLAGGED,
      newState: TransactionStatus.FLAGGED,
    });
  });

  it.each(["APPROVED", "VETOED"] as const)(
    "does not reprocess an %s request",
    async (completedStatus) => {
      const approvalId = await createPendingRequest();
      const first = await completeApproval(
        completionRequest(approverId, approvalId, {
          action: completedStatus === "APPROVED" ? "APPROVE" : "VETO",
          reason: "Initial checker decision.",
        }),
        completionContext(approvalId),
      );
      expect(first.status).toBe(200);

      const repeated = await completeApproval(
        completionRequest(approverId, approvalId, {
          action: "APPROVE",
          reason: "Repeated checker decision.",
        }),
        completionContext(approvalId),
      );
      expect(repeated.status).toBe(409);
      expect(await readErrorCode(repeated)).toMatchObject({
        code: "APPROVAL_ALREADY_COMPLETED",
      });
    },
  );

  it("returns only pending approvals to Approver and denies Operations", async () => {
    const requestId = await createPendingRequest();
    const approverResponse = await getApprovals(
      requestWithIdentity("http://localhost/api/approvals", approverId),
    );
    expect(approverResponse.status).toBe(200);
    await expect(approverResponse.json()).resolves.toMatchObject({
      approvalRequests: [
        {
          id: requestId,
          status: ApprovalStatus.PENDING,
          transaction: {
            id: highValueId,
            customer: {
              maskedAccountReference: expect.stringMatching(/^•••• \d{4}$/),
            },
          },
        },
      ],
    });

    const operationsResponse = await getApprovals(
      requestWithIdentity("http://localhost/api/approvals", operationsId),
    );
    expect(operationsResponse.status).toBe(403);
  });

  it("produces exactly one success for two concurrent completion attempts", async () => {
    const approvalId = await createPendingRequest();
    const responses = await Promise.all([
      completeApproval(
        completionRequest(approverId, approvalId, {
          action: "APPROVE",
          reason: "Concurrent checker attempt A.",
        }),
        completionContext(approvalId),
      ),
      completeApproval(
        completionRequest(approverId, approvalId, {
          action: "APPROVE",
          reason: "Concurrent checker attempt B.",
        }),
        completionContext(approvalId),
      ),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const conflict = responses.find((response) => response.status === 409);
    expect(conflict).toBeDefined();
    expect(await readErrorCode(conflict!)).toMatchObject({
      code: "APPROVAL_ALREADY_COMPLETED",
    });
    await expect(
      prisma.auditEvent.count({
        where: { resourceId: approvalId, outcome: AuditOutcome.SUCCESS },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({
        where: { resourceId: approvalId, outcome: AuditOutcome.DENIED },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.transaction.findUniqueOrThrow({ where: { id: highValueId } }),
    ).resolves.toMatchObject({ status: TransactionStatus.REJECTED });
  });
});
