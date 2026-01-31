import { useState, useEffect } from 'react';
import { request } from '../api/client';

export interface OnboardingStatusResponse {
  complete: boolean;
  currentStep: number;
  integrations: {
    slack: 'connected' | 'pending';
    notion: 'connected' | 'pending';
  };
  hasWorkflows: boolean;
}

const CACHE_KEY = 'nubabel_onboarding_complete';
const CACHE_TIMESTAMP_KEY = 'nubabel_onboarding_timestamp';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to check onboarding completion status
 * Caches result in localStorage to avoid repeated API calls
 */
export function useOnboardingStatus() {
  const [isComplete, setIsComplete] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<OnboardingStatusResponse | null>(null);

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      setIsLoading(true);

      try {
        // Check cache first
        const cachedComplete = localStorage.getItem(CACHE_KEY);
        const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);

        if (cachedComplete && cachedTimestamp) {
          const timestamp = parseInt(cachedTimestamp, 10);
          const now = Date.now();

          // If cache is fresh and user completed onboarding, use cached value
          if (cachedComplete === 'true' && now - timestamp < CACHE_DURATION) {
            setIsComplete(true);
            setIsLoading(false);
            return;
          }
        }

        // Fetch fresh status from API
        const data = await request<OnboardingStatusResponse>({
          url: '/api/onboarding/status',
          method: 'GET',
        });

        setStatus(data);
        setIsComplete(data.complete);

        // Cache the result
        localStorage.setItem(CACHE_KEY, String(data.complete));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, String(Date.now()));
      } catch (error) {
        console.error('Failed to fetch onboarding status:', error);
        // On error, assume incomplete to be safe
        setIsComplete(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkOnboardingStatus();
  }, []);

  const refetch = async () => {
    // Clear cache and refetch
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);

    setIsLoading(true);
    try {
      const data = await request<OnboardingStatusResponse>({
        url: '/api/onboarding/status',
        method: 'GET',
      });

      setStatus(data);
      setIsComplete(data.complete);

      localStorage.setItem(CACHE_KEY, String(data.complete));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, String(Date.now()));
    } catch (error) {
      console.error('Failed to refetch onboarding status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isComplete,
    isLoading,
    status,
    refetch,
  };
}
