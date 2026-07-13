import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTransactions } from "@/components/transaction-queue";

const query = {
  page: 1,
  risk: "",
  search: "",
  status: "",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transaction queue loading", () => {
  it("treats a request aborted during effect cleanup as expected", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          expect(init?.signal).toBe(controller.signal);
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("Request canceled during cleanup.")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = loadTransactions(query, controller.signal);
    controller.abort();

    await expect(result).resolves.toEqual({ kind: "aborted" });
  });

  it("treats an AbortError DOMException as expected", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(new DOMException("The operation was aborted.", "AbortError")),
    );

    await expect(
      loadTransactions(query, new AbortController().signal),
    ).resolves.toEqual({ kind: "aborted" });
  });

  it("surfaces a real fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Network connection failed.")),
    );

    await expect(
      loadTransactions(query, new AbortController().signal),
    ).resolves.toEqual({
      kind: "error",
      message: "Unable to load transactions.",
    });
  });
});
