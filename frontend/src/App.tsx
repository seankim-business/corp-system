/**
 * App Component - 최상위 라우팅 설정
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import WorkflowsPage from "./pages/WorkflowsPage";
import WorkflowDetailPage from "./pages/WorkflowDetailPage";
import ExecutionsPage from "./pages/ExecutionsPage";
import ExecutionDetailPage from "./pages/ExecutionDetailPage";
import SettingsPage from "./pages/SettingsPage";
import NotionSettingsPage from "./pages/NotionSettingsPage";
import SlackSettingsPage from "./pages/SlackSettingsPage";
import GoogleCalendarSettingsPage from "./pages/GoogleCalendarSettingsPage";
import LinkedIdentitiesPage from "./pages/settings/LinkedIdentities";
import MembersPage from "./pages/MembersPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import AgentActivityPage from "./pages/AgentActivityPage";
import AgentMetricsPage from "./pages/AgentMetricsPage";
import OrgChangesPage from "./pages/OrgChangesPage";
import OKRPage from "./pages/OKRPage";
import AgentsPage from "./pages/AgentsPage";
import SkillsPage from "./pages/SkillsPage";
import ConversationsPage from "./pages/ConversationsPage";
import SearchPage from "./pages/SearchPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminOrganizationsPage from "./pages/admin/AdminOrganizationsPage";
import IdentityManagementPage from "./pages/admin/IdentityManagement";
import AnalyticsDashboardPage from "./pages/AnalyticsDashboardPage";
import BillingPage from "./pages/BillingPage";
import CostDashboardPage from "./pages/CostDashboardPage";
import DeveloperPortalPage from "./pages/DeveloperPortalPage";
import ExtensionDetailPage from "./pages/ExtensionDetailPage";
import FeedbackInsightsPage from "./pages/FeedbackInsightsPage";
import KnowledgeGraphPage from "./pages/KnowledgeGraphPage";
import MarketplacePage from "./pages/MarketplacePage";
import MarketplaceHubPage from "./pages/MarketplaceHubPage";
import OnboardingWizardPage from "./pages/OnboardingWizardPage";
import OrgChangeWizardPage from "./pages/OrgChangeWizardPage";
import PatternInsightsPage from "./pages/PatternInsightsPage";
import PublisherDashboardPage from "./pages/PublisherDashboardPage";
import SOPDraftsPage from "./pages/SOPDraftsPage";
import SOPEditorPage from "./pages/SOPEditorPage";
import SystemHealthPage from "./pages/SystemHealthPage";
import AgentOptimizationPage from "./pages/AgentOptimizationPage";
import ClaudeMaxAccountsPage from "./pages/ClaudeMaxAccountsPage";
import ClaudeConnectPage from "./pages/ClaudeConnectPage";
import N8nWorkflowsPage from "./pages/N8nWorkflowsPage";
import AgentMonitorPage from "./pages/AgentMonitorPage";
import N8nInstancesPage from "./pages/admin/N8nInstancesPage";
// AR (Agent Resource) Management Pages
import ARDashboardPage from "./pages/ar/ARDashboardPage";
import ARDepartmentsPage from "./pages/ar/ARDepartmentsPage";
import ARPositionsPage from "./pages/ar/ARPositionsPage";
import ARAssignmentsPage from "./pages/ar/ARAssignmentsPage";
import ARApprovalsPage from "./pages/ar/ARApprovalsPage";
import ARAnalyticsPage from "./pages/ar/ARAnalyticsPage";
import ARWorkloadPage from "./pages/ar/ARWorkloadPage";
import DashboardLayout from "./components/layout/DashboardLayout";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <DashboardPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/okr"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <OKRPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/workflows"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <WorkflowsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/workflows/:id"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <WorkflowDetailPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/executions"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ExecutionsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/executions/:id"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ExecutionDetailPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <SettingsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/notion"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <NotionSettingsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/slack"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <SlackSettingsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/google-calendar"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <GoogleCalendarSettingsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/identities"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <LinkedIdentitiesPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/members"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <MembersPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/approvals"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ApprovalsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/activity"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <AgentActivityPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/metrics/agents"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <AgentMetricsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/org-changes"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <OrgChangesPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/agents"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <AgentsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/skills"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <SkillsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <AdminDashboardPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/organizations"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <AdminOrganizationsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/identities"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <IdentityManagementPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/optimization"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <AgentOptimizationPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/claude-max-accounts"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ClaudeMaxAccountsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/agent-monitor"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <AgentMonitorPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/n8n-instances"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <N8nInstancesPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/conversations"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ConversationsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/search"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <SearchPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <AnalyticsDashboardPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/costs"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <CostDashboardPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <BillingPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/knowledge-graph"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <KnowledgeGraphPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/patterns"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PatternInsightsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/feedback"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <FeedbackInsightsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/system-health"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <SystemHealthPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketplace"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <MarketplacePage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketplace-hub"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <MarketplaceHubPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketplace/:extensionId"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ExtensionDetailPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/developer"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <DeveloperPortalPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/developer/publisher"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <PublisherDashboardPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/sops/drafts"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <SOPDraftsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/sops/editor/:id?"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <SOPEditorPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <OnboardingWizardPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/org-change-wizard"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <OrgChangeWizardPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/n8n/workflows"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <N8nWorkflowsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/claude-connect"
          element={
            <ProtectedRoute>
              <ClaudeConnectPage />
            </ProtectedRoute>
          }
        />
        {/* AR (Agent Resource) Management Routes */}
        <Route
          path="/ar"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ARDashboardPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ar/departments"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ARDepartmentsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ar/positions"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ARPositionsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ar/assignments"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ARAssignmentsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ar/approvals"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ARApprovalsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ar/analytics"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ARAnalyticsPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ar/workload"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <ARWorkloadPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
