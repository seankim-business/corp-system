/**
 * Reusable component displayed when a backend API endpoint is not yet available.
 * Shows a friendly informational message instead of a red error banner.
 */

interface FeatureComingSoonProps {
  title: string;
  description?: string;
  onRetry?: () => void;
}

export default function FeatureComingSoon({
  title,
  description,
  onRetry,
}: FeatureComingSoonProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-12 text-center max-w-lg">
        <div className="text-4xl mb-4">
          <svg
            className="w-12 h-12 mx-auto text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M11.42 15.17l-5.28-3.3a.5.5 0 010-.84l5.28-3.3a.5.5 0 01.76.42v6.6a.5.5 0 01-.76.42zM20 7l-8 5 8 5V7z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-blue-900 mb-2">{title}</h3>
        <p className="text-blue-700 text-sm">
          {description || "This feature is currently being set up. Please check back later."}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
