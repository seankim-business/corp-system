import { useEffect, useState } from "react";
import { request } from "../api/client";

interface PRMetadata {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  author?: string;
  lastSynced?: string;
}

interface OrganizationChange {
  id: string;
  type: string;
  description: string;
  impactLevel: "low" | "medium" | "high";
  createdBy: string;
  createdAt: string;
  prUrl?: string;
  metadata?: {
    pr?: PRMetadata;
  };
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
  const [linkingPRFor, setLinkingPRFor] = useState<string | null>(null);
  const [prUrlInput, setPrUrlInput] = useState("");
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

  const getPRStatusColor = (state: string) => {
    switch (state) {
      case "merged":
        return "bg-purple-100 text-purple-800";
      case "open":
        return "bg-green-100 text-green-800";
      case "closed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleLinkPR = async (changeId: string) => {
    try {
      await request({
        url: `/api/org-changes/${changeId}/link-pr`,
        method: "POST",
        data: { prUrl: prUrlInput },
      });

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
      setLinkingPRFor(null);
      setPrUrlInput("");
    } catch (error) {
      console.error("Failed to link PR:", error);
      alert("Failed to link PR. Please check the URL format.");
    }
  };

  const handleSyncPRStatus = async (changeId: string) => {
    try {
      await request({
        url: `/api/org-changes/${changeId}/pr-status`,
        method: "GET",
      });

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
      console.error("Failed to sync PR status:", error);
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
                  PR Status
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    {change.prUrl && change.metadata?.pr ? (
                      <div className="flex items-center gap-2">
                        <a
                          href={change.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getPRStatusColor(
                            change.metadata.pr.state,
                          )}`}
                        >
                          {change.metadata.pr.state} #{change.metadata.pr.number}
                        </a>
                        <button
                          onClick={() => handleSyncPRStatus(change.id)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Refresh PR status"
                        >
                          🔄
                        </button>
                      </div>
                    ) : linkingPRFor === change.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={prUrlInput}
                          onChange={(e) => setPrUrlInput(e.target.value)}
                          placeholder="https://github.com/..."
                          className="px-2 py-1 text-xs border border-gray-300 rounded"
                        />
                        <button
                          onClick={() => handleLinkPR(change.id)}
                          className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                        >
                          Link
                        </button>
                        <button
                          onClick={() => {
                            setLinkingPRFor(null);
                            setPrUrlInput("");
                          }}
                          className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setLinkingPRFor(change.id)}
                        className="text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        + Link PR
                      </button>
                    )}
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
