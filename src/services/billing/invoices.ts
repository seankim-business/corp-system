/**
 * Invoice Service
 *
 * Manages invoice records and synchronization with Stripe.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { getSubscription } from "./subscriptions";
import { getInvoices as getStripeInvoices, getUpcomingInvoice } from "./stripe";

export interface Invoice {
  id: string;
  organizationId: string;
  stripeInvoiceId: string | null;
  subscriptionId: string | null;
  amount: number; // In cents
  currency: string;
  status: InvoiceStatus;
  periodStart: Date;
  periodEnd: Date;
  paidAt: Date | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";

export interface CreateInvoiceParams {
  organizationId: string;
  stripeInvoiceId?: string;
  subscriptionId?: string;
  amount: number;
  currency?: string;
  status?: InvoiceStatus;
  periodStart: Date;
  periodEnd: Date;
  hostedInvoiceUrl?: string;
  invoicePdfUrl?: string;
}

/**
 * Get invoice by ID
 */
export async function getInvoice(invoiceId: string): Promise<Invoice | null> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return null;
    }

    return mapInvoice(invoice);
  } catch (error) {
    logger.error(
      "Failed to get invoice",
      { invoiceId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

/**
 * Get invoice by Stripe invoice ID
 */
export async function getInvoiceByStripeId(
  stripeInvoiceId: string,
): Promise<Invoice | null> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { stripeInvoiceId },
    });

    if (!invoice) {
      return null;
    }

    return mapInvoice(invoice);
  } catch (error) {
    logger.error(
      "Failed to get invoice by Stripe ID",
      { stripeInvoiceId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

/**
 * Get invoices for an organization
 */
export async function getInvoicesForOrganization(
  orgId: string,
  limit: number = 10,
  offset: number = 0,
): Promise<{ invoices: Invoice[]; total: number }> {
  try {
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.invoice.count({
        where: { organizationId: orgId },
      }),
    ]);

    return {
      invoices: invoices.map(mapInvoice),
      total,
    };
  } catch (error) {
    logger.error(
      "Failed to get invoices for organization",
      { organizationId: orgId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return { invoices: [], total: 0 };
  }
}

/**
 * Create an invoice record
 */
export async function createInvoice(
  params: CreateInvoiceParams,
): Promise<Invoice> {
  try {
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: params.organizationId,
        stripeInvoiceId: params.stripeInvoiceId,
        subscriptionId: params.subscriptionId,
        amount: params.amount,
        currency: params.currency || "USD",
        status: params.status || "draft",
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        hostedInvoiceUrl: params.hostedInvoiceUrl,
        invoicePdfUrl: params.invoicePdfUrl,
      },
    });

    logger.info("Created invoice", {
      invoiceId: invoice.id,
      organizationId: params.organizationId,
    });

    return mapInvoice(invoice);
  } catch (error) {
    logger.error(
      "Failed to create invoice",
      { organizationId: params.organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Update invoice status
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatus,
  paidAt?: Date,
): Promise<Invoice | null> {
  try {
    const invoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status,
        paidAt: paidAt || (status === "paid" ? new Date() : undefined),
      },
    });

    logger.info("Updated invoice status", { invoiceId, status });

    return mapInvoice(invoice);
  } catch (error) {
    logger.error(
      "Failed to update invoice status",
      { invoiceId, status },
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

/**
 * Update invoice from Stripe webhook
 */
export async function updateInvoiceFromStripe(
  stripeInvoiceId: string,
  data: {
    status?: InvoiceStatus;
    amount?: number;
    paidAt?: Date | null;
    hostedInvoiceUrl?: string | null;
    invoicePdfUrl?: string | null;
  },
): Promise<Invoice | null> {
  try {
    const invoice = await prisma.invoice.update({
      where: { stripeInvoiceId },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.paidAt !== undefined && { paidAt: data.paidAt }),
        ...(data.hostedInvoiceUrl !== undefined && {
          hostedInvoiceUrl: data.hostedInvoiceUrl,
        }),
        ...(data.invoicePdfUrl !== undefined && {
          invoicePdfUrl: data.invoicePdfUrl,
        }),
      },
    });

    logger.info("Updated invoice from Stripe", { stripeInvoiceId });

    return mapInvoice(invoice);
  } catch (error) {
    logger.error(
      "Failed to update invoice from Stripe",
      { stripeInvoiceId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

/**
 * Sync invoices from Stripe
 */
export async function syncInvoicesFromStripe(orgId: string): Promise<void> {
  try {
    const subscription = await getSubscription(orgId);

    if (!subscription?.stripeCustomerId) {
      logger.debug("No Stripe customer for organization", {
        organizationId: orgId,
      });
      return;
    }

    const stripeInvoices = await getStripeInvoices(
      subscription.stripeCustomerId,
      20,
    );

    for (const stripeInvoice of stripeInvoices.data) {
      const existingInvoice = await getInvoiceByStripeId(stripeInvoice.id);

      if (existingInvoice) {
        // Update existing invoice
        await updateInvoiceFromStripe(stripeInvoice.id, {
          status: mapStripeInvoiceStatus(stripeInvoice.status),
          amount: stripeInvoice.amount_due,
          paidAt:
            stripeInvoice.status === "paid"
              ? new Date(stripeInvoice.created * 1000)
              : null,
          hostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
          invoicePdfUrl: stripeInvoice.invoice_pdf,
        });
      } else {
        // Create new invoice record
        await createInvoice({
          organizationId: orgId,
          stripeInvoiceId: stripeInvoice.id,
          subscriptionId: subscription.id,
          amount: stripeInvoice.amount_due,
          currency: stripeInvoice.currency.toUpperCase(),
          status: mapStripeInvoiceStatus(stripeInvoice.status),
          periodStart: new Date(stripeInvoice.period_start * 1000),
          periodEnd: new Date(stripeInvoice.period_end * 1000),
          hostedInvoiceUrl: stripeInvoice.hosted_invoice_url || undefined,
          invoicePdfUrl: stripeInvoice.invoice_pdf || undefined,
        });
      }
    }

    logger.info("Synced invoices from Stripe", {
      organizationId: orgId,
      count: stripeInvoices.data.length,
    });
  } catch (error) {
    logger.error(
      "Failed to sync invoices from Stripe",
      { organizationId: orgId },
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Get upcoming invoice preview
 */
export async function getUpcomingInvoicePreview(
  orgId: string,
): Promise<{
  amount: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
} | null> {
  try {
    const subscription = await getSubscription(orgId);

    if (!subscription?.stripeCustomerId) {
      return null;
    }

    const upcoming = await getUpcomingInvoice(subscription.stripeCustomerId);

    if (!upcoming) {
      return null;
    }

    return {
      amount: upcoming.amount_due,
      currency: upcoming.currency.toUpperCase(),
      periodStart: new Date(upcoming.period_start * 1000),
      periodEnd: new Date(upcoming.period_end * 1000),
    };
  } catch (error) {
    logger.error(
      "Failed to get upcoming invoice preview",
      { organizationId: orgId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return null;
  }
}

/**
 * Get invoice statistics for organization
 */
export async function getInvoiceStats(orgId: string): Promise<{
  totalPaid: number;
  totalPending: number;
  invoiceCount: number;
  currency: string;
}> {
  try {
    const [paidResult, pendingResult, count] = await Promise.all([
      prisma.invoice.aggregate({
        where: { organizationId: orgId, status: "paid" },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: { organizationId: orgId, status: "open" },
        _sum: { amount: true },
      }),
      prisma.invoice.count({
        where: { organizationId: orgId },
      }),
    ]);

    return {
      totalPaid: paidResult._sum.amount || 0,
      totalPending: pendingResult._sum.amount || 0,
      invoiceCount: count,
      currency: "USD",
    };
  } catch (error) {
    logger.error(
      "Failed to get invoice stats",
      { organizationId: orgId },
      error instanceof Error ? error : new Error(String(error)),
    );
    return {
      totalPaid: 0,
      totalPending: 0,
      invoiceCount: 0,
      currency: "USD",
    };
  }
}

/**
 * Map Stripe invoice status to our status
 */
function mapStripeInvoiceStatus(
  stripeStatus: string | null,
): InvoiceStatus {
  const statusMap: Record<string, InvoiceStatus> = {
    draft: "draft",
    open: "open",
    paid: "paid",
    void: "void",
    uncollectible: "uncollectible",
  };

  return statusMap[stripeStatus || "draft"] || "draft";
}

/**
 * Map database invoice to Invoice interface
 */
function mapInvoice(dbInvoice: {
  id: string;
  organizationId: string;
  stripeInvoiceId: string | null;
  subscriptionId: string | null;
  amount: number;
  currency: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  paidAt: Date | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Invoice {
  return {
    id: dbInvoice.id,
    organizationId: dbInvoice.organizationId,
    stripeInvoiceId: dbInvoice.stripeInvoiceId,
    subscriptionId: dbInvoice.subscriptionId,
    amount: dbInvoice.amount,
    currency: dbInvoice.currency,
    status: dbInvoice.status as InvoiceStatus,
    periodStart: dbInvoice.periodStart,
    periodEnd: dbInvoice.periodEnd,
    paidAt: dbInvoice.paidAt,
    hostedInvoiceUrl: dbInvoice.hostedInvoiceUrl,
    invoicePdfUrl: dbInvoice.invoicePdfUrl,
    createdAt: dbInvoice.createdAt,
    updatedAt: dbInvoice.updatedAt,
  };
}
