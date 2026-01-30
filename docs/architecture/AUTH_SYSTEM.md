# Google Workspace Multi-Domain Authentication & Multi-Tenant System

> **Google Workspace 멀티도메인 SSO + 멀티테넌트 SaaS 아키텍처**

---

## 목차

- [개요](#개요)
- [아키텍처](#아키텍처)
- [데이터베이스 스키마](#데이터베이스-스키마)
- [인증 흐름](#인증-흐름)
- [구현](#구현)
- [배포](#배포)

---

## 개요

### 요구사항

1. **Google Workspace 멀티도메인 지원**
   - 여러 회사(도메인)의 Google Workspace 계정으로 로그인
   - 예: `sol@kyndof.com`, `user@client-company.com`

2. **멀티테넌트 SaaS**
   - 각 회사(Organization)는 독립된 데이터 격리
   - 회사 간 데이터 공유 불가
   - 하나의 시스템에서 여러 회사 동시 운영

3. **유연한 인증**
   - Google Workspace SSO (기본)
   - 이메일/비밀번호 (백업)
   - 초대 기반 회원가입

### 핵심 개념

| 용어 | 설명 | 예시 |
|------|------|------|
| **Organization** | 회사/조직 (테넌트 단위) | Kyndof, Client Co. |
| **Workspace Domain** | Google Workspace 도메인 | `kyndof.com`, `client-company.com` |
| **User** | 사용자 (여러 Organization 소속 가능) | `sol@kyndof.com` |
| **Membership** | User ↔ Organization 관계 | Sol이 Kyndof의 Admin |
| **Session** | 로그인 세션 (Organization 컨텍스트 포함) | Sol이 Kyndof로 로그인 중 |

---

## 아키텍처

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Client (Browser)                                            │
│  - https://kyndof.kyndof-corp.com  (Kyndof 조직)          │
│  - https://clientco.kyndof-corp.com  (Client Co. 조직)    │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Load Balancer / Reverse Proxy (Nginx)                      │
│  - Subdomain-based routing                                  │
│  - SSL termination                                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Application Server (Node.js + Express)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Middleware Stack                                      │  │
│  │  1. Tenant Resolver (subdomain → organization_id)    │  │
│  │  2. Session Validator (JWT → user + organization)    │  │
│  │  3. RABSIC Authorization                              │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Auth Router                                           │  │
│  │  - POST /auth/google (OAuth callback)                │  │
│  │  - POST /auth/login (email/password)                 │  │
│  │  - POST /auth/refresh (token refresh)                │  │
│  │  - POST /auth/logout                                  │  │
│  │  - GET /auth/switch-org (조직 전환)                  │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ PostgreSQL Database                                         │
│  - organizations (조직 테이블)                              │
│  - users (사용자 테이블)                                    │
│  - memberships (조직-사용자 연결)                           │
│  - workspace_domains (Google Workspace 도메인)             │
│  - sessions (세션 관리)                                     │
│  - Row-Level Security (RLS) for tenant isolation           │
└─────────────────────────────────────────────────────────────┘
```

---

### Subdomain-Based Routing

```
https://kyndof.kyndof-corp.com
       └──┬──┘
    organization slug

https://clientco.kyndof-corp.com
       └───┬───┘
    organization slug
```

**장점**:
- URL만으로 조직 식별 가능
- 각 조직별 독립된 도메인 느낌
- 쿠키 격리 (보안 강화)

**구현**:
```typescript
// Middleware: Tenant Resolver
app.use((req, res, next) => {
  const subdomain = req.hostname.split('.')[0];
  
  if (subdomain === 'www' || subdomain === 'kyndof-corp') {
    // 메인 도메인 (조직 선택 페이지)
    req.organization = null;
  } else {
    // 조직 서브도메인
    const org = await db.organizations.findBySlug(subdomain);
    if (!org) return res.status(404).send('Organization not found');
    req.organization = org;
  }
  
  next();
});
```

---

## 데이터베이스 스키마

### ERD

```
┌──────────────────┐         ┌──────────────────┐
│  organizations   │         │      users       │
├──────────────────┤         ├──────────────────┤
│ id (uuid)        │◄───┐    │ id (uuid)        │
│ slug             │    │    │ email            │
│ name             │    │    │ password_hash    │
│ logo_url         │    │    │ google_id        │
│ created_at       │    │    │ created_at       │
└──────────────────┘    │    └──────────────────┘
                        │              │
                        │              │
                ┌───────┴──────────────┴────────┐
                │      memberships              │
                ├───────────────────────────────┤
                │ id (uuid)                     │
                │ organization_id (fk)          │
                │ user_id (fk)                  │
                │ role (admin, member)          │
                │ invited_at                    │
                │ joined_at                     │
                └───────────────────────────────┘
                              │
                              │
                ┌─────────────┴─────────────┐
                │  workspace_domains        │
                ├───────────────────────────┤
                │ id (uuid)                 │
                │ organization_id (fk)      │
                │ domain (unique)           │
                │ verified (boolean)        │
                │ verified_at               │
                └───────────────────────────┘
```

---

### SQL Schema

```sql
-- Extension for UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations (테넌트)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(50) UNIQUE NOT NULL,  -- subdomain: kyndof, clientco
  name VARCHAR(255) NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);

-- Users (전역 사용자 테이블)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),  -- NULL for Google-only users
  google_id VARCHAR(255) UNIQUE,  -- Google OAuth sub
  display_name VARCHAR(255),
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);

-- Memberships (조직-사용자 연결)
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  permissions JSONB DEFAULT '{}',
  invited_by UUID REFERENCES users(id),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  joined_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_memberships_org ON memberships(organization_id);
CREATE INDEX idx_memberships_user ON memberships(user_id);

-- Workspace Domains (Google Workspace 도메인)
CREATE TABLE workspace_domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain VARCHAR(255) UNIQUE NOT NULL,  -- kyndof.com, client-company.com
  verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(255),
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(organization_id, domain)
);

CREATE INDEX idx_workspace_domains_org ON workspace_domains(organization_id);
CREATE INDEX idx_workspace_domains_domain ON workspace_domains(domain);

-- Sessions (세션 관리 - optional, JWT 사용 시 불필요할 수도 있음)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_org ON sessions(organization_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);

-- Row-Level Security (RLS) for tenant isolation
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_domains ENABLE ROW LEVEL SECURITY;

-- Policy: 사용자는 자신이 속한 조직의 데이터만 조회 가능
CREATE POLICY membership_isolation ON memberships
  FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY workspace_domain_isolation ON workspace_domains
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships 
      WHERE user_id = current_setting('app.current_user_id')::uuid
    )
  );
