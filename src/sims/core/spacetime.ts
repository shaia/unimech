/**
 * Drawing a Minkowski (spacetime) diagram on a figure canvas, shared by chapter 9's figures so every diagram of the
 * chapter looks the same. World coordinates: x to the right, ct up, in ONE unit (the View's "metre" is that unit);
 * so a light signal is a 45° line. Conventions (CLAUDE.md, living-book rules): the axes and worldlines of S in ink,
 * light lines in --accent, the axes of the moving frame S′ in --velocity. Text on the canvas is LTR physics space.
 */

import type { Palette, View } from './canvas';
import { toScreen } from './canvas';
import { arrow, withAlpha } from './ink';
import { gammaOf } from '~/physics/relativity';

/** The visible world rectangle of a view: [xMin, xMax, ctMin, ctMax]. */
export function worldBounds(v: View): [number, number, number, number] {
  const hw = v.w / 2 / v.ppm;
  const hh = v.h / 2 / v.ppm;
  return [v.ox - hw, v.ox + hw, v.oy - hh, v.oy + hh];
}

/** Clip the infinite line through (x0, ct0) along (dx, dct) to the view; null if it misses. */
function clipLine(v: View, x0: number, ct0: number, dx: number, dct: number): [number, number, number, number] | null {
  const [xa, xb, ya, yb] = worldBounds(v);
  let lo = -Infinity;
  let hi = Infinity;
  const slab = (p: number, d: number, a: number, b: number): boolean => {
    if (Math.abs(d) < 1e-15) return p >= a && p <= b;
    let t1 = (a - p) / d;
    let t2 = (b - p) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    lo = Math.max(lo, t1);
    hi = Math.min(hi, t2);
    return lo <= hi;
  };
  if (!slab(x0, dx, xa, xb) || !slab(ct0, dct, ya, yb)) return null;
  return [x0 + lo * dx, ct0 + lo * dct, x0 + hi * dx, ct0 + hi * dct];
}

