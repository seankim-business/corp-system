import { RocketLaunchIcon, ChartBarIcon, BoltIcon } from '@heroicons/react/24/outline';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-100 rounded-full mb-6">
          <RocketLaunchIcon className="h-10 w-10 text-indigo-600" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to Nubabel</h1>
        <p className="text-xl text-gray-600">
          Let's get you set up with AI-powered automation for your team
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center mb-4 mx-auto">
            <BoltIcon className="h-6 w-6 text-indigo-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Connect Your Tools</h3>
          <p className="text-sm text-gray-600">
            Integrate with Slack, Notion, and other platforms
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center mb-4 mx-auto">
            <ChartBarIcon className="h-6 w-6 text-indigo-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Create Workflows</h3>
          <p className="text-sm text-gray-600">Build custom automation with AI assistance</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center mb-4 mx-auto">
            <RocketLaunchIcon className="h-6 w-6 text-indigo-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Launch & Monitor</h3>
          <p className="text-sm text-gray-600">Run workflows and track execution in real-time</p>
        </div>
      </div>

      <button
        onClick={onNext}
        className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-lg"
      >
        Get Started
      </button>

      <p className="mt-6 text-sm text-gray-500">This should take about 5 minutes</p>
    </div>
  );
}
