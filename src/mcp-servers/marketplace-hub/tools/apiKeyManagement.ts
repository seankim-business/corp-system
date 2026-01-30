/**
 * API Key Management Tools for Marketplace Hub
 *
 * Allows agents to manage API keys for external marketplace sources:
 * - Smithery: Premium MCP server access
 * - CivitAI: Higher rate limits, NSFW content
 * - LangChain Hub: Private prompts access
 */

import { db as prisma } from "../../../db/client";
import { encrypt, decrypt } from "../../../utils/encryption";
import { logger } from "../../../utils/logger";
import {
  ApiKeySource,
  ListApiKeysOutput,
  SetApiKeyInput,
  SetApiKeyOutput,
  DeleteApiKeyInput,
  DeleteApiKeyOutput,
} from "../types";

const VALID_SOURCES: ApiKeySource[] = ["smithery", "civitai", "langchain"];

function getFieldName(source: ApiKeySource): string {
  return `${source}ApiKey`;
}

function maskKey(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  return "••••" + (key.length > 8 ? key.slice(-4) : "••••");
}

/**
 * List all marketplace API keys for an organization
 */
export async function listApiKeysTool(
  organizationId: string,
): Promise<ListApiKeysOutput> {
  const settings = await prisma.organizationMarketplaceSettings.findUnique({
    where: { organizationId },
  });

  // Type assertion for new fields
  const settingsWithKeys = settings as typeof settings & {
    smitheryApiKey?: string | null;
    civitaiApiKey?: string | null;
    langchainApiKey?: string | null;
  };

  const keys: ListApiKeysOutput["keys"] = [];

  for (const source of VALID_SOURCES) {
    const fieldName = getFieldName(source);
    const encryptedKey = settingsWithKeys?.[fieldName as keyof typeof settingsWithKeys] as string | null | undefined;

    let decryptedKey: string | null = null;
    if (encryptedKey) {
      try {
        decryptedKey = decrypt(encryptedKey);
      } catch {
        // Key exists but couldn't be decrypted
      }
    }

    keys.push({
      source,
      configured: !!encryptedKey,
      maskedKey: maskKey(decryptedKey),
    });
  }

  logger.info("Listed marketplace API keys via MCP tool", {
    organizationId,
    configuredKeys: keys.filter(k => k.configured).map(k => k.source),
  });

  return { keys };
}

/**
 * Set an API key for a marketplace source
 */
export async function setApiKeyTool(
  input: SetApiKeyInput,
  organizationId: string,
): Promise<SetApiKeyOutput> {
  const { source, apiKey } = input;

  if (!VALID_SOURCES.includes(source)) {
    throw new Error(`Invalid source: ${source}. Valid sources: ${VALID_SOURCES.join(", ")}`);
  }

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("API key cannot be empty");
  }

  const fieldName = getFieldName(source);
  const encryptedKey = encrypt(apiKey.trim());

  await prisma.organizationMarketplaceSettings.upsert({
    where: { organizationId },
    create: {
      organizationId,
      [fieldName]: encryptedKey,
    } as any,
    update: {
      [fieldName]: encryptedKey,
    } as any,
  });

  logger.info("Set marketplace API key via MCP tool", {
    organizationId,
    source,
  });

  return {
    success: true,
    message: `${source.charAt(0).toUpperCase() + source.slice(1)} API key has been configured successfully.`,
  };
}

/**
 * Delete an API key for a marketplace source
 */
export async function deleteApiKeyTool(
  input: DeleteApiKeyInput,
  organizationId: string,
): Promise<DeleteApiKeyOutput> {
  const { source } = input;

  if (!VALID_SOURCES.includes(source)) {
    throw new Error(`Invalid source: ${source}. Valid sources: ${VALID_SOURCES.join(", ")}`);
  }

  const fieldName = getFieldName(source);

  try {
    await prisma.organizationMarketplaceSettings.update({
      where: { organizationId },
      data: {
        [fieldName]: null,
      } as any,
    });
  } catch (error: any) {
    if (error.code === "P2025") {
      // Record not found - nothing to delete
      return {
        success: true,
        message: `No ${source} API key was configured.`,
      };
    }
    throw error;
  }

  logger.info("Deleted marketplace API key via MCP tool", {
    organizationId,
    source,
  });

  return {
    success: true,
    message: `${source.charAt(0).toUpperCase() + source.slice(1)} API key has been removed.`,
  };
}
