import type { NextRequest } from "next/server";
import { errorResponse } from "@/server/http/responses";

const MAX_MUTATION_BODY_BYTES = 16 * 1024;
const JSON_CONTENT_TYPE =
  /^application\/json(?:\s*;\s*charset=(?:"[^"]+"|[!#$%&'*+\-.^_`|~0-9A-Za-z]+))?\s*$/i;

interface MutationRequestSuccess {
  ok: true;
  payload: unknown;
}

interface MutationRequestFailure {
  ok: false;
  response: Response;
}

export type MutationRequestResult =
  | MutationRequestSuccess
  | MutationRequestFailure;

function malformedJson(): MutationRequestFailure {
  return {
    ok: false,
    response: errorResponse(
      400,
      "MALFORMED_JSON",
      "The request body must contain valid JSON.",
    ),
  };
}

export async function readMutationRequest(
  request: NextRequest,
): Promise<MutationRequestResult> {
  const origin = request.headers.get("origin");

  if (!origin || origin === "null" || origin !== request.nextUrl.origin) {
    return {
      ok: false,
      response: errorResponse(
        403,
        "ORIGIN_FORBIDDEN",
        "The request origin is not allowed.",
      ),
    };
  }

  const contentType = request.headers.get("content-type");

  if (!contentType || !JSON_CONTENT_TYPE.test(contentType)) {
    return {
      ok: false,
      response: errorResponse(
        415,
        "CONTENT_TYPE_UNSUPPORTED",
        "The request must use application/json.",
      ),
    };
  }

  const contentLength = request.headers.get("content-length");

  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_MUTATION_BODY_BYTES
  ) {
    await request.body?.cancel().catch(() => undefined);

    return {
      ok: false,
      response: errorResponse(
        413,
        "REQUEST_BODY_TOO_LARGE",
        "The request body is too large.",
      ),
    };
  }

  const reader = request.body?.getReader();

  if (!reader) {
    return malformedJson();
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_MUTATION_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);

        return {
          ok: false,
          response: errorResponse(
            413,
            "REQUEST_BODY_TOO_LARGE",
            "The request body is too large.",
          ),
        };
      }

      chunks.push(value);
    }
  } catch {
    return malformedJson();
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return {
      ok: true,
      payload: JSON.parse(text) as unknown,
    };
  } catch {
    return malformedJson();
  }
}
