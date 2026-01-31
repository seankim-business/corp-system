# Status Badge Implementation Guide

Complete code examples and patterns for implementing status badges in your Nubabel workflow system.

## Quick Start

### 1. Basic Status Badge Component

```tsx
// components/StatusBadge.tsx
import React, { ReactNode } from 'react';

type StatusType = 'success' | 'error' | 'warning' | 'info' | 'pending';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  icon?: ReactNode;
  animated?: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  icon,
  animated = false
}) => {
  const statusConfig: Record<StatusType, any> = {
    success: {
      bg: '#ECFDF5',
      text: '#065F46',
      border: '#A7F3D0',
      icon: '✓',
      label: 'Success'
    },
    error: {
      bg: '#FEF2F2',
      text: '#7F1D1D',
      border: '#FECACA',
      icon: '✗',
      label: 'Error'
    },
    warning: {
      bg: '#FFFBEB',
      text: '#78350F',
      border: '#FCD34D',
      icon: '⚠',
      label: 'Warning'
    },
    info: {
      bg: '#F0F9FF',
      text: '#1E40AF',
      border: '#BFDBFE',
      icon: 'ℹ',
      label: 'Info'
    },
    pending: {
      bg: '#F3F4F6',
      text: '#374151',
      border: '#D1D5DB',
      icon: '⏳',
      label: 'Pending'
    }
  };

  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
        animated && status === 'pending' ? 'animate-pulse' : ''
      }`}
      style={{
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`
      }}
      role="status"
      aria-label={`Status: ${label || config.label}`}
    >
      {icon || config.icon}
      {label || config.label}
    </span>
  );
};

export default StatusBadge;
```

### 2. Tailwind CSS Version

```tsx
// components/StatusBadgeTailwind.tsx
import React, { ReactNode } from 'react';

type StatusType = 'success' | 'error' | 'warning' | 'info' | 'pending';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const StatusBadgeTailwind: React.FC<StatusBadgeProps> = ({
  status,
  label,
  icon,
  size = 'md'
}) => {
  const statusClasses: Record<StatusType, string> = {
    success: 'bg-green-100 text-green-800 border-green-300',
    error: 'bg-red-100 text-red-800 border-red-300',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    info: 'bg-blue-100 text-blue-800 border-blue-300',
    pending: 'bg-gray-100 text-gray-800 border-gray-300 animate-pulse'
  };

  const sizeClasses: Record<string, string> = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  const statusIcons: Record<StatusType, string> = {
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ',
    pending: '⏳'
  };

  const statusLabels: Record<StatusType, string> = {
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Info',
    pending: 'Pending'
  };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full font-medium border ${statusClasses[status]} ${sizeClasses[size]}`}
      role="status"
      aria-label={`Status: ${label || statusLabels[status]}`}
    >
      {icon || statusIcons[status]}
      {label || statusLabels[status]}
    </span>
  );
};

export default StatusBadgeTailwind;
```

### 3. Workflow Execution Status Component

```tsx
// components/ExecutionStatus.tsx
import React, { useState, useEffect } from 'react';
import StatusBadge from './StatusBadge';

interface Execution {
  id: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  progress?: number;
}

interface ExecutionStatusProps {
  execution: Execution;
  showProgress?: boolean;
  showDuration?: boolean;
  showError?: boolean;
}

const ExecutionStatus: React.FC<ExecutionStatusProps> = ({
  execution,
  showProgress = false,
  showDuration = false,
  showError = true
}) => {
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (execution.startedAt && execution.completedAt) {
      const start = new Date(execution.startedAt).getTime();
      const end = new Date(execution.completedAt).getTime();
      setDuration(Math.round((end - start) / 1000));
    }
  }, [execution.startedAt, execution.completedAt]);

  const mapStatusToType = (status: string): 'success' | 'error' | 'warning' | 'info' | 'pending' => {
    switch (status) {
      case 'success':
        return 'success';
      case 'failed':
        return 'error';
      case 'cancelled':
        return 'warning';
      case 'running':
        return 'info';
      default:
        return 'pending';
    }
  };

  const getStatusLabel = (status: string): string => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <StatusBadge
          status={mapStatusToType(execution.status)}
          label={getStatusLabel(execution.status)}
          animated={execution.status === 'running'}
        />

        {showProgress && execution.progress !== undefined && (
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${execution.progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-600">{execution.progress}%</span>
          </div>
        )}

        {showDuration && duration !== null && (
          <span className="text-xs text-gray-600">{duration}s</span>
        )}
      </div>

      {showError && execution.status === 'failed' && execution.errorMessage && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
          {execution.errorMessage}
        </div>
      )}
    </div>
  );
};

