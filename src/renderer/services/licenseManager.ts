// SECURITY NOTE: see audit report for critical vulnerabilities

/**
 * license management for yume
 * demo: 2 tabs, 1 window
 * pro: unlimited tabs, unlimited windows
 */

import { create } from 'zustand';
import { appStorageKey } from '../config/app';
import { persist } from 'zustand/middleware';
import { logger } from '../utils/structuredLogger';

// license validation API endpoint
const VALIDATION_API_URL = 'https://yuru.be/api/license/validate.php';

// simple format check only - real validation is server-side
const LICENSE_FORMAT = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}(-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}){4}$/;

export interface LicenseFeatures {
  maxTabs: number;
  maxWindows: number;
}

export interface LicenseState {
  isLicensed: boolean;
  licenseKey: string | null;
  lastValidationDate: Date | null;
  validationErrors: string[];
  serverSignature: string | null;
  validationCache: {
    key: string;
    valid: boolean;
    timestamp: number;
  } | null;
}

interface LicenseStore extends LicenseState {
  // actions
  validateLicense: (key: string) => Promise<boolean>;
  activateLicense: (key: string) => Promise<boolean>;
  deactivateLicense: () => Promise<boolean>;
  getFeatures: () => LicenseFeatures;
  refreshLicenseStatus: () => Promise<void>;
  clearLicense: () => void;
}

// demo: 2 tabs, 1 window
const TRIAL_FEATURES: LicenseFeatures = {
  maxTabs: 2,
  maxWindows: 1
};

// pro: unlimited
const LICENSED_FEATURES: LicenseFeatures = {
  maxTabs: 99,
  maxWindows: 99
};

// basic format validation (client-side)
function validateLicenseFormat(key: string): boolean {
  if (!key || key.length !== 29) return false;
  return LICENSE_FORMAT.test(key.toUpperCase());
}

// server-side validation via API
async function validateLicenseWithServer(key: string): Promise<{
  valid: boolean;
  error?: string;
  signature?: string;
  timestamp?: number;
}> {
  try {
    // basic format check first
    if (!validateLicenseFormat(key)) {
      return { valid: false, error: 'Invalid format' };
    }

    // Prepare request body
    const requestBody = JSON.stringify({
      license_key: key.toUpperCase()
    });

    // call validation API with additional headers for production
    const response = await fetch(VALIDATION_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: requestBody,
      mode: 'cors',
      credentials: 'omit'
    });

    if (!response.ok) {
      if (response.status === 429) {
        return { valid: false, error: 'Rate limit exceeded. Please try again later.' };
      }
      return { valid: false, error: `Validation server error: ${response.status}` };
    }

    const responseText = await response.text();
    logger.info('[LICENSE] Raw server response:', { responseText });

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      logger.info('[LICENSE] Failed to parse JSON');
      return { valid: false, error: 'Invalid server response' };
    }

    logger.info('[LICENSE] Parsed result:', { result });
    return {
      valid: result.valid === true,
      error: result.error,
      signature: result.signature,
      timestamp: result.validated_at
    };
  } catch (error: unknown) {
    // fallback to cached validation if available
    const cached = useLicenseStore.getState().validationCache;
    if (cached && cached.key === key) {
      const cacheAge = Date.now() - cached.timestamp;
      if (cacheAge < 5 * 60 * 1000) { // 5 minutes cache
        return { valid: cached.valid };
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown';
    return { valid: false, error: `Network error: ${errorMessage}` };
  }
}

// simple encryption for local storage
const STORAGE_KEY = 'yuru>code>2024';

function encrypt(text: string): string {
  const result = [];
  for (let i = 0; i < text.length; i++) {
    result.push(String.fromCharCode(text.charCodeAt(i) ^ STORAGE_KEY.charCodeAt(i % STORAGE_KEY.length)));
  }
  return btoa(result.join(''));
}

function decrypt(encoded: string): string {
  try {
    const text = atob(encoded);
    const result = [];
    for (let i = 0; i < text.length; i++) {
      result.push(String.fromCharCode(text.charCodeAt(i) ^ STORAGE_KEY.charCodeAt(i % STORAGE_KEY.length)));
    }
    return result.join('');
  } catch (e) {
    return '';
  }
}

export const useLicenseStore = create<LicenseStore>()(
  persist(
    (set, get) => ({
      // initial state
      isLicensed: false,
      licenseKey: null,
      lastValidationDate: null,
      validationErrors: [],
      serverSignature: null,
      validationCache: null,

      // validate license key
      validateLicense: async (key: string): Promise<boolean> => {
        // clear previous errors
        set({ validationErrors: [] });

        // validate with server
        const result = await validateLicenseWithServer(key);
        logger.info('[LICENSE] Validation result:', { result: JSON.stringify(result) });

        if (result.valid) {
          set({
            isLicensed: true,
            licenseKey: key,
            lastValidationDate: new Date(),
            validationErrors: [],
            serverSignature: result.signature || null,
            validationCache: {
              key: key,
              valid: true,
              timestamp: Date.now()
            }
          });
          return true;
        }

        set({ 
          validationErrors: [result.error || 'Invalid license key'],
          isLicensed: false,
          licenseKey: null,
          serverSignature: null
        });
        return false;
      },

      // activate license
      activateLicense: async (key: string): Promise<boolean> => {
        return await get().validateLicense(key);
      },

      // deactivate license
      deactivateLicense: async (): Promise<boolean> => {
        set({
          isLicensed: false,
          licenseKey: null,
          validationErrors: [],
          serverSignature: null,
          validationCache: null
        });
        return true;
      },

      // get current features
      getFeatures: (): LicenseFeatures => {
        const state = get();
        return state.isLicensed ? LICENSED_FEATURES : TRIAL_FEATURES;
      },

      // refresh license status
      refreshLicenseStatus: async () => {
        const state = get();
        
        // revalidate stored key with server
        if (state.licenseKey) {
          const result = await validateLicenseWithServer(state.licenseKey);
          if (!result.valid) {
            set({
              isLicensed: false,
              licenseKey: null,
              validationErrors: ['License validation failed'],
              serverSignature: null
            });
          } else {
            // update cache
            set({
              lastValidationDate: new Date(),
              serverSignature: result.signature || null,
              validationCache: {
                key: state.licenseKey,
                valid: true,
                timestamp: Date.now()
              }
            });
          }
        }
      },

      // clear license
      clearLicense: () => {
        set({
          isLicensed: false,
          licenseKey: null,
          validationErrors: [],
          lastValidationDate: null,
          serverSignature: null,
          validationCache: null
        });
      }
    }),
    {
      name: appStorageKey('license-v3'),
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          try {
            const encrypted = JSON.parse(str);
            return {
              state: JSON.parse(decrypt(encrypted.state)),
              version: encrypted.version
            };
          } catch (e) {
            return null;
          }
        },
        setItem: (name, value) => {
          const encrypted = {
            state: encrypt(JSON.stringify(value.state)),
            version: value.version
          };
          localStorage.setItem(name, JSON.stringify(encrypted));
        },
        removeItem: (name) => localStorage.removeItem(name)
      }
    }
  )
);

// auto-check license status on load
if (typeof window !== 'undefined') {
  setTimeout(() => {
    useLicenseStore.getState().refreshLicenseStatus();
  }, 100);
  
  // periodic revalidation (every 30 minutes)
  setInterval(() => {
    useLicenseStore.getState().refreshLicenseStatus();
  }, 30 * 60 * 1000);
}
