import { NextResponse, type NextRequest } from "next/server";
import { canViewTransactions } from "@/server/authorization/policies";
import { errorResponse, internalErrorResponse } from "@/server/http/responses";
import { loadCurrentUser } from "@/server/identity/current-user";
import {
  findTransaction,
  serializeTransaction,
} from "@/server/transactions/queries";

interface RouteContext {
  params: Promise<{
    transactionId: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await loadCurrentUser(request);

    if (!user || !canViewTransactions(user.role)) {
      return errorResponse(
        401,
        "DEMO_IDENTITY_REQUIRED",
        "Select a demo identity to continue.",
      );
    }

    const { transactionId } = await context.params;
    const transaction = await findTransaction(transactionId);

    if (!transaction) {
      return errorResponse(
        404,
        "TRANSACTION_NOT_FOUND",
        "The requested transaction was not found.",
      );
    }

    return NextResponse.json({
      transaction: serializeTransaction(transaction),
    });
  } catch {
    return internalErrorResponse();
  }
}
