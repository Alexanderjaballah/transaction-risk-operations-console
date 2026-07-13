import { z } from "zod";
import { prisma } from "@/server/db";

export const demoSessionSchema = z.object({
  userId: z.string().min(1).max(64),
});

export async function listDemoUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
    },
  });
}

export async function findDemoUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      role: true,
    },
  });
}
