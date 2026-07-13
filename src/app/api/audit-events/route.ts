import { NextResponse, type NextRequest } from "next/server";
import {
  listAuditEvents,
  recordDeniedAuditAccess,
} from "@/server/audit/audit-service";
import { canViewAuditTrail } from "@/server/authorization/policies";
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

    if (!canViewAuditTrail(user.role)) {
      await recordDeniedAuditAccess(user);
      return errorResponse(
        403,
        "AUDIT_FORBIDDEN",
        "You are not authorized to view audit events.",
      );
    }

    const events = await listAuditEvents();

    return NextResponse.json({
      events: events.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
    });
  } catch {
    return internalErrorResponse();
  }
}
