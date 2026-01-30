import { Router, Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { db } from "../db/client";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { encryptToString } from "../services/encryption.service";
import crypto from "crypto";

// Router for authenticated endpoints
const authRouter = Router();
// Router for public endpoints (receive-token from claude.ai)
const publicRouter = Router();

// TTL for pending tokens in Redis (5 minutes)
const PENDING_TOKEN_TTL = 300;

// Key prefix for Redis
const REDIS_PREFIX = "claude-connect:";

interface CompleteConnectionBody {
  code: string;
  nickname: string;
  priority?: number;
}

// CORS middleware for the receive-token endpoint
// This allows the bookmarklet to call from claude.ai
function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Allow requests from any origin since bookmarklets run in the context of the current page
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  next();
}

/**
 * POST /api/claude-connect/init
 * Initialize a connection session and return a unique code for polling
 */
authRouter.post("/claude-connect/init", async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(401).json({ error: "Organization not found" });
    }

    // Generate a unique connection code
    const code = crypto.randomBytes(16).toString("hex");
    const sessionKey = `${REDIS_PREFIX}session:${code}`;

    // Store the session with organization context
    await redis.set(
      sessionKey,
      JSON.stringify({
        organizationId: req.organization.id,
        status: "pending",
        createdAt: new Date().toISOString(),
      }),
      PENDING_TOKEN_TTL,
    );

    logger.info("Claude Connect session initialized", {
      organizationId: req.organization.id,
      code: code.substring(0, 8) + "...",
    });

    return res.json({
      code,
      expiresIn: PENDING_TOKEN_TTL,
      pollUrl: `/api/claude-connect/poll/${code}`,
    });
  } catch (error) {
    logger.error("Failed to initialize Claude Connect session", {}, error as Error);
    return res.status(500).json({ error: "Failed to initialize connection" });
  }
});

/**
 * POST /api/claude-connect/receive-token
 * Receives the token from the bookmarklet/script
 * This endpoint is called from claude.ai domain, so it needs CORS handling
 * PUBLIC ENDPOINT - no auth required
 */
publicRouter.options("/claude-connect/receive-token", corsMiddleware);
publicRouter.post("/claude-connect/receive-token", corsMiddleware, async (req, res) => {
  try {
    const { token, code } = req.body as { token: string; code: string };

    if (!token || !code) {
      return res.status(400).json({ error: "token and code are required" });
    }

    // Validate token format (sessionKey typically starts with sk-ant-sid)
    if (!token.startsWith("sk-ant-sid")) {
      return res.status(400).json({
        error: "Invalid token format. Expected Claude sessionKey (starts with sk-ant-sid)",
      });
    }

    // Check if session exists
    const sessionKey = `${REDIS_PREFIX}session:${code}`;
    const sessionData = await redis.get(sessionKey);

    if (!sessionData) {
      return res.status(404).json({ error: "Session not found or expired" });
    }

    const session = JSON.parse(sessionData);
    if (session.status !== "pending") {
      return res.status(400).json({ error: "Session already completed or invalid" });
    }

    // Update session with the received token
    const tokenKey = `${REDIS_PREFIX}token:${code}`;
    await redis.set(
      tokenKey,
      JSON.stringify({
        token,
        receivedAt: new Date().toISOString(),
      }),
      PENDING_TOKEN_TTL,
    );

    // Update session status
    session.status = "token_received";
    await redis.set(sessionKey, JSON.stringify(session), PENDING_TOKEN_TTL);

    logger.info("Claude token received", {
      code: code.substring(0, 8) + "...",
      organizationId: session.organizationId,
    });

    return res.json({ success: true, message: "Token received successfully" });
  } catch (error) {
    logger.error("Failed to receive Claude token", {}, error as Error);
    return res.status(500).json({ error: "Failed to receive token" });
  }
});

/**
 * GET /api/claude-connect/poll/:code
 * Frontend polls this endpoint to check if token has been received
 */
authRouter.get("/claude-connect/poll/:code", async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const { code } = req.params;

    // Check session
    const sessionKey = `${REDIS_PREFIX}session:${code}`;
    const sessionData = await redis.get(sessionKey);

    if (!sessionData) {
      return res.status(404).json({ error: "Session not found or expired" });
    }

    const session = JSON.parse(sessionData);

    // Verify organization
    if (session.organizationId !== req.organization.id) {
      return res.status(403).json({ error: "Session does not belong to this organization" });
    }

    // Check if token is available
    const tokenKey = `${REDIS_PREFIX}token:${code}`;
    const tokenData = await redis.get(tokenKey);

    if (!tokenData) {
      return res.json({
        status: "pending",
        message: "Waiting for token...",
      });
    }

    const token = JSON.parse(tokenData);

    // Try to extract email from token if possible (Claude tokens sometimes contain user info)
    // For now, return a placeholder email
    return res.json({
      status: "received",
      message: "Token received! Ready to complete connection.",
      tokenPreview: token.token.substring(0, 20) + "...",
    });
  } catch (error) {
    logger.error("Failed to poll Claude Connect status", {}, error as Error);
    return res.status(500).json({ error: "Failed to check status" });
  }
});

