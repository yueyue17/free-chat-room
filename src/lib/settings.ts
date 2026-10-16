import type { Settings } from '../types';

const KEY = 'ai-tavern.settings';

export const defaultSettings: Settings = {
  provider: 'mock',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.9,
  maxHistory: 40,
  worldBookBudget: 6000,
  userName: '我',
  userDescription: '',
  theme: 'mono',
  customCss: '',
};

export function loadSettings(): Settings {
  try {
    const merged = { ...defaultSettings, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
    // 旧版主题迁移：dark/light → 黑白极简
    if ((merged.theme as string) === 'dark' || (merged.theme as string) === 'light') merged.theme = 'mono';
    return merged;
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event('settings-changed'));
}

export function subscribeSettings(fn: () => void): () => void {
  window.addEventListener('settings-changed', fn);
  return () => window.removeEventListener('settings-changed', fn);
}
