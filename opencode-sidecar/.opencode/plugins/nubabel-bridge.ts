import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { z } from "zod";

export default (async (input: PluginInput) => {
  console.log("[nubabel-bridge] Plugin loaded", {
    directory: input.directory,
    worktree: input.worktree,
  });

  return {
    event: async ({ event }) => {
      if (event.type === "message.updated") {
        const message = event.properties.info;

        if (!message.sessionID) return;

        const nubabelContext = (global as any).nubabelContext?.get(message.sessionID);
        if (!nubabelContext || !nubabelContext.callbacks) {
          return;
        }

        console.log("[nubabel-bridge] Message updated", {
          sessionID: message.sessionID,
          role: message.role,
          completed: message.role === "assistant" && message.time.completed,
        });

        try {
          if (message.role === "assistant" && message.time.completed) {
            console.log(
              "[nubabel-bridge] Assistant message completed, calling completion callback",
            );

            await fetch(nubabelContext.callbacks.sessionUpdate, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                state: "completed",
                metadata: {
                  opencodeSessionId: message.sessionID,
                  completedAt: new Date().toISOString(),
                },
              }),
            });

            const context = (global as any).nubabelContext?.get(message.sessionID);
            if (context) {
              context.completed = true;
              context.completedAt = new Date().toISOString();
            }
          }

          await fetch(nubabelContext.callbacks.progress, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              progress: {
                type: "message_updated",
                role: message.role,
                completed: message.role === "assistant" && !!message.time.completed,
                timestamp: new Date().toISOString(),
              },
            }),
          });
        } catch (error) {
          console.error("[nubabel-bridge] Callback failed", { error });
        }
      }
    },

    tool: {
      nubabel_mcp_invoke: tool({
        description: "Invoke Nubabel MCP tool with organization credentials",
        args: {
          provider: z.string().describe("MCP provider (notion, linear, github, etc.)"),
          toolName: z.string().describe("Tool name (e.g., 'getTasks', 'createIssue')"),
          args: z.record(z.string(), z.any()).describe("Tool arguments"),
        },
        async execute(args, context) {
          const nubabelContext = (global as any).nubabelContext?.get(context.sessionID);
          if (!nubabelContext || !nubabelContext.callbacks) {
            throw new Error("Nubabel context not available");
          }

          console.log("[nubabel-bridge] Invoking MCP tool", {
            provider: args.provider,
            toolName: args.toolName,
            organizationId: nubabelContext.organizationId,
          });

          const response = await fetch(nubabelContext.callbacks.mcpInvoke, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationId: nubabelContext.organizationId,
              provider: args.provider,
              toolName: args.toolName,
              args: args.args,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`MCP invocation failed: ${response.statusText} - ${errorText}`);
          }

          const result = await response.json();
          return result.result;
        },
      }),
    },
  };
}) satisfies Plugin;
