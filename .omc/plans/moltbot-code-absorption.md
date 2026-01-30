# Moltbot Code Absorption Plan

## Executive Summary

### What We're Extracting

Cherry-pick high-value modules from Moltbot (MIT licensed, 60k+ GitHub stars) and adapt them to Nubabel's multi-tenant enterprise architecture. This is a **code absorption** approach - we own the resulting code with NO external runtime dependency on Moltbot.

### Why Absorption Over Integration

| Approach | Pros | Cons |
|----------|------|------|
| **Integration** (existing plan) | Quick, non-invasive | Runtime dependency, limited control |
| **Absorption** (this plan) | Full ownership, deep customization, no external deps | More effort, maintenance burden |

**Decision**: Absorption is preferred because:
1. Nubabel needs enterprise-grade multi-tenancy (RLS, per-org credentials)
2. We need full control over channel adapters for compliance
3. No operational dependency on external daemon
4. Can optimize for our specific use cases

### Target Modules

| Priority | Module | Moltbot Location | Value |
|----------|--------|------------------|-------|
| P1 | WhatsApp Adapter | `src/channels/whatsapp/` | High - Most requested channel |
| P1 | Telegram Adapter | `src/channels/telegram/` | High - Popular, well-documented |
| P1 | Discord Adapter | `src/channels/discord/` | High - Developer community |
| P1 | Teams Adapter | `extensions/teams/` | High - Enterprise customers |
| P1 | Message Normalizer | `src/gateway/normalizer.ts` | Critical - Unified message format |
| P2 | Browser Automation | `src/skills/browser/` | Medium - Web scraping use cases |
| P2 | Playwright Wrapper | `packages/clawdbot/browser/` | Medium - Reusable automation |
| P3 | Voice TTS/STT | `src/skills/voice/` | Medium - Accessibility, voice UX |
| P4 | Web Scraping | `src/skills/scrape/` | Low - Nice to have |
| P4 | File Conversion | `src/skills/convert/` | Low - Utility |

---

## Architecture Decisions

### Multi-Tenant Channel Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              Nubabel Core                    │
                    │                                              │
                    │  ┌──────────────────────────────────────┐   │
                    │  │      Channel Adapter Registry         │   │
                    │  │   (WhatsApp, Telegram, Discord...)    │   │
                    │  └──────────────────────────────────────┘   │
                    │                     │                        │
                    │  ┌──────────────────┼──────────────────┐    │
                    │  │                  │                  │    │
                    │  ▼                  ▼                  ▼    │
                    │ ┌────────┐    ┌──────────┐    ┌─────────┐  │
                    │ │WhatsApp│    │ Telegram │    │ Discord │  │
                    │ │Adapter │    │ Adapter  │    │ Adapter │  │
                    │ └────────┘    └──────────┘    └─────────┘  │
                    │      │              │              │        │
                    │      ▼              ▼              ▼        │
                    │  ┌──────────────────────────────────────┐   │
                    │  │    Per-Organization Credentials       │   │
                    │  │    (ChannelConnection table)          │   │
                    │  └──────────────────────────────────────┘   │
                    │                     │                        │
                    │                     ▼                        │
                    │  ┌──────────────────────────────────────┐   │
                    │  │      Message Normalization Layer      │   │
                    │  │  (Unified NormalizedMessage format)   │   │
                    │  └──────────────────────────────────────┘   │
                    │                     │                        │
                    │                     ▼                        │
                    │  ┌──────────────────────────────────────┐   │
                    │  │        Orchestration Queue            │   │
                    │  │     (BullMQ, per-org routing)         │   │
                    │  └──────────────────────────────────────┘   │
                    └─────────────────────────────────────────────┘
```

### Key Design Principles

1. **Per-Organization Isolation**: Each org has their own channel credentials stored in `ChannelConnection` table
2. **Session Affinity**: Channel sessions (WhatsApp QR codes, etc.) persist per-org
3. **Message Normalization**: All channels convert to unified `NormalizedMessage` format
4. **Queue-Based Processing**: Inbound messages go through BullMQ for reliability
5. **Graceful Degradation**: Channel failures don't affect other channels or orgs

---

## Database Schema Changes

### New Tables Required

```prisma
// ============================================================================
// CHANNEL INTEGRATION TABLES
// ============================================================================

/// ChannelConnection (Per-organization channel credentials)
/// Stores OAuth tokens, API keys, and session data for each channel
model ChannelConnection {
  id             String    @id @default(uuid()) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  channel        String    @db.VarChar(50)  // whatsapp, telegram, discord, teams, etc.
  name           String    @db.VarChar(255) // User-friendly name

  // Authentication
  credentials    Json      @db.JsonB        // Encrypted: tokens, API keys, etc.
  sessionData    Json?     @map("session_data") @db.JsonB  // WhatsApp auth state, etc.

  // Status
  status         String    @default("disconnected") @db.VarChar(50)  // connected, disconnected, error
  lastConnected  DateTime? @map("last_connected") @db.Timestamptz(6)
  lastError      String?   @map("last_error") @db.Text

  // Rate limiting
  rateLimitMax   Int       @default(100) @map("rate_limit_max")
  rateLimitWindowMs Int    @default(60000) @map("rate_limit_window_ms")

  // Metadata
  enabled        Boolean   @default(true)
  metadata       Json?     @db.JsonB
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  messages       ChannelMessage[] @relation("ConnectionMessages")

  @@unique([organizationId, channel])
  @@index([organizationId])
  @@index([channel])
  @@index([status])
  @@map("channel_connections")
}

/// ChannelMessage (Message history for all channels)
/// Unified storage for inbound/outbound messages across all channels
model ChannelMessage {
  id             String    @id @default(uuid()) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  connectionId   String    @map("connection_id") @db.Uuid

  // Message identifiers
  externalId     String    @map("external_id") @db.VarChar(255)  // Platform message ID
  conversationId String    @map("conversation_id") @db.VarChar(255)  // Thread/chat ID

  // Direction and content
  direction      String    @db.VarChar(10)  // inbound, outbound
  messageType    String    @map("message_type") @db.VarChar(50)  // text, image, audio, file, etc.
  content        String    @db.Text

  // Sender info
  senderType     String    @map("sender_type") @db.VarChar(20)  // user, bot, system
  senderExternalId String  @map("sender_external_id") @db.VarChar(255)
  senderName     String?   @map("sender_name") @db.VarChar(255)

  // Attachments
  attachments    Json?     @db.JsonB  // Array of {type, url, filename, mimeType}

  // Processing status
  status         String    @default("received") @db.VarChar(50)  // received, processing, processed, failed
  processedAt    DateTime? @map("processed_at") @db.Timestamptz(6)
  errorMessage   String?   @map("error_message") @db.Text

  // Metadata
  metadata       Json?     @db.JsonB
  timestamp      DateTime  @db.Timestamptz(6)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  // Relations
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  connection     ChannelConnection @relation("ConnectionMessages", fields: [connectionId], references: [id], onDelete: Cascade)

  @@index([organizationId, conversationId])
  @@index([organizationId, timestamp(sort: Desc)])
  @@index([connectionId])
  @@index([externalId])
  @@index([status])
  @@map("channel_messages")
}

/// BrowserSession (Playwright browser session management)
/// Manages headless browser instances per organization
model BrowserSession {
  id             String    @id @default(uuid()) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid

  // Session info
  sessionId      String    @unique @map("session_id") @db.VarChar(100)
  browserType    String    @default("chromium") @map("browser_type") @db.VarChar(50)
  status         String    @default("idle") @db.VarChar(50)  // idle, active, closed

  // Resource tracking
  pageCount      Int       @default(0) @map("page_count")
  memoryUsageMb  Float?    @map("memory_usage_mb")

  // Lifecycle
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  lastActiveAt   DateTime  @default(now()) @map("last_active_at") @db.Timestamptz(6)
  expiresAt      DateTime  @map("expires_at") @db.Timestamptz(6)

  // Relations
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([status])
  @@index([expiresAt])
  @@map("browser_sessions")
}

/// ExternalUserMapping (Map external platform users to Nubabel users)
/// Allows users from WhatsApp, Telegram, Discord, etc. to be linked to Nubabel accounts
model ExternalUserMapping {
  id             String    @id @default(uuid()) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  userId         String?   @map("user_id") @db.Uuid  // NULL for auto-provisioned users not yet linked

  // External identity
  channel        String    @db.VarChar(50)  // whatsapp, telegram, discord, teams
  externalUserId String    @map("external_user_id") @db.VarChar(255)
  displayName    String?   @map("display_name") @db.VarChar(255)
  avatarUrl      String?   @map("avatar_url") @db.Text

  // Provisioning
  autoProvisioned Boolean  @default(false) @map("auto_provisioned")

  // Metadata
  metadata       Json?     @db.JsonB
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@unique([organizationId, channel, externalUserId])
  @@index([organizationId])
  @@index([userId])
  @@index([channel])
  @@map("external_user_mappings")
}

