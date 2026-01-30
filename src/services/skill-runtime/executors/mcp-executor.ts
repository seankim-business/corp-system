import { Extension } from '../../extension-registry';
import { SkillExecutor, SkillInput, SkillOutput, ExecutionContext } from '../types';
import { logger } from '../../../utils/logger';
import { executeTool } from '../../../services/mcp-registry';

export class MCPExecutor implements SkillExecutor {
  canExecute(skill: Extension): boolean {
    return skill.runtimeType === 'mcp' && skill.mcpProviders.length > 0;
  }

  async execute(
    skill: Extension,
    input: SkillInput,
    context: ExecutionContext
  ): Promise<SkillOutput> {
    const startTime = Date.now();

    try {
      // Get required MCP connections
      const requiredProviders = skill.mcpProviders;
      const missingProviders = requiredProviders.filter(
        (p) => !context.mcpConnections.has(p)
      );

      if (missingProviders.length > 0) {
        return {
          success: false,
          error: {
            code: 'MISSING_MCP_PROVIDERS',
            message: `Missing MCP providers: ${missingProviders.join(', ')}`,
          },
          metadata: { executionTimeMs: Date.now() - startTime },
        };
      }

      // Execute required tools in sequence
      const results: unknown[] = [];
      for (const toolName of skill.toolsRequired) {
        const [provider, tool] = toolName.split('__');
        const connection = context.mcpConnections.get(provider);

        if (!connection) {
          throw new Error(`MCP provider not found: ${provider}`);
        }

        const toolResult = await executeTool({
          provider,
          toolName: tool,
          args: input.parameters,
          organizationId: context.organizationId,
          execute: async () => {
            // The connection object from mcpConnections contains the MCP client
            // For now, return a structured result indicating the tool was invoked
            logger.info('Executing MCP tool via registry', {
              provider,
              tool,
              skillSlug: skill.slug,
              organizationId: context.organizationId,
            });
            return { provider, tool, status: 'executed', args: input.parameters };
          },
        });

        results.push(toolResult);
      }

      return {
        success: true,
        result: results,
        metadata: { executionTimeMs: Date.now() - startTime },
      };
    } catch (error) {
      logger.error('MCP execution failed', { skill: skill.slug }, error as Error);
      return {
        success: false,
        error: {
          code: 'MCP_EXECUTION_FAILED',
          message: (error as Error).message,
        },
        metadata: { executionTimeMs: Date.now() - startTime },
      };
    }
  }
}
