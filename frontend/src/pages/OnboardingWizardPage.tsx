import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

type OnboardingStep =
  | "company_info"
  | "google_workspace"
  | "select_template"
  | "customize_agents"
  | "connect_slack"
  | "invite_team"
  | "first_workflow"
  | "completed";

interface OnboardingState {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
  data: Record<string, unknown>;
  progress: number;
  isComplete: boolean;
}

interface Template {
  id: string;
  name: string;
  nameKo: string;
  industry: string;
  description: string;
  descriptionKo: string;
  icon: string;
  agents: Array<{
    id: string;
    name: string;
    role: string;
    enabled: boolean;
    description?: string;
  }>;
}

const STEP_INFO: Record<
  OnboardingStep,
  { title: string; titleKo: string; description: string; descriptionKo: string }
> = {
  company_info: {
    title: "Company Information",
    titleKo: "회사 정보",
    description: "Tell us about your company",
    descriptionKo: "회사에 대해 알려주세요",
  },
  google_workspace: {
    title: "Connect Google Workspace",
    titleKo: "Google Workspace 연결",
    description: "Import team members automatically",
    descriptionKo: "팀원을 자동으로 가져오세요",
  },
  select_template: {
    title: "Select Template",
    titleKo: "템플릿 선택",
    description: "Choose a template that fits your industry",
    descriptionKo: "업종에 맞는 템플릿을 선택하세요",
  },
  customize_agents: {
    title: "Customize Agents",
    titleKo: "에이전트 설정",
    description: "Configure your AI agents",
    descriptionKo: "AI 에이전트를 설정하세요",
  },
  connect_slack: {
    title: "Connect Slack",
    titleKo: "Slack 연결",
    description: "Use agents in Slack",
    descriptionKo: "Slack에서 에이전트를 사용하세요",
  },
  invite_team: {
    title: "Invite Team",
    titleKo: "팀원 초대",
    description: "Invite colleagues to collaborate",
    descriptionKo: "함께 사용할 팀원을 초대하세요",
  },
  first_workflow: {
    title: "Your First Workflow",
    titleKo: "첫 워크플로우",
    description: "Try running an automated workflow",
    descriptionKo: "자동화된 워크플로우를 실행해보세요",
  },
  completed: {
    title: "All Done!",
    titleKo: "완료!",
    description: "You're ready to go",
    descriptionKo: "준비가 완료되었습니다",
  },
};

const STEPS: OnboardingStep[] = [
  "company_info",
  "google_workspace",
  "select_template",
  "customize_agents",
  "connect_slack",
  "invite_team",
  "first_workflow",
  "completed",
];

