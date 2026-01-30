/**
 * WorkloadBar Component
 *
 * Visualizes agent workload with a progress bar.
 */
interface WorkloadBarProps {
  workload: number; // 0-1 scale
  size?: 'sm' | 'md' | 'lg';
  showPercentage?: boolean;
  showStatus?: boolean;
}

function getWorkloadStatus(workload: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (workload >= 0.9) {
    return { label: 'Critical', color: 'bg-red-500', bgColor: 'bg-red-100' };
  } else if (workload >= 0.8) {
    return { label: 'High', color: 'bg-orange-500', bgColor: 'bg-orange-100' };
  } else if (workload >= 0.6) {
    return { label: 'Normal', color: 'bg-green-500', bgColor: 'bg-green-100' };
  } else if (workload >= 0.3) {
    return { label: 'Low', color: 'bg-blue-500', bgColor: 'bg-blue-100' };
  } else {
    return { label: 'Idle', color: 'bg-gray-400', bgColor: 'bg-gray-100' };
  }
}

const sizeClasses = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export function WorkloadBar({
  workload,
  size = 'md',
  showPercentage = false,
  showStatus = false,
}: WorkloadBarProps) {
  const status = getWorkloadStatus(workload);
  const percentage = Math.round(workload * 100);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <div className={`flex-1 ${status.bgColor} rounded-full overflow-hidden ${sizeClasses[size]}`}>
          <div
            className={`${status.color} h-full rounded-full transition-all duration-500`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {showPercentage && (
          <span className="text-sm font-medium text-gray-600 w-12 text-right">
            {percentage}%
          </span>
        )}
      </div>
      {showStatus && (
        <span className={`text-xs mt-1 inline-block ${
          status.label === 'Critical' ? 'text-red-600' :
          status.label === 'High' ? 'text-orange-600' :
          status.label === 'Normal' ? 'text-green-600' :
          status.label === 'Low' ? 'text-blue-600' : 'text-gray-500'
        }`}>
          {status.label}
        </span>
      )}
    </div>
  );
}