```

---

## 인증 흐름

### Flow 1: Google Workspace SSO 로그인

```
┌──────────┐                ┌──────────┐                ┌──────────┐
│  User    │                │  App     │                │  Google  │
└────┬─────┘                └────┬─────┘                └────┬─────┘
     │                           │                           │
     │ 1. Visit kyndof.kyndof-corp.com                      │
     ├──────────────────────────►│                           │
     │                           │                           │
     │ 2. Click "Login with Google"                         │
     ├──────────────────────────►│                           │
     │                           │                           │
     │                           │ 3. Redirect to Google OAuth
     │                           ├──────────────────────────►│
     │                           │   (client_id, redirect_uri, scope)
     │                           │                           │
     │ 4. Google Login Screen (enter credentials)           │
     │◄──────────────────────────┼───────────────────────────┤
     │                           │                           │
     │ 5. Consent & Authorize                                │
     ├───────────────────────────┼──────────────────────────►│
     │                           │                           │
     │                           │ 6. Redirect to callback   │
     │                           │◄──────────────────────────┤
     │                           │   (code)                  │
     │                           │                           │
     │                           │ 7. Exchange code for tokens
     │                           ├──────────────────────────►│
     │                           │                           │
     │                           │◄──────────────────────────┤
     │                           │   (access_token, id_token)
     │                           │                           │
     │                           │ 8. Verify id_token (JWT) │
     │                           │ 9. Extract email, google_id
     │                           │ 10. Check domain: sol@kyndof.com
     │                           │     → domain: kyndof.com │
     │                           │                           │
     │                           │ 11. Find organization by domain
     │                           │     → organization: Kyndof
     │                           │                           │
     │                           │ 12. Find/Create user     │
     │                           │ 13. Find/Create membership
     │                           │                           │
     │                           │ 14. Create JWT session token
     │                           │     {                     │
     │                           │       user_id,            │
     │                           │       organization_id,    │
     │                           │       role                │
     │                           │     }                     │
     │                           │                           │
     │ 15. Set cookie & redirect                            │
     │◄──────────────────────────┤                           │
     │   Set-Cookie: session=JWT                            │
     │   Location: /dashboard                               │
     │                           │                           │
     │ 16. Access dashboard (authenticated)                 │
     ├──────────────────────────►│                           │
     │                           │                           │
