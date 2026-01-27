import { PrismaClient } from "@prisma/client";
import { createRlsMiddleware } from "./rls-middleware";
import { getOrganizationContext } from "../utils/async-context";

// Singleton pattern for Prisma Client
let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  // Prevent multiple instances in development
  const globalWithPrisma = global as typeof globalThis & {
    prisma: PrismaClient;
  };

  if (!globalWithPrisma.prisma) {
    globalWithPrisma.prisma = new PrismaClient({
      log: ["warn", "error"],
    });
  }

  prisma = globalWithPrisma.prisma;
}

// Register RLS middleware to enforce row-level security
prisma.$use(createRlsMiddleware(prisma, getOrganizationContext));

export const db = prisma;
