import type { User } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";

export const DEMO_USER_COOKIE = "transaction_console_demo_user";

export async function loadCurrentUser(request: NextRequest): Promise<User | null> {
  const userId = request.cookies.get(DEMO_USER_COOKIE)?.value;

  if (!userId) {
    return null;
  }

  return prisma.user.findUnique({ where: { id: userId } });
}
