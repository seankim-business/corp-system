import { useState, useEffect, useCallback } from 'react';
import { request } from '../api/client';

export interface OnboardingState {
  currentStep: number;
  completedSteps: number[];
  integrations: {
    slack: 'pending' | 'connected' | 'skipped';
    notion: 'pending' | 'connected' | 'skipped';
  };
  hasWorkflows: boolean;
  selectedIntegrations: ('slack' | 'notion')[];
}

export interface OnboardingStatus {
  complete: boolean;
  currentStep: number;
  integrations: {
    slack: 'connected' | 'pending';
    notion: 'connected' | 'pending';
  };
  hasWorkflows: boolean;
}

const STORAGE_KEY = 'nubabel_onboarding_state';

const DEFAULT_STATE: OnboardingState = {
  currentStep: 0,
  completedSteps: [],
  integrations: {
    slack: 'pending',
    notion: 'pending',
  },
  hasWorkflows: false,
  selectedIntegrations: [],
};

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return DEFAULT_STATE;
      }
    }
    return DEFAULT_STATE;
  });

  const [isLoading, setIsLoading] = useState(true);

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Fetch onboarding status from backend
  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await request<OnboardingStatus>({
        url: '/api/onboarding/status',
        method: 'GET',
      });

      setState((prev) => ({
        ...prev,
        integrations: {
          slack: data.integrations.slack === 'connected' ? 'connected' : prev.integrations.slack,
          notion: data.integrations.notion === 'connected' ? 'connected' : prev.integrations.notion,
        },
        hasWorkflows: data.hasWorkflows,
      }));
    } catch (error) {
      console.error('Failed to fetch onboarding status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const goToStep = useCallback((step: number) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  }, []);

  const nextStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: prev.currentStep + 1,
      completedSteps: [...new Set([...prev.completedSteps, prev.currentStep])],
    }));
  }, []);

  const previousStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(0, prev.currentStep - 1),
    }));
  }, []);

  const completeStep = useCallback((step: number) => {
    setState((prev) => ({
      ...prev,
      completedSteps: [...new Set([...prev.completedSteps, step])],
    }));
  }, []);

  const selectIntegration = useCallback((integration: 'slack' | 'notion') => {
    setState((prev) => {
      const selected = prev.selectedIntegrations.includes(integration)
        ? prev.selectedIntegrations.filter((i) => i !== integration)
        : [...prev.selectedIntegrations, integration];
      return { ...prev, selectedIntegrations: selected };
    });
  }, []);

  const skipIntegration = useCallback((integration: 'slack' | 'notion') => {
    setState((prev) => ({
      ...prev,
      integrations: {
        ...prev.integrations,
        [integration]: 'skipped',
      },
    }));
  }, []);

  const setIntegrationConnected = useCallback((integration: 'slack' | 'notion') => {
    setState((prev) => ({
      ...prev,
      integrations: {
        ...prev.integrations,
        [integration]: 'connected',
      },
    }));
  }, []);

  const setHasWorkflows = useCallback((hasWorkflows: boolean) => {
    setState((prev) => ({
      ...prev,
      hasWorkflows,
    }));
  }, []);

  const reset = useCallback(() => {
    setState(DEFAULT_STATE);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const isComplete = useCallback(() => {
    const hasAtLeastOneIntegration =
      state.integrations.slack === 'connected' || state.integrations.notion === 'connected';
    return hasAtLeastOneIntegration && state.hasWorkflows;
  }, [state]);

  return {
    state,
    isLoading,
    goToStep,
    nextStep,
    previousStep,
    completeStep,
    selectIntegration,
    skipIntegration,
    setIntegrationConnected,
    setHasWorkflows,
    reset,
    isComplete,
    fetchStatus,
  };
}
