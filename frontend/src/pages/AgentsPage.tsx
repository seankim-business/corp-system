/**
 * AgentsPage Component
 *
 * Admin page for managing AI agents.
 * - List all agents with their skills and permissions
 * - Create/Edit agents (creates GitHub PR)
 * - Delete agents (creates GitHub PR)
 * - View pending PRs for agent changes
 */

import { useEffect, useState } from "react";
import { ApiError, request } from "../api/client";
import AgentCard from "../components/admin/AgentCard";
import AgentFormModal from "../components/admin/AgentFormModal";

interface Skill {
  id: string;
  name: string;
}

interface Tool {
  id: string;
  name: string;
  description: string;
}

interface Agent {
  id: string;
  name: string;
  function: string;
  description: string;
  skills: string[];
  skillDetails?: Skill[];
  tools: string[];
  routing_keywords: string[];
  permissions: {
    read: string[];
    write: string[];
  };
  enabled?: boolean;
}

interface PullRequest {
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  branch: string;
  author: string;
  author_avatar: string;
  draft: boolean;
  resource_type: string;
  resource_id: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [pendingPRs, setPendingPRs] = useState<PullRequest[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFunction, setFilterFunction] = useState<string>("all");

  const fetchPendingPRs = async () => {
    try {
      const data = await request<{ pullRequests: PullRequest[] }>({
        url: "/api/admin/pending-prs?type=agent",
        method: "GET",
      });
      setPendingPRs(data.pullRequests);
    } catch (err) {
      console.error("Failed to fetch pending PRs:", err);
    }
  };

  const fetchAgents = async () => {
    try {
      const data = await request<{ agents: Agent[] }>({
        url: "/api/admin/agents",
        method: "GET",
      });
      setAgents(data.agents);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to fetch agents";
      setError(message);
    }
  };

  const fetchSkills = async () => {
    try {
      const data = await request<{ skills: Skill[] }>({
        url: "/api/admin/skills",
        method: "GET",
      });
      setSkills(data.skills.map((s) => ({ id: s.id, name: s.name })));
    } catch (err) {
      console.error("Failed to fetch skills:", err);
    }
  };

  const fetchTools = async () => {
    try {
      const data = await request<{ tools: Tool[] }>({
        url: "/api/admin/tools",
        method: "GET",
      });
      setTools(data.tools);
    } catch (err) {
      console.error("Failed to fetch tools:", err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchAgents(), fetchSkills(), fetchTools(), fetchPendingPRs()]);
      setIsLoading(false);
    };
    loadData();
  }, []);

  const handleCreate = () => {
    setEditingAgent(null);
    setIsModalOpen(true);
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setIsModalOpen(true);
  };

  const handleDelete = async (agent: Agent) => {
    if (!confirm(`Are you sure you want to delete "${agent.name}"? This will create a PR.`)) {
      return;
    }

    try {
      const result = await request<{ pullRequest: PullRequest }>({
        url: `/api/admin/agents/${agent.id}`,
        method: "DELETE",
      });
      setSuccessMessage(
        `PR created to delete agent. View at: ${result.pullRequest.html_url}`,
      );
      fetchAgents();
      fetchPendingPRs();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to delete agent";
      setError(message);
    }
  };

  const handleSuccess = () => {
    setSuccessMessage("Changes submitted successfully. A GitHub PR has been created for review.");
    fetchAgents();
    fetchPendingPRs();
  };

  const handleViewActivity = (agent: Agent) => {
    // Navigate to activity page with agent filter
    window.location.href = `/activity?agent=${agent.id}`;
  };

  const handleToggleEnabled = async (agent: Agent, enabled: boolean) => {
    try {
      const result = await request<{ pullRequest: { html_url: string } }>({
        url: `/api/admin/agents/${agent.id}`,
        method: "PUT",
        data: {
          ...agent,
          enabled,
        },
      });
      setSuccessMessage(
        `PR created to ${enabled ? "enable" : "disable"} agent. View at: ${result.pullRequest.html_url}`,
      );
      fetchAgents();
      fetchPendingPRs();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to toggle agent status";
      setError(message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Agents</h1>
          <p className="text-gray-600">Manage AI agents and their configurations</p>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        >
          <span className="text-lg">+</span>
          Create Agent
        </button>
      </div>

      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-800 rounded-lg flex justify-between items-center">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-green-600 hover:text-green-800">
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
            ×
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-indigo-600">{agents.length}</div>
          <div className="text-sm text-gray-500">Total Agents</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">
            {new Set(agents.map((a) => a.function)).size}
          </div>
          <div className="text-sm text-gray-500">Functions</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-purple-600">
            {new Set(agents.flatMap((a) => a.skills)).size}
          </div>
          <div className="text-sm text-gray-500">Unique Skills</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-blue-600">
            {new Set(agents.flatMap((a) => a.tools)).size}
          </div>
          <div className="text-sm text-gray-500">Tools in Use</div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search agents by name, ID, or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterFunction}
            onChange={(e) => setFilterFunction(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="all">All Functions</option>
            {Array.from(new Set(agents.map((a) => a.function))).map((func) => (
              <option key={func} value={func}>
                {func.charAt(0).toUpperCase() + func.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Pending PRs */}
      {pendingPRs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Pending Pull Requests ({pendingPRs.length})
          </h2>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-yellow-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-yellow-800">PR</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-yellow-800">Agent</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-yellow-800">Author</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-yellow-800">Created</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-yellow-800">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-yellow-200">
                {pendingPRs.map((pr) => (
                  <tr key={pr.number} className="hover:bg-yellow-100">
                    <td className="px-4 py-3">
                      <a
                        href={pr.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-yellow-800 hover:underline font-medium"
                      >
                        #{pr.number}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{pr.resource_id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={pr.author_avatar}
                          alt={pr.author}
                          className="w-6 h-6 rounded-full"
                        />
                        <span className="text-sm text-gray-700">{pr.author}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(pr.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {pr.draft ? (
                        <span className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded-full">
                          Draft
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs bg-green-200 text-green-800 rounded-full">
                          Ready
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agents Grid */}
      {(() => {
        const filteredAgents = agents.filter((agent) => {
          // Filter by search query
          const query = searchQuery.toLowerCase();
          const matchesSearch = !query ||
            agent.name.toLowerCase().includes(query) ||
            agent.id.toLowerCase().includes(query) ||
            agent.description.toLowerCase().includes(query) ||
            agent.routing_keywords.some((kw) => kw.toLowerCase().includes(query));

          // Filter by function
          const matchesFunction = filterFunction === "all" || agent.function === filterFunction;

          return matchesSearch && matchesFunction;
        });

        if (agents.length === 0) {
          return (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <div className="text-6xl mb-4">🤖</div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No agents yet</h2>
              <p className="text-gray-600 mb-4">Create your first agent to get started</p>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Create Agent
              </button>
            </div>
          );
        }

        if (filteredAgents.length === 0) {
          return (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <div className="text-6xl mb-4">🔍</div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No matching agents</h2>
              <p className="text-gray-600 mb-4">Try adjusting your search or filters</p>
              <button
                onClick={() => { setSearchQuery(""); setFilterFunction("all"); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Clear Filters
              </button>
            </div>
          );
        }

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onViewActivity={handleViewActivity}
                onToggleEnabled={handleToggleEnabled}
              />
            ))}
          </div>
        );
      })()}

      <AgentFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
        agent={editingAgent}
        availableSkills={skills}
        availableTools={tools}
      />
    </div>
  );
}