export default ExecutionStatus;
```

## Advanced Patterns

### 1. Status Badge with Tooltip

```tsx
// components/StatusBadgeWithTooltip.tsx
import React, { ReactNode, useState } from 'react';
import StatusBadge from './StatusBadge';

interface StatusBadgeWithTooltipProps {
  status: 'success' | 'error' | 'warning' | 'info' | 'pending';
  label?: string;
  tooltip?: string;
  icon?: ReactNode;
}

const StatusBadgeWithTooltip: React.FC<StatusBadgeWithTooltipProps> = ({
  status,
  label,
  tooltip,
  icon
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        tabIndex={0}
      >
        <StatusBadge status={status} label={label} icon={icon} />
      </div>

      {showTooltip && tooltip && (
        <div
          className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10 pointer-events-none"
          role="tooltip"
        >
          {tooltip}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
};

export default StatusBadgeWithTooltip;
```

### 2. Status Timeline Component

```tsx
// components/StatusTimeline.tsx
import React from 'react';
import StatusBadge from './StatusBadge';

interface StatusEvent {
  id: string;
  status: 'success' | 'error' | 'warning' | 'info' | 'pending';
  label: string;
  timestamp: string;
  description?: string;
}

interface StatusTimelineProps {
  events: StatusEvent[];
  currentStatus?: string;
}

const StatusTimeline: React.FC<StatusTimelineProps> = ({
  events,
  currentStatus
}) => {
  return (
    <div className="space-y-4">
      {events.map((event, index) => (
        <div key={event.id} className="flex gap-4">
          {/* Timeline line */}
          <div className="flex flex-col items-center">
            <div
              className={`w-3 h-3 rounded-full ${
                event.status === 'success'
                  ? 'bg-green-500'
                  : event.status === 'error'
                  ? 'bg-red-500'
                  : 'bg-gray-300'
              }`}
            />
            {index < events.length - 1 && (
              <div className="w-0.5 h-12 bg-gray-200 mt-2" />
            )}
          </div>

          {/* Event content */}
          <div className="flex-1 pt-1">
            <div className="flex items-center gap-2">
              <StatusBadge status={event.status} label={event.label} />
              <span className="text-xs text-gray-500">{event.timestamp}</span>
            </div>
            {event.description && (
              <p className="text-sm text-gray-600 mt-1">{event.description}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatusTimeline;
```

### 3. Status Badge with Animation

```tsx
// components/AnimatedStatusBadge.tsx
import React from 'react';
import StatusBadge from './StatusBadge';

interface AnimatedStatusBadgeProps {
  status: 'success' | 'error' | 'warning' | 'info' | 'pending';
  label?: string;
  onStatusChange?: (status: string) => void;
}

const AnimatedStatusBadge: React.FC<AnimatedStatusBadgeProps> = ({
  status,
  label,
  onStatusChange
}) => {
  React.useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const animationClass = {
    success: 'animate-bounce',
    error: 'animate-shake',
    warning: 'animate-pulse',
    info: 'animate-spin',
    pending: 'animate-pulse'
  }[status];

  return (
    <div className={animationClass}>
      <StatusBadge status={status} label={label} />
    </div>
  );
};

export default AnimatedStatusBadge;
```

## CSS Animations

### Tailwind CSS Configuration

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      animation: {
        'shake': 'shake 0.5s ease-in-out',
        'bounce-slow': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-5px)' },
          '75%': { transform: 'translateX(5px)' },
        },
      },
    },
  },
};
```

### Custom CSS

```css
/* styles/animations.css */

@keyframes shake {
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-5px);
  }
  75% {
    transform: translateX(5px);
  }
}

@keyframes slideIn {
  from {
    transform: translateX(-10px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes scaleIn {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.badge-enter {
  animation: slideIn 0.3s ease-out;
}

.badge-success-enter {
  animation: scaleIn 0.3s ease-out;
}

.badge-error-enter {
  animation: shake 0.5s ease-in-out;
}
```

## Integration with Execution Pages

### Updated ExecutionsPage with Status Badges

```tsx
// frontend/src/pages/ExecutionsPage.tsx
import { useState, useEffect } from 'react';
import ExecutionStatus from '../components/ExecutionStatus';

interface Execution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  progress?: number;
  workflow?: {
    name: string;
  };
}

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed' | 'running' | 'pending'>('all');

  useEffect(() => {
    const fetchExecutions = async () => {
      try {
        const response = await fetch('/api/executions', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setExecutions(data.executions || []);
        }
      } catch (error) {
        console.error('Failed to fetch executions:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchExecutions();
    // Poll for updates every 2 seconds
    const interval = setInterval(fetchExecutions, 2000);
    return () => clearInterval(interval);
  }, []);

  const filteredExecutions = executions.filter((exec) => {
    if (filter === 'all') return true;
    return exec.status === filter;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading executions...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Executions</h1>
        <p className="text-gray-600">View workflow execution history</p>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex gap-2">
        {(['all', 'success', 'failed', 'running', 'pending'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Executions table */}
      {filteredExecutions.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">⏱️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              No executions yet
            </h2>
            <p className="text-gray-600">
              Execute workflows to see their history here
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Workflow
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Started
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredExecutions.map((execution) => {
                const duration = execution.startedAt && execution.completedAt
                  ? Math.round(
                      (new Date(execution.completedAt).getTime() -
                        new Date(execution.startedAt).getTime()) /
                        1000
                    )
                  : null;

                return (
                  <tr key={execution.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <ExecutionStatus
                        execution={execution}
                        showProgress={execution.status === 'running'}
                        showDuration={false}
                        showError={false}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {execution.workflow?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {execution.startedAt
                        ? new Date(execution.startedAt).toLocaleString()
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {duration !== null ? `${duration}s` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {execution.status === 'failed' && execution.errorMessage && (
                        <span
                          className="text-red-600 cursor-help"
                          title={execution.errorMessage}
                        >
                          {execution.errorMessage.substring(0, 30)}...
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

## Testing Status Badges

```tsx
// __tests__/StatusBadge.test.tsx
import { render, screen } from '@testing-library/react';
import StatusBadge from '../components/StatusBadge';

describe('StatusBadge', () => {
  it('renders success badge', () => {
    render(<StatusBadge status="success" label="Success" />);
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Status: Success');
  });

  it('renders error badge', () => {
    render(<StatusBadge status="error" label="Error" />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders pending badge with animation', () => {
    render(<StatusBadge status="pending" label="Pending" animated={true} />);
    const badge = screen.getByText('Pending').closest('span');
    expect(badge).toHaveClass('animate-pulse');
  });

  it('renders custom icon', () => {
    render(<StatusBadge status="success" icon="🎉" />);
    expect(screen.getByText('🎉')).toBeInTheDocument();
  });
});
```

## Performance Optimization

```tsx
// components/OptimizedStatusBadge.tsx
import React, { memo } from 'react';

interface OptimizedStatusBadgeProps {
  status: 'success' | 'error' | 'warning' | 'info' | 'pending';
  label?: string;
}

// Memoize to prevent unnecessary re-renders
const OptimizedStatusBadge = memo<OptimizedStatusBadgeProps>(
  ({ status, label }) => {
    // Component implementation
    return <span>{label}</span>;
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if status or label changes
    return prevProps.status === nextProps.status && prevProps.label === nextProps.label;
  }
);

OptimizedStatusBadge.displayName = 'OptimizedStatusBadge';

export default OptimizedStatusBadge;
```

