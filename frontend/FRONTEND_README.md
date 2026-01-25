# Kyndof Corp System - Frontend

## Status: Foundation Complete ✓

The frontend foundation has been set up with:
- ✅ React 18 + TypeScript + Vite
- ✅ TailwindCSS for styling
- ✅ React Router for routing
- ✅ TanStack Query for API state management
- ✅ Zustand for global state
- ✅ Axios for HTTP client

## What's Implemented

### Configuration Files
1. `package.json` - Dependencies and scripts
2. `tsconfig.json` - TypeScript strict mode configuration
3. `vite.config.ts` - Vite build configuration
4. `tailwind.config.js` - TailwindCSS configuration
5. `postcss.config.js` - PostCSS for Tailwind

### Next Steps (To Complete)

You need to create these source files:

```
frontend/
├── index.html
├── vite.config.ts
├── .env.example
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── api/
│   │   └── auth.ts
│   ├── store/
│   │   └── auth.ts
│   ├── pages/
│   │   ├── Login.tsx
│   │   └── Dashboard.tsx
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── OrganizationSwitcher.tsx
│   │   └── ProtectedRoute.tsx
│   └── types/
│       └── index.ts
```

## Quick Start

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Create Environment File
```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_API_BASE_URL=http://localhost:3000
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
```

## API Integration

### Authentication Endpoints

Backend API (from `/src/auth/auth.routes.ts`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/google` | Initiate Google OAuth |
| GET | `/auth/google/callback` | OAuth callback |
| POST | `/auth/login` | Email/password login |
| POST | `/auth/logout` | Logout |
| POST | `/auth/switch-org` | Switch organization |
| GET | `/auth/me` | Get current user |

### Example API Client (`src/api/auth.ts`)

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
});

export const authApi = {
  getMe: () => api.get('/auth/me'),
  login: (email: string, password: string) => 
    api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  switchOrg: (organizationId: string) => 
    api.post('/auth/switch-org', { organizationId }),
  initiateGoogleOAuth: () => {
    window.location.href = `${import.meta.env.VITE_API_BASE_URL}/auth/google`;
  },
};
```

### Example Auth Store (`src/store/auth.ts`)

```typescript
import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  currentOrganization: {
    id: string;
    name: string;
    domain: string;
    role: 'owner' | 'admin' | 'member';
  };
  organizations: Array<{
    id: string;
    name: string;
    domain: string;
    role: 'owner' | 'admin' | 'member';
  }>;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  clearUser: () => set({ user: null, isAuthenticated: false }),
}));
```

## Implementation Guide

### 1. Login Page

**User Story** (from AUTH_SYSTEM.md line 754):
- User visits subdomain (e.g., `kyndof.kyndof-corp.com`)
- If not authenticated → redirect to `/login`
- Login page shows "Login with Google" button
- Click button → `GET /auth/google` → Google OAuth
- After auth → redirect to `/dashboard`

**Design**:
- Centered card layout
- Kyndof logo at top
- "Login with Google" button (blue, with Google logo)
- Optional: Email/password form below
- Clean, minimal design (like Vercel/Railway login)

### 2. Dashboard Page

**User Story** (from AUTH_SYSTEM.md line 770):
- Shows welcome message: "Welcome, {user.name}"
- Displays current organization
- Shows OrganizationSwitcher dropdown
- Navigation sidebar (for future features)

### 3. Organization Switcher

**User Story** (from AUTH_SYSTEM.md line 789):
- Dropdown showing all user's organizations
- Current org highlighted
- Click org → `POST /auth/switch-org` → Reload page
- Subdomain changes to new org

**Design**:
- Dropdown in top-right corner
- Shows org name + domain
- Icon showing current selection
- Smooth transition animation

### 4. Protected Routes

Wrap routes requiring authentication:

```typescript
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  return <>{children}</>;
}
```

## Deployment

### Build for Production
```bash
npm run build
```

Output: `dist/` directory

### Deploy to Railway (with Backend)

Add to root `Dockerfile`:
```dockerfile
# Frontend build stage
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Backend stage
FROM node:20-alpine AS runtime
# ... existing backend setup ...

# Copy frontend dist
COPY --from=frontend-builder /app/frontend/dist /app/public

# Serve frontend from Express
# Add to src/index.ts:
# app.use(express.static('public'));
```

### Serve Frontend from Backend

Update `src/index.ts`:
```typescript
import path from 'path';

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../public')));

// Fallback to index.html for client-side routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});
```

## Design System

### Colors (Tailwind)
- Primary: `blue-600` (buttons, links)
- Background: `gray-50` (page background)
- Card: `white` (elevated surfaces)
- Text: `gray-900` (primary text)
- Text secondary: `gray-600`
- Border: `gray-200`

### Typography
- Headings: `font-semibold`
- Body: `font-normal`
- Sizes: `text-sm`, `text-base`, `text-lg`, `text-xl`

### Components
- Buttons: Rounded (`rounded-lg`), padding (`px-4 py-2`)
- Cards: Shadow (`shadow-sm`), border (`border`), rounded
- Forms: Focus ring (`focus:ring-2 focus:ring-blue-500`)

## References

- **AUTH_SYSTEM.md** (lines 754-826): Complete user stories
- **Backend API**: `/src/auth/auth.routes.ts`
- **Prisma Schema**: `/prisma/schema.prisma`
- **Design Inspiration**: Vercel Dashboard, Railway App

## Support

- **Backend Repository**: `/Users/sean/Documents/Kyndof/tools/kyndof-corp-system`
- **Deployment Guide**: `DEPLOYMENT.md`
- **Railway Guide**: `RAILWAY_DEPLOY.md`
