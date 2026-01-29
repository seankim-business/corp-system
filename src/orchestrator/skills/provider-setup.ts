import { db as prisma } from "../../db/client";
import { PROVIDER_CONFIGS, ProviderStatus } from "../../api/providers";
import { ProviderName } from "../../providers/ai-provider";
import { logger } from "../../utils/logger";

export interface ProviderSetupContext {
  organizationId: string;
  userRequest: string;
}

export interface ProviderSetupResult {
  type: "status" | "oauth_redirect" | "api_key_instructions" | "disconnect_confirm" | "error";
  message: string;
  providers?: ProviderStatus[];
  oauthUrl?: string;
  providerName?: ProviderName;
}

const PROVIDER_ALIASES: Record<string, ProviderName> = {
  claude: "anthropic",
  anthropic: "anthropic",
  gpt: "openai",
  "gpt-4": "openai",
  "gpt-4o": "openai",
  openai: "openai",
  chatgpt: "openai",
  gemini: "google-ai",
  "google ai": "google-ai",
  google: "google-ai",
  "github models": "github-models",
  github: "github-models",
  "gh models": "github-models",
  openrouter: "openrouter",
};

function detectProvider(request: string): ProviderName | null {
  const lowerRequest = request.toLowerCase();

  for (const [alias, providerName] of Object.entries(PROVIDER_ALIASES)) {
    if (lowerRequest.includes(alias)) {
      return providerName;
    }
  }

  return null;
}

function detectIntent(
  request: string,
): "connect" | "disconnect" | "status" | "list" | "help" | null {
  const lowerRequest = request.toLowerCase();

  if (
    lowerRequest.includes("disconnect") ||
    lowerRequest.includes("remove") ||
    lowerRequest.includes("연결 해제") ||
    lowerRequest.includes("삭제")
  ) {
    return "disconnect";
  }

  if (
    lowerRequest.includes("connect") ||
    lowerRequest.includes("setup") ||
    lowerRequest.includes("연결") ||
    lowerRequest.includes("설정") ||
    lowerRequest.includes("configure") ||
    lowerRequest.includes("add") ||
    lowerRequest.includes("enable")
  ) {
    return "connect";
  }

  if (
    lowerRequest.includes("status") ||
    lowerRequest.includes("check") ||
    lowerRequest.includes("상태") ||
    lowerRequest.includes("확인")
  ) {
    return "status";
  }

  if (
    lowerRequest.includes("list") ||
    lowerRequest.includes("show") ||
    lowerRequest.includes("providers") ||
    lowerRequest.includes("목록") ||
    lowerRequest.includes("보여")
  ) {
    return "list";
  }

  if (lowerRequest.includes("help") || lowerRequest.includes("도움")) {
    return "help";
  }

  return null;
}

async function getProviderStatuses(organizationId: string): Promise<ProviderStatus[]> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!organization) {
    return [];
  }

  const settings = (organization.settings as Record<string, unknown>) || {};

  return PROVIDER_CONFIGS.map((config) => {
    const hasOAuthToken = config.settingsKey.accessToken
      ? !!settings[config.settingsKey.accessToken]
      : false;
    const hasApiKey = config.settingsKey.apiKey ? !!settings[config.settingsKey.apiKey] : false;

    const connected = hasOAuthToken || hasApiKey;
    const method = hasOAuthToken ? "oauth" : hasApiKey ? "api_key" : null;

    return {
      name: config.name,
      displayName: config.displayName,
      connected,
      method,
      supportsOAuth: config.supportsOAuth,
      oauthInstallPath: config.supportsOAuth ? config.oauthInstallPath : undefined,
      userIdentifier: config.settingsKey.userIdentifier
        ? (settings[config.settingsKey.userIdentifier] as string | undefined)
        : undefined,
      connectedAt: config.settingsKey.connectedAt
        ? (settings[config.settingsKey.connectedAt] as string | undefined)
        : undefined,
    };
  });
}