/// VoiceUsageRecord (Track voice API costs separately from AI provider costs)
/// ElevenLabs TTS and Whisper STT have their own pricing models
model VoiceUsageRecord {
  id             String    @id @default(uuid()) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid

  // Provider and operation
  provider       String    @db.VarChar(50)  // elevenlabs, openai-whisper
  operation      String    @db.VarChar(20)  // tts, stt

  // Usage metrics
  characterCount Int?      @map("character_count")  // For TTS (ElevenLabs charges per character)
  durationMs     Int?      @map("duration_ms")      // For STT (Whisper charges per minute)
  costCents      Int       @default(0) @map("cost_cents")

  // Context
  sessionId      String?   @map("session_id") @db.VarChar(255)
  messageId      String?   @map("message_id") @db.Uuid  // Link to ChannelMessage if applicable

  // Metadata
  metadata       Json?     @db.JsonB
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  // Relations
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([provider])
  @@index([createdAt(sort: Desc)])
  @@map("voice_usage_records")
}
```

### Update Organization Model

Add these relations to Organization model in `prisma/schema.prisma`:

```prisma
model Organization {
  // ... existing fields ...

  // Add these relations for channel integration
  channelConnections      ChannelConnection[]
  channelMessages         ChannelMessage[]
  browserSessions         BrowserSession[]
  externalUserMappings    ExternalUserMapping[]
  voiceUsageRecords       VoiceUsageRecord[]
}
```

### Update User Model

Add relation for external user mappings:

```prisma
model User {
  // ... existing fields ...

  // Add this relation for external platform linking
  externalMappings        ExternalUserMapping[]
}
```

---

## Pre-Phase: External User Resolution Service (REQUIRED FIRST)

**File**: `/src/services/external-user.ts` (NEW)

This service MUST be created BEFORE the channel event worker, as it depends on `resolveExternalUser`.

```typescript
/**
 * External User Resolution Service
 *
 * Maps external platform users (WhatsApp, Telegram, Discord, etc.) to Nubabel users.
 * Supports auto-provisioning for new external users.
 */

import { db } from "../db/client";
import { logger } from "../utils/logger";
import { ChannelType } from "../channels/types";

export interface ResolveExternalUserOptions {
  channel: ChannelType;
  externalUserId: string;
  organizationId: string;
  displayName?: string;
  avatarUrl?: string;
  autoProvision?: boolean;  // Create mapping if not exists
}

export interface ExternalUserResolution {
  userId: string | null;      // Nubabel user ID (null if auto-provisioned but not linked)
  mappingId: string;          // ExternalUserMapping ID
  isNewMapping: boolean;      // True if we just created the mapping
  autoProvisioned: boolean;   // True if this is an auto-provisioned user
}

/**
 * Resolve an external platform user to a Nubabel user.
 *
 * Flow:
 * 1. Look up existing mapping by (org, channel, externalUserId)
 * 2. If found, return the linked userId (may be null for unlinked auto-provisioned users)
 * 3. If not found and autoProvision=true, create a new mapping
 * 4. If not found and autoProvision=false, return null
 */
export async function resolveExternalUser(
  options: ResolveExternalUserOptions
): Promise<ExternalUserResolution | null> {
  const {
    channel,
    externalUserId,
    organizationId,
    displayName,
    avatarUrl,
    autoProvision = false,
  } = options;

  logger.debug("Resolving external user", {
    channel,
    externalUserId,
    organizationId,
    autoProvision,
  });

  // Look up existing mapping
  const existingMapping = await db.externalUserMapping.findUnique({
    where: {
      organizationId_channel_externalUserId: {
        organizationId,
        channel,
        externalUserId,
      },
    },
  });

  if (existingMapping) {
    return {
      userId: existingMapping.userId,
      mappingId: existingMapping.id,
      isNewMapping: false,
      autoProvisioned: existingMapping.autoProvisioned,
    };
  }

  // No existing mapping
  if (!autoProvision) {
    logger.debug("External user not found and auto-provision disabled", {
      channel,
      externalUserId,
    });
    return null;
  }

  // Auto-provision: create new mapping without linked user
  const newMapping = await db.externalUserMapping.create({
    data: {
      organizationId,
      channel,
      externalUserId,
      displayName,
      avatarUrl,
      autoProvisioned: true,
      userId: null,  // Not linked to a Nubabel user yet
    },
  });

  logger.info("Auto-provisioned external user mapping", {
    mappingId: newMapping.id,
    channel,
    externalUserId,
    organizationId,
  });

  return {
    userId: null,
    mappingId: newMapping.id,
    isNewMapping: true,
    autoProvisioned: true,
  };
}

/**
 * Link an external user mapping to a Nubabel user.
 *
 * Called when an auto-provisioned user signs up or is manually linked.
 */
export async function linkExternalUser(
  mappingId: string,
  userId: string
): Promise<void> {
  await db.externalUserMapping.update({
    where: { id: mappingId },
    data: { userId },
  });

  logger.info("Linked external user to Nubabel user", {
    mappingId,
    userId,
  });
}

/**
 * Get all external mappings for a user.
 */
export async function getExternalMappingsForUser(
  userId: string
): Promise<Array<{ channel: string; externalUserId: string; displayName: string | null }>> {
  const mappings = await db.externalUserMapping.findMany({
    where: { userId },
    select: {
      channel: true,
      externalUserId: true,
      displayName: true,
    },
  });

  return mappings;
}

/**
 * Get all external mappings for an organization.
 */
export async function getExternalMappingsForOrg(
  organizationId: string,
  channel?: ChannelType
): Promise<Array<{
  id: string;
  channel: string;
  externalUserId: string;
  displayName: string | null;
  userId: string | null;
  autoProvisioned: boolean;
}>> {
  const mappings = await db.externalUserMapping.findMany({
    where: {
      organizationId,
      ...(channel && { channel }),
    },
    select: {
      id: true,
      channel: true,
      externalUserId: true,
      displayName: true,
      userId: true,
      autoProvisioned: true,
    },
  });

  return mappings;
}
```

**Effort**: 2-3 hours

---

## Phase 1: Channel Adapters (Priority 1)

### 1.1 Core Types and Interfaces

**File**: `/src/channels/types.ts` (NEW)

```typescript
/**
 * Channel Adapter Types
 *
 * Unified interfaces for all messaging channel adapters.
 * Inspired by Moltbot's gateway/types.ts but adapted for multi-tenant.
 */

export type ChannelType =
  | "whatsapp"
  | "telegram"
  | "discord"
  | "teams"
  | "slack"  // Already exists, but unify interface
  | "webchat";

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "location"
  | "contact"
  | "sticker"
  | "reaction";

export type MessageDirection = "inbound" | "outbound";

export interface Attachment {
  type: "image" | "audio" | "video" | "file";
  url: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  thumbnail?: string;
}

export interface Sender {
  id: string;           // External user ID on the platform
  name?: string;
  username?: string;
  avatarUrl?: string;
  isBot?: boolean;
}

export interface NormalizedMessage {
  // Identifiers
  id: string;                     // Our internal ID
  externalId: string;             // Platform message ID
  conversationId: string;         // Chat/thread ID

  // Context
  organizationId: string;
  connectionId: string;
  channel: ChannelType;

  // Content
  type: MessageType;
  text: string;
  attachments?: Attachment[];

  // Sender
  sender: Sender;
  isFromBot: boolean;

  // Metadata
  timestamp: Date;
  replyTo?: string;               // ID of message being replied to
  threadId?: string;              // Thread/topic ID if applicable
  metadata?: Record<string, unknown>;
}

export interface SendMessageOptions {
  conversationId: string;
  text?: string;
  attachments?: Attachment[];
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

export interface SendMessageResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

export interface ChannelConnectionStatus {
  connected: boolean;
  status: "connected" | "disconnected" | "connecting" | "error";
  lastConnected?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelCredentials {
  // WhatsApp (Baileys)
  whatsapp?: {
    authState: unknown;  // Baileys auth state
    phoneNumber?: string;
  };

  // Telegram (grammY)
  telegram?: {
    botToken: string;
    webhookUrl?: string;
  };

  // Discord (discord.js)
  discord?: {
    botToken: string;
    applicationId: string;
    guildIds?: string[];  // Specific servers to listen to
  };

  // Microsoft Teams
  teams?: {
    appId: string;
    appPassword: string;
    tenantId?: string;
  };
}

/**
 * Channel Adapter Interface
 *
 * All channel adapters must implement this interface.
 */
export interface ChannelAdapter {
  readonly channel: ChannelType;

  // Lifecycle
  connect(credentials: ChannelCredentials): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): ChannelConnectionStatus;

  // Messaging
  sendMessage(options: SendMessageOptions): Promise<SendMessageResult>;

