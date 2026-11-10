/**
 * ImpulseLab (lesson 3.5): impulse and the conservation of momentum. Two modes.
 *
 *   mode 'impulse'       A 0.50 kg ball moving left at 4.0 m/s hits a pad on a wall and stops (or bounces back at
 *                        4.0 m/s). The pad's force on the ball is a pulse F(t): rectangular, triangular or
 *                        half-sine, of duration Δt. On top, the ball and the pad; below, F(t) with the area under
 *                        it shaded up to the current instant (the impulse delivered so far), and the momentum p(t),
 *                        which climbs by exactly that area. A longer contact keeps the area (Δp is fixed by the
 *                        speeds) and lowers the peak; the ghost is the same pulse on a hard surface (Δt = 8 ms).
 *   mode 'conservation'  scene 'recoil': two carts on a smooth track, a compressed spring between them, released at
 *                        t = 0; bars for p₁, p₂ and the total P, which never moves. scene 'wedge': a block slides
 *                        down the smooth face of a wedge that is free on a smooth floor (or held in place); the
 *                        horizontal momentum of block + wedge stays zero, the vertical one does not (the floor's
 *                        normal force is external), shown as horizontal and vertical arrows.
 *
 * Model: src/physics/momentum.ts (MODEL SPECIFICATION there); the wedge's accelerations come from constraints.ts.
 * Physics space is LTR, x to the right, y up. Colours: force --force, velocity --velocity, momentum --momentum.
 *
 * Step `set` keys: shape, dur [s], outcome ('stop' | 'bounce'), ghost, avg; m1, m2, v0; M, theta, fixed, ext;
 * t [s] or tFrac (a fraction of the run). A step never plays, so a state a step produced never ticks a task:
 * tasks are checked only after the learner's own action, and never on the state object a step set.
 *
 * Tasks: stretch (the learner lengthens the contact to ≥ 60 ms), shapes (the learner chooses all three shapes),
 * bounce (the learner chooses the bounce); release, unequal (one cart at least twice the other), moving (a common
 * initial velocity) — each once the learner has run past the push; slide (free wedge to the floor), fixed (held
 * wedge to the floor), heavy (a wedge of ≥ 8 kg to the floor).
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import { freeWedge, fixedWedge } from '~/physics/constraints';
import {
  cumulativeImpulse,
  pulseDisplacement,
  pulseFor,
  pulseForce,
  pulseImpulse,
  pushTime,
  recoilFinal,
  recoilState,
  wedgeSlideTime,
  wedgeState,
  type Pulse,
  type PulseShape,
  type SpringRecoil,
} from '~/physics/momentum';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { drawAxes, drawCurve, drawMarker, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Mode = 'impulse' | 'conservation';
export type Scene = 'recoil' | 'wedge';
export type Outcome = 'stop' | 'bounce';

/* ---------------------------------------------------------------- fixed parameters */

/** the ball of the impulse mode: mass [kg], speed [m/s] (it moves to the left, toward the pad) */
const BALL_M = 0.5;
const BALL_V = 4;
/** contact begins at T_CONTACT; the run lasts T_IMPULSE [s] */
const T_CONTACT = 0.02;
const T_IMPULSE = 0.16;
/** the duration slider [s] and the "hard surface" of the ghost */
const DUR_MIN = 0.008;
const DUR_MAX = 0.12;
const DUR_STEP = 0.004;
/** the carts' spring: constant [N/m], compression [m], natural length [m] */
const SPRING_K = 50;
const SPRING_X0 = 0.2;
const SPRING_L0 = 0.4;
/** the wedge's block: mass [kg] and starting height of its contact point [m] */
const BLOCK_M = 1;
const WEDGE_H = 0.6;

const SHAPES: PulseShape[] = ['rect', 'triangle', 'halfsine'];
const SHAPE_NAME: Record<PulseShape, string> = { rect: 'מלבן', triangle: 'משולש', halfsine: 'חצי סינוס' };

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside, so it reads left to right in Hebrew. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  stretch: `האריכו את זמן המגע ל-${ltr('60 ms')} לפחות. מה קרה לשטח הצבוע, ומה קרה לכוח המרבי?`,
  shapes: 'בחרו כל אחת משלוש הצורות של הדופק. האם השטח משתנה? והכוח המרבי?',
  bounce: 'בחרו "חוזר לאחור". פי כמה גדל המתקף?',
  release: 'שחררו את העגלות והריצו אחרי שהקפיץ סיים לדחוף. מה קורה לעמודה של התנע הכולל?',
  unequal: 'הגדירו עגלה אחת כבדה לפחות פי 2 מהשנייה, והריצו שוב. איזו עגלה מהירה יותר?',
  moving: 'תנו לשתי העגלות מהירות משותפת בהתחלה, והריצו. האם התנע הכולל עדיין קבוע? האם הוא אפס?',
  slide: 'הריצו את הגוש עד הרצפה. איזה רכיב של התנע הכולל נשאר אפס, ואיזה לא?',
  fixed: 'קבעו את הטריז לרצפה והריצו שוב. מה קורה עכשיו לרכיב האופקי?',
  heavy: `הגדילו את מסת הטריז ל-${ltr('8 kg')} לפחות והריצו. מה מהירות הטריז בסוף?`,
};

export interface ImpulseLabProps {
  id: string;
  mode?: Mode;
  scene?: Scene;
  shape?: PulseShape;
  /** contact time [s] */
  dur?: number;
  outcome?: Outcome;
  ghost?: boolean;
  avg?: boolean;
  m1?: number;
  m2?: number;
  v0?: number;
  M?: number;
  theta?: number;
  fixed?: boolean;
  ext?: boolean;
  tasks?: string[];
}