export async function handleProviderSetup(
  context: ProviderSetupContext,
): Promise<ProviderSetupResult> {
  const { organizationId, userRequest } = context;

  try {
    const intent = detectIntent(userRequest);
    const targetProvider = detectProvider(userRequest);

    logger.info("Provider setup skill invoked", {
      organizationId,
      intent,
      targetProvider,
    });

    if (intent === "help" || (!intent && !targetProvider)) {
      const providers = await getProviderStatuses(organizationId);
      const connectedCount = providers.filter((p) => p.connected).length;

      return {
        type: "status",
        message: `**AI Provider Setup**

You have ${connectedCount}/${providers.length} providers connected.

**Available commands:**
- "Connect [provider name]" - Set up a new provider
- "Disconnect [provider name]" - Remove a provider connection
- "Show providers" - List all providers and their status

**Supported providers:**
${providers.map((p) => `- ${p.displayName}${p.connected ? " ✓" : ""}`).join("\n")}

For OAuth providers (Google AI, GitHub Models), I'll provide a link to authorize.
For API key providers (Anthropic, OpenAI, OpenRouter), you'll need to add the key in Settings.`,
        providers,
      };
    }

    if (intent === "list" || intent === "status") {
      const providers = await getProviderStatuses(organizationId);

      const statusLines = providers.map((p) => {
        const status = p.connected ? `✓ Connected (${p.method})` : "✗ Not connected";
        const user = p.userIdentifier ? ` - ${p.userIdentifier}` : "";
        return `- **${p.displayName}**: ${status}${user}`;
      });

      return {
        type: "status",
        message: `**AI Provider Status**\n\n${statusLines.join("\n")}`,
        providers,
      };
    }

    if (intent === "connect" && targetProvider) {
      const config = PROVIDER_CONFIGS.find((p) => p.name === targetProvider);
      if (!config) {
        return {
          type: "error",
          message: `Provider "${targetProvider}" not found.`,
        };
      }

      const providers = await getProviderStatuses(organizationId);
      const providerStatus = providers.find((p) => p.name === targetProvider);

      if (providerStatus?.connected) {
        return {
          type: "status",
          message: `**${config.displayName}** is already connected${providerStatus.userIdentifier ? ` as ${providerStatus.userIdentifier}` : ""}.

Would you like to disconnect it and reconnect?`,
          providers: [providerStatus],
        };
      }

      if (config.supportsOAuth && config.oauthInstallPath) {
        const baseUrl = process.env.BASE_URL || "https://auth.nubabel.com";
        const oauthUrl = `${baseUrl}${config.oauthInstallPath}`;

        return {
          type: "oauth_redirect",
          message: `To connect **${config.displayName}**, please authorize access:

[Click here to connect ${config.displayName}](${oauthUrl})

After authorization, you'll be redirected back to the Settings page.`,
          oauthUrl,
          providerName: targetProvider,
        };
      }

      return {
        type: "api_key_instructions",
        message: `To connect **${config.displayName}**, you need to add an API key:

1. Go to **Settings** → **AI Providers**
2. Find **${config.displayName}**
3. Enter your API key and save

Need an API key? Visit the provider's website to generate one.`,
        providerName: targetProvider,
      };
    }

    if (intent === "disconnect" && targetProvider) {
      const config = PROVIDER_CONFIGS.find((p) => p.name === targetProvider);
      if (!config) {
        return {
          type: "error",
          message: `Provider "${targetProvider}" not found.`,
        };
      }

      const providers = await getProviderStatuses(organizationId);
      const providerStatus = providers.find((p) => p.name === targetProvider);

      if (!providerStatus?.connected) {
        return {
          type: "status",
          message: `**${config.displayName}** is not currently connected.`,
          providers: [providerStatus!],
        };
      }

      return {
        type: "disconnect_confirm",
        message: `To disconnect **${config.displayName}**, please go to:

**Settings** → **AI Providers** → **${config.displayName}** → **Disconnect**

Or use the API endpoint: \`DELETE /api/${config.name === "google-ai" ? "google-ai" : config.name === "github-models" ? "github-models" : "providers/" + config.name}/oauth/disconnect\``,
        providerName: targetProvider,
      };
    }

    const providers = await getProviderStatuses(organizationId);
    return {
      type: "status",
      message: `I'm not sure what you'd like to do. Here are your current AI providers:

${providers.map((p) => `- **${p.displayName}**: ${p.connected ? "Connected" : "Not connected"}`).join("\n")}

Try saying "connect [provider]", "show providers", or "help" for more options.`,
      providers,
    };
  } catch (error) {
    logger.error("Provider setup skill error", {
      error: error instanceof Error ? error.message : String(error),
      organizationId,
    });

    return {
      type: "error",
      message:
        "Sorry, I encountered an error while processing your request. Please try again or go to Settings to manage providers directly.",
    };
  }
}

export function isProviderSetupRequest(userRequest: string): boolean {
  const lowerRequest = userRequest.toLowerCase();
  const keywords = [
    "connect",
    "setup",
    "provider",
    "api key",
    "oauth",
    "anthropic",
    "openai",
    "google ai",
    "gemini",
    "github models",
    "openrouter",
    "claude",
    "gpt",
    "연결",
    "설정",
    "프로바이더",
  ];

  return keywords.some((keyword) => lowerRequest.includes(keyword));
}
