/**
 * IssueAlert Component
 *
 * Displays AR system issues with severity-based styling.
 */
import type { Issue, IssueSeverity } from '../../types/ar';

interface IssueAlertProps {
  issue: Issue;
  onAction?: (action: string) => void;
  compact?: boolean;
}

const severityConfig = {
  critical: {
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-800',
    iconColor: 'text-red-500',
    icon: '🚨',
    label: 'Critical',
  },
  high: {
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    textColor: 'text-orange-800',
    iconColor: 'text-orange-500',
    icon: '⚠️',
    label: 'High',
  },
  medium: {
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    textColor: 'text-yellow-800',
    iconColor: 'text-yellow-500',
    icon: '📢',
    label: 'Medium',
  },
  low: {
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-800',
    iconColor: 'text-blue-500',
    icon: 'ℹ️',
    label: 'Low',
  },
};

export function IssueAlert({ issue, onAction, compact = false }: IssueAlertProps) {
  const config = severityConfig[issue.severity];

  if (compact) {
    return (
      <div
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg border
          ${config.bgColor} ${config.borderColor}
        `}
      >
        <span>{config.icon}</span>
        <span className={`text-sm font-medium ${config.textColor}`}>
          {issue.title}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`
        rounded-lg border p-4
        ${config.bgColor} ${config.borderColor}
      `}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl">{config.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold uppercase ${config.iconColor}`}>
              {config.label}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(issue.detectedAt).toLocaleString()}
            </span>
          </div>
          <h4 className={`font-semibold ${config.textColor}`}>
            {issue.title}
          </h4>
          <p className={`text-sm mt-1 ${config.textColor} opacity-80`}>
            {issue.description}
          </p>

          {issue.affectedAgents.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-gray-500">Affected: </span>
              <span className="text-xs font-medium">
                {issue.affectedAgents.join(', ')}
              </span>
            </div>
          )}

          {issue.suggestedActions.length > 0 && (
            <div className="mt-3 space-y-1">
              <span className="text-xs font-medium text-gray-600">Suggested Actions:</span>
              <ul className="space-y-1">
                {issue.suggestedActions.map((action, index) => (
                  <li
                    key={index}
                    className="text-sm text-gray-700 flex items-start gap-2"
                  >
                    <span className="text-gray-400">•</span>
                    <span
                      className={onAction ? 'cursor-pointer hover:underline' : ''}
                      onClick={() => onAction?.(action)}
                    >
                      {action}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface IssueSeverityBadgeProps {
  severity: IssueSeverity;
}

export function IssueSeverityBadge({ severity }: IssueSeverityBadgeProps) {
  const config = severityConfig[severity];

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
        ${config.bgColor} ${config.textColor}
      `}
    >
      {config.icon} {config.label}
    </span>
  );
}
