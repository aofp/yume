/**
 * Provider configuration service
 * Manages which providers are enabled and their settings
 */

import { PROVIDERS, type ProviderType } from '../config/models';
import { FEATURE_FLAGS } from '../config/features';
import { invoke } from './tauriApi';

// check if a provider is available based on feature flags
function isProviderFeatureAvailable(providerId: ProviderType): boolean {
  if (providerId === 'gemini') return FEATURE_FLAGS.PROVIDER_GEMINI_AVAILABLE;
  if (providerId === 'openai') return FEATURE_FLAGS.PROVIDER_OPENAI_AVAILABLE;
  return true; // claude always available
}

const STORAGE_KEY = 'yume_enabled_providers';
type EnabledProvidersListener = () => void;
const enabledProviderListeners = new Set<EnabledProvidersListener>();

export interface ProviderSupportStatus {
  gemini: boolean;
  openai: boolean;
}

export interface EnabledProviders {
  claude: boolean;
  gemini: boolean;
  openai: boolean;
}

const DEFAULT_ENABLED_PROVIDERS: EnabledProviders = PROVIDERS.reduce<EnabledProviders>(
  (acc, provider) => {
    acc[provider.id] = provider.enabled;
    return acc;
  },
  {
    claude: true,
    gemini: false,
    openai: false,
  }
);

/**
 * Get enabled providers from localStorage
 * Respects feature flags - unavailable providers are forced off
 */
export function getEnabledProviders(): EnabledProviders {
  let result: EnabledProviders;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      result = JSON.parse(stored);
    } else {
      result = { ...DEFAULT_ENABLED_PROVIDERS };
    }
  } catch (e) {
    logger.error('Failed to load enabled providers:', e);
    result = { ...DEFAULT_ENABLED_PROVIDERS };
  }

  // force unavailable providers off
  if (!isProviderFeatureAvailable('gemini')) result.gemini = false;
  if (!isProviderFeatureAvailable('openai')) result.openai = false;

  return result;
}

function notifyEnabledProviders(): void {
  const snapshot = getEnabledProviders();
  enabledProviderListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      logger.warn('Error in enabled provider listener', e);
    }
  });
}

export function setEnabledProviders(enabled: EnabledProviders): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
  } catch (e) {
    logger.error('Failed to persist enabled providers:', e);
  }
  notifyEnabledProviders();
}

export function subscribeEnabledProviders(listener: EnabledProvidersListener): () => void {
  enabledProviderListeners.add(listener);
  listener();
  return () => {
    enabledProviderListeners.delete(listener);
  };
}

const DETECTED_KEY = 'yume_detected_providers';

interface DetectedProviders {
  gemini: boolean;
  openai: boolean;
}

function getDetectedProviders(): DetectedProviders {
  try {
    const stored = localStorage.getItem(DETECTED_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    // ignore
  }
  return { gemini: false, openai: false };
}

function setDetectedProviders(detected: DetectedProviders): void {
  try {
    localStorage.setItem(DETECTED_KEY, JSON.stringify(detected));
  } catch (e) {
    logger.error('Failed to persist detected providers:', e);
  }
}

export async function ensureProviderDefaults(): Promise<void> {
  const hasStoredPrefs = localStorage.getItem(STORAGE_KEY);

  try {
    const support = await invoke<ProviderSupportStatus>('detect_provider_support');
    const previouslyDetected = getDetectedProviders();
    const current = getEnabledProviders();

    // Auto-enable newly detected providers (only if feature flag allows)
    let updated = false;
    if (support.gemini && !previouslyDetected.gemini && isProviderFeatureAvailable('gemini')) {
      current.gemini = true;
      updated = true;
    }
    if (support.openai && !previouslyDetected.openai && isProviderFeatureAvailable('openai')) {
      current.openai = true;
      updated = true;
    }

    // Update what we've detected so we don't auto-enable again
    setDetectedProviders({
      gemini: support.gemini || previouslyDetected.gemini,
      openai: support.openai || previouslyDetected.openai,
    });

    // If first time or we enabled something new, save
    if (!hasStoredPrefs || updated) {
      setEnabledProviders(current);
    }
  } catch (error) {
    logger.warn('Failed to detect provider support; falling back to defaults', error);
    // If no stored prefs, use defaults
    if (!hasStoredPrefs) {
      setEnabledProviders(DEFAULT_ENABLED_PROVIDERS);
    }
  }
}

/**
 * Enable/disable a specific provider
 */
export function setProviderEnabled(provider: ProviderType, enabled: boolean): void {
  const current = getEnabledProviders();
  current[provider] = enabled;
  setEnabledProviders(current);
}

/**
 * Check if a provider is enabled
 */
export function isProviderEnabled(provider: ProviderType): boolean {
  return getEnabledProviders()[provider] || false;
}

/**
 * Get list of enabled provider IDs
 */
export function getEnabledProviderList(): ProviderType[] {
  const enabled = getEnabledProviders();
  return (Object.keys(enabled) as ProviderType[]).filter((p) => enabled[p]);
}

/**
 * Get providers that are enabled with their full definitions
 */
export function getEnabledProviderDefinitions() {
  const enabled = getEnabledProviders();
  return PROVIDERS.filter((p) => enabled[p.id]);
}

/**
 * Check if any non-Claude provider is enabled
 */
export function hasAlternativeProviders(): boolean {
  const enabled = getEnabledProviders();
  return enabled.gemini || enabled.openai;
}

/**
 * Check if at least one provider is enabled
 */
export function hasAnyProviderEnabled(): boolean {
  const enabled = getEnabledProviders();
  return enabled.claude || enabled.gemini || enabled.openai;
}

/**
 * Count enabled providers
 */
export function getEnabledProviderCount(): number {
  const enabled = getEnabledProviders();
  return (enabled.claude ? 1 : 0) + (enabled.gemini ? 1 : 0) + (enabled.openai ? 1 : 0);
}
