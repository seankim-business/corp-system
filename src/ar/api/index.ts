/**
 * AR API Module
 *
 * Exports all AR-related API routers for mounting in the main application.
 */

import arDepartmentsRouter from './ar-departments';
import arPositionsRouter from './ar-positions';
import arAssignmentsRouter from './ar-assignments';
import arCoordinationRouter from './ar-coordination';
import arAnalyticsRouter from './ar-analytics';

export {
  arDepartmentsRouter,
  arPositionsRouter,
  arAssignmentsRouter,
  arCoordinationRouter,
  arAnalyticsRouter,
};

// Default export for convenience
export default {
  departments: arDepartmentsRouter,
  positions: arPositionsRouter,
  assignments: arAssignmentsRouter,
  coordination: arCoordinationRouter,
  analytics: arAnalyticsRouter,
};
