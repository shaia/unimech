/**
 * Ink primitives for live figures. Physics data (field lines, vectors) is drawn crisp and
 * exact; only equipment gets the sketchy roughjs line. Charge sign is never colour-only:
 * every charge carries a + / − glyph as well.
 */

import type { Palette, View } from './canvas';

export interface ArrowStyle {
  color: string;
  width?: number;
  /** arrowhead length in CSS px */
  head?: number;
  alpha?: number;
  glow?: string;
}

export function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, s: ArrowStyle) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  const w = s.width ?? 2;
  const head = Math.min(s.head ?? 9, L * 0.6);
  const ux = dx / L;
  const uy = dy / L;
  ctx.save();
  ctx.globalAlpha = s.alpha ?? 1;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  if (s.glow) {
    ctx.shadowColor = s.glow;
    ctx.shadowBlur = 8;
  }
  const bx = x2 - ux * head * 0.8;
  const by = y2 - uy * head * 0.8;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(bx, by);
  ctx.stroke();
  const hw = head * 0.48;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * head - uy * hw, y2 - uy * head + ux * hw);
  ctx.lineTo(x2 - ux * head + uy * hw, y2 - uy * head - ux * hw);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A small open chevron along a line, pointing along (ux, uy); marks field-line direction. */
export function chevron(ctx: CanvasRenderingContext2D, x: number, y: number, ux: number, uy: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - ux * size - uy * size * 0.6, y - uy * size + ux * size * 0.6);
  ctx.lineTo(x, y);
  ctx.lineTo(x - ux * size + uy * size * 0.6, y - uy * size - ux * size * 0.6);
  ctx.stroke();
  ctx.restore();
}

export interface ChargeStyle {
  selected?: boolean;
  focused?: boolean;
  /** text under the disc, e.g. "+2 μC" */
  label?: string;
}

/** A charged sphere: glossy disc in the sign colour, a + / − glyph, optional label. */
export function chargeDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  q: number,
  p: Palette,
  s: ChargeStyle = {},
) {
  const color = q > 0 ? p.pos : q < 0 ? p.neg : p.ink3;
  ctx.save();
  // halo
  const halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.4);
  halo.addColorStop(0, withAlpha(color, 0.35));
  halo.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  // body
  const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  body.addColorStop(0, mix(color, '#ffffff', 0.55));
  body.addColorStop(1, color);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = s.selected ? 3 : 1.2;
  ctx.strokeStyle = s.selected ? p.ink : withAlpha('#000000', 0.25);
  ctx.stroke();
  if (s.focused) {
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = p.accent;
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // glyph
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.lineCap = 'round';
  const g = r * 0.45;
  ctx.beginPath();
  ctx.moveTo(x - g, y);
  ctx.lineTo(x + g, y);
  if (q > 0) {
    ctx.moveTo(x, y - g);
    ctx.lineTo(x, y + g);
  }
  ctx.stroke();
  if (s.label) {
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = p.ink2;
    ctx.fillText(s.label, x, y + r + 6);
  }
  ctx.restore();
}

/** Polyline in screen space with an optional glow and a moving dash for "flow". */
export function polyline(
  ctx: CanvasRenderingContext2D,
  pts: readonly (readonly [number, number])[],
  color: string,
  width: number,
  opts: { glow?: string; dash?: number[]; dashOffset?: number; alpha?: number } = {},
) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = 6;
  }
  if (opts.dash) {
    ctx.setLineDash(opts.dash);
    ctx.lineDashOffset = opts.dashOffset ?? 0;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.restore();
}

/** Faint dot grid, one dot per 10 cm, so distances can be read off the figure. */
export function paperGrid(ctx: CanvasRenderingContext2D, v: View, p: Palette, stepM = 0.1) {
  const step = stepM * v.ppm;
  if (step < 6) return;
  ctx.save();
  ctx.fillStyle = p.rule;
  const x0 = (v.w / 2 - v.ox * v.ppm) % step;
  const y0 = (v.h / 2 + v.oy * v.ppm) % step;
  for (let x = x0; x < v.w; x += step) {
    for (let y = y0; y < v.h; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Scale bar in the corner: "10 ס"מ" (LTR space, Hebrew label). */
export function scaleBar(ctx: CanvasRenderingContext2D, v: View, p: Palette, meters = 0.2, label = '20 ס"מ') {
  const L = meters * v.ppm;
  const x = 14;
  const y = v.h - 16;
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y);
  ctx.lineTo(x + L, y);
  ctx.lineTo(x + L, y - 4);
  ctx.stroke();
  ctx.font = `12px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.direction = 'rtl';
  ctx.fillText(label, x + L / 2, y - 5);
  ctx.restore();
}

/** Handwritten annotation (margin-note font). */
export function handNote(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, p: Palette, size = 15) {
  ctx.save();
  ctx.font = `500 ${size}px ${p.fontHand}`;
  ctx.fillStyle = p.hand;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* ---------- colour helpers (inputs are CSS hex or rgb[a]() tokens) ---------- */

function parse(c: string): [number, number, number, number] {
  const s = c.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const full = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
    const n = parseInt(full.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a] = m[1].split(',').map((x) => parseFloat(x));
    return [r, g, b, Number.isFinite(a) ? a : 1];
  }
  return [0, 0, 0, 1];
}

export function withAlpha(c: string, a: number): string {
  const [r, g, b] = parse(c);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function mix(c1: string, c2: string, t: number): string {
  const a = parse(c1);
  const b = parse(c2);
  const m = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${m(0)}, ${m(1)}, ${m(2)})`;
}

/**
 * A direction perpendicular to the page: ⊙ (out, the point of an arrow coming at you) or ⊗ (in,
 * its tail feathers). Drawn as a ring with a dot or a cross, so it never relies on colour alone.
 * Used for wires seen end-on (current) and for field regions (B).
 */
export function depthGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  dir: 'out' | 'in',
  color: string,
  opts: { fill?: string; width?: number; alpha?: number } = {},
) {
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = opts.width ?? Math.max(1.2, r * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (opts.fill) {
    ctx.fillStyle = opts.fill;
    ctx.fill();
    ctx.fillStyle = color;
  }
  ctx.stroke();
  if (dir === 'out') {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, r * 0.28), 0, Math.PI * 2);
    ctx.fill();
  } else {
    const d = r * 0.62;
    ctx.beginPath();
    ctx.moveTo(x - d, y - d);
    ctx.lineTo(x + d, y + d);
    ctx.moveTo(x - d, y + d);
    ctx.lineTo(x + d, y - d);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A uniform field perpendicular to the page over a screen rectangle: a lattice of small ⊙ or ⊗
 * marks (no ring), in the magnetic colour by default. `spacing` in CSS px.
 */
export function depthField(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  dir: 'out' | 'in',
  color: string,
  spacing = 28,
  alpha = 0.55,
) {
  const nx = Math.max(1, Math.floor(box.w / spacing));
  const ny = Math.max(1, Math.floor(box.h / spacing));
  const sx = box.w / nx;
  const sy = box.h / ny;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  const d = Math.min(sx, sy) * 0.14;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const cx = box.x + (i + 0.5) * sx;
      const cy = box.y + (j + 0.5) * sy;
      ctx.beginPath();
      if (dir === 'out') {
        ctx.arc(cx, cy, Math.max(1.4, d * 0.55), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(cx - d, cy - d);
        ctx.lineTo(cx + d, cy + d);
        ctx.moveTo(cx - d, cy + d);
        ctx.lineTo(cx + d, cy - d);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
