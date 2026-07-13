import { NextResponse, type NextRequest } from "next/server";
import { canDecide } from "@/server/authorization/policies";
import { errorResponse, internalErrorResponse } from "@/server/http/responses";
import { loadCurrentUser } from "@/server/identity/current-user";
import {
  executeDecision,
  recordForbiddenDecision,
} from "@/server/transactions/decision-service";

interface RouteContext {
  params: Promise<{
    transactionId: string;
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

    const { transactionId } = await context.params;

    if (!canDecide(user.role)) {
      const forbidden = await recordForbiddenDecision(user, transactionId);
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

    const result = await executeDecision(user, transactionId, rawPayload);

    if (!result.ok) {
      return errorResponse(result.status, result.code, result.message);
    }

    return NextResponse.json({
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
