/**
 * OrgChangesPage
 *
 * Organization changes and activity log
 */

import { useEffect, useState } from "react";
import { request } from "../api/client";

interface OrgChange {
  id: string;
  type: string;
  description: string;
  actor: string;
  actorEmail?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export default function OrgChangesPage() {
  const [changes, setChanges] = useState<OrgChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchChanges = async () => {
      try {
        const data = await request<{ changes: OrgChange[] }>({
          url: "/api/org-changes",
          method: "GET",
        });
        setChanges(data.changes || []);
      } catch (error) {
        console.error("Failed to fetch org changes:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChanges();
  }, []);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "member_added":
        return "👤";
      case "member_removed":
        return "👋";
      case "settings_updated":
        return "⚙️";
      case "integration_connected":
        return "🔗";
      case "workflow_created":
        return "📋";
      default:
        return "📝";
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "member_added":
      case "integration_connected":
        return "bg-green-100 text-green-800";
      case "member_removed":
        return "bg-red-100 text-red-800";
      case "settings_updated":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading changes...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Organization Changes
        </h1>
        <p className="text-gray-600">View organization activity and audit log</p>
      </div>

      {changes.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">📜</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              No changes yet
            </h2>
            <p className="text-gray-600">
              Organization activity will appear here
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow">
          <div className="flow-root">
            <ul className="-mb-8 p-6">
              {changes.map((change, idx) => (
                <li key={change.id}>
                  <div className="relative pb-8">
                    {idx !== changes.length - 1 && (
                      <span
                        className="absolute top-5 left-5 -ml-px h-full w-0.5 bg-gray-200"
                        aria-hidden="true"
                      />
                    )}
                    <div className="relative flex items-start space-x-3">
                      <div className="relative">
                        <span className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">
                          {getTypeIcon(change.type)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getTypeBadge(
                              change.type
                            )}`}
                          >
                            {change.type.replace(/_/g, " ")}
                          </span>
                          <span className="text-sm text-gray-500">
                            {new Date(change.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-900">
                          {change.description}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          by {change.actor}
                          {change.actorEmail && ` (${change.actorEmail})`}
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