function line(ctx: CanvasRenderingContext2D, v: View, seg: [number, number, number, number]) {
  const [a, b] = toScreen(v, seg[0], seg[1]);
  const [c, d] = toScreen(v, seg[2], seg[3]);
  ctx.beginPath();
  ctx.moveTo(a, b);
  ctx.lineTo(c, d);
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, p: Palette, text: string, sx: number, sy: number, color: string, size = 13) {
  ctx.save();
  ctx.font = `600 ${size}px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, sx, sy);
  ctx.restore();
}

export interface AxesOptions {
  /** tick spacing in world units (default 1); 0 for none */
  tick?: number;
  /** axis labels (default 'x' and 'ct') */
  xLabel?: string;
  ctLabel?: string;
  /** faint grid of S at the tick spacing */
  grid?: boolean;
}

/** The axes of the rest frame S through the origin, with ticks and labels, and an optional faint grid. */
export function drawRestAxes(ctx: CanvasRenderingContext2D, v: View, p: Palette, o: AxesOptions = {}) {
  const tick = o.tick ?? 1;
  const [xa, xb, ya, yb] = worldBounds(v);
  ctx.save();
  if (o.grid && tick > 0 && tick * v.ppm >= 8) {
    ctx.strokeStyle = withAlpha(p.rule, 0.7);
    ctx.lineWidth = 1;
    for (let x = Math.ceil(xa / tick) * tick; x <= xb; x += tick) line(ctx, v, [x, ya, x, yb]);
    for (let y = Math.ceil(ya / tick) * tick; y <= yb; y += tick) line(ctx, v, [xa, y, xb, y]);
  }
  const [ox, oy] = toScreen(v, 0, 0);
  const [, top] = toScreen(v, 0, yb);
  const [right] = toScreen(v, xb, 0);
  const [left] = toScreen(v, xa, 0);
  const [, bottom] = toScreen(v, 0, ya);
  arrow(ctx, left, oy, right - 2, oy, { color: p.ink, width: 1.5, head: 8 });
  arrow(ctx, ox, bottom, ox, top + 2, { color: p.ink, width: 1.5, head: 8 });
  if (tick > 0 && tick * v.ppm >= 8) {
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.2;
    for (let x = Math.ceil(xa / tick) * tick; x <= xb; x += tick) {
      if (Math.abs(x) < tick / 2) continue;
      const [sx] = toScreen(v, x, 0);
      ctx.beginPath();
      ctx.moveTo(sx, oy - 4);
      ctx.lineTo(sx, oy + 4);
      ctx.stroke();
    }
    for (let y = Math.ceil(ya / tick) * tick; y <= yb; y += tick) {
      if (Math.abs(y) < tick / 2) continue;
      const [, sy] = toScreen(v, 0, y);
      ctx.beginPath();
      ctx.moveTo(ox - 4, sy);
      ctx.lineTo(ox + 4, sy);
      ctx.stroke();
    }
  }
  label(ctx, p, o.xLabel ?? 'x', right - 10, oy + 14, p.ink);
  label(ctx, p, o.ctLabel ?? 'ct', ox - 16, top + 12, p.ink);
  ctx.restore();
}

/** The two light lines x = ±c(t − t₀) through an event (default the origin), dashed, in --accent. */
export function drawLightLines(ctx: CanvasRenderingContext2D, v: View, p: Palette, at: [number, number] = [0, 0]) {
  ctx.save();
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  for (const s of [1, -1]) {
    const seg = clipLine(v, at[0], at[1], s, 1);
    if (seg) line(ctx, v, seg);
  }
  ctx.restore();
}

/** Shade the future and past light cones of an event (the region a signal at or below c can link to it). */
export function shadeLightCone(ctx: CanvasRenderingContext2D, v: View, p: Palette, at: [number, number] = [0, 0], alpha = 0.1) {
  const [xa, xb, ya, yb] = worldBounds(v);
  const big = Math.max(xb - xa, yb - ya) * 2;
  ctx.save();
  ctx.fillStyle = withAlpha(p.accent, alpha);
  for (const s of [1, -1]) {
    const pts = [at, [at[0] - big, at[1] + s * big], [at[0] + big, at[1] + s * big]].map(([x, y]) => toScreen(v, x, y));
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export interface PrimedOptions {
  /** tick spacing in primed units (default 1); ticks sit at the calibrated places (γβn, γn) and (γn, γβn) */
  tick?: number;
  /** labels (default "x′" and "ct′") */
  xLabel?: string;
  ctLabel?: string;
  /** colour (default --velocity) */
  color?: string;
  /** faint grid of S′: lines of constant x′ and constant ct′ */
  grid?: boolean;
}

/**
 * The axes of S′ (moving at β along +x) in the S diagram: the ct′ axis x = β·ct and the x′ axis ct = β·x, with
 * ticks spaced by the calibration hyperbolae (each primed unit is γ√(1 + β²) long on paper).
 */
export function drawPrimedAxes(ctx: CanvasRenderingContext2D, v: View, p: Palette, b: number, o: PrimedOptions = {}) {
  const g = gammaOf(b);
  const tick = o.tick ?? 1;
  const color = o.color ?? p.velocity;
  ctx.save();
  if (o.grid && tick > 0) {
    ctx.strokeStyle = withAlpha(color, 0.18);
    ctx.lineWidth = 1;
    const [xa, xb, ya, yb] = worldBounds(v);
    const span = Math.ceil((Math.max(Math.abs(xa), Math.abs(xb), Math.abs(ya), Math.abs(yb)) * 2 * g) / tick);
    for (let n = -span; n <= span; n++) {
      if (n === 0) continue;
      const k = n * tick;
      const s1 = clipLine(v, g * k, g * b * k, b, 1); // x′ = k: parallel to the ct′ axis
      if (s1) line(ctx, v, s1);
      const s2 = clipLine(v, g * b * k, g * k, 1, b); // ct′ = k: parallel to the x′ axis
      if (s2) line(ctx, v, s2);
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const ctAxis = clipLine(v, 0, 0, b, 1);
  const xAxis = clipLine(v, 0, 0, 1, b);
  if (ctAxis) line(ctx, v, ctAxis);
  if (xAxis) line(ctx, v, xAxis);
  if (tick > 0) {
    const [xa, xb, ya, yb] = worldBounds(v);
    const inside = (x: number, y: number) => x >= xa && x <= xb && y >= ya && y <= yb;
    const n = Math.ceil((Math.max(Math.abs(xa), Math.abs(xb), Math.abs(ya), Math.abs(yb)) * 2) / tick);
    for (let k = -n; k <= n; k++) {
      if (k === 0) continue;
      const q = k * tick;
      for (const [x, y, px, py] of [
        [g * b * q, g * q, 1, b],
        [g * q, g * b * q, b, 1],
      ]) {
        if (!inside(x, y)) continue;
        const [sx, sy] = toScreen(v, x, y);
        const L = Math.hypot(px, py);
        const ux = (px / L) * 4;
        const uy = (-py / L) * 4;
        ctx.beginPath();
        ctx.moveTo(sx - ux, sy - uy);
        ctx.lineTo(sx + ux, sy + uy);
        ctx.stroke();
      }
    }
  }
  // Labels sit 40 px back from where the axis leaves the canvas (clear of corner buttons), beside the axis.
  const inset = (seg: [number, number, number, number], side: 1 | -1): [number, number] => {
    const [ax, ay] = toScreen(v, seg[0], seg[1]);
    const [bx, by] = toScreen(v, seg[2], seg[3]);
    const L = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / L;
    const uy = (by - ay) / L;
    const x = bx - ux * 40 + side * uy * 14;
    const y = by - uy * 40 - side * ux * 14;
    return [Math.min(Math.max(x, 14), v.w - 14), Math.min(Math.max(y, 12), v.h - 12)];
  };
  if (ctAxis && (o.ctLabel ?? 'ct′')) {
    const [sx, sy] = inset(ctAxis, -1);
    label(ctx, p, o.ctLabel ?? 'ct′', sx, sy, color);
  }
  if (xAxis && (o.xLabel ?? 'x′')) {
    const [sx, sy] = inset(xAxis, 1);
    label(ctx, p, o.xLabel ?? 'x′', sx, sy, color);
  }
  ctx.restore();
}

/** A line of constant t′ (a "now" of S′) through the event (x, ct): slope β in the S diagram. */
export function drawSimultaneityLine(
  ctx: CanvasRenderingContext2D,
  v: View,
  p: Palette,
  b: number,
  through: [number, number],
  color = p.velocity,
) {
  const seg = clipLine(v, through[0], through[1], 1, b);
  if (!seg) return;
  ctx.save();
  ctx.strokeStyle = withAlpha(color, 0.8);
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3, 4]);
  line(ctx, v, seg);
  ctx.restore();
}

/** The calibration hyperbola c²t² − x² = s² (s² > 0: two timelike branches; s² < 0: two spacelike branches). */
export function drawHyperbola(ctx: CanvasRenderingContext2D, v: View, s2: number, color: string, alpha = 0.6) {
  if (s2 === 0) return;
  const a = Math.sqrt(Math.abs(s2));
  const [xa, xb, ya, yb] = worldBounds(v);
  const R = Math.max(Math.abs(xa), Math.abs(xb), Math.abs(ya), Math.abs(yb));
  const uMax = Math.acosh(Math.max(1, (R * 1.5) / a));
  ctx.save();
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = 1.2;
  ctx.setLineDash([2, 4]);
  for (const s of [1, -1]) {
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const u = -uMax + (2 * uMax * i) / 80;
      const along = s * a * Math.cosh(u);
      const across = a * Math.sinh(u);
      const [x, y] = s2 > 0 ? [across, along] : [along, across];
      const [sx, sy] = toScreen(v, x, y);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** A worldline through corner events [x, ct] (straight between them), in ink by default. */
export function drawWorldline(
  ctx: CanvasRenderingContext2D,
  v: View,
  pts: readonly (readonly [number, number])[],
  color: string,
  width = 2.5,
) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const [sx, sy] = toScreen(v, x, y);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.stroke();
  ctx.restore();
}

/** An event: a filled dot with an optional LTR label to its upper right. */
export function drawEvent(
  ctx: CanvasRenderingContext2D,
  v: View,
  p: Palette,
  x: number,
  ct: number,
  text?: string,
  color = p.ink,
  r = 5,
) {
  const [sx, sy] = toScreen(v, x, ct);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (text) label(ctx, p, text, sx + r + 10, sy - r - 6, color);
}
