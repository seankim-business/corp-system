/**
 * ProtectedRoute Component
 *
 * 기획:
 * - 로그인 여부 확인
 * - 로그인 안되어 있으면 /login 리다이렉트
 * - 로그인 확인 중 로딩 표시
 * - 로그인되어 있으면 children 렌더링
 *
 * 구조:
 * ProtectedRoute
 * ├── useEffect: GET /auth/me 호출
 * ├── Loading State → Spinner
 * ├── No User → Redirect to /login
 * └── User Exists → {children}
 *
 * 사용:
 * <ProtectedRoute>
 *   <DashboardLayout>
 *     <DashboardPage />
 *   </DashboardLayout>
 * </ProtectedRoute>
 */

import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading, fetchUser } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  return <>{children}</>;
}