  // Events (adapter emits these)
  on(event: "message", handler: (msg: NormalizedMessage) => void): void;
  on(event: "status", handler: (status: ChannelConnectionStatus) => void): void;
  on(event: "error", handler: (error: Error) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
}

/**
 * Channel Adapter Factory
 */
export interface ChannelAdapterFactory {
  create(
    organizationId: string,
    connectionId: string,
    channel: ChannelType,
  ): ChannelAdapter;
}
```

**Effort**: 2 hours

### 1.2 WhatsApp Adapter (Baileys)

**Reference**: Moltbot's `src/channels/whatsapp/index.ts` uses [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)

#### WhatsApp Multi-Tenant Model (CRITICAL)

**Constraint**: WhatsApp Web allows only ONE active session per phone number. This is a fundamental limitation of the WhatsApp platform.

**Multi-Tenant Strategy**: One WhatsApp Number Per Organization

| Aspect | Approach |
|--------|----------|
| **Phone Number Ownership** | Each organization provides their own WhatsApp Business number |
| **Session Isolation** | Each org's session stored in separate auth directory |
| **Number Registration** | Organizations register their number via WhatsApp Business API or WhatsApp Web QR |

**Onboarding Flow**:
1. Organization admin navigates to "Channel Settings > WhatsApp"
2. System generates QR code for WhatsApp Web authentication
3. Admin scans QR with their organization's WhatsApp-linked phone
4. System stores encrypted auth state in `ChannelConnection.sessionData`
5. Connection status updates to "connected"

**Session Conflict Handling**:

| Scenario | Detection | Response |
|----------|-----------|----------|
| User scans QR on different device | `DisconnectReason.loggedOut` event | Emit `logged_out` event, set status to "disconnected", notify admin |
| Another app connects same number | `DisconnectReason.loggedOut` event | Same as above |
| Network disruption | `DisconnectReason.connectionLost` | Auto-reconnect with exponential backoff |
| Auth state corruption | Connection fails repeatedly | Clear auth state, require re-scan |

**What Organizations Need**:
- A dedicated phone number for their WhatsApp Business
- Physical device or WhatsApp Business API account
- Admin access to scan QR code during setup

**NOT Supported** (by design):
- Shared WhatsApp number across organizations
- Multiple organizations using same phone number
- WhatsApp personal accounts (only Business accounts recommended)

**File**: `/src/channels/whatsapp/adapter.ts` (NEW)

```typescript
/**
 * WhatsApp Channel Adapter
 *
 * Multi-tenant WhatsApp integration using Baileys library.
 * Each organization gets their own WhatsApp Web session.
 *
 * EXTRACTED FROM: Moltbot src/channels/whatsapp/
 * LICENSE: MIT
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthStateStore,
  WASocket,
  proto,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { EventEmitter } from "events";
import { logger } from "../../utils/logger";
import {
  ChannelAdapter,
  NormalizedMessage,
  SendMessageOptions,
  SendMessageResult,
  ChannelConnectionStatus,
  ChannelCredentials,
} from "../types";

const RECONNECT_INTERVAL_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;
const QR_TIMEOUT_MS = 60000;

// Auth state path: use env var with fallback for local dev
// In production (containers), set WHATSAPP_AUTH_PATH to a persistent volume mount
const WHATSAPP_AUTH_BASE_PATH = process.env.WHATSAPP_AUTH_PATH || "/tmp/whatsapp-auth";

export class WhatsAppAdapter extends EventEmitter implements ChannelAdapter {
  readonly channel = "whatsapp" as const;

  private organizationId: string;
  private connectionId: string;
  private socket: WASocket | null = null;
  private status: ChannelConnectionStatus = {
    connected: false,
    status: "disconnected",
  };
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private authStatePath: string;
  private lastCredentials: ChannelCredentials | null = null;  // Store for reconnection

  constructor(organizationId: string, connectionId: string) {
    super();
    this.organizationId = organizationId;
    this.connectionId = connectionId;
    // Use environment-configurable base path with org-specific subdirectory
    this.authStatePath = `${WHATSAPP_AUTH_BASE_PATH}/${organizationId}`;
  }

  async connect(credentials: ChannelCredentials): Promise<void> {
    if (!credentials.whatsapp) {
      throw new Error("WhatsApp credentials not provided");
    }

    // Store credentials for reconnection attempts
    this.lastCredentials = credentials;

    logger.info("Connecting WhatsApp adapter", {
      organizationId: this.organizationId,
      connectionId: this.connectionId,
    });

    this.updateStatus("connecting");

    try {
      // Use file-based auth state for persistence
      const { state, saveCreds } = await useMultiFileAuthStateStore(this.authStatePath);

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,  // We'll handle QR codes ourselves
        logger: {
          level: "warn",
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: (msg) => logger.warn("Baileys warn", { msg }),
          error: (msg) => logger.error("Baileys error", { msg }),
          fatal: (msg) => logger.error("Baileys fatal", { msg }),
          child: () => this,
        } as any,
      });

      // Handle connection updates
      this.socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          // Emit QR code for frontend to display
          this.emit("qr", qr);
          logger.info("WhatsApp QR code generated", { organizationId: this.organizationId });
        }

        if (connection === "close") {
          const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;

          if (reason === DisconnectReason.loggedOut) {
            // User logged out - need to re-authenticate
            logger.warn("WhatsApp logged out", { organizationId: this.organizationId });
            this.updateStatus("disconnected", "Logged out - please scan QR code again");
            this.emit("logged_out");
          } else {
            // Connection lost - try to reconnect
            logger.warn("WhatsApp connection closed", {
              organizationId: this.organizationId,
              reason,
            });
            this.scheduleReconnect();
          }
        } else if (connection === "open") {
          this.reconnectAttempts = 0;
          this.updateStatus("connected");
          logger.info("WhatsApp connected", { organizationId: this.organizationId });
        }
      });

      // Handle credential updates
      this.socket.ev.on("creds.update", saveCreds);

      // Handle incoming messages
      this.socket.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const msg of messages) {
          if (msg.key.fromMe) continue;  // Skip our own messages

          try {
            const normalized = await this.normalizeMessage(msg);
            if (normalized) {
              this.emit("message", normalized);
            }
          } catch (error) {
            logger.error("Failed to normalize WhatsApp message", {
              error: error instanceof Error ? error.message : String(error),
              messageId: msg.key.id,
            });
          }
        }
      });

    } catch (error) {
      logger.error("Failed to connect WhatsApp", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.updateStatus("error", error instanceof Error ? error.message : "Connection failed");
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
    }

    this.updateStatus("disconnected");
    logger.info("WhatsApp adapter disconnected", { organizationId: this.organizationId });
  }

  getStatus(): ChannelConnectionStatus {
    return { ...this.status };
  }

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    if (!this.socket || !this.status.connected) {
      return { success: false, error: "Not connected" };
    }

    try {
      const jid = this.toJid(options.conversationId);

      let result: proto.WebMessageInfo | undefined;

      if (options.text) {
        result = await this.socket.sendMessage(jid, { text: options.text });
      }

      if (options.attachments?.length) {
        for (const attachment of options.attachments) {
          const mediaMessage = await this.createMediaMessage(attachment);
          result = await this.socket.sendMessage(jid, mediaMessage);
        }
      }

      return {
        success: true,
        externalId: result?.key?.id,
      };
    } catch (error) {
      logger.error("Failed to send WhatsApp message", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  }

  private async normalizeMessage(msg: proto.IWebMessageInfo): Promise<NormalizedMessage | null> {
    const messageContent = msg.message;
    if (!messageContent) return null;

    const jid = msg.key.remoteJid;
    if (!jid) return null;

    // Extract text content
    let text = "";
    let type: NormalizedMessage["type"] = "text";
    const attachments: NormalizedMessage["attachments"] = [];

    if (messageContent.conversation) {
      text = messageContent.conversation;
    } else if (messageContent.extendedTextMessage?.text) {
      text = messageContent.extendedTextMessage.text;
    } else if (messageContent.imageMessage) {
      type = "image";
      text = messageContent.imageMessage.caption || "";
      const mediaUrl = await this.downloadMedia(msg);
      if (mediaUrl) {
        attachments.push({
          type: "image",
          url: mediaUrl,
          mimeType: messageContent.imageMessage.mimetype || "image/jpeg",
        });
      }
    } else if (messageContent.audioMessage) {
      type = "audio";
      const mediaUrl = await this.downloadMedia(msg);
      if (mediaUrl) {
        attachments.push({
          type: "audio",
          url: mediaUrl,
          mimeType: messageContent.audioMessage.mimetype || "audio/ogg",
        });
      }
    } else if (messageContent.documentMessage) {
      type = "file";
      text = messageContent.documentMessage.caption || "";
      const mediaUrl = await this.downloadMedia(msg);
      if (mediaUrl) {
        attachments.push({
          type: "file",
          url: mediaUrl,
          filename: messageContent.documentMessage.fileName || "document",
          mimeType: messageContent.documentMessage.mimetype || "application/octet-stream",
        });
      }
    }

    // Extract sender info
    const senderJid = msg.key.participant || jid;
    const senderNumber = senderJid.split("@")[0];

    return {
      id: `whatsapp_${msg.key.id}`,
      externalId: msg.key.id || "",
      conversationId: jid,
      organizationId: this.organizationId,
      connectionId: this.connectionId,
      channel: "whatsapp",
      type,
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
      sender: {
        id: senderNumber,
        name: msg.pushName || undefined,
      },
      isFromBot: msg.key.fromMe || false,
      timestamp: new Date(Number(msg.messageTimestamp) * 1000),
      metadata: {
        rawMessage: msg,
      },
    };
  }

  private async downloadMedia(msg: proto.IWebMessageInfo): Promise<string | null> {
    if (!this.socket) return null;

    try {
      const buffer = await downloadMediaMessage(
        msg,
        "buffer",
        {},
        {
          logger: console as any,
          reuploadRequest: this.socket.updateMediaMessage,
        },
      );

      // TODO: Upload to cloud storage and return URL
      // For now, return base64 data URL
      const base64 = Buffer.from(buffer).toString("base64");
      const mimeType = this.getMediaMimeType(msg.message);
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      logger.error("Failed to download WhatsApp media", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private getMediaMimeType(message: proto.IMessage | null | undefined): string {
    if (!message) return "application/octet-stream";
    if (message.imageMessage) return message.imageMessage.mimetype || "image/jpeg";
    if (message.audioMessage) return message.audioMessage.mimetype || "audio/ogg";
    if (message.videoMessage) return message.videoMessage.mimetype || "video/mp4";
    if (message.documentMessage) return message.documentMessage.mimetype || "application/octet-stream";
    return "application/octet-stream";
  }

  private async createMediaMessage(attachment: NormalizedMessage["attachments"][0]): Promise<any> {
    // TODO: Implement media message creation
    // Need to fetch attachment.url and create proper Baileys media message
    return { text: `[Attachment: ${attachment.filename || attachment.type}]` };
  }

  private toJid(conversationId: string): string {
    if (conversationId.includes("@")) return conversationId;
    return `${conversationId}@s.whatsapp.net`;
  }

  private updateStatus(status: ChannelConnectionStatus["status"], error?: string): void {
    this.status = {
      connected: status === "connected",
      status,
      lastConnected: status === "connected" ? new Date() : this.status.lastConnected,
      error,
    };
    this.emit("status", this.status);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error("Max reconnect attempts reached for WhatsApp", {
        organizationId: this.organizationId,
      });
      this.updateStatus("error", "Max reconnect attempts reached");
      return;
    }

    // Cannot reconnect without stored credentials
    if (!this.lastCredentials) {
      logger.error("Cannot reconnect: no stored credentials", {
        organizationId: this.organizationId,
      });
      this.updateStatus("error", "Reconnection failed: missing credentials");
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_INTERVAL_MS * Math.min(this.reconnectAttempts, 5);

    logger.info("Scheduling WhatsApp reconnect", {
      organizationId: this.organizationId,
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        // Use stored credentials for reconnection
        await this.connect(this.lastCredentials!);
      } catch (error) {
        logger.warn("Reconnect attempt failed", {
          organizationId: this.organizationId,
          attempt: this.reconnectAttempts,
          error: error instanceof Error ? error.message : String(error),
        });
        this.scheduleReconnect();
      }
    }, delay);
  }
}
```

**Effort**: 8-10 hours

### 1.3 Telegram Adapter (grammY)

**Reference**: Moltbot's `src/channels/telegram/index.ts` uses [grammY](https://grammy.dev/)

**File**: `/src/channels/telegram/adapter.ts` (NEW)

```typescript
/**
 * Telegram Channel Adapter
 *
 * Multi-tenant Telegram bot integration using grammY.
 * Each organization creates their own Telegram bot via @BotFather.
 *
 * EXTRACTED FROM: Moltbot src/channels/telegram/
 * LICENSE: MIT
 */

import { Bot, Context, webhookCallback } from "grammy";
import { EventEmitter } from "events";
import { logger } from "../../utils/logger";
import {
  ChannelAdapter,
  NormalizedMessage,
  SendMessageOptions,
  SendMessageResult,
  ChannelConnectionStatus,
  ChannelCredentials,
} from "../types";

export class TelegramAdapter extends EventEmitter implements ChannelAdapter {
  readonly channel = "telegram" as const;

