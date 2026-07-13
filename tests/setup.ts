import { afterAll, beforeEach } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { prisma } from "../src/server/db";

beforeEach(async () => {
  await seedDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});
