/**
 * AgentOptimizationPage
 *
 * 기획:
 * - 에이전트 성능 최적화 대시보드
 * - A/B 테스트 실험 관리
 * - 프롬프트 성능 비교
 * - 라우팅 분석 히트맵
 * - 모델 사용량 및 비용 분석
 * - 최적화 추천 사항
 */

import { useState, useEffect } from "react";
import { request } from "../api/client";
import { useAuthStore } from "../stores/authStore";

// Types
interface Experiment {
  id: string;
  name: string;
  agentId: string;
  status: "draft" | "running" | "completed" | "cancelled";
  type: "prompt" | "model" | "routing";
  trafficSplit: number;
  primaryMetric: string;
  startedAt?: string;
  endedAt?: string;
  results?: ExperimentResults;
}

interface ExperimentResults {
  controlVariant: VariantResults;
  treatmentVariant: VariantResults;
  winner: string | null;
  confidence: number;
  improvement: number;
  isSignificant: boolean;
}

interface VariantResults {
  variantId: string;
  name: string;
  sampleSize: number;
  successRate: number;
  avgLatencyMs: number;
  avgCostCents: number;
  avgRating: number;
}

interface CostAnalysis {
  totalCostCents: number;
  totalRequests: number;
  avgCostPerRequest: number;
  byAgent: {
    agentId: string;
    costCents: number;
    requests: number;
    percentOfTotal: number;
  }[];
  byModel: {
    model: string;
    costCents: number;
    requests: number;
    percentOfTotal: number;
  }[];
  recommendations: CostReduction[];
}

interface CostReduction {
  strategy: string;
  description: string;
  estimatedSavingsPercent: number;
  implementationEffort: "low" | "medium" | "high";
  qualityImpact: "none" | "minor" | "moderate";
}

interface RoutingAnalysis {
  agentId: string;
  totalMatches: number;
  correctMatches: number;
  correctRate: number;
  problematicKeywords: string[];
  suggestedRemovals: string[];
}

interface Model {
  name: string;
  provider: string;
  capabilities: string[];
  inputCostPer1K: number;
  outputCostPer1K: number;
  benchmarkAccuracy: number;
}

