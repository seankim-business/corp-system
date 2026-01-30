/**
 * Context Inheritance for Sub-Agents (E2-T4)
 *
 * Provides utilities for building and extracting context to pass from parent agents to child agents.
 */

import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import type { AgentContext, SubAgentConfig } from "./sub-agent-spawner";

/**
 * Build inherited context for sub-agent based on parent context
 */
export async function buildInheritedContext(
  parentContext: AgentContext,
  config: SubAgentConfig,
): Promise<Record<string, unknown>> {
  const inheritedContext: Record<string, unknown> = {};

  // Extract conversation history (last 5 messages from session)
  if (config.contextToPass?.conversationHistory) {
    try {
      const sessionHistory = await prisma.session.findUnique({
        where: { id: parentContext.sessionId },
        select: { history: true },
      });

      if (sessionHistory?.history && Array.isArray(sessionHistory.history)) {
        const recentHistory = sessionHistory.history.slice(-5);
        inheritedContext.conversationHistory = recentHistory;
      }
    } catch (error) {
      logger.warn("Failed to extract conversation history", {
        sessionId: parentContext.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Extract relevant entities from task description
  if (config.contextToPass?.relevantEntities) {
    const entities = extractEntities(config.task);
    if (Object.keys(entities).length > 0) {
      inheritedContext.relevantEntities = entities;
    }
  }

  // Generate parent task summary
  if (config.contextToPass?.parentSummary) {
    inheritedContext.parentSummary = {
      agentType: parentContext.parentTaskId || "root",
      task: config.task.substring(0, 200),
      depth: parentContext.depth,
    };
  }

  // Merge custom context
  if (config.contextToPass?.customContext) {
    Object.assign(inheritedContext, config.contextToPass.customContext);
  }

  return inheritedContext;
}

/**
 * Extract entities (names, dates, values) from task text
 */
export function extractEntities(text: string): Record<string, string[]> {
  const entities: Record<string, string[]> = {};

  // Extract potential file paths
  const filePaths = text.match(/[\w\-./]+\.(ts|js|tsx|jsx|json|md|txt|yml|yaml)/g);
  if (filePaths && filePaths.length > 0) {
    entities.files = [...new Set(filePaths)];
  }

  // Extract potential function/class names (camelCase or PascalCase)
  const identifiers = text.match(/\b[A-Z][a-zA-Z0-9]+\b/g);
  if (identifiers && identifiers.length > 0) {
    entities.identifiers = [...new Set(identifiers)];
  }

  // Extract numbers (potential IDs, versions, counts)
  const numbers = text.match(/\b\d+\b/g);
  if (numbers && numbers.length > 0) {
    entities.numbers = [...new Set(numbers)];
  }

  // Extract quoted strings
  const quotedStrings = text.match(/"([^"]+)"|'([^']+)'/g);
  if (quotedStrings && quotedStrings.length > 0) {
    entities.quotedValues = quotedStrings.map((s) => s.slice(1, -1));
  }

  return entities;
}

/**
 * Format inherited context for display in child agent's system prompt
 */
export function formatContextForPrompt(
  parentAgentType: string,
  taskSummary: string,
  entities: Record<string, string[]>,
): string {
  const sections: string[] = [];

  sections.push("[PARENT CONTEXT]");
  sections.push(`Parent Agent: ${parentAgentType}`);
  sections.push(`Parent Task: ${taskSummary}`);

  if (Object.keys(entities).length > 0) {
    const entityLines: string[] = [];

    if (entities.files) {
      entityLines.push(`Files: ${entities.files.join(", ")}`);
    }
    if (entities.identifiers) {
      entityLines.push(`Identifiers: ${entities.identifiers.join(", ")}`);
    }
    if (entities.numbers) {
      entityLines.push(`Numbers: ${entities.numbers.join(", ")}`);
    }
    if (entities.quotedValues) {
      entityLines.push(`Values: ${entities.quotedValues.join(", ")}`);
    }

    if (entityLines.length > 0) {
      sections.push("");
      sections.push("Relevant Entities:");
      sections.push(...entityLines);
    }
  }

  return sections.join("\n");
}
