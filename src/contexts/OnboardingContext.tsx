import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useInterestForm } from '@/contexts/InterestFormContext';

type OnboardingStep = 'interest' | 'resume' | 'preferences' | 'complete';

interface OnboardingContextType {
  currentStep: OnboardingStep | null;
  setCurrentStep: (step: OnboardingStep | null) => void;
  showInterestDialog: boolean;
  showResumeDialog: boolean;
  showPreferencesDialog: boolean;
  openInterestDialog: () => void;
  openResumeDialog: () => void;
  openPreferencesDialog: () => void;
  closeDialogs: () => void;
  completeStep: (step: OnboardingStep) => void;
  lastCompletedStep: OnboardingStep | null;
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
  const { showInterestForm, setShowInterestForm } = useInterestForm();
  const [currentStep, setCurrentStep] = useState<OnboardingStep | null>(null);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [showPreferencesDialog, setShowPreferencesDialog] = useState(false);
  const [lastCompletedStep, setLastCompletedStep] = useState<OnboardingStep | null>(null);

  const openInterestDialog = useCallback(() => {
    setCurrentStep('interest');
    setShowInterestForm(true);
    setShowResumeDialog(false);
    setShowPreferencesDialog(false);
  }, [setShowInterestForm]);

  const openResumeDialog = useCallback(() => {
    setCurrentStep('resume');
    setShowInterestForm(false);
    setShowResumeDialog(true);
    setShowPreferencesDialog(false);
  }, [setShowInterestForm]);

  const openPreferencesDialog = useCallback(() => {
    setCurrentStep('preferences');
    setShowInterestForm(false);
    setShowResumeDialog(false);
    setShowPreferencesDialog(true);
  }, [setShowInterestForm]);

  const closeDialogs = useCallback(() => {
    setShowInterestForm(false);
    setShowResumeDialog(false);
    setShowPreferencesDialog(false);
    setCurrentStep(null);
  }, [setShowInterestForm]);

  const completeStep = useCallback((step: OnboardingStep) => {
    setLastCompletedStep(step);

    if (step === 'interest') {
      setShowInterestForm(false);
      setTimeout(() => openResumeDialog(), 100);
    } else if (step === 'resume') {
      setShowResumeDialog(false);
      setTimeout(() => openPreferencesDialog(), 100);
    } else if (step === 'preferences') {
      setShowPreferencesDialog(false);
      setCurrentStep('complete');
    }
  }, [openPreferencesDialog, openResumeDialog, setShowInterestForm]);

  return (
    <OnboardingContext.Provider
      value={{
        currentStep,
        setCurrentStep,
        showInterestDialog: showInterestForm,
        showResumeDialog,
        showPreferencesDialog,
        openInterestDialog,
        openResumeDialog,
        openPreferencesDialog,
        closeDialogs,
        completeStep,
        lastCompletedStep,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};