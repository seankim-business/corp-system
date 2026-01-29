/**
 * OrgChangeWizardPage
 *
 * 5-step wizard for organization changes (US-010):
 * - Step 1: Change type selection
 * - Step 2: Basic info (name, function, description)
 * - Step 3: Skills & Tools (AI-suggested + manual)
 * - Step 4: Permissions (read/write paths)
 * - Step 5: Review & Submit (creates PR)
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { request, ApiError } from "../api/client";

// Types
type ChangeType = "new_agent" | "new_team" | "process_modification" | "role_change";
type RiskLevel = "low" | "medium" | "high";

interface ChangeAnalysis {
  suggestedSkills: string[];
  suggestedTools: string[];
  impactedAgents: string[];
  impactedSOPs: string[];
  riskLevel: RiskLevel;
  recommendations: string[];
  filesCreated: string[];
  filesModified: string[];
}

interface WizardState {
  step: number;
  changeType: ChangeType | null;
  teamFunction: string;
  entityName: string;
  description: string;
  selectedSkills: string[];
  selectedTools: string[];
  customSkills: string[];
  customTools: string[];
  permissions: {
    read: string[];
    write: string[];
    deny: string[];
  };
  analysis: ChangeAnalysis | null;
}

interface WizardResponse {
  success: boolean;
  changeId: string;
  prUrl: string;
  message: string;
}

const TEAM_FUNCTIONS = [
  "Data & Analytics",
  "Engineering",
  "Marketing",
  "Operations",
  "Finance",
  "HR",
  "Sales",
  "Customer Success",
  "Product",
  "Design",
];

const CHANGE_TYPE_INFO: Record<
  ChangeType,
  { emoji: string; title: string; titleEn: string; description: string }
> = {
  new_agent: {
    emoji: "🤖",
    title: "새 에이전트 추가",
    titleEn: "Add New Agent",
    description: "새로운 AI 에이전트를 조직에 추가합니다",
  },
  new_team: {
    emoji: "👥",
    title: "새 팀 생성",
    titleEn: "Create New Team",
    description: "새로운 팀 또는 Function을 생성합니다",
  },
  process_modification: {
    emoji: "📋",
    title: "프로세스 수정",
    titleEn: "Modify Process",
    description: "기존 SOP나 프로세스를 수정합니다",
  },
  role_change: {
    emoji: "🔄",
    title: "역할 변경",
    titleEn: "Change Role",
    description: "에이전트나 팀의 역할을 변경합니다",
  },
};

const initialState: WizardState = {
  step: 1,
  changeType: null,
  teamFunction: "",
  entityName: "",
  description: "",
  selectedSkills: [],
  selectedTools: [],
  customSkills: [],
  customTools: [],
  permissions: {
    read: [],
    write: [],
    deny: [],
  },
  analysis: null,
};

export default function OrgChangeWizardPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<WizardState>(initialState);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ prUrl: string; changeId: string } | null>(null);

  // Custom input states
  const [newSkill, setNewSkill] = useState("");
  const [newTool, setNewTool] = useState("");
  const [newReadPath, setNewReadPath] = useState("");
  const [newWritePath, setNewWritePath] = useState("");
  const [newDenyPath, setNewDenyPath] = useState("");

  // Fetch analysis when moving to step 3
  const fetchAnalysis = useCallback(async () => {
    if (!state.changeType || !state.teamFunction || !state.entityName || !state.description) {
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const analysis = await request<ChangeAnalysis>({
        url: "/api/org-changes/analyze",
        method: "POST",
        data: {
          changeType: state.changeType,
          teamFunction: state.teamFunction,
          entityName: state.entityName,
          description: state.description,
        },
      });

      setState((prev) => ({
        ...prev,
        analysis,
        // Pre-select all suggested skills and tools
        selectedSkills: analysis.suggestedSkills,
        selectedTools: analysis.suggestedTools,
      }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "분석 중 오류가 발생했습니다";
      setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [state.changeType, state.teamFunction, state.entityName, state.description]);

  // Fetch analysis when entering step 3
  useEffect(() => {
    if (state.step === 3 && !state.analysis) {
      fetchAnalysis();
    }
  }, [state.step, state.analysis, fetchAnalysis]);

  const handleChangeType = (type: ChangeType) => {
    setState((prev) => ({ ...prev, changeType: type }));
  };

  const handleNext = () => {
    setError(null);

    // Validation
    if (state.step === 1 && !state.changeType) {
      setError("변경 유형을 선택해주세요");
      return;
    }

    if (state.step === 2) {
      if (!state.teamFunction) {
        setError("팀/Function을 선택해주세요");
        return;
      }
      if (!state.entityName.trim()) {
        setError("이름을 입력해주세요");
        return;
      }
      if (!state.description.trim()) {
        setError("설명을 입력해주세요");
        return;
      }
    }

    setState((prev) => ({ ...prev, step: prev.step + 1 }));
  };

  const handleBack = () => {
    setError(null);
    setState((prev) => ({ ...prev, step: prev.step - 1 }));
  };

  const handleSubmit = async () => {
    if (!state.analysis) {
      setError("분석 데이터가 없습니다. 이전 단계로 돌아가주세요.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await request<WizardResponse>({
        url: "/api/org-changes/wizard",
        method: "POST",
        data: {
          changeType: state.changeType,
          teamFunction: state.teamFunction,
          entityName: state.entityName,
          description: state.description,
          selectedSkills: [...state.selectedSkills, ...state.customSkills],
          selectedTools: [...state.selectedTools, ...state.customTools],
          permissions: state.permissions,
          analysis: state.analysis,
        },
      });

      setSuccess({
        prUrl: response.prUrl,
        changeId: response.changeId,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "변경 생성 중 오류가 발생했습니다";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSkill = (skill: string) => {
    setState((prev) => ({
      ...prev,
      selectedSkills: prev.selectedSkills.includes(skill)
        ? prev.selectedSkills.filter((s) => s !== skill)
        : [...prev.selectedSkills, skill],
    }));
  };

  const toggleTool = (tool: string) => {
    setState((prev) => ({
      ...prev,
      selectedTools: prev.selectedTools.includes(tool)
        ? prev.selectedTools.filter((t) => t !== tool)
        : [...prev.selectedTools, tool],
    }));
  };

  const addCustomSkill = () => {
    if (newSkill.trim() && !state.customSkills.includes(newSkill.trim())) {
      setState((prev) => ({
        ...prev,
        customSkills: [...prev.customSkills, newSkill.trim()],
      }));
      setNewSkill("");
    }
  };

  const addCustomTool = () => {
    if (newTool.trim() && !state.customTools.includes(newTool.trim())) {
      setState((prev) => ({
        ...prev,
        customTools: [...prev.customTools, newTool.trim()],
      }));
      setNewTool("");
    }
  };

  const addPath = (type: "read" | "write" | "deny", path: string, setPath: (p: string) => void) => {
    if (path.trim() && !state.permissions[type].includes(path.trim())) {
      setState((prev) => ({
        ...prev,
        permissions: {
          ...prev.permissions,
          [type]: [...prev.permissions[type], path.trim()],
        },
      }));
      setPath("");
    }
  };

  const removePath = (type: "read" | "write" | "deny", path: string) => {
    setState((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [type]: prev.permissions[type].filter((p) => p !== path),
      },
    }));
  };

  const getRiskBadgeColor = (risk: RiskLevel) => {
    switch (risk) {
      case "low":
        return "bg-green-100 text-green-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "high":
        return "bg-red-100 text-red-800";
    }
  };

  const getRiskLabel = (risk: RiskLevel) => {
    switch (risk) {
      case "low":
        return "낮음";
      case "medium":
        return "중간";
      case "high":
        return "높음";
    }
  };

  // Success state
  if (success) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">변경 요청이 생성되었습니다!</h1>
          <p className="text-gray-600 mb-6">PR이 생성되어 리뷰를 기다리고 있습니다.</p>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-500 mb-1">Pull Request</p>
            <a
              href={success.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {success.prUrl}
            </a>
          </div>

          <div className="flex gap-4 justify-center">
            <button
              onClick={() => navigate("/org-changes")}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              변경 목록 보기
            </button>
            <button
              onClick={() => {
                setState(initialState);
                setSuccess(null);
              }}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              새 변경 생성
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">조직 변경 마법사</h1>
        <p className="text-gray-600">
          새 팀, 에이전트, 또는 프로세스 변경을 단계별로 설정합니다
        </p>
      </div>

      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4, 5].map((step) => (
            <div key={step} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                  step === state.step
                    ? "bg-indigo-600 text-white"
                    : step < state.step
                      ? "bg-indigo-100 text-indigo-600"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {step < state.step ? "✓" : step}
              </div>
              {step < 5 && (
                <div
                  className={`w-16 h-1 mx-2 ${
                    step < state.step ? "bg-indigo-600" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-sm">
          <span className={state.step >= 1 ? "text-indigo-600" : "text-gray-500"}>유형 선택</span>
          <span className={state.step >= 2 ? "text-indigo-600" : "text-gray-500"}>기본 정보</span>
          <span className={state.step >= 3 ? "text-indigo-600" : "text-gray-500"}>스킬 & 도구</span>
          <span className={state.step >= 4 ? "text-indigo-600" : "text-gray-500"}>권한 설정</span>
          <span className={state.step >= 5 ? "text-indigo-600" : "text-gray-500"}>검토 & 제출</span>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        {/* Step 1: Change Type Selection */}
        {state.step === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">변경 유형 선택</h2>
            <p className="text-gray-600 mb-6">어떤 유형의 변경을 원하시나요?</p>

            <div className="grid grid-cols-2 gap-4">
              {(Object.keys(CHANGE_TYPE_INFO) as ChangeType[]).map((type) => {
                const info = CHANGE_TYPE_INFO[type];
                const isSelected = state.changeType === type;

                return (
                  <button
                    key={type}
                    onClick={() => handleChangeType(type)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50"
                        : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-3xl mb-2">{info.emoji}</div>
                    <div className="font-semibold text-gray-900">{info.title}</div>
                    <div className="text-xs text-gray-500 mb-1">{info.titleEn}</div>
                    <div className="text-sm text-gray-600">{info.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Basic Info */}
        {state.step === 2 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {state.changeType && CHANGE_TYPE_INFO[state.changeType].emoji}{" "}
              {state.changeType && CHANGE_TYPE_INFO[state.changeType].title} (Step 2/5)
            </h2>
            <p className="text-gray-600 mb-6">기본 정보를 입력해주세요</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  팀/Function
                </label>
                <select
                  value={state.teamFunction}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, teamFunction: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">선택하세요</option>
                  {TEAM_FUNCTIONS.map((func) => (
                    <option key={func} value={func}>
                      {func}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {state.changeType === "new_agent"
                    ? "에이전트 이름"
                    : state.changeType === "new_team"
                      ? "팀 이름"
                      : "변경 대상"}
                </label>
                <input
                  type="text"
                  value={state.entityName}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, entityName: e.target.value }))
                  }
                  placeholder={
                    state.changeType === "new_agent" ? "예: data-agent" : "예: Data Analytics Team"
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  역할 설명
                </label>
                <textarea
                  value={state.description}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="이 에이전트/팀의 주요 역할과 책임을 설명해주세요"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* AI suggestion preview */}
              <div className="mt-4 p-4 bg-indigo-50 rounded-lg">
                <div className="flex items-start">
                  <span className="text-xl mr-2">🤖</span>
                  <div>
                    <div className="font-medium text-indigo-900">AI 제안</div>
                    <div className="text-sm text-indigo-700">
                      다음 단계에서 "{state.teamFunction || "선택된 팀"}"의 업무 패턴을 분석하여
                      필요한 스킬과 도구를 제안해드립니다.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Skills & Tools */}
        {state.step === 3 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              스킬 & 도구 선택 (Step 3/5)
            </h2>

            {isAnalyzing ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <p className="text-gray-600">AI가 필요한 스킬과 도구를 분석 중입니다...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* AI Suggestions */}
                {state.analysis && (
                  <div className="p-4 bg-indigo-50 rounded-lg">
                    <div className="flex items-start">
                      <span className="text-xl mr-2">🤖</span>
                      <div>
                        <div className="font-medium text-indigo-900 mb-1">AI 제안</div>
                        <div className="text-sm text-indigo-700">
                          "{state.teamFunction}" 팀의 업무 패턴을 분석한 결과, 아래 스킬과 도구가
                          필요합니다. 필요한 항목을 선택하거나 직접 추가할 수 있습니다.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Skills */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    스킬 (Skills)
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {state.analysis?.suggestedSkills.map((skill) => (
                      <button
                        key={skill}
                        onClick={() => toggleSkill(skill)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          state.selectedSkills.includes(skill)
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {skill}
                      </button>
                    ))}
                    {state.customSkills.map((skill) => (
                      <button
                        key={skill}
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            customSkills: prev.customSkills.filter((s) => s !== skill),
                          }))
                        }
                        className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200"
                      >
                        {skill} ×
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && addCustomSkill()}
                      placeholder="커스텀 스킬 추가"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <button
                      onClick={addCustomSkill}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    >
                      추가
                    </button>
                  </div>
                </div>

                {/* Tools */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    도구/MCP 연결 (Tools)
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {state.analysis?.suggestedTools.map((tool) => (
                      <button
                        key={tool}
                        onClick={() => toggleTool(tool)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          state.selectedTools.includes(tool)
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {tool}
                      </button>
                    ))}
                    {state.customTools.map((tool) => (
                      <button
                        key={tool}
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            customTools: prev.customTools.filter((t) => t !== tool),
                          }))
                        }
                        className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200"
                      >
                        {tool} ×
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTool}
                      onChange={(e) => setNewTool(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && addCustomTool()}
                      placeholder="커스텀 도구 추가"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <button
                      onClick={addCustomTool}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    >
                      추가
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Permissions */}
        {state.step === 4 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">권한 설정 (Step 4/5)</h2>
            <p className="text-gray-600 mb-6">
              에이전트가 접근할 수 있는 경로를 설정합니다. 글로브 패턴을 사용할 수 있습니다.
            </p>

            <div className="space-y-6">
              {/* Read paths */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  읽기 권한 (Read)
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {state.permissions.read.map((path) => (
                    <span
                      key={path}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm flex items-center gap-1"
                    >
                      {path}
                      <button
                        onClick={() => removePath("read", path)}
                        className="ml-1 hover:text-blue-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newReadPath}
                    onChange={(e) => setNewReadPath(e.target.value)}
                    onKeyPress={(e) =>
                      e.key === "Enter" && addPath("read", newReadPath, setNewReadPath)
                    }
                    placeholder="/sops/brand/*, /docs/product/*"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    onClick={() => addPath("read", newReadPath, setNewReadPath)}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm"
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* Write paths */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  쓰기 권한 (Write)
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {state.permissions.write.map((path) => (
                    <span
                      key={path}
                      className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm flex items-center gap-1"
                    >
                      {path}
                      <button
                        onClick={() => removePath("write", path)}
                        className="ml-1 hover:text-green-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newWritePath}
                    onChange={(e) => setNewWritePath(e.target.value)}
                    onKeyPress={(e) =>
                      e.key === "Enter" && addPath("write", newWritePath, setNewWritePath)
                    }
                    placeholder="/sops/brand/* (PR only)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    onClick={() => addPath("write", newWritePath, setNewWritePath)}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm"
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* Deny paths */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  접근 금지 (Deny)
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {state.permissions.deny.map((path) => (
                    <span
                      key={path}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm flex items-center gap-1"
                    >
                      {path}
                      <button
                        onClick={() => removePath("deny", path)}
                        className="ml-1 hover:text-red-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDenyPath}
                    onChange={(e) => setNewDenyPath(e.target.value)}
                    onKeyPress={(e) =>
                      e.key === "Enter" && addPath("deny", newDenyPath, setNewDenyPath)
                    }
                    placeholder="/org/hr/*, /docs/finance/confidential/*"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    onClick={() => addPath("deny", newDenyPath, setNewDenyPath)}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm"
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* Help text */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-700 mb-2">경로 패턴 가이드</div>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>
                    <code className="bg-gray-200 px-1 rounded">/sops/brand/*</code> - brand 폴더의
                    모든 파일
                  </li>
                  <li>
                    <code className="bg-gray-200 px-1 rounded">/docs/**/*</code> - docs 하위 모든
                    파일 (재귀)
                  </li>
                  <li>
                    <code className="bg-gray-200 px-1 rounded">/config/agents/*.yaml</code> - agents
                    폴더의 YAML 파일만
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Review & Submit */}
        {state.step === 5 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">검토 & 제출 (Step 5/5)</h2>
            <p className="text-gray-600 mb-6">설정 내용을 확인하고 제출해주세요.</p>

            <div className="space-y-6">
              {/* Summary */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 font-medium text-gray-700">요약</div>
                <div className="p-4 space-y-3">
                  <div className="flex">
                    <span className="w-32 text-gray-500">변경 유형:</span>
                    <span className="font-medium">
                      {state.changeType && CHANGE_TYPE_INFO[state.changeType].title}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-32 text-gray-500">팀/Function:</span>
                    <span className="font-medium">{state.teamFunction}</span>
                  </div>
                  <div className="flex">
                    <span className="w-32 text-gray-500">이름:</span>
                    <span className="font-medium">{state.entityName}</span>
                  </div>
                  <div className="flex">
                    <span className="w-32 text-gray-500">설명:</span>
                    <span className="text-gray-700">{state.description}</span>
                  </div>
                  <div className="flex">
                    <span className="w-32 text-gray-500">스킬:</span>
                    <span className="flex flex-wrap gap-1">
                      {[...state.selectedSkills, ...state.customSkills].map((skill) => (
                        <span
                          key={skill}
                          className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs"
                        >
                          {skill}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="w-32 text-gray-500">도구:</span>
                    <span className="flex flex-wrap gap-1">
                      {[...state.selectedTools, ...state.customTools].map((tool) => (
                        <span
                          key={tool}
                          className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                        >
                          {tool}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Impact Analysis */}
              {state.analysis && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 font-medium text-gray-700 flex items-center gap-2">
                    <span>영향 분석</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${getRiskBadgeColor(state.analysis.riskLevel)}`}
                    >
                      위험도: {getRiskLabel(state.analysis.riskLevel)}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    {state.analysis.impactedAgents.length > 0 && (
                      <div className="flex items-start">
                        <span className="text-lg mr-2">📊</span>
                        <div>
                          <span className="text-gray-500 text-sm">영향 받는 에이전트:</span>
                          <div className="font-medium">
                            {state.analysis.impactedAgents.join(", ")}
                          </div>
                        </div>
                      </div>
                    )}
                    {state.analysis.impactedSOPs.length > 0 && (
                      <div className="flex items-start">
                        <span className="text-lg mr-2">📋</span>
                        <div>
                          <span className="text-gray-500 text-sm">수정 필요한 SOP:</span>
                          <div className="font-medium">{state.analysis.impactedSOPs.join(", ")}</div>
                        </div>
                      </div>
                    )}
                    {state.analysis.recommendations.length > 0 && (
                      <div className="flex items-start">
                        <span className="text-lg mr-2">💡</span>
                        <div>
                          <span className="text-gray-500 text-sm">권장 사항:</span>
                          <ul className="mt-1 space-y-1">
                            {state.analysis.recommendations.slice(0, 3).map((rec, i) => (
                              <li key={i} className="text-sm text-gray-700">
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PR Preview */}
              {state.analysis && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 font-medium text-gray-700">
                    📝 PR이 생성됩니다
                  </div>
                  <div className="p-4 font-mono text-sm">
                    {state.analysis.filesCreated.length > 0 && (
                      <div className="mb-2">
                        <span className="text-green-600">생성:</span>
                        {state.analysis.filesCreated.map((file) => (
                          <div key={file} className="ml-4 text-gray-600">
                            + {file}
                          </div>
                        ))}
                      </div>
                    )}
                    {state.analysis.filesModified.length > 0 && (
                      <div>
                        <span className="text-yellow-600">수정:</span>
                        {state.analysis.filesModified.map((file) => (
                          <div key={file} className="ml-4 text-gray-600">
                            ~ {file}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <button
          onClick={state.step === 1 ? () => navigate("/org-changes") : handleBack}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          {state.step === 1 ? "취소" : "◀ 이전"}
        </button>

        {state.step < 5 ? (
          <button
            onClick={handleNext}
            disabled={isAnalyzing}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            다음 ▶
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "제출 중..." : "🚀 제출하고 PR 생성"}
          </button>
        )}
      </div>
    </div>
  );
}