```

---

### Flow 2: 새 조직 생성 & 도메인 검증

```
1. User: admin@newcompany.com이 회원가입
2. System: Google OAuth로 인증
3. System: "newcompany.com" 도메인 감지
4. System: workspace_domains 테이블 확인
   → newcompany.com 없음
5. System: 
   - 새 organization 생성 (slug: newcompany)
   - workspace_domains 추가 (domain: newcompany.com, verified: false)
   - membership 생성 (role: owner)
6. User: 도메인 검증 요청
7. System: Google Workspace Admin SDK로 검증
   - 방법 1: DNS TXT 레코드 추가
   - 방법 2: HTML 파일 업로드
8. Google: 도메인 소유권 확인
9. System: verified = true 업데이트
10. 이후 admin@newcompany.com으로 로그인하는 모든 사용자는 자동으로 newcompany 조직에 소속
```

---

### Flow 3: 조직 전환

```
Sol이 여러 조직에 소속된 경우:
- Kyndof (owner)
- Client Co. (admin)

1. Sol이 kyndof.kyndof-corp.com에 로그인
   → JWT: { user_id: sol_id, organization_id: kyndof_id, role: owner }

2. Sol이 Client Co. 작업하고 싶음
   → GET /auth/switch-org?org_id=clientco_id

3. System:
   - memberships 테이블 확인: Sol이 Client Co. 멤버인지 확인
   - 새 JWT 생성: { user_id: sol_id, organization_id: clientco_id, role: admin }
   - 쿠키 업데이트

4. Redirect to: https://clientco.kyndof-corp.com/dashboard
```

---

## 구현

### 1. Environment Variables

```bash
# .env
DATABASE_URL=postgresql://user:password@localhost:5432/kyndof_corp

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://kyndof-corp.com/auth/google/callback

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# App
BASE_URL=https://kyndof-corp.com
COOKIE_DOMAIN=.kyndof-corp.com  # wildcard for subdomains
```

---

### 2. Auth Service (TypeScript + Express)

```typescript
// src/auth/auth.service.ts
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { db } from '../db';

const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});

