import { useState } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { request, ApiError } from '../../../api/client';

interface NotionConnectStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onConnected: () => void;
}

export function NotionConnectStep({ onNext, onBack, onSkip, onConnected }: NotionConnectStepProps) {
  const [apiKey, setApiKey] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'testing' | 'saving' | 'connected' | 'error'
  >('idle');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleTest = async () => {
    if (!apiKey) {
      setMessage({ type: 'error', text: 'Please enter an API key' });
      return;
    }

    setConnectionStatus('testing');
    setMessage(null);

    try {
      const data = await request<{ success: boolean; databaseCount?: number; error?: string }>({
        url: '/api/notion/test',
        method: 'POST',
        data: { apiKey },
      });

      if (data.success) {
        setMessage({
          type: 'success',
          text: `Connection successful! Found ${data.databaseCount || 0} databases.`,
        });
        setConnectionStatus('idle');
      } else {
        setMessage({ type: 'error', text: data.error || 'Connection failed' });
        setConnectionStatus('error');
      }
    } catch (error) {
      const text = error instanceof ApiError ? error.message : 'Failed to test connection';
      setMessage({ type: 'error', text });
      setConnectionStatus('error');
    }
  };

  const handleConnect = async () => {
    if (!apiKey) {
      setMessage({ type: 'error', text: 'Please enter an API key' });
      return;
    }

    setConnectionStatus('saving');
    setMessage(null);

    try {
      interface SaveConnectionResponse {
        connection: {
          id: string;
          organizationId: string;
          defaultDatabaseId?: string;
          createdAt: string;
          updatedAt: string;
        };
      }
      await request<SaveConnectionResponse>({
        url: '/api/notion/connection',
        method: 'POST',
        data: { apiKey },
      });

      setMessage({ type: 'success', text: 'Notion connected successfully!' });
      setConnectionStatus('connected');
      onConnected();
    } catch (error) {
      const text = error instanceof ApiError ? error.message : 'Failed to save connection';
      setMessage({ type: 'error', text });
      setConnectionStatus('error');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-black rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-12 h-12 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.635-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-3">Connect Your Notion Workspace</h2>
        <p className="text-lg text-gray-600">
          Sync data with Notion databases and automate your knowledge management
        </p>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          ) : (
            <ExclamationCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          )}
          <p
            className={`text-sm ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}
          >
            {message.text}
          </p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Setup Instructions:</h3>
        <ol className="space-y-3 mb-6 list-decimal list-inside text-gray-700">
          <li>
            Go to{' '}
            <a
              href="https://www.notion.so/my-integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              notion.so/my-integrations
            </a>
          </li>
          <li>Click "New integration" and give it a name</li>
          <li>Copy the "Internal Integration Token"</li>
          <li>Paste the token below</li>
          <li>Share your Notion databases with the integration</li>
        </ol>

        <div className="mb-4">
          <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
            Notion Internal Integration Token
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="secret_..."
            disabled={connectionStatus === 'connected'}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleTest}
            disabled={
              !apiKey ||
              connectionStatus === 'testing' ||
              connectionStatus === 'saving' ||
              connectionStatus === 'connected'
            }
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {connectionStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>

          <button
            onClick={connectionStatus === 'connected' ? onNext : handleConnect}
            disabled={
              !apiKey ||
              connectionStatus === 'testing' ||
              connectionStatus === 'saving'
            }
            className="flex-1 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {connectionStatus === 'connected'
              ? 'Continue'
              : connectionStatus === 'saving'
                ? 'Connecting...'
                : 'Connect Notion'}
          </button>
        </div>
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
