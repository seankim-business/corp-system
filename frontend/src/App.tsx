/**
 * App Component
 * 
 * 기획:
 * - 최상위 라우팅 설정
 * - Public Routes: /login
 * - Protected Routes: /dashboard, /workflows, /executions, /settings
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
 *         └── /settings (Protected)
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WorkflowsPage from './pages/WorkflowsPage';
import ExecutionsPage from './pages/ExecutionsPage';
import SettingsPage from './pages/SettingsPage';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <DashboardLayout>
              <DashboardPage />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/workflows" element={
          <ProtectedRoute>
            <DashboardLayout>
              <WorkflowsPage />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/executions" element={
          <ProtectedRoute>
            <DashboardLayout>
              <ExecutionsPage />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/settings" element={
          <ProtectedRoute>
            <DashboardLayout>
              <SettingsPage />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