export class AuthService {
  /**
   * Google OAuth 로그인
   */
  async loginWithGoogle(code: string, organizationSlug?: string) {
    // 1. Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);
    
    // 2. Verify ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    if (!payload) throw new Error('Invalid ID token');
    
    const {
      sub: googleId,
      email,
      name: displayName,
      picture: avatarUrl,
      email_verified: emailVerified,
      hd: hostedDomain,  // Google Workspace domain
    } = payload;
    
    // 3. Find or create user
    let user = await db.users.findByGoogleId(googleId);
    if (!user) {
      user = await db.users.create({
        email: email!,
        googleId,
        displayName,
        avatarUrl,
        emailVerified,
      });
    }
    
    // 4. Determine organization
    let organization;
    
    if (organizationSlug) {
      // 명시적으로 조직 지정됨 (subdomain)
      organization = await db.organizations.findBySlug(organizationSlug);
      if (!organization) throw new Error('Organization not found');
    } else if (hostedDomain) {
      // Google Workspace domain으로 조직 찾기
      const domain = await db.workspaceDomains.findByDomain(hostedDomain);
      if (domain && domain.verified) {
        organization = await db.organizations.findById(domain.organizationId);
      }
    }
    
    // 5. 조직 없으면 새로 생성 (첫 로그인)
    if (!organization && hostedDomain) {
      organization = await db.organizations.create({
        slug: hostedDomain.split('.')[0],  // example.com → example
        name: hostedDomain,
      });
      
      await db.workspaceDomains.create({
        organizationId: organization.id,
        domain: hostedDomain,
        verified: false,  // 도메인 검증 필요
      });
    }
    
    if (!organization) {
      throw new Error('Unable to determine organization. Please contact admin.');
    }
    
    // 6. Find or create membership
    let membership = await db.memberships.findByUserAndOrg(user.id, organization.id);
    if (!membership) {
      membership = await db.memberships.create({
        userId: user.id,
        organizationId: organization.id,
        role: 'member',  // 첫 사용자는 owner로 수동 업그레이드 필요
        joinedAt: new Date(),
      });
    }
    
    // 7. Create JWT session
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
  
  /**
   * Email/Password 로그인 (백업)
   */
  async loginWithEmail(email: string, password: string, organizationSlug: string) {
    const user = await db.users.findByEmail(email);
    if (!user || !user.passwordHash) {
      throw new Error('Invalid credentials');
    }
    
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');
    
    const organization = await db.organizations.findBySlug(organizationSlug);
    if (!organization) throw new Error('Organization not found');
    
    const membership = await db.memberships.findByUserAndOrg(user.id, organization.id);
    if (!membership) throw new Error('User is not a member of this organization');
    
    const sessionToken = this.createSessionToken({
      userId: user.id,
      organizationId: organization.id,
      role: membership.role,
    });
    
    const refreshToken = this.createRefreshToken({ userId: user.id });
    
    return { user, organization, membership, sessionToken, refreshToken };
  }
  
  /**
   * JWT 생성
   */
  createSessionToken(payload: {
    userId: string;
    organizationId: string;
    role: string;
  }) {
    return jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
  }
  
  createRefreshToken(payload: { userId: string }) {
    return jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    });
  }
  
  /**
   * JWT 검증
   */
  verifySessionToken(token: string): {
    userId: string;
    organizationId: string;
    role: string;
  } {
    return jwt.verify(token, process.env.JWT_SECRET!) as any;
  }
  
  /**
   * 조직 전환
   */
  async switchOrganization(userId: string, targetOrgId: string) {
    const membership = await db.memberships.findByUserAndOrg(userId, targetOrgId);
    if (!membership) {
      throw new Error('User is not a member of this organization');
    }
    
    const organization = await db.organizations.findById(targetOrgId);
    
    const sessionToken = this.createSessionToken({
      userId,
      organizationId: targetOrgId,
      role: membership.role,
    });
    
    return { organization, sessionToken };
  }
}
```

---

### 3. Middleware: Tenant Resolver + Auth

```typescript
// src/middleware/tenant.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';

export async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  const subdomain = req.hostname.split('.')[0];
  
  if (subdomain === 'www' || subdomain === process.env.BASE_DOMAIN) {
    // 메인 도메인 - 조직 선택 페이지
    req.organization = null;
  } else {
    // 서브도메인 - 조직 식별
    const organization = await db.organizations.findBySlug(subdomain);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    req.organization = organization;
  }
  
  next();
}
```

```typescript
// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../auth/auth.service';

const authService = new AuthService();

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies.session || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const payload = authService.verifySessionToken(token);
    
    // Organization 컨텍스트 검증
    if (req.organization && payload.organizationId !== req.organization.id) {
      return res.status(403).json({ error: 'Organization mismatch' });
    }
    
    // User 정보 로드
    const user = await db.users.findById(payload.userId);
    const membership = await db.memberships.findByUserAndOrg(
      payload.userId,
      payload.organizationId
    );
    
    req.user = user;
    req.membership = membership;
    req.currentOrganizationId = payload.organizationId;
    
    // PostgreSQL RLS 설정
    await db.query('SET app.current_user_id = $1', [user.id]);
    await db.query('SET app.current_organization_id = $1', [payload.organizationId]);
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

---

### 4. Auth Routes

```typescript
// src/auth/auth.routes.ts
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { AuthService } from './auth.service';
import { authenticate, resolveTenant } from '../middleware';

const router = express.Router();
const authService = new AuthService();
const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});

/**
 * Google OAuth 로그인 시작
 */
router.get('/google', resolveTenant, (req, res) => {
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
  
  res.redirect(authUrl);
});

/**
 * Google OAuth 콜백
 */
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }
  
  try {
    const { organizationSlug } = JSON.parse(state as string || '{}');
    
    const result = await authService.loginWithGoogle(code as string, organizationSlug);
    
    // Set cookies
    res.cookie('session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
      domain: process.env.COOKIE_DOMAIN,  // .kyndof-corp.com
    });
    
    res.cookie('refresh', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
      domain: process.env.COOKIE_DOMAIN,
    });
    
    // Redirect to organization subdomain
    const redirectUrl = `https://${result.organization.slug}.${process.env.BASE_DOMAIN}/dashboard`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).send('Authentication failed');
  }
});

