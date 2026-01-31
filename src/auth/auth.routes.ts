import express, { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import rateLimit from "express-rate-limit";
import { AuthService } from "./auth.service";
import { authenticate, requireAuth } from "../middleware/auth.middleware";
import { db } from "../db/client";
import { generateCodeVerifier, generateCodeChallenge } from "./pkce";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { runWithoutRLS } from "../utils/async-context";

const router = express.Router();
const authService = new AuthService();

// Get cookie domain for cross-subdomain auth
// MUST return .nubabel.com for auth.nubabel.com cookies to work on app.nubabel.com
function getCookieDomain(): string | undefined {
  if (process.env.COOKIE_DOMAIN) {
    return process.env.COOKIE_DOMAIN;
  }
  // Fallback: extract root domain from FRONTEND_URL or BASE_URL
  const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL;
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      const hostParts = url.hostname.split(".");
      if (hostParts.length >= 2) {
        const rootDomain = hostParts.slice(-2).join(".");
        logger.warn("COOKIE_DOMAIN not set, using extracted domain", {
          extractedDomain: `.${rootDomain}`,
        });
        return `.${rootDomain}`;
      }
    } catch {
      // Invalid URL
    }
  }
  logger.error("COOKIE_DOMAIN not set - cross-subdomain auth will NOT work!");
  return undefined;
}

function extractIpAddress(req: Request): string | undefined {
  const xForwardedFor = req.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress;
}

const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/google", async (req: Request, res: Response) => {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const returnUrl = (req.query.returnUrl as string) || "/dashboard";

  const sessionId = `pkce:${Date.now()}:${Math.random().toString(36).substring(7)}`;
  // Store verifier and returnUrl together
  const sessionData = JSON.stringify({ verifier, returnUrl });
  // 15 minutes TTL for PKCE session (users may take time on Google auth page)
  const stored = await redis.set(sessionId, sessionData, 900);

  if (!stored) {
    logger.error("Failed to store PKCE session in Redis", { sessionId });
    return res.status(500).send("Failed to initialize authentication session. Please try again.");
  }

  logger.info("PKCE session created", { sessionId });

  let authUrl = googleClient.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    state: sessionId,
  });

  authUrl += `&code_challenge=${challenge}&code_challenge_method=S256`;

  return res.redirect(authUrl);
});

