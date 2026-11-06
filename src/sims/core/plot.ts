/**
 * A small plotting helper for figures that draw a graph on their canvas.
 *
 * - Axes are physics space and always run left-to-right and bottom-to-top, whatever the page
 *   direction. Hebrew labels are drawn with an RTL text run, centred, so they read correctly.
 * - Tick numbers use `sci()` (Bagrut style, 4·10⁵); log axes label decades as 10ⁿ.
 * - Colours come from the palette passed in, never from literals.
 *
 * The pure part (`makePlot`, `niceTicks`, `decadeTicks`) has no canvas and is unit-tested.
 */

import type { Palette } from './canvas';
import { sci, superscript } from './format';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Axis {
  min: number;
  max: number;
  /** 'log' needs min > 0; ticks fall on decades */
  scale?: 'linear' | 'log';
  /** Hebrew title with its unit, e.g. 'המרחק r (ס"מ)' */
  label?: string;
  /** explicit tick values; default is `niceTicks` / `decadeTicks` */
  ticks?: number[];
  /** tick text; default is `sci` (linear) or 10ⁿ (log) */
  format?: (v: number) => string;
}

export interface Plot {
  box: Box;
  x: Axis;
  y: Axis;
  /** data value -> screen x / y (CSS px) */
  px: (v: number) => number;
  py: (v: number) => number;
}

/** The part of `outer` left for the plot after reserving room for tick numbers and titles. */
export function insetBox(outer: Box, m: { l: number; r: number; t: number; b: number }): Box {
  return { x: outer.x + m.l, y: outer.y + m.t, w: Math.max(1, outer.w - m.l - m.r), h: Math.max(1, outer.h - m.t - m.b) };
}

function mapper(a: Axis, from: number, to: number): (v: number) => number {
  if (a.scale === 'log') {
    const lo = Math.log10(a.min);
    const span = Math.log10(a.max) - lo;
    return (v) => from + ((Math.log10(Math.max(v, Number.MIN_VALUE)) - lo) / span) * (to - from);
  }
  return (v) => from + ((v - a.min) / (a.max - a.min)) * (to - from);
}

export function makePlot(box: Box, x: Axis, y: Axis): Plot {
  return { box, x, y, px: mapper(x, box.x, box.x + box.w), py: mapper(y, box.y + box.h, box.y) };
}

/** Round tick values (1, 2, 5 × 10ⁿ) inside [min, max], about `target` of them. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + step * 1e-9; k++) out.push(Number((k * step).toPrecision(12)));
  return out;
}

/** Powers of ten inside [min, max], thinned so that at most `maxCount` remain. */
export function decadeTicks(min: number, max: number, maxCount = 7): number[] {
  const lo = Math.ceil(Math.log10(min) - 1e-9);
  const hi = Math.floor(Math.log10(max) + 1e-9);
  const stride = Math.max(1, Math.ceil((hi - lo + 1) / maxCount));
  const out: number[] = [];
  for (let e = lo; e <= hi; e += stride) out.push(10 ** e);
  return out;
}

const decadeLabel = (v: number) => `10${superscript(Math.round(Math.log10(v)))}`;

function ticksOf(a: Axis): number[] {
  return a.ticks ?? (a.scale === 'log' ? decadeTicks(a.min, a.max) : niceTicks(a.min, a.max));
}
const formatOf = (a: Axis) => a.format ?? (a.scale === 'log' ? decadeLabel : (v: number) => sci(v, 2));

/** Frame, grid, tick numbers and axis titles. Titles sit outside `plot.box`. */
export function drawAxes(ctx: CanvasRenderingContext2D, plot: Plot, p: Palette, opts: { grid?: boolean } = {}) {
  const { box, x, y } = plot;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = p.rule;
  ctx.fillStyle = p.ink2;
  ctx.font = `11px ${p.fontUi}`;
  ctx.direction = 'ltr';

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const v of ticksOf(x)) {
    const sx = plot.px(v);
    if (opts.grid !== false) {
      ctx.beginPath();
      ctx.moveTo(sx, box.y);
      ctx.lineTo(sx, box.y + box.h);
      ctx.stroke();
    }
    ctx.fillText(formatOf(x)(v), sx, box.y + box.h + 5);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of ticksOf(y)) {
    const sy = plot.py(v);
    if (opts.grid !== false) {
      ctx.beginPath();
      ctx.moveTo(box.x, sy);
      ctx.lineTo(box.x + box.w, sy);
      ctx.stroke();
    }
    ctx.fillText(formatOf(y)(v), box.x - 6, sy);
  }

  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y);
  ctx.lineTo(box.x, box.y + box.h);
  ctx.lineTo(box.x + box.w, box.y + box.h);
  ctx.stroke();

  ctx.font = `600 12px ${p.fontUi}`;
  ctx.fillStyle = p.ink;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  if (x.label) {
    ctx.textBaseline = 'bottom';
    ctx.fillText(x.label, box.x + box.w / 2, box.y + box.h + 36);
  }
  if (y.label) {
    ctx.save();
    ctx.translate(box.x - 40, box.y + box.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'top';
    ctx.fillText(y.label, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export interface CurveStyle {
  color: string;
  width?: number;
  dash?: number[];
  samples?: number;
}

/** y = f(x) across the x axis, clipped to the plot box. On a log x axis samples are log-spaced. */
export function drawCurve(ctx: CanvasRenderingContext2D, plot: Plot, f: (x: number) => number, s: CurveStyle) {
  const n = s.samples ?? 160;
  const { x, box } = plot;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y - 2, box.w, box.h + 4);
  ctx.clip();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width ?? 2.2;
  ctx.lineJoin = 'round';
  ctx.setLineDash(s.dash ?? []);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const xv = x.scale === 'log' ? x.min * (x.max / x.min) ** t : x.min + (x.max - x.min) * t;
    const yv = f(xv);
    if (!Number.isFinite(yv) || (plot.y.scale === 'log' && yv <= 0)) {
      started = false;
      continue;
    }
    const sx = plot.px(xv);
    const sy = plot.py(yv);
    if (started) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
    started = true;
  }
  ctx.stroke();
  ctx.restore();
}

/** A filled dot at a data point, with optional dashed guides down to the x axis and across to the y axis. */
export function drawMarker(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  xv: number,
  yv: number,
  color: string,
  opts: { guides?: boolean; radius?: number } = {},
) {
  const sx = plot.px(xv);
  const sy = plot.py(yv);
  const { box } = plot;
  ctx.save();
  if (opts.guides) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, box.y + box.h);
    ctx.lineTo(sx, sy);
    ctx.lineTo(box.x, sy);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx, sy, opts.radius ?? 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
