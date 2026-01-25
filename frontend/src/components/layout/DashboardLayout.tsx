/**
 * DashboardLayout Component
 * 
 * 기획:
 * - 전체 레이아웃 래퍼
 * - Header (상단 고정) + Sidebar (좌측 고정) + Main Content
 * - 로그인 후 모든 페이지에서 사용
 * 
 * 구조:
 * DashboardLayout
 * ├── Header (z-index: 50, height: 64px)
 * ├── Sidebar (left: 0, top: 64px, width: 256px)
 * └── Main
 *     └── {children} (left: 256px, top: 64px 기준)
 * 
 * Props:
 * - children: 페이지 컨텐츠
 */

import { ReactNode } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { useAuthStore } from '../../stores/authStore';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuthStore();

  return (
    <div className="min-h-screen bg-gray-100">
      <Header user={user || undefined} onLogout={logout} />
      <Sidebar />
      <main className="ml-64 mt-16 p-8">
        {children}
      </main>
    </div>
  );
}
