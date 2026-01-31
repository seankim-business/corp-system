import { QuotaMonitorService } from "./quota-monitor.service";

const adminApiKey = process.env.ANTHROPIC_ADMIN_API_KEY;

if (!adminApiKey) {
  throw new Error("ANTHROPIC_ADMIN_API_KEY environment variable is required");
}

const quotaMonitor = new QuotaMonitorService(adminApiKey);

async function manualSync() {
  await quotaMonitor.syncUsageFromAdminAPI();
}

async function syncSpecificAccount(accountId: string) {
  await quotaMonitor.syncUsageFromAdminAPI(accountId);
}

async function checkAccountThresholds(accountId: string) {
  await quotaMonitor.checkThresholds(accountId);
}

async function getAlerts(accountId: string) {
  const unresolvedAlerts = await quotaMonitor.getUnresolvedAlerts(accountId);
  console.log("Unresolved alerts:", unresolvedAlerts);

  const allAlerts = await quotaMonitor.getAllAlerts(accountId);
  console.log("All alerts:", allAlerts);
}

async function resolveAlertById(alertId: string) {
  await quotaMonitor.resolveAlert(alertId);
}

function startBackgroundSync() {
  quotaMonitor.scheduledSync();
}

function stopBackgroundSync() {
  quotaMonitor.stopScheduledSync();
}

export {
  manualSync,
  syncSpecificAccount,
  checkAccountThresholds,
  getAlerts,
  resolveAlertById,
  startBackgroundSync,
  stopBackgroundSync,
};
