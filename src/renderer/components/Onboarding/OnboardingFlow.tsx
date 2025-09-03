import React, { useState, useEffect } from 'react';
import { 
  IconCheck, 
  IconChevronRight, 
  IconChevronLeft,
  IconBrandVscode,
  IconFolder,
  IconRobot,
  IconBrain,
  IconSparkles,
  IconRocket,
  IconTerminal,
  IconSettings
} from '@tabler/icons-react';
import './OnboardingFlow.css';

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: () => void;
  actionLabel?: string;
  checks?: OnboardingCheck[];
}

interface OnboardingCheck {
  label: string;
  checked: boolean;
  required: boolean;
}

interface OnboardingFlowProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [claudeDetected, setClaudeDetected] = useState(false);
  const [checkingClaude, setCheckingClaude] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  // Check if user has seen onboarding before
  useEffect(() => {
    const seen = localStorage.getItem('yurucode_onboarding_complete') === 'true';
    setHasSeenOnboarding(seen);
    
    // Auto-skip if seen before and Claude is detected
    if (seen) {
      checkClaudeInstallation();
    }
  }, []);

  const checkClaudeInstallation = async () => {
    setCheckingClaude(true);
    try {
      // Check if Claude CLI is installed
      if (window.__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/core');
        const isInstalled = await invoke<boolean>('check_claude_cli');
        setClaudeDetected(isInstalled);
      } else {
        // For non-Tauri environments, check if server is running
        const serverPort = (window as any).claudeCodeClient?.getServerPort?.();
        setClaudeDetected(!!serverPort);
      }
    } catch (error) {
      console.error('Error checking Claude CLI:', error);
      setClaudeDetected(false);
    } finally {
      setCheckingClaude(false);
      
      // Auto-skip if seen before and Claude is working
      if (hasSeenOnboarding && claudeDetected) {
        handleComplete();
      }
    }
  };

  const steps: OnboardingStep[] = [
    {
      title: 'Welcome to Yurucode',
      description: 'A powerful GUI for Claude Code with intelligent context management. Let\'s get you set up in just a few steps.',
      icon: <IconSparkles size={48} stroke={1.5} />,
      actionLabel: 'Get Started',
      action: () => setCurrentStep(1)
    },
    {
      title: 'Check Claude CLI Installation',
      description: claudeDetected 
        ? 'Great! Claude CLI is installed and ready to use.'
        : 'Claude CLI needs to be installed to use Yurucode. Please install it from the Claude website.',
      icon: <IconTerminal size={48} stroke={1.5} />,
      checks: [
        {
          label: 'Claude CLI installed',
          checked: claudeDetected,
          required: true
        },
        {
          label: 'API key configured',
          checked: claudeDetected, // Assume configured if CLI is detected
          required: true
        }
      ],
      actionLabel: claudeDetected ? 'Next' : 'Check Again',
      action: claudeDetected ? () => setCurrentStep(2) : checkClaudeInstallation
    },
    {
      title: 'Key Features',
      description: 'Yurucode offers unique features to enhance your Claude Code experience:',
      icon: <IconBrain size={48} stroke={1.5} />,
      checks: [
        {
          label: 'Auto-compact at 97% context usage',
          checked: true,
          required: false
        },
        {
          label: 'Accurate token tracking with costs',
          checked: true,
          required: false
        },
        {
          label: 'Multi-tab session management',
          checked: true,
          required: false
        },
        {
          label: 'Project folder integration',
          checked: true,
          required: false
        }
      ],
      actionLabel: 'Next',
      action: () => setCurrentStep(3)
    },
    {
      title: 'Quick Start Guide',
      description: 'Here\'s how to get started with your first session:',
      icon: <IconRocket size={48} stroke={1.5} />,
      checks: [
        {
          label: 'Click + to create a new session',
          checked: false,
          required: false
        },
        {
          label: 'Drop a folder to set project context',
          checked: false,
          required: false
        },
        {
          label: 'Type your message and press Enter',
          checked: false,
          required: false
        },
        {
          label: 'Use @ to mention files',
          checked: false,
          required: false
        }
      ],
      actionLabel: 'Next',
      action: () => setCurrentStep(4)
    },
    {
      title: 'Customize Your Experience',
      description: 'Make Yurucode your own with these customization options:',
      icon: <IconSettings size={48} stroke={1.5} />,
      checks: [
        {
          label: 'Choose your accent color',
          checked: false,
          required: false
        },
        {
          label: 'Select preferred fonts',
          checked: false,
          required: false
        },
        {
          label: 'Configure keyboard shortcuts',
          checked: false,
          required: false
        },
        {
          label: 'Set up system prompts',
          checked: false,
          required: false
        }
      ],
      actionLabel: 'Finish Setup',
      action: handleComplete
    }
  ];

  function handleComplete() {
    // Mark onboarding as complete
    localStorage.setItem('yurucode_onboarding_complete', 'true');
    localStorage.setItem('yurucode_onboarding_date', new Date().toISOString());
    onComplete();
  }

  function handleSkip() {
    // Mark as skipped but not complete
    localStorage.setItem('yurucode_onboarding_skipped', 'true');
    if (onSkip) {
      onSkip();
    } else {
      onComplete();
    }
  }

  const currentStepData = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  const canProceed = currentStep === 1 ? claudeDetected : true;

  // Don't show onboarding if already completed and Claude is working
  if (hasSeenOnboarding && claudeDetected && !checkingClaude) {
    return null;
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-container">
        <div className="onboarding-header">
          <div className="onboarding-progress">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`progress-dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              />
            ))}
          </div>
          {currentStep > 0 && (
            <button 
              className="onboarding-skip"
              onClick={handleSkip}
            >
              Skip Setup
            </button>
          )}
        </div>

        <div className="onboarding-content">
          <div className="onboarding-icon">
            {currentStepData.icon}
          </div>
          
          <h2 className="onboarding-title">
            {currentStepData.title}
          </h2>
          
          <p className="onboarding-description">
            {currentStepData.description}
          </p>

          {currentStepData.checks && (
            <div className="onboarding-checklist">
              {currentStepData.checks.map((check, index) => (
                <div 
                  key={index}
                  className={`check-item ${check.checked ? 'checked' : ''} ${check.required ? 'required' : ''}`}
                >
                  <div className="check-icon">
                    {check.checked ? (
                      <IconCheck size={16} stroke={2} />
                    ) : (
                      <div className="check-empty" />
                    )}
                  </div>
                  <span className="check-label">
                    {check.label}
                    {check.required && !check.checked && (
                      <span className="required-badge">Required</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {currentStep === 1 && checkingClaude && (
            <div className="checking-status">
              <div className="spinner" />
              <span>Checking Claude CLI installation...</span>
            </div>
          )}
        </div>

        <div className="onboarding-actions">
          {!isFirstStep && (
            <button 
              className="onboarding-btn secondary"
              onClick={() => setCurrentStep(currentStep - 1)}
            >
              <IconChevronLeft size={18} stroke={2} />
              Back
            </button>
          )}
          
          {currentStepData.action && (
            <button 
              className={`onboarding-btn primary ${!canProceed ? 'disabled' : ''}`}
              onClick={currentStepData.action}
              disabled={!canProceed || checkingClaude}
            >
              {currentStepData.actionLabel || 'Continue'}
              {!isLastStep && <IconChevronRight size={18} stroke={2} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};