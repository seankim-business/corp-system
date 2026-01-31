/**
 * OMC Bridge Configuration Loader
 *
 * Loads configuration from YAML file with fallback to environment variables.
 * Validates configuration using Zod schemas.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { OmcBridgeConfig, OmcBridgeConfigSchema } from "./types";
import { logger } from "../../utils/logger";

const CONFIG_FILE_PATH = path.resolve(process.cwd(), "config/omc-integration.yaml");

/**
 * Environment variable mapping for configuration
 */
const ENV_CONFIG_MAP: Record<string, keyof OmcBridgeConfig> = {
  OMC_RUNTIME_URL: "omcRuntimeUrl",
  OMC_PROTOCOL: "protocol",
  OMC_API_KEY: "apiKey",
  OMC_CONNECTION_TIMEOUT_MS: "connectionTimeoutMs",
  OMC_REQUEST_TIMEOUT_MS: "requestTimeoutMs",
  OMC_HEALTH_CHECK_INTERVAL_MS: "healthCheckIntervalMs",
  OMC_MAX_RETRIES: "maxRetries",
  OMC_RETRY_DELAY_MS: "retryDelayMs",
  OMC_MAX_CONCURRENT_CALLS: "maxConcurrentCalls",
  OMC_RATE_LIMIT_PER_MINUTE: "rateLimitPerMinute",
  OMC_LOG_LEVEL: "logLevel",
  OMC_LOG_TOOL_CALLS: "logToolCalls",
};

/**
 * Parse environment variables into partial config
 */
function loadEnvConfig(): Partial<OmcBridgeConfig> {
  const config: Record<string, unknown> = {};

  for (const [envVar, configKey] of Object.entries(ENV_CONFIG_MAP)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      // Convert string values to appropriate types
      if (configKey.endsWith("Ms") || configKey.endsWith("Minute") || configKey === "maxRetries") {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue)) {
          config[configKey] = numValue;
        }
      } else if (configKey === "logToolCalls") {
        config[configKey] = value.toLowerCase() === "true";
      } else {
        config[configKey] = value;
      }
    }
  }

  // Handle array environment variables
  if (process.env.OMC_ENABLED_TOOLS) {
    config.enabledTools = process.env.OMC_ENABLED_TOOLS.split(",").map((t) => t.trim());
  }

  if (process.env.OMC_DISABLED_TOOLS) {
    config.disabledTools = process.env.OMC_DISABLED_TOOLS.split(",").map((t) => t.trim());
  }

  return config as Partial<OmcBridgeConfig>;
}

/**
 * Load configuration from YAML file
 */
function loadYamlConfig(filePath: string): Partial<OmcBridgeConfig> {
  try {
    if (!fs.existsSync(filePath)) {
      logger.debug("OMC Bridge config file not found, using defaults and env vars", {
        path: filePath,
      });
      return {};
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const parsed = yaml.load(fileContent);

    if (!parsed || typeof parsed !== "object") {
      logger.warn("OMC Bridge config file is empty or invalid", { path: filePath });
      return {};
    }

    // Handle nested 'omc_bridge' key in YAML
    const rawConfig = (parsed as Record<string, unknown>).omc_bridge ?? parsed;

    return rawConfig as Partial<OmcBridgeConfig>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to load OMC Bridge config file", { path: filePath, error: message });
    return {};
  }
}

/**
 * Merge configurations with priority: env > yaml > defaults
 */
function mergeConfigs(
  yamlConfig: Partial<OmcBridgeConfig>,
  envConfig: Partial<OmcBridgeConfig>,
): Partial<OmcBridgeConfig> {
  return {
    ...yamlConfig,
    ...envConfig,
  };
}

/**
 * Cached configuration instance
 */
let cachedConfig: OmcBridgeConfig | null = null;

/**
 * Load and validate OMC Bridge configuration
 *
 * Configuration is loaded from:
 * 1. Default values defined in schema
 * 2. YAML config file (config/omc-integration.yaml)
 * 3. Environment variables (highest priority)
 *
 * @returns Validated OMC Bridge configuration
 */
export function loadOmcBridgeConfig(): OmcBridgeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const yamlConfig = loadYamlConfig(CONFIG_FILE_PATH);
  const envConfig = loadEnvConfig();
  const mergedConfig = mergeConfigs(yamlConfig, envConfig);

  const result = OmcBridgeConfigSchema.safeParse(mergedConfig);

  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    logger.error("Invalid OMC Bridge configuration", { errors });
    throw new Error(`Invalid OMC Bridge configuration: ${errors}`);
  }

  cachedConfig = result.data;

  logger.info("OMC Bridge configuration loaded", {
    omcRuntimeUrl: cachedConfig.omcRuntimeUrl,
    protocol: cachedConfig.protocol,
    maxConcurrentCalls: cachedConfig.maxConcurrentCalls,
    logLevel: cachedConfig.logLevel,
  });

  return cachedConfig;
}

/**
 * Reload configuration (clears cache)
 */
export function reloadOmcBridgeConfig(): OmcBridgeConfig {
  cachedConfig = null;
  return loadOmcBridgeConfig();
}

/**
 * Get configuration without throwing on validation errors
 * Returns defaults if configuration is invalid
 */
export function getOmcBridgeConfigSafe(): OmcBridgeConfig {
  try {
    return loadOmcBridgeConfig();
  } catch {
    logger.warn("Using default OMC Bridge configuration due to load failure");
    return OmcBridgeConfigSchema.parse({});
  }
}

/**
 * Check if a tool is enabled based on configuration
 */
export function isToolEnabled(toolName: string, config: OmcBridgeConfig): boolean {
  // If disabled tools list exists and includes this tool, it's disabled
  if (config.disabledTools?.includes(toolName)) {
    return false;
  }

  // If enabled tools list exists, tool must be in it
  if (config.enabledTools && config.enabledTools.length > 0) {
    return config.enabledTools.includes(toolName);
  }

  // By default, all tools are enabled
  return true;
}

/**
 * Get the effective timeout for a tool call
 */
export function getEffectiveTimeout(
  toolDefaultMs: number,
  requestOverrideMs: number | undefined,
  config: OmcBridgeConfig,
): number {
  if (requestOverrideMs !== undefined && requestOverrideMs > 0) {
    return Math.min(requestOverrideMs, config.requestTimeoutMs * 2);
  }
  return Math.min(toolDefaultMs, config.requestTimeoutMs);
}
