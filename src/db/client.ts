import { PrismaClient } from "@prisma/client";
import { getOrganizationContext } from "../utils/async-context";

// Create base Prisma client
function createBasePrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "production" ? [] : ["warn", "error"],
  });
}

// Extend Prisma client with RLS middleware using $extends (Prisma 6+ pattern)
// This replaces the deprecated $use middleware API
function createExtendedPrismaClient() {
  const baseClient = createBasePrismaClient();

  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query, operation }) {
          // Skip RLS context for raw queries
          const rawActions = new Set([
            "$executeRaw",
            "$executeRawUnsafe",
            "$queryRaw",
            "$queryRawUnsafe",
          ]);

          if (rawActions.has(operation)) {
            return query(args);
          }

          // Set organization context for RLS before each query
          const organizationId = getOrganizationContext()?.organizationId ?? null;

          if (organizationId) {
            await baseClient.$executeRaw`SELECT set_current_organization(${organizationId})`;
          }

          return query(args);
        },
      },
    },
  });
}

// Type for the extended client
type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;

// Singleton pattern for Prisma Client
let prisma: ExtendedPrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = createExtendedPrismaClient();
} else {
  // Prevent multiple instances in development
  const globalWithPrisma = global as typeof globalThis & {
    prisma: ExtendedPrismaClient;
  };

  if (!globalWithPrisma.prisma) {
    globalWithPrisma.prisma = createExtendedPrismaClient();
  }

  prisma = globalWithPrisma.prisma;
}

export const db = prisma;
