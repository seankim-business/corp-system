# Frontend 개발 환경 셋업

**목적**: React + TypeScript + Vite 개발 환경 구성

---

## 📦 기술 스택

| 카테고리 | 기술 | 버전 |
|---------|------|------|
| Framework | React | 18.3.1 |
| Language | TypeScript | 5.9.3 |
| Build Tool | Vite | 5.4.21 |
| Styling | Tailwind CSS | 4.1.18 |
| State | Zustand | 5.0.10 |
| Data Fetching | TanStack Query | 5.90.20 |
| HTTP Client | Axios | 1.13.2 |
| Routing | React Router | 6.30.3 |

---

## 🚀 시작하기

### 1. 의존성 설치

```bash
cd frontend
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

서버 실행 후: `http://localhost:3001`

### 3. 빌드

```bash
npm run build
```

빌드 결과: `frontend/dist/`

---

## 📂 디렉토리 구조

```
frontend/
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Root component
│   │
│   ├── pages/                # Page components
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   └── SettingsPage.tsx
│   │
│   ├── components/           # Reusable components
│   │   ├── common/          # 공통 컴포넌트
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Modal.tsx
│   │   │
│   │   └── layout/          # 레이아웃 컴포넌트
│   │       ├── Header.tsx
│   │       ├── Sidebar.tsx
│   │       └── Footer.tsx
│   │
│   ├── api/                  # API client
│   │   ├── client.ts        # Axios instance
│   │   ├── auth.ts          # Auth endpoints
│   │   └── workflows.ts     # Workflow endpoints
│   │
│   ├── stores/               # Zustand stores
│   │   ├── authStore.ts
│   │   └── orgStore.ts
│   │
│   ├── hooks/                # Custom hooks
│   │   ├── useAuth.ts
│   │   └── useOrganization.ts
│   │
│   ├── types/                # TypeScript types
│   │   ├── api.ts
│   │   └── models.ts
│   │
│   └── styles/               # Global styles
│       └── index.css
│
├── public/                   # Static assets
├── index.html               # HTML template
├── vite.config.ts           # Vite configuration
├── tailwind.config.js       # Tailwind configuration
├── tsconfig.json            # TypeScript configuration
└── package.json
```

---

## ⚙️ 설정 파일

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

**주요 설정**:
- Port: `3001` (Backend는 `3000`)
- Proxy: `/api`, `/auth` 요청을 Backend로 전달

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### tailwind.config.js

```javascript
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

---

## 🎨 스타일링

### Tailwind CSS

Global styles: `src/styles/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 사용 예시

```tsx
<button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
  Click me
</button>
```

---

## 🔗 API 연동

### 개발 환경

- Frontend: `http://localhost:3001`
- Backend: `http://localhost:3000`
- Proxy 설정으로 CORS 문제 해결

### Production 환경

- Frontend: `https://app.nubabel.com`
- Backend: `https://auth.nubabel.com`
- CORS 설정 필요

---

## 📝 개발 가이드

### 새 페이지 추가

1. `src/pages/NewPage.tsx` 생성
2. `src/App.tsx`에 라우트 추가
3. 네비게이션 링크 추가

상세: [02-components.md](02-components.md)

### 새 API 엔드포인트 추가

1. `src/api/` 에 함수 추가
2. TanStack Query hook 생성
3. 컴포넌트에서 사용

상세: [03-api-integration.md](03-api-integration.md)

### 상태 관리

1. Zustand store 생성
2. Hook으로 래핑
3. 컴포넌트에서 사용

상세: [04-state-management.md](04-state-management.md)

---

## 🐛 트러블슈팅

### Port 3001이 이미 사용 중

```bash
# 프로세스 종료
lsof -ti:3001 | xargs kill -9

# 또는 다른 포트 사용
vite --port 3002
```

### TypeScript 에러

```bash
# 타입 체크
npm run tsc

# 빌드 시 타입 체크 스킵 (권장 안함)
vite build --mode production
```

### Tailwind CSS가 적용 안됨

1. `tailwind.config.js` content 경로 확인
2. `src/styles/index.css` import 확인
3. Dev server 재시작

---

## 📚 다음 문서

- [컴포넌트 구조](02-components.md)
- [라우팅](03-routing.md)
- [API 연동](03-api-integration.md)
- [상태 관리](04-state-management.md)
