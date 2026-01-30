/**
 * SkillsPage Component
 *
 * Admin page for managing AI skills.
 * - List all skills with their triggers, tools, and agent bindings
 * - Create/Edit skills (creates GitHub PR)
 * - Delete skills (creates GitHub PR)
 */

import { useEffect, useState } from "react";
import { ApiError, request } from "../api/client";
import SkillCard from "../components/admin/SkillCard";
import SkillFormModal from "../components/admin/SkillFormModal";

interface Agent {
  id: string;
  name: string;
}

interface Tool {
  id: string;
  name: string;
  description: string;
}

interface SkillParameter {
  name: string;
  type: string;
  description: string;
  required?: boolean;
  default?: unknown;
}

interface SkillOutput {
  name: string;
  type: string;
  description: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  triggers: string[];
  parameters?: SkillParameter[];
  outputs?: SkillOutput[];
  tools_required: string[];
  agentDetails?: Agent[];
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

interface SkillMetrics {
  skillId: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  lastExecutedAt: string | null;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [pendingPRs, setPendingPRs] = useState<PullRequest[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeView, setActiveView] = useState<"skills" | "performance">("skills");
  const [skillMetrics, setSkillMetrics] = useState<SkillMetrics[]>([]);
  const [topSkills, setTopSkills] = useState<SkillMetrics[]>([]);
  const [poorSkills, setPoorSkills] = useState<SkillMetrics[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const fetchPendingPRs = async () => {
    try {
      const data = await request<{ pullRequests: PullRequest[] }>({
        url: "/api/admin/pending-prs?type=skill",
        method: "GET",
      });
      setPendingPRs(data.pullRequests);
    } catch (err) {
      console.error("Failed to fetch pending PRs:", err);
    }
  };

  const fetchSkills = async () => {
    try {
      const data = await request<{ skills: Skill[] }>({
        url: "/api/admin/skills",
        method: "GET",
      });
      setSkills(data.skills);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to fetch skills";
      setError(message);
    }
  };

  const fetchAgents = async () => {
    try {
      const data = await request<{ agents: Agent[] }>({
        url: "/api/admin/agents",
        method: "GET",
      });
      setAgents(data.agents.map((a) => ({ id: a.id, name: a.name })));
    } catch (err) {
      console.error("Failed to fetch agents:", err);
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

  const fetchPerformanceData = async () => {
    setMetricsLoading(true);
    try {
      const [metricsData, topData, poorData] = await Promise.all([
        request<{ metrics: SkillMetrics[] }>({ url: "/api/optimization/skills/metrics", method: "GET" }).catch(() => ({ metrics: [] })),
        request<{ skills: SkillMetrics[] }>({ url: "/api/optimization/skills/top", method: "GET" }).catch(() => ({ skills: [] })),
        request<{ skills: SkillMetrics[] }>({ url: "/api/optimization/skills/poor", method: "GET" }).catch(() => ({ skills: [] })),
      ]);
      setSkillMetrics(metricsData.metrics);
      setTopSkills(topData.skills);
      setPoorSkills(poorData.skills);
    } catch {
      // Performance data is optional
    } finally {
      setMetricsLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchSkills(), fetchAgents(), fetchTools(), fetchPendingPRs()]);
      setIsLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    if (activeView === "performance") {
      fetchPerformanceData();
    }
  }, [activeView]);

  const handleCreate = () => {
    setEditingSkill(null);
    setIsModalOpen(true);
  };

  const handleEdit = (skill: Skill) => {
    setEditingSkill(skill);
    setIsModalOpen(true);
  };

  const handleDelete = async (skill: Skill) => {
    if (!confirm(`Are you sure you want to delete "${skill.name}"? This will create a PR.`)) {
      return;
    }

    try {
      const result = await request<{ pullRequest: PullRequest }>({
        url: `/api/admin/skills/${skill.id}`,
        method: "DELETE",
      });
      setSuccessMessage(
        `PR created to delete skill. View at: ${result.pullRequest.html_url}`,
      );
      fetchSkills();
      fetchPendingPRs();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to delete skill";
      setError(message);
    }
  };

  const handleSuccess = () => {
    setSuccessMessage("Changes submitted successfully. A GitHub PR has been created for review.");
    fetchSkills();
    fetchPendingPRs();
  };

  // Get unique categories from skills
  const categories = Array.from(new Set(skills.map((s) => s.category)));

  const filteredSkills = skills.filter((skill) => {
    // Filter by search query
    const query = searchQuery.toLowerCase();
    const matchesSearch = !query ||
      skill.name.toLowerCase().includes(query) ||
      skill.id.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query) ||
      skill.triggers.some((t) => t.toLowerCase().includes(query));

    // Filter by category
    const matchesCategory = filterCategory === "all" || skill.category === filterCategory;

    return matchesSearch && matchesCategory;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
          <p className="mt-4 text-gray-600">Loading skills...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Skills</h1>
          <p className="text-gray-600">Manage AI skills and their configurations</p>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
        >
          <span className="text-lg">+</span>
          Create Skill
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

      {/* View Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveView("skills")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeView === "skills"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Skills Management
        </button>
        <button
          onClick={() => setActiveView("performance")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeView === "performance"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Performance Dashboard
        </button>
      </div>

      {activeView === "skills" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-purple-600">{skills.length}</div>
          <div className="text-sm text-gray-500">Total Skills</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">{categories.length}</div>
          <div className="text-sm text-gray-500">Categories</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-blue-600">
            {skills.reduce((acc, s) => acc + s.triggers.length, 0)}
          </div>
          <div className="text-sm text-gray-500">Total Triggers</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-indigo-600">
            {skills.reduce((acc, s) => acc + (s.agentDetails?.length || 0), 0)}
          </div>
          <div className="text-sm text-gray-500">Agent Bindings</div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Search skills by name, ID, or trigger..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">Filter by category:</span>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterCategory("all")}
              className={`px-3 py-1 text-sm rounded-full ${
                filterCategory === "all"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All ({skills.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1 text-sm rounded-full capitalize ${
                  filterCategory === cat
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {cat} ({skills.filter((s) => s.category === cat).length})
              </button>
            ))}
          </div>
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
                  <th className="px-4 py-2 text-left text-xs font-semibold text-yellow-800">Skill</th>
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

      {/* Skills Grid */}
      {filteredSkills.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <div className="text-6xl mb-4">{skills.length === 0 ? "⚡" : "🔍"}</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {skills.length === 0 ? "No skills yet" : "No matching skills"}
          </h2>
          <p className="text-gray-600 mb-4">
            {skills.length === 0
              ? "Create your first skill to get started"
              : "Try adjusting your search or filters"}
          </p>
          {skills.length === 0 ? (
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Create Skill
            </button>
          ) : (
            <button
              onClick={() => { setSearchQuery(""); setFilterCategory("all"); }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

        </>
      )}

      {activeView === "performance" && (
        <div>
          {metricsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-sm text-gray-500">Total Skills Tracked</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{skillMetrics.length}</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-sm text-gray-500">Total Executions</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {skillMetrics.reduce((sum, m) => sum + m.totalExecutions, 0).toLocaleString()}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-sm text-gray-500">Avg Success Rate</div>
                  <div className="text-2xl font-bold text-green-600 mt-1">
                    {skillMetrics.length > 0
                      ? `${Math.round(
                          (skillMetrics.reduce((sum, m) => sum + m.successRate, 0) / skillMetrics.length) * 100
                        )}%`
                      : "N/A"}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-sm text-gray-500">Needs Attention</div>
                  <div className="text-2xl font-bold text-amber-600 mt-1">{poorSkills.length}</div>
                </div>
              </div>

              {/* Top Performing */}
              {topSkills.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Performing Skills</h3>
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Skill</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Executions</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Success Rate</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Avg Latency</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">P95 Latency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {topSkills.map((skill) => (
                          <tr key={skill.skillId} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{skill.skillId}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{skill.totalExecutions}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`font-medium ${skill.successRate >= 0.9 ? "text-green-600" : skill.successRate >= 0.7 ? "text-amber-600" : "text-red-600"}`}>
                                {Math.round(skill.successRate * 100)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{skill.avgDurationMs}ms</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{skill.p95DurationMs}ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Needs Attention */}
              {poorSkills.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Needs Attention</h3>
                  <div className="space-y-3">
                    {poorSkills.map((skill) => (
                      <div
                        key={skill.skillId}
                        className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium text-gray-900">{skill.skillId}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            {skill.successRate < 0.7
                              ? `Low success rate: ${Math.round(skill.successRate * 100)}%`
                              : `High latency: ${skill.avgDurationMs}ms avg`}
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <div className="text-gray-500">{skill.totalExecutions} executions</div>
                          <div className="text-gray-500">{skill.failureCount} failures</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All Skills Metrics */}
              {skillMetrics.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">All Skills</h3>
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Skill</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Total</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Success</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Failed</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Rate</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Avg (ms)</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">P95 (ms)</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Last Run</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {skillMetrics.map((m) => (
                          <tr key={m.skillId} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.skillId}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{m.totalExecutions}</td>
                            <td className="px-4 py-3 text-sm text-right text-green-600">{m.successCount}</td>
                            <td className="px-4 py-3 text-sm text-right text-red-600">{m.failureCount}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`font-medium ${m.successRate >= 0.9 ? "text-green-600" : m.successRate >= 0.7 ? "text-amber-600" : "text-red-600"}`}>
                                {Math.round(m.successRate * 100)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{m.avgDurationMs}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{m.p95DurationMs}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-500">
                              {m.lastExecutedAt ? new Date(m.lastExecutedAt).toLocaleDateString() : "Never"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {skillMetrics.length === 0 && !metricsLoading && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">📊</div>
                  <h3 className="text-lg font-medium text-gray-900">No performance data yet</h3>
                  <p className="text-gray-500 mt-1">Skill metrics will appear here once skills are executed</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <SkillFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
        skill={editingSkill}
        availableAgents={agents}
        availableTools={tools}
      />
    </div>
  );
}
