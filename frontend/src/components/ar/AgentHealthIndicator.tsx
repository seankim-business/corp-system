/**
 * AgentHealthIndicator Component
 *
 * Displays agent health status with visual indicators.
 */
import type { HealthStatus } from '../../types/ar';

interface AgentHealthIndicatorProps {
  status: HealthStatus;
  workload?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig = {
  healthy: {
    color: 'bg-green-500',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    label: 'Healthy',
    icon: '🟢',
  },
  warning: {
    color: 'bg-yellow-500',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    label: 'Warning',
    icon: '🟡',
  },
  critical: {
    color: 'bg-red-500',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    label: 'Critical',
    icon: '🔴',
  },
};

const sizeClasses = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
};

export function AgentHealthIndicator({
  status,
  workload,
  showLabel = false,
  size = 'md',
}: AgentHealthIndicatorProps) {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <span
        className={`${config.color} ${sizeClasses[size]} rounded-full inline-block`}
        title={config.label}
      />
      {showLabel && (
        <span className={`text-sm font-medium ${config.textColor}`}>
          {config.label}
        </span>
      )}
      {workload !== undefined && (
        <span className="text-sm text-gray-500">
          ({Math.round(workload * 100)}%)
        </span>
      )}
    </div>
  );
}

interface AgentHealthBadgeProps {
  status: HealthStatus;
  size?: 'sm' | 'md';
}

export function AgentHealthBadge({ status, size = 'md' }: AgentHealthBadgeProps) {
  const config = statusConfig[status];

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium
        ${config.bgColor} ${config.textColor} ${sizeStyles[size]}
      `}
    >
      <span className={`${config.color} h-1.5 w-1.5 rounded-full`} />
      {config.label}
    </span>
  );
}
