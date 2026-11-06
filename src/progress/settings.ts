import { signal } from '@preact/signals';
import { readItem, writeItem } from './safe-storage';

export interface Settings {
  /** stop every animation and transition */
  still: boolean;
  theme: 'auto' | 'light' | 'dark';
}

const KEY = 'unimech:settings';
const defaults: Settings = { still: false, theme: 'auto' };

function load(): Settings {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = readItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export const settings = signal<Settings>(load());

function apply(s: Settings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.still = s.still ? '1' : '0';
  if (s.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = s.theme;
}

export function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch };
  writeItem(KEY, JSON.stringify(settings.value));
  apply(settings.value);
  window.dispatchEvent(new CustomEvent('unimech:settings', { detail: settings.value }));
}

/** True when nothing should move: the reader's still mode or the OS reduced-motion setting. */
export function motionAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (settings.value.still) return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

if (typeof window !== 'undefined') {
  window.addEventListener('unimech:settings', (e) => {
    const detail = (e as CustomEvent<Settings>).detail;
    if (detail !== settings.value) settings.value = detail;
  });
}
