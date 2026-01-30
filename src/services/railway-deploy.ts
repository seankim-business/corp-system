/**
 * Railway Deployment Service
 *
 * Integrates with Railway GraphQL API for:
 * - Triggering deployments
 * - Monitoring deployment status
 * - Rolling back failed deployments
 * - Fetching deployment logs
 *
 * API Documentation: https://docs.railway.app/reference/public-api
 */

import { logger } from "../utils/logger";

export interface DeploymentStatus {
  id: string;
  status: 'building' | 'deploying' | 'success' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  commitSha?: string;
  commitMessage?: string;
  error?: string;
}

export interface DeploymentResult {
  success: boolean;
  deploymentId: string;
  status: DeploymentStatus['status'];
  url?: string;
  logs?: string;
  error?: string;
}

export interface RollbackResult {
  success: boolean;
  deploymentId: string;
  rolledBackTo: string;
  error?: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

interface DeploymentData {
  id: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  staticUrl?: string;
  meta?: {
    commitMessage?: string;
    commitAuthor?: string;
    commitHash?: string;
  };
}

class RailwayDeployService {
  private apiToken: string;
  private projectId: string;
  private serviceId: string;
  private environmentId: string;
  private apiEndpoint = 'https://backboard.railway.app/graphql/v2';

  constructor() {
    this.apiToken = process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_TOKEN || '';
    this.projectId = process.env.RAILWAY_PROJECT_ID || '';
    this.serviceId = process.env.RAILWAY_SERVICE_ID || '';
    this.environmentId = process.env.RAILWAY_ENVIRONMENT_ID || 'production';

    if (!this.apiToken) {
      logger.warn('RAILWAY_API_TOKEN not configured. Railway deployment features will be disabled.');
    }
  }

  /**
   * Check if Railway is configured
   */
  isConfigured(): boolean {
    return !!(this.apiToken && this.projectId);
  }

