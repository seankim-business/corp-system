/**
 * Sidebar Component
 * 
 * 기획:
 * - 좌측 고정 사이드바
 * - 너비: 256px (16rem)
 * - 배경: 회색 (#F9FAFB)
 * - 상단에서 Header 아래부터 시작 (top: 64px)
 * - 네비게이션 메뉴 4개
 * 
 * 구조:
 * Sidebar
 * └── NavMenu
 *     ├── Dashboard (홈 아이콘)
 *     ├── Workflows (목록 아이콘)
 *     ├── Executions (시계 아이콘)
 *     └── Settings (톱니바퀴 아이콘)
 * 
 * 상태:
 * - 현재 활성화된 메뉴 하이라이트
 * - 호버 시 배경색 변경
 */

import { Link, useLocation } from 'react-router-dom';

interface NavItem {
  name: string;
  path: string;
  icon: string;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', path: '/dashboard', icon: '🏠' },
  { name: 'Workflows', path: '/workflows', icon: '📋' },
  { name: 'Executions', path: '/executions', icon: '⏱️' },
  { name: 'Settings', path: '/settings', icon: '⚙️' },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 bg-gray-50 fixed left-0 top-16 bottom-0 border-r border-gray-200">
      <nav className="p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
