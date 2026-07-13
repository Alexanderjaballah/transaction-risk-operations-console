import { NextResponse, type NextRequest } from "next/server";
import { canDecide } from "@/server/authorization/policies";
import { readMutationRequest } from "@/server/http/mutation-request";
import { errorResponse, internalErrorResponse } from "@/server/http/responses";
import { loadCurrentUser } from "@/server/identity/current-user";
import {
  executeDecision,
  recordForbiddenDecision,
} from "@/server/transactions/decision-service";
import { transactionIdSchema } from "@/server/transactions/schemas";

interface RouteContext {
  params: Promise<{
    transactionId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const mutationRequest = await readMutationRequest(request);

    if (!mutationRequest.ok) {
      return mutationRequest.response;
    }

    const { transactionId } = await context.params;

    if (!transactionIdSchema.safeParse(transactionId).success) {
      return errorResponse(
        400,
        "TRANSACTION_ID_INVALID",
        "The transaction identifier is invalid.",
      );
    }

    const user = await loadCurrentUser(request);

    if (!user) {
      return errorResponse(
        401,
        "DEMO_IDENTITY_REQUIRED",
        "Select a demo identity to continue.",
      );
    }

    if (!canDecide(user.role)) {
      const forbidden = await recordForbiddenDecision(user, transactionId);
      return errorResponse(
        forbidden.status,
        forbidden.code,
        forbidden.message,
      );
    }

    const result = await executeDecision(
      user,
      transactionId,
      mutationRequest.payload,
    );

    if (!result.ok) {
      return errorResponse(result.status, result.code, result.message);
    }

    return NextResponse.json({
      kind: result.kind,
      transaction: {
        id: result.transaction.id,
        status: result.transaction.status,
        updatedAt: result.transaction.updatedAt.toISOString(),
      },
      ...(result.kind === "PENDING_APPROVAL"
        ? {
            approvalRequest: {
              id: result.approvalRequest.id,
              status: result.approvalRequest.status,
              requestedAction: result.approvalRequest.requestedAction,
              requestedTargetState:
                result.approvalRequest.requestedTargetState,
              createdAt: result.approvalRequest.createdAt.toISOString(),
            },
          }
        : {}),
    });
  } catch {
    return internalErrorResponse();
  }
}
