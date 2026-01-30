/**
 * Railway Deployment Service - Usage Examples
 *
 * This file demonstrates practical usage of the Railway Deploy Service
 * in the context of the Nubabel system.
 */

import { railwayDeploy } from './railway-deploy';
import { logger } from '../utils/logger';

/**
 * Example 1: Simple deployment trigger
 */
export async function triggerSimpleDeployment() {
  logger.info('Starting simple deployment');

  const result = await railwayDeploy.triggerDeployment();

  if (result.success) {
    logger.info('Deployment triggered successfully', {
      deploymentId: result.deploymentId,
      status: result.status,
    });
    return result.deploymentId;
  } else {
    logger.error('Deployment failed to trigger', { error: result.error });
    throw new Error(result.error);
  }
}

/**
 * Example 2: Deploy and wait for completion
 */
export async function deployAndWait() {
  logger.info('Starting deployment with wait');

  // Trigger deployment
  const result = await railwayDeploy.triggerDeployment();

  if (!result.success) {
    throw new Error(`Failed to trigger deployment: ${result.error}`);
  }

  logger.info('Deployment triggered, waiting for completion', {
    deploymentId: result.deploymentId,
  });

  // Wait up to 5 minutes
  const completed = await railwayDeploy.waitForDeployment(
    result.deploymentId,
    300000
  );

  if (completed.success) {
    logger.info('Deployment completed successfully', {
      deploymentId: completed.deploymentId,
    });
    return completed;
  } else {
    logger.error('Deployment failed', {
      deploymentId: completed.deploymentId,
      error: completed.error,
    });

    // Fetch logs for debugging
    const logs = await railwayDeploy.getDeploymentLogs(completed.deploymentId);
    logger.error('Deployment logs', { logs: logs.slice(-1000) });

    throw new Error(completed.error);
  }
}

/**
 * Example 3: Deployment with Slack notification integration
 */
export async function deployWithSlackNotification(
  slackChannelId: string,
  slackMessageFn: (channel: string, message: string) => Promise<void>
) {
  // Initial notification
  await slackMessageFn(slackChannelId, '🚀 Starting deployment to Railway...');

  try {
    const result = await railwayDeploy.triggerDeployment();

    if (!result.success) {
      await slackMessageFn(
        slackChannelId,
        `❌ Failed to trigger deployment: ${result.error}`
      );
      return;
    }

    await slackMessageFn(
      slackChannelId,
      `✅ Deployment started (ID: ${result.deploymentId})\n⏳ Waiting for completion...`
    );

    // Wait for completion
    const completed = await railwayDeploy.waitForDeployment(result.deploymentId);

    if (completed.success) {
      await slackMessageFn(
        slackChannelId,
        `✅ Deployment successful!\nDeployment ID: ${completed.deploymentId}`
      );
    } else {
      const logs = await railwayDeploy.getDeploymentLogs(result.deploymentId);
      await slackMessageFn(
        slackChannelId,
        `❌ Deployment failed: ${completed.error}\n\`\`\`\n${logs.slice(-500)}\n\`\`\``
      );
    }
  } catch (error) {
    await slackMessageFn(
      slackChannelId,
      `❌ Deployment error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    throw error;
  }
}

/**
 * Example 4: Get deployment history
 */
export async function getDeploymentHistory(limit = 10) {
  logger.info('Fetching deployment history', { limit });

  const deployments = await railwayDeploy.getRecentDeployments(limit);

  logger.info('Deployment history retrieved', {
    count: deployments.length,
    deployments: deployments.map(d => ({
      id: d.id,
      status: d.status,
      startedAt: d.startedAt,
      commitMessage: d.commitMessage,
    })),
  });

  return deployments;
}

/**
 * Example 5: Rollback to previous deployment
 */
export async function rollbackToPreviousDeployment() {
  logger.info('Starting rollback process');

  // Get recent deployments
  const recent = await railwayDeploy.getRecentDeployments(10);

  // Find the last successful deployment
  const lastSuccessful = recent.find(d => d.status === 'success');

  if (!lastSuccessful) {
    throw new Error('No successful deployment found to rollback to');
  }

  logger.info('Rolling back to deployment', {
    deploymentId: lastSuccessful.id,
    commitMessage: lastSuccessful.commitMessage,
    startedAt: lastSuccessful.startedAt,
  });

  // Perform rollback
  const rollback = await railwayDeploy.rollback(lastSuccessful.id);

  if (!rollback.success) {
    throw new Error(`Rollback failed: ${rollback.error}`);
  }

  logger.info('Rollback deployment triggered', {
    newDeploymentId: rollback.deploymentId,
    rolledBackTo: rollback.rolledBackTo,
  });

  // Wait for rollback to complete
  const completed = await railwayDeploy.waitForDeployment(rollback.deploymentId);

  if (completed.success) {
    logger.info('Rollback completed successfully');
    return completed;
  } else {
    throw new Error(`Rollback deployment failed: ${completed.error}`);
  }
}

/**
 * Example 6: Health check after deployment
 */
export async function deployWithHealthCheck(healthCheckUrl: string) {
  logger.info('Starting deployment with health check', { healthCheckUrl });

  // Get current deployment for potential rollback
  const current = await railwayDeploy.getRecentDeployments(1);
  const currentDeployment = current[0];

  // Trigger new deployment
  const result = await railwayDeploy.triggerDeployment();

  if (!result.success) {
    throw new Error(`Deployment failed: ${result.error}`);
  }

  // Wait for completion
  const completed = await railwayDeploy.waitForDeployment(result.deploymentId);

  if (!completed.success) {
    throw new Error(`Deployment failed: ${completed.error}`);
  }

  // Wait for app to start
  logger.info('Waiting for application to start...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Perform health check
  logger.info('Performing health check', { url: healthCheckUrl });

  try {
    const response = await fetch(healthCheckUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}`);
    }

    logger.info('Health check passed');
    return completed;

  } catch (error) {
    logger.error('Health check failed', { error });

    // Rollback if health check fails
    if (currentDeployment && currentDeployment.status === 'success') {
      logger.warn('Rolling back due to failed health check');
      await rollbackToPreviousDeployment();
    }

    throw error;
  }
}

