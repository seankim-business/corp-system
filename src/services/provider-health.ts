// @ts-nocheck
import { ProviderName } from "../providers/ai-provider";
import { decrypt } from "../utils/encryption";
import { logger } from "../utils/logger";
import { db as prisma } from "../db/client";

export interface HealthCheckResult {
  provider: ProviderName;
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  checkedAt: string;
}

interface ProviderHealthChecker {
  name: ProviderName;
  check: (credentials: { apiKey?: string; accessToken?: string }) => Promise<{
    healthy: boolean;
    latencyMs: number;
    error?: string;
  }>;
}

const HEALTH_CHECK_TIMEOUT = 10000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

const anthropicChecker: ProviderHealthChecker = {
  name: "anthropic",
  check: async (credentials) => {
    const start = Date.now();
    try {
      const response = await fetchWithTimeout(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": credentials.apiKey!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-3-5-haiku-20241022",
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
        },
        HEALTH_CHECK_TIMEOUT,
      );

      const latencyMs = Date.now() - start;

      if (response.ok || response.status === 400) {
        return { healthy: true, latencyMs };
      }

      if (response.status === 401) {
        return { healthy: false, latencyMs, error: "Invalid API key" };
      }

      if (response.status === 429) {
        return { healthy: true, latencyMs, error: "Rate limited but API key valid" };
      }

      return { healthy: false, latencyMs, error: `HTTP ${response.status}` };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { healthy: false, latencyMs, error: errorMessage };
    }
  },
};

const openaiChecker: ProviderHealthChecker = {
  name: "openai",
  check: async (credentials) => {
    const start = Date.now();
    try {
      const response = await fetchWithTimeout(
        "https://api.openai.com/v1/models",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${credentials.apiKey}`,
          },
        },
        HEALTH_CHECK_TIMEOUT,
      );

      const latencyMs = Date.now() - start;

      if (response.ok) {
        return { healthy: true, latencyMs };
      }

      if (response.status === 401) {
        return { healthy: false, latencyMs, error: "Invalid API key" };
      }

      if (response.status === 429) {
        return { healthy: true, latencyMs, error: "Rate limited but API key valid" };
      }

      return { healthy: false, latencyMs, error: `HTTP ${response.status}` };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { healthy: false, latencyMs, error: errorMessage };
    }
  },
};

const googleAiChecker: ProviderHealthChecker = {
  name: "google-ai",
  check: async (credentials) => {
    const start = Date.now();

    try {
      const url = credentials.accessToken
        ? "https://generativelanguage.googleapis.com/v1/models"
        : `https://generativelanguage.googleapis.com/v1/models?key=${credentials.apiKey}`;

      const headers: Record<string, string> = {};
      if (credentials.accessToken) {
        headers["Authorization"] = `Bearer ${credentials.accessToken}`;
      }

      const response = await fetchWithTimeout(
        url,
        { method: "GET", headers },
        HEALTH_CHECK_TIMEOUT,
      );

      const latencyMs = Date.now() - start;

      if (response.ok) {
        return { healthy: true, latencyMs };
      }

      if (response.status === 401 || response.status === 403) {
        return { healthy: false, latencyMs, error: "Invalid or expired token" };
      }

      return { healthy: false, latencyMs, error: `HTTP ${response.status}` };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { healthy: false, latencyMs, error: errorMessage };
    }
  },
};

const githubModelsChecker: ProviderHealthChecker = {
  name: "github-models",
  check: async (credentials) => {
    const start = Date.now();
    const token = credentials.accessToken || credentials.apiKey;

    try {
      const response = await fetchWithTimeout(
        "https://models.inference.ai.azure.com/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
          }),
        },
        HEALTH_CHECK_TIMEOUT,
      );

      const latencyMs = Date.now() - start;

      if (response.ok) {
        return { healthy: true, latencyMs };
      }

      if (response.status === 401) {
        return { healthy: false, latencyMs, error: "Invalid token" };
      }

      if (response.status === 429) {
        return { healthy: true, latencyMs, error: "Rate limited but token valid" };
      }

      return { healthy: false, latencyMs, error: `HTTP ${response.status}` };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { healthy: false, latencyMs, error: errorMessage };
    }
  },
};

const openrouterChecker: ProviderHealthChecker = {
  name: "openrouter",
  check: async (credentials) => {
    const start = Date.now();
    try {
      const response = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/models",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${credentials.apiKey}`,
          },
        },
        HEALTH_CHECK_TIMEOUT,
      );

      const latencyMs = Date.now() - start;

      if (response.ok) {
        return { healthy: true, latencyMs };
      }

      if (response.status === 401) {
        return { healthy: false, latencyMs, error: "Invalid API key" };
      }

      return { healthy: false, latencyMs, error: `HTTP ${response.status}` };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { healthy: false, latencyMs, error: errorMessage };
    }
  },
};

const PROVIDER_CHECKERS: Record<ProviderName, ProviderHealthChecker> = {
  anthropic: anthropicChecker,
  openai: openaiChecker,
  "google-ai": googleAiChecker,
  "github-models": githubModelsChecker,
  openrouter: openrouterChecker,
};

const SETTINGS_KEYS: Record<ProviderName, { accessToken?: string; apiKey?: string }> = {
  anthropic: { apiKey: "anthropicApiKey" },
  openai: { apiKey: "openaiApiKey" },
  "google-ai": { accessToken: "googleAiAccessToken", apiKey: "googleAiApiKey" },
  "github-models": { accessToken: "githubModelsAccessToken", apiKey: "githubModelsApiKey" },
  openrouter: { apiKey: "openrouterApiKey" },
};

export async function checkProviderHealth(
  organizationId: string,
  providerName: ProviderName,
): Promise<HealthCheckResult> {
  const checker = PROVIDER_CHECKERS[providerName];
  if (!checker) {
    return {
      provider: providerName,
      healthy: false,
      error: "Unknown provider",
      checkedAt: new Date().toISOString(),
    };
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!organization) {
    return {
      provider: providerName,
      healthy: false,
      error: "Organization not found",
      checkedAt: new Date().toISOString(),
    };
  }

  const settings = (organization.settings as Record<string, unknown>) || {};
  const keys = SETTINGS_KEYS[providerName];

  let credentials: { apiKey?: string; accessToken?: string } = {};

  if (keys.accessToken && settings[keys.accessToken]) {
    credentials.accessToken = decrypt(settings[keys.accessToken] as string);
  }
  if (keys.apiKey && settings[keys.apiKey]) {
    credentials.apiKey = decrypt(settings[keys.apiKey] as string);
  }

  if (!credentials.apiKey && !credentials.accessToken) {
    return {
      provider: providerName,
      healthy: false,
      error: "No credentials configured",
      checkedAt: new Date().toISOString(),
    };
  }

  logger.info("Running provider health check", { organizationId, provider: providerName });

  const result = await checker.check(credentials);

  logger.info("Provider health check completed", {
    organizationId,
    provider: providerName,
    healthy: result.healthy,
    latencyMs: result.latencyMs,
    error: result.error,
  });

  return {
    provider: providerName,
    healthy: result.healthy,
    latencyMs: result.latencyMs,
    error: result.error,
    checkedAt: new Date().toISOString(),
  };
}

export async function checkAllProvidersHealth(
  organizationId: string,
): Promise<HealthCheckResult[]> {
  const providerNames = Object.keys(PROVIDER_CHECKERS) as ProviderName[];
  const results = await Promise.all(
    providerNames.map((name) => checkProviderHealth(organizationId, name)),
  );
  return results;
}
