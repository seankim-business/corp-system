import GoogleButton from '../components/common/GoogleButton';

export default function LoginPage() {
  const handleGoogleLogin = () => {
    window.location.href = '/auth/google';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Nubabel</h1>
          <p className="text-gray-600">AI-Powered Workflow Automation</p>
        </div>

        <GoogleButton onClick={handleGoogleLogin} />

        <p className="text-center text-sm text-gray-500 mt-6">
          Sign in with your company Google account
        </p>
      </div>
    </div>
  );
}
