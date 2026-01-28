import { useEffect, useState } from "react";
import { request } from "../api/client";

interface OrganizationChange {
  id: string;
  type: string;
  description: string;
  impactLevel: "low" | "medium" | "high";
  createdBy: string;
  createdAt: string;
}

interface ListResponse {
  data: OrganizationChange[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export default function OrgChangesPage() {
  const [changes, setChanges] = useState<OrganizationChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [impactFilter, setImpactFilter] = useState<"" | "low" | "medium" | "high">("");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  useEffect(() => {
    const fetchChanges = async () => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
        });
        if (typeFilter) params.append("type", typeFilter);
        if (impactFilter) params.append("impactLevel", impactFilter);

        const data = await request<ListResponse>({
          url: `/api/org-changes?${params.toString()}`,
          method: "GET",
        });
        setChanges(data.data || []);
      } catch (error) {
        console.error("Failed to fetch organization changes:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChanges();
  }, [typeFilter, impactFilter, offset]);

  const getImpactColor = (level: string) => {
    switch (level) {
      case "high":
        return "bg-red-100 text-red-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "low":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "new_member":
        return "👤";
      case "role_change":
        return "🔄";
      case "workflow_added":
        return "⚙️";
      case "workflow_deleted":
        return "🗑️";
      case "integration_added":
        return "🔗";
      case "settings_changed":
        return "⚙️";
      default:
        return "📝";
    }
  };

  if (isLoading && changes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading organization changes...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Organization Changes</h1>
        <p className="text-gray-600">Track organizational changes and updates</p>
      </div>

      <div className="mb-6 flex gap-4 flex-wrap">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Type</label>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setOffset(0);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <option value="">All Types</option>
            <option value="new_member">New Member</option>
            <option value="role_change">Role Change</option>
            <option value="workflow_added">Workflow Added</option>
            <option value="workflow_deleted">Workflow Deleted</option>
            <option value="integration_added">Integration Added</option>
            <option value="settings_changed">Settings Changed</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Impact</label>
          <select
            value={impactFilter}
            onChange={(e) => {
              setImpactFilter(e.target.value as "" | "low" | "medium" | "high");
              setOffset(0);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <option value="">All Impact Levels</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      {changes.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No changes yet</h2>
            <p className="text-gray-600">Organization changes will appear here</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Impact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {changes.map((change) => (
                <tr key={change.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <span className="mr-2">{getTypeIcon(change.type)}</span>
                    {change.type.replace(/_/g, " ")}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 max-w-md truncate">
                    {change.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getImpactColor(
                        change.impactLevel,
                      )}`}
                    >
                      {change.impactLevel}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(change.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {changes.length > 0 && (
        <div className="mt-6 flex justify-between items-center">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Showing {offset + 1} to {Math.min(offset + limit, offset + changes.length)}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={changes.length < limit}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
