import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

interface SlackConnectStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onConnected: () => void;
}

export function SlackConnectStep({ onNext, onBack, onSkip, onConnected }: SlackConnectStepProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'true') {
      setConnectionStatus('connected');
      onConnected();
      setSearchParams({});
    } else if (error) {
      const errorMessages: Record<string, string> = {
        access_denied: 'You denied the Slack authorization request',
        missing_params: 'Missing required parameters from Slack',
        server_config: 'Server configuration error. Please contact support.',
        invalid_state: 'Invalid state parameter. Please try again.',
        token_exchange_failed: 'Failed to exchange token with Slack',
        server_error: 'Server error occurred. Please try again.',
      };
      setErrorMessage(errorMessages[error] || `Error: ${error}`);
      setConnectionStatus('error');
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, onConnected]);

  const handleConnect = () => {
    setConnectionStatus('connecting');
    window.location.href = '/api/slack/oauth/install';
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-[#4A154B] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-12 h-12 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-3">Connect Your Slack Workspace</h2>
        <p className="text-lg text-gray-600">
          Connect Slack to receive notifications and trigger AI workflows from your workspace
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <ExclamationCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}

      {connectionStatus === 'connected' && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">Slack workspace connected successfully!</p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-8 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">What you'll get:</h3>
        <ul className="space-y-3 mb-6">
          <li className="flex items-start gap-3">
            <CheckCircleIcon className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-700">
              Receive real-time notifications about workflow executions
            </span>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircleIcon className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-700">
              Trigger AI workflows by mentioning the bot in any channel
            </span>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircleIcon className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-700">
              Get approval requests and updates directly in Slack
            </span>
          </li>
        </ul>

        {connectionStatus === 'connected' ? (
          <button
            onClick={onNext}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={connectionStatus === 'connecting'}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#4A154B] text-white rounded-lg hover:bg-[#3e1240] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connectionStatus === 'connecting' ? (
              <>
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white" />
                Connecting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                </svg>
                Connect Slack Workspace
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-6 py-3 text-gray-700 hover:text-gray-900 transition-colors font-medium"
        >
          Back
        </button>

        <button
          onClick={onSkip}
          className="px-6 py-3 text-gray-500 hover:text-gray-700 transition-colors font-medium"
        >
          Skip for Now
        </button>
      </div>
    </div>
  );
}