/**
 * POST /api/claude-connect/complete
 * Finalize the connection and create the ClaudeMaxAccount
 */
authRouter.post("/claude-connect/complete", async (req, res) => {
  try {
    if (!req.organization) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const body = req.body as CompleteConnectionBody;

    if (!body.code || !body.nickname) {
      return res.status(400).json({ error: "code and nickname are required" });
    }

    // Get session data
    const sessionKey = `${REDIS_PREFIX}session:${body.code}`;
    const sessionData = await redis.get(sessionKey);

    if (!sessionData) {
      return res.status(404).json({ error: "Session not found or expired" });
    }

    const session = JSON.parse(sessionData);

    // Verify organization
    if (session.organizationId !== req.organization.id) {
      return res.status(403).json({ error: "Session does not belong to this organization" });
    }

    // Get token
    const tokenKey = `${REDIS_PREFIX}token:${body.code}`;
    const tokenData = await redis.get(tokenKey);

    if (!tokenData) {
      return res.status(400).json({ error: "No token received yet" });
    }

    const { token } = JSON.parse(tokenData);

    // Check for duplicate nickname
    const existingByNickname = await db.claudeMaxAccount.findFirst({
      where: {
        organizationId: req.organization.id,
        nickname: body.nickname,
      },
    });

    if (existingByNickname) {
      return res.status(409).json({ error: "An account with this nickname already exists" });
    }

    // Create the account with encrypted credentials
    const encryptedCredentials = encryptToString(
      JSON.stringify({
        sessionToken: token,
      }),
    );
    const credentialRef = `enc_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // Generate a placeholder email based on the token
    const placeholderEmail = `claude-${body.nickname.toLowerCase().replace(/\s+/g, "-")}@connected.local`;

    const account = await db.claudeMaxAccount.create({
      data: {
        organizationId: req.organization.id,
        nickname: body.nickname,
        email: placeholderEmail,
        priority: body.priority ?? 100,
        credentialRef,
        metadata: {
          encryptedCredentials,
          connectedVia: "bookmarklet",
          connectedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    // Clean up Redis
    await redis.del(sessionKey);
    await redis.del(tokenKey);

    logger.info("Claude Max account created via Connect flow", {
      organizationId: req.organization.id,
      accountId: account.id,
      nickname: body.nickname,
    });

    return res.status(201).json({
      id: account.id,
      nickname: account.nickname,
      email: account.email,
      status: account.status,
      priority: account.priority,
      hasCredentials: true,
      createdAt: account.createdAt,
    });
  } catch (error) {
    logger.error("Failed to complete Claude Connect", {}, error as Error);
    return res.status(500).json({ error: "Failed to create account" });
  }
});

/**
 * GET /api/claude-connect/bookmarklet/:code
 * Returns the bookmarklet code for the current session
 */
authRouter.get("/claude-connect/bookmarklet/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const baseUrl = process.env.BASE_URL || "https://app.nubabel.com";

    // Generate the bookmarklet code
    const bookmarkletCode = `javascript:(function(){
  var sk=document.cookie.match(/sessionKey=([^;]+)/);
  if(!sk){alert('Not logged in to Claude. Please log in first.');return;}
  fetch('${baseUrl}/api/claude-connect/receive-token',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:sk[1],code:'${code}'})
  }).then(r=>r.json()).then(d=>{
    if(d.success){alert('Token sent! Return to Nubabel to complete.');}
    else{alert('Error: '+(d.error||'Unknown error'));}
  }).catch(e=>alert('Failed to send: '+e.message));
})();`;

    return res.json({
      bookmarkletCode: bookmarkletCode.replace(/\s+/g, " ").trim(),
      instructions: [
        "1. Create a new bookmark in your browser",
        "2. Set the name to 'Connect to Nubabel'",
        "3. Set the URL/Location to the code above",
        "4. Go to claude.ai and log in",
        "5. Click the bookmarklet",
        "6. Return to Nubabel to complete the connection",
      ],
    });
  } catch (error) {
    logger.error("Failed to generate bookmarklet", {}, error as Error);
    return res.status(500).json({ error: "Failed to generate bookmarklet" });
  }
});

// Export both routers
export const claudeConnectRouter = authRouter;
export const claudeConnectPublicRouter = publicRouter;
