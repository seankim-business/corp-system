import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { db } from "../db/client";

const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});

export class AuthService {
  async loginWithGoogle(code: string, organizationSlug?: string) {
    const { tokens } = await googleClient.getToken(code);
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

    if (!organization && hostedDomain) {
      const slug = hostedDomain.split(".")[0];
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
    }

    if (!organization) {
      throw new Error("Unable to determine organization. Please contact admin.");
    }

    let membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      membership = await db.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: "member",
          joinedAt: new Date(),
        },
      });
    }

    const sessionToken = this.createSessionToken({
      userId: user.id,
      organizationId: organization.id,
      role: membership.role,
    });

    const refreshToken = this.createRefreshToken({
      userId: user.id,
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

    const refreshToken = this.createRefreshToken({ userId: user.id });

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

    const membership = await db.membership.findFirst({
      where: {
        userId: user.id,
      },
      include: {
        organization: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!membership) throw new Error("User is not a member of any organization");

    const sessionToken = this.createSessionToken({
      userId: user.id,
      organizationId: membership.organizationId,
      role: membership.role,
    });

    const refreshToken = this.createRefreshToken({ userId: user.id });

    return {
      user,
      organization: membership.organization,
      membership,
      sessionToken,
      refreshToken,
    };
  }

  createSessionToken(payload: { userId: string; organizationId: string; role: string }) {
    const options: any = {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    };
    return jwt.sign(payload, process.env.JWT_SECRET as string, options);
  }

  createRefreshToken(payload: { userId: string }) {
    const options: any = {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
    };
    return jwt.sign(payload, process.env.JWT_SECRET as string, options);
  }

  verifySessionToken(token: string): {
    userId: string;
    organizationId: string;
    role: string;
  } {
    return jwt.verify(token, process.env.JWT_SECRET!) as any;
  }

  async switchOrganization(userId: string, targetOrgId: string) {
    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: targetOrgId,
          userId,
        },
      },
      include: {
        organization: true,
      },
    });

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

    const refreshToken = this.createRefreshToken({ userId });

    return {
      user,
      organization: membership.organization,
      membership,
      sessionToken,
      refreshToken,
    };
  }
}
