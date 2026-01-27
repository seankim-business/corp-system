import { AsyncLocalStorage } from "async_hooks";

export type OrganizationContext = {
  organizationId: string;
  userId?: string;
  role?: string;
};

/**
 * AsyncLocalStorage for storing request-scoped organization context
 * Used by RLS middleware to set PostgreSQL session variables
 */
export const asyncLocalStorage = new AsyncLocalStorage<OrganizationContext>();

/**
 * Get current organization context from AsyncLocalStorage
 * Returns null if no context is set
 */
export function getOrganizationContext(): OrganizationContext | null {
  return asyncLocalStorage.getStore() ?? null;
}

/**
 * Run a function with organization context
 * This context will be available to all code in the execution chain
 */
export function runWithContext<T>(context: OrganizationContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}
