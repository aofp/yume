import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ProviderCliModal } from './ProviderCliModal';
import './ProviderCliSelector.css';

type ProviderType = 'gemini' | 'openai';

interface ProviderCliSelectorProps {
  provider: ProviderType;
  cliCommand: string;
  onSettingsChange?: (settings: ProviderCliSettings) => void;
}

export interface ProviderCliSettings {
  path: string;
  version: string;
}

const STORAGE_KEY_PREFIX = 'yume_provider_cli_';

export const ProviderCliSelector: React.FC<ProviderCliSelectorProps> = ({
  provider,
  cliCommand,
  onSettingsChange,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [cliInfo, setCliInfo] = useState<{ path: string; version: string }>({ path: '', version: '' });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadCliInfo();
  }, [provider]);

  const loadCliInfo = async () => {
    // try to load cached info first
    const cached = localStorage.getItem(`${STORAGE_KEY_PREFIX}${provider}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setCliInfo(parsed);
      } catch {}
    }

    // fetch fresh info using existing check_cli_installed command
    setIsLoading(true);
    try {
      const result = await invoke<{ installed: boolean; path?: string; version?: string | null }>('check_cli_installed', {
        cliName: cliCommand,
      });
      const info = {
        path: result.path || '',
        version: result.version || '',
      };
      setCliInfo(info);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${provider}`, JSON.stringify(info));
      onSettingsChange?.(info);
    } catch {
      // keep cached info if fetch fails
    } finally {
      setIsLoading(false);
    }
  };

  const getDisplayText = () => {
    if (isLoading) return 'checking...';
    if (cliInfo.version) return `v${cliInfo.version}`;
    if (cliInfo.path) return 'installed';
    return 'not found';
  };

  const getLabel = () => {
    return provider === 'openai' ? 'codex cli' : `${provider} cli`;
  };

  return (
    <>
      <div className="provider-cli-setting">
        <span className="provider-cli-label">{getLabel()}</span>
        <div className="provider-cli-button-container">
          <button
            className="provider-cli-selector-button"
            onClick={() => setShowModal(true)}
            title={cliInfo.path || `${cliCommand} CLI configuration`}
          >
            {getDisplayText()}
          </button>
        </div>
      </div>

      {showModal && (
        <ProviderCliModal
          provider={provider}
          cliCommand={cliCommand}
          cliInfo={cliInfo}
          onClose={() => setShowModal(false)}
          onRefresh={loadCliInfo}
          isLoading={isLoading}
        />
      )}
    </>
  );
};
