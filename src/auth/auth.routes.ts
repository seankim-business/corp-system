import express, { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import rateLimit from "express-rate-limit";
import { AuthService } from "./auth.service";
import { authenticate, requireAuth } from "../middleware/auth.middleware";
import { db } from "../db/client";
import { generateCodeVerifier, generateCodeChallenge } from "./pkce";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

// Helper to get clean cookie domain (strips quotes if present)
function getCookieDomain(): string | undefined {
  const domain = process.env.COOKIE_DOMAIN;
  if (!domain) return undefined;
  // Strip surrounding quotes if present (dotenv issue)
  const cleaned = domain.replace(/^["']|["']$/g, '');
  return cleaned || undefined;
}

const router = express.Router();
const authService = new AuthService();

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

router.get("/google", async (_req: Request, res: Response) => {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);

  const sessionId = `pkce:${Date.now()}:${Math.random().toString(36).substring(7)}`;
  // 15 minutes TTL for PKCE session (users may take time on Google auth page)
  const stored = await redis.set(sessionId, verifier, 900);

  if (!stored) {
    logger.error("Failed to store PKCE session in Redis", { sessionId });
    return res.status(500).send("Failed to initialize authentication session. Please try again.");
  }

  // Verify the session was stored correctly
  const verification = await redis.get(sessionId);
  if (!verification) {
    logger.error("PKCE session verification failed - stored but cannot retrieve", { sessionId });
    return res.status(500).send("Session storage verification failed. Please try again.");
  }

  logger.info("PKCE session created and verified", { sessionId, verifierLength: verifier.length });

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

    // Check if Redis is connected by checking the key exists first
    const keyExists = await redis.exists(state as string);
    logger.info("PKCE key existence check", {
      state,
      keyExists,
      statePrefix: (state as string).substring(0, 20),
    });

    const verifier = await redis.get(state as string);
    if (!verifier) {
      logger.warn("PKCE session not found or expired", {
        state,
        stateType: typeof state,
        stateLength: (state as string).length,
        keyExisted: keyExists,
        redisConnected: keyExists !== undefined,
      });
      const frontendUrl = process.env.FRONTEND_URL || process.env.BASE_URL || "https://nubabel.com";
      return res.redirect(`${frontendUrl}/login?error=session_expired`);
    }

    logger.info("PKCE session validated", { state });
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

    // Redirect to the same domain as the auth server (where the SPA is hosted)
    // BASE_URL is auth.nubabel.com which serves the frontend SPA
    // FRONTEND_URL is nubabel.com which serves the landing page
    const redirectUrl = `${process.env.BASE_URL}/dashboard`;

    const cookieDomain = getCookieDomain();

    logger.info("OAuth login successful, setting cookies and redirecting", {
      userId: result.user.id,
      organizationId: result.organization.id,
      ipAddress,
      userAgent: userAgent?.substring(0, 50),
      redirectUrl,
      cookieDomain: cookieDomain || 'not set (using host default)',
      rawEnvDomain: process.env.COOKIE_DOMAIN,
    });

    // Cookie options - domain is optional, browser defaults to exact host if not set
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      ...(cookieDomain && { domain: cookieDomain }),
    };

    res.cookie("session", result.sessionToken, {
      ...cookieOptions,
      maxAge: 1 * 60 * 60 * 1000, // 1 hour
    });

    res.cookie("refresh", result.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.redirect(redirectUrl);
  } catch (error) {
    logger.error("Google OAuth error", { error });
    return res.status(500).send("Authentication failed");
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

    const cookieDomain = getCookieDomain();
    const registerCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      ...(cookieDomain && { domain: cookieDomain }),
    };

    res.cookie("session", result.sessionToken, {
      ...registerCookieOptions,
      maxAge: 1 * 60 * 60 * 1000,
    });

    res.cookie("refresh", result.refreshToken, {
      ...registerCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
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

    const cookieDomain = getCookieDomain();
    const loginCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      ...(cookieDomain && { domain: cookieDomain }),
    };

    res.cookie("session", result.sessionToken, {
      ...loginCookieOptions,
      maxAge: 1 * 60 * 60 * 1000,
    });

    res.cookie("refresh", result.refreshToken, {
      ...loginCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
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

  const cookieDomain = getCookieDomain();
  const clearOptions = cookieDomain ? { domain: cookieDomain } : {};
  res.clearCookie("session", clearOptions);
  res.clearCookie("refresh", clearOptions);
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

    const cookieDomain = getCookieDomain();
    const clearOptions = cookieDomain ? { domain: cookieDomain } : {};
    res.clearCookie("session", clearOptions);
    res.clearCookie("refresh", clearOptions);

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
    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: payload.organizationId,
          userId: payload.userId,
        },
      },
    });

    if (!user || !membership) {
      return res.status(401).json({ error: "User not found" });
    }

    const newSessionToken = authService.createSessionToken({
      userId: user.id,
      organizationId: payload.organizationId,
      role: membership.role,
    });

    const cookieDomain = getCookieDomain();
    res.cookie("session", newSessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1 * 60 * 60 * 1000,
      ...(cookieDomain && { domain: cookieDomain }),
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

    const cookieDomain = getCookieDomain();
    const switchCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      ...(cookieDomain && { domain: cookieDomain }),
    };

    res.cookie("session", result.sessionToken, {
      ...switchCookieOptions,
      maxAge: 1 * 60 * 60 * 1000,
    });

    res.cookie("refresh", result.refreshToken, {
      ...switchCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const redirectUrl = `https://${result.organization.slug}.${process.env.BASE_DOMAIN}/dashboard`;
    return res.json({ redirectUrl });
  } catch (error) {
    logger.error("Switch org error", { error });
    return res.status(403).json({ error: (error as Error).message });
  }
});

router.get("/health", async (_req: Request, res: Response) => {
  try {
    const testKey = `health:${Date.now()}`;
    const setResult = await redis.set(testKey, "test", 10);
    const getResult = await redis.get(testKey);
    await redis.del(testKey);

    const isHealthy = setResult && getResult === "test";

    res.json({
      status: isHealthy ? "healthy" : "degraded",
      redis: {
        set: setResult,
        get: getResult === "test",
        connected: isHealthy,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Health check failed", { error });
    res.status(503).json({
      status: "unhealthy",
      redis: { connected: false, error: (error as Error).message },
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/me", authenticate, requireAuth, async (req: Request, res: Response) => {
  logger.debug("/auth/me called successfully", {
    userId: req.user!.id,
    organizationId: req.user!.organizationId,
  });

  const userId = req.user!.id;
  const currentOrganizationId = req.user!.organizationId;

  type MembershipWithOrg = Awaited<
    ReturnType<typeof db.membership.findMany<{ include: { organization: true } }>>
  >[number];

  const memberships: MembershipWithOrg[] = await db.membership.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

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

export default router;
