import { RiskLevel, TransactionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildSeedData, seedDatabase } from "../../prisma/seed";
import { prisma } from "@/server/db";

describe("deterministic synthetic seed data", () => {
  it("meets the queue, threshold, risk, currency, and demo-record invariants", async () => {
    expect(await prisma.transaction.count()).toBe(200);
    expect(
      await prisma.transaction.count({
        where: { status: TransactionStatus.FLAGGED },
      }),
    ).toBeGreaterThanOrEqual(40);
    expect(
      await prisma.transaction.count({
        where: {
          status: TransactionStatus.FLAGGED,
          amountMinor: { gt: 100000 },
        },
      }),
    ).toBeGreaterThanOrEqual(15);
    expect(
      await prisma.transaction.count({
        where: {
          status: TransactionStatus.FLAGGED,
          amountMinor: { lte: 100000 },
        },
      }),
    ).toBeGreaterThanOrEqual(15);
    expect(
      await prisma.transaction.groupBy({
        by: ["riskLevel"],
        where: { status: TransactionStatus.FLAGGED },
      }),
    ).toEqual(
      expect.arrayContaining(
        Object.values(RiskLevel).map((riskLevel) =>
          expect.objectContaining({ riskLevel }),
        ),
      ),
    );
    expect(
      await prisma.transaction.count({ where: { currency: { not: "USD" } } }),
    ).toBe(0);
    await expect(
      prisma.transaction.findMany({
        where: {
          id: {
            in: [
              "TRX-2026-000041",
              "TRX-2026-000042",
              "TRX-2026-000043",
            ],
          },
        },
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          amountMinor: true,
        },
      }),
    ).resolves.toEqual([
      {
        id: "TRX-2026-000041",
        status: TransactionStatus.FLAGGED,
        amountMinor: 68425,
      },
      {
        id: "TRX-2026-000042",
        status: TransactionStatus.FLAGGED,
        amountMinor: 186750,
      },
      {
        id: "TRX-2026-000043",
        status: TransactionStatus.APPROVED,
        amountMinor: 41673,
      },
    ]);
  });

  it("produces stable records across reseeds", async () => {
    const expected = buildSeedData().transactions;
    await seedDatabase(prisma);
    const first = await prisma.transaction.findMany({
      orderBy: { id: "asc" },
    });
    await seedDatabase(prisma);
    const second = await prisma.transaction.findMany({
      orderBy: { id: "asc" },
    });

    expect(first).toEqual(second);
    expect(first).toEqual(expected);
  });
});
