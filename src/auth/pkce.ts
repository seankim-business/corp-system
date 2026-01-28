import crypto from "crypto";

/**
 * PKCE (Proof Key for Code Exchange) implementation for OAuth 2.1
 * RFC 7636: https://tools.ietf.org/html/rfc7636
 */

/**
 * Generate a code verifier (43-128 characters, unreserved characters only)
 * Uses 32 random bytes encoded as base64url for maximum entropy
 */
export function generateCodeVerifier(): string {
  const randomBytes = crypto.randomBytes(32);
  return base64UrlEncode(randomBytes);
}

/**
 * Generate a code challenge from a verifier using SHA256 (S256 method)
 * This is the recommended method for PKCE
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Verify that a code verifier matches a code challenge
 * Used during token exchange to validate PKCE
 */
export function verifyCodeChallenge(verifier: string, challenge: string): boolean {
  const computedChallenge = generateCodeChallenge(verifier);
  return computedChallenge === challenge;
}

/**
 * Base64url encode (RFC 4648 Section 5)
 * Removes padding and uses URL-safe characters
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Validate code verifier format (43-128 unreserved characters)
 */
export function isValidCodeVerifier(verifier: string): boolean {
  // RFC 7636: code_verifier = 43*128unreserved
  // unreserved = ALPHA / DIGIT / "-" / "." / "_" / "~"
  const unreservedPattern = /^[A-Za-z0-9\-._~]{43,128}$/;
  return unreservedPattern.test(verifier);
}
