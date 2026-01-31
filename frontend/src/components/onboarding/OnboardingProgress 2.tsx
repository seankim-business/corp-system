interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
  completedSteps: number[];
}

export function OnboardingProgress({
  currentStep,
  totalSteps,
  completedSteps,
}: OnboardingProgressProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: totalSteps }).map((_, i) => {
        const isCompleted = completedSteps.includes(i);
        const isCurrent = i === currentStep;
        const isPast = i < currentStep;

        return (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-300 ${
              isCompleted || isPast
                ? 'w-8 bg-indigo-600'
                : isCurrent
                  ? 'w-8 bg-indigo-400 animate-pulse'
                  : 'w-2 bg-gray-300'
            }`}
          />
        );
      })}
    </div>
  );
}
