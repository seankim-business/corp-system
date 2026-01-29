// import { db } from "../../db/client"; // Disabled until Prisma tables exist
import { logger } from "../../utils/logger";
import { ExtensionPurchase } from "../types";

// Revenue split: 70% publisher, 30% platform
const PUBLISHER_SHARE = 0.7;
// const PLATFORM_SHARE = 0.3; // Unused until Prisma tables exist

export interface PaymentResult {
  transactionId: string;
  status: "success" | "failed";
  error?: string;
}

export interface PayoutResult {
  publisherId: string;
  amount: number;
  status: "success" | "failed";
  transferId?: string;
  error?: string;
}

export function calculateSplit(amount: number): {
  publisher: number;
  platform: number;
} {
  const publisher = Math.floor(amount * PUBLISHER_SHARE);
  const platform = amount - publisher;
  return { publisher, platform };
}

export async function purchaseExtension(
  organizationId: string,
  extensionId: string,
  userId: string,
  _paymentMethodId: string,
): Promise<PaymentResult> {
  // TODO: Implement once marketplace tables are created via Prisma migration
  logger.warn("purchaseExtension not implemented - tables not yet created", {
    organizationId,
    extensionId,
    userId,
  });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function subscribeToExtension(
  organizationId: string,
  extensionId: string,
  userId: string,
  plan: "monthly" | "yearly",
  _paymentMethodId: string,
): Promise<PaymentResult> {
  // TODO: Implement once marketplace tables are created via Prisma migration
  logger.warn("subscribeToExtension not implemented - tables not yet created", {
    organizationId,
    extensionId,
    userId,
    plan,
  });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function cancelSubscription(
  purchaseId: string,
  userId: string,
): Promise<void> {
  // TODO: Implement once extensionPurchase table is created via Prisma migration
  logger.warn("cancelSubscription not implemented - tables not yet created", {
    purchaseId,
    userId,
  });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");
}

export async function processPayouts(): Promise<PayoutResult[]> {
  // TODO: Implement once publisher and extensionPurchase tables are created via Prisma migration
  logger.warn("processPayouts not implemented - tables not yet created");
  return [];
}

export async function getPurchase(
  extensionId: string,
  organizationId: string,
): Promise<ExtensionPurchase | null> {
  // TODO: Implement once extensionPurchase table is created via Prisma migration
  logger.warn("getPurchase returning null - tables not yet created", { extensionId, organizationId });
  return null;
}

export async function getOrganizationPurchases(
  organizationId: string,
): Promise<ExtensionPurchase[]> {
  // TODO: Implement once extensionPurchase table is created via Prisma migration
  logger.warn("getOrganizationPurchases returning empty array - tables not yet created", { organizationId });
  return [];
}

export async function checkExpiredSubscriptions(): Promise<void> {
  // TODO: Implement once extensionPurchase table is created via Prisma migration
  logger.warn("checkExpiredSubscriptions not implemented - tables not yet created");
  return;
}
