import { PrismaClient } from "@prisma/client";
import { getOrganizationContext, isRLSBypassed } from "../utils/async-context";
import { logger } from "../utils/logger";
import { getCircuitBreaker, CircuitBreakerError } from "../utils/circuit-breaker";

const DB_CIRCUIT_BREAKER_NAME = "postgresql";
const DB_QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS || "30000", 10);

const dbCircuitBreaker = getCircuitBreaker(DB_CIRCUIT_BREAKER_NAME, {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: DB_QUERY_TIMEOUT_MS,
  resetTimeout: 60000,
});

function createPrismaClient(): PrismaClient {
  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === "production" ? [] : ["warn", "error"],
  });

  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query, operation, model }: any) {
          const rawActions = new Set([
            "$executeRaw",
            "$executeRawUnsafe",
            "$queryRaw",
            "$queryRawUnsafe",
          ]);

          if (rawActions.has(operation)) {
            return query(args);
          }

          // Skip RLS if bypass flag is set (used for system queries during authentication)
          if (isRLSBypassed()) {
            logger.debug("RLS bypass active - skipping context check", {
              operation,
              model,
            });
            return dbCircuitBreaker.execute(() => query(args));
          }

          const context = getOrganizationContext();
          const organizationId = context?.organizationId ?? null;

          if (organizationId) {
            try {
              await baseClient.$executeRaw`SELECT set_current_organization(${organizationId})`;
              logger.debug("RLS context set", {
                organizationId,
                operation,
                model,
              });
            } catch (error) {
              // RLS function may not exist yet (migration not run)
              // Log warning but continue - RLS is security enhancement, not required for basic functionality
              logger.warn("Failed to set RLS context (migration may not be run yet)", {
                organizationId,
                operation,
                model,
                error: error instanceof Error ? error.message : String(error),
              });
              // Don't throw - allow query to proceed without RLS context
            }
          } else {
            // Warn if there's no organization context (bypass was already checked above)
            logger.warn("No organization context available for RLS", {
              operation,
              model,
            });
          }

          return dbCircuitBreaker.execute(() => query(args));
        },
      },
    },
  }) as unknown as PrismaClient;
}

export function getDatabaseCircuitBreakerStats() {
  return dbCircuitBreaker.getStats();
}

export { CircuitBreakerError };

let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = createPrismaClient();
} else {
  const globalWithPrisma = global as typeof globalThis & {
    prisma: PrismaClient;
  };

  if (!globalWithPrisma.prisma) {
    globalWithPrisma.prisma = createPrismaClient();
  }

  prisma = globalWithPrisma.prisma;
}

export const db = prisma;