/**
 * Email/Password 로그인
 */
router.post('/login', resolveTenant, async (req, res) => {
  const { email, password } = req.body;
  
  if (!req.organization) {
    return res.status(400).json({ error: 'Organization required' });
  }
  
  try {
    const result = await authService.loginWithEmail(
      email,
      password,
      req.organization.slug
    );
    
    res.cookie('session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN,
    });
    
    res.json({ user: result.user, organization: result.organization });
  } catch (error) {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

/**
 * Logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('session', { domain: process.env.COOKIE_DOMAIN });
  res.clearCookie('refresh', { domain: process.env.COOKIE_DOMAIN });
  res.json({ success: true });
});

/**
 * 조직 전환
 */
router.post('/switch-org', authenticate, async (req, res) => {
  const { organizationId } = req.body;
  
  try {
    const result = await authService.switchOrganization(req.user.id, organizationId);
    
    res.cookie('session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: process.env.COOKIE_DOMAIN,
    });
    
    const redirectUrl = `https://${result.organization.slug}.${process.env.BASE_DOMAIN}/dashboard`;
    res.json({ redirectUrl });
  } catch (error) {
    res.status(403).json({ error: error.message });
  }
});

/**
 * 현재 사용자 정보
 */
router.get('/me', authenticate, (req, res) => {
  res.json({
    user: req.user,
    organization: req.organization,
    membership: req.membership,
  });
});

export default router;
```

---

### 5. 도메인 검증 (Google Workspace Admin SDK)

```typescript
// src/auth/domain-verification.service.ts
import { google } from 'googleapis';

export class DomainVerificationService {
  /**
   * 도메인 검증 토큰 생성
   */
  async generateVerificationToken(domain: string): Promise<string> {
    const token = crypto.randomUUID();
    
    await db.workspaceDomains.update({
      domain,
      verificationToken: token,
    });
    
    return token;
  }
  
  /**
   * DNS TXT 레코드로 도메인 검증
   */
  async verifyDomainViaDNS(domain: string): Promise<boolean> {
    const domainRecord = await db.workspaceDomains.findByDomain(domain);
    if (!domainRecord) throw new Error('Domain not found');
    
    // DNS TXT 레코드 확인
    const dns = require('dns').promises;
    const txtRecords = await dns.resolveTxt(domain);
    
    const verified = txtRecords.some(records => 
      records.includes(`kyndof-verification=${domainRecord.verificationToken}`)
    );
    
    if (verified) {
      await db.workspaceDomains.update({
        domain,
        verified: true,
        verifiedAt: new Date(),
      });
    }
    
    return verified;
  }
  
  /**
   * Google Workspace Admin SDK로 도메인 확인
   */
  async verifyGoogleWorkspaceDomain(domain: string, adminEmail: string): Promise<boolean> {
    // Google Workspace Admin SDK 호출
    // 실제 구현 시 Admin SDK 사용
    // https://developers.google.com/admin-sdk/directory/v1/guides/manage-users
    
    return true;  // Placeholder
  }
}
```

---

## 배포

### 1. Nginx 설정 (Subdomain Routing)

```nginx
# /etc/nginx/sites-available/kyndof-corp

# Wildcard subdomain
server {
    listen 80;
    server_name *.kyndof-corp.com kyndof-corp.com;
    
    # SSL (Let's Encrypt)
    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/kyndof-corp.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kyndof-corp.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

### 2. Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: kyndof_corp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your-password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  app:
    build: .
    environment:
      DATABASE_URL: postgresql://postgres:your-password@postgres:5432/kyndof_corp
      REDIS_URL: redis://redis:6379
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      JWT_SECRET: ${JWT_SECRET}
      BASE_URL: https://kyndof-corp.com
      COOKIE_DOMAIN: .kyndof-corp.com
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
```

---

### 3. Environment Setup

```bash
# 1. Database Migration
npm run db:migrate

# 2. Seed initial organization (Kyndof)
psql -d kyndof_corp -c "
INSERT INTO organizations (slug, name) VALUES ('kyndof', 'Kyndof Corporation');
INSERT INTO workspace_domains (organization_id, domain, verified) 
VALUES (
  (SELECT id FROM organizations WHERE slug = 'kyndof'),
  'kyndof.com',
  true
);
"

# 3. Start services
docker-compose up -d
```

---

## 보안 고려사항

### 1. CSRF Protection

```typescript
import csrf from 'csurf';

app.use(csrf({ cookie: true }));

router.post('/login', (req, res) => {
  // CSRF token 검증 자동 수행
});
```

---

### 2. Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15분
  max: 5,  // 최대 5번
  message: 'Too many login attempts. Please try again later.',
});

router.post('/login', loginLimiter, async (req, res) => {
  // ...
});
```

---

### 3. Row-Level Security (PostgreSQL)

```sql
-- 사용자는 자신이 속한 조직의 데이터만 조회
CREATE POLICY tenant_isolation_policy ON tasks
  FOR ALL
  USING (
    organization_id = current_setting('app.current_organization_id')::uuid
  );

-- Membership 검증
CREATE POLICY membership_check_policy ON tasks
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM memberships
      WHERE user_id = current_setting('app.current_user_id')::uuid
    )
  );
```

---

## 테스트 시나리오

### Scenario 1: 첫 사용자 로그인

```
1. admin@kyndof.com이 https://kyndof-corp.com 방문
2. "Login with Google" 클릭
3. Google OAuth 인증 완료
4. System:
   - hostedDomain: kyndof.com 감지
   - workspace_domains 확인 → 없음
   - 새 organization 생성 (slug: kyndof, name: kyndof.com)
   - workspace_domains 추가 (domain: kyndof.com, verified: false)
   - user 생성
   - membership 생성 (role: member)
5. Redirect: https://kyndof.kyndof-corp.com/dashboard
6. Admin: "Verify Domain" 클릭
7. DNS TXT 레코드 추가: kyndof-verification=abc123
8. System: 도메인 검증 완료 (verified: true)
9. 이후 user@kyndof.com으로 로그인하는 모든 사용자는 자동으로 Kyndof 조직 소속
```

---

### Scenario 2: 기존 조직에 신규 사용자 가입

```
1. newuser@kyndof.com이 Google 로그인
2. System:
   - hostedDomain: kyndof.com 감지
   - workspace_domains 확인 → kyndof.com 존재 (verified: true)
   - organization: Kyndof 로드
   - user 생성
   - membership 생성 (role: member)
3. Redirect: https://kyndof.kyndof-corp.com/dashboard
```

---

### Scenario 3: 여러 조직 소속 사용자

```
Sol이 2개 조직 소속:
- Kyndof (owner)
- Client Co. (admin)

1. Sol이 kyndof.kyndof-corp.com 로그인
   → JWT: { userId: sol_id, organizationId: kyndof_id, role: owner }
   → Dashboard에서 Kyndof 데이터만 보임

2. Sol이 "Switch Organization" 클릭
   → Dropdown: [Kyndof, Client Co.]

3. "Client Co." 선택
   → POST /auth/switch-org { organizationId: clientco_id }
   → 새 JWT 생성: { userId: sol_id, organizationId: clientco_id, role: admin }
   → Redirect: https://clientco.kyndof-corp.com/dashboard
   → Client Co. 데이터만 보임
```

---

## 다음 단계

1. ✅ **Auth System 설계 완료**
2. ⏳ **구현**:
   - [ ] Database migration 스크립트
   - [ ] AuthService 구현
   - [ ] Middleware 구현
   - [ ] Auth Routes 구현
   - [ ] Frontend (Login UI)
3. ⏳ **테스트**:
   - [ ] Unit tests
   - [ ] Integration tests
   - [ ] End-to-end tests
4. ⏳ **배포**:
   - [ ] Nginx 설정
   - [ ] SSL 인증서 (Let's Encrypt)
   - [ ] Docker 배포
   - [ ] 모니터링 설정

---

**Built with ❤️ by Kyndof Team**
