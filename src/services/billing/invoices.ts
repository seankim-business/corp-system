/**
 * Invoice Service (Stub)
 *
 * NOTE: Requires billing tables in Prisma schema (Invoice, LineItem, etc.)
 */

import { logger } from "../../utils/logger";

export interface Invoice {
  id: string;
  organizationId: string;
  stripeInvoiceId: string | null;
  subscriptionId: string | null;
  amount: number;
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

export async function getInvoices(
  _organizationId: string,
  _limit?: number,
): Promise<Invoice[]> {
  logger.debug("getInvoices called (stub)");
  return [];
}

export async function getInvoice(
  _organizationId: string,
  _invoiceId: string,
): Promise<Invoice | null> {
  logger.debug("getInvoice called (stub)");
  return null;
}

export async function syncInvoices(_organizationId: string): Promise<Invoice[]> {
  logger.debug("syncInvoices called (stub)");
  return [];
}

export async function getUpcomingInvoice(_organizationId: string): Promise<Invoice | null> {
  logger.debug("getUpcomingInvoice called (stub)");
  return null;
}

export async function getBillingHistory(
  _organizationId: string,
  _startDate?: Date,
  _endDate?: Date,
): Promise<Invoice[]> {
  logger.debug("getBillingHistory called (stub)");
  return [];
}

export async function calculateTotalSpend(
  _organizationId: string,
  _startDate?: Date,
  _endDate?: Date,
): Promise<number> {
  logger.debug("calculateTotalSpend called (stub)");
  return 0;
}
