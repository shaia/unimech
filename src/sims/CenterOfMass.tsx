/**
 * CenterOfMass (lesson 3.4): the centre of mass at rest and in motion. Four scenes:
 * - 'points': draggable point masses on a grid in metres, each with its own mass; the centre of mass is marked, and,
 *   on request, the plain (unweighted) average of the positions beside it.
 * - 'body': a continuous body (a rod of uniform density or of λ ∝ x, an isosceles triangular plate, a half-disc and a
 *   half-ring of wire) cut into N strips; one strip dm is highlighted with its coordinate; the centre of mass computed
 *   from the N strips (a Riemann sum) beside the exact one.
 * - 'burst': a shell that bursts in flight into two fragments. While both fly, their centre of mass stays on the
 *   unexploded parabola; once one lands, the ground pushes on the system and the centre of mass leaves the parabola.
 * - 'plank': a person walking on a plank that floats on frictionless water; their centre of mass stays put.
 *
 * Every number comes from src/physics/centerofmass.ts. Tasks tick only in the learner's own handlers (a drag, a
 * slider, a chip, the fire button); a text step sets the state directly and never goes through those handlers.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  burstAt,
  burstPlan,
  centerOfMass,
  cmAccelerationY,
  exactCM,
  numericCM,
  parabolaAt,
  plankCentre,
  stripsOf,
  totalMass,
  unweightedMean,
  type Burst,
  type PointMass,
  type Shape,
  type Vec2,
} from '~/physics/centerofmass';
import { G } from '~/physics/constants';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Scene = 'points' | 'body' | 'burst' | 'plank';
export type BodyKind = 'rod' | 'triangle' | 'half-disc' | 'half-ring';
export type RodDensity = 'uniform' | 'linear';

const NARROW_W = 520;

/** A quantity isolated as LTR (U+2066 … U+2069) with no-break spaces, so it reads left to right in Hebrew. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  drag: 'גררו אחת המסות למקום אחר. לאן זז מרכז המסה?',
  heavy: 'הגדילו מסה אחת עד שהיא כבדה פי 4 לפחות מכל אחת מהאחרות. איפה מרכז המסה עכשיו?',
  equal: 'השוו את שלוש המסות זו לזו. מתי מרכז המסה מתלכד עם הממוצע הפשוט?',
  'rod-linear': `בחרו מוט שהצפיפות שלו גדלה לאורכו, ${ltr('λ ∝ x')}. לאיזה צד זז מרכז המסה?`,
  'wire-vs-disc': 'השוו בין חצי דיסקה לחצי טבעת של תיל באותו רדיוס. איזה מרכז מסה גבוה יותר?',
  converge: 'בגוף שאינו המוט האחיד, הגדילו את מספר הרצועות ל-40. כמה התקרב החישוב לערך המדויק?',
  fire: 'ירו את הפגז פעם אחת, בכפתור "ירו".',
  'on-parabola': 'הזיזו את פס הזמן לרגע שאחרי הפיצוץ, כששני הרסיסים עוד באוויר. איפה מרכז המסה?',
  leaves: 'הזיזו את פס הזמן אל אחרי הנחיתה של הרסיס הראשון. מה קורה למרכז המסה?',
  unequal: 'שנו את חלוקת המסה בין הרסיסים, וירו שוב.',
  walk: 'הזיזו את האדם עד הקצה השני של הקרש. כמה זז הקרש?',
  'heavy-person': 'הגדילו את המסה של האדם עד שהיא לפחות כמו של הקרש, והזיזו אותו שוב עד הקצה.',
};

const BODY_LABEL: Record<BodyKind, string> = {
  rod: 'מוט',
  triangle: 'משולש',
  'half-disc': 'חצי דיסקה',
  'half-ring': 'חצי טבעת (תיל)',
};
const BODY_KINDS = Object.keys(BODY_LABEL) as BodyKind[];

/** The bodies of the 'body' scene, in metres. */
const ROD_L = 1.5;
const TRI_BASE = 1.2;
const TRI_H = 0.9;
const RADIUS = 0.6;

function shapeOf(kind: BodyKind, rod: RodDensity): Shape {
  switch (kind) {
    case 'rod':
      return rod === 'uniform' ? { kind, L: ROD_L, lamA: 1, lamB: 1 } : { kind, L: ROD_L, lamA: 0, lamB: 1 };
    case 'triangle':
      return { kind, base: TRI_BASE, h: TRI_H, sigma: 1 };
    case 'half-disc':
      return { kind, R: RADIUS, sigma: 1 };
    case 'half-ring':
      return { kind, R: RADIUS, lam: 1 };
  }
}

/** The world window of each body, [xmin, xmax, ymin, ymax] in metres. */
function bodyWindow(kind: BodyKind): [number, number, number, number] {
  if (kind === 'rod') return [-0.2, ROD_L + 0.2, -0.45, 0.45];
  if (kind === 'triangle') return [-0.8, 0.8, -0.12, TRI_H + 0.12];
  return [-0.8, 0.8, -0.12, RADIUS + 0.12];
}

export interface MassSpec {
  m: number;
  x: number;
  y: number;
}

export interface CenterOfMassProps {
  id: string;
  scene?: Scene;
  /** points: the masses [kg] and their positions [m], and whether the plain average is shown */
  masses?: MassSpec[];
  mean?: boolean;
  /** body */
  body?: BodyKind;
  rod?: RodDensity;
  strips?: number;
  /** burst: launch speed [m/s] and angle [deg]; fragment 1's share, the separation speed [m/s] and its direction [deg] */
  v0?: number;
  angleDeg?: number;
  fraction?: number;
  u?: number;
  phiDeg?: number;
  /** plank: person's and plank's masses [kg], plank length [m] */
  mPerson?: number;
  mPlank?: number;
  plankL?: number;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

interface PointsState {
  masses: MassSpec[];
  mean: boolean;
  sel: number;
}
interface BodyState {
  body: BodyKind;
  rod: RodDensity;
  strips: number;
}
interface BurstState {
  fraction: number;
  u: number;
  phi: number;
  /** the instant shown [s]; negative: a fraction of the last landing time, resolved later */
  time: number;
}
interface PlankState {
  m: number;
  M: number;
  s: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
/** A readout number: 3 significant figures, a true minus sign, no "−0". */
const signed = (x: number, tiny = 0) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));

const DEFAULT_MASSES: MassSpec[] = [
  { m: 2, x: 1, y: 1 },
  { m: 1, x: 5, y: 1 },
  { m: 1, x: 3, y: 3 },
];
const PW = 6;
const PH = 4;
const M_MIN = 0.5;
const M_MAX = 5;

