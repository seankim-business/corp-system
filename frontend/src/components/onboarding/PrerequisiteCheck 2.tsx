import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export interface Check {
  id: string;
  label: string;
  status: 'checking' | 'passed' | 'failed' | 'warning';
  message?: string;
}

interface PrerequisiteCheckProps {
  checks: Check[];
}

function CheckItem({ check }: { check: Check }) {
  const icons = {
    checking: (
      <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-600" />
    ),
    passed: <CheckCircleIcon className="h-5 w-5 text-green-500" />,
    failed: <XCircleIcon className="h-5 w-5 text-red-500" />,
    warning: <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />,
  };

  return (
    <div className="flex items-center gap-3 py-3">
      {icons[check.status]}
      <div className="flex-1">
        <span className={check.status === 'failed' ? 'text-red-600' : 'text-gray-700'}>
          {check.label}
        </span>
        {check.message && <p className="text-sm text-gray-500 mt-1">{check.message}</p>}
      </div>
    </div>
  );
}

export function PrerequisiteCheck({ checks }: PrerequisiteCheckProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
      {checks.map((check) => (
        <CheckItem key={check.id} check={check} />
      ))}
    </div>
  );
}