router.get("/google/callback", async (req: Request, res: Response) => {
  const { code, state, error: oauthError } = req.query;

  // Handle OAuth error (user denied access, etc.)
  if (oauthError) {
    logger.warn("OAuth error from Google", { error: oauthError, state });
    const frontendUrl = process.env.FRONTEND_URL || process.env.BASE_URL || "https://nubabel.com";
    return res.redirect(`${frontendUrl}/login?error=${oauthError}`);
  }

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  if (!state) {
    return res.status(400).send("Missing state parameter");
  }

  try {
    logger.info("Processing OAuth callback", { state, hasCode: !!code });

    const sessionData = await redis.get(state as string);
    if (!sessionData) {
      logger.warn("PKCE session not found or expired", {
        state,
        stateType: typeof state,
        stateLength: (state as string).length,
      });
      const frontendUrl = process.env.FRONTEND_URL || process.env.BASE_URL || "https://nubabel.com";
      return res.redirect(`${frontendUrl}/login?error=session_expired`);
    }

    // Parse session data (supports legacy string format and new JSON format)
    let verifier: string;
    let returnUrl = "/dashboard";
    try {
      const parsed = JSON.parse(sessionData);
      verifier = parsed.verifier;
      returnUrl = parsed.returnUrl || "/dashboard";
    } catch {
      // Legacy format: just the verifier string
      verifier = sessionData;
    }

    logger.info("PKCE session validated", { state, returnUrl });
    await redis.del(state as string);

    const ipAddress = extractIpAddress(req);
    const userAgent = req.get("user-agent");

    const result = await authService.loginWithGoogle(
      code as string,
      undefined,
      ipAddress,
      userAgent,
      verifier,
    );

    await authService.storeSessionMetadata({
      userId: result.user.id,
      organizationId: result.organization.id,
      ipAddress,
      userAgent,
      source: "web",
    });

    res.cookie("session", result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1 * 60 * 60 * 1000,
      domain: getCookieDomain(),
    });

    res.cookie("refresh", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: getCookieDomain(),
    });

    const frontendBase = process.env.FRONTEND_URL || process.env.BASE_URL;
    const redirectUrl = `${frontendBase}${returnUrl}`;
    return res.redirect(redirectUrl);
  } catch (error) {
    const err = error as Error & { response?: { data?: unknown } };
    const errorMessage = err.message || "Unknown error";
    const errorDetails = err.response?.data || err.stack;

    logger.error("Google OAuth error", {
      error: errorMessage,
      details: errorDetails,
      state,
      hasCode: !!code,
    });

    const frontendUrl = process.env.FRONTEND_URL || process.env.BASE_URL || "https://nubabel.com";

    if (errorMessage.includes("redirect_uri_mismatch")) {
      return res.redirect(`${frontendUrl}/login?error=redirect_uri_mismatch`);
    }
    if (errorMessage.includes("Unable to determine organization")) {
      return res.redirect(`${frontendUrl}/login?error=no_organization`);
    }
    if (errorMessage.includes("invalid_grant")) {
      return res.redirect(`${frontendUrl}/login?error=code_expired`);
    }

    return res.redirect(
      `${frontendUrl}/login?error=auth_failed&message=${encodeURIComponent(errorMessage)}`,
    );
  }
});

router.post("/register", loginLimiter, async (req: Request, res: Response) => {
  const { email, password, displayName, organizationName, organizationSlug } = req.body;

  if (!email || !password || !organizationName || !organizationSlug) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const ipAddress = extractIpAddress(req);
    const userAgent = req.get("user-agent");

    const result = await authService.registerWithEmail({
      email,
      password,
      displayName,
      organizationName,
      organizationSlug,
    });

    await authService.storeSessionMetadata({
      userId: result.user.id,
      organizationId: result.organization.id,
      ipAddress,
      userAgent,
      source: "web",
    });

    res.cookie("session", result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1 * 60 * 60 * 1000,
      domain: getCookieDomain(),
    });

    res.cookie("refresh", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: getCookieDomain(),
    });

    return res.status(201).json({
      user: result.user,
      organization: result.organization,
      membership: result.membership,
    });
  } catch (error) {
    logger.error("Registration error", { error });
    return res.status(400).json({ error: (error as Error).message });
  }
});

router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    const ipAddress = extractIpAddress(req);
    const userAgent = req.get("user-agent");

    const result = await authService.loginWithEmail(email, password);

    await authService.storeSessionMetadata({
      userId: result.user.id,
      organizationId: result.organization.id,
      ipAddress,
      userAgent,
      source: "web",
    });

    res.cookie("session", result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1 * 60 * 60 * 1000,
      domain: getCookieDomain(),
    });

    res.cookie("refresh", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: getCookieDomain(),
    });

    return res.json({
      user: result.user,
      organization: result.organization,
      membership: result.membership,
    });
  } catch (error) {
    logger.error("Login error", { error });
    return res.status(401).json({ error: "Invalid credentials" });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  const token = req.cookies.session || req.headers.authorization?.split(" ")[1];

  if (token) {
    try {
      const payload = authService.verifySessionToken(token);
      const ttl = Math.max(Math.ceil(((payload as any).exp * 1000 - Date.now()) / 1000), 1);
      await redis.set(`token_blacklist:${token}`, "revoked", ttl);
    } catch {
      // Ignore errors - token may be invalid/expired, but we still clear cookies
    }
  }

  res.clearCookie("session", { domain: getCookieDomain() });
  res.clearCookie("refresh", { domain: getCookieDomain() });
  return res.json({ success: true });
});

