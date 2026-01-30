/**
 * Task Generator Service
 *
 * Generates specific development tasks from feature analysis.
 * Breaks down high-level features into concrete, actionable tasks.
 */

import { logger } from "../../../utils/logger";
import {
  DevelopmentTask,
  DevelopmentTaskType,
  TaskGenerationContext,
} from "./types";
import { v4 as uuidv4 } from "uuid";

export class TaskGeneratorService {
  /**
   * Generate all tasks for a feature based on analysis
   */
  async generateTasks(context: TaskGenerationContext): Promise<DevelopmentTask[]> {
    logger.info("Generating development tasks", {
      featureIntent: context.featureAnalysis.coreIntent,
      moduleId: context.moduleInfo.id,
    });

    const tasks: DevelopmentTask[] = [];

    // Determine feature type and generate appropriate tasks
    const featureType = this.classifyFeature(context.featureAnalysis);

    switch (featureType) {
      case "skill-enhancement":
        tasks.push(...this.generateSkillTasks(context));
        break;
      case "agent-capability":
        tasks.push(...this.generateAgentTasks(context));
        break;
      case "config-change":
        tasks.push(...this.generateConfigTasks(context));
        break;
      case "new-feature":
        tasks.push(...this.generateNewFeatureTasks(context));
        break;
      case "api-extension":
        tasks.push(...this.generateAPITasks(context));
        break;
      default:
        tasks.push(...this.generateGenericTasks(context));
    }

    // Add testing tasks
    tasks.push(...this.generateTestTasks(context, tasks));

    logger.info("Generated development tasks", {
      totalTasks: tasks.length,
      taskTypes: this.summarizeTaskTypes(tasks),
    });

    return tasks;
  }

  /**
   * Generate tasks for skill enhancement
   */
  generateSkillTasks(context: TaskGenerationContext): DevelopmentTask[] {
    const { featureAnalysis } = context;
    const tasks: DevelopmentTask[] = [];

    // Task 1: Create/update skill definition
    tasks.push({
      id: uuidv4(),
      type: "skill",
      description: `Create skill definition for: ${featureAnalysis.specificFeature}`,
      targetFiles: [`src/skills/${this.toKebabCase(featureAnalysis.specificFeature)}.skill.ts`],
      assignedAgentType: "executor",
      category: "writing",
      status: "pending",
      dependencies: [],
      estimatedTokens: 5000,
      metadata: {
        skillName: featureAnalysis.specificFeature,
        successCriteria: featureAnalysis.successCriteria,
      },
    });

    // Task 2: Update skill registry
    tasks.push({
      id: uuidv4(),
      type: "config",
      description: "Register new skill in skill registry",
      targetFiles: ["src/skills/registry.ts"],
      assignedAgentType: "executor-low",
      category: "quick",
      status: "pending",
      dependencies: [tasks[0].id],
      estimatedTokens: 1000,
    });

    // Task 3: Add skill documentation
    tasks.push({
      id: uuidv4(),
      type: "code",
      description: "Document skill usage and examples",
      targetFiles: [`docs/skills/${this.toKebabCase(featureAnalysis.specificFeature)}.md`],
      assignedAgentType: "writer",
      category: "writing",
      status: "pending",
      dependencies: [tasks[0].id],
      estimatedTokens: 3000,
    });

    return tasks;
  }

  /**
   * Generate tasks for new agent capability
   */
  generateAgentTasks(context: TaskGenerationContext): DevelopmentTask[] {
    const { featureAnalysis } = context;
    const tasks: DevelopmentTask[] = [];

    // Task 1: Create agent profile
    tasks.push({
      id: uuidv4(),
      type: "agent",
      description: `Create agent profile: ${featureAnalysis.specificFeature}`,
      targetFiles: [`src/agents/profiles/${this.toKebabCase(featureAnalysis.specificFeature)}.json`],
      assignedAgentType: "architect",
      category: "ultrabrain",
      status: "pending",
      dependencies: [],
      estimatedTokens: 8000,
      metadata: {
        agentType: "specialized",
        capabilities: featureAnalysis.affectedWorkflows,
      },
    });

    // Task 2: Create agent controller
    tasks.push({
      id: uuidv4(),
      type: "code",
      description: "Implement agent controller logic",
      targetFiles: [`src/agents/${this.toKebabCase(featureAnalysis.specificFeature)}.agent.ts`],
      assignedAgentType: "executor",
      category: "artistry",
      status: "pending",
      dependencies: [tasks[0].id],
      estimatedTokens: 10000,
    });

    // Task 3: Register agent
    tasks.push({
      id: uuidv4(),
      type: "config",
      description: "Register agent in agent registry",
      targetFiles: ["src/agents/registry.ts", "src/orchestrator/types.ts"],
      assignedAgentType: "executor-low",
      category: "quick",
      status: "pending",
      dependencies: [tasks[1].id],
      estimatedTokens: 2000,
    });

    // Task 4: Add agent tests
    tasks.push({
      id: uuidv4(),
      type: "test",
      description: "Create integration tests for agent",
      targetFiles: [`src/__tests__/agents/${this.toKebabCase(featureAnalysis.specificFeature)}.test.ts`],
      assignedAgentType: "qa-tester",
      category: "writing",
      status: "pending",
      dependencies: [tasks[1].id],
      estimatedTokens: 6000,
    });

    return tasks;
  }

