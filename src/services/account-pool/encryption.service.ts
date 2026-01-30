import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ACCOUNT_ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

export class EncryptionService {
  /**
   * Encrypt a plaintext string
   */
  static encrypt(plaintext: string): string {
    const key = Buffer.from(ENCRYPTION_KEY, "hex");
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const tag = cipher.getAuthTag();

    // Format: iv:tag:ciphertext (all hex encoded)
    return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt an encrypted string
   */
  static decrypt(encryptedData: string): string {
    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const [ivHex, tagHex, ciphertext] = parts;
    const key = Buffer.from(ENCRYPTION_KEY, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Check if encryption key is properly configured
   */
  static isConfigured(): boolean {
    return !!process.env.ACCOUNT_ENCRYPTION_KEY;
  }
}
