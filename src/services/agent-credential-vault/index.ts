/**
 * Agent Credential Vault Service
 * Secure storage for per-agent integration credentials
 * Uses existing encryption.service.ts for AES-256-GCM encryption
 */

import { PrismaClient } from "@prisma/client";
import { logger } from "../../utils/logger";
import { encryptToString, decryptFromString, generateCredentialRef } from "../encryption.service";
import { redis } from "../../db/redis";
import crypto from "crypto";

const prisma = new PrismaClient();

// ============================================================================
// Types
// ============================================================================

export interface Credential {
  name: string;
  type: "oauth_token" | "api_key" | "token" | "password";
  value: string;
  scopes?: string[];
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface DecryptedCredential {
  id: string;
  provider: string;
  name: string;
  type: string;
  value: string;
  scopes: string[];
  expiresAt: Date | null;
}

export interface OAuthFlowURL {
  url: string;
  state: string;
}

export interface AgentOAuthState {
  organizationId: string;
  userId: string;
  agentId: string;
  provider: string;
  nonce: string;
  timestamp: number;
}

// ============================================================================
// Agent Credential Vault Service
// ============================================================================

export class AgentCredentialVault {
  /**
   * Store a credential for an agent (encrypted)
   */
  async storeCredential(
    agentId: string,
    provider: string,
    credential: Credential
  ): Promise<string> {
    // Get agent's org for the record
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { organizationId: true },
    });

    if (!agent) {
      throw new Error("Agent not found");
    }

    const credentialId = generateCredentialRef();

    // Encrypt the credential payload
    const payload = JSON.stringify({
      value: credential.value,
      type: credential.type,
      scopes: credential.scopes || [],
      metadata: credential.metadata || {},
    });

    const encrypted = encryptToString(payload);

    await prisma.agentCredential.create({
      data: {
        id: credentialId,
        agentId,
        organizationId: agent.organizationId,
        provider,
        name: credential.name,
        credentialType: credential.type,
        encryptedData: encrypted,
        scopes: credential.scopes || [],
        expiresAt: credential.expiresAt,
        enabled: true,
      },
    });

    logger.info("Stored agent credential", {
      agentId,
      provider,
      credentialId,
      name: credential.name,
    });

