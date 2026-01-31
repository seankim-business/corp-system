import { CheckIcon } from '@heroicons/react/24/outline';

interface IntegrationStepProps {
  selectedIntegrations: ('slack' | 'notion')[];
  onSelectIntegration: (integration: 'slack' | 'notion') => void;
  onNext: () => void;
  onBack: () => void;
}

interface Integration {
  id: 'slack' | 'notion';
  name: string;
  description: string;
  logo: React.ReactElement;
  recommended: boolean;
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'slack',
    name: 'Slack',
    description: 'Connect your Slack workspace to receive notifications and trigger workflows',
    logo: (
      <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
    ),
    recommended: true,
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Sync data with Notion databases and create automated workflows',
    logo: (
      <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.635-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
      </svg>
    ),
    recommended: false,
  },
];

export function IntegrationStep({
  selectedIntegrations,
  onSelectIntegration,
  onNext,
  onBack,
}: IntegrationStepProps) {
  const canContinue = selectedIntegrations.length > 0;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">Choose Your Integrations</h2>
        <p className="text-lg text-gray-600">
          Select which platforms you want to connect (you can add more later)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {INTEGRATIONS.map((integration) => {
          const isSelected = selectedIntegrations.includes(integration.id);
          return (
            <button
              key={integration.id}
              onClick={() => onSelectIntegration(integration.id)}
              className={`relative p-6 rounded-lg border-2 transition-all text-left ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {integration.recommended && (
                <span className="absolute top-3 right-3 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">
                  Recommended
                </span>
              )}

              <div className="flex items-start gap-4">
                <div
                  className={`w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    integration.id === 'slack' ? 'bg-[#4A154B]' : 'bg-black'
                  }`}
                >
                  {integration.logo}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-semibold text-gray-900">{integration.name}</h3>
                    {isSelected && <CheckIcon className="h-5 w-5 text-indigo-600" />}
                  </div>
                  <p className="text-sm text-gray-600">{integration.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-6 py-3 text-gray-700 hover:text-gray-900 transition-colors font-medium"
        >
          Back
        </button>

        <button
          onClick={onNext}
          disabled={!canContinue}
          className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