/**
 * Example 7: Monitor deployment status
 */
export async function monitorDeployment(deploymentId: string) {
  logger.info('Starting deployment monitoring', { deploymentId });

  const interval = setInterval(async () => {
    try {
      const status = await railwayDeploy.getDeploymentStatus(deploymentId);

      logger.info('Deployment status update', {
        deploymentId,
        status: status.status,
        startedAt: status.startedAt,
        completedAt: status.completedAt,
      });

      // Stop monitoring if deployment is complete
      if (['success', 'failed', 'cancelled'].includes(status.status)) {
        clearInterval(interval);
        logger.info('Deployment monitoring complete', {
          deploymentId,
          finalStatus: status.status,
        });
      }
    } catch (error) {
      logger.error('Error monitoring deployment', { error, deploymentId });
      clearInterval(interval);
    }
  }, 5000); // Check every 5 seconds

  // Stop after 5 minutes regardless
  setTimeout(() => {
    clearInterval(interval);
    logger.warn('Deployment monitoring timeout', { deploymentId });
  }, 300000);
}

/**
 * Example 8: Get project information
 */
export async function getProjectInformation() {
  logger.info('Fetching Railway project information');

  const projectInfo = await railwayDeploy.getProjectInfo();

  if (!projectInfo) {
    logger.warn('Railway not configured or project not found');
    return null;
  }

  logger.info('Project information retrieved', {
    projectId: projectInfo.id,
    projectName: projectInfo.name,
    services: projectInfo.services.map(s => ({
      id: s.id,
      name: s.name,
    })),
  });

  return projectInfo;
}

/**
 * Example 9: Integration with orchestrator queue
 * This shows how to integrate deployments with the existing queue system
 */
export async function queueDeployment(metadata?: Record<string, unknown>) {
  logger.info('Queueing deployment', { metadata });

  // This would integrate with the existing BullMQ queue
  // For example:
  // await orchestrationQueue.add('railway-deploy', {
  //   metadata,
  //   timestamp: new Date().toISOString(),
  // });

  // Then the worker would execute:
  return await deployAndWait();
}

/**
 * Example 10: Continuous deployment on git push
 * This would be called by a webhook or CI/CD pipeline
 */
export async function handleGitPushWebhook(commitSha: string, commitMessage: string) {
  logger.info('Handling git push webhook', { commitSha, commitMessage });

  try {
    // Trigger deployment for specific commit
    const result = await railwayDeploy.triggerDeployment(commitSha);

    if (!result.success) {
      logger.error('Failed to trigger deployment from webhook', {
        commitSha,
        error: result.error,
      });
      return { success: false, error: result.error };
    }

    // Wait for deployment
    const completed = await railwayDeploy.waitForDeployment(result.deploymentId);

    return {
      success: completed.success,
      deploymentId: completed.deploymentId,
      status: completed.status,
      error: completed.error,
    };

  } catch (error) {
    logger.error('Error handling git push webhook', { error, commitSha });
    throw error;
  }
}
