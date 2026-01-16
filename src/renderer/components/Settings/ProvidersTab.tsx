import React, { useState, useEffect } from 'react';
import { IconCheck } from '@tabler/icons-react';
import { PROVIDERS, type ProviderType, type ProviderDefinition, getProviderForModel, getDefaultModelForProvider, getModelsForProvider } from '../../config/models';
import {
  getEnabledProviders,
  setProviderEnabled,
  getEnabledProviderCount,
  type EnabledProviders,
} from '../../services/providersService';
import { invoke } from '@tauri-apps/api/core';
import { ClaudeSelector } from './ClaudeSelector';
import { SystemPromptSelector } from './SystemPromptSelector';
import { ProviderCliSelector } from './ProviderCliSelector';
import { ProviderSystemPromptSelector } from './ProviderSystemPromptSelector';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { FEATURE_FLAGS } from '../../config/features';
import './ProvidersTab.css';

// check if a provider is available based on feature flags
function isProviderAvailable(providerId: ProviderType): boolean {
  if (providerId === 'gemini') return FEATURE_FLAGS.PROVIDER_GEMINI_AVAILABLE;
  if (providerId === 'openai') return FEATURE_FLAGS.PROVIDER_OPENAI_AVAILABLE;
  return true; // claude always available
}

interface CliStatus {
  installed: boolean;
  checking: boolean;
}

export const ProvidersTab: React.FC = () => {
  const [enabledProviders, setEnabledProvidersState] = useState<EnabledProviders>(
    getEnabledProviders()
  );
  const [cliStatuses, setCliStatuses] = useState<Record<ProviderType, CliStatus>>({
    claude: { installed: false, checking: false },
    gemini: { installed: false, checking: false },
    openai: { installed: false, checking: false },
  });

  useEffect(() => {
    // Check each CLI independently without blocking - don't await
    PROVIDERS.forEach((provider) => checkCli(provider.id));
  }, []);

  const checkCli = async (providerId: ProviderType) => {
    setCliStatuses((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], checking: true },
    }));

    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (!provider) return;

    let installed = false;

    try {
      const result = await invoke<{ installed: boolean }>('check_cli_installed', {
        cliName: provider.cliCommand,
      });
      installed = result.installed;
    } catch {
      if (providerId === 'claude') {
        try {
          installed = await invoke<boolean>('check_claude_installed');
        } catch {}
      }
    }

    setCliStatuses((prev) => ({
      ...prev,
      [providerId]: { installed, checking: false },
    }));
  };

  const handleToggle = (providerId: ProviderType) => {
    const isInstalled = cliStatuses[providerId].installed;
    const currentlyEnabled = enabledProviders[providerId];

    // can't enable without CLI installed
    if (!currentlyEnabled && !isInstalled) return;

    // can't disable the last enabled provider
    const enabledCount = getEnabledProviderCount();
    if (currentlyEnabled && enabledCount <= 1) return;

    const newEnabled = !currentlyEnabled;
    setProviderEnabled(providerId, newEnabled);
    setEnabledProvidersState((prev) => ({
      ...prev,
      [providerId]: newEnabled,
    }));

    // if disabling a provider, check if current model belongs to it and switch
    if (!newEnabled) {
      const { selectedModel, setSelectedModel } = useClaudeCodeStore.getState();
      const currentProvider = getProviderForModel(selectedModel);
      if (currentProvider === providerId) {
        // find another enabled provider to switch to
        const updatedEnabled = { ...enabledProviders, [providerId]: false };
        const enabledProviderIds = (Object.keys(updatedEnabled) as ProviderType[]).filter(
          (p) => updatedEnabled[p]
        );
        if (enabledProviderIds.length > 0) {
          const newModel = getDefaultModelForProvider(enabledProviderIds[0]);
          setSelectedModel(newModel.id);
        }
      }
    }
  };


  return (
    <div className="providers-tab settings-section">
      <div className="settings-columns">
        {/* Left column: Providers */}
        <div className="settings-column">
          <h4>cli providers</h4>

          <div className="providers-grid">
            {PROVIDERS.map((provider) => {
              const available = isProviderAvailable(provider.id);
              const enabled = enabledProviders[provider.id];
              const status = cliStatuses[provider.id];
              const enabledCount = getEnabledProviderCount();
              const isLastEnabled = enabled && enabledCount <= 1;
              const canToggle = available && ((enabled && !isLastEnabled) || (!enabled && status.installed));
              const isDisabled = !available || (!status.installed && !enabled);

              return (
                <div
                  key={provider.id}
                  className={`provider-card ${enabled ? 'enabled' : ''} ${isDisabled ? 'disabled-state' : ''}`}
                  style={!available ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
                >
                  <div className="provider-card-left">
                    <span className="provider-card-name">{provider.name}</span>
                  </div>

                  <div className="provider-card-right">
                    {available && status.installed && (
                      <span className="provider-status installed">
                        <IconCheck size={10} />
                      </span>
                    )}

                    <div
                      className={`toggle-switch compact ${enabled ? 'active' : ''} ${!canToggle ? 'disabled' : ''} ${isLastEnabled ? 'last-enabled' : ''}`}
                      onClick={() => canToggle && handleToggle(provider.id)}
                      style={isLastEnabled || !available ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Show message when gemini/openai are unavailable */}
          {(!FEATURE_FLAGS.PROVIDER_GEMINI_AVAILABLE || !FEATURE_FLAGS.PROVIDER_OPENAI_AVAILABLE) && (
            <div className="provider-unavailable-notice">
              gemini and codex integration under development
            </div>
          )}
        </div>

        {/* Right column: Provider options */}
        <div className="settings-column">
          <h4>claude options</h4>
          <ClaudeSelector onSettingsChange={(settings) => {
            console.log('Claude settings updated:', settings);
          }} />
          <SystemPromptSelector onSettingsChange={(settings) => {
            console.log('System prompt settings updated:', settings);
          }} />

          {enabledProviders.gemini && (
            <>
              <h4 style={{ marginTop: '16px' }}>gemini options</h4>
              <ProviderCliSelector
                provider="gemini"
                cliCommand="gemini"
                onSettingsChange={(settings) => {
                  console.log('Gemini CLI settings updated:', settings);
                }}
              />
              <ProviderSystemPromptSelector
                provider="gemini"
                onSettingsChange={(settings) => {
                  console.log('Gemini prompt settings updated:', settings);
                }}
              />
            </>
          )}

          {enabledProviders.openai && (
            <>
              <h4 style={{ marginTop: '16px' }}>codex options</h4>
              <ProviderCliSelector
                provider="openai"
                cliCommand="codex"
                onSettingsChange={(settings) => {
                  console.log('Codex CLI settings updated:', settings);
                }}
              />
              <ProviderSystemPromptSelector
                provider="openai"
                onSettingsChange={(settings) => {
                  console.log('Codex prompt settings updated:', settings);
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
