// Stable demos: TRX-2026-000041 direct decision; 000042 maker-checker reserve; 000043 terminal-state denial.
import {
  AccountStatus,
  PrismaClient,
  RiskLevel,
  Role,
  TransactionStatus,
} from "@prisma/client";
import { pathToFileURL } from "node:url";

const customerNames = [
  "Avery Morgan",
  "Jordan Patel",
  "Morgan Chen",
  "Taylor Brooks",
  "Riley Nguyen",
  "Cameron Rivera",
  "Quinn Williams",
  "Reese Thompson",
  "Parker Johnson",
  "Sydney Davis",
  "Casey Martinez",
  "Emerson Clark",
  "Rowan Lewis",
  "Finley Walker",
  "Dakota Hall",
  "Skyler Allen",
  "Sage Young",
  "Alexis King",
  "Charlie Wright",
  "Harper Scott",
  "Drew Green",
  "Blair Adams",
  "Kendall Baker",
  "Robin Nelson",
  "Jamie Carter",
] as const;

const merchants = [
  "Northstar Electronics",
  "Summit Travel",
  "Harbor Market",
  "Atlas Office Supply",
  "Cedar & Stone",
  "Metro Mobility",
  "Lighthouse Software",
  "Bluebird Pharmacy",
  "Oakline Furniture",
  "Redwood Telecom",
  "Juniper Fitness",
  "Silverline Hotels",
] as const;

const flagReasons = [
  "Unusual purchase amount for the customer profile",
  "Transaction originated from a new device",
  "Merchant category differs from recent customer activity",
  "Rapid sequence of card-not-present transactions",
  "Billing location differs from established usage pattern",
  "Transaction velocity exceeded the review threshold",
  "Payment method was recently added to the account",
  "High-risk merchant pattern requires manual review",
] as const;

const paymentMethods = [
  "Visa •••• 1042",
  "Mastercard •••• 7781",
  "ACH debit",
  "Virtual card •••• 6620",
] as const;

const riskLevels = [
  RiskLevel.LOW,
  RiskLevel.MEDIUM,
  RiskLevel.HIGH,
  RiskLevel.CRITICAL,
] as const;

export function buildSeedData() {
  const users = [
    {
      id: "USR-2026-0001",
      name: "Sam Support",
      email: "sam.support@example.test",
      role: Role.SUPPORT,
      createdAt: new Date("2026-01-05T09:00:00.000Z"),
    },
    {
      id: "USR-2026-0002",
      name: "Olivia Operations",
      email: "olivia.operations@example.test",
      role: Role.OPERATIONS,
      createdAt: new Date("2026-01-05T09:05:00.000Z"),
    },
    {
      id: "USR-2026-0003",
      name: "Aaron Approver",
      email: "aaron.approver@example.test",
      role: Role.APPROVER,
      createdAt: new Date("2026-01-05T09:10:00.000Z"),
    },
  ];

  const customers = customerNames.map((name, index) => ({
    id: `CUS-2026-${String(index + 1).padStart(4, "0")}`,
    name,
    accountLastFour: String(1207 + index * 317).slice(-4).padStart(4, "0"),
    accountStatus:
      index % 11 === 0
        ? AccountStatus.RESTRICTED
        : index % 17 === 0
          ? AccountStatus.CLOSED
          : AccountStatus.ACTIVE,
    riskLevel: riskLevels[index % riskLevels.length],
    createdAt: new Date(Date.UTC(2025, index % 12, (index % 24) + 1, 10, 0, 0)),
  }));

  const transactions = Array.from({ length: 200 }, (_, offset) => {
    const sequence = offset + 1;
    const isFlaggedRange = sequence <= 80;
    const status =
      sequence === 43
        ? TransactionStatus.APPROVED
        : isFlaggedRange
          ? TransactionStatus.FLAGGED
          : [
              TransactionStatus.APPROVED,
              TransactionStatus.REJECTED,
              TransactionStatus.ESCALATED,
            ][sequence % 3];
    const amountMinor =
      sequence === 41
        ? 68425
        : sequence === 42
          ? 186750
          : isFlaggedRange && sequence % 2 === 0
            ? 125000 + sequence * 137
            : isFlaggedRange
              ? 2500 + ((sequence * 911) % 92000)
              : 1800 + ((sequence * 7919) % 475000);
    const createdAt = new Date(
      Date.UTC(2026, 4 + (sequence % 2), 1 + (sequence % 27), 8 + (sequence % 10), sequence % 60),
    );

    return {
      id: `TRX-2026-${String(sequence).padStart(6, "0")}`,
      customerId: customers[offset % customers.length].id,
      merchant: merchants[offset % merchants.length],
      amountMinor,
      currency: "USD",
      paymentMethod: paymentMethods[offset % paymentMethods.length],
      riskLevel: riskLevels[offset % riskLevels.length],
      flagReason: flagReasons[offset % flagReasons.length],
      status,
      createdAt,
      updatedAt: createdAt,
    };
  });

  return { users, customers, transactions };
}

export async function seedDatabase(client: PrismaClient) {
  const data = buildSeedData();

  await client.$transaction([
    client.auditEvent.deleteMany(),
    client.approvalRequest.deleteMany(),
    client.transaction.deleteMany(),
    client.customer.deleteMany(),
    client.user.deleteMany(),
  ]);
  await client.user.createMany({ data: data.users });
  await client.customer.createMany({ data: data.customers });
  await client.transaction.createMany({ data: data.transactions });

  return data;
}

async function main() {
  const client = new PrismaClient();

  try {
    const data = await seedDatabase(client);
    console.log(
      `Seeded ${data.users.length} users, ${data.customers.length} customers, and ${data.transactions.length} USD transactions.`,
    );
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
