/**
 * App Component
 *
 * 기획:
 * - 최상위 라우팅 설정
 * - Public Routes: /login
 * - Protected Routes: /dashboard, /workflows, /executions, /settings, /settings/notion
 * - 로그인 안된 유저는 /login으로 리다이렉트
 *
 * 구조:
 * App
 * └── BrowserRouter
 *     └── Routes
 *         ├── /login (Public)
 *         ├── /dashboard (Protected)
 *         ├── /workflows (Protected)
 *         ├── /executions (Protected)
 *         ├── /settings (Protected)
 *         └── /settings/notion (Protected)
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
import MembersPage from "./pages/MembersPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import AgentActivityPage from "./pages/AgentActivityPage";
import AgentMetricsPage from "./pages/AgentMetricsPage";
import OrgChangesPage from "./pages/OrgChangesPage";
import OKRPage from "./pages/OKRPage";
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

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
