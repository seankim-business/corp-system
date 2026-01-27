import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { validateRequest } from "./validator";
import { delegateTask } from "./delegate";
import { TIMEOUTS } from "./constants";
import {
  createOpencodeSession,
  sendPromptToSession,
  waitForSessionCompletion,
} from "./opencode-client";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
});
app.use("/", limiter);

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    anthropic: {
      configured: !!process.env.ANTHROPIC_API_KEY,
    },
    opencode: {
      enabled: process.env.USE_OPENCODE === "true",
    },
  });
});

app.post("/delegate", async (req, res) => {
  const validationResult = validateRequest(req.body);

  if (!validationResult.valid) {
    const errorMessages = validationResult.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
    return res.status(400).json({
      output: `Validation error: ${errorMessages}`,
      status: "failed",
      metadata: {
        model: "unknown",
        duration: 0,
        error: "VALIDATION_ERROR",
      },
    });
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error("Request timeout"));
    }, TIMEOUTS.DEFAULT_REQUEST_TIMEOUT);
  });

  try {
    const request = validationResult.data;

    if (process.env.USE_OPENCODE === "true") {
      if (!request.callbacks && process.env.NUBABEL_CALLBACK_URL) {
        request.callbacks = {
          sessionUpdate: `${process.env.NUBABEL_CALLBACK_URL}/api/sidecar/sessions/${request.session_id}/update`,
          mcpInvoke: `${process.env.NUBABEL_CALLBACK_URL}/api/sidecar/mcp/invoke`,
          progress: `${process.env.NUBABEL_CALLBACK_URL}/api/sidecar/sessions/${request.session_id}/progress`,
        };
      }

      const opencodeSessionId = await createOpencodeSession(request);
      await sendPromptToSession(opencodeSessionId, request.prompt);

      const output = await Promise.race([
        waitForSessionCompletion(opencodeSessionId),
        timeoutPromise,
      ]);

      res.json({
        output,
        status: "success",
        metadata: {
          model: "claude-sonnet-4-5",
          opencodeSessionId,
          nubabelSessionId: request.session_id,
        },
      });
    } else {
      const result = await Promise.race([delegateTask(request), timeoutPromise]);
      res.json(result);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("timeout")) {
      return res.status(408).json({
        output: `Request timed out after ${TIMEOUTS.DEFAULT_REQUEST_TIMEOUT}ms`,
        status: "failed",
        metadata: {
          model: "unknown",
          duration: TIMEOUTS.DEFAULT_REQUEST_TIMEOUT,
          error: "TIMEOUT_ERROR",
        },
      });
    }

    console.error("Delegation error:", error);
    return res.status(500).json({
      output: `Internal server error: ${errorMessage}`,
      status: "failed",
      metadata: {
        model: "unknown",
        duration: 0,
        error: "EXECUTION_ERROR",
      },
    });
  }
});

app.post("/sessions/:opencodeSessionId/prompt", async (req, res) => {
  const { opencodeSessionId } = req.params;
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({
      output: "Validation error: prompt is required and must be a string",
      status: "failed",
      metadata: {
        model: "unknown",
        error: "VALIDATION_ERROR",
      },
    });
  }

  try {
    await sendPromptToSession(opencodeSessionId, prompt);
    const output = await waitForSessionCompletion(opencodeSessionId);

    res.json({
      output,
      status: "success",
      metadata: {
        model: "claude-sonnet-4-5",
        opencodeSessionId,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error("Session prompt error:", error);
    return res.status(500).json({
      output: `Failed to send prompt to session: ${errorMessage}`,
      status: "failed",
      metadata: {
        model: "unknown",
        opencodeSessionId,
        error: "EXECUTION_ERROR",
      },
    });
  }
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    output: "Internal server error",
    status: "failed",
    metadata: {
      model: "unknown",
      error: "INTERNAL_ERROR",
    },
  });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`OpenCode Sidecar listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Delegate endpoint: POST http://localhost:${PORT}/delegate`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
