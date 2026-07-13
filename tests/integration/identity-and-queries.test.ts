import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  POST as selectIdentity,
} from "@/app/api/demo-session/route";
import { GET as getTransaction } from "@/app/api/transactions/[transactionId]/route";
import { GET as listTransactions } from "@/app/api/transactions/route";
import { requestWithIdentity } from "../helpers";

describe("identity and transaction reads", () => {
  it("sets an HttpOnly cookie for a seeded demo identity", async () => {
    const response = await selectIdentity(
      new NextRequest("http://localhost/api/demo-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({ userId: "USR-2026-0002" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain(
      "transaction_console_demo_user=USR-2026-0002",
    );
  });

  it("rejects an unknown demo identity", async () => {
    const response = await selectIdentity(
      new NextRequest("http://localhost/api/demo-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({ userId: "USR-UNKNOWN" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("searches by transaction ID and filters status/risk server-side", async () => {
    const response = await listTransactions(
      requestWithIdentity(
        "http://localhost/api/transactions?search=TRX-2026-000041&status=FLAGGED&risk=LOW",
        "USR-2026-0001",
      ),
    );
    const body: {
      transactions: Array<{ id: string; status: string; riskLevel: string }>;
    } = await response.json();

    expect(response.status).toBe(200);
    expect(body.transactions).toEqual([
      expect.objectContaining({
        id: "TRX-2026-000041",
        status: "FLAGGED",
        riskLevel: "LOW",
      }),
    ]);
  });

  it("returns only a masked account reference", async () => {
    const response = await getTransaction(
      requestWithIdentity(
        "http://localhost/api/transactions/TRX-2026-000041",
        "USR-2026-0001",
      ),
      {
        params: Promise.resolve({ transactionId: "TRX-2026-000041" }),
      },
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(serialized).toContain("maskedAccountReference");
    expect(serialized).not.toContain("accountLastFour");
  });
});
