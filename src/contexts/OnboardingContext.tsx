import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type OnboardingStep = 'resume' | 'preferences' | 'complete';

interface OnboardingContextType {
  currentStep: OnboardingStep | null;
  setCurrentStep: (step: OnboardingStep | null) => void;
  showResumeDialog: boolean;
  showPreferencesDialog: boolean;
  openResumeDialog: () => void;
  openPreferencesDialog: () => void;
  closeDialogs: () => void;
  completeStep: (step: OnboardingStep) => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};

interface OnboardingProviderProps {
  children: ReactNode;
}

export const OnboardingProvider = ({ children }: OnboardingProviderProps) => {
  const [currentStep, setCurrentStep] = useState<OnboardingStep | null>(null);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [showPreferencesDialog, setShowPreferencesDialog] = useState(false);

  const openResumeDialog = useCallback(() => {
    setCurrentStep('resume');
    setShowResumeDialog(true);
    setShowPreferencesDialog(false);
  }, []);

  const openPreferencesDialog = useCallback(() => {
    setCurrentStep('preferences');
    setShowResumeDialog(false);
    setShowPreferencesDialog(true);
  }, []);

  const closeDialogs = useCallback(() => {
    setShowResumeDialog(false);
    setShowPreferencesDialog(false);
    setCurrentStep(null);
  }, []);

  const completeStep = useCallback((step: OnboardingStep) => {
    if (step === 'resume') {
      setShowResumeDialog(false);
      // Move to preferences step
      setTimeout(() => openPreferencesDialog(), 100);
    } else if (step === 'preferences') {
      setShowPreferencesDialog(false);
      setCurrentStep('complete');
    }
  }, [openPreferencesDialog]);

  return (
    <OnboardingContext.Provider
      value={{
        currentStep,
        setCurrentStep,
        showResumeDialog,
        showPreferencesDialog,
        openResumeDialog,
        openPreferencesDialog,
        closeDialogs,
        completeStep,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};