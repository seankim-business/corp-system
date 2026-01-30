import { Router, Request, Response } from "express";
import crypto from "crypto";
import { logger } from "../utils/logger";
import { orchestrationQueue } from "../queue/orchestration.queue";
import { getUserBySlackId, getOrganizationBySlackWorkspace } from "../services/slack-service";

const router = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORTED_FILE_TYPES = [
  "text",
  "csv",
  "json",
  "markdown",
  "javascript",
  "typescript",
  "python",
  "yaml",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

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
// POST /file-shared  -  Handle file_shared events from Slack Events API
// ---------------------------------------------------------------------------

interface SlackFileInfo {
  name: string;
  filetype: string;
  size: number;
  mimetype: string;
  url_private_download?: string;
}

interface SlackFileInfoResponse {
  ok: boolean;
  file?: SlackFileInfo;
  error?: string;
}

router.post("/file-shared", async (req: Request, res: Response) => {
  try {
    // ----- URL verification challenge -----
    if (req.body?.type === "url_verification") {
      return res.status(200).json({ challenge: req.body.challenge });
    }

    // ----- Verify Slack signature -----
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      logger.error("SLACK_SIGNING_SECRET is not configured");
      return res.status(500).json({ error: "Slack integration not configured" });
    }

    const slackSignature = req.headers["x-slack-signature"] as string | undefined;
    const slackTimestamp = req.headers["x-slack-request-timestamp"] as string | undefined;

    if (!slackSignature || !slackTimestamp) {
      logger.warn("Missing Slack signature headers on /file-shared");
      return res.status(401).json({ error: "Missing Slack signature headers" });
    }

    const rawBody =
      typeof (req as any).rawBody === "string" // eslint-disable-line @typescript-eslint/no-explicit-any
        ? (req as any).rawBody as string // eslint-disable-line @typescript-eslint/no-explicit-any
        : JSON.stringify(req.body);

    if (!verifySlackSignature(signingSecret, slackSignature, slackTimestamp, rawBody)) {
      logger.warn("Slack signature verification failed on /file-shared");
      return res.status(401).json({ error: "Invalid Slack signature" });
    }

    // ----- Extract event data -----
    const event = req.body?.event as
      | { file_id?: string; user_id?: string; channel_id?: string }
      | undefined;

    if (!event?.file_id || !event.user_id || !event.channel_id) {
      logger.warn("Missing required event fields in file_shared", {
        fileId: event?.file_id,
        userId: event?.user_id,
        channelId: event?.channel_id,
      });
      return res.status(400).json({ error: "Missing required event fields" });
    }

    const { file_id: fileId, user_id: slackUserId, channel_id: channelId } = event;
    const teamId = req.body?.team_id as string | undefined;

    logger.info("Slack file_shared event received", { fileId, slackUserId, channelId, teamId });

    // ----- Fetch file info from Slack API -----
    const slackBotToken = process.env.SLACK_BOT_TOKEN;
    if (!slackBotToken) {
      logger.error("SLACK_BOT_TOKEN is not configured");
      return res.status(500).json({ error: "Slack bot token not configured" });
    }

    const { WebClient } = await import("@slack/web-api");
    const slackClient = new WebClient(slackBotToken);

    const fileInfoResponse = (await slackClient.files.info({
      file: fileId,
    })) as SlackFileInfoResponse;

    if (!fileInfoResponse.ok || !fileInfoResponse.file) {
      logger.error("Failed to fetch file info from Slack", {
        fileId,
        error: fileInfoResponse.error,
      });
      return res.status(200).json({ ok: true }); // Acknowledge event even on failure
    }

    const fileInfo = fileInfoResponse.file;
    const { name, filetype, size, mimetype } = fileInfo;

    logger.info("Slack file metadata", { fileId, name, filetype, size, mimetype });

    // ----- Validate file size -----
    if (size > MAX_FILE_SIZE) {
      logger.warn("Slack file exceeds maximum size", { fileId, name, size, maxSize: MAX_FILE_SIZE });
      return res.status(200).json({ ok: true }); // Acknowledge but skip processing
    }

    // ----- Check if file type is supported for text extraction -----
    if (!SUPPORTED_FILE_TYPES.includes(filetype)) {
      logger.info("Unsupported file type for text extraction", { fileId, name, filetype });
      return res.status(200).json({ ok: true }); // Acknowledge but skip processing
    }

    // ----- Download file content -----
    let fileContent = "";
    if (fileInfo.url_private_download) {
      try {
        const downloadResponse = await fetch(fileInfo.url_private_download, {
          headers: { Authorization: `Bearer ${slackBotToken}` },
        });

        if (downloadResponse.ok) {
          fileContent = await downloadResponse.text();
        } else {
          logger.warn("Failed to download Slack file", {
            fileId,
            name,
            status: downloadResponse.status,
          });
        }
      } catch (downloadError: unknown) {
        const downloadMessage =
          downloadError instanceof Error ? downloadError.message : String(downloadError);
        logger.error("Error downloading Slack file", { fileId, name, error: downloadMessage });
      }
    }

    // ----- Resolve organization and user -----
    if (!teamId) {
      logger.warn("No team_id in file_shared event", { fileId, slackUserId });
      return res.status(200).json({ ok: true });
    }

    const organization = await getOrganizationBySlackWorkspace(teamId);
    if (!organization) {
      logger.warn("No organization found for Slack workspace", { teamId });
      return res.status(200).json({ ok: true });
    }

    const organizationId = organization.id;

    let userId: string;
    try {
      const user = await getUserBySlackId(slackUserId, slackClient);
      if (!user) {
        logger.warn("No Nubabel user found for Slack user", { slackUserId, teamId });
        return res.status(200).json({ ok: true });
      }
      userId = user.id;
    } catch {
      logger.warn("Failed to resolve Slack user for file event", { slackUserId, teamId });
      return res.status(200).json({ ok: true });
    }

    // ----- Queue for orchestration -----
    const sessionId = crypto.randomUUID();
    const eventId = crypto.randomUUID();

    const userRequest = fileContent
      ? `[File uploaded: ${name} (${filetype}, ${mimetype})]\n\n${fileContent}`
      : `[File uploaded: ${name} (${filetype}, ${mimetype}, ${size} bytes)]`;

    await orchestrationQueue.enqueueOrchestration({
      userRequest,
      sessionId,
      organizationId,
      userId,
      eventId,
      slackChannel: channelId,
      slackThreadTs: "",
    });

    logger.info("Slack file event queued for orchestration", {
      sessionId,
      userId,
      organizationId,
      fileId,
      fileName: name,
      fileType: filetype,
      hasContent: fileContent.length > 0,
    });

    return res.status(200).json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Slack file-shared handler error", { error: message });
    return res.status(200).json({ ok: true }); // Always acknowledge Slack events
  }
});

export default router;
