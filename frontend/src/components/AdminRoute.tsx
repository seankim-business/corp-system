/**
 * AdminRoute Component
 *
 * 기획:
 * - 관리자 권한 확인 (owner 또는 admin 역할)
 * - 권한 없으면 Access Denied 페이지 표시
 * - ProtectedRoute를 감싸서 인증 + 권한 검사 수행
 *
 * 구조:
 * AdminRoute
 * └── ProtectedRoute
 *     ├── Loading State → Spinner (from ProtectedRoute)
 *     ├── No User → Redirect to /login (from ProtectedRoute)
 *     ├── Not Admin → Access Denied
 *     └── Is Admin → {children}
 *
 * 사용:
 * <AdminRoute>
 *   <DashboardLayout>
 *     <AdminDashboardPage />
 *   </DashboardLayout>
 * </AdminRoute>
 */

import { ReactNode } from "react";
import ProtectedRoute from "./ProtectedRoute";
import { useAuthStore } from "../stores/authStore";

interface AdminRouteProps {
  children: ReactNode;
}

export default function AdminRoute({ children }: AdminRouteProps) {
  const { membership } = useAuthStore();

  return (
    <ProtectedRoute>
      {membership?.role === "owner" || membership?.role === "admin" ? (
        <>{children}</>
      ) : (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-6">
              You do not have permission to access this page. Admin or owner role is required.
            </p>
            <a
              href="/dashboard"
              className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
