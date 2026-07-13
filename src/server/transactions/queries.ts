import type { Prisma, RiskLevel, TransactionStatus } from "@prisma/client";
import { prisma } from "@/server/db";

interface TransactionQuery {
  search: string;
  status?: TransactionStatus;
  risk?: RiskLevel;
  page: number;
  pageSize: number;
}

const transactionInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      accountLastFour: true,
      accountStatus: true,
    },
  },
} satisfies Prisma.TransactionInclude;

export async function listTransactions(query: TransactionQuery) {
  const where: Prisma.TransactionWhereInput = {
    status: query.status,
    riskLevel: query.risk,
  };

  if (query.search) {
    where.OR = [
      { id: { contains: query.search } },
      { merchant: { contains: query.search } },
      { customer: { name: { contains: query.search } } },
    ];
  }

  const [transactions, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      include: transactionInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function findTransaction(transactionId: string) {
  return prisma.transaction.findUnique({
    where: { id: transactionId },
    include: transactionInclude,
  });
}

export function serializeTransaction<
  T extends {
    createdAt: Date;
    updatedAt: Date;
    customer: {
      accountLastFour: string;
    };
  },
>(transaction: T) {
  return {
    ...transaction,
    customer: {
      ...transaction.customer,
      maskedAccountReference: `•••• ${transaction.customer.accountLastFour}`,
      accountLastFour: undefined,
    },
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}
