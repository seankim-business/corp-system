import { useEffect, useState } from "react";
import { ApiError, request } from "../api/client";
import { useAuthStore } from "../stores/authStore";

interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  ownerId: string | null;
  progress: number;
}

interface Objective {
  id: string;
  title: string;
  description: string | null;
  quarter: string;
  ownerId: string;
  status: "on_track" | "at_risk" | "behind";
  keyResults: KeyResult[];
  progress: number;
}

interface ObjectiveFormData {
  title: string;
  description: string;
  quarter: string;
  ownerId: string;
  status: string;
}

interface KeyResultFormData {
  title: string;
  target: string;
  current: string;
  unit: string;
  ownerId: string;
}

interface ObjectiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  objective?: Objective | null;
  defaultQuarter: string;
  currentUserId: string;
}

function ObjectiveModal({
  isOpen,
  onClose,
  onSuccess,
  objective,
  defaultQuarter,
  currentUserId,
}: ObjectiveModalProps) {
  const [formData, setFormData] = useState<ObjectiveFormData>({
    title: "",
    description: "",
    quarter: defaultQuarter,
    ownerId: currentUserId,
    status: "on_track",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (objective) {
      setFormData({
        title: objective.title,
        description: objective.description || "",
        quarter: objective.quarter,
        ownerId: objective.ownerId,
        status: objective.status,
      });
    } else {
      setFormData({
        title: "",
        description: "",
        quarter: defaultQuarter,
        ownerId: currentUserId,
        status: "on_track",
      });
    }
  }, [objective, defaultQuarter, currentUserId]);

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      setError("Title is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (objective) {
        await request({
          url: `/api/okr/${objective.id}`,
          method: "PUT",
          data: formData,
        });
      } else {
        await request({
          url: "/api/okr",
          method: "POST",
          data: formData,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save objective";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {objective ? "Edit Objective" : "New Objective"}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Increase customer satisfaction"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quarter</label>
                <input
                  type="text"
                  value={formData.quarter}
                  onChange={(e) => setFormData({ ...formData, quarter: e.target.value })}
                  placeholder="2026-Q1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="behind">Behind</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : objective ? "Save Changes" : "Create Objective"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface KeyResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  objectiveId: string;
  keyResult?: KeyResult | null;
}

function KeyResultModal({
  isOpen,
  onClose,
  onSuccess,
  objectiveId,
  keyResult,
}: KeyResultModalProps) {
  const [formData, setFormData] = useState<KeyResultFormData>({
    title: "",
    target: "100",
    current: "0",
    unit: "%",
    ownerId: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (keyResult) {
      setFormData({
        title: keyResult.title,
        target: String(keyResult.target),
        current: String(keyResult.current),
        unit: keyResult.unit,
        ownerId: keyResult.ownerId || "",
      });
    } else {
      setFormData({
        title: "",
        target: "100",
        current: "0",
        unit: "%",
        ownerId: "",
      });
    }
  }, [keyResult]);

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      setError("Title is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        title: formData.title,
        target: Number(formData.target),
        current: Number(formData.current),
        unit: formData.unit,
        ownerId: formData.ownerId || null,
      };

      if (keyResult) {
        await request({
          url: `/api/okr/key-results/${keyResult.id}`,
          method: "PUT",
          data: payload,
        });
      } else {
        await request({
          url: `/api/okr/${objectiveId}/key-results`,
          method: "POST",
          data: payload,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save key result";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {keyResult ? "Edit Key Result" : "New Key Result"}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Achieve NPS score of 50+"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
                <input
                  type="number"
                  value={formData.target}
                  onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current</label>
                <input
                  type="number"
                  value={formData.current}
                  onChange={(e) => setFormData({ ...formData, current: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="%">%</option>
                  <option value="count">Count</option>
                  <option value="$">$</option>
                  <option value="score">Score</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : keyResult ? "Save Changes" : "Add Key Result"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ progress, status }: { progress: number; status: string }) {
  const getColorClass = () => {
    if (status === "behind") return "bg-red-500";
    if (status === "at_risk") return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5">
      <div
        className={`h-2.5 rounded-full ${getColorClass()}`}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    on_track: "bg-green-100 text-green-800",
    at_risk: "bg-yellow-100 text-yellow-800",
    behind: "bg-red-100 text-red-800",
  };

  const labels: Record<string, string> = {
    on_track: "On Track",
    at_risk: "At Risk",
    behind: "Behind",
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.on_track}`}
    >
      {labels[status] || status}
    </span>
  );
}

interface ObjectiveCardProps {
  objective: Objective;
  onEdit: (objective: Objective) => void;
  onDelete: (objectiveId: string) => void;
  onAddKeyResult: (objectiveId: string) => void;
  onEditKeyResult: (keyResult: KeyResult) => void;
  onUpdateKeyResultProgress: (keyResultId: string, current: number) => void;
}

function ObjectiveCard({
  objective,
  onEdit,
  onDelete,
  onAddKeyResult,
  onEditKeyResult,
  onUpdateKeyResultProgress,
}: ObjectiveCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-gray-900">{objective.title}</h3>
              <StatusBadge status={objective.status} />
            </div>
            {objective.description && (
              <p className="text-gray-600 text-sm mb-3">{objective.description}</p>
            )}
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-xs">
                <ProgressBar progress={objective.progress} status={objective.status} />
              </div>
              <span className="text-sm font-medium text-gray-700">{objective.progress}%</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(objective)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="Edit"
            >
              <span className="text-lg">&#9998;</span>
            </button>
            <button
              onClick={() => onDelete(objective.id)}
              className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
              title="Delete"
            >
              <span className="text-lg">&#128465;</span>
            </button>
          </div>
        </div>

        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm font-medium text-gray-700 flex items-center gap-1"
            >
              <span>{isExpanded ? "▼" : "▶"}</span>
              Key Results ({objective.keyResults.length})
            </button>
            <button
              onClick={() => onAddKeyResult(objective.id)}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              + Add Key Result
            </button>
          </div>

          {isExpanded && (
            <div className="space-y-3">
              {objective.keyResults.length === 0 ? (
                <p className="text-gray-500 text-sm italic">No key results yet</p>
              ) : (
                objective.keyResults.map((kr) => (
                  <div
                    key={kr.id}
                    className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-medium text-gray-800">{kr.title}</span>
                      <button
                        onClick={() => onEditKeyResult(kr)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <span className="text-sm">&#9998;</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-indigo-500 h-2 rounded-full"
                            style={{ width: `${Math.min(kr.progress, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <input
                          type="number"
                          value={kr.current}
                          onChange={(e) => onUpdateKeyResultProgress(kr.id, Number(e.target.value))}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                        />
                        <span className="text-gray-500">
                          / {kr.target} {kr.unit}
                        </span>
                        <span className="font-medium text-gray-700">({kr.progress}%)</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OKRPage() {
  const { user } = useAuthStore();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [quarters, setQuarters] = useState<string[]>([]);
  const [selectedQuarter, setSelectedQuarter] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isObjectiveModalOpen, setIsObjectiveModalOpen] = useState(false);
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);

  const [isKeyResultModalOpen, setIsKeyResultModalOpen] = useState(false);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string>("");
  const [editingKeyResult, setEditingKeyResult] = useState<KeyResult | null>(null);

  const currentQuarter = () => {
    const now = new Date();
    return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  };

  const fetchQuarters = async () => {
    try {
      const data = await request<{ quarters: string[] }>({
        url: "/api/okr/meta/quarters",
        method: "GET",
      });
      setQuarters(data.quarters);
      if (data.quarters.length > 0 && !selectedQuarter) {
        setSelectedQuarter(data.quarters[0]);
      }
    } catch (err) {
      console.error("Failed to fetch quarters:", err);
    }
  };

  const fetchObjectives = async () => {
    if (!selectedQuarter) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await request<{ objectives: Objective[] }>({
        url: "/api/okr",
        method: "GET",
        params: { quarter: selectedQuarter },
      });
      setObjectives(data.objectives);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to fetch objectives";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuarters();
  }, []);

  useEffect(() => {
    if (selectedQuarter) {
      fetchObjectives();
    }
  }, [selectedQuarter]);

  const handleDeleteObjective = async (objectiveId: string) => {
    if (!confirm("Are you sure you want to delete this objective and all its key results?")) {
      return;
    }

    try {
      await request({
        url: `/api/okr/${objectiveId}`,
        method: "DELETE",
      });
      fetchObjectives();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to delete objective";
      setError(message);
    }
  };

  const handleUpdateKeyResultProgress = async (keyResultId: string, current: number) => {
    try {
      await request({
        url: `/api/okr/key-results/${keyResultId}`,
        method: "PUT",
        data: { current },
      });
      fetchObjectives();
    } catch (err) {
      console.error("Failed to update key result:", err);
    }
  };

  const openAddObjective = () => {
    setEditingObjective(null);
    setIsObjectiveModalOpen(true);
  };

  const openEditObjective = (objective: Objective) => {
    setEditingObjective(objective);
    setIsObjectiveModalOpen(true);
  };

  const openAddKeyResult = (objectiveId: string) => {
    setSelectedObjectiveId(objectiveId);
    setEditingKeyResult(null);
    setIsKeyResultModalOpen(true);
  };

  const openEditKeyResult = (keyResult: KeyResult) => {
    setSelectedObjectiveId(keyResult.objectiveId);
    setEditingKeyResult(keyResult);
    setIsKeyResultModalOpen(true);
  };

  const overallProgress =
    objectives.length > 0
      ? Math.round(objectives.reduce((sum, o) => sum + o.progress, 0) / objectives.length)
      : 0;

  if (isLoading && objectives.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600" />
          <p className="mt-4 text-gray-600">Loading OKRs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">OKRs</h1>
          <p className="text-gray-600">Track objectives and key results</p>
        </div>
        <button
          onClick={openAddObjective}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        >
          <span className="text-lg">+</span>
          New Objective
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Quarter:</label>
          <select
            value={selectedQuarter}
            onChange={(e) => setSelectedQuarter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            {quarters.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">
            {objectives.length} objective{objectives.length !== 1 ? "s" : ""}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Overall:</span>
            <div className="w-32 bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-indigo-600 h-2.5 rounded-full"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <span className="text-sm font-bold text-gray-900">{overallProgress}%</span>
          </div>
        </div>
      </div>

      {objectives.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">&#127919;</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No objectives yet</h2>
            <p className="text-gray-600 mb-6">
              Create your first objective to start tracking your team's goals.
            </p>
            <button
              onClick={openAddObjective}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Create First Objective
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {objectives.map((objective) => (
            <ObjectiveCard
              key={objective.id}
              objective={objective}
              onEdit={openEditObjective}
              onDelete={handleDeleteObjective}
              onAddKeyResult={openAddKeyResult}
              onEditKeyResult={openEditKeyResult}
              onUpdateKeyResultProgress={handleUpdateKeyResultProgress}
            />
          ))}
        </div>
      )}

      <ObjectiveModal
        isOpen={isObjectiveModalOpen}
        onClose={() => setIsObjectiveModalOpen(false)}
        onSuccess={() => {
          fetchObjectives();
          fetchQuarters();
        }}
        objective={editingObjective}
        defaultQuarter={selectedQuarter || currentQuarter()}
        currentUserId={user?.id || ""}
      />

      <KeyResultModal
        isOpen={isKeyResultModalOpen}
        onClose={() => setIsKeyResultModalOpen(false)}
        onSuccess={fetchObjectives}
        objectiveId={selectedObjectiveId}
        keyResult={editingKeyResult}
      />
    </div>
  );
}
