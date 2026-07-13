import { NextRequest } from "next/server";

export function requestWithIdentity(
  url: string,
  userId: string,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers);
  headers.set("cookie", `transaction_console_demo_user=${userId}`);
  const method = init?.method?.toUpperCase();

  if (
    method &&
    method !== "GET" &&
    method !== "HEAD" &&
    !headers.has("origin")
  ) {
    headers.set("origin", new URL(url).origin);
  }

  const { signal, ...requestInit } = init ?? {};

  return new NextRequest(url, {
    ...requestInit,
    ...(signal ? { signal } : {}),
    headers,
  });
}

export async function readErrorCode(response: Response) {
  const body: {
    error: {
      code: string;
      message: string;
    };
  } = await response.json();

  return body.error;
}
