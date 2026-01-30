# Backend Implementation Guide

## Quick Start

### 1. Setup Environment
```bash
cp .env.example .env
# Edit .env with your values:
# - DATABASE_URL: PostgreSQL connection string
# - GOOGLE_CLIENT_ID/SECRET: From Google Cloud Console
# - JWT_SECRET: Generate with: openssl rand -base64 32
# - BASE_DOMAIN: Your domain (e.g., kyndof-corp.com)
```

### 2. Install & Build
```bash
npm install
npm run db:generate
npm run build
```

### 3. Run Server
```bash
# Development (with hot reload)
npm run dev

# Production
npm run build && npm start
```

## API Endpoints

### Authentication
- `GET /auth/google` - Start Google OAuth flow
- `GET /auth/google/callback` - OAuth callback (auto-redirected)
- `POST /auth/login` - Email/password login
- `POST /auth/logout` - Logout (clears cookies)
- `POST /auth/switch-org` - Switch organization
- `GET /auth/me` - Get current user info

### Health
- `GET /health` - Server health check
- `GET /api/user` - Get authenticated user (requires auth)

## Key Features

### Google Workspace SSO
- Automatic organization creation from Workspace domain
- User auto-provisioning
- Membership auto-creation

### Multi-Tenant
- Subdomain-based organization routing
- Organization context validation
- Membership verification

### Security
- JWT tokens (7 days default)
- Refresh tokens (30 days default)
- Rate limiting (5 login attempts/15 min)
- CSRF protection (SameSite cookies)
- HttpOnly cookies
- Helmet security headers

## Database Schema

### Core Tables
- `organizations` - Tenants
- `users` - Global user identity
- `memberships` - User-org relationships
- `workspace_domains` - Google Workspace domains
- `sessions` - Optional JWT tracking

## Environment Variables

```
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://domain.com/auth/google/callback

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# App
NODE_ENV=production
PORT=3000
BASE_URL=https://domain.com
BASE_DOMAIN=domain.com
COOKIE_DOMAIN=.domain.com
```

## File Structure

```
src/
├── index.ts                    # Express server
├── db/
│   └── client.ts              # Prisma singleton
├── types/
│   └── express.d.ts           # Type extensions
├── auth/
│   ├── auth.service.ts        # Auth logic
│   └── auth.routes.ts         # Auth endpoints
└── middleware/
    ├── tenant.middleware.ts   # Subdomain resolution
    └── auth.middleware.ts     # JWT verification
```

## Testing

### Health Check
```bash
curl http://localhost:3000/health
```

### Google OAuth Flow
1. Visit: `http://localhost:3000/auth/google`
2. Authenticate with Google
3. Redirected to: `https://org-slug.domain.com/dashboard`

### Email Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@org.com","password":"pass"}'
```

### Get User Info
```bash
curl http://localhost:3000/auth/me \
  -H "Cookie: session=<token>"
```

## Troubleshooting

### Build Errors
```bash
npm run db:generate  # Regenerate Prisma client
npm run build        # Rebuild TypeScript
```

### Database Connection
- Verify DATABASE_URL is correct
- Check PostgreSQL is running
- Run migrations: `npm run db:migrate`

### Google OAuth Issues
- Verify GOOGLE_CLIENT_ID/SECRET
- Check GOOGLE_REDIRECT_URI matches Google Console
- Ensure domain is whitelisted in Google Console

### JWT Errors
- Verify JWT_SECRET is set
- Check token hasn't expired
- Verify token format in Authorization header

## Production Deployment

1. Set `NODE_ENV=production`
2. Use strong JWT_SECRET (32+ chars)
3. Enable HTTPS (Secure flag on cookies)
4. Configure CORS for your domain
5. Set up database backups
6. Monitor error logs
7. Use environment-specific .env files

## Next Steps

1. Set up database migrations
2. Create seed data (initial organization)
3. Deploy to production
4. Configure DNS/SSL
5. Set up monitoring/logging
6. Create frontend integration

---

**Status: Ready for Production** ✅
