import { logger } from "../utils/logger";
import { getCircuitBreaker } from "../utils/circuit-breaker";
import { executeWithAI } from "./ai-executor";
import { Category } from "./types";
import { getOpencodeSessionId, createSessionMapping } from "./session-mapping";
import { getOrganizationApiKey } from "../api/organization-settings";

export interface DelegateTaskParams {
  category: string;
  load_skills: string[];
  prompt: string;
  session_id: string;
  organizationId?: string;
  userId?: string;
  context?: Record<string, unknown>;
}

export interface DelegateTaskResult {
  output: string;
  status: "success" | "failed";
  metadata: {
    model: string;
    duration?: number;
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    error?: string;
    opencodeSessionId?: string;
  };
}

const OPENCODE_SIDECAR_URL = process.env.OPENCODE_SIDECAR_URL;
const OPENCODE_SIDECAR_TIMEOUT = parseInt(process.env.OPENCODE_SIDECAR_TIMEOUT || "120000", 10);
const USE_BUILTIN_AI = process.env.USE_BUILTIN_AI !== "false";

const sidecarBreaker = getCircuitBreaker("opencode-sidecar", {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: Math.min(OPENCODE_SIDECAR_TIMEOUT, 30_000),
  resetTimeout: 60_000,
});

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function hasApiKeyConfigured(organizationId?: string): Promise<boolean> {
  if (process.env.ANTHROPIC_API_KEY) {
    return true;
  }
  if (organizationId) {
    const dbKey = await getOrganizationApiKey(organizationId, "anthropicApiKey");
    return !!dbKey;
  }
  return false;
}

export async function delegateTask(params: DelegateTaskParams): Promise<DelegateTaskResult> {
  const hasApiKey = await hasApiKeyConfigured(params.organizationId);

  if (!OPENCODE_SIDECAR_URL && USE_BUILTIN_AI && hasApiKey) {
    logger.info("Using built-in AI executor", { category: params.category });
    const result = await executeWithAI({
      category: params.category as Category,
      skills: params.load_skills,
      prompt: params.prompt,
      sessionId: params.session_id,
      organizationId: params.organizationId || "system",
      userId: params.userId || "system",
      context: params.context,
    });

    return {
      output: result.output,
      status: result.status,
      metadata: {
        model: result.metadata.model,
        duration: result.metadata.duration,
        inputTokens: result.metadata.inputTokens,
        outputTokens: result.metadata.outputTokens,
        cost: result.metadata.cost,
        error: result.metadata.error,
      },
    };
  }

  if (!OPENCODE_SIDECAR_URL) {
    logger.warn("No AI execution method configured");
    return {
      output: `[Stub] Task delegated with category: ${params.category}, skills: ${params.load_skills.join(", ")}. Set ANTHROPIC_API_KEY or OPENCODE_SIDECAR_URL.`,
      status: "failed",
      metadata: {
        model: "stub",
        error: "No AI execution method configured",
      },
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENCODE_SIDECAR_TIMEOUT);

  try {
    const existingOpencodeSession = await getOpencodeSessionId(params.session_id);
    const NUBABEL_URL = process.env.NUBABEL_URL || "http://localhost:3000";

    let endpoint: string;
    let body: any;

    if (existingOpencodeSession) {
      logger.info("Resuming existing OpenCode session", {
        sessionId: params.session_id,
        opencodeSessionId: existingOpencodeSession,
      });

      endpoint = `${OPENCODE_SIDECAR_URL}/sessions/${existingOpencodeSession}/prompt`;
      body = { prompt: params.prompt };
    } else {
      logger.info("Creating new OpenCode session", {
        url: OPENCODE_SIDECAR_URL,
        category: params.category,
        skills: params.load_skills,
        sessionId: params.session_id,
      });

      endpoint = `${OPENCODE_SIDECAR_URL}/delegate`;
      body = {
        category: params.category,
        load_skills: params.load_skills,
        prompt: params.prompt,
        session_id: params.session_id,
        organizationId: params.organizationId,
        userId: params.userId,
        context: params.context,
        callbacks: {
          sessionUpdate: `${NUBABEL_URL}/api/sidecar/sessions/${params.session_id}/update`,
          mcpInvoke: `${NUBABEL_URL}/api/sidecar/mcp/invoke`,
          progress: `${NUBABEL_URL}/api/sidecar/sessions/${params.session_id}/progress`,
        },
      };
    }

    const response = await sidecarBreaker.execute(async () => {
      let attempt = 0;
      for (;;) {
        attempt++;
        const r = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (r.ok || attempt >= 3 || ![429, 502, 503, 504].includes(r.status)) {
          return r;
        }

        const backoff = Math.min(1000 * 2 ** (attempt - 1), 5000);
        await sleep(backoff);
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("OpenCode sidecar returned error", {
        status: response.status,
        error: errorText,
      });
      return {
        output: `Error from orchestration service: ${response.status} - ${errorText}`,
        status: "failed",
        metadata: {
          model: "unknown",
          error: errorText,
        },
      };
    }

    const result = (await response.json()) as {
      output?: string;
      status?: "success" | "failed";
      metadata?: {
        model?: string;
        duration?: number;
        opencodeSessionId?: string;
        nubabelSessionId?: string;
      };
    };

    if (!existingOpencodeSession && result.metadata?.opencodeSessionId) {
      await createSessionMapping(params.session_id, result.metadata.opencodeSessionId);
    }

    logger.info("Task delegation completed", {
      status: result.status,
      model: result.metadata?.model,
      opencodeSessionId: result.metadata?.opencodeSessionId,
    });

    return {
      output: result.output || "",
      status: result.status || "success",
      metadata: {
        model: result.metadata?.model || "unknown",
        duration: result.metadata?.duration,
        opencodeSessionId: result.metadata?.opencodeSessionId,
      },
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isAborted = error instanceof Error && error.name === "AbortError";

    if (isAborted) {
      logger.error("OpenCode sidecar request timed out", {
        timeout: OPENCODE_SIDECAR_TIMEOUT,
      });
      return {
        output: `Request to orchestration service timed out after ${OPENCODE_SIDECAR_TIMEOUT}ms`,
        status: "failed",
        metadata: {
          model: "unknown",
          error: "timeout",
        },
      };
    }

    logger.error("Failed to delegate task to OpenCode sidecar", {
      error: errorMessage,
    });

    return {
      output: `Failed to connect to orchestration service: ${errorMessage}`,
      status: "failed",
      metadata: {
        model: "unknown",
        error: errorMessage,
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
