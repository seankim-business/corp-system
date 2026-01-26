import { logger } from "../utils/logger";

export interface DelegateTaskParams {
  category: string;
  load_skills: string[];
  prompt: string;
  session_id: string;
  context?: Record<string, unknown>;
}

export interface DelegateTaskResult {
  output: string;
  status: "success" | "failed";
  metadata: {
    model: string;
    duration?: number;
    error?: string;
  };
}

const OPENCODE_SIDECAR_URL = process.env.OPENCODE_SIDECAR_URL;
const OPENCODE_SIDECAR_TIMEOUT = parseInt(process.env.OPENCODE_SIDECAR_TIMEOUT || "120000", 10);

export async function delegateTask(params: DelegateTaskParams): Promise<DelegateTaskResult> {
  if (!OPENCODE_SIDECAR_URL) {
    logger.warn("OPENCODE_SIDECAR_URL not configured, skipping delegation");
    return {
      output: `[Stub] Task delegated with category: ${params.category}, skills: ${params.load_skills.join(", ")}. Configure OPENCODE_SIDECAR_URL to enable real orchestration.`,
      status: "failed",
      metadata: {
        model: "stub",
        error: "OPENCODE_SIDECAR_URL not configured",
      },
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENCODE_SIDECAR_TIMEOUT);

  try {
    logger.info("Delegating task to OpenCode sidecar", {
      url: OPENCODE_SIDECAR_URL,
      category: params.category,
      skills: params.load_skills,
      sessionId: params.session_id,
    });

    const response = await fetch(`${OPENCODE_SIDECAR_URL}/delegate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category: params.category,
        load_skills: params.load_skills,
        prompt: params.prompt,
        session_id: params.session_id,
        context: params.context,
      }),
      signal: controller.signal,
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
      metadata?: { model?: string; duration?: number };
    };

    logger.info("Task delegation completed", {
      status: result.status,
      model: result.metadata?.model,
    });

    return {
      output: result.output || "",
      status: result.status || "success",
      metadata: {
        model: result.metadata?.model || "unknown",
        duration: result.metadata?.duration,
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
