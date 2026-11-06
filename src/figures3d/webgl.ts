/**
 * WebGL detection that does not load three.js, so a page can decide between the 3D figure and
 * its 2D fallback before downloading the 3D library.
 */

let cached: boolean | null = null;

export function webglAvailable(): boolean {
  if (cached !== null) return cached;
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    cached = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    cached = false;
  }
  return cached;
}