interface State {
  shape: PulseShape;
  dur: number;
  outcome: Outcome;
  ghost: boolean;
  avg: boolean;
  m1: number;
  m2: number;
  v0: number;
  M: number;
  theta: number;
  fixed: boolean;
  ext: boolean;
  t: number;
  playing: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const snap = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
/** 3 significant figures, trailing zeros kept, a true minus sign, no "−0" */
const s3 = (x: number, tiny = 1e-9) => (Math.abs(x) < tiny ? '0' : x.toPrecision(3).replace('-', '−'));
/** fixed decimals, a true minus sign, no "−0.00" */
const fx = (x: number, d = 2) => (Math.abs(x) < 0.5 * 10 ** -d ? (0).toFixed(d) : x.toFixed(d)).replace('-', '−');

function initial(p: ImpulseLabProps): State {
  return {
    shape: p.shape ?? 'rect',
    dur: clamp(p.dur ?? DUR_MIN, DUR_MIN, DUR_MAX),
    outcome: p.outcome ?? 'stop',
    ghost: p.ghost ?? false,
    avg: p.avg ?? false,
    m1: clamp(p.m1 ?? 1, 0.5, 3),
    m2: clamp(p.m2 ?? 2, 0.5, 3),
    v0: clamp(p.v0 ?? 0, -0.5, 0.5),
    M: clamp(p.M ?? 2, 1, 10),
    theta: clamp(p.theta ?? 40, 30, 60),
    fixed: p.fixed ?? false,
    ext: p.ext ?? false,
    t: 0,
    playing: false,
  };
}

/* ---------------------------------------------------------------- the three models, as the figure reads them */

const impulseOf = (s: State) => (s.outcome === 'stop' ? 1 : 2) * BALL_M * BALL_V;
const pulseOf = (s: State, dur = s.dur): Pulse => pulseFor(s.shape, impulseOf(s), dur);
const cartsOf = (s: State): SpringRecoil => ({ m1: s.m1, m2: s.m2, k: SPRING_K, x0: SPRING_X0, v0: s.v0 });

/** the run's length [s] */
function runTime(mode: Mode, scene: Scene, s: State): number {
  if (mode === 'impulse') return T_IMPULSE;
  if (scene === 'recoil') {
    const r = cartsOf(s);
    const f = recoilFinal(r);
    // the faster cart coasts about 0.7 m after the push
    return pushTime(r) + Math.min(1.3, 0.7 / Math.max(Math.abs(f.v1), Math.abs(f.v2), 0.5));
  }
  return wedgeSlideTime(BLOCK_M, s.M, s.theta, WEDGE_H, s.fixed);
}

/* ---------------------------------------------------------------- canvas text */

function haloText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { font: string; color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; rtl?: boolean }) {
  ctx.save();
  ctx.direction = o.rtl ? 'rtl' : 'ltr';
  ctx.font = o.font;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.baseline ?? 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** An arrow of at least `min` pixels (a stub is never drawn), from (x, y) along (dx, dy). */
function vecArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, color: string, width = 2.4, min = 14) {
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return { x, y };
  const k = L < min ? min / L : 1;
  const ex = x + dx * k;
  const ey = y + dy * k;
  arrow(ctx, x, y, ex, ey, { color, width, head: 9 });
  return { x: ex, y: ey };
}

/** The reset and fullscreen buttons sit in the top-right corner of the stage. */
const CORNER_W = 92;
const CORNER_H = 46;

/* ---------------------------------------------------------------- impulse mode */

