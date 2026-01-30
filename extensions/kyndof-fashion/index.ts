/**
 * Kyndof Fashion Industry Extension
 *
 * Main entry point for the fashion industry extension.
 * Provides agents, skills, and workflows for fashion design,
 * production management, and quality control.
 */

import { Extension, ExtensionContext } from "../../src/extensions/types";
import { logger } from "../../src/utils/logger";
import { onInstall } from "./hooks/onInstall";
import { onUninstall } from "./hooks/onUninstall";
import { onUpdate } from "./hooks/onUpdate";
import {
  registerTools as registerCLO3DTools,
  executeCLO3DTool,
} from "./mcp/clo3d";

const EXTENSION_ID = "kyndof-fashion";
const VERSION = "1.0.0";

/**
 * Extension initialization
 */
export async function initialize(context: ExtensionContext): Promise<void> {
  logger.info("Initializing Kyndof Fashion Extension", {
    extensionId: EXTENSION_ID,
    version: VERSION,
    organizationId: context.organizationId,
  });

  try {
    // Register MCP tools
    const clo3dTools = registerCLO3DTools();
    logger.info("Registered CLO3D MCP tools", {
      tools: clo3dTools,
      count: clo3dTools.length,
    });

    // Register tool executor
    context.registerToolExecutor("clo3d", executeCLO3DTool);

    // Load agents
    const agents = [
      "fashion-designer",
      "production-manager",
      "quality-inspector",
      "collection-manager",
    ];

    logger.info("Loading fashion industry agents", {
      agents,
      count: agents.length,
    });

    // Load skills
    const skills = [
      "garment-design",
      "pattern-making",
      "quality-check",
      "production-planning",
      "material-sourcing",
    ];

    logger.info("Loading fashion industry skills", {
      skills,
      count: skills.length,
    });

    // Load workflows
    const workflows = [
      "collection-production",
      "sample-review",
      "quality-inspection",
    ];

    logger.info("Loading fashion industry workflows", {
      workflows,
      count: workflows.length,
    });

    logger.info("Kyndof Fashion Extension initialized successfully", {
      extensionId: EXTENSION_ID,
      version: VERSION,
    });
  } catch (error) {
    logger.error("Failed to initialize Kyndof Fashion Extension", {
      error: error instanceof Error ? error.message : String(error),
      extensionId: EXTENSION_ID,
    });
    throw error;
  }
}

/**
 * Extension cleanup
 */
export async function cleanup(context: ExtensionContext): Promise<void> {
  logger.info("Cleaning up Kyndof Fashion Extension", {
    extensionId: EXTENSION_ID,
    organizationId: context.organizationId,
  });

  // Cleanup resources, close connections, etc.
  // This is called when the extension is disabled or the application shuts down
}

/**
 * Extension metadata
 */
export const extension: Extension = {
  id: EXTENSION_ID,
  name: "Kyndof Fashion Industry Extension",
  version: VERSION,
  description:
    "패션 산업을 위한 Nubabel 확장. 의류 디자인, 생산 관리, 품질 검사 워크플로우를 포함합니다.",
  author: {
    name: "Kyndof Corp",
    email: "dev@kyndof.com",
    url: "https://kyndof.com",
  },
  category: "industry",
  tags: ["fashion", "manufacturing", "design", "production", "clo3d", "garment"],

  // Lifecycle hooks
  hooks: {
    onInstall,
    onUninstall,
    onUpdate,
    onInitialize: initialize,
    onCleanup: cleanup,
  },

  // Required Nubabel version
  nubabelVersion: ">=2.0.0",

  // Required permissions
  permissions: [
    "read:notion",
    "write:notion",
    "read:drive",
    "write:drive",
    "send:slack",
    "execute:workflows",
    "manage:agents",
  ],

  // Configuration schema
  configSchema: {
    type: "object",
    properties: {
      clo3dApiKey: {
        type: "string",
        description: "CLO3D API 키",
        secret: true,
      },
      clo3dWorkspace: {
        type: "string",
        description: "CLO3D 워크스페이스 ID",
      },
      clo3dApiUrl: {
        type: "string",
        description: "CLO3D API 엔드포인트 URL",
        default: "https://api.clo3d.com/v1",
      },
      productionNotionDb: {
        type: "string",
        description: "생산 관리 Notion 데이터베이스 ID",
      },
      qualityNotionDb: {
        type: "string",
        description: "품질 검사 Notion 데이터베이스 ID",
      },
      collectionNotionDb: {
        type: "string",
        description: "컬렉션 관리 Notion 데이터베이스 ID",
      },
      slackChannel: {
        type: "string",
        description: "알림을 받을 Slack 채널",
        default: "#fashion-alerts",
      },
    },
    required: ["clo3dApiKey", "clo3dWorkspace"],
  },
};

// Default export
export default extension;
