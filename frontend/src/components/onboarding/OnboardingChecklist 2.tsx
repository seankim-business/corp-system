import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface ChecklistItem {
  id: string;
  title: string;
  titleKo: string;
  description: string;
  descriptionKo: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  required: boolean;
  order: number;
  action?: {
    type: "link" | "modal" | "api";
    target: string;
    label?: string;
  };
}

interface ChecklistProgress {
  completed: number;
  total: number;
  percentage: number;
  requiredCompleted: number;
  requiredTotal: number;
}

interface OnboardingChecklistProps {
  collapsed?: boolean;
  onClose?: () => void;
}

export default function OnboardingChecklist({ collapsed = false, onClose }: OnboardingChecklistProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [progress, setProgress] = useState<ChecklistProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  useEffect(() => {
    fetchChecklist();
  }, []);

  const fetchChecklist = async () => {
    try {
      const res = await fetch("/api/onboarding/checklist", { credentials: "include" });
      const data = await res.json();

      if (data.success) {
        setItems(data.data.items);
        setProgress(data.data.progress);
      }
    } catch (err) {
      console.error("Failed to fetch checklist", err);
    } finally {
      setLoading(false);
    }
  };

  // TODO: Wire up to UI when ready
  // const markComplete = async (itemId: string) => {
  //   try {
  //     const res = await fetch(`/api/onboarding/checklist/${itemId}/complete`, {
  //       method: "POST",
  //       credentials: "include",
  //     });
  //     const data = await res.json();
  //     if (data.success) {
  //       setItems((prev) =>
  //         prev.map((item) =>
  //           item.id === itemId ? { ...item, status: "completed" as const } : item,
  //         ),
  //       );
  //       setProgress(data.data.progress);
  //     }
  //   } catch (err) {
  //     console.error("Failed to mark complete", err);
  //   }
  // };

  const handleItemClick = (item: ChecklistItem) => {
    if (item.action?.type === "link") {
      navigate(item.action.target);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-2 bg-gray-200 rounded" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Don't show if all items are complete
  if (progress && progress.percentage === 100) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div
        className="p-4 border-b flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
            <svg
              className="w-5 h-5 text-indigo-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Getting Started</h3>
            <p className="text-sm text-gray-500">
              {progress?.completed || 0} of {progress?.total || 0} completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-indigo-600">{progress?.percentage || 0}%</span>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-4 pt-2">
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className="h-1.5 bg-indigo-600 rounded-full transition-all"
            style={{ width: `${progress?.percentage || 0}%` }}
          />
        </div>
      </div>

      {/* Checklist Items */}
      {!isCollapsed && (
        <div className="p-4 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-3 rounded-lg transition ${
                item.status === "completed"
                  ? "bg-green-50"
                  : item.status === "skipped"
                    ? "bg-gray-50 opacity-60"
                    : "hover:bg-gray-50 cursor-pointer"
              }`}
              onClick={() => {
                if (item.status !== "completed" && item.status !== "skipped") {
                  handleItemClick(item);
                }
              }}
            >
              {/* Status Icon */}
              <div
                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                  item.status === "completed"
                    ? "bg-green-500 text-white"
                    : item.status === "skipped"
                      ? "bg-gray-300 text-white"
                      : "border-2 border-gray-300"
                }`}
              >
                {item.status === "completed" && (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                {item.status === "skipped" && (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-medium ${
                      item.status === "completed" || item.status === "skipped"
                        ? "text-gray-500 line-through"
                        : "text-gray-900"
                    }`}
                  >
                    {item.titleKo}
                  </span>
                  {item.required && item.status !== "completed" && (
                    <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                      Required
                    </span>
                  )}
                </div>
                <p
                  className={`text-sm ${
                    item.status === "completed" || item.status === "skipped"
                      ? "text-gray-400"
                      : "text-gray-500"
                  }`}
                >
                  {item.descriptionKo}
                </p>
              </div>

              {/* Action Button */}
              {item.status !== "completed" && item.status !== "skipped" && item.action && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleItemClick(item);
                  }}
                  className="flex-shrink-0 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  {item.action.label || "Start"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {!isCollapsed && onClose && (
        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Dismiss
          </button>
          <a
            href="/onboarding"
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            View full setup guide
          </a>
        </div>
      )}
    </div>
  );
}
