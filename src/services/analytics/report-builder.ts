// Analytics Report Builder - Build and export analytics reports
import { logger } from "../../utils/logger";
import type { AgentMetrics, OrgMetrics } from "./metrics-aggregator";
import type { Trend, Anomaly } from "./trend-analyzer";
import type { LeaderboardEntry, ComparisonReport } from "./comparison-engine";

// ============================================================================
// INTERFACES
// ============================================================================

export interface ReportSection {
  title: string;
  type: "summary" | "chart" | "table" | "text" | "list";
  data: unknown;
}

export interface AnalyticsReport {
  id: string;
  organizationId: string;
  title: string;
  generatedAt: Date;
  period: { start: Date; end: Date };
  sections: ReportSection[];
  metadata: {
    generatedBy: string;
    format: "json" | "csv" | "pdf";
    version: string;
  };
}

export interface CSVExportOptions {
  includeHeaders: boolean;
  delimiter: string;
  sections: string[];
}

export interface PDFExportOptions {
  includeCharts: boolean;
  pageSize: "a4" | "letter";
  orientation: "portrait" | "landscape";
}

export interface ReportConfig {
  title: string;
  sections: Array<"overview" | "agents" | "trends" | "anomalies" | "leaderboard" | "costs">;
  format: "json" | "csv" | "pdf";
}

export interface ReportData {
  orgMetrics?: OrgMetrics;
  agentMetrics?: AgentMetrics[];
  trends?: Trend[];
  anomalies?: Anomaly[];
  leaderboard?: LeaderboardEntry[];
  comparison?: ComparisonReport;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a UUID v4 for report ID
 */
export function generateReportId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Format date to ISO string
 */
export function formatDate(date: Date): string {
  return date.toISOString();
}

/**
 * Flatten nested object for CSV export
 */
export function flattenObject(
  obj: Record<string, unknown>,
  prefix: string = "",
): Record<string, unknown> {
  const flattened: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      flattened[newKey] = "";
    } else if (typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(flattened, flattenObject(value as Record<string, unknown>, newKey));
    } else if (value instanceof Date) {
      flattened[newKey] = value.toISOString();
    } else if (Array.isArray(value)) {
      flattened[newKey] = value.join("; ");
    } else {
      flattened[newKey] = value;
    }
  }

  return flattened;
}

/**
 * Escape CSV value
 */
function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ============================================================================
// REPORT BUILDER CLASS
// ============================================================================

export class ReportBuilder {
  private readonly VERSION = "1.0.0";

  /**
   * Build a complete analytics report
   */
  buildReport(config: ReportConfig, data: ReportData): AnalyticsReport {
    const sections: ReportSection[] = [];

    for (const sectionType of config.sections) {
      switch (sectionType) {
        case "overview":
          if (data.orgMetrics) {
            sections.push(this.buildOverviewSection(data.orgMetrics));
          }
          break;
        case "agents":
          if (data.agentMetrics) {
            sections.push(this.buildAgentSection(data.agentMetrics));
          }
          break;
        case "trends":
          if (data.trends) {
            sections.push(this.buildTrendSection(data.trends));
          }
          break;
        case "anomalies":
          if (data.anomalies) {
            sections.push(this.buildAnomalySection(data.anomalies));
          }
          break;
        case "leaderboard":
          if (data.leaderboard) {
            sections.push(this.buildLeaderboardSection(data.leaderboard));
          }
          break;
        case "costs":
          if (data.orgMetrics && data.agentMetrics) {
            sections.push(this.buildCostSection(data.orgMetrics, data.agentMetrics));
          }
          break;
      }
    }

    const period = data.orgMetrics?.period || {
      start: new Date(),
      end: new Date(),
    };

    const report: AnalyticsReport = {
      id: generateReportId(),
      organizationId: data.orgMetrics?.organizationId || "",
      title: config.title,
      generatedAt: new Date(),
      period,
      sections,
      metadata: {
        generatedBy: "nubabel-analytics",
        format: config.format,
        version: this.VERSION,
      },
    };

    logger.debug("Built analytics report", {
      reportId: report.id,
      sectionCount: sections.length,
    });

    return report;
  }

