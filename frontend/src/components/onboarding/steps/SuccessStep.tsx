import { useNavigate } from 'react-router-dom';
import { CheckCircleIcon, RocketLaunchIcon } from '@heroicons/react/24/outline';

interface SuccessStepProps {
  integrations: {
    slack: 'pending' | 'connected' | 'skipped';
    notion: 'pending' | 'connected' | 'skipped';
  };
}

export function SuccessStep({ integrations }: SuccessStepProps) {
  const navigate = useNavigate();

  const completedItems = [
    {
      id: 'account',
      label: 'Account created',
      completed: true,
    },
    {
      id: 'slack',
      label: 'Slack connected',
      completed: integrations.slack === 'connected',
    },
    {
      id: 'notion',
      label: 'Notion connected',
      completed: integrations.notion === 'connected',
    },
    {
      id: 'workflow',
      label: 'First workflow created',
      completed: true,
    },
  ].filter((item) => item.completed);

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="mb-8">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-green-100 rounded-full mb-6 animate-bounce-in">
          <CheckCircleIcon className="h-14 w-14 text-green-600" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">All Set!</h1>
        <p className="text-xl text-gray-600">
          You're ready to start automating with AI-powered workflows
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-8 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">What you've accomplished:</h2>
        <div className="space-y-3">
          {completedItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 text-left">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0" />
              <span className="text-gray-700">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-indigo-50 rounded-lg border border-indigo-200 p-6 mb-8">
        <h3 className="text-lg font-semibold text-indigo-900 mb-3">Next Steps:</h3>
        <ul className="space-y-2 text-left text-indigo-800">
          <li className="flex items-start gap-2">
            <span className="font-medium">1.</span>
            <span>Explore the dashboard to see your workflows and executions</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-medium">2.</span>
            <span>Add more integrations to expand automation possibilities</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-medium">3.</span>
            <span>Create more workflows to automate your team's tasks</span>
          </li>
        </ul>
      </div>

      <div className="flex gap-4 justify-center">
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-lg"
        >
          <RocketLaunchIcon className="h-5 w-5" />
          Go to Dashboard
        </button>

        <button
          onClick={() => navigate('/workflows')}
          className="px-8 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors font-medium text-lg"
        >
          View Workflows
        </button>
      </div>

      <p className="mt-6 text-sm text-gray-500">
        Need help? Check out our{' '}
        <a href="#" className="text-indigo-600 hover:underline">
          documentation
        </a>{' '}
        or contact support
      </p>
    </div>
  );
}
