import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import GoogleButton from "../components/common/GoogleButton";

const ERROR_MESSAGES: Record<string, string> = {
  session_expired: "Your login session has expired. Please try again.",
  auth_failed: "Authentication failed. Please try again.",
  access_denied: "Access was denied. Please try again and grant the required permissions.",
  invalid_request: "Invalid authentication request. Please try again.",
  server_error: "Server error occurred. Please try again later.",
};

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam && ERROR_MESSAGES[errorParam]) {
      setError(ERROR_MESSAGES[errorParam]);
      // Clean up URL so refresh doesn't re-show stale error
      const cleaned = new URLSearchParams(searchParams);
      cleaned.delete("error");
      const newSearch = cleaned.toString();
      window.history.replaceState({}, "", newSearch ? `/login?${newSearch}` : "/login");
    }
  }, [searchParams]);

  const handleGoogleLogin = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "https://auth.nubabel.com";
    const returnUrl = searchParams.get("returnUrl") || "/dashboard";
    window.location.href = `${apiBase}/auth/google?returnUrl=${encodeURIComponent(returnUrl)}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Nubabel</h1>
          <p className="text-gray-600">AI-Powered Workflow Automation</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm text-center">{error}</p>
          </div>
        )}

        <GoogleButton onClick={handleGoogleLogin} />

        <p className="text-center text-sm text-gray-500 mt-6">
          Sign in with your company Google account
        </p>
      </div>
    </div>
  );
}
