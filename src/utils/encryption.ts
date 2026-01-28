/**
 * Encryption Utility for Credential Storage
 *
 * Uses AES-256-GCM for at-rest encryption of sensitive credentials.
 * Environment variable: CREDENTIAL_ENCRYPTION_KEY (base64 encoded 32 bytes)
 *
 * Features:
 * - AES-256-GCM encryption with random IV
 * - Backward compatibility: plaintext values still work
 * - Encrypted values prefixed with "enc:" for detection
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = "enc:";

/**
 * Get encryption key from environment variable.
 * Returns null if not configured (encryption disabled).
 */
function getEncryptionKey(): Buffer | null {
  const keyBase64 = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!keyBase64) {
    return null;
  }

  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (256 bits) when decoded from base64",
    );
  }

  return key;
}

/**
 * Check if a value is encrypted (has the enc: prefix).
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CREDENTIAL_ENCRYPTION_KEY is required in production. " +
          "Generate with: openssl rand -base64 32",
      );
    }
    return plaintext;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: enc:<iv>:<authTag>:<encrypted> (all base64)
  const result = `${ENCRYPTED_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;

  return result;
}

/**
 * Decrypt an encrypted value.
 * Handles backward compatibility: if value is not encrypted, returns as-is.
 */
export function decrypt(value: string): string {
  // Backward compatibility: if not encrypted, return as-is
  if (!isEncrypted(value)) {
    return value;
  }

  const key = getEncryptionKey();
  if (!key) {
    // Encryption key not configured but value is encrypted
    throw new Error("Cannot decrypt: CREDENTIAL_ENCRYPTION_KEY not configured");
  }

  // Parse: enc:<iv>:<authTag>:<encrypted>
  const withoutPrefix = value.slice(ENCRYPTED_PREFIX.length);
  const parts = withoutPrefix.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }

  const [ivBase64, authTagBase64, encryptedBase64] = parts;
  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length");
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid auth tag length");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Encrypt a value only if it's not already encrypted.
 * Useful for upsert operations.
 */
export function encryptIfNeeded(value: string): string {
  if (isEncrypted(value)) {
    return value;
  }
  return encrypt(value);
}

/**
 * Check if encryption is enabled (key is configured).
 */
export function isEncryptionEnabled(): boolean {
  return getEncryptionKey() !== null;
}
