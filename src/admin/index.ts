/**
 * Admin Module Entry Point
 *
 * Exports all admin services and router for use in main application.
 */

export { default as adminRouter } from "./api/admin";

export { adminMetricsService } from "./services/metrics";
export { adminOrganizationsService } from "./services/organizations";
export { adminUsersService } from "./services/users";
export { adminRevenueService } from "./services/revenue";
export { adminSystemHealthService } from "./services/system-health";
export { adminSupportService } from "./services/support";

export {
  requireAdminAuth,
  requireAdminPermission,
  isAdmin,
  isSuperAdmin,
  logAdminAction,
} from "./middleware/admin-auth";

export type { AdminUser } from "./middleware/admin-auth";
export type { PlatformMetrics, OrganizationDetails } from "./services/metrics";
export type { OrganizationListItem, OrganizationFilters } from "./services/organizations";
export type { UserListItem, UserDetails, UserFilters } from "./services/users";
export type { RevenueMetrics, RevenueByPeriod, PlanDistribution } from "./services/revenue";
export type { SystemHealth, ComponentHealth, SystemAlert } from "./services/system-health";
export type { SupportTicket, TicketMessage, TicketFilters, TicketStats } from "./services/support";
