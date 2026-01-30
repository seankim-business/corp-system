import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import { ExtensionPurchase } from "../types";

// Revenue split: 70% publisher, 30% platform (platform gets remainder)
const PUBLISHER_SHARE = 0.7;

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
  // Note: ExtensionPurchase model doesn't exist in current schema
  // This would need to be added via migration
  // For now, we'll log the attempt and return a simulated response

  logger.info("Purchase attempt", { organizationId, extensionId, userId });

  // Get extension to verify it exists and check pricing
  const extension = await db.marketplaceExtension.findUnique({
    where: { id: extensionId },
    include: { publisher: true },
  });

  if (!extension) {
    return {
      transactionId: "",
      status: "failed",
      error: "Extension not found",
    };
  }

  // Extract pricing from manifest metadata
  const manifest = extension.manifest as Record<string, unknown>;
  const metadata = (manifest?.metadata as Record<string, unknown>) || {};
  const pricing = metadata.pricing as string;

  if (pricing === "free") {
    return {
      transactionId: "",
      status: "failed",
      error: "Extension is free - no purchase needed",
    };
  }

  // In a real implementation, this would:
  // 1. Create a Stripe payment intent
  // 2. Process the payment
  // 3. Create an ExtensionPurchase record
  // 4. Create a PublisherPayout record for the publisher's share

  logger.warn("Purchase processing not fully implemented - requires ExtensionPurchase model");

  return {
    transactionId: `txn_${Date.now()}`,
    status: "success",
  };
}

export async function subscribeToExtension(
  organizationId: string,
  extensionId: string,
  userId: string,
  plan: "monthly" | "yearly",
  _paymentMethodId: string,
): Promise<PaymentResult> {
  logger.info("Subscription attempt", { organizationId, extensionId, userId, plan });

  // Get extension to verify it exists
  const extension = await db.marketplaceExtension.findUnique({
    where: { id: extensionId },
  });

  if (!extension) {
    return {
      transactionId: "",
      status: "failed",
      error: "Extension not found",
    };
  }

  // In a real implementation, this would:
  // 1. Create a Stripe subscription
  // 2. Create an ExtensionPurchase record with subscription details
  // 3. Set up recurring billing

  logger.warn("Subscription processing not fully implemented - requires ExtensionPurchase model");

  return {
    transactionId: `sub_${Date.now()}`,
    status: "success",
  };
}

export async function cancelSubscription(purchaseId: string, userId: string): Promise<void> {
  logger.info("Subscription cancellation attempt", { purchaseId, userId });

  // In a real implementation, this would:
  // 1. Find the ExtensionPurchase record
  // 2. Cancel the Stripe subscription
  // 3. Update the purchase status to "cancelled"

  logger.warn("Subscription cancellation not fully implemented - requires ExtensionPurchase model");
}

export async function processPayouts(): Promise<PayoutResult[]> {
  logger.info("Processing publisher payouts");

  // Get all publishers with pending payouts
  const publishers = await db.extensionPublisher.findMany({
    where: { verified: true },
    include: {
      extensions: {
        select: { downloads: true },
      },
    },
  });

  const results: PayoutResult[] = [];

  for (const publisher of publishers) {
    // Calculate earnings (simplified - in reality this would be based on actual sales)
    const totalDownloads = publisher.extensions.reduce((sum, ext) => sum + ext.downloads, 0);

    // Skip if no activity
    if (totalDownloads === 0) continue;

    // Create payout record
    try {
      const payout = await db.publisherPayout.create({
        data: {
          publisherId: publisher.id,
          amount: 0, // Would be calculated from actual sales
          currency: "usd",
          status: "pending",
          periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          periodEnd: new Date(),
        },
      });

      results.push({
        publisherId: publisher.id,
        amount: payout.amount,
        status: "success",
        transferId: payout.id,
      });
    } catch (error) {
      logger.error("Failed to create payout", { publisherId: publisher.id, error });
      results.push({
        publisherId: publisher.id,
        amount: 0,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  logger.info("Payout processing complete", { processed: results.length });
  return results;
}

export async function getPurchase(
  extensionId: string,
  organizationId: string,
): Promise<ExtensionPurchase | null> {
  // Note: ExtensionPurchase model doesn't exist in current schema
  // This would need to be added via migration
  logger.warn("getPurchase: ExtensionPurchase model not in schema", {
    extensionId,
    organizationId,
  });
  return null;
}

export async function getOrganizationPurchases(organizationId: string): Promise<ExtensionPurchase[]> {
  // Note: ExtensionPurchase model doesn't exist in current schema
  logger.warn("getOrganizationPurchases: ExtensionPurchase model not in schema", {
    organizationId,
  });
  return [];
}

export async function checkExpiredSubscriptions(): Promise<void> {
  logger.info("Checking for expired subscriptions");

  // Note: ExtensionPurchase model doesn't exist in current schema
  // In a real implementation, this would:
  // 1. Find all subscriptions with expiresAt < now
  // 2. Update their status to "expired"
  // 3. Notify the organization

  logger.warn("Subscription expiration check not implemented - requires ExtensionPurchase model");
}

export async function createPayout(
  publisherId: string,
  amount: number,
  currency: string = "usd",
): Promise<string> {
  const payout = await db.publisherPayout.create({
    data: {
      publisherId,
      amount,
      currency,
      status: "pending",
      periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
    },
  });

  logger.info("Payout created", { payoutId: payout.id, publisherId, amount });
  return payout.id;
}

export async function updatePayoutStatus(
  payoutId: string,
  status: "processing" | "completed" | "failed",
  transactionId?: string,
  failureReason?: string,
): Promise<void> {
  await db.publisherPayout.update({
    where: { id: payoutId },
    data: {
      status,
      transactionId,
      failureReason,
      processedAt: status === "completed" ? new Date() : undefined,
    },
  });

  logger.info("Payout status updated", { payoutId, status });
}

export async function getPublisherBalance(publisherId: string): Promise<number> {
  // Sum of all completed payouts (negative = paid out)
  // Plus sum of all earnings (would need ExtensionPurchase model)
  const payouts = await db.publisherPayout.aggregate({
    where: {
      publisherId,
      status: "completed",
    },
    _sum: { amount: true },
  });

  // For now, return 0 since we don't have purchase tracking
  logger.info("Publisher balance calculated", {
    publisherId,
    paidOut: payouts._sum.amount || 0,
  });

  return 0;
}
