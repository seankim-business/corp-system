import { createOpencode } from "@opencode-ai/sdk";
import type { DelegateTaskRequest } from "./types";

let opencodeInstance: Awaited<ReturnType<typeof createOpencode>> | null = null;

export async function getOpencodeClient() {
  if (!opencodeInstance) {
    console.log("[opencode-client] Initializing OpenCode client with OhMyOpenCode plugin");

    opencodeInstance = await createOpencode({
      port: 0,
      config: {
        plugin: ["oh-my-opencode", "./.opencode/plugins/nubabel-bridge.ts"],
        model: "anthropic/claude-sonnet-4-5",
      },
    });

    console.log("[opencode-client] OpenCode client initialized", {
      url: opencodeInstance.server.url,
    });
  }

  return opencodeInstance;
}

export async function createOpencodeSession(request: DelegateTaskRequest) {
  const { client } = await getOpencodeClient();

  console.log("[opencode-client] Creating OpenCode session", {
    sessionId: request.session_id,
    category: request.category,
    skills: request.load_skills,
  });

  const session = await client.session.create({
    body: {
      parentID: undefined,
      title: `Nubabel task ${request.session_id}`,
    },
  });

  if (!session.data) {
    throw new Error("Failed to create OpenCode session");
  }

  console.log("[opencode-client] OpenCode session created", {
    opencodeSessionId: session.data.id,
    nubabelSessionId: request.session_id,
  });

  (global as any).nubabelContext = (global as any).nubabelContext || new Map();
  (global as any).nubabelContext.set(session.data.id, {
    sessionId: request.session_id,
    organizationId: request.organizationId,
    userId: request.userId,
    category: request.category,
    skills: request.load_skills,
    callbacks: request.callbacks,
  });

  return session.data.id;
}

export async function sendPromptToSession(opencodeSessionId: string, prompt: string) {
  const { client } = await getOpencodeClient();

  console.log("[opencode-client] Sending prompt to OpenCode session", {
    opencodeSessionId,
    promptLength: prompt.length,
  });

  await client.session.prompt({
    path: { id: opencodeSessionId },
    body: {
      parts: [{ type: "text", text: prompt }],
    },
  });
}

export async function waitForSessionCompletion(
  opencodeSessionId: string,
  timeoutMs: number = 120000,
): Promise<string> {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Session completion timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const checkInterval = setInterval(async () => {
      try {
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          reject(new Error(`Session completion timeout after ${timeoutMs}ms`));
          return;
        }

        const context = (global as any).nubabelContext?.get(opencodeSessionId);
        if (context?.completed) {
          clearInterval(checkInterval);
          clearTimeout(timeout);

          console.log("[opencode-client] Session completed", {
            opencodeSessionId,
            completedAt: context.completedAt,
          });

          resolve(context.output || "Task completed successfully");
        }
      } catch (error) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        reject(error);
      }
    }, 1000);
  });
}