export default function AgentOptimizationPage() {
  const { currentOrganization } = useAuthStore();
  const [activeTab, setActiveTab] = useState<
    "experiments" | "prompts" | "routing" | "models" | "costs"
  >("experiments");

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [costAnalysis, setCostAnalysis] = useState<CostAnalysis | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  useEffect(() => {
    loadData();
  }, [currentOrganization]);

  async function loadData() {
    setLoading(true);
    try {
      const [experimentsRes, costsRes, modelsRes] = await Promise.all([
        request<{ experiments: Experiment[] }>({ url: "/api/optimization/experiments" }),
        request<{ analysis: CostAnalysis }>({ url: "/api/optimization/costs", params: { days: 30 } }),
        request<{ models: Model[] }>({ url: "/api/optimization/models" }),
      ]);

      setExperiments(experimentsRes.experiments || []);
      setCostAnalysis(costsRes.analysis || null);
      setModels(modelsRes.models || []);
    } catch (error) {
      console.error("Failed to load optimization data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartExperiment(id: string) {
    try {
      await request({ method: "POST", url: `/api/optimization/experiments/${id}/start` });
      await loadData();
    } catch (error) {
      console.error("Failed to start experiment:", error);
    }
  }

  async function handleStopExperiment(id: string) {
    try {
      await request({ method: "POST", url: `/api/optimization/experiments/${id}/stop` });
      await loadData();
    } catch (error) {
      console.error("Failed to stop experiment:", error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Agent Performance Optimization</h1>

      {/* Tab Navigation */}
      <div className="flex border-b mb-6">
        {(["experiments", "prompts", "routing", "models", "costs"] as const).map(
          (tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 capitalize ${
                activeTab === tab
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          )
        )}
      </div>

      {/* Tab Content */}
      {activeTab === "experiments" && (
        <ExperimentsTab
          experiments={experiments}
          onStart={handleStartExperiment}
          onStop={handleStopExperiment}
        />
      )}

      {activeTab === "prompts" && (
        <PromptsTab selectedAgent={selectedAgent} onAgentChange={setSelectedAgent} />
      )}

      {activeTab === "routing" && (
        <RoutingTab selectedAgent={selectedAgent} onAgentChange={setSelectedAgent} />
      )}

      {activeTab === "models" && <ModelsTab models={models} />}

      {activeTab === "costs" && costAnalysis && (
        <CostsTab analysis={costAnalysis} />
      )}
    </div>
  );
}

// ============================================================================
// EXPERIMENTS TAB
// ============================================================================

function ExperimentsTab({
  experiments,
  onStart,
  onStop,
}: {
  experiments: Experiment[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}) {
  const activeExperiments = experiments.filter((e) => e.status === "running");
  const completedExperiments = experiments.filter((e) => e.status === "completed");

  return (
    <div className="space-y-6">
      {/* Active Experiments */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Active Experiments</h2>
        {activeExperiments.length === 0 ? (
          <p className="text-gray-500">No active experiments</p>
        ) : (
          <div className="space-y-4">
            {activeExperiments.map((exp) => (
              <ExperimentCard
                key={exp.id}
                experiment={exp}
                onStart={onStart}
                onStop={onStop}
              />
            ))}
          </div>
        )}
      </div>

      {/* Completed Experiments */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Completed Experiments</h2>
        {completedExperiments.length === 0 ? (
          <p className="text-gray-500">No completed experiments</p>
        ) : (
          <div className="space-y-4">
            {completedExperiments.map((exp) => (
              <ExperimentResultCard key={exp.id} experiment={exp} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExperimentCard({
  experiment,
  onStart,
  onStop,
}: {
  experiment: Experiment;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}) {
  const statusColors = {
    draft: "bg-gray-100 text-gray-800",
    running: "bg-green-100 text-green-800",
    completed: "bg-blue-100 text-blue-800",
    cancelled: "bg-red-100 text-red-800",
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-medium">{experiment.name}</h3>
          <p className="text-sm text-gray-500">
            Agent: {experiment.agentId} | Type: {experiment.type}
          </p>
          <p className="text-sm text-gray-500">
            Traffic Split: {(experiment.trafficSplit * 100).toFixed(0)}% treatment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded text-xs ${statusColors[experiment.status]}`}
          >
            {experiment.status}
          </span>
          {experiment.status === "draft" && (
            <button
              onClick={() => onStart(experiment.id)}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            >
              Start
            </button>
          )}
          {experiment.status === "running" && (
            <button
              onClick={() => onStop(experiment.id)}
              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            >
              Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ExperimentResultCard({ experiment }: { experiment: Experiment }) {
  const results = experiment.results;
  if (!results) return null;

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-medium">{experiment.name}</h3>
          <p className="text-sm text-gray-500">Agent: {experiment.agentId}</p>
        </div>
        {results.isSignificant && (
          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
            Significant Result
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded p-3">
          <p className="text-sm font-medium">Control</p>
          <p className="text-lg">{(results.controlVariant.successRate * 100).toFixed(1)}%</p>
          <p className="text-xs text-gray-500">
            n={results.controlVariant.sampleSize}
          </p>
        </div>
        <div className="bg-blue-50 rounded p-3">
          <p className="text-sm font-medium">Treatment</p>
          <p className="text-lg">
            {(results.treatmentVariant.successRate * 100).toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500">
            n={results.treatmentVariant.sampleSize}
          </p>
        </div>
      </div>

      <div className="mt-4 text-sm">
        <p>
          Improvement: <strong>{results.improvement.toFixed(1)}%</strong>
        </p>
        <p>
          Confidence: <strong>{(results.confidence * 100).toFixed(1)}%</strong>
        </p>
        {results.winner && (
          <p className="text-green-600 mt-2">
            Winner: {results.winner === results.treatmentVariant.variantId ? "Treatment" : "Control"}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PROMPTS TAB
// ============================================================================

function PromptsTab({
  selectedAgent,
  onAgentChange,
}: {
  selectedAgent: string;
  onAgentChange: (agent: string) => void;
}) {
  const [variants, setVariants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadPrompts(agentId: string) {
    if (!agentId) return;
    setLoading(true);
    try {
      const res = await request<{ variants: any[] }>({ url: `/api/optimization/agents/${agentId}/prompts` });
      setVariants(res.variants || []);
    } catch (error) {
      console.error("Failed to load prompts:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedAgent) {
      loadPrompts(selectedAgent);
    }
  }, [selectedAgent]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Prompt Performance</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Select Agent</label>
        <input
          type="text"
          value={selectedAgent}
          onChange={(e) => onAgentChange(e.target.value)}
          placeholder="Enter agent ID..."
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : variants.length === 0 ? (
        <p className="text-gray-500">No prompt variants found</p>
      ) : (
        <div className="space-y-4">
          {variants.map((variant: any) => (
            <div
              key={variant.id}
              className={`border rounded-lg p-4 ${variant.isActive ? "border-green-500 bg-green-50" : ""}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">
                    Version {variant.version}
                    {variant.isActive && (
                      <span className="ml-2 text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Success Rate: {(variant.successRate * 100).toFixed(1)}% |
                    Avg Latency: {variant.avgLatencyMs}ms |
                    Sample: {variant.sampleSize}
                  </p>
                </div>
              </div>
              <div className="mt-2 bg-gray-50 p-2 rounded text-sm font-mono max-h-32 overflow-auto">
                {variant.systemPrompt?.substring(0, 200)}...
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ROUTING TAB
// ============================================================================

function RoutingTab({
  selectedAgent,
  onAgentChange,
}: {
  selectedAgent: string;
  onAgentChange: (agent: string) => void;
}) {
  const [analysis, setAnalysis] = useState<RoutingAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function loadRouting(agentId: string) {
    if (!agentId) return;
    setLoading(true);
    try {
      const [analysisRes, suggestionsRes] = await Promise.all([
        request<{ analysis: RoutingAnalysis }>({ url: `/api/optimization/agents/${agentId}/routing/analysis` }),
        request<{ additions: any[]; removals: string[] }>({
          method: "POST",
          url: `/api/optimization/agents/${agentId}/routing/suggestions`,
        }),
      ]);
      setAnalysis(analysisRes.analysis || null);
      setSuggestions(suggestionsRes || null);
    } catch (error) {
      console.error("Failed to load routing:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedAgent) {
      loadRouting(selectedAgent);
    }
  }, [selectedAgent]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Routing Analysis</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Select Agent</label>
        <input
          type="text"
          value={selectedAgent}
          onChange={(e) => onAgentChange(e.target.value)}
          placeholder="Enter agent ID..."
          className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : !analysis ? (
        <p className="text-gray-500">Enter an agent ID to see routing analysis</p>
      ) : (
        <div className="space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded p-4 text-center">
              <p className="text-2xl font-bold">{analysis.totalMatches}</p>
              <p className="text-sm text-gray-500">Total Matches</p>
            </div>
            <div className="bg-green-50 rounded p-4 text-center">
              <p className="text-2xl font-bold text-green-600">
                {(analysis.correctRate * 100).toFixed(1)}%
              </p>
              <p className="text-sm text-gray-500">Correct Rate</p>
            </div>
            <div className="bg-red-50 rounded p-4 text-center">
              <p className="text-2xl font-bold text-red-600">
                {analysis.totalMatches - analysis.correctMatches}
              </p>
              <p className="text-sm text-gray-500">Misroutes</p>
            </div>
          </div>

          {/* Problematic Keywords */}
          {analysis.problematicKeywords.length > 0 && (
            <div>
              <h3 className="font-medium mb-2">Problematic Keywords</h3>
              <div className="flex flex-wrap gap-2">
                {analysis.problematicKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {suggestions && (
            <>
              {suggestions.additions?.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">Suggested Additions</h3>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.additions.slice(0, 10).map((s: any) => (
                      <span
                        key={s.keyword}
                        className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm"
                        title={s.reason}
                      >
                        + {s.keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {suggestions.removals?.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">Suggested Removals</h3>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.removals.map((kw: string) => (
                      <span
                        key={kw}
                        className="px-2 py-1 bg-red-100 text-red-800 rounded text-sm"
                      >
                        - {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MODELS TAB
// ============================================================================

function ModelsTab({ models }: { models: Model[] }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Available Models</h2>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Model
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Provider
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Capabilities
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Cost ($/1K tokens)
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Accuracy
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {models.map((model) => (
              <tr key={model.name}>
                <td className="px-4 py-3 whitespace-nowrap font-medium">
                  {model.name}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                  {model.provider}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {model.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-xs"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                  ${Number(model.inputCostPer1K).toFixed(4)} / ${Number(model.outputCostPer1K).toFixed(4)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {model.benchmarkAccuracy
                    ? `${(model.benchmarkAccuracy * 100).toFixed(0)}%`
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// COSTS TAB
// ============================================================================

function CostsTab({ analysis }: { analysis: CostAnalysis }) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Cost Summary (30 days)</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded p-4 text-center">
            <p className="text-2xl font-bold">
              ${(analysis.totalCostCents / 100).toFixed(2)}
            </p>
            <p className="text-sm text-gray-500">Total Cost</p>
          </div>
          <div className="bg-gray-50 rounded p-4 text-center">
            <p className="text-2xl font-bold">{analysis.totalRequests.toLocaleString()}</p>
            <p className="text-sm text-gray-500">Total Requests</p>
          </div>
          <div className="bg-gray-50 rounded p-4 text-center">
            <p className="text-2xl font-bold">
              ${(analysis.avgCostPerRequest / 100).toFixed(4)}
            </p>
            <p className="text-sm text-gray-500">Avg Cost/Request</p>
          </div>
        </div>
      </div>

      {/* Cost by Agent */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Cost by Agent</h2>
        <div className="space-y-2">
          {analysis.byAgent.slice(0, 10).map((agent) => (
            <div key={agent.agentId} className="flex items-center">
              <div className="w-32 truncate text-sm">{agent.agentId}</div>
              <div className="flex-1 mx-4">
                <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full"
                    style={{ width: `${agent.percentOfTotal}%` }}
                  />
                </div>
              </div>
              <div className="w-24 text-right text-sm">
                ${(agent.costCents / 100).toFixed(2)}
              </div>
              <div className="w-16 text-right text-sm text-gray-500">
                {agent.percentOfTotal.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cost by Model */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Cost by Model</h2>
        <div className="space-y-2">
          {analysis.byModel.map((model) => (
            <div key={model.model} className="flex items-center">
              <div className="w-48 truncate text-sm">{model.model}</div>
              <div className="flex-1 mx-4">
                <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-green-600 h-full"
                    style={{ width: `${model.percentOfTotal}%` }}
                  />
                </div>
              </div>
              <div className="w-24 text-right text-sm">
                ${(model.costCents / 100).toFixed(2)}
              </div>
              <div className="w-16 text-right text-sm text-gray-500">
                {model.percentOfTotal.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Optimization Recommendations</h2>
        {analysis.recommendations.length === 0 ? (
          <p className="text-gray-500">No recommendations at this time</p>
        ) : (
          <div className="space-y-4">
            {analysis.recommendations.map((rec, i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium capitalize">
                      {rec.strategy.replace(/_/g, " ")}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">
                      ~{rec.estimatedSavingsPercent}% savings
                    </p>
                    <div className="flex gap-2 mt-1 justify-end">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          rec.implementationEffort === "low"
                            ? "bg-green-100 text-green-800"
                            : rec.implementationEffort === "medium"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {rec.implementationEffort} effort
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          rec.qualityImpact === "none"
                            ? "bg-green-100 text-green-800"
                            : rec.qualityImpact === "minor"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {rec.qualityImpact} quality impact
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
