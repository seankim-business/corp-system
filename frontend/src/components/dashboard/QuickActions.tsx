import { useNavigate } from 'react-router-dom';
import { PlusIcon, PlayIcon, Cog6ToothIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  path: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'new-workflow', label: 'New Workflow', icon: <PlusIcon className="h-5 w-5" />, shortcut: 'N', path: '/workflows?create=true' },
  { id: 'run-workflow', label: 'Run Workflow', icon: <PlayIcon className="h-5 w-5" />, shortcut: 'R', path: '/workflows' },
  { id: 'settings', label: 'Settings', icon: <Cog6ToothIcon className="h-5 w-5" />, shortcut: 'S', path: '/settings' },
  { id: 'help', label: 'Help & Docs', icon: <QuestionMarkCircleIcon className="h-5 w-5" />, shortcut: '?', path: '/help' },
];

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.id}
            onClick={() => navigate(action.path)}
            className="flex items-center gap-3 px-3 py-2 text-left rounded-lg hover:bg-gray-50 transition-colors group"
          >
            <span className="text-gray-400 group-hover:text-indigo-600">{action.icon}</span>
            <span className="flex-1 text-sm text-gray-700">{action.label}</span>
            {action.shortcut && (
              <kbd className="px-2 py-0.5 text-xs bg-gray-100 rounded text-gray-500">{action.shortcut}</kbd>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
