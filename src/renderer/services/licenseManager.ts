/**
 * ultra-secure license management system for yurucode
 * server-side validation with HMAC signatures
 * no local validation logic exposed
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LATEST_MODELS, getModelByFamily } from '../config/models';

// license validation API endpoint
const VALIDATION_API_URL = 'https://yuru.be/api/license/validate.php';

// simple format check only - real validation is server-side
const LICENSE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const LICENSE_FORMAT = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}(-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}){4}$/;

export interface LicenseFeatures {
  maxTabs: number;
  allowedModels: string[];
  maxTokensPerSession: number;
  watermarkEnabled: boolean;
  customThemes: boolean;
  exportEnabled: boolean;
  multipleProjects: boolean;
  prioritySupport: boolean;
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
  isFeatureEnabled: (feature: keyof LicenseFeatures) => boolean;
  refreshLicenseStatus: () => Promise<void>;
  clearLicense: () => void;
}

// trial features - uses centralized model config
const TRIAL_FEATURES: LicenseFeatures = {
  maxTabs: 3,
  allowedModels: [getModelByFamily('sonnet')?.id].filter(Boolean) as string[],
  maxTokensPerSession: 100000,
  watermarkEnabled: true,
  customThemes: false,
  exportEnabled: false,
  multipleProjects: false,
  prioritySupport: false
};

// licensed features - all models available for pro
const LICENSED_FEATURES: LicenseFeatures = {
  maxTabs: 99,
  allowedModels: LATEST_MODELS.map(m => m.id),
  maxTokensPerSession: -1, // unlimited
  watermarkEnabled: false,
  customThemes: true,
  exportEnabled: true,
  multipleProjects: true,
  prioritySupport: true
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
      console.error('[License] Format validation failed for key:', key);
      return { valid: false, error: 'Invalid format' };
    }
    console.log('[License] Format valid, calling API...');
    console.log('[License] API URL:', VALIDATION_API_URL);
    console.log('[License] Key to validate:', key.toUpperCase());

    // Prepare request body
    const requestBody = JSON.stringify({
      license_key: key.toUpperCase()
    });
    console.log('[License] Request body:', requestBody);

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

    console.log('[License] Response status:', response.status);
    console.log('[License] Response headers:', response.headers);

    if (!response.ok) {
      console.error('[License] Response not OK:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('[License] Error response body:', errorText);
      
      if (response.status === 429) {
        return { valid: false, error: 'Rate limit exceeded. Please try again later.' };
      }
      return { valid: false, error: `Validation server error: ${response.status}` };
    }

    const responseText = await response.text();
    console.log('[License] Raw response:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[License] JSON parse error:', parseError);
      console.error('[License] Response text that failed to parse:', responseText);
      return { valid: false, error: 'Invalid server response' };
    }
    
    console.log('[License] Parsed API Response:', result);
    
    const validationResult = {
      valid: result.valid === true,
      error: result.error,
      signature: result.signature,
      timestamp: result.validated_at
    };
    console.log('[License] Returning validation result:', validationResult);
    return validationResult;
  } catch (error) {
    console.error('[License] License validation error:', error);
    console.error('[License] Error name:', error.name);
    console.error('[License] Error message:', error.message);
    console.error('[License] Error stack:', error.stack);
    
    // Check if it's a network error
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('[License] This appears to be a network/fetch error');
    }
    
    // fallback to cached validation if available
    const cached = useLicenseStore.getState().validationCache;
    if (cached && cached.key === key) {
      const cacheAge = Date.now() - cached.timestamp;
      if (cacheAge < 5 * 60 * 1000) { // 5 minutes cache
        console.log('[License] Using cached validation');
        return { valid: cached.valid };
      }
    }
    
    return { valid: false, error: `Network error: ${error.message}` };
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

      // check if feature is enabled
      isFeatureEnabled: (feature: keyof LicenseFeatures): boolean => {
        const features = get().getFeatures();
        const value = features[feature];
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value > 0;
        if (Array.isArray(value)) return value.length > 0;
        return false;
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
      name: 'yurucode-license-v3',
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