import type { PrismaClient } from "@prisma/client";

// RLS session middleware for Prisma queries

export type OrganizationContext = {
  organizationId?: string | null;
};

export type PrismaMiddlewareParams = {
  action: string;
  [key: string]: unknown;
};

export type PrismaMiddleware = (
  params: PrismaMiddlewareParams,
  next: (params: PrismaMiddlewareParams) => Promise<unknown>,
) => Promise<unknown>;

const RAW_ACTIONS = new Set(["$executeRaw", "$executeRawUnsafe", "$queryRaw", "$queryRawUnsafe"]);

export function createRlsMiddleware(
  prisma: PrismaClient,
  getContext: () => OrganizationContext | null | undefined,
): PrismaMiddleware {
  return async (params, next) => {
    if (RAW_ACTIONS.has(params.action)) {
      return next(params);
    }

    const organizationId = getContext()?.organizationId ?? null;

    if (organizationId) {
      await prisma.$executeRaw`SELECT set_current_organization(${organizationId})`;
    }

    return next(params);
  };
}
