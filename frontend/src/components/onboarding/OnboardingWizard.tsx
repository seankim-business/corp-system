import { useOnboarding } from '../../hooks/useOnboarding';
import { OnboardingProgress } from './OnboardingProgress';
import { WelcomeStep } from './steps/WelcomeStep';
import { IntegrationStep } from './steps/IntegrationStep';
import { SlackConnectStep } from './steps/SlackConnectStep';
import { NotionConnectStep } from './steps/NotionConnectStep';
import { FirstWorkflowStep } from './steps/FirstWorkflowStep';
import { SuccessStep } from './steps/SuccessStep';

interface StepConfig {
  id: string;
  title: string;
  component: React.ComponentType<any>;
  optional?: boolean;
}

const STEPS: StepConfig[] = [
  { id: 'welcome', title: 'Welcome', component: WelcomeStep },
  { id: 'integrations', title: 'Choose Integrations', component: IntegrationStep },
  { id: 'slack', title: 'Connect Slack', component: SlackConnectStep, optional: true },
  { id: 'notion', title: 'Connect Notion', component: NotionConnectStep, optional: true },
  { id: 'workflow', title: 'First Workflow', component: FirstWorkflowStep },
  { id: 'success', title: 'Ready!', component: SuccessStep },
];

export function OnboardingWizard() {
  const {
    state,
    nextStep,
    previousStep,
    selectIntegration,
    skipIntegration,
    setIntegrationConnected,
    setHasWorkflows,
    goToStep,
  } = useOnboarding();

  const currentStepConfig = STEPS[state.currentStep];
  const StepComponent = currentStepConfig.component;

  // Determine which steps to show based on selected integrations
  const shouldShowSlackStep = state.selectedIntegrations.includes('slack');
  const shouldShowNotionStep = state.selectedIntegrations.includes('notion');

  const handleIntegrationNext = () => {
    // After integration selection, go to first selected integration
    if (shouldShowSlackStep) {
      goToStep(2); // Slack step
    } else if (shouldShowNotionStep) {
      goToStep(3); // Notion step
    } else {
      goToStep(4); // Skip to workflow creation
    }
  };

  const handleSlackNext = () => {
    if (shouldShowNotionStep && state.integrations.notion !== 'connected') {
      goToStep(3); // Go to Notion step
    } else {
      goToStep(4); // Skip to workflow creation
    }
  };

  const handleSlackSkip = () => {
    skipIntegration('slack');
    handleSlackNext();
  };

  const handleNotionNext = () => {
    goToStep(4); // Go to workflow creation
  };

  const handleNotionSkip = () => {
    skipIntegration('notion');
    handleNotionNext();
  };

  const handleSlackConnected = () => {
    setIntegrationConnected('slack');
  };

  const handleNotionConnected = () => {
    setIntegrationConnected('notion');
  };

  const handleWorkflowCreated = () => {
    setHasWorkflows(true);
  };

  const getStepProps = () => {
    switch (currentStepConfig.id) {
      case 'welcome':
        return {
          onNext: nextStep,
        };

      case 'integrations':
        return {
          selectedIntegrations: state.selectedIntegrations,
          onSelectIntegration: selectIntegration,
          onNext: handleIntegrationNext,
          onBack: previousStep,
        };

      case 'slack':
        return {
          onNext: handleSlackNext,
          onBack: previousStep,
          onSkip: handleSlackSkip,
          onConnected: handleSlackConnected,
        };

      case 'notion':
        return {
          onNext: handleNotionNext,
          onBack: previousStep,
          onSkip: handleNotionSkip,
          onConnected: handleNotionConnected,
        };

      case 'workflow':
        return {
          onNext: nextStep,
          onBack: previousStep,
          onWorkflowCreated: handleWorkflowCreated,
        };

      case 'success':
        return {
          integrations: state.integrations,
        };

      default:
        return {};
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Progress bar */}
        {state.currentStep < STEPS.length - 1 && (
          <div className="mb-12">
            <OnboardingProgress
              currentStep={state.currentStep}
              totalSteps={STEPS.length}
              completedSteps={state.completedSteps}
            />
            <p className="text-center text-sm text-gray-500 mt-3">
              Step {state.currentStep + 1} of {STEPS.length}: {currentStepConfig.title}
            </p>
          </div>
        )}

        {/* Step content */}
        <div className="animate-fade-in">
          <StepComponent {...getStepProps()} />
        </div>
      </div>
    </div>
  );
}
