import { Router, Request, Response } from "express";
import crypto from "crypto";
import { logger } from "../utils/logger";
import { orchestrationQueue } from "../queue/orchestration.queue";
import { getUserBySlackId, getOrganizationBySlackWorkspace } from "../services/slack-service";

const router = Router();

// ---------------------------------------------------------------------------
// Helper: Verify Slack request signature
// ---------------------------------------------------------------------------

function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) {
    logger.warn("Slack request timestamp too old", { timestamp });
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(sigBasestring);
  const computedSignature = `v0=${hmac.digest("hex")}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature, "utf-8"),
      Buffer.from(signature, "utf-8"),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helper: Extract and verify common Slack event fields
// ---------------------------------------------------------------------------

interface SlackSignatureResult {
  ok: boolean;
  rawBody: string;
}

function extractSignatureInputs(req: Request): {
  signingSecret: string | null;
  slackSignature: string | undefined;
  slackTimestamp: string | undefined;
} {
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? null;
  const slackSignature = req.headers["x-slack-signature"] as string | undefined;
  const slackTimestamp = req.headers["x-slack-request-timestamp"] as string | undefined;
  return { signingSecret, slackSignature, slackTimestamp };
}

function verifyRequest(req: Request): SlackSignatureResult & { error?: string; status?: number } {
  const { signingSecret, slackSignature, slackTimestamp } = extractSignatureInputs(req);

  if (!signingSecret) {
    logger.error("SLACK_SIGNING_SECRET is not configured");
    return { ok: false, rawBody: "", error: "Slack integration not configured", status: 500 };
  }

  if (!slackSignature || !slackTimestamp) {
    logger.warn("Missing Slack signature headers");
    return { ok: false, rawBody: "", error: "Missing Slack signature headers", status: 401 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawBody =
    typeof (req as any).rawBody === "string"
      ? (req as any).rawBody as string
      : JSON.stringify(req.body);

  if (!verifySlackSignature(signingSecret, slackSignature, slackTimestamp, rawBody)) {
    logger.warn("Slack signature verification failed");
    return { ok: false, rawBody, error: "Invalid Slack signature", status: 401 };
  }

  return { ok: true, rawBody };
}

// ---------------------------------------------------------------------------
// Slack Event API types
// ---------------------------------------------------------------------------

interface SlackEventWrapper {
  type: string;
  challenge?: string;
  team_id?: string;
  event?: {
    type?: string;
    user?: string;
    text?: string;
    channel?: string;
    thread_ts?: string;
    reaction?: string;
    item?: {
      ts?: string;
      channel?: string;
    };
  };
}

// ---------------------------------------------------------------------------
// POST /thread-reply  -  Handle thread reply events from Slack Events API
// ---------------------------------------------------------------------------

router.post("/thread-reply", async (req: Request, res: Response) => {
  try {
    // Handle Slack URL verification challenge
    const body = req.body as SlackEventWrapper;
    if (body.type === "url_verification") {
      return res.status(200).json({ challenge: body.challenge });
    }

    const verification = verifyRequest(req);
    if (!verification.ok) {
      return res.status(verification.status ?? 401).json({ error: verification.error });
    }

    const teamId = body.team_id;
    const event = body.event;

    if (!event || !teamId) {
      logger.warn("Missing event or team_id in thread-reply payload");
      return res.status(400).json({ error: "Missing event data" });
    }

    const slackUserId = event.user;
    const text = event.text;
    const channel = event.channel;
    const threadTs = event.thread_ts;

    if (!slackUserId || !text || !channel || !threadTs) {
      logger.warn("Incomplete thread reply event", { slackUserId, channel, threadTs });
      return res.status(400).json({ error: "Incomplete event data" });
    }

    logger.info("Slack thread reply received", { teamId, slackUserId, channel, threadTs });

    // Look up the Nubabel organization by Slack workspace
    const organization = await getOrganizationBySlackWorkspace(teamId);
    if (!organization) {
      logger.warn("No organization found for Slack workspace", { teamId });
      return res.status(200).json({ ok: true, message: "Workspace not connected" });
    }

    const organizationId = organization.id;

    // Look up the Nubabel user by Slack ID (via email from Slack API)
    const slackBotToken = process.env.SLACK_BOT_TOKEN;
    if (!slackBotToken) {
      logger.error("SLACK_BOT_TOKEN is not configured");
      return res.status(200).json({ ok: true, message: "Bot token not configured" });
    }

    let userId: string;
    try {
      const { WebClient } = await import("@slack/web-api");
      const slackClient = new WebClient(slackBotToken);
      const user = await getUserBySlackId(slackUserId, slackClient);
      if (!user) {
        logger.warn("Slack user not linked to Nubabel account", { slackUserId, teamId });
        return res.status(200).json({ ok: true, message: "User not linked" });
      }
      userId = user.id;
    } catch {
      logger.warn("Failed to resolve Slack user for thread reply", { slackUserId, teamId });
      return res.status(200).json({ ok: true, message: "User resolution failed" });
    }

    const sessionId = crypto.randomUUID();
    const eventId = crypto.randomUUID();

    await orchestrationQueue.enqueueOrchestration({
      userRequest: text.trim(),
      sessionId,
      organizationId,
      userId,
      eventId,
      slackChannel: channel,
      slackThreadTs: threadTs,
    });

    logger.info("Thread reply queued for orchestration", {
      sessionId,
      userId,
      organizationId,
      channel,
      threadTs,
    });

    return res.status(200).json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Slack thread reply handler error", { error: message });
    return res.status(200).json({ ok: true });
  }
});

// ---------------------------------------------------------------------------
// POST /reactions  -  Handle reaction_added events
// ---------------------------------------------------------------------------

const POSITIVE_REACTIONS = new Set([
  "thumbsup",
  "+1",
  "white_check_mark",
]);

const NEGATIVE_REACTIONS = new Set([
  "thumbsdown",
  "-1",
  "x",
]);

function classifyReaction(reaction: string): "positive" | "negative" | null {
  if (POSITIVE_REACTIONS.has(reaction)) return "positive";
  if (NEGATIVE_REACTIONS.has(reaction)) return "negative";
  return null;
}

router.post("/reactions", async (req: Request, res: Response) => {
  try {
    // Handle Slack URL verification challenge
    const body = req.body as SlackEventWrapper;
    if (body.type === "url_verification") {
      return res.status(200).json({ challenge: body.challenge });
    }

    const verification = verifyRequest(req);
    if (!verification.ok) {
      return res.status(verification.status ?? 401).json({ error: verification.error });
    }

    const teamId = body.team_id;
    const event = body.event;

    if (!event || !teamId) {
      logger.warn("Missing event or team_id in reactions payload");
      return res.status(400).json({ error: "Missing event data" });
    }

    const slackUserId = event.user;
    const reaction = event.reaction;
    const itemTs = event.item?.ts;
    const itemChannel = event.item?.channel;

    if (!slackUserId || !reaction || !itemTs || !itemChannel) {
      logger.warn("Incomplete reaction event", { slackUserId, reaction, itemTs, itemChannel });
      return res.status(400).json({ error: "Incomplete event data" });
    }

    const sentiment = classifyReaction(reaction);

    if (sentiment) {
      logger.info("Slack reaction feedback received", {
        teamId,
        slackUserId,
        reaction,
        sentiment,
        itemTs,
        itemChannel,
      });
    } else {
      logger.debug("Slack reaction received (unmapped)", {
        teamId,
        slackUserId,
        reaction,
        itemTs,
        itemChannel,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Slack reaction handler error", { error: message });
    return res.status(200).json({ ok: true });
  }
});

export default router;