export default function OnboardingWizardPage() {
  const navigate = useNavigate();
  const { user: _user } = useAuthStore();

  const [state, setState] = useState<OnboardingState | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [inviteEmails, setInviteEmails] = useState<string>("");

  useEffect(() => {
    fetchState();
    fetchTemplates();
  }, []);

  const fetchState = async () => {
    try {
      const res = await fetch("/api/onboarding/state", { credentials: "include" });
      const data = await res.json();

      if (data.data) {
        setState(data.data);
        // Populate form with existing data
        if (data.data.data) {
          setCompanyName(data.data.data.companyName || "");
          setIndustry(data.data.data.industry || "");
          setTeamSize(data.data.data.teamSize || "");
          setSelectedTemplate(data.data.data.templateId || null);
          setSelectedAgents(data.data.data.selectedAgents || []);
        }
      } else {
        // Start onboarding if not exists
        const startRes = await fetch("/api/onboarding/start", {
          method: "POST",
          credentials: "include",
        });
        const startData = await startRes.json();
        setState(startData.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/onboarding/templates", { credentials: "include" });
      const data = await res.json();
      setTemplates(data.data || []);
    } catch (err) {
      console.error("Failed to fetch templates", err);
    }
  };

  const completeStep = async (step: OnboardingStep, data?: Record<string, unknown>) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/onboarding/step/${step}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data }),
      });
      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      setState(result.data);

      if (result.data.isComplete) {
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete step");
    } finally {
      setSaving(false);
    }
  };

  const skipStep = async (step: OnboardingStep) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/onboarding/step/${step}/skip`, {
        method: "POST",
        credentials: "include",
      });
      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      setState(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to skip step");
    } finally {
      setSaving(false);
    }
  };

  const handleCompanyInfoSubmit = () => {
    if (!companyName.trim()) {
      setError("Company name is required");
      return;
    }

    completeStep("company_info", {
      companyName,
      industry,
      teamSize,
    });
  };

  const handleTemplateSelect = async () => {
    if (!selectedTemplate) {
      setError("Please select a template");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Apply template
      const applyRes = await fetch(`/api/onboarding/templates/${selectedTemplate}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customizations: { enabledAgents: selectedAgents } }),
      });
      const applyResult = await applyRes.json();

      if (!applyResult.success) {
        throw new Error(applyResult.error);
      }

      // Update state
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply template");
    } finally {
      setSaving(false);
    }
  };

  const handleInviteSubmit = () => {
    const emails = inviteEmails
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter((e) => e);

    if (emails.length === 0) {
      skipStep("invite_team");
      return;
    }

    completeStep("invite_team", {
      invitedEmails: emails,
    });
  };

  const currentStep = state?.currentStep || "company_info";
  const stepInfo = STEP_INFO[currentStep];
  const currentStepIndex = STEPS.indexOf(currentStep);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (state?.isComplete) {
    navigate("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Progress Bar */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">
              Step {currentStepIndex + 1} of {STEPS.length - 1}
            </span>
            <span className="text-sm font-medium text-indigo-600">{state?.progress || 0}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 bg-indigo-600 rounded-full transition-all"
              style={{ width: `${state?.progress || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{stepInfo.titleKo}</h1>
            <p className="text-gray-600">{stepInfo.descriptionKo}</p>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Step 1: Company Info */}
          {currentStep === "company_info" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Select industry</option>
                  <option value="technology">Technology</option>
                  <option value="agency">Marketing/Design Agency</option>
                  <option value="retail">E-Commerce/Retail</option>
                  <option value="manufacturing">Manufacturing</option>
                  <option value="consulting">Consulting</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="finance">Finance</option>
                  <option value="education">Education</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team Size</label>
                <select
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Select team size</option>
                  <option value="1-5">1-5 people</option>
                  <option value="6-20">6-20 people</option>
                  <option value="21-50">21-50 people</option>
                  <option value="51-200">51-200 people</option>
                  <option value="200+">200+ people</option>
                </select>
              </div>

              <button
                onClick={handleCompanyInfoSubmit}
                disabled={saving}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Continue"}
              </button>
            </div>
          )}

          {/* Step 2: Google Workspace */}
          {currentStep === "google_workspace" && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0012.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Connect Google Workspace
                </h3>
                <p className="text-gray-600 mb-6">
                  Import your team members automatically from Google Workspace
                </p>

                <a
                  href="/api/google/oauth/install"
                  className="inline-flex items-center px-6 py-3 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Connect with Google
                </a>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => skipStep("google_workspace")}
                  disabled={saving}
                  className="px-6 py-2 text-gray-600 hover:text-gray-900"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Select Template */}
          {currentStep === "select_template" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={`p-6 border-2 rounded-xl text-left transition ${
                      selectedTemplate === template.id
                        ? "border-indigo-600 bg-indigo-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="text-3xl mb-2">{template.icon}</div>
                    <h3 className="font-semibold text-gray-900">{template.nameKo}</h3>
                    <p className="text-sm text-gray-600 mt-1">{template.descriptionKo}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {template.agents.filter((a) => a.enabled).length} agents,{" "}
                      {template.id === "custom" ? "configure yourself" : "pre-configured"}
                    </p>
                  </button>
                ))}
              </div>

              <button
                onClick={handleTemplateSelect}
                disabled={saving || !selectedTemplate}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Applying template..." : "Continue"}
              </button>
            </div>
          )}

          {/* Step 4: Customize Agents */}
          {currentStep === "customize_agents" && (
            <div className="space-y-6">
              {selectedTemplate && (
                <div className="space-y-4">
                  {templates
                    .find((t) => t.id === selectedTemplate)
                    ?.agents.map((agent) => (
                      <label
                        key={agent.id}
                        className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={agent.enabled || selectedAgents.includes(agent.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAgents([...selectedAgents, agent.id]);
                            } else {
                              setSelectedAgents(selectedAgents.filter((id) => id !== agent.id));
                            }
                          }}
                          className="h-4 w-4 text-indigo-600 rounded"
                        />
                        <div className="ml-3">
                          <div className="font-medium text-gray-900">{agent.name}</div>
                          <div className="text-sm text-gray-500">{agent.description}</div>
                        </div>
                      </label>
                    ))}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => skipStep("customize_agents")}
                  disabled={saving}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                >
                  Use defaults
                </button>
                <button
                  onClick={() => completeStep("customize_agents", { selectedAgents })}
                  disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Continue"}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Connect Slack */}
          {currentStep === "connect_slack" && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Connect Slack</h3>
                <p className="text-gray-600 mb-6">
                  Use your AI agents directly in Slack channels
                </p>

                <a
                  href="/api/slack/oauth/install"
                  className="inline-flex items-center px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700"
                >
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" />
                  </svg>
                  Add to Slack
                </a>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => skipStep("connect_slack")}
                  disabled={saving}
                  className="px-6 py-2 text-gray-600 hover:text-gray-900"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Invite Team */}
          {currentStep === "invite_team" && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Team Member Emails
                </label>
                <textarea
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  placeholder="Enter email addresses (one per line or comma-separated)"
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  You can also invite team members later from Settings
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => skipStep("invite_team")}
                  disabled={saving}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                >
                  Skip for now
                </button>
                <button
                  onClick={handleInviteSubmit}
                  disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "Sending..." : inviteEmails.trim() ? "Send Invites" : "Continue"}
                </button>
              </div>
            </div>
          )}

          {/* Step 7: First Workflow */}
          {currentStep === "first_workflow" && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-10 h-10 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Try Your First Workflow
                </h3>
                <p className="text-gray-600 mb-6">
                  We've set up some sample workflows for you. Let's run one to see how it works!
                </p>

                <button
                  onClick={() => {
                    completeStep("first_workflow", { firstWorkflowCompleted: true });
                  }}
                  className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                >
                  Run Sample Workflow
                </button>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => skipStep("first_workflow")}
                  disabled={saving}
                  className="px-6 py-2 text-gray-600 hover:text-gray-900"
                >
                  I'll try it later
                </button>
              </div>
            </div>
          )}

          {/* Step 8: Completed */}
          {currentStep === "completed" && (
            <div className="text-center py-12">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  className="w-12 h-12 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h2>
              <p className="text-gray-600 mb-8">
                Your workspace is ready. Let's start automating your work.
              </p>

              <button
                onClick={() => navigate("/dashboard")}
                className="px-8 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>

        {/* Step Indicators */}
        {currentStep !== "completed" && (
          <div className="flex justify-center mt-8 space-x-2">
            {STEPS.slice(0, -1).map((step) => {
              const isCompleted = state?.completedSteps.includes(step);
              const isSkipped = state?.skippedSteps.includes(step);
              const isCurrent = step === currentStep;

              return (
                <div
                  key={step}
                  className={`w-3 h-3 rounded-full ${
                    isCompleted
                      ? "bg-green-500"
                      : isSkipped
                        ? "bg-gray-300"
                        : isCurrent
                          ? "bg-indigo-600"
                          : "bg-gray-200"
                  }`}
                  title={STEP_INFO[step].title}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
