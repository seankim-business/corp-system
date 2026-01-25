import express, { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import rateLimit from 'express-rate-limit';
import { AuthService } from './auth.service';
import { authenticate, requireAuth, requireOrganization } from '../middleware/auth.middleware';
import { resolveTenant } from '../middleware/tenant.middleware';

const router = express.Router();
const authService = new AuthService();

const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/google', resolveTenant, (req: Request, res: Response) => {
  const authUrl = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    state: JSON.stringify({
      organizationSlug: req.organization?.slug,
    }),
  });

  return res.redirect(authUrl);
});

router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const stateData = JSON.parse((state as string) || '{}');
    const result = await authService.loginWithGoogle(code as string, stateData.organizationSlug);

    res.cookie('session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN,
    });

    res.cookie('refresh', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN,
    });

    const redirectUrl = `https://${result.organization.slug}.${process.env.BASE_DOMAIN}/dashboard`;
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google OAuth error:', error);
    return res.status(500).send('Authentication failed');
  }
});

router.post('/login', loginLimiter, resolveTenant, requireOrganization, async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await authService.loginWithEmail(email, password, req.organization!.slug);

    res.cookie('session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN,
    });

    return res.json({
      user: result.user,
      organization: result.organization,
      membership: result.membership,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('session', { domain: process.env.COOKIE_DOMAIN });
  res.clearCookie('refresh', { domain: process.env.COOKIE_DOMAIN });
  return res.json({ success: true });
});

router.post('/switch-org', authenticate, async (req: Request, res: Response) => {
  const { organizationId } = req.body;

  if (!organizationId) {
    return res.status(400).json({ error: 'Organization ID required' });
  }

  try {
    const result = await authService.switchOrganization(req.user!.id, organizationId);

    res.cookie('session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN,
    });

    const redirectUrl = `https://${result.organization.slug}.${process.env.BASE_DOMAIN}/dashboard`;
    return res.json({ redirectUrl });
  } catch (error) {
    console.error('Switch org error:', error);
    return res.status(403).json({ error: (error as Error).message });
  }
});

router.get('/me', authenticate, requireAuth, (req: Request, res: Response) => {
  res.json({
    user: req.user,
    organization: req.organization,
    membership: req.membership,
  });
});

export default router;