function paintImpulse(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State) {
  const narrow = view.w < 520;
  const fs = narrow ? 11 : 12;
  const pulse = pulseOf(s);
  const ghost = pulseOf(s, DUR_MIN);
  const tc = T_CONTACT;
  const v0 = -BALL_V;
  const now = clamp(s.t, 0, T_IMPULSE);
  const F = (t: number) => pulseForce(pulse, t - tc);
  const pOf = (t: number) => BALL_M * v0 + cumulativeImpulse(pulse, t - tc);
  const Fnow = F(now);
  const pNow = pOf(now);

  /* the ball and the pad */
  const stripTop = 8;
  const stripH = Math.round(view.h * (narrow ? 0.25 : 0.27));
  const floorY = stripTop + stripH - 6;
  const xmin = -0.34;
  const xmax = 0.68;
  const left = 8;
  const right = view.w - CORNER_W;
  const ppm = Math.min((right - left) / (xmax - xmin), (stripH - 10) / 0.42);
  const sx = (x: number) => left + (x - xmin) * ppm;
  const R = 0.05;
  // the ball's left edge: before contact it closes in at 4.0 m/s; during and after, the pulse decides
  const edge = now <= tc ? BALL_V * (tc - now) : pulseDisplacement(pulse, BALL_M, v0, now - tc);
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(left, floorY);
  ctx.lineTo(right, floorY);
  ctx.stroke();
  // the wall, hatched, and the pad on it; the pad's face follows the ball while they touch
  const wallX = sx(-0.3);
  ctx.fillStyle = withAlpha(p.ink3, 0.35);
  ctx.fillRect(sx(xmin), floorY - 0.36 * ppm, wallX - sx(xmin), 0.36 * ppm);
  const face = Math.min(0, edge);
  ctx.fillStyle = withAlpha(p.accent, 0.18);
  ctx.strokeStyle = withAlpha(p.accent, 0.7);
  ctx.fillRect(wallX, floorY - 0.24 * ppm, sx(face) - wallX, 0.24 * ppm);
  ctx.strokeRect(wallX, floorY - 0.24 * ppm, sx(face) - wallX, 0.24 * ppm);
  ctx.restore();
  const bx = sx(edge + R);
  const by = floorY - R * ppm;
  ctx.save();
  ctx.fillStyle = p.ink2;
  ctx.beginPath();
  ctx.arc(bx, by, R * ppm, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // the force on the ball, by the pad: from the ball's centre, to the right; the momentum above the ball
  const Fscale = (0.22 * (right - left)) / Math.max(pulse.peak, 1e-9);
  if (Fnow > 1e-9) {
    const tip = vecArrow(ctx, bx, by, Fscale * Fnow, 0, p.force, 3);
    haloText(ctx, p, 'F', tip.x + 9, by, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.force });
  }
  const kp = (0.16 * (right - left)) / (BALL_M * BALL_V);
  const py = by - R * ppm - 12;
  if (Math.abs(pNow) > 1e-6) {
    const tip = vecArrow(ctx, bx, py, kp * pNow, 0, p.momentum, 2.6);
    haloText(ctx, p, 'p', tip.x + (pNow < 0 ? -9 : 9), py, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.momentum });
  } else haloText(ctx, p, 'p = 0', bx, py, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.momentum });

  /* F(t) and p(t) */
  const L = narrow ? 46 : 56;
  const Rm = 14;
  const gap = 26;
  const top = stripTop + stripH + 22;
  const bottom = 44;
  const avail = view.h - top - bottom - gap;
  const hF = avail * 0.56;
  const hP = avail - hF;
  const w = view.w - L - Rm;
  const ms = (x: number) => String(Math.round(x * 1000));
  const Fmax = Math.max(pulse.peak, s.ghost ? ghost.peak : 0);
  const Ftop = niceUp(Fmax * 1.12);
  const pF = makePlot({ x: L, y: top, w, h: hF }, { min: 0, max: T_IMPULSE, format: () => '' }, { min: 0, max: Ftop, format: (v) => String(Number(v.toPrecision(3))), ticks: [0, Ftop / 2, Ftop] });
  const pP = makePlot(
    { x: L, y: top + hF + gap, w, h: hP },
    { min: 0, max: T_IMPULSE, label: 'הזמן t (ms)', format: (v) => ms(v), ticks: [0, 0.04, 0.08, 0.12, 0.16] },
    { min: -2.5, max: 2.5, format: (v) => fx(v, 0), ticks: [-2, 0, 2] },
  );
  drawAxes(ctx, pF, p);
  // the shaded area: the impulse delivered up to now; the whole pulse faint
  shade(ctx, pF, F, tc, tc + pulse.duration, withAlpha(p.force, 0.08));
  shade(ctx, pF, F, tc, Math.min(now, tc + pulse.duration), withAlpha(p.force, 0.28));
  if (s.ghost && Math.abs(s.dur - DUR_MIN) > 1e-9) {
    drawCurve(ctx, pF, (t) => pulseForce(ghost, t - tc), { color: p.ink3, width: 1.6, dash: [5, 4], samples: 600 });
    const gx = pF.px(tc + DUR_MIN) + 6;
    haloText(ctx, p, `Δt = ${ms(DUR_MIN)} ms`, gx, pF.py(ghost.peak * 0.8), { font: `${fs}px ${p.fontUi}`, color: p.ink2, align: 'left' });
  }
  if (s.avg) {
    const Fa = pulseImpulse(pulse) / pulse.duration;
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.4;
    ctx.strokeRect(pF.px(tc), pF.py(Fa), pF.px(tc + pulse.duration) - pF.px(tc), pF.py(0) - pF.py(Fa));
    ctx.restore();
    haloText(ctx, p, `J/Δt = ${s3(Fa)} N`, pF.px(tc) + 4, pF.py(Fa) - 9, { font: `600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'left' });
  }
  drawCurve(ctx, pF, F, { color: p.force, width: 2.4, samples: 800 });
  // the peak, labelled beside it; the area, labelled at the side of the plot
  const peakT = pulse.shape === 'rect' ? tc + pulse.duration : tc + pulse.duration / 2;
  haloText(ctx, p, `Fmax = ${s3(pulse.peak)} N`, pF.px(peakT) + 8, pF.py(pulse.peak) + (pulse.peak > 0.8 * Ftop ? 10 : -8), { font: `600 ${fs}px ${p.fontUi}`, color: p.force, align: 'left' });
  const Jnow = cumulativeImpulse(pulse, now - tc);
  haloText(ctx, p, `J = ${s3(Jnow, 1e-6)} N·s`, pF.box.x + pF.box.w - 4, pF.box.y + pF.box.h * 0.6, { font: `700 ${fs + 1}px ${p.fontUi}`, color: p.force, align: 'right' });
  nowLine(ctx, pF, p, now);
  haloText(ctx, p, 'F (N)', L, pF.box.y - 9, { font: `600 ${fs}px ${p.fontUi}`, color: p.force, align: 'left' });

  drawAxes(ctx, pP, p);
  zeroLine(ctx, pP, p);
  drawCurve(ctx, pP, pOf, { color: withAlpha(p.momentum, 0.3), width: 2, samples: 800 });
  drawCurve(ctx, { ...pP, x: { ...pP.x, max: Math.max(now, 1e-9) } }, pOf, { color: p.momentum, width: 2.6, samples: 600 });
  drawMarker(ctx, pP, now, pNow, p.momentum, { radius: 4.5 });
  nowLine(ctx, pP, p, now);
  // Δp: a bracket from the momentum before to the momentum after, at the right of the plot
  const bxr = pP.box.x + pP.box.w - (narrow ? 34 : 44);
  const p0 = BALL_M * v0;
  const p1 = p0 + pulseImpulse(pulse);
  arrow(ctx, bxr, pP.py(p0), bxr, pP.py(p1), { color: p.ink2, width: 1.6, head: 8 });
  haloText(ctx, p, 'Δp = J', bxr - 6, (pP.py(p0) + pP.py(p1)) / 2 - 10, { font: `600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });
  haloText(ctx, p, 'p (kg·m/s)', L, pP.box.y - 9, { font: `600 ${fs}px ${p.fontUi}`, color: p.momentum, align: 'left' });
}

/** The smallest of 1, 2, 2.5, 5 × 10ⁿ that is ≥ x. */
function niceUp(x: number): number {
  if (!(x > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(x));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * mag >= x * (1 - 1e-9)) return k * mag;
  return 10 * mag;
}

/** Shade the area between y = f(u) and the axis, for u from a to b. */
function shade(ctx: CanvasRenderingContext2D, plot: Plot, f: (u: number) => number, a: number, b: number, color: string) {
  if (b - a < 1e-12) return;
  const n = 200;
  const { box } = plot;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(plot.px(a), plot.py(0));
  for (let i = 0; i <= n; i++) {
    const u = a + ((b - a) * i) / n;
    ctx.lineTo(plot.px(u), plot.py(f(u)));
  }
  ctx.lineTo(plot.px(b), plot.py(0));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function zeroLine(ctx: CanvasRenderingContext2D, plot: Plot, p: Palette) {
  const y = plot.py(0);
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink2, 0.7);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(plot.box.x, y);
  ctx.lineTo(plot.box.x + plot.box.w, y);
  ctx.stroke();
  ctx.restore();
}

function nowLine(ctx: CanvasRenderingContext2D, plot: Plot, p: Palette, u: number) {
  const x = plot.px(u);
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink, 0.45);
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, plot.box.y);
  ctx.lineTo(x, plot.box.y + plot.box.h);
  ctx.stroke();
  ctx.restore();
}

/* ---------------------------------------------------------------- momentum bars */

interface Bar {
  label: string;
  value: number;
  strong?: boolean;
}

/**
 * Momentum components as arrows from a common zero: horizontal arrows in rows (dir 'x') or vertical arrows in
 * columns (dir 'y'), each labelled with its name and its value; the total is drawn thicker. `ref` marks a value
 * with a short tick (the total at t = 0).
 */
