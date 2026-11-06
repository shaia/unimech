/**
 * localStorage that never throws. Private windows, blocked site data and previews can make
 * the accessor itself throw; the course must still render and work for the session.
 */

let available: boolean | null = null;
const memory = new Map<string, string>();

export function storageAvailable(): boolean {
  if (available !== null) return available;
  try {
    const k = '__unimech_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function readItem(key: string): string | null {
  try {
    if (storageAvailable()) return window.localStorage.getItem(key);
  } catch {
    /* fall through to memory */
  }
  return memory.get(key) ?? null;
}

export function writeItem(key: string, value: string): void {
  memory.set(key, value);
  try {
    if (storageAvailable()) window.localStorage.setItem(key, value);
  } catch {
    available = false;
  }
}

export function removeItem(key: string): void {
  memory.delete(key);
  try {
    if (storageAvailable()) window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
