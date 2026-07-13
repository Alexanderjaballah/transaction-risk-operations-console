import { NextResponse, type NextRequest } from "next/server";
import {
  listPendingApprovals,
  recordForbiddenApprovalView,
  serializeApprovalRequest,
} from "@/server/approvals/approval-service";
import { canViewPendingApprovals } from "@/server/authorization/policies";
import { errorResponse, internalErrorResponse } from "@/server/http/responses";
import { loadCurrentUser } from "@/server/identity/current-user";

export async function GET(request: NextRequest) {
  try {
    const user = await loadCurrentUser(request);

    if (!user) {
      return errorResponse(
        401,
        "DEMO_IDENTITY_REQUIRED",
        "Select a demo identity to continue.",
      );
    }

    if (!canViewPendingApprovals(user.role)) {
      await recordForbiddenApprovalView(user);
      return errorResponse(
        403,
        "APPROVAL_FORBIDDEN",
        "You are not authorized to view pending approvals.",
      );
    }

    const approvalRequests = await listPendingApprovals();

    return NextResponse.json({
      approvalRequests: approvalRequests.map(serializeApprovalRequest),
    });
  } catch {
    return internalErrorResponse();
  }
}
