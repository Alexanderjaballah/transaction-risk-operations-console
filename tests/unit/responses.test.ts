import { describe, expect, it } from "vitest";
import {
  errorResponse,
  internalErrorResponse,
} from "@/server/http/responses";

describe("http error responses", () => {
  it("wraps the code and message in an error envelope with the given status", async () => {
    const response = errorResponse(404, "NOT_FOUND", "Transaction not found.");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Transaction not found.",
      },
    });
  });

  it("returns a generic 500 that does not expose internal details", async () => {
    const response = internalErrorResponse();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
      },
    });
  });
});
