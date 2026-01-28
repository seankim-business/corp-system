/**
 * Auth Store (Zustand)
 *
 * 기획:
 * - 전역 인증 상태 관리
 * - 사용자 정보 (user)
 * - 현재 조직 (currentOrganization)
 * - 사용자가 속한 조직 목록 (organizations)
 * - 로그인/로그아웃 액션
 * - 조직 전환 액션
 *
 * 구조:
 * AuthStore
 * ├── State
 * │   ├── user: User | null
 * │   ├── currentOrganization: Organization | null
 * │   ├── organizations: Organization[]
 * │   └── isLoading: boolean
 * └── Actions
 *     ├── fetchUser() - GET /auth/me
 *     ├── logout() - POST /auth/logout
 *     ├── switchOrganization() - POST /auth/switch-org
 *     └── setUser()
 */

import { create } from "zustand";
import { request } from "../api/client";

interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface Organization {
  id: string;
  name: string;
  domain: string;
}

interface AuthState {
  user: User | null;
  currentOrganization: Organization | null;
  organizations: Organization[];
  isLoading: boolean;
  hasCheckedAuth: boolean;

  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  currentOrganization: null,
  organizations: [],
  isLoading: true,
  hasCheckedAuth: false,

  fetchUser: async () => {
    if (get().hasCheckedAuth) return;

    set({ isLoading: true, hasCheckedAuth: true });
    try {
      const data = await request<{
        user: User;
        currentOrganization: Organization | null;
        organizations: Organization[];
      }>({
        url: "/auth/me",
        method: "GET",
      });

      set({
        user: data.user,
        currentOrganization: data.currentOrganization,
        organizations: data.organizations || [],
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to fetch user:", error);
      set({ user: null, currentOrganization: null, organizations: [], isLoading: false });
    }
  },

  logout: async () => {
    try {
      await request<{ success: boolean }>({
        url: "/auth/logout",
        method: "POST",
      });
      set({ user: null, currentOrganization: null, organizations: [] });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  },

  switchOrganization: async (organizationId: string) => {
    try {
      const result = await request<{ redirectUrl?: string }>({
        url: "/auth/switch-org",
        method: "POST",
        data: { organizationId },
      });

      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }

      window.location.reload();
    } catch (error) {
      console.error("Switch organization failed:", error);
    }
  },

  setUser: (user: User | null) => {
    set({ user });
  },
}));