    return credentialId;
  }

  /**
   * Store a refresh token separately (for OAuth)
   */
  async storeRefreshToken(
    agentId: string,
    provider: string,
    data: { value: string; expiresAt: Date | null }
  ): Promise<string> {
    return this.storeCredential(agentId, provider, {
      name: `${provider}_refresh_token`,
      type: "token",
      value: data.value,
      expiresAt: data.expiresAt || undefined,
    });
  }

  /**
   * Get a credential by ID (decrypted)
   */
  async getCredential(credentialId: string): Promise<DecryptedCredential | null> {
    const record = await prisma.agentCredential.findUnique({
      where: { id: credentialId },
    });

    if (!record || !record.enabled) {
      return null;
    }

    try {
      const decrypted = decryptFromString(record.encryptedData);
      const payload = JSON.parse(decrypted);

      // Update last used timestamp
      await prisma.agentCredential.update({
        where: { id: credentialId },
        data: { lastUsedAt: new Date() },
      });

      return {
        id: record.id,
        provider: record.provider,
        name: record.name,
        type: record.credentialType,
        value: payload.value,
        scopes: payload.scopes || record.scopes,
        expiresAt: record.expiresAt,
      };
    } catch (error) {
      logger.error("Failed to decrypt credential", {
        credentialId,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }

  /**
   * Get all credentials for an agent (decrypted)
   */
  async getAgentCredentials(agentId: string): Promise<DecryptedCredential[]> {
    const records = await prisma.agentCredential.findMany({
      where: { agentId, enabled: true },
    });

    const credentials: DecryptedCredential[] = [];

    for (const record of records) {
      try {
        const decrypted = decryptFromString(record.encryptedData);
        const payload = JSON.parse(decrypted);

        credentials.push({
          id: record.id,
          provider: record.provider,
          name: record.name,
          type: record.credentialType,
          value: payload.value,
          scopes: payload.scopes || record.scopes,
          expiresAt: record.expiresAt,
        });
      } catch (error) {
        logger.warn("Failed to decrypt credential, skipping", {
          credentialId: record.id,
          agentId,
        });
      }
    }

    return credentials;
  }

  /**
   * Get credentials for a specific provider
   */
  async getAgentCredentialsByProvider(
    agentId: string,
    provider: string
  ): Promise<DecryptedCredential[]> {
    const all = await this.getAgentCredentials(agentId);
    return all.filter((c) => c.provider === provider);
  }

  /**
   * Rotate a credential (replace with new value)
   */
  async rotateCredential(credentialId: string, newCredential: Credential): Promise<void> {
    const record = await prisma.agentCredential.findUnique({
      where: { id: credentialId },
    });

    if (!record) {
      throw new Error("Credential not found");
    }

    const payload = JSON.stringify({
      value: newCredential.value,
      type: newCredential.type,
      scopes: newCredential.scopes || [],
      metadata: newCredential.metadata || {},
    });

    const encrypted = encryptToString(payload);

    await prisma.agentCredential.update({
      where: { id: credentialId },
      data: {
        encryptedData: encrypted,
        expiresAt: newCredential.expiresAt,
        scopes: newCredential.scopes || [],
        lastError: null,
        updatedAt: new Date(),
      },
    });

    logger.info("Rotated agent credential", { credentialId });
  }

  /**
   * Revoke/disable a credential
   */
  async revokeCredential(credentialId: string): Promise<void> {
    await prisma.agentCredential.update({
      where: { id: credentialId },
      data: { enabled: false, updatedAt: new Date() },
    });

    logger.info("Revoked agent credential", { credentialId });
  }

  /**
   * Delete a credential permanently
   */
  async deleteCredential(credentialId: string): Promise<void> {
    await prisma.agentCredential.delete({
      where: { id: credentialId },
    });

    logger.info("Deleted agent credential", { credentialId });
  }

  /**
   * List credentials for an agent (masked, for UI)
   */
  async listAgentCredentials(agentId: string): Promise<Array<{
    id: string;
    provider: string;
    name: string;
    type: string;
    enabled: boolean;
    expiresAt: Date | null;
    lastUsedAt: Date | null;
    scopes: string[];
  }>> {
    const records = await prisma.agentCredential.findMany({
      where: { agentId },
      select: {
        id: true,
        provider: true,
        name: true,
        credentialType: true,
        enabled: true,
        expiresAt: true,
        lastUsedAt: true,
        scopes: true,
      },
    });

    return records.map((r) => ({
      id: r.id,
      provider: r.provider,
      name: r.name,
      type: r.credentialType,
      enabled: r.enabled,
      expiresAt: r.expiresAt,
      lastUsedAt: r.lastUsedAt,
      scopes: r.scopes,
    }));
  }

  // ============================================================================
  // OAuth Flow Handling
  // ============================================================================

  /**
   * Encode OAuth state with agent context
   */
  async encodeAgentOAuthState(params: {
    organizationId: string;
    userId: string;
    agentId: string;
    provider: string;
  }): Promise<string> {
    const nonce = crypto.randomUUID();
    const timestamp = Date.now();

    const state: AgentOAuthState = {
      ...params,
      nonce,
      timestamp,
    };

    // Store in Redis for validation (10 min TTL)
    await redis.set(
      `agent_oauth_state:${nonce}`,
      JSON.stringify(state),
      600
    );

    return Buffer.from(JSON.stringify(state)).toString("base64url");
  }

  /**
   * Decode and validate OAuth state
   */
  async decodeAgentOAuthState(encoded: string): Promise<AgentOAuthState | null> {
    try {
      const state: AgentOAuthState = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf-8")
      );

      // Check not expired (10 minutes)
      if (Date.now() - state.timestamp > 10 * 60 * 1000) {
        logger.warn("OAuth state expired", { nonce: state.nonce });
        return null;
      }

      // Validate nonce exists in Redis
      const stored = await redis.get(`agent_oauth_state:${state.nonce}`);
      if (!stored) {
        logger.warn("OAuth state nonce not found", { nonce: state.nonce });
        return null;
      }

      // Delete nonce (single use)
      await redis.del(`agent_oauth_state:${state.nonce}`);

      return state;
    } catch (error) {
      logger.error("Failed to decode OAuth state", {
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }

  /**
   * Record an error on a credential
   */
  async recordCredentialError(credentialId: string, error: string): Promise<void> {
    await prisma.agentCredential.update({
      where: { id: credentialId },
      data: { lastError: error, updatedAt: new Date() },
    });
  }

  /**
   * Check if a credential needs refresh (OAuth)
   */
  async needsRefresh(credentialId: string): Promise<boolean> {
    const record = await prisma.agentCredential.findUnique({
      where: { id: credentialId },
      select: { expiresAt: true },
    });

    if (!record || !record.expiresAt) {
      return false;
    }

    // Refresh if expires within 5 minutes
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    return record.expiresAt < fiveMinutesFromNow;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const agentCredentialVault = new AgentCredentialVault();
export default agentCredentialVault;