function bars(ctx: CanvasRenderingContext2D, p: Palette, box: { x: number; y: number; w: number; h: number }, dir: 'x' | 'y', items: Bar[], scale: number, title: string, fs: number, ref?: number) {
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.restore();
  haloText(ctx, p, title, box.x + box.w / 2, box.y + 11, { font: `600 ${fs}px ${p.fontUi}`, color: p.ink2, rtl: true });
  const inner = { x: box.x + 8, y: box.y + 24, w: box.w - 16, h: box.h - 30 };
  const n = items.length;
  if (dir === 'x') {
    const labW = Math.min(64, inner.w * 0.3);
    const x0 = inner.x + labW + (inner.w - labW) / 2;
    const half = (inner.w - labW) / 2 - 6;
    const k = half / scale;
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.beginPath();
    ctx.moveTo(x0, inner.y);
    ctx.lineTo(x0, inner.y + inner.h);
    ctx.stroke();
    ctx.restore();
    items.forEach((it, i) => {
      const y = inner.y + ((i + 0.5) * inner.h) / n;
      haloText(ctx, p, it.label, inner.x + labW - 4, y, { font: `${it.strong ? 700 : 500} ${fs}px ${p.fontUi}`, color: p.ink, align: 'right', rtl: HEB.test(it.label) });
      const L = k * it.value;
      if (Math.abs(L) >= 2) arrow(ctx, x0, y, x0 + L, y, { color: p.momentum, width: it.strong ? 5 : 3, head: it.strong ? 11 : 9 });
      else drawDot(ctx, x0, y, p.momentum);
      const vx = Math.abs(L) >= 2 ? x0 + L + (L > 0 ? 6 : -6) : x0 + 8;
      haloText(ctx, p, s3(it.value, 5e-4), vx, y - 10, { font: `600 ${fs - 1}px ${p.fontUi}`, color: p.momentum, align: L >= 0 ? 'left' : 'right' });
    });
    if (ref !== undefined) {
      const y = inner.y + ((n - 0.5) * inner.h) / n;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x0 + k * ref, y - 12);
      ctx.lineTo(x0 + k * ref, y + 12);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    const labH = 18;
    const y0 = inner.y + (inner.h - labH) / 2;
    const half = (inner.h - labH) / 2 - 4;
    const k = half / scale;
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.beginPath();
    ctx.moveTo(inner.x, y0);
    ctx.lineTo(inner.x + inner.w, y0);
    ctx.stroke();
    ctx.restore();
    items.forEach((it, i) => {
      const x = inner.x + ((i + 0.5) * inner.w) / n;
      haloText(ctx, p, it.label, x, inner.y + inner.h - 6, { font: `${it.strong ? 700 : 500} ${fs}px ${p.fontUi}`, color: p.ink, rtl: HEB.test(it.label) });
      const L = -k * it.value;
      if (Math.abs(L) >= 2) arrow(ctx, x, y0, x, y0 + L, { color: p.momentum, width: it.strong ? 5 : 3, head: it.strong ? 11 : 9 });
      else drawDot(ctx, x, y0, p.momentum);
      haloText(ctx, p, s3(it.value, 5e-4), x + 8, Math.abs(L) >= 2 ? y0 + L / 2 : y0 - 10, { font: `600 ${fs - 1}px ${p.fontUi}`, color: p.momentum, align: 'left' });
    });
  }
}

/** Hebrew text on canvas runs right to left; Latin symbols left to right. */
const HEB = /[֐-׿]/;

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ---------------------------------------------------------------- recoil scene */

function paintRecoil(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, tEnd: number) {
  const narrow = view.w < 520;
  const fs = narrow ? 11 : 12;
  const r = cartsOf(s);
  const st = recoilState(r, clamp(s.t, 0, tEnd));
  const fin = recoilFinal(r);
  const sceneH = Math.round(view.h * 0.5);
  const floorY = sceneH - 22;
  const xmin = -1.6;
  const xmax = 1.6;
  const ppm = (view.w - 16) / (xmax - xmin);
  const sx = (x: number) => 8 + (x - xmin) * ppm;
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(8, floorY);
  ctx.lineTo(view.w - 8, floorY);
  ctx.stroke();
  ctx.restore();
  // the carts: 0.30 m long, a height that grows with the mass; cart 1's right face starts at −0.10 m
  const cartW = 0.36;
  const hOf = (m: number) => 0.12 + 0.04 * m;
  const wheel = 0.03;
  const c1r = -SPRING_L0 / 2 + SPRING_X0 / 2 + st.d1;
  const c2l = SPRING_L0 / 2 - SPRING_X0 / 2 + st.d2;
  const drawCart = (xl: number, m: number, name: string) => {
    const h = hOf(m);
    const x = sx(xl);
    const y = floorY - (h + 2 * wheel) * ppm;
    ctx.save();
    ctx.fillStyle = withAlpha(p.equip || p.ink3, 0.25);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.4;
    ctx.fillRect(x, y, cartW * ppm, h * ppm);
    ctx.strokeRect(x, y, cartW * ppm, h * ppm);
    ctx.fillStyle = p.ink2;
    for (const f of [0.22, 0.78]) {
      ctx.beginPath();
      ctx.arc(x + f * cartW * ppm, floorY - wheel * ppm, wheel * ppm, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    haloText(ctx, p, `${fx(m, 1)} kg`, x + (cartW * ppm) / 2, y + h * ppm * 0.7, { font: `600 ${fs - 1}px ${p.fontUi}`, color: p.ink });
    // the cart's name under it, below the floor line
    haloText(ctx, p, name, x + (cartW * ppm) / 2, floorY + 11, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2 });
    return { x, y, w: cartW * ppm, h: h * ppm };
  };
  const b1 = drawCart(c1r - cartW, s.m1, 'm₁');
  const b2 = drawCart(c2l, s.m2, 'm₂');
  // the spring, attached to cart 1: compressed against cart 2 while it pushes, at its natural length afterwards
  const sl = SPRING_L0 - st.s;
  const yS = floorY - (wheel * 2 + 0.05) * ppm;
  zigzag(ctx, sx(c1r), sx(c1r + sl), yS, Math.max(4, 0.03 * ppm), p.ink2);
  if (s.t <= 0) {
    // the thread that holds the carts together until the release
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(b1.x + b1.w * 0.5, b1.y + 3);
    ctx.lineTo(b2.x + b2.w * 0.5, b2.y + 3);
    ctx.stroke();
    ctx.restore();
  }
  // the spring's forces, while it pushes: on each cart, from its inner face, outward
  // (before the release the thread holds the spring: the net force on each cart is zero, so nothing is drawn)
  if (st.force > 1e-9 && s.t > 0) {
    const kF = (0.14 * view.w) / (SPRING_K * SPRING_X0);
    const yF = b1.y + b1.h * 0.28;
    const t1 = vecArrow(ctx, b1.x + b1.w - 2, Math.min(yF, b1.y + b1.h - 6), -kF * st.force, 0, p.force, 2.6);
    haloText(ctx, p, 'F', t1.x - 9, Math.min(yF, b1.y + b1.h - 6), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force });
    const t2 = vecArrow(ctx, b2.x + 2, Math.min(b2.y + b2.h * 0.28, b2.y + b2.h - 6), kF * st.force, 0, p.force, 2.6);
    haloText(ctx, p, 'F', t2.x + 9, Math.min(b2.y + b2.h * 0.28, b2.y + b2.h - 6), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force });
  }
  // velocities, above the carts
  const vmax = Math.max(Math.abs(fin.v1), Math.abs(fin.v2), Math.abs(s.v0), 0.3);
  const kv = (0.12 * view.w) / vmax;
  for (const [b, v, name] of [
    [b1, st.v1, 'v₁'],
    [b2, st.v2, 'v₂'],
  ] as const) {
    const y = b.y - 12;
    if (Math.abs(v) > 1e-6) {
      // kept on the canvas (with room for its label) when a fast cart is near an edge
      const x0 = b.x + b.w / 2;
      const tip = vecArrow(ctx, x0, y, clamp(kv * v, 24 - x0, view.w - 24 - x0), 0, p.velocity, 2.2);
      haloText(ctx, p, name, tip.x + (v > 0 ? 10 : -10), y, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.velocity });
    }
  }

  // the bars
  const P = s.m1 * st.v1 + s.m2 * st.v2;
  const scale = Math.max(Math.abs(s.m1 * fin.v1), Math.abs(s.m2 * fin.v2), Math.abs((s.m1 + s.m2) * s.v0), 0.1);
  bars(
    ctx,
    p,
    { x: 8, y: sceneH + 6, w: view.w - 16, h: view.h - sceneH - 12 },
    'x',
    [
      { label: 'p₁', value: s.m1 * st.v1 },
      { label: 'p₂', value: s.m2 * st.v2 },
      { label: 'P = p₁ + p₂', value: P, strong: true },
    ],
    scale,
    'התנע לאורך x, ימינה חיובי (kg·m/s)',
    fs,
    (s.m1 + s.m2) * s.v0,
  );
}

