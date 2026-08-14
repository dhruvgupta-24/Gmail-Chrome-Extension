import { AIProviderSettings } from '../types/ai';
import { DEFAULT_SETTINGS } from '../shared/constants';

export interface ExtendedSettings extends AIProviderSettings {
  googleClientId?: string;
  lastSyncTimestamp?: number;
}

const SETTINGS_KEY = 'gmail_ai_assistant_settings';

/**
 * Gets extension settings from chrome.storage.local with fallback to defaults.
 */
export async function getSettings(): Promise<ExtendedSettings> {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      // Local development or test fallback
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        resolve(raw ? JSON.parse(raw) : DEFAULT_SETTINGS);
      } catch {
        resolve(DEFAULT_SETTINGS);
      }
      return;
    }

    chrome.storage.local.get([SETTINGS_KEY], result => {
      if (result && result[SETTINGS_KEY]) {
        resolve({
          ...DEFAULT_SETTINGS,
          ...result[SETTINGS_KEY],
          ollama: { ...DEFAULT_SETTINGS.ollama, ...(result[SETTINGS_KEY].ollama || {}) },
          gemini: { ...DEFAULT_SETTINGS.gemini, ...(result[SETTINGS_KEY].gemini || {}) },
          openai: { ...DEFAULT_SETTINGS.openai, ...(result[SETTINGS_KEY].openai || {}) }
        });
      } else {
        resolve(DEFAULT_SETTINGS);
      }
    });
  });
}

/**
 * Saves extension settings to chrome.storage.local.
 */
export async function saveSettings(settings: Partial<ExtendedSettings>): Promise<void> {
  const current = await getSettings();
  const updated: ExtendedSettings = {
    ...current,
    ...settings,
    ollama: { ...current.ollama, ...(settings.ollama || {}) },
    gemini: { ...current.gemini, ...(settings.gemini || {}) },
    openai: { ...current.openai, ...(settings.openai || {}) }
  };

  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      } catch {}
      resolve();
      return;
    }

    chrome.storage.local.set({ [SETTINGS_KEY]: updated }, () => {
      resolve();
    });
  });
}