  private organizationId: string;
  private connectionId: string;
  private bot: Bot | null = null;
  private status: ChannelConnectionStatus = {
    connected: false,
    status: "disconnected",
  };

  constructor(organizationId: string, connectionId: string) {
    super();
    this.organizationId = organizationId;
    this.connectionId = connectionId;
  }

  async connect(credentials: ChannelCredentials): Promise<void> {
    if (!credentials.telegram?.botToken) {
      throw new Error("Telegram bot token not provided");
    }

    logger.info("Connecting Telegram adapter", {
      organizationId: this.organizationId,
    });

    this.updateStatus("connecting");

    try {
      this.bot = new Bot(credentials.telegram.botToken);

      // Register message handler
      this.bot.on("message", async (ctx) => {
        try {
          const normalized = await this.normalizeMessage(ctx);
          if (normalized) {
            this.emit("message", normalized);
          }
        } catch (error) {
          logger.error("Failed to process Telegram message", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      // Handle errors
      this.bot.catch((error) => {
        logger.error("Telegram bot error", {
          organizationId: this.organizationId,
          error: error.message,
        });
        this.emit("error", error);
      });

      // Start polling or webhook based on configuration
      if (credentials.telegram.webhookUrl) {
        // Webhook mode
        await this.bot.api.setWebhook(credentials.telegram.webhookUrl);
        logger.info("Telegram webhook set", {
          organizationId: this.organizationId,
          webhookUrl: credentials.telegram.webhookUrl,
        });
      } else {
        // Long polling mode
        this.bot.start({
          onStart: () => {
            this.updateStatus("connected");
            logger.info("Telegram bot started (polling)", {
              organizationId: this.organizationId,
            });
          },
        });
      }

      this.updateStatus("connected");

    } catch (error) {
      logger.error("Failed to connect Telegram", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.updateStatus("error", error instanceof Error ? error.message : "Connection failed");
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      await this.bot.stop();
      this.bot = null;
    }
    this.updateStatus("disconnected");
    logger.info("Telegram adapter disconnected", { organizationId: this.organizationId });
  }

  getStatus(): ChannelConnectionStatus {
    return { ...this.status };
  }

  /**
   * Get Express middleware for webhook handling.
   * Use this when running in webhook mode.
   */
  getWebhookHandler() {
    if (!this.bot) {
      throw new Error("Bot not initialized");
    }
    return webhookCallback(this.bot, "express");
  }

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    if (!this.bot || !this.status.connected) {
      return { success: false, error: "Not connected" };
    }

    try {
      const chatId = options.conversationId;
      let result: any;

      if (options.text) {
        result = await this.bot.api.sendMessage(chatId, options.text, {
          reply_to_message_id: options.replyTo ? parseInt(options.replyTo) : undefined,
        });
      }

      if (options.attachments?.length) {
        for (const attachment of options.attachments) {
          switch (attachment.type) {
            case "image":
              result = await this.bot.api.sendPhoto(chatId, attachment.url);
              break;
            case "audio":
              result = await this.bot.api.sendAudio(chatId, attachment.url);
              break;
            case "video":
              result = await this.bot.api.sendVideo(chatId, attachment.url);
              break;
            case "file":
              result = await this.bot.api.sendDocument(chatId, attachment.url);
              break;
          }
        }
      }

      return {
        success: true,
        externalId: result?.message_id?.toString(),
      };
    } catch (error) {
      logger.error("Failed to send Telegram message", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  }

  private async normalizeMessage(ctx: Context): Promise<NormalizedMessage | null> {
    const message = ctx.message;
    if (!message) return null;

    let type: NormalizedMessage["type"] = "text";
    let text = message.text || message.caption || "";
    const attachments: NormalizedMessage["attachments"] = [];

    if (message.photo) {
      type = "image";
      const photo = message.photo[message.photo.length - 1];  // Largest size
      const file = await ctx.api.getFile(photo.file_id);
      attachments.push({
        type: "image",
        url: `https://api.telegram.org/file/bot${this.bot!.token}/${file.file_path}`,
      });
    } else if (message.voice) {
      type = "audio";
      const file = await ctx.api.getFile(message.voice.file_id);
      attachments.push({
        type: "audio",
        url: `https://api.telegram.org/file/bot${this.bot!.token}/${file.file_path}`,
        mimeType: message.voice.mime_type,
      });
    } else if (message.audio) {
      type = "audio";
      const file = await ctx.api.getFile(message.audio.file_id);
      attachments.push({
        type: "audio",
        url: `https://api.telegram.org/file/bot${this.bot!.token}/${file.file_path}`,
        filename: message.audio.file_name,
        mimeType: message.audio.mime_type,
      });
    } else if (message.document) {
      type = "file";
      const file = await ctx.api.getFile(message.document.file_id);
      attachments.push({
        type: "file",
        url: `https://api.telegram.org/file/bot${this.bot!.token}/${file.file_path}`,
        filename: message.document.file_name,
        mimeType: message.document.mime_type,
      });
    }

    return {
      id: `telegram_${message.message_id}`,
      externalId: message.message_id.toString(),
      conversationId: message.chat.id.toString(),
      organizationId: this.organizationId,
      connectionId: this.connectionId,
      channel: "telegram",
      type,
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
      sender: {
        id: message.from?.id.toString() || "",
        name: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") || undefined,
        username: message.from?.username,
      },
      isFromBot: message.from?.is_bot || false,
      timestamp: new Date(message.date * 1000),
      replyTo: message.reply_to_message?.message_id?.toString(),
      metadata: {
        chatType: message.chat.type,
        chatTitle: "title" in message.chat ? message.chat.title : undefined,
      },
    };
  }

  private updateStatus(status: ChannelConnectionStatus["status"], error?: string): void {
    this.status = {
      connected: status === "connected",
      status,
      lastConnected: status === "connected" ? new Date() : this.status.lastConnected,
      error,
    };
    this.emit("status", this.status);
  }
}
```

**Effort**: 6-8 hours

### 1.4 Discord Adapter (discord.js)

**Reference**: Moltbot's `src/channels/discord/index.ts` uses [discord.js](https://discord.js.org/)

**File**: `/src/channels/discord/adapter.ts` (NEW)

```typescript
/**
 * Discord Channel Adapter
 *
 * Multi-tenant Discord bot integration using discord.js.
 * Each organization can create their own Discord bot or use shared.
 *
 * EXTRACTED FROM: Moltbot src/channels/discord/
 * LICENSE: MIT
 */

import {
  Client,
  GatewayIntentBits,
  Message,
  TextChannel,
  PartialMessage,
} from "discord.js";
import { EventEmitter } from "events";
import { logger } from "../../utils/logger";
import {
  ChannelAdapter,
  NormalizedMessage,
  SendMessageOptions,
  SendMessageResult,
  ChannelConnectionStatus,
  ChannelCredentials,
} from "../types";

export class DiscordAdapter extends EventEmitter implements ChannelAdapter {
  readonly channel = "discord" as const;

  private organizationId: string;
  private connectionId: string;
  private client: Client | null = null;
  private guildIds: Set<string> | null = null;
  private status: ChannelConnectionStatus = {
    connected: false,
    status: "disconnected",
  };

  constructor(organizationId: string, connectionId: string) {
    super();
    this.organizationId = organizationId;
    this.connectionId = connectionId;
  }

  async connect(credentials: ChannelCredentials): Promise<void> {
    if (!credentials.discord?.botToken) {
      throw new Error("Discord bot token not provided");
    }

    logger.info("Connecting Discord adapter", {
      organizationId: this.organizationId,
    });

    this.updateStatus("connecting");

    // Store guild filter if provided
    if (credentials.discord.guildIds?.length) {
      this.guildIds = new Set(credentials.discord.guildIds);
    }

    try {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
      });

      // Handle ready event
      this.client.once("ready", () => {
        this.updateStatus("connected");
        logger.info("Discord bot ready", {
          organizationId: this.organizationId,
          username: this.client?.user?.username,
          guilds: this.client?.guilds.cache.size,
        });
      });

      // Handle messages
      this.client.on("messageCreate", async (message) => {
        // Skip bot messages
        if (message.author.bot) return;

        // Filter by guild if configured
        if (this.guildIds && message.guild && !this.guildIds.has(message.guild.id)) {
          return;
        }

        try {
          const normalized = await this.normalizeMessage(message);
          if (normalized) {
            this.emit("message", normalized);
          }
        } catch (error) {
          logger.error("Failed to process Discord message", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      // Handle errors
      this.client.on("error", (error) => {
        logger.error("Discord client error", {
          organizationId: this.organizationId,
          error: error.message,
        });
        this.emit("error", error);
      });

      // Handle disconnection
      this.client.on("disconnect", () => {
        this.updateStatus("disconnected");
        logger.warn("Discord disconnected", { organizationId: this.organizationId });
      });

      await this.client.login(credentials.discord.botToken);

    } catch (error) {
      logger.error("Failed to connect Discord", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.updateStatus("error", error instanceof Error ? error.message : "Connection failed");
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }
    this.updateStatus("disconnected");
    logger.info("Discord adapter disconnected", { organizationId: this.organizationId });
  }

  getStatus(): ChannelConnectionStatus {
    return { ...this.status };
  }

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    if (!this.client || !this.status.connected) {
      return { success: false, error: "Not connected" };
    }

    try {
      const channel = await this.client.channels.fetch(options.conversationId);

      if (!channel || !(channel instanceof TextChannel)) {
        return { success: false, error: "Invalid channel" };
      }

      const messageOptions: any = {};

      if (options.text) {
        messageOptions.content = options.text;
      }

      if (options.replyTo) {
        messageOptions.reply = { messageReference: options.replyTo };
      }

      if (options.attachments?.length) {
        messageOptions.files = options.attachments.map(a => ({
          attachment: a.url,
          name: a.filename,
        }));
      }

      const result = await channel.send(messageOptions);

      return {
        success: true,
        externalId: result.id,
      };
    } catch (error) {
      logger.error("Failed to send Discord message", {
        organizationId: this.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  }

  private async normalizeMessage(message: Message | PartialMessage): Promise<NormalizedMessage | null> {
    if (message.partial) {
      try {
        message = await message.fetch();
      } catch {
        return null;
      }
    }

    let type: NormalizedMessage["type"] = "text";
    const attachments: NormalizedMessage["attachments"] = [];

    // Process attachments
    for (const [, attachment] of message.attachments) {
      const contentType = attachment.contentType || "";

      if (contentType.startsWith("image/")) {
        type = "image";
        attachments.push({
          type: "image",
          url: attachment.url,
          filename: attachment.name || undefined,
          mimeType: contentType,
          size: attachment.size,
        });
      } else if (contentType.startsWith("audio/")) {
        type = "audio";
        attachments.push({
          type: "audio",
          url: attachment.url,
          filename: attachment.name || undefined,
          mimeType: contentType,
          size: attachment.size,
        });
      } else if (contentType.startsWith("video/")) {
        // Note: Video is handled as 'file' type since MessageType doesn't include 'video'
        // The mimeType field preserves the actual content type for rendering
        type = "file";
        attachments.push({
          type: "file",
          url: attachment.url,
          filename: attachment.name || undefined,
          mimeType: contentType,
          size: attachment.size,
        });
      } else {
        attachments.push({
          type: "file",
          url: attachment.url,
          filename: attachment.name || undefined,
          mimeType: contentType,
          size: attachment.size,
        });
      }
    }

    return {
      id: `discord_${message.id}`,
      externalId: message.id,
      conversationId: message.channelId,
      organizationId: this.organizationId,
      connectionId: this.connectionId,
      channel: "discord",
      type,
      text: message.content,
      attachments: attachments.length > 0 ? attachments : undefined,
      sender: {
        id: message.author.id,
        name: message.author.displayName || message.author.username,
        username: message.author.username,
        avatarUrl: message.author.avatarURL() || undefined,
        isBot: message.author.bot,
      },
      isFromBot: message.author.bot,
      timestamp: message.createdAt,
      replyTo: message.reference?.messageId || undefined,
      threadId: message.thread?.id,
      metadata: {
        guildId: message.guildId,
        guildName: message.guild?.name,
        channelName: (message.channel as TextChannel).name,
      },
    };
  }

  private updateStatus(status: ChannelConnectionStatus["status"], error?: string): void {
    this.status = {
      connected: status === "connected",
      status,
      lastConnected: status === "connected" ? new Date() : this.status.lastConnected,
      error,
    };
    this.emit("status", this.status);
  }
}
```

**Effort**: 6-8 hours

### 1.5 Channel Manager (Registry)

**File**: `/src/channels/manager.ts` (NEW)

```typescript
/**
 * Channel Manager
 *
 * Manages channel adapter instances for all organizations.
 * Handles lifecycle, routing, and health monitoring.
 */

import { EventEmitter } from "events";
import { db } from "../db/client";
import { cache } from "../utils/cache";
import { logger } from "../utils/logger";
import { decrypt, encrypt } from "../utils/encryption";
import {
  ChannelAdapter,
  ChannelType,
  NormalizedMessage,
  ChannelConnectionStatus,
  ChannelCredentials,
} from "./types";
import { WhatsAppAdapter } from "./whatsapp/adapter";
import { TelegramAdapter } from "./telegram/adapter";
import { DiscordAdapter } from "./discord/adapter";

const ADAPTER_FACTORIES: Record<ChannelType, new (orgId: string, connId: string) => ChannelAdapter> = {
  whatsapp: WhatsAppAdapter,
  telegram: TelegramAdapter,
  discord: DiscordAdapter,
  teams: null as any,  // TODO: Implement
  slack: null as any,  // Use existing Slack integration
  webchat: null as any,  // TODO: Implement
};

interface ManagedAdapter {
  adapter: ChannelAdapter;
  organizationId: string;
  connectionId: string;
  channel: ChannelType;
  createdAt: Date;
}

export class ChannelManager extends EventEmitter {
  private adapters: Map<string, ManagedAdapter> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  /**
   * Get unique key for an adapter instance.
   */
  private getKey(organizationId: string, channel: ChannelType): string {
    return `${organizationId}:${channel}`;
  }

  /**
   * Start the channel manager.
   * Loads all enabled connections from database.
   */
  async start(): Promise<void> {
    logger.info("Starting channel manager");

    // Load all enabled connections
    const connections = await db.channelConnection.findMany({
      where: { enabled: true },
    });

    for (const conn of connections) {
      try {
        await this.connectChannel(
          conn.organizationId,
          conn.id,
          conn.channel as ChannelType,
          this.decryptCredentials(conn.credentials as Record<string, unknown>),
        );
      } catch (error) {
        logger.error("Failed to connect channel on startup", {
          connectionId: conn.id,
          channel: conn.channel,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Start health check
    this.healthCheckInterval = setInterval(() => this.runHealthCheck(), 60000);

    logger.info("Channel manager started", {
      activeAdapters: this.adapters.size,
    });
  }

  /**
   * Stop the channel manager.
   * Disconnects all adapters gracefully.
   */
  async stop(): Promise<void> {
    logger.info("Stopping channel manager");

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    const disconnectPromises = Array.from(this.adapters.values()).map(async (managed) => {
      try {
        await managed.adapter.disconnect();
      } catch (error) {
        logger.error("Error disconnecting adapter", {
          key: this.getKey(managed.organizationId, managed.channel),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.all(disconnectPromises);
    this.adapters.clear();

    logger.info("Channel manager stopped");
  }

  /**
   * Connect a channel for an organization.
   */
  async connectChannel(
    organizationId: string,
    connectionId: string,
    channel: ChannelType,
    credentials: ChannelCredentials,
  ): Promise<ChannelAdapter> {
    const key = this.getKey(organizationId, channel);

    // Disconnect existing adapter if any
    const existing = this.adapters.get(key);
    if (existing) {
      await existing.adapter.disconnect();
    }

    // Create new adapter
    const AdapterClass = ADAPTER_FACTORIES[channel];
    if (!AdapterClass) {
      throw new Error(`Unsupported channel type: ${channel}`);
    }

    const adapter = new AdapterClass(organizationId, connectionId);

    // Set up event handlers
    adapter.on("message", (msg: NormalizedMessage) => {
      this.emit("message", msg);
    });

    adapter.on("status", async (status: ChannelConnectionStatus) => {
      // Update database
      await db.channelConnection.update({
        where: { id: connectionId },
        data: {
          status: status.status,
          lastConnected: status.lastConnected,
          lastError: status.error,
        },
      });
      this.emit("status", { organizationId, channel, status });
    });

    adapter.on("error", (error: Error) => {
      this.emit("error", { organizationId, channel, error });
    });

    // Connect
    await adapter.connect(credentials);

    // Store adapter
    this.adapters.set(key, {
      adapter,
      organizationId,
      connectionId,
      channel,
      createdAt: new Date(),
    });

    logger.info("Channel connected", { organizationId, channel });

    return adapter;
  }

  /**
   * Disconnect a channel for an organization.
   */
  async disconnectChannel(organizationId: string, channel: ChannelType): Promise<void> {
    const key = this.getKey(organizationId, channel);
    const managed = this.adapters.get(key);

    if (!managed) {
      return;
    }

    await managed.adapter.disconnect();
    this.adapters.delete(key);

    logger.info("Channel disconnected", { organizationId, channel });
  }

  /**
   * Get adapter for sending messages.
   */
  getAdapter(organizationId: string, channel: ChannelType): ChannelAdapter | null {
    const key = this.getKey(organizationId, channel);
    return this.adapters.get(key)?.adapter || null;
  }

  /**
   * Get status of all channels for an organization.
   */
  getOrganizationChannels(organizationId: string): Map<ChannelType, ChannelConnectionStatus> {
    const result = new Map<ChannelType, ChannelConnectionStatus>();

    for (const [key, managed] of this.adapters) {
      if (managed.organizationId === organizationId) {
        result.set(managed.channel, managed.adapter.getStatus());
      }
    }

    return result;
  }

  /**
   * Run health check on all adapters.
   */
  private async runHealthCheck(): Promise<void> {
    for (const [key, managed] of this.adapters) {
      const status = managed.adapter.getStatus();

      if (status.status === "error" || status.status === "disconnected") {
        logger.warn("Unhealthy channel adapter", {
          key,
          status: status.status,
          error: status.error,
        });

        // Attempt reconnection
        try {
          const conn = await db.channelConnection.findUnique({
            where: { id: managed.connectionId },
          });

          if (conn?.enabled) {
            const credentials = this.decryptCredentials(conn.credentials as Record<string, unknown>);
            await managed.adapter.connect(credentials);
          }
        } catch (error) {
          logger.error("Health check reconnection failed", {
            key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  private decryptCredentials(encrypted: Record<string, unknown>): ChannelCredentials {
    // Decrypt sensitive fields
    const decrypted = { ...encrypted };

    // Recursively decrypt string values that look encrypted
    const decryptRecursive = (obj: Record<string, unknown>): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "string" && value.startsWith("enc:")) {
          result[key] = decrypt(value);
        } else if (typeof value === "object" && value !== null) {
          result[key] = decryptRecursive(value as Record<string, unknown>);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    return decryptRecursive(decrypted) as ChannelCredentials;
  }
}

// Singleton instance
let channelManager: ChannelManager | null = null;

export function getChannelManager(): ChannelManager {
  if (!channelManager) {
    channelManager = new ChannelManager();
  }
  return channelManager;
}
```

**Effort**: 4-5 hours

### 1.6 Channel Event Worker

**File**: `/src/workers/channel-event.worker.ts` (NEW)

```typescript
/**
 * Channel Event Worker
 *
 * Processes incoming messages from all channel adapters.
 * Routes to orchestration queue for AI processing.
 */

import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import { NormalizedMessage } from "../channels/types";
import { orchestrationQueue } from "../queue/orchestration.queue";
import { deadLetterQueue } from "../queue/dead-letter.queue";
import { logger } from "../utils/logger";
import { emitJobProgress, PROGRESS_STAGES, PROGRESS_PERCENTAGES } from "../events/job-progress";
import { runWithContext } from "../utils/async-context";
import { resolveExternalUser } from "../services/external-user";
import { db } from "../db/client";

export interface ChannelEventData {
  message: NormalizedMessage;
}

export class ChannelEventWorker extends BaseWorker<ChannelEventData> {
  constructor() {
    super("channel-events", {
      concurrency: 10,
    });
  }

  async process(job: Job<ChannelEventData>): Promise<void> {
    const { message } = job.data;
    const { organizationId } = message;

    return runWithContext({ organizationId }, () => this.processWithContext(job));
  }

  private async processWithContext(job: Job<ChannelEventData>): Promise<void> {
    const { message } = job.data;
    const { id, organizationId, channel, sender, text, conversationId } = message;

    await job.updateProgress(PROGRESS_PERCENTAGES.VALIDATED);

    logger.info(`Processing ${channel} message`, {
      messageId: id,
      organizationId,
      senderId: sender.id,
      textPreview: text.substring(0, 50),
    });

    try {
      // Resolve external user to Nubabel user
      const userResolution = await resolveExternalUser({
        channel,
        externalUserId: sender.id,
        organizationId,
        displayName: sender.name,
        autoProvision: true,  // Auto-create users for channel messages
      });

      if (!userResolution) {
        logger.warn("Failed to resolve external user", {
          channel,
          senderId: sender.id,
        });
        return;
      }

      // Store message in database
      await db.channelMessage.create({
        data: {
          organizationId,
          connectionId: message.connectionId,
          externalId: message.externalId,
          conversationId,
          direction: "inbound",
          messageType: message.type,
          content: text,
          senderType: "user",
          senderExternalId: sender.id,
          senderName: sender.name,
          attachments: message.attachments || [],
          status: "processing",
          timestamp: message.timestamp,
        },
      });

      await job.updateProgress(PROGRESS_PERCENTAGES.PROCESSING);

      // Generate session ID for conversation continuity
      const sessionId = `${channel}_${organizationId}_${conversationId}`;

      // Enqueue for orchestration
      await orchestrationQueue.enqueueOrchestration({
        userRequest: text,
        sessionId,
        organizationId,
        userId: userResolution.userId,
        eventId: id,
        metadata: {
          channel,
          conversationId,
          externalUserId: sender.id,
          attachments: message.attachments,
        },
      });

      await job.updateProgress(PROGRESS_PERCENTAGES.COMPLETED);

      logger.info(`Enqueued orchestration for ${channel} message`, {
        messageId: id,
        sessionId,
      });

    } catch (error: any) {
      logger.error(`Failed to process ${channel} message`, {
        messageId: id,
        error: error.message,
      });

      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        await deadLetterQueue.enqueueFailedJob({
          originalQueue: "channel-events",
          originalJobId: job.id || "",
          jobName: job.name || "",
          jobData: job.data,
          failedReason: error.message,
          attempts: job.attemptsMade,
          timestamp: Date.now(),
        });
      }

      throw error;
    }
  }
}

export const channelEventWorker = new ChannelEventWorker();
```

**Effort**: 3-4 hours

---

## Phase 2: Browser Automation (Priority 2)

### 2.1 Playwright Service

**Reference**: Moltbot's `packages/clawdbot/browser/` and `src/skills/browser/`

**File**: `/src/services/browser/playwright-service.ts` (NEW)

```typescript
/**
 * Playwright Browser Service
 *
 * Multi-tenant browser automation using Playwright.
 * Manages browser instances with per-organization isolation.
 *
 * EXTRACTED FROM: Moltbot packages/clawdbot/browser/
 * LICENSE: MIT
 */

import { chromium, Browser, BrowserContext, Page } from "playwright";
import { logger } from "../../utils/logger";
import { db } from "../../db/client";
import { cache } from "../../utils/cache";

const MAX_SESSIONS_PER_ORG = 3;
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes idle timeout
const MAX_PAGES_PER_SESSION = 10;

interface ManagedSession {
  sessionId: string;
  organizationId: string;
  context: BrowserContext;
  pages: Map<string, Page>;
  lastActiveAt: Date;
  createdAt: Date;
}

export class PlaywrightService {
  private browser: Browser | null = null;
  private sessions: Map<string, ManagedSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    logger.info("Starting Playwright service");

    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), 60000);

    logger.info("Playwright service started");
  }

  async stop(): Promise<void> {
    logger.info("Stopping Playwright service");

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all sessions
    for (const [sessionId, session] of this.sessions) {
      try {
        await session.context.close();
      } catch (error) {
        logger.error("Error closing browser context", { sessionId });
      }
    }
    this.sessions.clear();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    logger.info("Playwright service stopped");
  }

  /**
   * Get or create a browser session for an organization.
   */
  async getSession(organizationId: string): Promise<{ sessionId: string; context: BrowserContext }> {
    if (!this.browser) {
      throw new Error("Playwright service not started");
    }

    // Check existing sessions for this org
    const orgSessions = Array.from(this.sessions.values())
      .filter(s => s.organizationId === organizationId);

    // Reuse existing session if available
    if (orgSessions.length > 0) {
      const session = orgSessions[0];
      session.lastActiveAt = new Date();
      return { sessionId: session.sessionId, context: session.context };
    }

    // Check session limit
    if (orgSessions.length >= MAX_SESSIONS_PER_ORG) {
      throw new Error(`Maximum browser sessions (${MAX_SESSIONS_PER_ORG}) reached for organization`);
    }

    // Create new session
    const sessionId = `browser_${organizationId}_${Date.now()}`;
    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });

    const session: ManagedSession = {
      sessionId,
      organizationId,
      context,
      pages: new Map(),
      lastActiveAt: new Date(),
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    // Track in database
    await db.browserSession.create({
      data: {
        sessionId,
        organizationId,
        status: "idle",
        expiresAt: new Date(Date.now() + SESSION_TIMEOUT_MS),
      },
    });

    logger.info("Created browser session", { sessionId, organizationId });

    return { sessionId, context };
  }

  /**
   * Navigate to a URL.
   */
  async navigate(
    organizationId: string,
    url: string,
    options?: { waitFor?: string; timeout?: number }
  ): Promise<{ title: string; url: string }> {
    const { context } = await this.getSession(organizationId);

    const page = await context.newPage();

    try {
      await page.goto(url, {
        timeout: options?.timeout || 30000,
        waitUntil: "domcontentloaded",
      });

      if (options?.waitFor) {
        await page.waitForSelector(options.waitFor, { timeout: 10000 });
      }

      return {
        title: await page.title(),
        url: page.url(),
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Take a screenshot of a URL.
   */
  async screenshot(
    organizationId: string,
    url: string,
    options?: { selector?: string; fullPage?: boolean; format?: "png" | "jpeg" }
  ): Promise<{ imageBase64: string; width: number; height: number }> {
    const { context } = await this.getSession(organizationId);

    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: "networkidle" });

      const element = options?.selector ? await page.$(options.selector) : null;

      const screenshot = await (element || page).screenshot({
        type: options?.format || "png",
        fullPage: options?.fullPage && !element,
      });

      const viewport = page.viewportSize();

      return {
        imageBase64: screenshot.toString("base64"),
        width: viewport?.width || 1280,
        height: viewport?.height || 720,
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Click an element on a page.
   */
  async click(
    organizationId: string,
    url: string,
    selector: string,
  ): Promise<{ success: boolean; newUrl?: string }> {
    const { context } = await this.getSession(organizationId);

    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.click(selector);
      await page.waitForLoadState("domcontentloaded");

      return {
        success: true,
        newUrl: page.url(),
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Fill a form field.
   */
  async fill(
    organizationId: string,
    url: string,
    selector: string,
    value: string,
  ): Promise<{ success: boolean }> {
    const { context } = await this.getSession(organizationId);

    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.fill(selector, value);

      return { success: true };
    } finally {
      await page.close();
    }
  }

  /**
   * Extract text content from a page.
   */
  async extractText(
    organizationId: string,
    url: string,
    selector?: string,
  ): Promise<{ text: string }> {
    const { context } = await this.getSession(organizationId);

    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });

      const text = selector
        ? await page.textContent(selector) || ""
        : await page.evaluate(() => document.body.innerText);

      return { text };
    } finally {
      await page.close();
    }
  }

  /**
   * Close a session.
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      await session.context.close();
    } catch (error) {
      logger.error("Error closing browser context", { sessionId });
    }

    this.sessions.delete(sessionId);

    await db.browserSession.update({
      where: { sessionId },
      data: { status: "closed" },
    });

    logger.info("Closed browser session", { sessionId });
  }

  /**
   * Cleanup stale sessions.
   */
  private async cleanupStaleSessions(): Promise<void> {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions) {
      const idleTime = now - session.lastActiveAt.getTime();

      if (idleTime > SESSION_TIMEOUT_MS) {
        logger.info("Cleaning up stale browser session", { sessionId, idleTime });
        await this.closeSession(sessionId);
      }
    }
  }
}

// Singleton
let playwrightService: PlaywrightService | null = null;

export function getPlaywrightService(): PlaywrightService {
  if (!playwrightService) {
    playwrightService = new PlaywrightService();
  }
  return playwrightService;
}
```

**Effort**: 6-8 hours

### 2.2 Browser MCP Tools

**File**: `/src/mcp-servers/browser/index.ts` (NEW)

Follow Nubabel's existing MCP server pattern (like GitHub, Notion) to expose browser tools.

**Effort**: 4-5 hours

---

## Phase 3: Voice Capabilities (Priority 3)

### 3.1 Voice Service

**Reference**: Moltbot's `src/skills/voice/` uses ElevenLabs and Whisper

**File**: `/src/services/voice/voice-service.ts` (NEW)

```typescript
/**
 * Voice Service
 *
 * Text-to-speech and speech-to-text capabilities.
 * Integrates ElevenLabs for TTS and Whisper for STT.
 *
 * EXTRACTED FROM: Moltbot src/skills/voice/
 * LICENSE: MIT
 */

import { ElevenLabsClient } from "elevenlabs";
import { Readable } from "stream";
import { logger } from "../../utils/logger";
import { db } from "../../db/client";

export interface TTSOptions {
  text: string;
  voiceId?: string;
  model?: string;
  speed?: number;
}

export interface STTOptions {
  audioBuffer: Buffer;
  language?: string;
  model?: string;
}

export interface TTSResult {
  audioBuffer: Buffer;
  mimeType: string;
  duration?: number;
}

export interface STTResult {
  text: string;
  confidence?: number;
  language?: string;
}

export class VoiceService {
  private elevenLabs: ElevenLabsClient | null = null;
  private whisperApiKey: string | null = null;

  constructor() {
    if (process.env.ELEVENLABS_API_KEY) {
      this.elevenLabs = new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY,
      });
    }

    this.whisperApiKey = process.env.OPENAI_API_KEY || null;
  }

  /**
   * Convert text to speech using ElevenLabs.
   */
  async textToSpeech(
    organizationId: string,
    options: TTSOptions,
  ): Promise<TTSResult> {
    if (!this.elevenLabs) {
      throw new Error("ElevenLabs not configured");
    }

    const voiceId = options.voiceId || process.env.ELEVENLABS_DEFAULT_VOICE || "21m00Tcm4TlvDq8ikWAM";

    logger.info("Generating TTS", {
      organizationId,
      textLength: options.text.length,
      voiceId,
    });

    try {
      const audioStream = await this.elevenLabs.generate({
        voice: voiceId,
        text: options.text,
        model_id: options.model || "eleven_monolingual_v1",
      });

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);

      return {
        audioBuffer,
        mimeType: "audio/mpeg",
      };
    } catch (error) {
      logger.error("TTS generation failed", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Convert speech to text using Whisper API.
   */
  async speechToText(
    organizationId: string,
    options: STTOptions,
  ): Promise<STTResult> {
    if (!this.whisperApiKey) {
      throw new Error("OpenAI API key not configured for Whisper");
    }

    logger.info("Transcribing audio", {
      organizationId,
      audioSize: options.audioBuffer.length,
      language: options.language,
    });

    try {
      const formData = new FormData();
      formData.append("file", new Blob([options.audioBuffer]), "audio.webm");
      formData.append("model", options.model || "whisper-1");
      if (options.language) {
        formData.append("language", options.language);
      }

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.whisperApiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Whisper API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      return {
        text: result.text,
        language: result.language,
      };
    } catch (error) {
      logger.error("STT transcription failed", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if voice services are available.
   */
  getCapabilities(): { tts: boolean; stt: boolean } {
    return {
      tts: this.elevenLabs !== null,
      stt: this.whisperApiKey !== null,
    };
  }

  /**
   * Track voice API usage for billing.
   */
  private async trackUsage(
    organizationId: string,
    provider: "elevenlabs" | "openai-whisper",
    operation: "tts" | "stt",
    metrics: { characterCount?: number; durationMs?: number },
    sessionId?: string,
    messageId?: string,
  ): Promise<void> {
    // Calculate cost in cents based on provider pricing
    let costCents = 0;

    if (provider === "elevenlabs" && metrics.characterCount) {
      // ElevenLabs: ~$0.30 per 1000 characters (Starter tier)
      // Adjust based on actual tier pricing
      costCents = Math.ceil((metrics.characterCount / 1000) * 30);
    } else if (provider === "openai-whisper" && metrics.durationMs) {
      // Whisper: $0.006 per minute
      const minutes = metrics.durationMs / 60000;
      costCents = Math.ceil(minutes * 0.6);  // 0.6 cents per minute
    }

    await db.voiceUsageRecord.create({
      data: {
        organizationId,
        provider,
        operation,
        characterCount: metrics.characterCount,
        durationMs: metrics.durationMs,
        costCents,
        sessionId,
        messageId,
      },
    });

    // Update organization's monthly spend
    await db.organization.update({
      where: { id: organizationId },
      data: {
        currentMonthSpendCents: {
          increment: costCents,
        },
      },
    });

    logger.debug("Tracked voice usage", {
      organizationId,
      provider,
      operation,
      costCents,
    });
  }

  /**
   * Check if organization has budget for voice operation.
   */
  async checkBudget(
    organizationId: string,
    estimatedCostCents: number,
  ): Promise<{ allowed: boolean; remainingCents: number; reason?: string }> {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        monthlyBudgetCents: true,
        currentMonthSpendCents: true,
      },
    });

    if (!org) {
      return { allowed: false, remainingCents: 0, reason: "Organization not found" };
    }

    // No budget limit set = unlimited
    if (org.monthlyBudgetCents === null) {
      return { allowed: true, remainingCents: Infinity };
    }

    const remainingCents = org.monthlyBudgetCents - org.currentMonthSpendCents;

    if (remainingCents < estimatedCostCents) {
      return {
        allowed: false,
        remainingCents,
        reason: `Insufficient budget: ${remainingCents} cents remaining, ${estimatedCostCents} cents needed`,
      };
    }

    return { allowed: true, remainingCents };
  }
}

// Singleton
let voiceService: VoiceService | null = null;

export function getVoiceService(): VoiceService {
  if (!voiceService) {
    voiceService = new VoiceService();
  }
  return voiceService;
}
```

**Effort**: 5-6 hours (includes budget tracking)

---

## Phase 4: Implementation Details

### 4.1 File Structure (Post-Absorption)

```
src/
├── channels/                    # NEW: Channel adapters
│   ├── types.ts                 # Unified channel types
│   ├── manager.ts               # Channel lifecycle management
│   ├── whatsapp/
│   │   ├── adapter.ts           # WhatsApp adapter (Baileys)
│   │   └── types.ts
│   ├── telegram/
│   │   ├── adapter.ts           # Telegram adapter (grammY)
│   │   └── types.ts
│   ├── discord/
│   │   ├── adapter.ts           # Discord adapter (discord.js)
│   │   └── types.ts
│   └── teams/
│       ├── adapter.ts           # Teams adapter
│       └── types.ts
├── services/
│   ├── browser/                 # NEW: Browser automation
│   │   └── playwright-service.ts
│   ├── voice/                   # NEW: Voice capabilities
│   │   └── voice-service.ts
│   └── external-user.ts         # Existing (from integration plan)
├── mcp-servers/
│   ├── browser/                 # NEW: Browser MCP tools
│   │   ├── index.ts
│   │   └── tools.ts
│   └── voice/                   # NEW: Voice MCP tools
│       ├── index.ts
│       └── tools.ts
├── workers/
│   └── channel-event.worker.ts  # NEW: Channel message worker
├── queue/
│   └── channel-event.queue.ts   # NEW: Channel event queue
└── api/
    └── channels.ts              # NEW: Channel management API
```

### 4.2 Dependencies to Add

```json
{
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.0",
    "grammy": "^1.27.0",
    "discord.js": "^14.15.0",
    "playwright": "^1.44.0",
    "elevenlabs": "^0.14.0"
  }
}
```

### 4.3 Environment Variables

```bash
# Channel Adapters
# CRITICAL: WHATSAPP_AUTH_PATH must be a persistent volume in containers
# Default: /tmp/whatsapp-auth (local dev only - NOT suitable for production!)
# Production: Use a persistent volume mount, e.g., /data/whatsapp-auth
WHATSAPP_AUTH_PATH=/data/whatsapp-auth

TELEGRAM_WEBHOOK_BASE_URL=https://api.nubabel.com/webhooks/telegram
DISCORD_DEFAULT_APPLICATION_ID=

# Browser Automation
PLAYWRIGHT_MAX_SESSIONS_PER_ORG=3
PLAYWRIGHT_SESSION_TIMEOUT_MS=300000

# Voice Services
ELEVENLABS_API_KEY=
ELEVENLABS_DEFAULT_VOICE=21m00Tcm4TlvDq8ikWAM
OPENAI_API_KEY=  # For Whisper STT
```

**Container Deployment Note**: The `WHATSAPP_AUTH_PATH` MUST point to a persistent volume. If the container restarts and auth state is lost, all organizations will need to re-scan their WhatsApp QR codes. Example Kubernetes volume mount:

```yaml
volumes:
  - name: whatsapp-auth
    persistentVolumeClaim:
      claimName: whatsapp-auth-pvc
volumeMounts:
  - name: whatsapp-auth
    mountPath: /data/whatsapp-auth
```

---

## Testing Strategy

### Unit Tests

| Component | Test File | Coverage Target |
|-----------|-----------|-----------------|
| Message normalization | `__tests__/channels/normalizer.test.ts` | 90% |
| WhatsApp adapter | `__tests__/channels/whatsapp.test.ts` | 80% |
| Telegram adapter | `__tests__/channels/telegram.test.ts` | 80% |
| Discord adapter | `__tests__/channels/discord.test.ts` | 80% |
| Playwright service | `__tests__/services/playwright.test.ts` | 75% |
| Voice service | `__tests__/services/voice.test.ts` | 75% |

### Integration Tests

1. **Channel Flow**: Message received → Normalized → Queued → Orchestrated → Response sent
2. **Multi-tenant Isolation**: Org A messages don't leak to Org B
3. **Session Persistence**: WhatsApp reconnects maintain auth state
4. **Rate Limiting**: Per-org limits enforced

### E2E Tests

1. WhatsApp sandbox testing (Meta Business Platform)
2. Telegram BotFather test bot
3. Discord test server

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Baileys library breaking changes | Medium | High | Pin version, monitor releases |
| WhatsApp ban risk | Medium | High | Follow WhatsApp Business guidelines |
| Rate limiting by platforms | High | Medium | Per-org rate limits, queuing |
| Session state corruption | Low | High | Backup auth states, graceful recovery |
| Memory leaks in Playwright | Medium | Medium | Session timeouts, monitoring |

### Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Increased infrastructure cost | Medium | Medium | Resource monitoring, auto-scaling |
| Support complexity | High | Medium | Documentation, admin UI |
| Compliance (GDPR, etc.) | Medium | High | Data retention policies, audit logs |

---

## Effort Estimates Summary

**NOTE**: Estimates include 25% buffer for integration issues, debugging, and unforeseen complications.

| Phase | Component | Base (hours) | With Buffer |
|-------|-----------|--------------|-------------|
| **Pre-Phase** | External user service | 2-3 | 3-4 |
| **Phase 1** | Core types and interfaces | 2 | 2-3 |
| | WhatsApp adapter (includes QR flow, reconnection) | 10-12 | 12-15 |
| | Telegram adapter | 6-8 | 8-10 |
| | Discord adapter | 6-8 | 8-10 |
| | Teams adapter | 6-8 | 8-10 |
| | Channel manager | 4-5 | 5-6 |
| | Channel event worker | 3-4 | 4-5 |
| | Voice cost tracking (VoiceUsageRecord) | 2-3 | 3-4 |
| | Testing (unit + integration) | 10-12 | 12-15 |
| | **Phase 1 Total** | **51-65** | **65-82 hours** |
| **Phase 2** | Playwright service | 6-8 | 8-10 |
| | Browser MCP tools | 4-5 | 5-6 |
| | Testing | 4-5 | 5-6 |
| | **Phase 2 Total** | **14-18** | **18-22 hours** |
| **Phase 3** | Voice service (TTS/STT) | 4-5 | 5-6 |
| | Voice MCP tools | 3-4 | 4-5 |
| | Voice budget enforcement | 2-3 | 3-4 |
| | Testing | 3-4 | 4-5 |
| | **Phase 3 Total** | **12-16** | **16-20 hours** |
| **Phase 4** | Web scraping skills | 4-6 | 5-8 |
| | File conversion skills | 4-6 | 5-8 |
| | **Phase 4 Total** | **8-12** | **10-16 hours** |

**Grand Total**: **109-140 hours (3-4 weeks)**

### Effort Justification

| Component | Why Higher Than Initial |
|-----------|------------------------|
| WhatsApp adapter | QR code UI flow, session persistence, reconnection edge cases, multi-tenant session conflicts |
| Testing | Need both unit tests AND integration tests with mock services |
| Voice budget | New VoiceUsageRecord table + budget enforcement logic per-org |
| Pre-Phase | ExternalUserMapping service is a critical dependency |

---

## Commit Strategy

### Phase 1 Commits

```
feat(channels): add unified channel adapter interface and types

- Define NormalizedMessage, ChannelAdapter interfaces
- Add ChannelConnection and ChannelMessage database models
- Create channel type definitions for WhatsApp, Telegram, Discord, Teams
```

```
feat(channels): implement WhatsApp adapter using Baileys

EXTRACTED FROM: Moltbot src/channels/whatsapp/
LICENSE: MIT

- Multi-tenant WhatsApp Web integration
- QR code authentication flow
- Message normalization (text, image, audio, file)
- Automatic reconnection with exponential backoff
```

```
feat(channels): implement Telegram adapter using grammY

EXTRACTED FROM: Moltbot src/channels/telegram/
LICENSE: MIT

- Multi-tenant Telegram bot integration
- Support for webhook and polling modes
- Media attachment handling
```

```
feat(channels): implement Discord adapter using discord.js

EXTRACTED FROM: Moltbot src/channels/discord/
LICENSE: MIT

- Multi-tenant Discord bot integration
- Guild filtering for organization isolation
- Rich message type support
```

```
feat(channels): add ChannelManager for adapter lifecycle

- Centralized adapter registry and lifecycle management
- Health monitoring and auto-reconnection
- Per-organization channel status API
```

### Phase 2 Commits

```
feat(browser): add Playwright service for browser automation

EXTRACTED FROM: Moltbot packages/clawdbot/browser/
LICENSE: MIT

- Per-organization session isolation
- Navigate, screenshot, click, fill operations
- Automatic session cleanup
- Resource limits (sessions per org, pages per session)
```

### Phase 3 Commits

```
feat(voice): add voice service for TTS/STT capabilities

EXTRACTED FROM: Moltbot src/skills/voice/
LICENSE: MIT

- ElevenLabs integration for text-to-speech
- Whisper API integration for speech-to-text
- Per-organization usage tracking
```

---

## Success Criteria

### Phase 1 (Channels)

- [ ] WhatsApp messages flow end-to-end in test environment
- [ ] Telegram messages flow end-to-end with test bot
- [ ] Discord messages flow end-to-end in test server
- [ ] Multi-tenant isolation verified (Org A can't access Org B)
- [ ] Session persistence works across restarts
- [ ] Rate limiting enforced per organization

### Phase 2 (Browser)

- [ ] Screenshot tool works for arbitrary URLs
- [ ] Navigate + click flow works
- [ ] Form filling works
- [ ] Session cleanup prevents memory leaks

### Phase 3 (Voice)

- [ ] TTS generates audio from text
- [ ] STT transcribes audio to text
- [ ] Voice files can be sent via channels

---

## PLAN_READY

This plan provides a comprehensive extraction and absorption strategy for Moltbot's high-value modules into Nubabel's multi-tenant architecture. Key differentiators from the integration plan:

1. **Full Code Ownership**: We extract and adapt code, not integrate with running service
2. **Multi-Tenant by Design**: All adapters support per-organization credentials and isolation
3. **Nubabel Patterns**: Follows existing MCP server patterns, BullMQ queues, Prisma models
4. **No Runtime Dependency**: Moltbot is REFERENCE only, not a required running service

### Critic Review Fixes (v2)

| Issue | Resolution |
|-------|------------|
| Missing `resolveExternalUser` | Added Pre-Phase with full service implementation + ExternalUserMapping table |
| Incomplete database schema | Added proper relations: ChannelMessage→Organization, BrowserSession→Organization, User→ExternalUserMapping |
| WhatsApp multi-tenant model unclear | Added detailed section on one-number-per-org model with session conflict handling |
| Voice cost tracking missing | Added VoiceUsageRecord table + budget enforcement in VoiceService |
| Hardcoded auth path | Changed to `process.env.WHATSAPP_AUTH_PATH` with fallback + container deployment docs |
| scheduleReconnect loses credentials | Added `lastCredentials` storage + validation before reconnect |
| Discord type casting | Fixed video type to use 'file' with proper mimeType |
| Effort estimates | Added 25% buffer, increased estimates with justification |

**Recommended Implementation Order**:
1. Database migrations (all tables including ExternalUserMapping, VoiceUsageRecord)
2. External user resolution service (Pre-Phase - REQUIRED FIRST)
3. Core types and interfaces
4. WhatsApp adapter (highest demand)
5. Telegram adapter (good documentation)
6. Discord adapter (developer community)
7. Channel manager + worker
8. Voice service with budget tracking
9. Browser automation (Phase 2)
10. Voice capabilities (Phase 3)