  /**
   * Execute a GraphQL query against Railway API
   */
  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('Railway API not configured. Set RAILWAY_API_TOKEN and RAILWAY_PROJECT_ID environment variables.');
    }

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      if (!response.ok) {
        throw new Error(`Railway API returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as GraphQLResponse<T>;

      if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map(e => e.message).join(', ');
        throw new Error(`GraphQL errors: ${errorMessages}`);
      }

      if (!result.data) {
        throw new Error('No data returned from Railway API');
      }

      return result.data;
    } catch (error) {
      logger.error('Railway API request failed', { error, query: query.substring(0, 100) });
      throw error;
    }
  }

  /**
   * Trigger a new deployment
   */
  async triggerDeployment(commitSha?: string): Promise<DeploymentResult> {
    logger.info('Triggering Railway deployment', { projectId: this.projectId, serviceId: this.serviceId, commitSha });

    try {
      const mutation = `
        mutation DeploymentTrigger($environmentId: String!, $serviceId: String!, $projectId: String!) {
          deploymentTrigger(
            input: {
              environmentId: $environmentId
              serviceId: $serviceId
              projectId: $projectId
            }
          ) {
            id
            status
            createdAt
            staticUrl
          }
        }
      `;

      const data = await this.graphql<{
        deploymentTrigger: DeploymentData;
      }>(mutation, {
        environmentId: this.environmentId,
        serviceId: this.serviceId,
        projectId: this.projectId,
      });

      const deployment = data.deploymentTrigger;
      const status = this.mapDeploymentStatus(deployment.status);

      logger.info('Deployment triggered successfully', { deploymentId: deployment.id, status });

      return {
        success: true,
        deploymentId: deployment.id,
        status,
        url: deployment.staticUrl,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to trigger deployment', { error: errorMessage });

      return {
        success: false,
        deploymentId: '',
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Get current deployment status
   */
  async getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus> {
    logger.debug('Fetching deployment status', { deploymentId });

    const query = `
      query Deployment($id: String!) {
        deployment(id: $id) {
          id
          status
          createdAt
          updatedAt
          staticUrl
          meta
        }
      }
    `;

    const data = await this.graphql<{
      deployment: DeploymentData;
    }>(query, { id: deploymentId });

    const deployment = data.deployment;

    return {
      id: deployment.id,
      status: this.mapDeploymentStatus(deployment.status),
      startedAt: new Date(deployment.createdAt),
      completedAt: deployment.updatedAt ? new Date(deployment.updatedAt) : undefined,
      commitSha: deployment.meta?.commitHash,
      commitMessage: deployment.meta?.commitMessage,
    };
  }

  /**
   * Wait for deployment to complete
   */
  async waitForDeployment(deploymentId: string, timeoutMs = 300000): Promise<DeploymentResult> {
    logger.info('Waiting for deployment to complete', { deploymentId, timeoutMs });

    const startTime = Date.now();
    const pollInterval = 5000; // Poll every 5 seconds

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getDeploymentStatus(deploymentId);

        // Terminal states
        if (status.status === 'success') {
          logger.info('Deployment completed successfully', { deploymentId });
          return {
            success: true,
            deploymentId,
            status: 'success',
          };
        }

        if (status.status === 'failed' || status.status === 'cancelled') {
          logger.error('Deployment failed or was cancelled', { deploymentId, status: status.status });
          return {
            success: false,
            deploymentId,
            status: status.status,
            error: status.error || `Deployment ${status.status}`,
          };
        }

        // Still in progress
        logger.debug('Deployment in progress', { deploymentId, status: status.status });
        await this.sleep(pollInterval);

      } catch (error) {
        logger.error('Error checking deployment status', { error, deploymentId });
        await this.sleep(pollInterval);
      }
    }

    // Timeout
    logger.error('Deployment timeout', { deploymentId, timeoutMs });
    return {
      success: false,
      deploymentId,
      status: 'deploying',
      error: `Deployment timed out after ${timeoutMs}ms`,
    };
  }

  /**
   * Get recent deployments
   */
  async getRecentDeployments(limit = 10): Promise<DeploymentStatus[]> {
    logger.debug('Fetching recent deployments', { limit });

    const query = `
      query Deployments($projectId: String!, $first: Int!) {
        deployments(input: { projectId: $projectId }, first: $first) {
          edges {
            node {
              id
              status
              createdAt
              updatedAt
              staticUrl
              meta
            }
          }
        }
      }
    `;

    try {
      const data = await this.graphql<{
        deployments: {
          edges: Array<{ node: DeploymentData }>;
        };
      }>(query, {
        projectId: this.projectId,
        first: limit,
      });

      return data.deployments.edges.map(edge => {
        const deployment = edge.node;
        return {
          id: deployment.id,
          status: this.mapDeploymentStatus(deployment.status),
          startedAt: new Date(deployment.createdAt),
          completedAt: deployment.updatedAt ? new Date(deployment.updatedAt) : undefined,
          commitSha: deployment.meta?.commitHash,
          commitMessage: deployment.meta?.commitMessage,
        };
      });
    } catch (error) {
      logger.error('Failed to fetch recent deployments', { error });
      return [];
    }
  }

  /**
   * Rollback to a previous deployment
   */
  async rollback(deploymentId: string): Promise<RollbackResult> {
    logger.info('Rolling back to deployment', { deploymentId });

    try {
      // Get the deployment details first
      const deployment = await this.getDeploymentStatus(deploymentId);

      if (deployment.status !== 'success') {
        throw new Error('Cannot rollback to a deployment that did not succeed');
      }

      // Trigger a new deployment with the same commit
      const result = await this.triggerDeployment(deployment.commitSha);

      if (!result.success) {
        throw new Error(result.error || 'Failed to trigger rollback deployment');
      }

      logger.info('Rollback deployment triggered', {
        originalDeployment: deploymentId,
        newDeployment: result.deploymentId,
      });

      return {
        success: true,
        deploymentId: result.deploymentId,
        rolledBackTo: deploymentId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Rollback failed', { error: errorMessage, deploymentId });

      return {
        success: false,
        deploymentId: '',
        rolledBackTo: deploymentId,
        error: errorMessage,
      };
    }
  }

  /**
   * Get deployment logs
   */
  async getDeploymentLogs(deploymentId: string): Promise<string> {
    logger.debug('Fetching deployment logs', { deploymentId });

    const query = `
      query DeploymentLogs($deploymentId: String!) {
        deploymentLogs(deploymentId: $deploymentId) {
          logs
        }
      }
    `;

    try {
      const data = await this.graphql<{
        deploymentLogs: { logs: string };
      }>(query, { deploymentId });

      return data.deploymentLogs.logs;
    } catch (error) {
      logger.error('Failed to fetch deployment logs', { error, deploymentId });
      return `Error fetching logs: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Get project information
   */
  async getProjectInfo(): Promise<{
    id: string;
    name: string;
    services: Array<{ id: string; name: string }>;
  } | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const query = `
      query Project($id: String!) {
        project(id: $id) {
          id
          name
          services {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `;

    try {
      const data = await this.graphql<{
        project: {
          id: string;
          name: string;
          services: {
            edges: Array<{ node: { id: string; name: string } }>;
          };
        };
      }>(query, { id: this.projectId });

      return {
        id: data.project.id,
        name: data.project.name,
        services: data.project.services.edges.map(e => e.node),
      };
    } catch (error) {
      logger.error('Failed to fetch project info', { error });
      return null;
    }
  }

  /**
   * Map Railway deployment status to our status enum
   */
  private mapDeploymentStatus(status: string): DeploymentStatus['status'] {
    const statusLower = status.toLowerCase();

    if (statusLower.includes('building') || statusLower.includes('initializing')) {
      return 'building';
    }
    if (statusLower.includes('deploying')) {
      return 'deploying';
    }
    if (statusLower.includes('success') || statusLower.includes('active')) {
      return 'success';
    }
    if (statusLower.includes('cancel')) {
      return 'cancelled';
    }
    if (statusLower.includes('fail') || statusLower.includes('error') || statusLower.includes('crashed')) {
      return 'failed';
    }

    // Default to deploying for unknown statuses
    return 'deploying';
  }

  /**
   * Sleep helper for polling
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const railwayDeploy = new RailwayDeployService();

export default RailwayDeployService;
