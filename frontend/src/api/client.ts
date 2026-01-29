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

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await api.request<T>(config);
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}
