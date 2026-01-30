import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import { runWithoutRLS } from "../utils/data-isolation";

const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});

export class AuthService {
  async loginWithGoogle(
    code: string,
    organizationSlug?: string,
    _ipAddress?: string,  // Kept for API compatibility but not included in JWT (proxy issues)
    _userAgent?: string,  // Kept for API compatibility but not included in JWT (proxy issues)
    codeVerifier?: string,
  ) {
    const { tokens } = await googleClient.getToken({
      code,
      codeVerifier,
    });
    googleClient.setCredentials(tokens);

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) throw new Error("Invalid ID token");

    const {
      sub: googleId,
      email,
      name: displayName,
      picture: avatarUrl,
      email_verified: emailVerified,
      hd: hostedDomain,
    } = payload;

    let user = await db.user.findUnique({
      where: { googleId: googleId! },
    });

    if (!user) {
      user = await db.user.create({
        data: {
          email: email!,
          googleId: googleId!,
          displayName: displayName || undefined,
          avatarUrl: avatarUrl || undefined,
          emailVerified: emailVerified || false,
        },
      });
    }

    let organization;

    if (organizationSlug) {
      organization = await db.organization.findUnique({
        where: { slug: organizationSlug },
      });
      if (!organization) throw new Error("Organization not found");
    } else if (hostedDomain) {
      const domain = await db.workspaceDomain.findUnique({
        where: { domain: hostedDomain },
        include: { organization: true },
      });
      if (domain && domain.verified) {
        organization = domain.organization;
      }
    }

    let isNewOrganization = false;

    if (!organization && hostedDomain) {
      const slug = hostedDomain.split(".")[0];

      organization = await db.organization.findUnique({
        where: { slug },
      });

      if (!organization) {
        organization = await db.organization.create({
          data: {
            slug,
            name: hostedDomain,
            workspaceDomains: {
              create: {
                domain: hostedDomain,
                verified: false,
              },
            },
          },
        });
        isNewOrganization = true;
      } else {
        const existingDomain = await db.workspaceDomain.findUnique({
          where: { domain: hostedDomain },
        });
        if (!existingDomain) {
          await db.workspaceDomain.create({
            data: {
              domain: hostedDomain,
              organizationId: organization.id,
              verified: false,
            },
          });
        }
      }
    }

    if (!organization) {
      throw new Error("Unable to determine organization. Please contact admin.");
    }

    // Query membership without RLS since this is part of authentication flow
    let membership = await runWithoutRLS(() =>
      db.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: user.id,
          },
        },
      }),
    );

    if (!membership) {
      // First user in a newly created organization becomes owner
      // Otherwise, new members join as "member" role
      const memberRole = isNewOrganization ? "owner" : "member";

      membership = await db.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: memberRole,
          joinedAt: new Date(),
        },
      });
    }

    // NOTE: Don't include ipAddress/userAgent in JWT token
    // IP changes behind proxies (Railway, CloudFlare) causing session hijacking false positives
    const sessionToken = this.createSessionToken({
      userId: user.id,
      organizationId: organization.id,
      role: membership.role,
    });

    const refreshToken = this.createRefreshToken({
      userId: user.id,
      organizationId: organization.id,
    });

    return {
      user,
      organization,
      membership,
      sessionToken,
      refreshToken,
    };
  }

  async registerWithEmail(data: {
    email: string;
    password: string;
    displayName?: string;
    organizationName: string;
    organizationSlug: string;
  }) {
    const existingUser = await db.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new Error("Email already registered");
    }

    const existingOrg = await db.organization.findUnique({
      where: { slug: data.organizationSlug },
    });

    if (existingOrg) {
      throw new Error("Organization slug already taken");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const organization = await db.organization.create({
      data: {
        slug: data.organizationSlug,
        name: data.organizationName,
        settings: {},
      },
    });

    const user = await db.user.create({
      data: {
        email: data.email,
        passwordHash,
        displayName: data.displayName,
        emailVerified: false,
      },
    });

    const membership = await db.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: "owner",
        joinedAt: new Date(),
      },
    });

    const sessionToken = this.createSessionToken({
      userId: user.id,
      organizationId: organization.id,
      role: membership.role,
    });

    const refreshToken = this.createRefreshToken({
      userId: user.id,
      organizationId: organization.id,
    });

    return {
      user,
      organization,
      membership,
      sessionToken,
      refreshToken,
    };
  }

  async loginWithEmail(email: string, password: string) {
    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      throw new Error("Invalid credentials");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error("Invalid credentials");

    // Query membership without RLS since this is part of authentication flow
    const membership = await runWithoutRLS(() =>
      db.membership.findFirst({
        where: {
          userId: user.id,
        },
        include: {
          organization: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
    );

    if (!membership) throw new Error("User is not a member of any organization");

    const sessionToken = this.createSessionToken({
      userId: user.id,
      organizationId: membership.organization.id,
      role: membership.role,
    });

    const refreshToken = this.createRefreshToken({
      userId: user.id,
      organizationId: membership.organization.id,
    });

    return {
      user,
      organization: membership.organization,
      membership,
      sessionToken,
      refreshToken,
    };
  }

  createSessionToken(payload: {
    userId: string;
    organizationId: string;
    role: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const expiresIn = (process.env.JWT_EXPIRES_IN || "1h") as jwt.SignOptions["expiresIn"];
    return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn });
  }

  createRefreshToken(payload: { userId: string; organizationId: string }) {
    const expiresIn = (process.env.JWT_REFRESH_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];
    return jwt.sign({ ...payload, type: "refresh" }, process.env.JWT_SECRET as string, {
      expiresIn,
    });
  }

  verifyRefreshToken(token: string): {
    userId: string;
    organizationId: string;
    type: string;
    exp: number;
  } {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    if (payload.type !== "refresh") {
      throw new Error("Invalid refresh token");
    }
    return payload;
  }

  verifySessionToken(token: string): {
    userId: string;
    organizationId: string;
    role: string;
    ipAddress?: string;
    userAgent?: string;
  } {
    return jwt.verify(token, process.env.JWT_SECRET!) as any;
  }

  async storeSessionMetadata(data: {
    userId: string;
    organizationId: string;
    ipAddress?: string;
    userAgent?: string;
    source?: string;
  }) {
    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.session.create({
        data: {
          id: sessionId,
          userId: data.userId,
          organizationId: data.organizationId,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
          source: data.source || "web",
          expiresAt,
        },
      });

      return sessionId;
    } catch (error) {
      logger.error("Failed to store session metadata", { error });
      return null;
    }
  }

  async switchOrganization(userId: string, targetOrgId: string) {
    // Query membership without RLS since this is part of authentication flow
    const membership = await runWithoutRLS(() =>
      db.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: targetOrgId,
            userId,
          },
        },
        include: {
          organization: true,
        },
      }),
    );

    if (!membership) {
      throw new Error("User is not a member of this organization");
    }

    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new Error("User not found");

    const sessionToken = this.createSessionToken({
      userId,
      organizationId: targetOrgId,
      role: membership.role,
    });

    const refreshToken = this.createRefreshToken({
      userId,
      organizationId: targetOrgId,
    });

    return {
      user,
      organization: membership.organization,
      membership,
      sessionToken,
      refreshToken,
    };
  }
}