function zigzag(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, amp: number, color: string) {
  const n = 10;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  for (let i = 1; i < 2 * n; i++) ctx.lineTo(x1 + ((x2 - x1) * i) / (2 * n), y + (i % 2 ? -amp : amp));
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

/* ---------------------------------------------------------------- wedge scene */

function paintWedge(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, tEnd: number) {
  const narrow = view.w < 520;
  const fs = narrow ? 11 : 12;
  const th = (s.theta * Math.PI) / 180;
  const tanT = Math.tan(th);
  const st = wedgeState(BLOCK_M, s.M, s.theta, WEDGE_H, clamp(s.t, 0, tEnd), s.fixed);
  const free = wedgeState(BLOCK_M, s.M, s.theta, WEDGE_H, 1e9, false);
  const held = wedgeState(BLOCK_M, s.M, s.theta, WEDGE_H, 1e9, true);
  const Hw = WEDGE_H + 0.14;
  const Bw = Hw / tanT;
  const b = 0.12;
  const xP0 = (Hw - WEDGE_H) / tanT;
  // the view holds the start and both ends (free and held), so toggling the wedge never rescales the drawing
  const xlo = Math.min(free.X, 0) - 0.34; // room behind the wedge for its velocity arrow
  const xhi = Math.max(Bw, xP0 + free.x + b, xP0 + held.x + b) + 0.12;
  const ylo = -0.22; // room under the floor for the block's velocity arrow at the bottom of the face
  const yhi = Hw + b + 0.06;
  const sceneTop = narrow ? 10 : 8;
  const sceneH = Math.round(view.h * 0.56);
  const sceneR = view.w - CORNER_W;
  const ppm = Math.min((sceneR - 16) / (xhi - xlo), (sceneH - sceneTop) / (yhi - ylo));
  const ox = 8 + (sceneR - 16 - (xhi - xlo) * ppm) / 2;
  const sx = (x: number) => ox + (x - xlo) * ppm;
  const sy = (y: number) => sceneTop + (yhi - y) * ppm;
  // the floor
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(8, sy(0));
  ctx.lineTo(view.w - 8, sy(0));
  ctx.stroke();
  ctx.restore();
  // the wedge
  const X = st.X;
  ctx.save();
  ctx.fillStyle = withAlpha(p.equip || p.ink3, 0.22);
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx(X), sy(0));
  ctx.lineTo(sx(X), sy(Hw));
  ctx.lineTo(sx(X + Bw), sy(0));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // the wedge's name only (its mass is on the slider), high on its back, clear of the force arrows
  haloText(ctx, p, 'M', sx(X + Bw * 0.12), sy(Hw * 0.62), { font: `italic 700 ${fs + 3}px ${p.fontUi}`, color: p.ink });
  if (s.fixed) {
    // the stop that holds the wedge: a block bolted to the floor behind its back
    ctx.save();
    ctx.fillStyle = p.ink2;
    ctx.fillRect(sx(X) - 0.05 * ppm, sy(0.12), 0.05 * ppm, 0.12 * ppm);
    ctx.restore();
  }
  // the block: a square on the face, its bottom centre at the contact point
  const Px = xP0 + st.x;
  const Py = WEDGE_H + st.y;
  const d = [Math.cos(th), -Math.sin(th)];
  const n = [Math.sin(th), Math.cos(th)];
  const corners = [
    [Px - (b / 2) * d[0], Py - (b / 2) * d[1]],
    [Px + (b / 2) * d[0], Py + (b / 2) * d[1]],
    [Px + (b / 2) * d[0] + b * n[0], Py + (b / 2) * d[1] + b * n[1]],
    [Px - (b / 2) * d[0] + b * n[0], Py - (b / 2) * d[1] + b * n[1]],
  ];
  ctx.save();
  ctx.fillStyle = p.ink2;
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const cx = sx(Px + (b / 2) * n[0]);
  const cy = sy(Py + (b / 2) * n[1]);
  // velocities: the block's ground velocity, the wedge's
  const vRef = Math.max(Math.hypot(held.vx, held.vy), 0.5);
  const kv = (0.26 * sceneH) / vRef;
  if (Math.hypot(st.vx, st.vy) > 1e-6) {
    const tip = vecArrow(ctx, cx, cy, kv * st.vx, -kv * st.vy, p.velocity, 2.4);
    haloText(ctx, p, 'v', tip.x + 9, tip.y + 2, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.velocity });
  }
  if (Math.abs(st.Vx) > 1e-6) {
    // from the wedge's back, near its top, backwards
    const yv = sy(Hw * 0.85);
    const tip = vecArrow(ctx, sx(X), yv, Math.max(kv * st.Vx, 20 - sx(X)), 0, p.velocity, 2.4);
    haloText(ctx, p, 'V', tip.x - 3, yv - 12, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.velocity });
  }
  // the external forces on block + wedge: the weights, the floor's normal force, the stop's push
  if (s.ext) {
    const w = s.fixed ? fixedWedge(BLOCK_M, s.theta) : freeWedge(BLOCK_M, s.M, s.theta);
    const Nfl = s.M * G + w.N * Math.cos(th);
    const kF = (0.32 * Hw * ppm) / ((s.M + BLOCK_M) * G); // scaled with the drawing of the wedge
    const gx = sx(X + Bw * 0.4);
    const gy = sy(Hw * 0.32);
    const t1 = vecArrow(ctx, gx, gy, 0, kF * s.M * G, p.force, 2.4);
    haloText(ctx, p, 'Mg', t1.x + 14, t1.y - 6, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force });
    const t2 = vecArrow(ctx, sx(X + Bw * 0.24), sy(0), 0, -kF * Nfl, p.force, 2.4);
    haloText(ctx, p, 'N′', t2.x - 12, t2.y + 8, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force });
    const t3 = vecArrow(ctx, cx, cy, 0, kF * BLOCK_M * G, p.force, 2.2);
    haloText(ctx, p, 'mg', t3.x - 16, t3.y + 10, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force });
    if (s.fixed) {
      const t4 = vecArrow(ctx, sx(X), sy(0.06), kF * w.N * Math.sin(th), 0, p.force, 2.4);
      haloText(ctx, p, 'F', t4.x + 8, t4.y - 10, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force });
    }
  }

  // the bars: horizontal components in rows, vertical ones in columns
  const scale = Math.max(Math.abs(BLOCK_M * held.vx), Math.abs(BLOCK_M * held.vy), Math.abs(BLOCK_M * free.vy), 0.1);
  const top = sceneTop + sceneH + 8;
  const gap = 8;
  const bh = view.h - top - 8;
  const wX = narrow ? (view.w - 16 - gap) * 0.56 : (view.w - 16 - gap) * 0.55;
  const blockP = { x: BLOCK_M * st.vx, y: BLOCK_M * st.vy };
  const wedgeP = s.fixed ? 0 : s.M * st.Vx;
  bars(
    ctx,
    p,
    { x: 8, y: top, w: wX, h: bh },
    'x',
    [
      { label: 'גוש', value: blockP.x },
      { label: 'טריז', value: wedgeP },
      { label: 'סך הכול', value: blockP.x + wedgeP, strong: true },
    ],
    scale,
    'רכיב x של התנע',
    fs,
  );
  bars(
    ctx,
    p,
    { x: 8 + wX + gap, y: top, w: view.w - 16 - wX - gap, h: bh },
    'y',
    [
      { label: 'גוש', value: blockP.y },
      { label: 'טריז', value: 0 },
      { label: 'סך', value: blockP.y, strong: true },
    ],
    scale,
    'רכיב y',
    fs,
  );
}

