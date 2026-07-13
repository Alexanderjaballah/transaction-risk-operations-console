import { NextResponse } from "next/server";

export function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export function internalErrorResponse() {
  return errorResponse(
    500,
    "INTERNAL_ERROR",
    "The request could not be completed.",
  );
}