  /**
   * Export report to CSV format
   */
  exportToCSV(
    report: AnalyticsReport,
    options: Partial<CSVExportOptions> = {},
  ): string {
    const opts: CSVExportOptions = {
      includeHeaders: true,
      delimiter: ",",
      sections: [],
      ...options,
    };

    const lines: string[] = [];

    // Report header
    lines.push(`# ${report.title}`);
    lines.push(`# Generated: ${formatDate(report.generatedAt)}`);
    lines.push(`# Period: ${formatDate(report.period.start)} to ${formatDate(report.period.end)}`);
    lines.push("");

    for (const section of report.sections) {
      if (opts.sections.length > 0 && !opts.sections.includes(section.title)) {
        continue;
      }

      lines.push(`## ${section.title}`);

      if (section.type === "table" && Array.isArray(section.data)) {
        const data = section.data as Record<string, unknown>[];
        if (data.length > 0) {
          const flattened = data.map((row) =>
            flattenObject(row as Record<string, unknown>),
          );
          const headers = Object.keys(flattened[0]);

          if (opts.includeHeaders) {
            lines.push(headers.map(escapeCSVValue).join(opts.delimiter));
          }

          for (const row of flattened) {
            lines.push(headers.map((h) => escapeCSVValue(row[h])).join(opts.delimiter));
          }
        }
      } else if (section.type === "summary" && typeof section.data === "object") {
        const data = section.data as Record<string, unknown>;
        const flattened = flattenObject(data);

        if (opts.includeHeaders) {
          lines.push(["Metric", "Value"].join(opts.delimiter));
        }

        for (const [key, value] of Object.entries(flattened)) {
          lines.push([escapeCSVValue(key), escapeCSVValue(value)].join(opts.delimiter));
        }
      } else if (section.type === "list" && Array.isArray(section.data)) {
        const data = section.data as unknown[];
        for (const item of data) {
          if (typeof item === "object" && item !== null) {
            const flattened = flattenObject(item as Record<string, unknown>);
            lines.push(Object.values(flattened).map(escapeCSVValue).join(opts.delimiter));
          } else {
            lines.push(escapeCSVValue(item));
          }
        }
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Export report to PDF format (HTML-based for browser printing)
   * Note: Returns HTML that can be converted to PDF by the client or server-side tools
   */
  exportToPDF(
    report: AnalyticsReport,
    options: Partial<PDFExportOptions> = {},
  ): string {
    const opts: PDFExportOptions = {
      includeCharts: false,
      pageSize: "a4",
      orientation: "portrait",
      ...options,
    };

    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    };

    const html: string[] = [];

    // HTML document structure
    html.push(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(report.title)}</title>
  <style>
    @page { size: ${opts.pageSize} ${opts.orientation}; margin: 1cm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; line-height: 1.5; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 24px; color: #1f2937; margin-bottom: 10px; }
    h2 { font-size: 18px; color: #374151; margin-top: 30px; margin-bottom: 15px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px; }
    .meta { color: #6b7280; font-size: 11px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background-color: #f9fafb; font-weight: 600; color: #374151; }
    tr:hover { background-color: #f9fafb; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .summary-card { background: #f9fafb; padding: 15px; border-radius: 8px; }
    .summary-card .label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
    .summary-card .value { font-size: 20px; font-weight: 600; color: #1f2937; margin-top: 5px; }
    .alert { padding: 10px 15px; border-radius: 8px; margin-bottom: 10px; }
    .alert.warning { background: #fef3c7; border-left: 4px solid #f59e0b; }
    .alert.critical { background: #fee2e2; border-left: 4px solid #ef4444; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
    .badge.success { background: #d1fae5; color: #065f46; }
    .badge.warning { background: #fef3c7; color: #92400e; }
    .badge.danger { background: #fee2e2; color: #991b1b; }
    @media print { body { padding: 0; } h1 { page-break-after: avoid; } h2 { page-break-after: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
  </style>
</head>
<body>`);

    // Report header
    html.push(`
  <h1>${escapeHtml(report.title)}</h1>
  <div class="meta">
    Generated: ${formatDate(report.generatedAt)} |
    Period: ${formatDate(report.period.start)} to ${formatDate(report.period.end)} |
    Report ID: ${report.id}
  </div>`);

    // Render sections
    for (const section of report.sections) {
      html.push(`<h2>${escapeHtml(section.title)}</h2>`);

      if (section.type === "summary" && typeof section.data === "object") {
        const data = section.data as Record<string, unknown>;
        html.push('<div class="summary-grid">');
        for (const [key, value] of Object.entries(data)) {
          const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
          html.push(`
          <div class="summary-card">
            <div class="label">${escapeHtml(label)}</div>
            <div class="value">${escapeHtml(String(value))}</div>
          </div>`);
        }
        html.push("</div>");
      } else if (section.type === "table" && Array.isArray(section.data)) {
        const data = section.data as Record<string, unknown>[];
        if (data.length > 0) {
          const headers = Object.keys(data[0]);
          html.push("<table>");
          html.push("<thead><tr>");
          for (const header of headers) {
            const label = header.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
            html.push(`<th>${escapeHtml(label)}</th>`);
          }
          html.push("</tr></thead>");
          html.push("<tbody>");
          for (const row of data) {
            html.push("<tr>");
            for (const header of headers) {
              const value = row[header];
              let cellContent = escapeHtml(String(value ?? ""));

              // Apply badge styling for specific columns
              if (header.toLowerCase().includes("success") && typeof value === "string" && value.includes("%")) {
                const rate = parseFloat(value);
                const badgeClass = rate >= 95 ? "success" : rate >= 80 ? "warning" : "danger";
                cellContent = `<span class="badge ${badgeClass}">${cellContent}</span>`;
              }

              html.push(`<td>${cellContent}</td>`);
            }
            html.push("</tr>");
          }
          html.push("</tbody></table>");
        }
      } else if (section.type === "list" && Array.isArray(section.data)) {
        const data = section.data as Record<string, unknown>[];
        for (const item of data) {
          if (typeof item === "object" && item !== null) {
            const severity = (item as Record<string, unknown>).severity as string || "warning";
            const alertClass = severity === "critical" ? "critical" : "warning";
            html.push(`<div class="alert ${alertClass}">`);
            for (const [key, value] of Object.entries(item)) {
              const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
              html.push(`<strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))} `);
            }
            html.push("</div>");
          }
        }
      } else if (section.type === "chart" && typeof section.data === "object") {
        // Charts are represented as data tables in PDF
        const chartData = section.data as Record<string, unknown>;
        if (chartData.items && Array.isArray(chartData.items)) {
          const items = chartData.items as Record<string, unknown>[];
          if (items.length > 0) {
            const headers = Object.keys(items[0]);
            html.push("<table>");
            html.push("<thead><tr>");
            for (const header of headers) {
              const label = header.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
              html.push(`<th>${escapeHtml(label)}</th>`);
            }
            html.push("</tr></thead>");
            html.push("<tbody>");
            for (const row of items) {
              html.push("<tr>");
              for (const header of headers) {
                html.push(`<td>${escapeHtml(String(row[header] ?? ""))}</td>`);
              }
              html.push("</tr>");
            }
            html.push("</tbody></table>");
          }
        }
      }
    }

    // Footer
    html.push(`
  <div class="meta" style="margin-top: 40px; text-align: center;">
    Generated by Nubabel Analytics v${this.VERSION}
  </div>
</body>
</html>`);

    return html.join("\n");
  }

  /**
   * Build overview section with summary cards
   */
  buildOverviewSection(orgMetrics: OrgMetrics): ReportSection {
    return {
      title: "Overview",
      type: "summary",
      data: {
        totalExecutions: orgMetrics.totalExecutions,
        totalAgents: orgMetrics.totalAgents,
        uniqueUsers: orgMetrics.uniqueUsers,
        overallSuccessRate: `${orgMetrics.overallSuccessRate}%`,
        avgLatencyMs: `${orgMetrics.avgLatencyMs}ms`,
        totalCostCents: `$${(orgMetrics.totalCostCents / 100).toFixed(2)}`,
        periodStart: formatDate(orgMetrics.period.start),
        periodEnd: formatDate(orgMetrics.period.end),
      },
    };
  }

  /**
   * Build agent comparison table section
   */
  buildAgentSection(agentMetrics: AgentMetrics[]): ReportSection {
    const tableData = agentMetrics.map((m) => ({
      agentId: m.agentId,
      agentName: m.agentName || "Unknown",
      executions: m.totalExecutions,
      successRate: `${m.successRate}%`,
      avgLatencyMs: `${m.avgLatencyMs}ms`,
      p95LatencyMs: `${m.p95LatencyMs}ms`,
      totalCost: `$${(m.totalCostCents / 100).toFixed(2)}`,
      avgRating: m.avgRating > 0 ? m.avgRating.toFixed(1) : "N/A",
      uniqueUsers: m.uniqueUsers,
    }));

    return {
      title: "Agent Performance",
      type: "table",
      data: tableData,
    };
  }

  /**
   * Build trend indicators section
   */
  buildTrendSection(trends: Trend[]): ReportSection {
    const trendData = trends.map((t) => ({
      metric: t.metric,
      direction: t.direction,
      change: `${t.changePercent > 0 ? "+" : ""}${t.changePercent.toFixed(1)}%`,
      previous: t.previousValue,
      current: t.currentValue,
      significance: t.significance,
    }));

    return {
      title: "Trends",
      type: "table",
      data: trendData,
    };
  }

  /**
   * Build anomaly alerts section
   */
  buildAnomalySection(anomalies: Anomaly[]): ReportSection {
    const anomalyData = anomalies.map((a) => ({
      metric: a.metric,
      severity: a.severity,
      value: a.value,
      expected: a.expectedValue,
      deviation: `${a.deviationPercent > 0 ? "+" : ""}${a.deviationPercent.toFixed(1)}%`,
      timestamp: formatDate(a.timestamp),
    }));

    return {
      title: "Anomalies",
      type: "list",
      data: anomalyData,
    };
  }

  /**
   * Build leaderboard section
   */
  buildLeaderboardSection(entries: LeaderboardEntry[]): ReportSection {
    const leaderboardData = entries.map((e) => ({
      rank: e.rank,
      agentName: e.agentName || e.agentId,
      score: e.score.toFixed(1),
      executions: e.executions,
      successRate: `${e.successRate}%`,
      avgLatencyMs: `${e.avgLatencyMs}ms`,
      trend: e.trend,
      previousRank: e.previousRank || "New",
    }));

    return {
      title: "Leaderboard",
      type: "table",
      data: leaderboardData,
    };
  }

  /**
   * Build cost breakdown section (pie chart data)
   */
  buildCostSection(orgMetrics: OrgMetrics, agentMetrics: AgentMetrics[]): ReportSection {
    const costBreakdown = agentMetrics
      .filter((m) => m.totalCostCents > 0)
      .map((m) => ({
        agentName: m.agentName || m.agentId,
        costCents: m.totalCostCents,
        costDollars: `$${(m.totalCostCents / 100).toFixed(2)}`,
        percentage:
          orgMetrics.totalCostCents > 0
            ? `${((m.totalCostCents / orgMetrics.totalCostCents) * 100).toFixed(1)}%`
            : "0%",
      }))
      .sort((a, b) => b.costCents - a.costCents);

    return {
      title: "Cost Breakdown",
      type: "chart",
      data: {
        type: "pie",
        items: costBreakdown,
        total: {
          costCents: orgMetrics.totalCostCents,
          costDollars: `$${(orgMetrics.totalCostCents / 100).toFixed(2)}`,
        },
      },
    };
  }

  /**
   * Build daily execution chart data
   */
  buildExecutionChartSection(orgMetrics: OrgMetrics): ReportSection {
    return {
      title: "Daily Executions",
      type: "chart",
      data: {
        type: "line",
        xAxis: "date",
        yAxis: "executions",
        series: orgMetrics.dailyTrend.map((d) => ({
          date: d.date,
          executions: d.executions,
          successCount: d.successCount,
          costCents: d.costCents,
        })),
      },
    };
  }
}

// Export singleton instance
export const reportBuilder = new ReportBuilder();
export default ReportBuilder;