/* ---------------------------------------------------------------- the component */

export default function ImpulseLab(props: ImpulseLabProps) {
  const mode: Mode = props.mode ?? 'impulse';
  const scene: Scene = props.scene ?? 'recoil';
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const [narrow, setNarrow] = useState(false);
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  /** the learner acted since the last step (played, scrubbed, chose) */
  const user = useRef(false);
  /** shapes the learner chose, for the "shapes" task */
  const seenShapes = useRef(new Set<PulseShape>());
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const tEnd = runTime(mode, scene, s);

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next: State = { ...prev, playing: false };
          if (typeof st.shape === 'string' && (SHAPES as string[]).includes(st.shape)) next.shape = st.shape as PulseShape;
          const dur = num(st.dur);
          if (dur !== null) next.dur = clamp(snap(dur, DUR_STEP), DUR_MIN, DUR_MAX);
          if (st.outcome === 'stop' || st.outcome === 'bounce') next.outcome = st.outcome;
          next.ghost = bool(st.ghost) ?? prev.ghost;
          next.avg = bool(st.avg) ?? prev.avg;
          next.m1 = clamp(num(st.m1) ?? prev.m1, 0.5, 3);
          next.m2 = clamp(num(st.m2) ?? prev.m2, 0.5, 3);
          next.v0 = clamp(num(st.v0) ?? prev.v0, -0.5, 0.5);
          next.M = clamp(num(st.M) ?? prev.M, 1, 10);
          next.theta = clamp(num(st.theta) ?? prev.theta, 30, 60);
          next.fixed = bool(st.fixed) ?? prev.fixed;
          next.ext = bool(st.ext) ?? prev.ext;
          const T = runTime(mode, scene, next);
          const t = num(st.t);
          const tf = num(st.tFrac);
          next.t = t !== null ? clamp(t, 0, T) : tf !== null ? clamp(tf, 0, 1) * T : 0;
          stepState.current = next;
          user.current = false;
          return next;
        });
      }),
    [props.id],
  );

  // playback: a run plays in a few seconds (slow motion), stops at the end; still mode jumps to the end
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const seconds = mode === 'impulse' ? 4 : 3;
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (!document.hidden) {
        setS((prev) => {
          const T = runTime(mode, scene, prev);
          if (!motionAllowed()) return { ...prev, t: T, playing: false };
          const t = prev.t + (dt * T) / seconds;
          return t >= T ? { ...prev, t: T, playing: false } : { ...prev, t };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  // tasks: checked after the learner's own actions, never on the state a step set
  useEffect(() => {
    if (!user.current || s === stepState.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => has(t) && markTask(`${props.id}:${t}`);
    if (mode === 'impulse') {
      if (s.dur >= 0.06 - 1e-9) done('stretch');
      if (seenShapes.current.size === 3) done('shapes');
      if (s.outcome === 'bounce') done('bounce');
    } else if (scene === 'recoil') {
      const after = s.t >= pushTime(cartsOf(s));
      if (after) done('release');
      if (after && Math.max(s.m1 / s.m2, s.m2 / s.m1) >= 2 - 1e-9) done('unequal');
      if (after && Math.abs(s.v0) > 1e-9) done('moving');
    } else {
      const landed = s.t >= tEnd - 1e-9;
      if (landed && !s.fixed) done('slide');
      if (landed && s.fixed) done('fixed');
      if (landed && !s.fixed && s.M >= 8 - 1e-9) done('heavy');
    }
  }, [s]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(mode, scene, s, tEnd)), 600);
    return () => clearTimeout(h);
  }, [s.shape, s.dur, s.outcome, s.m1, s.m2, s.v0, s.M, s.theta, s.fixed, Math.round((s.t / tEnd) * 10)]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    // before layout the canvas can be a few pixels wide: the scales would come out negative
    if (view.w < 120 || view.h < 80) return;
    if (mode === 'impulse') paintImpulse(ctx, view, p, s);
    else if (scene === 'recoil') paintRecoil(ctx, view, p, s, tEnd);
    else paintWedge(ctx, view, p, s, tEnd);
  };
  const aspect = mode === 'impulse' ? (narrow ? 0.72 : 1.05) : scene === 'recoil' ? (narrow ? 1.05 : 1.8) : narrow ? 0.8 : 1.25;
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: aspect, worldHeight: 1, animate: false });
  useEffect(invalidate, [s, narrow]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.getBoundingClientRect().width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** a learner's change: it stops playback and starts the time again from 0 when the setup changes */
  const change = (f: (prev: State) => Partial<State>, keepTime = false) => {
    user.current = true;
    setS((prev) => ({ ...prev, ...f(prev), playing: false, ...(keepTime ? {} : { t: 0 }) }));
  };
  const scrub = (t: number) => change(() => ({ t: clamp(t, 0, tEnd) }), true);
  const play = () => {
    user.current = true;
    setS((prev) => {
      if (prev.playing) return { ...prev, playing: false };
      const T = runTime(mode, scene, prev);
      if (!motionAllowed()) return { ...prev, t: T, playing: false };
      return { ...prev, t: prev.t >= T - 1e-9 ? 0 : prev.t, playing: true };
    });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') play();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') scrub(s.t + tEnd / 60);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') scrub(s.t - tEnd / 60);
    else return;
    e.preventDefault();
  };
  const reset = () => {
    stepState.current = null;
    user.current = false;
    seenShapes.current.clear();
    setS(initial(props));
    setLive('האיור חזר למצב ההתחלה.');
  };

  const label =
    mode === 'impulse'
      ? 'איור חי: כדור פוגע בכרית על קיר. למטה, גרף הכוח של הכרית על הכדור כפונקציה של הזמן, עם השטח הצבוע מתחתיו, וגרף התנע של הכדור. '
      : scene === 'recoil'
        ? 'איור חי: שתי עגלות על מסילה חלקה וקפיץ דחוס ביניהן. למטה, התנע של כל עגלה והתנע הכולל. '
        : 'איור חי: גוש מחליק על טריז שחופשי לנוע על רצפה חלקה. למטה, רכיבי התנע של הגוש, של הטריז ושל שניהם יחד. ';

  return (
    <SimShell
      fig={props.id}
      label={`${label}${describe(mode, scene, s, tEnd)} Enter מפעיל, החצים מזיזים את הזמן.`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      readout={readout(mode, scene, s, tEnd)}
      controls={
        <>
          {mode === 'impulse' && (
            <>
              <div class="group" role="group" aria-label="צורת הדופק">
                {SHAPES.map((sh) => (
                  <Toggle
                    key={sh}
                    label={SHAPE_NAME[sh]}
                    on={s.shape === sh}
                    onChange={() => {
                      seenShapes.current.add(s.shape);
                      seenShapes.current.add(sh);
                      change(() => ({ shape: sh }), true);
                    }}
                  />
                ))}
              </div>
              <div class="group" role="group" aria-label="מה קורה לכדור">
                <Toggle label="נעצר" on={s.outcome === 'stop'} onChange={() => change(() => ({ outcome: 'stop' }), true)} />
                <Toggle label="חוזר לאחור" on={s.outcome === 'bounce'} onChange={() => change(() => ({ outcome: 'bounce' }), true)} />
              </div>
              <Slider label="משך המגע Δt" value={s.dur} min={DUR_MIN} max={DUR_MAX} step={DUR_STEP} format={(x) => `${Math.round(x * 1000)} ms`} onChange={(v) => change(() => ({ dur: clamp(snap(v, DUR_STEP), DUR_MIN, DUR_MAX) }), true)} />
              <div class="group" role="group" aria-label="מה להציג">
                <Toggle label="השוואה למשטח קשה" on={s.ghost} swatch="var(--ink-3)" onChange={(on) => change(() => ({ ghost: on }), true)} />
                <Toggle label="כוח ממוצע" on={s.avg} swatch="var(--ink-2)" onChange={(on) => change(() => ({ avg: on }), true)} />
              </div>
            </>
          )}
          {mode === 'conservation' && scene === 'recoil' && (
            <>
              <Slider label="מסת העגלה השמאלית" value={s.m1} min={0.5} max={3} step={0.5} format={(x) => `${fx(x, 1)} kg`} onChange={(v) => change(() => ({ m1: clamp(snap(v, 0.5), 0.5, 3) }))} />
              <Slider label="מסת העגלה הימנית" value={s.m2} min={0.5} max={3} step={0.5} format={(x) => `${fx(x, 1)} kg`} onChange={(v) => change(() => ({ m2: clamp(snap(v, 0.5), 0.5, 3) }))} />
              <Slider label="מהירות משותפת בהתחלה" value={s.v0} min={-0.5} max={0.5} step={0.1} format={(x) => `${fx(x, 1)} m/s`} onChange={(v) => change(() => ({ v0: clamp(snap(v, 0.1), -0.5, 0.5) }))} />
            </>
          )}
          {mode === 'conservation' && scene === 'wedge' && (
            <>
              <Slider label="מסת הטריז M" value={s.M} min={1} max={10} step={0.5} format={(x) => `${fx(x, 1)} kg`} onChange={(v) => change(() => ({ M: clamp(snap(v, 0.5), 1, 10) }))} />
              <Slider label="זווית הטריז" value={s.theta} min={30} max={60} step={5} format={(x) => `${Math.round(x)}°`} onChange={(v) => change(() => ({ theta: clamp(snap(v, 5), 30, 60) }))} />
              <div class="group" role="group" aria-label="הטריז">
                <Toggle label="טריז מקובע לרצפה" on={s.fixed} onChange={(on) => change(() => ({ fixed: on }))} />
                <Toggle label="כוחות חיצוניים" on={s.ext} swatch="var(--force)" onChange={(on) => change(() => ({ ext: on }), true)} />
              </div>
            </>
          )}
          <div class="group" role="group" aria-label="הרצה">
            <button type="button" class="btn primary" onClick={play}>
              {s.playing ? 'עצירה' : mode === 'conservation' && scene === 'recoil' && s.t === 0 ? 'שחררו' : 'הפעלה'}
            </button>
          </div>
          <Slider
            label="זמן"
            value={s.t}
            min={0}
            max={tEnd}
            step={tEnd / 400}
            format={(x) => (mode === 'impulse' ? `${Math.round(x * 1000)} ms` : `${fx(x, 2)} s`)}
            onChange={scrub}
          />
        </>
      }
    />
  );
}

