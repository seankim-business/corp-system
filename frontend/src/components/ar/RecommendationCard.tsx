/**
 * RecommendationCard Component
 *
 * Displays AR system recommendations with actionable buttons.
 */
import type { Recommendation } from '../../types/ar';

interface RecommendationCardProps {
  recommendation: Recommendation;
  onAction?: (action: string, params?: Record<string, unknown>) => void;
}

const priorityConfig = {
  critical: {
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    badgeColor: 'bg-red-100 text-red-700',
    icon: '🚨',
  },
  high: {
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    badgeColor: 'bg-orange-100 text-orange-700',
    icon: '⚡',
  },
  medium: {
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    badgeColor: 'bg-yellow-100 text-yellow-700',
    icon: '💡',
  },
  low: {
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    badgeColor: 'bg-blue-100 text-blue-700',
    icon: '📝',
  },
};

const typeLabels: Record<string, string> = {
  template: 'Template',
  team_composition: 'Team',
  position: 'Position',
  skill_development: 'Skills',
  resource_allocation: 'Resources',
  structure_optimization: 'Structure',
};

export function RecommendationCard({ recommendation, onAction }: RecommendationCardProps) {
  const config = priorityConfig[recommendation.priority];

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
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${config.badgeColor}`}>
              {recommendation.priority.toUpperCase()}
            </span>
            <span className="text-xs text-gray-500 px-2 py-0.5 bg-white rounded">
              {typeLabels[recommendation.type] || recommendation.type}
            </span>
          </div>

          <h4 className="font-semibold text-gray-900 mb-1">
            {recommendation.title}
          </h4>
          <p className="text-sm text-gray-600">
            {recommendation.description}
          </p>

          {recommendation.estimatedImpact && (
            <p className="text-xs text-gray-500 mt-2">
              Expected Impact: {recommendation.estimatedImpact}
            </p>
          )}

          {recommendation.actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {recommendation.actions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => onAction?.(action.action, action.params)}
                  className="
                    px-3 py-1.5 text-sm font-medium rounded-md
                    bg-white border border-gray-200 text-gray-700
                    hover:bg-gray-50 hover:border-gray-300
                    transition-colors
                  "
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
