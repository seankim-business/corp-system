/**
 * Encryption Service for sensitive credential storage
 * Uses AES-256-GCM for authenticated encryption
 */
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

// Derive key from master secret using PBKDF2
function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(secret, salt, 100000, 32, "sha256");
}

function getEncryptionSecret(): string {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("ENCRYPTION_SECRET environment variable is required");
  }
  if (secret.length < 32) {
    throw new Error("ENCRYPTION_SECRET must be at least 32 characters");
  }
  return secret;
}

export interface EncryptedData {
  encrypted: string; // Base64 encoded
  iv: string; // Base64 encoded
  authTag: string; // Base64 encoded
  salt: string; // Base64 encoded
}

/**
 * Encrypt sensitive data
 * @param plaintext - Data to encrypt
 * @returns Encrypted data object
 */
export function encrypt(plaintext: string): EncryptedData {
  const secret = getEncryptionSecret();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    salt: salt.toString("base64"),
  };
}

/**
 * Decrypt encrypted data
 * @param data - Encrypted data object
 * @returns Decrypted plaintext
 */
export function decrypt(data: EncryptedData): string {
  const secret = getEncryptionSecret();
  const salt = Buffer.from(data.salt, "base64");
  const key = deriveKey(secret, salt);
  const iv = Buffer.from(data.iv, "base64");
  const authTag = Buffer.from(data.authTag, "base64");
  const encrypted = Buffer.from(data.encrypted, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Encrypt to a single string (for database storage)
 * Format: base64(salt:iv:authTag:encrypted)
 */
export function encryptToString(plaintext: string): string {
  const data = encrypt(plaintext);
  const combined = `${data.salt}:${data.iv}:${data.authTag}:${data.encrypted}`;
  return Buffer.from(combined).toString("base64");
}

/**
 * Decrypt from a single string
 */
export function decryptFromString(encryptedString: string): string {
  const combined = Buffer.from(encryptedString, "base64").toString("utf8");
  const [salt, iv, authTag, encrypted] = combined.split(":");

  if (!salt || !iv || !authTag || !encrypted) {
    throw new Error("Invalid encrypted string format");
  }

  return decrypt({ salt, iv, authTag, encrypted });
}

/**
 * Generate a secure random string for credential references
 */
export function generateCredentialRef(): string {
  return `cred_${crypto.randomBytes(16).toString("hex")}`;
}

/**
 * Hash a value for comparison (non-reversible)
 */
export function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export default {
  encrypt,
  decrypt,
  encryptToString,
  decryptFromString,
  generateCredentialRef,
  hash,
};
