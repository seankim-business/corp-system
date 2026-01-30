/**
 * ARStatCard Component
 *
 * Displays AR-specific statistics with optional trend indicator.
 */
import { useEffect, useState } from 'react';

interface ARStatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
  change?: number;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
  onClick?: () => void;
}

const colorClasses = {
  blue: 'bg-blue-50 border-blue-200 text-blue-600',
  green: 'bg-green-50 border-green-200 text-green-600',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-600',
  red: 'bg-red-50 border-red-200 text-red-600',
  purple: 'bg-purple-50 border-purple-200 text-purple-600',
  gray: 'bg-gray-50 border-gray-200 text-gray-600',
};

const iconColorClasses = {
  blue: 'text-blue-500',
  green: 'text-green-500',
  yellow: 'text-yellow-500',
  red: 'text-red-500',
  purple: 'text-purple-500',
  gray: 'text-gray-500',
};

export function ARStatCard({
  title,
  value,
  icon,
  description,
  trend = 'neutral',
  change,
  color = 'blue',
  onClick,
}: ARStatCardProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (typeof value !== 'number') return;
    const duration = 800;
    const start = Date.now();
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(animate);
    };
    animate();
  }, [value]);

  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-gray-500',
  };

  const trendIcons = {
    up: '↑',
    down: '↓',
    neutral: '→',
  };

  return (
    <div
      className={`
        bg-white rounded-xl shadow-sm border p-5
        transition-all duration-200
        ${onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.02]' : ''}
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900">
            {typeof value === 'number' ? displayValue.toLocaleString() : value}
          </p>
          {description && (
            <p className="text-xs text-gray-400 mt-1">{description}</p>
          )}
          {change !== undefined && (
            <p className={`text-sm mt-2 ${trendColors[trend]}`}>
              {trendIcons[trend]} {change > 0 ? '+' : ''}{change}% from last period
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <span className={iconColorClasses[color]}>{icon}</span>
        </div>
      </div>
    </div>
  );
}
