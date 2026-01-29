import { Link, useLocation } from "react-router-dom";

interface NavItem {
  name: string;
  path: string;
  icon: string;
}

const mainNavItems: NavItem[] = [
  { name: "Dashboard", path: "/dashboard", icon: "🏠" },
  { name: "OKRs", path: "/okr", icon: "🎯" },
  { name: "Workflows", path: "/workflows", icon: "📋" },
  { name: "Executions", path: "/executions", icon: "⏱️" },
  { name: "Activity", path: "/activity", icon: "📡" },
  { name: "Search", path: "/search", icon: "🔍" },
  { name: "Conversations", path: "/conversations", icon: "💬" },
  { name: "Settings", path: "/settings", icon: "⚙️" },
];

const organizationNavItems: NavItem[] = [
  { name: "Members", path: "/settings/members", icon: "👥" },
  { name: "Approvals", path: "/approvals", icon: "✅" },
  { name: "Changes", path: "/org-changes", icon: "📊" },
];

const integrationNavItems: NavItem[] = [
  { name: "Notion Settings", path: "/settings/notion", icon: "📝" },
  { name: "Slack Settings", path: "/settings/slack", icon: "💬" },
];

const analyticsNavItems: NavItem[] = [
  { name: "Analytics", path: "/analytics", icon: "📈" },
  { name: "Costs", path: "/costs", icon: "💰" },
  { name: "Patterns", path: "/patterns", icon: "🔮" },
  { name: "Feedback", path: "/feedback", icon: "📝" },
  { name: "System Health", path: "/system-health", icon: "🏥" },
];

const knowledgeNavItems: NavItem[] = [
  { name: "Knowledge Graph", path: "/knowledge-graph", icon: "🧠" },
  { name: "SOP Drafts", path: "/sops/drafts", icon: "📄" },
  { name: "SOP Editor", path: "/sops/editor", icon: "✏️" },
];

const marketplaceNavItems: NavItem[] = [
  { name: "Marketplace", path: "/marketplace", icon: "🏪" },
  { name: "Developer Portal", path: "/developer", icon: "👨‍💻" },
];

const adminNavItems: NavItem[] = [
  { name: "Admin Dashboard", path: "/admin", icon: "🔧" },
  { name: "Agents", path: "/admin/agents", icon: "🤖" },
  { name: "Skills", path: "/admin/skills", icon: "⚡" },
  { name: "Optimization", path: "/admin/optimization", icon: "🔬" },
  { name: "Organizations", path: "/admin/organizations", icon: "🏢" },
  { name: "Billing", path: "/billing", icon: "💳" },
];

export default function Sidebar() {
  const location = useLocation();

  const renderNavItems = (items: NavItem[]) => {
    return items.map((item) => {
      const isActive = location.pathname === item.path;
      const className = isActive
        ? "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors bg-indigo-600 text-white"
        : "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-gray-700 hover:bg-gray-200";
      return (
        <li key={item.path}>
          <Link to={item.path} className={className}>
            <span className="text-xl">{item.icon}</span>
            <span className="font-medium">{item.name}</span>
          </Link>
        </li>
      );
    });
  };

  return (
    <aside className="w-64 bg-gray-50 fixed left-0 top-16 bottom-0 border-r border-gray-200 overflow-y-auto">
      <nav className="p-4">
        <div className="space-y-6">
          <div><ul className="space-y-2">{renderNavItems(mainNavItems)}</ul></div>
          <div>
            <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Organization</h3>
            <ul className="space-y-2">{renderNavItems(organizationNavItems)}</ul>
          </div>
          <div>
            <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Integrations</h3>
            <ul className="space-y-2">{renderNavItems(integrationNavItems)}</ul>
          </div>
          <div>
            <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Analytics</h3>
            <ul className="space-y-2">{renderNavItems(analyticsNavItems)}</ul>
          </div>
          <div>
            <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Knowledge</h3>
            <ul className="space-y-2">{renderNavItems(knowledgeNavItems)}</ul>
          </div>
          <div>
            <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Marketplace</h3>
            <ul className="space-y-2">{renderNavItems(marketplaceNavItems)}</ul>
          </div>
          <div>
            <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Admin</h3>
            <ul className="space-y-2">{renderNavItems(adminNavItems)}</ul>
          </div>
        </div>
      </nav>
    </aside>
  );
}
