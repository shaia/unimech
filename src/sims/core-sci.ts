/**
 * Number formatting for the lesson 1.10 / 1.11 figures: like `sci`, but values from 1000 to 9999
 * are written as a·10³ (e.g. "8·10³ N/C"), matching how those lessons' text writes field values.
 */
import { sci, superscript } from './core/format';

export function sciFull(x: number, sig = 3): string {
  const ax = Math.abs(x);
  if (ax >= 1e3 && ax < 1e4) {
    const m = (x / 1e3).toPrecision(sig);
    return `${m.includes('.') ? m.replace(/\.?0+$/, '') : m}·10${superscript(3)}`;
  }
  return sci(x, sig);
}
