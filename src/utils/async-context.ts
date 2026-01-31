import { AsyncLocalStorage } from "async_hooks";

export type OrganizationContext = {
  organizationId: string | null;
  userId?: string;
  role?: string;
  bypass?: boolean;
};

/**
 * AsyncLocalStorage for storing request-scoped organization context
 * Used by RLS middleware to set PostgreSQL session variables
 */
export const asyncLocalStorage = new AsyncLocalStorage<OrganizationContext>();

/**
 * Get current organization context from AsyncLocalStorage
 * Returns null if no context is set or if bypass is active
 */
export function getOrganizationContext(): OrganizationContext | null {
  const store = asyncLocalStorage.getStore();
  if (!store || store.bypass) {
    return null;
  }
  return store;
}

/**
 * Check if RLS bypass is currently active
 * Returns true if queries should skip RLS checks
 */
export function isRLSBypassed(): boolean {
  const store = asyncLocalStorage.getStore();
  return store?.bypass === true;
}

/**
 * Run a function with organization context
 * This context will be available to all code in the execution chain
 */
export function runWithContext<T>(context: OrganizationContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Run a function without RLS context (bypass organization filtering)
 * Use this for system-level queries that need to bypass tenant isolation,
 * such as authentication lookups that need to establish the organization context.
 *
 * Important: This function awaits async operations INSIDE the AsyncLocalStorage context
 * to ensure the bypass flag is propagated through Prisma's query execution.
 */
export async function runWithoutRLS<T>(fn: () => T | Promise<T>): Promise<Awaited<T>> {
  // Run with bypass flag set to true, awaiting inside the context to ensure
  // the AsyncLocalStorage propagates through Prisma's query hooks
  return asyncLocalStorage.run({ organizationId: null, bypass: true }, async () => {
    const result = await fn();
    return result as Awaited<T>;
  }) as Promise<Awaited<T>>;
}