/* ---------------------------------------------------------------- readouts and descriptions */

function readout(mode: Mode, scene: Scene, s: State, tEnd: number) {
  if (mode === 'impulse') {
    const pulse = pulseOf(s);
    const J = pulseImpulse(pulse);
    const now = clamp(s.t, 0, T_IMPULSE);
    const p = BALL_M * -BALL_V + cumulativeImpulse(pulse, now - T_CONTACT);
    return (
      <>
        <span class="q" data-readout="t">
          t = {Math.round(now * 1000)} ms
        </span>
        <span>
          המתקף, השטח מתחת לגרף:{' '}
          <b class="q" data-readout="J">
            J = {s3(J)} N·s
          </b>
        </span>
        <span>
          הכוח המרבי{' '}
          <b class="q" data-readout="peak">
            {s3(pulse.peak)} N
          </b>
        </span>
        <span>
          הכוח הממוצע{' '}
          <b class="q" data-readout="avg">
            J/Δt = {s3(J / pulse.duration)} N
          </b>
        </span>
        <span class="q" data-readout="p">
          p = <b>{s3(p, 1e-6)} kg·m/s</b>
        </span>
      </>
    );
  }
  if (scene === 'recoil') {
    const r = cartsOf(s);
    const st = recoilState(r, clamp(s.t, 0, tEnd));
    return (
      <>
        <span class="q" data-readout="t">
          t = {fx(s.t, 2)} s
        </span>
        <span class="q" data-readout="v1">
          v₁ = <b>{s3(st.v1, 1e-6)} m/s</b>
        </span>
        <span class="q" data-readout="v2">
          v₂ = <b>{s3(st.v2, 1e-6)} m/s</b>
        </span>
        <span>
          התנע הכולל{' '}
          <b class="q" data-readout="P">
            P = {s3(s.m1 * st.v1 + s.m2 * st.v2, 1e-6)} kg·m/s
          </b>
        </span>
        <span>
          הקפיץ דוחף במשך{' '}
          <b class="q" data-readout="tp">
            {s3(pushTime(r))} s
          </b>
        </span>
      </>
    );
  }
  const st = wedgeState(BLOCK_M, s.M, s.theta, WEDGE_H, clamp(s.t, 0, tEnd), s.fixed);
  const w = s.fixed ? fixedWedge(BLOCK_M, s.theta) : freeWedge(BLOCK_M, s.M, s.theta);
  const Nfl = s.M * G + w.N * Math.cos((s.theta * Math.PI) / 180);
  return (
    <>
      <span class="q" data-readout="t">
        t = {fx(st.t, 3)} s
      </span>
      <span>
        מהירות הטריז{' '}
        <b class="q" data-readout="V">
          V = {s3(Math.abs(st.Vx), 1e-6)} m/s
        </b>
      </span>
      <span data-readout="v">
        גוש:{' '}
        <b class="q">
          vx = {s3(st.vx, 1e-6)}, vy = {s3(st.vy, 1e-6)} m/s
        </b>
      </span>
      <span class="q" data-readout="Px">
        Px = <b>{s3(st.px, 1e-6)} kg·m/s</b>
      </span>
      <span class="q" data-readout="Py">
        Py = <b>{s3(st.py, 1e-6)} kg·m/s</b>
      </span>
      <span>
        הרצפה דוחפת{' '}
        <b class="q" data-readout="Nfloor">
          N′ = {s3(Nfl)} N
        </b>
        , והמשקל הכולל{' '}
        <b class="q" data-readout="W">
          {s3((s.M + BLOCK_M) * G)} N
        </b>
      </span>
    </>
  );
}

