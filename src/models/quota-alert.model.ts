/**
 * QuotaAlert Model
 * Represents quota threshold alerts for Claude accounts
 */

export interface QuotaAlert {
  id: string;
  accountId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  currentValue: number;
  limit: number;
  percentage: number;
  quotaType: QuotaType;
  resolvedAt: Date | null;
  createdAt: Date;
}

export type AlertType =
  | "quota_warning"
  | "quota_critical"
  | "quota_exceeded"
  | "rate_limit"
  | "circuit_open";

export type AlertSeverity = "info" | "warning" | "critical";

export type QuotaType =
  | "daily_tokens"
  | "monthly_tokens"
  | "daily_requests"
  | "monthly_requests"
  | "concurrent_requests";

export interface CreateQuotaAlertInput {
  accountId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  currentValue: number;
  limit: number;
  percentage: number;
  quotaType: QuotaType;
}

export interface QuotaAlertFilters {
  accountId?: string;
  type?: AlertType | AlertType[];
  severity?: AlertSeverity | AlertSeverity[];
  quotaType?: QuotaType;
  resolved?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
}
