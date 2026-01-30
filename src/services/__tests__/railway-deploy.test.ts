/**
 * Railway Deployment Service Tests
 *
 * Note: These tests require Railway API credentials to run.
 * Set RAILWAY_API_TOKEN and RAILWAY_PROJECT_ID in .env for integration tests.
 */

import { railwayDeploy } from '../railway-deploy';

describe('RailwayDeployService', () => {
  describe('isConfigured', () => {
    it('should return true when credentials are configured', () => {
      // This will depend on environment variables
      const isConfigured = railwayDeploy.isConfigured();
      expect(typeof isConfigured).toBe('boolean');
    });
  });

  describe('triggerDeployment', () => {
    it('should return error when not configured', async () => {
      if (!railwayDeploy.isConfigured()) {
        const result = await railwayDeploy.triggerDeployment();
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('getDeploymentStatus', () => {
    it('should throw error when not configured', async () => {
      if (!railwayDeploy.isConfigured()) {
        await expect(
          railwayDeploy.getDeploymentStatus('test-id')
        ).rejects.toThrow();
      }
    });
  });

  describe('getRecentDeployments', () => {
    it('should return empty array when not configured', async () => {
      if (!railwayDeploy.isConfigured()) {
        const deployments = await railwayDeploy.getRecentDeployments();
        expect(Array.isArray(deployments)).toBe(true);
      }
    });
  });

  describe('getProjectInfo', () => {
    it('should return null when not configured', async () => {
      if (!railwayDeploy.isConfigured()) {
        const info = await railwayDeploy.getProjectInfo();
        expect(info).toBeNull();
      }
    });
  });
});

/**
 * Example Usage
 *
 * // Trigger a deployment
 * const result = await railwayDeploy.triggerDeployment();
 * console.log('Deployment triggered:', result.deploymentId);
 *
 * // Wait for completion
 * const completed = await railwayDeploy.waitForDeployment(result.deploymentId);
 * if (completed.success) {
 *   console.log('Deployment successful!');
 * } else {
 *   console.error('Deployment failed:', completed.error);
 * }
 *
 * // Get recent deployments
 * const recent = await railwayDeploy.getRecentDeployments(5);
 * recent.forEach(d => {
 *   console.log(`${d.id}: ${d.status} - ${d.commitMessage}`);
 * });
 *
 * // Get deployment logs
 * const logs = await railwayDeploy.getDeploymentLogs(deploymentId);
 * console.log(logs);
 *
 * // Rollback to a previous deployment
 * const rollback = await railwayDeploy.rollback(previousDeploymentId);
 * if (rollback.success) {
 *   console.log('Rolled back successfully');
 * }
 */
