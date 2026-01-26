/**
 * Sidebar Component
 *
 * 기획:
 * - 좌측 고정 사이드바
 * - 너비: 256px (16rem)
 * - 배경: 회색 (#F9FAFB)
 * - 상단에서 Header 아래부터 시작 (top: 64px)
 * - 네비게이션 메뉴: Main (4개) + Integrations 섹션
 *
 * 구조:
 * Sidebar
 * └── NavMenu
 *     ├── Main Section
 *     │   ├── Dashboard (홈 아이콘)
 *     │   ├── Workflows (목록 아이콘)
 *     │   ├── Executions (시계 아이콘)
 *     │   └── Settings (톱니바퀴 아이콘)
 *     └── Integrations Section
 *         └── Notion Settings (Notion 아이콘)
 *
 * 상태:
 * - 현재 활성화된 메뉴 하이라이트
 * - 호버 시 배경색 변경
 */

import { Link, useLocation } from "react-router-dom";

interface NavItem {
  name: string;
  path: string;
  icon: string;
}

const mainNavItems: NavItem[] = [
  { name: "Dashboard", path: "/dashboard", icon: "🏠" },
  { name: "Workflows", path: "/workflows", icon: "📋" },
  { name: "Executions", path: "/executions", icon: "⏱️" },
  { name: "Settings", path: "/settings", icon: "⚙️" },
];

const integrationNavItems: NavItem[] = [
  { name: "Notion Settings", path: "/settings/notion", icon: "📝" },
  { name: "Slack Settings", path: "/settings/slack", icon: "💬" },
];

export default function Sidebar() {
  const location = useLocation();

  const renderNavItems = (items: NavItem[]) => {
    return items.map((item) => {
      const isActive = location.pathname === item.path;
      return (
        <li key={item.path}>
          <Link
            to={item.path}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-200"
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="font-medium">{item.name}</span>
          </Link>
        </li>
      );
    });
  };

  return (
    <aside className="w-64 bg-gray-50 fixed left-0 top-16 bottom-0 border-r border-gray-200">
      <nav className="p-4">
        <div className="space-y-6">
          <div>
            <ul className="space-y-2">{renderNavItems(mainNavItems)}</ul>
          </div>

          <div>
            <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Integrations
            </h3>
            <ul className="space-y-2">{renderNavItems(integrationNavItems)}</ul>
          </div>
        </div>
      </nav>
    </aside>
  );
}
