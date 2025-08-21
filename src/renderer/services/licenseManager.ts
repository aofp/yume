/**
 * secure license management system for yurucode
 * handles trial mode, license validation, and feature restrictions
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export interface LicenseData {
  key: string;
  email?: string;
  activatedAt?: Date;
  expiresAt?: Date;
  type: 'trial' | 'personal' | 'team' | 'enterprise';
  features: LicenseFeatures;
  hardwareId?: string;
  activationCount?: number;
  maxActivations?: number;
}

export interface LicenseState {
  isLicensed: boolean;
  licenseData: LicenseData | null;
  lastValidationDate: Date | null;
  validationErrors: string[];
  offlineValidationToken?: string;
}

interface LicenseStore extends LicenseState {
  // actions
  validateLicense: (key: string) => Promise<boolean>;
  activateLicense: (key: string, email?: string) => Promise<boolean>;
  deactivateLicense: () => Promise<boolean>;
  getFeatures: () => LicenseFeatures;
  isFeatureEnabled: (feature: keyof LicenseFeatures) => boolean;
  refreshLicenseStatus: () => Promise<void>;
  setOfflineMode: (token: string) => Promise<void>;
  clearLicense: () => void;
}

// encryption keys (should be stored securely in production)
const ENCRYPTION_KEY = process.env.LICENSE_ENCRYPTION_KEY || 'yuru-code-2024-secure-key';
const VALIDATION_SALT = 'yurucode-license-validation-v1';

// simple hash function for browser
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// simple base64 encoding for storage
function simpleEncrypt(text: string, key: string): string {
  // simple xor-based obfuscation (not cryptographically secure, but good enough for local storage)
  const result = [];
  for (let i = 0; i < text.length; i++) {
    result.push(String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length)));
  }
  return btoa(result.join(''));
}

function simpleDecrypt(encoded: string, key: string): string {
  try {
    const text = atob(encoded);
    const result = [];
    for (let i = 0; i < text.length; i++) {
      result.push(String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length)));
    }
    return result.join('');
  } catch (e) {
    return '';
  }
}

// trial features
const TRIAL_FEATURES: LicenseFeatures = {
  maxTabs: 2,
  allowedModels: ['claude-3-5-sonnet-20241022'],
  maxTokensPerSession: 100000,
  watermarkEnabled: true,
  customThemes: false,
  exportEnabled: false,
  multipleProjects: false,
  prioritySupport: false
};

// licensed features
const LICENSED_FEATURES: LicenseFeatures = {
  maxTabs: 99,
  allowedModels: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
  maxTokensPerSession: -1, // unlimited
  watermarkEnabled: false,
  customThemes: true,
  exportEnabled: true,
  multipleProjects: true,
  prioritySupport: true
};

// hardware fingerprinting for license binding
async function getHardwareId(): Promise<string> {
  try {
    // combine multiple hardware identifiers
    const platform = navigator.platform || 'unknown';
    const vendor = navigator.vendor || 'unknown';
    const memory = (navigator as any).deviceMemory || 0;
    const cores = navigator.hardwareConcurrency || 0;
    const screenRes = `${screen.width}x${screen.height}`;
    const colorDepth = screen.colorDepth;
    
    // get webgl renderer info for gpu fingerprinting
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    let renderer = 'unknown';
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      }
    }
    
    // combine all identifiers
    const rawId = `${platform}-${vendor}-${memory}-${cores}-${screenRes}-${colorDepth}-${renderer}`;
    
    // hash for privacy
    return await sha256(rawId);
  } catch (e) {
    console.error('failed to generate hardware id:', e);
    return 'fallback-id';
  }
}

// license key validation
function validateKeyFormat(key: string): boolean {
  // format: XXXX-XXXX-XXXX-XXXX
  const keyPattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return keyPattern.test(key);
}

// offline license validation using cryptographic signatures
async function generateOfflineToken(licenseData: LicenseData): Promise<string> {
  const payload = {
    key: licenseData.key,
    email: licenseData.email,
    type: licenseData.type,
    hardwareId: licenseData.hardwareId,
    timestamp: Date.now()
  };
  
  const signature = await sha256(JSON.stringify(payload) + ENCRYPTION_KEY + VALIDATION_SALT);
  
  return btoa(JSON.stringify({ payload, signature }));
}

async function validateOfflineToken(token: string): Promise<boolean> {
  try {
    const decoded = JSON.parse(atob(token));
    const { payload, signature } = decoded;
    
    // check signature
    const expectedSignature = await sha256(JSON.stringify(payload) + ENCRYPTION_KEY + VALIDATION_SALT);
    
    if (signature !== expectedSignature) return false;
    
    // check timestamp (offline tokens valid for 30 days)
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - payload.timestamp > thirtyDaysMs) return false;
    
    return true;
  } catch (e) {
    return false;
  }
}

// encrypted local storage
function encryptData(data: any): string {
  return simpleEncrypt(JSON.stringify(data), ENCRYPTION_KEY);
}

function decryptData(encryptedData: string): any {
  try {
    const decrypted = simpleDecrypt(encryptedData, ENCRYPTION_KEY);
    return JSON.parse(decrypted);
  } catch (e) {
    return null;
  }
}

export const useLicenseStore = create<LicenseStore>()(
  persist(
    (set, get) => ({
      // initial state
      isLicensed: false,
      licenseData: null,
      lastValidationDate: null,
      validationErrors: [],
      offlineValidationToken: undefined,

      // validate license key
      validateLicense: async (key: string): Promise<boolean> => {
        // clear previous errors
        set({ validationErrors: [] });

        // special test key '1234' for development
        if (key === '1234') {
          const hardwareId = await getHardwareId();
          const licenseData: LicenseData = {
            key,
            email: 'test@yurucode.com',
            activatedAt: new Date(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
            type: 'personal',
            features: LICENSED_FEATURES,
            hardwareId,
            activationCount: 1,
            maxActivations: 3
          };

          // generate offline token
          const offlineToken = await generateOfflineToken(licenseData);

          set({
            isLicensed: true,
            licenseData,
            lastValidationDate: new Date(),
            offlineValidationToken: offlineToken
          });

          return true;
        }

        // validate format for real keys
        if (!validateKeyFormat(key)) {
          set({ validationErrors: ['invalid license key format'] });
          return false;
        }

        // hardcoded validation for testing
        // todo: replace with actual api call
        if (key === '1234-1234-1234-1234') {
          const hardwareId = await getHardwareId();
          const licenseData: LicenseData = {
            key,
            email: 'user@example.com',
            activatedAt: new Date(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
            type: 'personal',
            features: LICENSED_FEATURES,
            hardwareId,
            activationCount: 1,
            maxActivations: 3
          };

          // generate offline token
          const offlineToken = await generateOfflineToken(licenseData);

          set({
            isLicensed: true,
            licenseData,
            lastValidationDate: new Date(),
            offlineValidationToken: offlineToken
          });

          return true;
        }

        // actual validation would be here
        // try {
        //   const response = await fetch('https://api.yurucode.com/validate', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ key, hardwareId: await getHardwareId() })
        //   });
        //   ...
        // }

        set({ validationErrors: ['invalid license key'] });
        return false;
      },

      // activate license
      activateLicense: async (key: string, email?: string): Promise<boolean> => {
        const isValid = await get().validateLicense(key);
        if (isValid) {
          // persist activation
          return true;
        }
        return false;
      },

      // deactivate license
      deactivateLicense: async (): Promise<boolean> => {
        // todo: api call to deactivate on server
        set({
          isLicensed: false,
          licenseData: null,
          offlineValidationToken: undefined
        });
        return true;
      },

      // get current features
      getFeatures: (): LicenseFeatures => {
        const state = get();
        if (state.isLicensed && state.licenseData) {
          return state.licenseData.features;
        }
        return TRIAL_FEATURES;
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
        
        // check offline token first
        if (state.offlineValidationToken && !navigator.onLine) {
          const isValid = await validateOfflineToken(state.offlineValidationToken);
          if (!isValid) {
            set({
              isLicensed: false,
              licenseData: null,
              validationErrors: ['offline license token expired']
            });
          }
          return;
        }

        // revalidate with server
        if (state.licenseData?.key) {
          await get().validateLicense(state.licenseData.key);
        }
      },

      // set offline mode
      setOfflineMode: async (token: string) => {
        if (await validateOfflineToken(token)) {
          // extract license data from token
          const decoded = JSON.parse(atob(token));
          set({
            offlineValidationToken: token,
            isLicensed: true
          });
        }
      },

      // clear license
      clearLicense: () => {
        set({
          isLicensed: false,
          licenseData: null,
          offlineValidationToken: undefined,
          validationErrors: []
        });
      }
    }),
    {
      name: 'yurucode-license',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const encrypted = JSON.parse(str);
          return {
            state: decryptData(encrypted.state),
            version: encrypted.version
          };
        },
        setItem: (name, value) => {
          const encrypted = {
            state: encryptData(value.state),
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
}