/** A world box fitted into a canvas region with padding, y up. */
interface Frame {
  k: number;
  sx: (x: number) => number;
  sy: (y: number) => number;
  wx: (px: number) => number;
  wy: (py: number) => number;
}
function fit(region: { x: number; y: number; w: number; h: number }, win: [number, number, number, number], pad: number, bottom = false): Frame {
  const [x0, x1, y0, y1] = win;
  // never zero or negative: a canvas still being laid out can be smaller than its padding
  const k = Math.max(1e-3, Math.min((region.w - 2 * pad) / (x1 - x0), (region.h - 2 * pad) / (y1 - y0)));
  const cx = region.x + region.w / 2;
  // centred, or with the window's bottom edge on the region's bottom (a ground line low in the frame)
  const cy = bottom ? region.y + region.h - pad - ((y1 - y0) / 2) * k : region.y + region.h / 2;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  return {
    k,
    sx: (x) => cx + (x - mx) * k,
    sy: (y) => cy - (y - my) * k,
    wx: (px) => mx + (px - cx) / k,
    wy: (py) => my - (py - cy) / k,
  };
}

/** Canvas text with a paper halo (Latin and math labels; Hebrew goes through handNote). */
function haloText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { font: string; color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline }) {
  ctx.save();
  ctx.direction = 'ltr';
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

/** Hebrew handwriting with a paper halo, centred at (x, y). */
function hebNote(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.font = `500 ${size}px ${p.fontHand}`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.restore();
  handNote(ctx, s, x, y, p, size);
}

/** The centre-of-mass glyph: a disc in quarters, two filled and two open. */
function cmGlyph(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number, color = p.accent) {
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  for (const a0 of [0, Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, a0 - Math.PI / 2, a0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function dashed(ctx: CanvasRenderingContext2D, color: string, pts: [number, number][], dash = [6, 5], width = 1.4) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();
}

export default function CenterOfMass(props: CenterOfMassProps) {
  const scene: Scene = props.scene ?? 'points';
  const L = props.plankL ?? 6;
  const v0 = props.v0 ?? 20;
  const angleDeg = props.angleDeg ?? 60;
  const tTop = (v0 * Math.sin((angleDeg * Math.PI) / 180)) / G;

  const initialPoints = (): PointsState => ({
    masses: (props.masses ?? DEFAULT_MASSES).map((q) => ({ ...q })),
    mean: props.mean ?? false,
    sel: 0,
  });
  const initialBody = (): BodyState => ({ body: props.body ?? 'rod', rod: props.rod ?? 'uniform', strips: clamp(props.strips ?? 8, 1, 40) });
  const initialBurst = (): BurstState => ({ fraction: props.fraction ?? 0.5, u: props.u ?? 10, phi: props.phiDeg ?? 30, time: 0 });
  const initialPlank = (): PlankState => ({ m: props.mPerson ?? 50, M: props.mPlank ?? 200, s: 0 });

  const [pts, setPts] = useState<PointsState>(initialPoints);
  const [bod, setBod] = useState<BodyState>(initialBody);
  const [bst, setBst] = useState<BurstState>(initialBurst);
  const [plk, setPlk] = useState<PlankState>(initialPlank);
  const [flying, setFlying] = useState(false);
  const [live, setLive] = useState('');
  const [narrow, setNarrow] = useState(false);
  const dragging = useRef<number | null>(null);
  const moved = useRef(false);
  const t0 = useRef<number | null>(null);
  const seen = useRef<Set<BodyKind>>(new Set());

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  const burst: Burst = { v0, angleDeg, tBurst: tTop, fraction: bst.fraction, u: bst.u, phiDeg: bst.phi };
  const plan = scene === 'burst' ? burstPlan(burst) : null;
  const tEnd = plan ? plan.tLast : 1;

  // text steps set the state and the instant shown; they never fire, drag or tick
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setFlying(false);
        if (scene === 'points') {
          setPts((prev) => {
            const ms = Array.isArray(st.masses)
              ? (st.masses as unknown[]).map((q, i) => {
                  const o = (q ?? {}) as Record<string, unknown>;
                  const d = prev.masses[i] ?? DEFAULT_MASSES[i] ?? DEFAULT_MASSES[0];
                  return { m: clamp(num(o.m) ?? d.m, M_MIN, M_MAX), x: clamp(num(o.x) ?? d.x, 0, PW), y: clamp(num(o.y) ?? d.y, 0, PH) };
                })
              : prev.masses;
            return { masses: ms, mean: bool(st.mean) ?? prev.mean, sel: Math.min(prev.sel, ms.length - 1) };
          });
        } else if (scene === 'body') {
          setBod((prev) => ({
            body: typeof st.body === 'string' && st.body in BODY_LABEL ? (st.body as BodyKind) : prev.body,
            rod: st.rod === 'uniform' || st.rod === 'linear' ? st.rod : prev.rod,
            strips: clamp(Math.round(num(st.strips) ?? prev.strips), 1, 40),
          }));
        } else if (scene === 'burst') {
          const t = num(st.t);
          const tf = num(st.tFrac);
          setBst((prev) => ({
            fraction: clamp(num(st.fraction) ?? prev.fraction, 0.2, 0.8),
            u: clamp(num(st.u) ?? prev.u, 0, 20),
            phi: clamp(num(st.phi) ?? prev.phi, -60, 60),
            time: t !== null ? Math.max(0, t) : tf !== null ? -Math.max(1e-9, tf) : prev.time,
          }));
        } else {
          setPlk((prev) => ({ m: clamp(num(st.mPerson) ?? prev.m, 30, 150), M: clamp(num(st.mPlank) ?? prev.M, 50, 400), s: clamp(num(st.s) ?? prev.s, 0, L) }));
        }
      }),
    [props.id],
  );
  // a time given as a fraction of the run is resolved once the run is known
  useEffect(() => {
    if (scene === 'burst' && bst.time < 0) setBst((b) => ({ ...b, time: -b.time * tEnd }));
  }, [bst.time, tEnd]);

  /* ------------------------------------------------------------------ drawing */

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    // a canvas still being laid out: nothing sensible to draw yet (the resize redraws it)
    if (view.w < 40 || view.h < 40) return;
    const nar = view.w < NARROW_W;
    const fs = nar ? 11 : 13;
    const hand = nar ? 13 : 15;
    const region = { x: 0, y: 0, w: view.w, h: view.h };

    if (scene === 'points') {
      const F = fit(region, [-0.3, PW + 0.3, -0.3, PH + 0.3], nar ? 6 : 14);
      // the grid, one line every 0.5 m, a heavier one every metre, with the metre numbers
      // (withAlpha replaces the alpha of --rule, itself rgba at 0.14: the half-metre lines take a lower one, the
      // metre lines a higher one and a wider stroke)
      const gridLine = (half: boolean) => {
        ctx.strokeStyle = withAlpha(p.rule, half ? 0.08 : 0.3);
        ctx.lineWidth = half ? 1 : 1.5;
      };
      ctx.save();
      for (let i = 0; i <= PW * 2; i++) {
        const x = i / 2;
        gridLine(i % 2 === 1);
        ctx.beginPath();
        ctx.moveTo(F.sx(x), F.sy(0));
        ctx.lineTo(F.sx(x), F.sy(PH));
        ctx.stroke();
      }
      for (let j = 0; j <= PH * 2; j++) {
        const y = j / 2;
        gridLine(j % 2 === 1);
        ctx.beginPath();
        ctx.moveTo(F.sx(0), F.sy(y));
        ctx.lineTo(F.sx(PW), F.sy(y));
        ctx.stroke();
      }
      ctx.restore();
      for (let i = 1; i < PW; i++) haloText(ctx, p, String(i), F.sx(i), F.sy(0) + fs * 0.75, { font: `${fs - 1}px ${p.fontUi}`, color: p.ink3 });
      for (let j = 1; j < PH; j++) haloText(ctx, p, String(j), F.sx(0) - 3, F.sy(j), { font: `${fs - 1}px ${p.fontUi}`, color: p.ink3, align: 'right' });
      haloText(ctx, p, 'x (m)', F.sx(PW) - 2, F.sy(0) + fs * 0.75, { font: `italic 600 ${fs - 1}px ${p.fontUi}`, color: p.ink2, align: 'right' });

      const ps: PointMass[] = pts.masses.map((q) => ({ m: q.m, r: [q.x, q.y] }));
      const cm = centerOfMass(ps);
      // faint lines from the centre of mass to each mass
      for (const q of pts.masses) dashed(ctx, withAlpha(p.ink3, 0.8), [[F.sx(cm[0]), F.sy(cm[1])], [F.sx(q.x), F.sy(q.y)]], [3, 4], 1);
      pts.masses.forEach((q, i) => {
        const r = Math.max(7, F.k * 0.16 * Math.cbrt(q.m));
        const X = F.sx(q.x);
        const Y = F.sy(q.y);
        ctx.save();
        ctx.fillStyle = p.ink;
        ctx.beginPath();
        ctx.arc(X, Y, r, 0, Math.PI * 2);
        ctx.fill();
        if (i === pts.sel) {
          ctx.strokeStyle = p.accent;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(X, Y, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        // the label above the mass, or below it near the top edge
        const above = Y - r - fs * 0.9 > 4;
        haloText(ctx, p, `m${'₁₂₃₄'[i]} = ${sci(q.m)} kg`, X, above ? Y - r - fs * 0.8 : Y + r + fs * 0.8, { font: `600 ${fs}px ${p.fontUi}` });
      });
      if (pts.mean) {
        const mu = unweightedMean(ps);
        const X = F.sx(mu[0]);
        const Y = F.sy(mu[1]);
        const s = nar ? 6 : 8;
        ctx.save();
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(X - s, Y - s);
        ctx.lineTo(X + s, Y + s);
        ctx.moveTo(X - s, Y + s);
        ctx.lineTo(X + s, Y - s);
        ctx.stroke();
        ctx.restore();
        const sameSpot = Math.hypot(mu[0] - cm[0], mu[1] - cm[1]) < 1e-9;
        // beside the cross, on the side away from the centre of mass (or above it when they coincide)
        ctx.save();
        ctx.font = `500 ${hand}px ${p.fontHand}`;
        const w = ctx.measureText('ממוצע פשוט').width;
        ctx.restore();
        const right = mu[0] >= cm[0];
        if (sameSpot) hebNote(ctx, p, 'ממוצע פשוט', X, Y - s - hand * 1.6, hand);
        else hebNote(ctx, p, 'ממוצע פשוט', right ? X + s + 4 + w / 2 : X - s - 4 - w / 2, Y, hand);
      }
      const rc = nar ? 8 : 10;
      cmGlyph(ctx, p, F.sx(cm[0]), F.sy(cm[1]), rc);
      // the label to the upper left of the glyph, where the plain average (pulled the other way) is not
      const mu = unweightedMean(ps);
      // of the four corners around the glyph, the one farthest from every mass (and from the plain average)
      const others: [number, number][] = pts.masses.map((q) => [F.sx(q.x), F.sy(q.y)]);
      if (pts.mean) others.push([F.sx(mu[0]), F.sy(mu[1])]);
      const gx = F.sx(cm[0]);
      const gy = F.sy(cm[1]);
      const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const clear = (c: [number, number]) => Math.min(...others.map(([ox, oy]) => Math.hypot(gx + c[0] * (rc + 12) - ox, gy + c[1] * (rc + 8) - oy)));
      const [cx, cy] = corners.reduce((best, c) => (clear(c) > clear(best) + 1 ? c : best), corners[0]);
      haloText(ctx, p, 'cm', gx + cx * (rc + 3), gy + cy * (rc + 3), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.accent, align: cx < 0 ? 'right' : 'left', baseline: cy < 0 ? 'bottom' : 'top' });
      return;
    }

    if (scene === 'body') {
      const shape = shapeOf(bod.body, bod.rod);
      const st = stripsOf(shape);
      const N = bod.strips;
      const exact = exactCM(shape);
      const numeric = numericCM(shape, N).coord;
      const F = fit(region, bodyWindow(bod.body), nar ? 10 : 22);
      const hi = Math.min(N - 1, Math.floor(0.62 * N));
      const ds = (st.b - st.a) / N;
      const fill = withAlpha(p.ink2, 0.28);
      const edge = p.ink;
      const strong = withAlpha(p.accent, 0.55);
      ctx.save();
      ctx.lineJoin = 'round';
      if (bod.body === 'rod') {
        const th = Math.max(16, 0.12 * F.k);
        const y0 = F.sy(0);
        // the density as shading: one rectangle per strip, its darkness by λ at its middle
        for (let i = 0; i < N; i++) {
          const xm = st.a + (i + 0.5) * ds;
          const lam = st.dmds(xm);
          ctx.fillStyle = i === hi ? strong : withAlpha(p.ink2, 0.12 + 0.5 * lam);
          ctx.fillRect(F.sx(xm - ds / 2), y0 - th / 2, ds * F.k, th);
        }
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(F.sx(0), y0 - th / 2, ROD_L * F.k, th);
        ctx.strokeStyle = withAlpha(p.ink, 0.5);
        ctx.lineWidth = 1;
        for (let i = 1; i < N; i++) {
          const x = F.sx(st.a + i * ds);
          ctx.beginPath();
          ctx.moveTo(x, y0 - th / 2);
          ctx.lineTo(x, y0 + th / 2);
          ctx.stroke();
        }
        // the x axis under the rod, in metres
        const ya = y0 + th / 2 + fs * 1.6;
        ctx.strokeStyle = p.ink2;
        ctx.beginPath();
        ctx.moveTo(F.sx(0), ya);
        ctx.lineTo(F.sx(ROD_L), ya);
        ctx.stroke();
        for (const x of [0, 0.5, 1, 1.5]) {
          ctx.beginPath();
          ctx.moveTo(F.sx(x), ya - 3);
          ctx.lineTo(F.sx(x), ya + 3);
          ctx.stroke();
          haloText(ctx, p, sci(x), F.sx(x), ya + fs * 0.9, { font: `${fs - 1}px ${p.fontUi}`, color: p.ink2 });
        }
        haloText(ctx, p, 'x (m)', F.sx(ROD_L) + 6, ya, { font: `italic 600 ${fs - 1}px ${p.fontUi}`, color: p.ink2, align: 'left' });
        // the highlighted strip: dm = λ dx at x
        const xm = st.a + (hi + 0.5) * ds;
        haloText(ctx, p, 'dm = λ dx', F.sx(xm), y0 - th / 2 - fs * 0.9, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink });
        // the centre of mass, exact and from N strips
        const r = nar ? 7 : 9;
        cmGlyph(ctx, p, F.sx(exact), y0, r);
        if (Math.abs(F.sx(numeric) - F.sx(exact)) > 1.5) {
          ctx.save();
          ctx.fillStyle = p.velocity;
          ctx.beginPath();
          ctx.moveTo(F.sx(numeric), y0 + th / 2 + 2);
          ctx.lineTo(F.sx(numeric) - 5, y0 + th / 2 + 10);
          ctx.lineTo(F.sx(numeric) + 5, y0 + th / 2 + 10);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        return;
      }

      // the plates and the wire: y axis up from the flat edge, the diameter or the base on the x axis
      const yA = F.sy(0);
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(F.sx(-0.75), yA);
      ctx.lineTo(F.sx(0.75), yA);
      ctx.moveTo(F.sx(0), yA + 4);
      ctx.lineTo(F.sx(0), F.sy(bodyWindow(bod.body)[3] - 0.03));
      ctx.stroke();
      haloText(ctx, p, 'y', F.sx(0) + 6, F.sy(bodyWindow(bod.body)[3] - 0.05), { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'left' });

      if (bod.body === 'half-ring') {
        // the wire, cut into N arcs; the highlighted arc dm = λR dθ at angle θ, at height R sin θ
        const R = RADIUS;
        ctx.lineCap = 'butt';
        for (let i = 0; i < N; i++) {
          ctx.strokeStyle = i === hi ? p.accent : i % 2 ? p.ink : withAlpha(p.ink, 0.6);
          ctx.lineWidth = i === hi ? 7 : 4;
          ctx.beginPath();
          ctx.arc(F.sx(0), F.sy(0), R * F.k, -(i * ds), -((i + 1) * ds), true);
          ctx.stroke();
        }
        const thm = (hi + 0.5) * ds;
        const px = F.sx(R * Math.cos(thm));
        const py = F.sy(R * Math.sin(thm));
        dashed(ctx, p.ink2, [[F.sx(0), F.sy(0)], [px, py]], [4, 4], 1.2);
        dashed(ctx, p.accent, [[px, py], [px, yA]], [3, 3], 1.4);
        haloText(ctx, p, 'R sin θ', px + (Math.cos(thm) >= 0 ? 6 : -6), (py + yA) / 2, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.accent, align: Math.cos(thm) >= 0 ? 'left' : 'right' });
        haloText(ctx, p, 'dm = λR dθ', px + (Math.cos(thm) >= 0 ? 10 : -10), py - fs, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink, align: Math.cos(thm) >= 0 ? 'left' : 'right' });
        // the angle θ at the centre
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(F.sx(0), F.sy(0), 0.16 * F.k, 0, -thm, true);
        ctx.stroke();
        haloText(ctx, p, 'θ', F.sx(0.2 * Math.cos(thm / 2)), F.sy(0.2 * Math.sin(thm / 2)), { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2 });
      } else {
        // a plate cut into N horizontal strips; the highlighted strip dm = σ w(y) dy at height y
        const width = (y: number) => (bod.body === 'triangle' ? TRI_BASE * (1 - y / TRI_H) : 2 * Math.sqrt(Math.max(0, RADIUS * RADIUS - y * y)));
        for (let i = 0; i < N; i++) {
          const ya = st.a + i * ds;
          const yb = ya + ds;
          // the outline of the strip follows the body's edge
          ctx.fillStyle = i === hi ? strong : fill;
          ctx.beginPath();
          const n = 12;
          for (let k = 0; k <= n; k++) {
            const y = ya + ((yb - ya) * k) / n;
            const x = width(y) / 2;
            if (k === 0) ctx.moveTo(F.sx(x), F.sy(y));
            else ctx.lineTo(F.sx(x), F.sy(y));
          }
          for (let k = n; k >= 0; k--) {
            const y = ya + ((yb - ya) * k) / n;
            ctx.lineTo(F.sx(-width(y) / 2), F.sy(y));
          }
          ctx.closePath();
          ctx.fill();
          if (i > 0) {
            ctx.strokeStyle = withAlpha(p.ink, 0.45);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(F.sx(-width(ya) / 2), F.sy(ya));
            ctx.lineTo(F.sx(width(ya) / 2), F.sy(ya));
            ctx.stroke();
          }
        }
        // the outline
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        if (bod.body === 'triangle') {
          ctx.moveTo(F.sx(-TRI_BASE / 2), F.sy(0));
          ctx.lineTo(F.sx(0), F.sy(TRI_H));
          ctx.lineTo(F.sx(TRI_BASE / 2), F.sy(0));
          ctx.closePath();
        } else {
          ctx.arc(F.sx(0), F.sy(0), RADIUS * F.k, 0, -Math.PI, true);
          ctx.closePath();
        }
        ctx.stroke();
        const ym = st.a + (hi + 0.5) * ds;
        const xr = width(ym) / 2;
        // beside the strip's right end; where that would leave the canvas, above the strip's right half
        const dmFont = `italic 600 ${fs}px ${p.fontUi}`;
        ctx.save();
        ctx.font = dmFont;
        const wdm = ctx.measureText('dm = σ w dy').width;
        ctx.restore();
        if (F.sx(xr) + 8 + wdm < view.w - 4) haloText(ctx, p, 'dm = σ w dy', F.sx(xr) + 8, F.sy(ym), { font: dmFont, color: p.ink, align: 'left' });
        else haloText(ctx, p, 'dm = σ w dy', F.sx(xr * 0.5), F.sy(ym + ds / 2) - fs * 0.8, { font: dmFont, color: p.ink });
        // the strip's width w(y), drawn across it
        arrow(ctx, F.sx(0), F.sy(ym), F.sx(-xr) + 1, F.sy(ym), { color: p.ink2, width: 1.2, head: 6 });
        arrow(ctx, F.sx(0), F.sy(ym), F.sx(xr) - 1, F.sy(ym), { color: p.ink2, width: 1.2, head: 6 });
      }
      // the centre of mass: exact (the glyph, with a dashed line at its height) and from N strips (a small triangle)
      const r = nar ? 7 : 9;
      dashed(ctx, withAlpha(p.accent, 0.8), [[F.sx(-0.75), F.sy(exact)], [F.sx(0.75), F.sy(exact)]], [6, 5], 1.2);
      cmGlyph(ctx, p, F.sx(0), F.sy(exact), r);
      if (Math.abs(F.sy(numeric) - F.sy(exact)) > 1.5) {
        ctx.fillStyle = p.velocity;
        ctx.beginPath();
        const xn = F.sx(0) - r - 4;
        ctx.moveTo(xn, F.sy(numeric));
        ctx.lineTo(xn - 9, F.sy(numeric) - 5);
        ctx.lineTo(xn - 9, F.sy(numeric) + 5);
        ctx.closePath();
        ctx.fill();
      }
      haloText(ctx, p, 'cm', F.sx(-0.75), F.sy(exact) - fs * 0.8, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.accent, align: 'left' });
      ctx.restore();
      return;
    }

    if (scene === 'burst' && plan) {
      // the instant shown
      let now = clamp(bst.time, 0, tEnd);
      if (flying) {
        if (t0.current === null) t0.current = t;
        const rate = tEnd / 4; // a shot plays in four seconds
        now = Math.min((t - t0.current) * rate, tEnd);
        if (now >= tEnd) land();
      }
      // the window: the whole flight of both fragments and the unexploded parabola, from a fixed setup
      const xMax = Math.max(plan.range, plan.frags[0].xLand, plan.frags[1].xLand) * 1.04 + 1;
      const xMin = Math.min(0, plan.frags[0].xLand, plan.frags[1].xLand) - 1;
      const peak = Math.max(...plan.frags.map((f) => f.r0[1] + Math.max(0, f.v0[1]) ** 2 / (2 * G)));
      const F = fit({ x: 0, y: 0, w: view.w, h: view.h - (nar ? 22 : 26) }, [xMin, xMax, -0.06 * peak, peak * 1.12], nar ? 8 : 16, true);
      // the ground, with metre marks every 10 m
      const g0 = F.sy(0);
      ctx.save();
      ctx.fillStyle = withAlpha(p.ink3, 0.18);
      ctx.fillRect(0, g0, view.w, view.h - g0);
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, g0);
      ctx.lineTo(view.w, g0);
      ctx.stroke();
      ctx.restore();
      const step = xMax - xMin > 60 ? 20 : 10;
      for (let x = 0; x <= xMax; x += step) {
        ctx.strokeStyle = p.ink2;
        ctx.beginPath();
        ctx.moveTo(F.sx(x), g0);
        ctx.lineTo(F.sx(x), g0 + 4);
        ctx.stroke();
        haloText(ctx, p, x === 0 ? '0' : `${x}`, F.sx(x), g0 + fs * 0.95, { font: `${fs - 1}px ${p.fontUi}`, color: p.ink2 });
      }
      haloText(ctx, p, 'x (m)', view.w - 6, g0 + fs * 0.95, { font: `italic 600 ${fs - 1}px ${p.fontUi}`, color: p.ink2, align: 'right' });

      // the unexploded parabola, dashed, from the launch to the range
      const parab: [number, number][] = [];
      for (let i = 0; i <= 80; i++) {
        const r = parabolaAt(burst, (plan.tFlight * i) / 80);
        parab.push([F.sx(r[0]), F.sy(r[1])]);
      }
      dashed(ctx, p.ink3, parab, [6, 5], 1.4);
      // the fragments' full paths (faint) and the centre of mass's path up to now
      const samples = 160;
      const trail = (f: (s: ReturnType<typeof burstAt>) => Vec2, until: number, color: string, width: number, dash: number[] = []) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        for (let i = 0; i <= samples; i++) {
          const tt = (until * i) / samples;
          const r = f(burstAt(burst, tt, plan));
          if (i) ctx.lineTo(F.sx(r[0]), F.sy(r[1]));
          else ctx.moveTo(F.sx(r[0]), F.sy(r[1]));
        }
        ctx.stroke();
        ctx.restore();
      };
      trail((s) => s.r[0], tEnd, withAlpha(p.ink2, 0.35), 1.2);
      trail((s) => s.r[1], tEnd, withAlpha(p.ink2, 0.35), 1.2);
      trail((s) => s.r[0], now, p.ink2, 1.6);
      trail((s) => s.r[1], now, p.ink2, 1.6);
      trail((s) => s.cm, now, p.accent, 2.6);
      // the burst point
      const bx = F.sx(plan.rB[0]);
      const by = F.sy(plan.rB[1]);
      ctx.save();
      ctx.strokeStyle = p.force;
      ctx.lineWidth = 1.6;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(bx + 5 * Math.cos(a), by + 5 * Math.sin(a));
        ctx.lineTo(bx + 10 * Math.cos(a), by + 10 * Math.sin(a));
        ctx.stroke();
      }
      ctx.restore();
      // labels: the parabola (beyond the burst, on its descending side) and the landed fragment
      const s = burstAt(burst, now, plan);
      // a legend in the ground band, bottom left: a dashed sample and its name (the parabola itself runs under
      // the centre of mass's path until the first landing, so a label on it would point at the wrong curve)
      ctx.save();
      ctx.font = `500 ${hand}px ${p.fontHand}`;
      const wLab = ctx.measureText('הפרבולה בלי פיצוץ').width;
      ctx.restore();
      const ly = view.h - hand * 0.75;
      dashed(ctx, p.ink2, [[8, ly], [34, ly]], [6, 5], 1.6);
      hebNote(ctx, p, 'הפרבולה בלי פיצוץ', 40 + wLab / 2, ly, hand);
      // the fragments, sized by their masses, labelled 1 and 2; one on the ground is lifted by its radius so it
      // rests on the ground line, and the centre of mass's glyph is lifted by the mass-weighted lift, so it stays on
      // the bodies as drawn (and clear of the 0 mark under the launch point)
      let cmLift = 0;
      s.r.forEach((r, i) => {
        const f = plan.frags[i].fraction;
        const rad = Math.max(4, (nar ? 7 : 10) * Math.sqrt(f / 0.5));
        const lift = r[1] <= 0 ? rad : 0;
        cmLift += f * lift;
        ctx.save();
        ctx.fillStyle = p.ink;
        ctx.beginPath();
        ctx.arc(F.sx(r[0]), F.sy(r[1]) - lift, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // the number on the side away from the centre of mass's glyph
        const side = r[0] >= s.cm[0] ? 1 : -1;
        if (now > burst.tBurst) haloText(ctx, p, i ? '2' : '1', F.sx(r[0]) + side * (rad + 6), F.sy(r[1]) - (r[1] <= 0 ? 2 * rad + 4 : rad + 4), { font: `600 ${fs}px ${p.fontUi}`, color: p.ink });
      });
      const rc = nar ? 7 : 9;
      cmGlyph(ctx, p, F.sx(s.cm[0]), F.sy(s.cm[1]) - cmLift, rc);
      // the landed fragment's note, above it and to its left, clear of its number label (upper right)
      if (now >= plan.tFirst && now < tEnd) {
        const i = plan.frags[0].tLand <= plan.frags[1].tLand ? 0 : 1;
        ctx.save();
        ctx.font = `500 ${hand}px ${p.fontHand}`;
        const wn = ctx.measureText('רסיס נחת').width;
        ctx.restore();
        hebNote(ctx, p, 'רסיס נחת', Math.max(wn / 2 + 4, F.sx(s.r[i][0]) - wn / 2 - 6), g0 - hand * 2.2, hand);
      }
      return;
    }

    if (scene === 'plank') {
      const m = plk.m;
      const M = plk.M;
      // the centre of mass is held where it was with the person at the left end and the plank centred on 0
      const Xcm = (m * (-L / 2) + M * 0) / (m + M);
      const xc = plankCentre(m, M, L, plk.s, Xcm);
      const xc0 = 0;
      const win: [number, number, number, number] = [-L / 2 - 2.2, L / 2 + 1.2, -1.2, 2.6];
      const F = fit(region, win, nar ? 6 : 14);
      const yw = F.sy(0);
      // the water and the shore post
      ctx.save();
      ctx.fillStyle = withAlpha(p.ink3, 0.16);
      ctx.fillRect(0, yw, view.w, view.h - yw);
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, yw);
      ctx.lineTo(view.w, yw);
      ctx.stroke();
      const post = -L / 2 - 1.6;
      ctx.fillStyle = p.ink2;
      ctx.fillRect(F.sx(post) - 3, F.sy(1.4), 6, F.sy(-1.1) - F.sy(1.4));
      ctx.restore();
      // above the post's top, centred on it but kept on the canvas: to its right it ran into the person's head,
      // who starts 1.6 m from the post
      ctx.save();
      ctx.font = `500 ${hand}px ${p.fontHand}`;
      const wPost = ctx.measureText('עמוד קבוע').width;
      ctx.restore();
      hebNote(ctx, p, 'עמוד קבוע', Math.max(wPost / 2 + 4, F.sx(post)), F.sy(1.4) - hand * 0.9, hand);
      // marks every metre on the water line, from the post
      for (let x = -L / 2 - 1; x <= L / 2 + 1; x += 1) {
        ctx.strokeStyle = withAlpha(p.ink2, 0.6);
        ctx.beginPath();
        ctx.moveTo(F.sx(x), yw + 2);
        ctx.lineTo(F.sx(x), yw + 7);
        ctx.stroke();
      }
      // the plank: its start position faint, now solid
      const th = Math.max(8, 0.22 * F.k);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink2, 0.6);
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(F.sx(xc0 - L / 2), yw - th * 0.5, L * F.k, th);
      ctx.restore();
      ctx.save();
      ctx.fillStyle = withAlpha(p.ink2, 0.55);
      ctx.fillRect(F.sx(xc - L / 2), yw - th * 0.5, L * F.k, th);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(F.sx(xc - L / 2), yw - th * 0.5, L * F.k, th);
      ctx.restore();
      // the person: a stick figure standing at s along the plank, about 1.7 m tall
      const xp = xc - L / 2 + plk.s;
      const top = yw - th * 0.5;
      const hgt = 1.7 * F.k;
      const sxp = F.sx(xp);
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = Math.max(2, 0.06 * F.k);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sxp - 0.18 * F.k, top);
      ctx.lineTo(sxp, top - 0.45 * hgt);
      ctx.lineTo(sxp + 0.18 * F.k, top);
      ctx.moveTo(sxp, top - 0.45 * hgt);
      ctx.lineTo(sxp, top - 0.82 * hgt);
      ctx.moveTo(sxp - 0.22 * F.k, top - 0.62 * hgt);
      ctx.lineTo(sxp, top - 0.75 * hgt);
      ctx.lineTo(sxp + 0.22 * F.k, top - 0.62 * hgt);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sxp, top - 0.9 * hgt, 0.09 * hgt, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // the person's start (ghost) and the displacements
      const xp0 = xc0 - L / 2;
      dashed(ctx, withAlpha(p.ink2, 0.7), [[F.sx(xp0), top], [F.sx(xp0), top - 0.9 * hgt]], [4, 4], 1.4);
      const ya = F.sy(-0.55);
      if (Math.abs(xc - xc0) * F.k > 4) arrow(ctx, F.sx(xc0), ya, F.sx(xc), ya, { color: p.velocity, width: 2, head: 8 });
      const yb = F.sy(-0.95);
      if (Math.abs(xp - xp0) * F.k > 4) arrow(ctx, F.sx(xp0), yb, F.sx(xp), yb, { color: p.ink, width: 2, head: 8 });
      // the centre of mass: fixed, with a dashed vertical line
      dashed(ctx, p.accent, [[F.sx(Xcm), F.sy(2.4)], [F.sx(Xcm), F.sy(-1.15)]], [6, 5], 1.4);
      cmGlyph(ctx, p, F.sx(Xcm), F.sy(0.25), nar ? 7 : 9);
      haloText(ctx, p, 'cm', F.sx(Xcm) + 12, F.sy(2.25), { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.accent, align: 'left' });
    }
  };

  const animate = scene === 'burst' && flying;
  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate });
  useEffect(invalidate, [pts, bod, bst, plk, flying]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      setNarrow(w > 0 && w < NARROW_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------------------------------------------ the burst's run */

  function land() {
    setFlying(false);
    t0.current = null;
    setBst((b) => ({ ...b, time: tEnd }));
    setLive('שני הרסיסים נחתו. מרכז המסה עזב את הפרבולה אחרי הנחיתה הראשונה.');
    done('leaves');
  }
  const fire = () => {
    t0.current = null;
    done('fire');
    if (Math.abs(bst.fraction - 0.5) > 1e-9) done('unequal');
    if (!motionAllowed()) {
      land();
      return;
    }
    setFlying(true);
    setLive('הפגז נורה.');
  };

  /* ------------------------------------------------------------------ handlers */

  const pickMass = (sx: number, sy: number): number | null => {
    const v = viewRef.current;
    if (!v) return null;
    const F = fit({ x: 0, y: 0, w: v.w, h: v.h }, [-0.3, PW + 0.3, -0.3, PH + 0.3], v.w < NARROW_W ? 6 : 14);
    let best: number | null = null;
    let bd = Infinity;
    pts.masses.forEach((q, i) => {
      const d = Math.hypot(F.sx(q.x) - sx, F.sy(q.y) - sy);
      const r = Math.max(7, F.k * 0.16 * Math.cbrt(q.m)) + 12;
      if (d < r && d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const describePoints = (st: PointsState) => {
    const c = centerOfMass(st.masses.map((q) => ({ m: q.m, r: [q.x, q.y] as Vec2 })));
    return `מרכז המסה בנקודה x שווה ${sci(c[0])}, y שווה ${sci(c[1])} מטר.`;
  };
  const checkMasses = (ms: MassSpec[]) => {
    if (ms.some((q, i) => ms.every((o, j) => j === i || q.m >= 4 * o.m - 1e-9))) done('heavy');
    if (ms.every((q) => Math.abs(q.m - ms[0].m) < 1e-9)) done('equal');
  };
  const onPointerDown = (e: PointerEvent) => {
    if (scene !== 'points') return;
    const i = pickMass(e.offsetX, e.offsetY);
    if (i === null) return;
    dragging.current = i;
    moved.current = false;
    setPts((s) => ({ ...s, sel: i }));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const i = dragging.current;
    const v = viewRef.current;
    if (i === null || !v) return;
    const F = fit({ x: 0, y: 0, w: v.w, h: v.h }, [-0.3, PW + 0.3, -0.3, PH + 0.3], v.w < NARROW_W ? 6 : 14);
    const x = clamp(roundTo(F.wx(e.offsetX), 0.25), 0, PW);
    const y = clamp(roundTo(F.wy(e.offsetY), 0.25), 0, PH);
    const q = pts.masses[i];
    if (q.x === x && q.y === y) return;
    moved.current = true;
    setPts((s) => ({ ...s, masses: s.masses.map((o, j) => (j === i ? { ...o, x, y } : o)) }));
  };
  const onPointerUp = () => {
    if (dragging.current !== null && moved.current) {
      done('drag');
      setLive(describePoints(pts));
    }
    dragging.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (scene === 'burst' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      fire();
      return;
    }
    if (scene !== 'points') return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setPts((s) => ({ ...s, sel: (s.sel + 1) % s.masses.length }));
      return;
    }
    const d: Record<string, [number, number]> = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, 0.25], ArrowDown: [0, -0.25] };
    const step = d[e.key];
    if (!step) return;
    e.preventDefault();
    setPts((s) => {
      const masses = s.masses.map((o, j) => (j === s.sel ? { ...o, x: clamp(o.x + step[0], 0, PW), y: clamp(o.y + step[1], 0, PH) } : o));
      const next = { ...s, masses };
      setLive(describePoints(next));
      return next;
    });
    done('drag');
  };

  const reset = () => {
    setPts(initialPoints());
    setBod(initialBody());
    setBst(initialBurst());
    setPlk(initialPlank());
    setFlying(false);
    seen.current = new Set();
    setLive('האיור חזר למצב ההתחלה.');
  };

  /* ------------------------------------------------------------------ the panel */

  let label = '';
  let readout = null;
  let controls = null;
  let aspect = 16 / 9;

  if (scene === 'points') {
    aspect = narrow ? 1.25 : 3 / 2;
    const ps = pts.masses.map((q) => ({ m: q.m, r: [q.x, q.y] as Vec2 }));
    const c = centerOfMass(ps);
    const mu = unweightedMean(ps);
    label = `איור חי: ${pts.masses.length} מסות נקודתיות על רשת במטרים. ${describePoints(pts)} גררו מסה; במקלדת: רווח בוחר מסה, חיצים מזיזים.`;
    readout = (
      <>
        <span class="q" data-readout="X">
          X<sub>cm</sub> = <b>{sci(c[0])} m</b>
        </span>
        <span class="q" data-readout="Y">
          Y<sub>cm</sub> = <b>{sci(c[1])} m</b>
        </span>
        <span class="q" data-readout="M">
          M = <b>{sci(totalMass(ps))} kg</b>
        </span>
        {pts.mean && (
          <span>
            ממוצע פשוט{' '}
            <b class="q" data-readout="mean">
              ({sci(mu[0])}, {sci(mu[1])}) m
            </b>
          </span>
        )}
      </>
    );
    const sel = pts.masses[pts.sel];
    controls = (
      <>
        <div class="group" role="group" aria-label="איזו מסה">
          {pts.masses.map((_, i) => (
            <Toggle key={i} label={<bdi dir="ltr">{`m${'₁₂₃₄'[i]}`}</bdi>} on={pts.sel === i} onChange={() => setPts((s) => ({ ...s, sel: i }))} />
          ))}
        </div>
        <Slider
          label="המסה של הגוף הנבחר"
          value={sel.m}
          min={M_MIN}
          max={M_MAX}
          step={0.5}
          format={(x) => `${sci(x)} kg`}
          onChange={(v) => {
            const masses = pts.masses.map((o, j) => (j === pts.sel ? { ...o, m: clamp(roundTo(v, 0.5), M_MIN, M_MAX) } : o));
            setPts((s) => ({ ...s, masses }));
            checkMasses(masses);
          }}
        />
        <div class="group" role="group" aria-label="מה להציג">
          <Toggle label="ממוצע פשוט" on={pts.mean} onChange={(on) => setPts((s) => ({ ...s, mean: on }))} />
        </div>
      </>
    );
  } else if (scene === 'body') {
    aspect = narrow ? 1.15 : 16 / 10;
    const shape = shapeOf(bod.body, bod.rod);
    const exact = exactCM(shape);
    const numeric = numericCM(shape, bod.strips).coord;
    const coord = bod.body === 'rod' ? 'X' : 'Y';
    label = `איור חי: ${BODY_LABEL[bod.body]} מחולק ל-${bod.strips} רצועות. מרכז המסה המדויק ב-${sci(exact)} מטר, והחישוב מהרצועות נותן ${sci(numeric, 4)} מטר.`;
    readout = (
      <>
        <span class="q" data-readout="N">
          N = <b>{bod.strips}</b>
        </span>
        <span>
          מ-N רצועות{' '}
          <b class="q" data-readout="numeric">
            {coord}
            <sub>N</sub> = {sci(numeric, 4)} m
          </b>
        </span>
        <span>
          מדויק{' '}
          <b class="q" data-readout="exact">
            {coord}
            <sub>cm</sub> = {sci(exact, 4)} m
          </b>
        </span>
        <span>
          שגיאה יחסית{' '}
          <b class="q" data-readout="error">
            {Math.abs(numeric - exact) < 1e-12 * exact ? '0' : `${sci((100 * Math.abs(numeric - exact)) / exact, 2)}%`}
          </b>
        </span>
      </>
    );
    const pick = (k: BodyKind) => {
      setBod((s) => ({ ...s, body: k }));
      seen.current.add(k);
      if (seen.current.has('half-disc') && seen.current.has('half-ring')) done('wire-vs-disc');
      if (k === 'rod' && bod.rod === 'linear') done('rod-linear');
    };
    controls = (
      <>
        <div class="group" role="group" aria-label="איזה גוף">
          {BODY_KINDS.map((k) => (
            <Toggle key={k} label={BODY_LABEL[k]} on={bod.body === k} onChange={() => pick(k)} />
          ))}
        </div>
        {bod.body === 'rod' && (
          <div class="group" role="group" aria-label="הצפיפות של המוט">
            <Toggle label="צפיפות אחידה" on={bod.rod === 'uniform'} onChange={() => setBod((s) => ({ ...s, rod: 'uniform' }))} />
            <Toggle
              label={<bdi dir="ltr">λ ∝ x</bdi>}
              on={bod.rod === 'linear'}
              onChange={() => {
                setBod((s) => ({ ...s, rod: 'linear' }));
                done('rod-linear');
              }}
            />
          </div>
        )}
        <Slider
          label="מספר הרצועות"
          value={bod.strips}
          min={1}
          max={40}
          step={1}
          format={(x) => `${x}`}
          onChange={(v) => {
            const n = clamp(Math.round(v), 1, 40);
            setBod((s) => ({ ...s, strips: n }));
            if (n === 40 && !(bod.body === 'rod' && bod.rod === 'uniform')) done('converge');
          }}
        />
      </>
    );
  } else if (scene === 'burst' && plan) {
    aspect = narrow ? 1.5 : 16 / 9;
    const shown = clamp(bst.time, 0, tEnd);
    const s = burstAt(burst, shown, plan);
    const dev = Math.hypot(s.cm[0] - s.parabola[0], s.cm[1] - s.parabola[1]);
    const nFly = shown <= burst.tBurst ? 'הפגז שלם' : `${s.flying.filter(Boolean).length}`;
    label = `איור חי: פגז נורה במהירות ${sci(v0)} מטר בשנייה בזווית ${sci(angleDeg)} מעלות ומתפוצץ בשיא לשני רסיסים. הרסיס הראשון נוחת ב-${sci(plan.tFirst)} שניות. Enter יורה.`;
    readout = flying ? (
      <span>הפגז באוויר…</span>
    ) : (
      <>
        <span class="q" data-readout="t">
          t = <b>{signed(shown)} s</b>
        </span>
        <span>
          רסיסים באוויר{' '}
          <b class="q" data-readout="flying">
            {nFly}
          </b>
        </span>
        <span>
          המרחק של מרכז המסה מהפרבולה{' '}
          <b class="q" data-readout="dev">
            {signed(dev, 1e-9)} m
          </b>
        </span>
        <span class="q" data-readout="acm">
          a<sub>cm,y</sub> = <b>{signed(cmAccelerationY(burst, shown, plan), 1e-12)} m/s²</b>
        </span>
        <span>
          נחיתות{' '}
          <b class="q" data-readout="landings">
            {sci(plan.tFirst)} s, {sci(plan.tLast)} s
          </b>
        </span>
      </>
    );
    const change = (f: (b: BurstState) => BurstState) => {
      setFlying(false);
      setBst((b) => ({ ...f(b), time: 0 }));
    };
    const scrub = (v: number) => {
      setFlying(false);
      const tt = clamp(v, 0, tEnd);
      setBst((b) => ({ ...b, time: tt }));
      if (tt > burst.tBurst + 0.05 && tt < plan.tFirst - 0.02) done('on-parabola');
      if (tt > plan.tFirst + 0.02) done('leaves');
    };
    controls = (
      <>
        <Slider label="החלק של רסיס 1 במסה" value={bst.fraction} min={0.2} max={0.8} step={0.05} format={(x) => `${sci(x, 2)}`} onChange={(v) => change((b) => ({ ...b, fraction: clamp(roundTo(v, 0.05), 0.2, 0.8) }))} />
        <Slider label="מהירות ההיפרדות" value={bst.u} min={0} max={20} step={1} format={(x) => `${sci(x)} m/s`} onChange={(v) => change((b) => ({ ...b, u: clamp(Math.round(v), 0, 20) }))} />
        <Slider label="כיוון ההיפרדות של רסיס 1" value={bst.phi} min={-60} max={60} step={5} format={(x) => `${signed(x)}°`} onChange={(v) => change((b) => ({ ...b, phi: clamp(roundTo(v, 5), -60, 60) }))} />
        <Slider label="זמן" value={Number(clamp(bst.time, 0, tEnd).toPrecision(3))} min={0} max={Number(tEnd.toPrecision(3))} step={0.01} format={(x) => `${sci(x)} s`} onChange={scrub} />
        <div class="group" role="group" aria-label="ירי">
          <button type="button" class="btn primary" onClick={fire}>
            ירו
          </button>
        </div>
      </>
    );
  } else {
    aspect = narrow ? 1.2 : 2.1;
    const xc = plankCentre(plk.m, plk.M, L, plk.s, (plk.m * (-L / 2)) / (plk.m + plk.M));
    const person = xc - L / 2 + plk.s - -L / 2;
    label = `איור חי: אדם במסה ${sci(plk.m)} קילוגרם הולך על קרש במסה ${sci(plk.M)} קילוגרם שצף על מים בלי חיכוך. הקרש זז ${sci(Math.abs(xc))} מטר אחורה.`;
    readout = (
      <>
        <span>
          האדם ביחס לקרש{' '}
          <b class="q" data-readout="rel">
            {sci(plk.s)} m
          </b>
        </span>
        <span>
          הקרש ביחס למים{' '}
          <b class="q" data-readout="plank">
            {signed(xc, 1e-9)} m
          </b>
        </span>
        <span>
          האדם ביחס למים{' '}
          <b class="q" data-readout="person">
            {signed(person, 1e-9)} m
          </b>
        </span>
      </>
    );
    const walk = (v: number) => {
      const s = clamp(roundTo(v, 0.1), 0, L);
      setPlk((k) => ({ ...k, s }));
      if (s >= L - 1e-9) {
        done('walk');
        if (plk.m >= plk.M) done('heavy-person');
      }
    };
    controls = (
      <>
        <Slider label="המקום של האדם על הקרש" value={plk.s} min={0} max={L} step={0.1} format={(x) => `${sci(x)} m`} onChange={walk} />
        <Slider label="המסה של האדם" value={plk.m} min={30} max={150} step={5} format={(x) => `${sci(x)} kg`} onChange={(v) => setPlk((k) => ({ ...k, m: clamp(roundTo(v, 5), 30, 150), s: 0 }))} />
        <Slider label="המסה של הקרש" value={plk.M} min={50} max={400} step={10} format={(x) => `${sci(x)} kg`} onChange={(v) => setPlk((k) => ({ ...k, M: clamp(roundTo(v, 10), 50, 400), s: 0 }))} />
      </>
    );
  }

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={scene === 'points' ? (dragging.current !== null ? 'grabbing' : 'grab') : 'default'}
      readout={readout}
      controls={controls}
    />
  );
}