function describe(mode: Mode, scene: Scene, s: State, tEnd: number): string {
  if (mode === 'impulse') {
    const pulse = pulseOf(s);
    return `דופק בצורת ${SHAPE_NAME[s.shape]} שנמשך ${Math.round(s.dur * 1000)} אלפיות שנייה. המתקף ${s3(pulseImpulse(pulse))} ניוטון שנייה, והכוח המרבי ${s3(pulse.peak)} ניוטון. הכדור ${s.outcome === 'stop' ? 'נעצר' : 'חוזר לאחור'}.`;
  }
  if (scene === 'recoil') {
    const st = recoilState(cartsOf(s), clamp(s.t, 0, tEnd));
    return `העגלות במסות ${fx(s.m1, 1)} ו-${fx(s.m2, 1)} קילוגרם. ברגע ${fx(s.t, 2)} שניות מהירויותיהן ${s3(st.v1, 1e-6)} ו-${s3(st.v2, 1e-6)} מטר לשנייה, והתנע הכולל ${s3(s.m1 * st.v1 + s.m2 * st.v2, 1e-6)}.`;
  }
  const st = wedgeState(BLOCK_M, s.M, s.theta, WEDGE_H, clamp(s.t, 0, tEnd), s.fixed);
  return `טריז במסה ${fx(s.M, 1)} קילוגרם וזווית ${Math.round(s.theta)} מעלות${s.fixed ? ', מקובע לרצפה' : ''}. רכיב x של התנע הכולל ${s3(st.px, 1e-6)}, ורכיב y שלו ${s3(st.py, 1e-6)}.`;
}
