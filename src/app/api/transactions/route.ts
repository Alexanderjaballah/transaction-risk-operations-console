import { NextResponse, type NextRequest } from "next/server";
import { canViewTransactions } from "@/server/authorization/policies";
import { errorResponse, internalErrorResponse } from "@/server/http/responses";
import { loadCurrentUser } from "@/server/identity/current-user";
import {
  listTransactions,
  serializeTransaction,
} from "@/server/transactions/queries";
import { transactionQuerySchema } from "@/server/transactions/schemas";

export async function GET(request: NextRequest) {
  try {
    const user = await loadCurrentUser(request);

    if (!user || !canViewTransactions(user.role)) {
      return errorResponse(
        401,
        "DEMO_IDENTITY_REQUIRED",
        "Select a demo identity to continue.",
      );
    }

    const parsed = transactionQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );

    if (!parsed.success) {
      return errorResponse(
        400,
        "TRANSACTION_QUERY_INVALID",
        "The transaction filters are invalid.",
      );
    }

    const result = await listTransactions(parsed.data);

    return NextResponse.json({
      ...result,
      transactions: result.transactions.map(serializeTransaction),
    });
  } catch {
    return internalErrorResponse();
  }
}
