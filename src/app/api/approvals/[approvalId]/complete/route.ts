import { NextResponse, type NextRequest } from "next/server";
import {
  completeApproval,
  recordForbiddenApprovalCompletion,
} from "@/server/approvals/approval-service";
import { canCompleteApproval } from "@/server/authorization/policies";
import { errorResponse, internalErrorResponse } from "@/server/http/responses";
import { loadCurrentUser } from "@/server/identity/current-user";

interface RouteContext {
  params: Promise<{
    approvalId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await loadCurrentUser(request);

    if (!user) {
      return errorResponse(
        401,
        "DEMO_IDENTITY_REQUIRED",
        "Select a demo identity to continue.",
      );
    }

    const { approvalId } = await context.params;

    if (!canCompleteApproval(user.role)) {
      const forbidden = await recordForbiddenApprovalCompletion(
        user,
        approvalId,
      );
      return errorResponse(
        forbidden.status,
        forbidden.code,
        forbidden.message,
      );
    }

    let rawPayload: unknown;

    try {
      rawPayload = await request.json();
    } catch {
      rawPayload = null;
    }

    const result = await completeApproval(user, approvalId, rawPayload);

    if (!result.ok) {
      return errorResponse(result.status, result.code, result.message);
    }

    return NextResponse.json({
      approvalRequest: {
        id: result.approvalRequest.id,
        status: result.approvalRequest.status,
        activeTransactionId: result.approvalRequest.activeTransactionId,
        reviewedById: result.approvalRequest.reviewedById,
        reviewedByName: result.approvalRequest.reviewedByName,
        reviewedByRole: result.approvalRequest.reviewedByRole,
        reviewReason: result.approvalRequest.reviewReason,
        reviewedAt: result.approvalRequest.reviewedAt?.toISOString() ?? null,
      },
      transaction: {
        id: result.transaction.id,
        status: result.transaction.status,
        updatedAt: result.transaction.updatedAt.toISOString(),
      },
    });
  } catch {
    return internalErrorResponse();
  }
}
