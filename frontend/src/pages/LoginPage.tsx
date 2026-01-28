import { useSearchParams } from 'react-router-dom';
import GoogleButton from '../components/common/GoogleButton';

const ERROR_MESSAGES: Record<string, string> = {
  session_expired: 'Your login session expired. Please try again.',
  access_denied: 'Access was denied. Please try again.',
  invalid_request: 'Invalid login request. Please try again.',
  server_error: 'A server error occurred. Please try again later.',
};

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');
  const errorMessage = error ? ERROR_MESSAGES[error] || `Login failed: ${error}` : null;

  const handleGoogleLogin = () => {
    // Auth routes are on auth.nubabel.com, redirect there for OAuth flow
    const authBaseUrl = import.meta.env.VITE_AUTH_URL || 'https://auth.nubabel.com';
    window.location.href = `${authBaseUrl}/auth/google`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Nubabel</h1>
          <p className="text-gray-600">AI-Powered Workflow Automation</p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{errorMessage}</p>
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