router.post("/logout-all", authenticate, requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const SESSION_REVOKE_TTL_SECONDS = 7 * 24 * 60 * 60;

  try {
    const sessions = await db.session.findMany({
      where: { userId },
      select: { id: true },
    });

    for (const session of sessions) {
      await redis.set(`session_revoked:${session.id}`, "revoked", SESSION_REVOKE_TTL_SECONDS);
    }

    await db.session.deleteMany({
      where: { userId },
    });

    res.clearCookie("session", { domain: getCookieDomain() });
    res.clearCookie("refresh", { domain: getCookieDomain() });

    return res.json({
      success: true,
      message: `Logged out from ${sessions.length} session(s)`,
      sessionsRevoked: sessions.length,
    });
  } catch (error) {
    logger.error("Logout all error", { error });
    return res.status(500).json({ error: "Failed to logout from all sessions" });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refresh;

    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token missing" });
    }

    const isBlacklisted = await redis.get(`token_blacklist:${refreshToken}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: "Refresh token revoked" });
    }

    const payload = authService.verifyRefreshToken(refreshToken);

    const user = await db.user.findUnique({ where: { id: payload.userId } });
    // Query membership without RLS since this is part of token refresh flow
    const membership = await runWithoutRLS(() =>
      db.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: payload.organizationId,
            userId: payload.userId,
          },
        },
      }),
    );

    if (!user || !membership) {
      return res.status(401).json({ error: "User not found" });
    }

    const newSessionToken = authService.createSessionToken({
      userId: user.id,
      organizationId: payload.organizationId,
      role: membership.role,
    });

    res.cookie("session", newSessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1 * 60 * 60 * 1000,
      domain: getCookieDomain(),
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/switch-org", authenticate, async (req: Request, res: Response) => {
  const { organizationId } = req.body;

  if (!organizationId) {
    return res.status(400).json({ error: "Organization ID required" });
  }

  try {
    const result = await authService.switchOrganization(req.user!.id, organizationId);

    res.cookie("session", result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1 * 60 * 60 * 1000,
      domain: getCookieDomain(),
    });

    res.cookie("refresh", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: getCookieDomain(),
    });

    const redirectUrl = `https://${result.organization.slug}.${process.env.BASE_DOMAIN}/dashboard`;
    return res.json({ redirectUrl });
  } catch (error) {
    logger.error("Switch org error", { error });
    return res.status(403).json({ error: (error as Error).message });
  }
});

router.get("/me", authenticate, requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const currentOrganizationId = req.user!.organizationId;

  type MembershipWithOrg = Awaited<
    ReturnType<typeof db.membership.findMany<{ include: { organization: true } }>>
  >[number];

  // Query all memberships without RLS context since user can be member of multiple orgs
  const memberships: MembershipWithOrg[] = await runWithoutRLS(() =>
    db.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    }),
  );

  const organizations = memberships.map((m: MembershipWithOrg) => ({
    id: m.organization.id,
    name: m.organization.name,
    domain: m.organization.slug,
  }));

  const currentOrganization =
    organizations.find((o: { id: string }) => o.id === currentOrganizationId) || null;

  const user = {
    id: req.user!.id,
    email: req.user!.email,
    name: req.user!.displayName || req.user!.email?.split("@")[0] || "User",
    picture: req.user!.avatarUrl || undefined,
  };

  res.json({
    user,
    currentOrganization,
    organizations,
    membership: req.membership,
  });
});

// Debug endpoint to check cookie domain configuration
router.get("/debug-cookie-domain", (_req: Request, res: Response) => {
  const cookieDomain = getCookieDomain();
  res.json({
    cookieDomain,
    envCookieDomain: process.env.COOKIE_DOMAIN || "NOT SET",
    frontendUrl: process.env.FRONTEND_URL || "NOT SET",
    baseUrl: process.env.BASE_URL || "NOT SET",
  });
});

export default router;
