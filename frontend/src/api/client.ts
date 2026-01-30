import axios, { AxiosError, AxiosRequestConfig } from "axios";

export class ApiError extends Error {
  status: number | null;
  data: unknown;

  constructor(message: string, status: number | null, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Helper to get CSRF token from cookie
function getCsrfToken(): string {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

// Add CSRF token to all mutating requests (POST, PUT, DELETE, PATCH)
api.interceptors.request.use((config) => {
  const csrfToken = getCsrfToken();
  if (
    csrfToken &&
    config.method &&
    !["get", "head", "options"].includes(config.method.toLowerCase())
  ) {
    config.headers["X-CSRF-Token"] = csrfToken;
  }
  return config;
});

function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<any>;
    const status = axiosError.response?.status ?? null;
    const data = axiosError.response?.data;
    const message =
      (typeof data?.error === "string" && data.error) ||
      (typeof data?.message === "string" && data.message) ||
      axiosError.message ||
      "Request failed";
    return new ApiError(message, status, data);
  }

  const message = error instanceof Error ? error.message : String(error);
  return new ApiError(message, null, null);
}

// 401 interceptor: attempt token refresh, then retry original request once
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  try {
    await api.post("/auth/refresh");
    return true;
  } catch {
    return false;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retried?: boolean };

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retried &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login")
    ) {
      originalRequest._retried = true;

      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = attemptRefresh();
      }

      const refreshed = await refreshPromise;
      isRefreshing = false;
      refreshPromise = null;

      if (refreshed) {
        return api.request(originalRequest);
      }

      // Refresh failed — redirect to login
      window.location.href = "/login?error=session_expired";
      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await api.request<T>(config);
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}
