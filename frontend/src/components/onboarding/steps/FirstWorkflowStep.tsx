import { useState } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { request, ApiError } from '../../../api/client';

interface FirstWorkflowStepProps {
  onNext: () => void;
  onBack: () => void;
  onWorkflowCreated: () => void;
}

const WORKFLOW_TEMPLATES = [
  {
    id: 'slack-notification',
    name: 'Slack Notification Workflow',
    description: 'Get notified in Slack when specific events occur',
    icon: '🔔',
    requiredIntegrations: ['slack'],
  },
  {
    id: 'notion-sync',
    name: 'Notion Database Sync',
    description: 'Automatically sync data to your Notion workspace',
    icon: '🔄',
    requiredIntegrations: ['notion'],
  },
  {
    id: 'custom',
    name: 'Custom Workflow',
    description: 'Create a custom workflow from scratch',
    icon: '⚡',
    requiredIntegrations: [],
  },
];

export function FirstWorkflowStep({
  onNext,
  onBack,
  onWorkflowCreated,
}: FirstWorkflowStepProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isCreated, setIsCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!workflowName) {
      setError('Please enter a workflow name');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      interface CreateWorkflowResponse {
        workflow: {
          id: string;
          name: string;
          description?: string;
          enabled: boolean;
          createdAt: string;
        };
      }
      await request<CreateWorkflowResponse>({
        url: '/api/workflows',
        method: 'POST',
        data: {
          name: workflowName,
          description: workflowDescription,
          enabled: true,
        },
      });

      setIsCreated(true);
      onWorkflowCreated();
    } catch (err) {
      const text = err instanceof ApiError ? err.message : 'Failed to create workflow';
      setError(text);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">Create Your First Workflow</h2>
        <p className="text-lg text-gray-600">
          Choose a template to get started quickly, or create a custom workflow
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {isCreated && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">Workflow created successfully!</p>
        </div>
      )}

      {!isCreated && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {WORKFLOW_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  setSelectedTemplate(template.id);
                  if (template.id !== 'custom') {
                    setWorkflowName(template.name);
                    setWorkflowDescription(template.description);
                  }
                }}
                className={`p-6 rounded-lg border-2 transition-all text-left ${
                  selectedTemplate === template.id
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="text-4xl mb-3">{template.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{template.name}</h3>
                <p className="text-sm text-gray-600">{template.description}</p>
              </button>
            ))}
          </div>

          {selectedTemplate && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Workflow Details</h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="workflowName" className="block text-sm font-medium text-gray-700 mb-2">
                    Workflow Name
                  </label>
                  <input
                    id="workflowName"
                    type="text"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="My First Workflow"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label
                    htmlFor="workflowDescription"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Description (optional)
                  </label>
                  <textarea
                    id="workflowDescription"
                    value={workflowDescription}
                    onChange={(e) => setWorkflowDescription(e.target.value)}
                    placeholder="Describe what this workflow does..."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <button
                  onClick={handleCreate}
                  disabled={isCreating || !workflowName}
                  className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isCreating ? 'Creating...' : 'Create Workflow'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={isCreating}
          className="px-6 py-3 text-gray-700 hover:text-gray-900 transition-colors font-medium disabled:opacity-50"
        >
          Back
        </button>

        {isCreated && (
          <button
            onClick={onNext}
            className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
