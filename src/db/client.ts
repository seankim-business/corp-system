import { PrismaClient } from "@prisma/client";
import { getOrganizationContext, isRLSBypassed } from "../utils/async-context";
import { logger } from "../utils/logger";

// Circuit breaker permanently disabled - was causing more problems than it solved
// DB is managed by Railway with auto-failover, circuit breaker just blocked legitimate requests

function createPrismaClient(): PrismaClient {
  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === "production" ? [] : ["warn", "error"],
  });

  // Note: $extends returns a client that works at runtime but TypeScript loses some internal types
  // Using 'as unknown as PrismaClient' preserves model type inference from @prisma/client
  // The extended client still has all model accessors (e.g., featureRequest, user, etc.)
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

          // Skip RLS AND circuit breaker if bypass flag is set
          // This is critical for auth bootstrap - these queries must succeed even when
          // the circuit breaker is OPEN (e.g., during user identity resolution in Slack)
          if (isRLSBypassed()) {
            logger.debug("RLS bypass active - skipping context check and circuit breaker", {
              operation,
              model,
            });
            // Skip circuit breaker for auth operations to prevent auth failures
            // when circuit breaker trips due to other query failures
            return query(args);
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

          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

export function getDatabaseCircuitBreakerStats() {
  // Circuit breaker disabled - return static "disabled" status for health dashboard compatibility
  return {
    state: "DISABLED" as const,
    failureCount: 0,
    successCount: 0,
  };
}

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