  /**
   * Generate tasks for configuration changes
   */
  generateConfigTasks(context: TaskGenerationContext): DevelopmentTask[] {
    const { featureAnalysis, moduleInfo } = context;
    const tasks: DevelopmentTask[] = [];

    // Determine config files affected
    const configFiles = this.identifyConfigFiles(featureAnalysis, moduleInfo);

    // Task 1: Update configuration
    tasks.push({
      id: uuidv4(),
      type: "config",
      description: `Update configuration: ${featureAnalysis.specificFeature}`,
      targetFiles: configFiles,
      assignedAgentType: "executor",
      category: "quick",
      status: "pending",
      dependencies: [],
      estimatedTokens: 3000,
      metadata: {
        configType: "settings",
        backupRequired: true,
      },
    });

    // Task 2: Validate configuration schema
    tasks.push({
      id: uuidv4(),
      type: "code",
      description: "Add configuration validation",
      targetFiles: configFiles.map(f => f.replace(/\.json$/, ".schema.ts")),
      assignedAgentType: "executor-low",
      category: "quick",
      status: "pending",
      dependencies: [tasks[0].id],
      estimatedTokens: 2000,
    });

    // Task 3: Update documentation
    tasks.push({
      id: uuidv4(),
      type: "code",
      description: "Document configuration changes",
      targetFiles: ["docs/configuration.md"],
      assignedAgentType: "writer",
      category: "writing",
      status: "pending",
      dependencies: [tasks[0].id],
      estimatedTokens: 2000,
    });

    return tasks;
  }

  /**
   * Generate tasks for new feature implementation
   */
  generateNewFeatureTasks(context: TaskGenerationContext): DevelopmentTask[] {
    const { featureAnalysis, moduleInfo } = context;
    const tasks: DevelopmentTask[] = [];

    // Task 1: Create service layer
    tasks.push({
      id: uuidv4(),
      type: "code",
      description: `Implement service: ${featureAnalysis.specificFeature}`,
      targetFiles: [`src/services/${moduleInfo.name}/${this.toKebabCase(featureAnalysis.specificFeature)}.service.ts`],
      assignedAgentType: "executor",
      category: "artistry",
      status: "pending",
      dependencies: [],
      estimatedTokens: 12000,
      metadata: {
        layer: "service",
        businessLogic: featureAnalysis.problemStatement,
      },
    });

    // Task 2: Create API endpoints
    tasks.push({
      id: uuidv4(),
      type: "code",
      description: "Create API endpoints",
      targetFiles: [`src/api/${this.toKebabCase(featureAnalysis.specificFeature)}.ts`],
      assignedAgentType: "executor",
      category: "artistry",
      status: "pending",
      dependencies: [tasks[0].id],
      estimatedTokens: 8000,
    });

    // Task 3: Add types and interfaces
    tasks.push({
      id: uuidv4(),
      type: "code",
      description: "Define TypeScript types",
      targetFiles: [`src/services/${moduleInfo.name}/types/${this.toKebabCase(featureAnalysis.specificFeature)}.types.ts`],
      assignedAgentType: "executor-low",
      category: "quick",
      status: "pending",
      dependencies: [],
      estimatedTokens: 4000,
    });

    // Task 4: Add database schema if needed
    if (this.requiresDatabase(featureAnalysis)) {
      tasks.push({
        id: uuidv4(),
        type: "code",
        description: "Update Prisma schema",
        targetFiles: ["prisma/schema.prisma"],
        assignedAgentType: "architect",
        category: "ultrabrain",
        status: "pending",
        dependencies: [tasks[2].id],
        estimatedTokens: 6000,
        metadata: {
          requiresMigration: true,
        },
      });
    }

    return tasks;
  }

  /**
   * Generate tasks for API extension
   */
  generateAPITasks(context: TaskGenerationContext): DevelopmentTask[] {
    const { featureAnalysis, moduleInfo } = context;
    const tasks: DevelopmentTask[] = [];

    // Task 1: Extend API routes
    tasks.push({
      id: uuidv4(),
      type: "code",
      description: `Add API endpoints: ${featureAnalysis.specificFeature}`,
      targetFiles: this.identifyAPIFiles(moduleInfo, featureAnalysis),
      assignedAgentType: "executor",
      category: "artistry",
      status: "pending",
      dependencies: [],
      estimatedTokens: 8000,
    });

    // Task 2: Add request validation
    tasks.push({
      id: uuidv4(),
      type: "code",
      description: "Add input validation schemas",
      targetFiles: [`src/validation/${this.toKebabCase(featureAnalysis.specificFeature)}.schema.ts`],
      assignedAgentType: "executor-low",
      category: "quick",
      status: "pending",
      dependencies: [tasks[0].id],
      estimatedTokens: 3000,
    });

    // Task 3: Update API documentation
    tasks.push({
      id: uuidv4(),
      type: "code",
      description: "Update API documentation",
      targetFiles: ["docs/api.md"],
      assignedAgentType: "writer",
      category: "writing",
      status: "pending",
      dependencies: [tasks[0].id],
      estimatedTokens: 4000,
    });

    return tasks;
  }

