import React, { useState, useEffect } from 'react';
import { IconCheck, IconRefresh } from '@tabler/icons-react';
import { PROVIDERS, type ProviderType } from '../../config/models';
import {
  getEnabledProviders,
  setProviderEnabled,
  hasAnyProviderEnabled,
  subscribeEnabledProviders,
  type EnabledProviders,
} from '../../services/providersService';
import { invoke } from '@tauri-apps/api/core';
import './NoProviderModal.css';

interface CliStatus {
  installed: boolean;
  checking: boolean;
}

export const NoProviderModal: React.FC = () => {
  const [enabledProviders, setEnabledProvidersState] = useState<EnabledProviders>(
    getEnabledProviders()
  );
  const [cliStatuses, setCliStatuses] = useState<Record<ProviderType, CliStatus>>({
    claude: { installed: false, checking: false },
    gemini: { installed: false, checking: false },
    openai: { installed: false, checking: false },
  });
  const [hasProvider, setHasProvider] = useState(hasAnyProviderEnabled());

  // Subscribe to provider changes
  useEffect(() => {
    const unsubscribe = subscribeEnabledProviders(() => {
      setEnabledProvidersState(getEnabledProviders());
      setHasProvider(hasAnyProviderEnabled());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    checkAllCli();
  }, []);

  const checkAllCli = async () => {
    for (const provider of PROVIDERS) {
      await checkCli(provider.id);
    }
  };

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

    if (!currentlyEnabled && !isInstalled) return;

    const newEnabled = !currentlyEnabled;
    setProviderEnabled(providerId, newEnabled);
  };

  // Don't render if a provider is enabled
  if (hasProvider) return null;

  return (
    <div className="no-provider-overlay" onContextMenu={(e) => e.preventDefault()}>
      <div className="no-provider-modal">
        <div className="no-provider-header" onContextMenu={(e) => e.preventDefault()}>
          <h3>select a provider</h3>
        </div>

        <div className="no-provider-content">
          <div className="no-provider-grid">
            {PROVIDERS.map((provider) => {
              const enabled = enabledProviders[provider.id];
              const status = cliStatuses[provider.id];
              const canToggle = enabled || status.installed;
              const isDisabled = !status.installed && !enabled;

              return (
                <div
                  key={provider.id}
                  className={`no-provider-card ${enabled ? 'enabled' : ''} ${isDisabled ? 'disabled-state' : ''}`}
                  onClick={() => canToggle && handleToggle(provider.id)}
                >
                  <span className="no-provider-card-name">{provider.name.toLowerCase()}</span>

                  <div className="no-provider-card-right">
                    {status.installed && (
                      <span className="no-provider-status installed">
                        <IconCheck size={10} />
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        checkCli(provider.id);
                      }}
                      disabled={status.checking}
                      className={`no-provider-refresh ${status.checking ? 'spinning' : ''}`}
                    >
                      <IconRefresh size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
