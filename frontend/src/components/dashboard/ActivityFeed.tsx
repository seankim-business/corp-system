import { useState } from 'react';

interface Activity {
  id: string;
  type: 'execution' | 'message' | 'user' | 'system';
  title: string;
  description?: string;
  timestamp: Date;
  status?: 'success' | 'error' | 'pending';
}

export function ActivityFeed() {
  const [activities] = useState<Activity[]>([
    { id: '1', type: 'execution', title: 'Workflow completed', description: 'Daily report', timestamp: new Date(), status: 'success' },
    { id: '2', type: 'message', title: 'New message', description: 'From Slack #general', timestamp: new Date(Date.now() - 60000) },
    { id: '3', type: 'system', title: 'System update', timestamp: new Date(Date.now() - 120000) },
  ]);

  const statusColors = {
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Recent Activity</h3>
      <div className="space-y-3">
        {activities.map((activity, index) => (
          <div
            key={activity.id}
            className="flex items-start gap-3 py-2 animate-fade-in"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className={`w-2 h-2 rounded-full mt-2 ${activity.status ? statusColors[activity.status].split(' ')[0] : 'bg-gray-300'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{activity.title}</p>
              {activity.description && <p className="text-xs text-gray-500">{activity.description}</p>}
            </div>
            <span className="text-xs text-gray-400">{formatTime(activity.timestamp)}</span>
          </div>
        ))}
        {activities.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No recent activity</p>
        )}
      </div>
    </div>
  );
}

function formatTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}