  /**
   * Generate generic tasks when type is unclear
   */
  generateGenericTasks(context: TaskGenerationContext): DevelopmentTask[] {
    const { featureAnalysis } = context;
    const tasks: DevelopmentTask[] = [];

    // Generic implementation task
    tasks.push({
      id: uuidv4(),
      type: "code",
      description: `Implement: ${featureAnalysis.specificFeature}`,
      targetFiles: ["TBD - determined during execution"],
      assignedAgentType: "architect",
      category: "ultrabrain",
      status: "pending",
      dependencies: [],
      estimatedTokens: 15000,
      metadata: {
        requiresPlanning: true,
        successCriteria: featureAnalysis.successCriteria,
      },
    });

    return tasks;
  }

  /**
   * Generate test tasks for all implementation tasks
   */
  generateTestTasks(
    context: TaskGenerationContext,
    implementationTasks: DevelopmentTask[]
  ): DevelopmentTask[] {
    const tasks: DevelopmentTask[] = [];

    // Find all code tasks that need tests
    const codeTasks = implementationTasks.filter(t => t.type === "code" || t.type === "skill");

    if (codeTasks.length > 0) {
      // Unit tests
      tasks.push({
        id: uuidv4(),
        type: "test",
        description: "Create unit tests for implementation",
        targetFiles: codeTasks.flatMap(t =>
          t.targetFiles.map(f => f.replace(/^src/, "src/__tests__").replace(/\.ts$/, ".test.ts"))
        ),
        assignedAgentType: "qa-tester",
        category: "writing",
        status: "pending",
        dependencies: codeTasks.map(t => t.id),
        estimatedTokens: 8000,
      });

      // Integration tests if multiple modules affected
      if (context.featureAnalysis.relatedModules.length > 1) {
        tasks.push({
          id: uuidv4(),
          type: "test",
          description: "Create integration tests",
          targetFiles: ["src/__tests__/integration/feature.test.ts"],
          assignedAgentType: "qa-tester-high",
          category: "ultrabrain",
          status: "pending",
          dependencies: codeTasks.map(t => t.id),
          estimatedTokens: 10000,
        });
      }
    }

    return tasks;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private classifyFeature(analysis: {
    coreIntent: string;
    specificFeature: string;
    affectedWorkflows: string[];
  }): string {
    const intent = analysis.coreIntent.toLowerCase();
    const feature = analysis.specificFeature.toLowerCase();

    if (intent.includes("skill") || feature.includes("skill")) {
      return "skill-enhancement";
    }
    if (intent.includes("agent") || feature.includes("agent")) {
      return "agent-capability";
    }
    if (intent.includes("config") || intent.includes("setting")) {
      return "config-change";
    }
    if (intent.includes("api") || intent.includes("endpoint")) {
      return "api-extension";
    }

    return "new-feature";
  }

  private toKebabCase(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  private identifyConfigFiles(
    analysis: { specificFeature: string; affectedWorkflows: string[] },
    moduleInfo: { name: string }
  ): string[] {
    const files: string[] = [];

    // Common config files
    if (analysis.affectedWorkflows.some(w => w.includes("agent"))) {
      files.push("src/agents/config.json");
    }
    if (analysis.affectedWorkflows.some(w => w.includes("skill"))) {
      files.push("src/skills/config.json");
    }

    // Module-specific config
    files.push(`src/services/${moduleInfo.name}/config.json`);

    return files;
  }

  private identifyAPIFiles(
    moduleInfo: { name: string; existingFiles: string[] },
    _analysis: { affectedWorkflows: string[] }
  ): string[] {
    const apiFiles = moduleInfo.existingFiles.filter(f => f.includes("src/api/"));

    if (apiFiles.length === 0) {
      // No existing API files, create new
      return [`src/api/${moduleInfo.name}.ts`];
    }

    // Extend existing API files
    return apiFiles;
  }

  private requiresDatabase(analysis: {
    problemStatement: string;
    affectedWorkflows: string[];
  }): boolean {
    const keywords = ["persist", "store", "save", "database", "record", "track"];
    const text = (analysis.problemStatement + " " + analysis.affectedWorkflows.join(" ")).toLowerCase();

    return keywords.some(keyword => text.includes(keyword));
  }

  private summarizeTaskTypes(tasks: DevelopmentTask[]): Record<DevelopmentTaskType, number> {
    const summary: Record<string, number> = {};

    for (const task of tasks) {
      summary[task.type] = (summary[task.type] || 0) + 1;
    }

    return summary as Record<DevelopmentTaskType, number>;
  }
}
