/** Number formatting for readouts: scientific notation the way the Bagrut writes it (4·10⁵). */

const SUP: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

export const superscript = (n: number | string) =>
  String(n)
    .split('')
    .map((c) => SUP[c] ?? c)
    .join('');

/** 3 significant figures; plain decimals between 0.01 and 10⁴, otherwise a·10ⁿ. */
export function sci(x: number, sig = 3): string {
  if (!Number.isFinite(x)) return '∞';
  if (x === 0) return '0';
  const ax = Math.abs(x);
  // round first: 9999 at 3 figures is 10⁴ and belongs in the exponent branch
  const r = Number(x.toPrecision(sig));
  if (ax >= 0.01 && Math.abs(r) < 1e4) {
    // toPrecision writes "5.00e+3" once the integer part has more digits than `sig`
    return Math.abs(r) >= 10 ** sig ? String(r) : trim(r.toPrecision(sig));
  }
  const exp = Math.floor(Math.log10(ax));
  const mant = x / 10 ** exp;
  const m = trim(mant.toPrecision(sig));
  if (m === '10' || m === '-10') return `${m === '10' ? '1' : '-1'}·10${superscript(exp + 1)}`;
  return `${m}·10${superscript(exp)}`;
}

function trim(s: string) {
  return s.includes('.') && !s.includes('e') ? s.replace(/\.?0+$/, '') : s;
}

/** Format a charge in micro-coulombs, the unit lessons use. */
export const microC = (q: number) => `${trim((q * 1e6).toFixed(1))} μC`;

/** Compass name of a direction angle, in Hebrew, for screen readers and lens cards. */
export function directionHe(rad: number): string {
  const names = ['ימינה', 'ימינה-למעלה', 'למעלה', 'שמאלה-למעלה', 'שמאלה', 'שמאלה-למטה', 'למטה', 'ימינה-למטה'];
  const i = Math.round(((rad + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8;
  return names[i];
}

/**
 * The number m·10ᵉ written out in full ("0.000015", "3,000,000"), from the digits of m, so no
 * floating-point noise creeps in. m is a short decimal such as 1.5; thousands get commas.
 */
export function decimalOf(m: number, e: number): string {
  const [int, frac = ''] = String(Math.abs(m)).split('.');
  const digits = (int + frac).replace(/^0+/, '') || '0';
  // position of the decimal point, counted from the first significant digit
  const point = int.replace(/^0+/, '').length + e;
  let out: string;
  if (point <= 0) out = `0.${'0'.repeat(-point)}${digits}`;
  else if (point >= digits.length) out = digits + '0'.repeat(point - digits.length);
  else out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  const [i, f] = out.split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (m < 0 ? '−' : '') + (f ? `${grouped}.${f}` : grouped);
}

/** SI prefixes by power of ten. */
export const PREFIXES: Record<number, string> = { [-12]: 'p', [-9]: 'n', [-6]: 'μ', [-3]: 'm', 0: '', 3: 'k', 6: 'M', 9: 'G' };

/** m·10ᵉ with the prefix that leaves a number from 1 to 999: (1.5, −5, 'C') → "15 μC". */
export function prefixed(m: number, e: number, unit: string): string {
  const pe = Math.max(-12, Math.min(9, 3 * Math.floor(e / 3)));
  return `${decimalOf(m, e - pe)} ${PREFIXES[pe]}${unit}`;
}
