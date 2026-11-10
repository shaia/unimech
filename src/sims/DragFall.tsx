/**
 * DragFall (lesson 2.7): a body falling, or thrown up, through air under a drag force that depends on its
 * velocity. On the left, the body in a column of air (the camera follows it: the ruler marks move past it)
 * with the forces on it: its weight, the drag, and the net force, emphasised. On the right, the velocity
 * along a DOWNWARD axis against time, with the terminal speed as a dashed asymptote, the initial slope
 * (the tangent at t = 0, which meets the asymptote one time constant later), the drag-free line, the other
 * drag law with the same terminal speed, and the curves of earlier releases.
 *
 * Two scenes:
 * - 'fall': one drag law, linear (−b v) or quadratic (−c|v|v); the learner sets m, the coefficient and the
 *   initial velocity, releases the body, and scrubs time.
 * - 'regime': a sphere in air (fog drop, drizzle, raindrop, baseball) under both drags at once,
 *   b = C1_AIR·D and c = C2_AIR·D²; the full motion (RK4) next to each drag alone, which shows which one
 *   dominates.
 *
 * Every number comes from src/physics/drag.ts. Tasks tick only in the learner's own handlers (the release
 * button, a landing it started, the time slider, a body chip); a text step can set the state but never
 * releases or scrubs through a handler, so a step can never tick a task.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import {
  RHO_WATER,
  accelerationAt,
  dragForce,
  dragRatio,
  lawOf,
  position,
  sampleFall,
  sphereDrag,
  sphereMass,
  terminalSpeed,
  timeScale,
  velocity,
  type Fall,
  type FallSample,
} from '~/physics/drag';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const ASPECT = 16 / 9;
const KEEP = 3;

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside, so it reads left to right in Hebrew. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  release: 'שחררו את הגוף פעם אחת, בכפתור "שחררו".',
  'terminal-forces': 'הדליקו את הכוחות, ושחררו (או הזיזו את פס הזמן עד הסוף). מה הכוח השקול כשהמהירות כבר לא משתנה?',
  tau: `בגרר ליניארי: הזיזו את פס הזמן לקבוע הזמן ${ltr('τ = m/b')}. איזה חלק מהמהירות הסופית יש לגוף שם?`,
  'double-mass': 'בגרר ליניארי: שחררו פעם אחת, הכפילו את המסה בלי לשנות את b, ושחררו שוב.',
  'throw-up': `בגרר ליניארי, עם הקו "בלי אוויר": זרקו את הגוף כלפי מעלה (מהירות התחלתית שלילית, לפחות ${ltr('5 m/s')}) ושחררו.`,
  'quad-mass': 'בגרר ריבועי: שחררו פעם אחת, הגדילו את המסה פי 4 בלי לשנות את c, ושחררו שוב.',
  'regime-linear': 'בחרו את טיפת הערפל ושחררו. איזה מודל של גרר מתאר אותה?',
  'regime-quad': 'בחרו את כדור הבייסבול ושחררו. ואיזה מודל מתאר אותו?',
};

export type Scene = 'fall' | 'regime';
export type Law = 'linear' | 'quadratic';
export type BodyId = 'fog' | 'drizzle' | 'rain' | 'baseball';

/** The spheres of the regime scene: diameter D [m] and mass [kg] (water drops: ρ π D³/6). */
const BODIES: Record<BodyId, { label: string; D: number; m: number }> = {
  fog: { label: 'טיפת ערפל', D: 20e-6, m: sphereMass(20e-6, RHO_WATER) },
  drizzle: { label: 'טיפת רסס', D: 0.2e-3, m: sphereMass(0.2e-3, RHO_WATER) },
  rain: { label: 'טיפת גשם', D: 2e-3, m: sphereMass(2e-3, RHO_WATER) },
  baseball: { label: 'כדור בייסבול', D: 0.074, m: 0.145 },
};
const BODY_IDS = Object.keys(BODIES) as BodyId[];

export interface DragFallProps {
  id: string;
  scene?: Scene;
  law?: Law;
  /** mass [kg], linear coefficient b [kg/s], quadratic coefficient c [kg/m], initial velocity, down positive [m/s] */
  m?: number;
  b?: number;
  c?: number;
  v0?: number;
  body?: BodyId;
  /** slider limits */
  mMin?: number;
  mMax?: number;
  bMin?: number;
  bMax?: number;
  cMin?: number;
  cMax?: number;
  v0Min?: number;
  v0Max?: number;
  /** which controls appear */
  lawToggle?: boolean;
  v0Slider?: boolean;
  /** what is drawn at the start */
  forces?: boolean;
  tangent?: boolean;
  freeFall?: boolean;
  compare?: boolean;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

interface Setup {
  law: Law;
  m: number;
  b: number;
  c: number;
  v0: number;
  body: BodyId;
}

interface Show {
  forces: boolean;
  tangent: boolean;
  freeFall: boolean;
  compare: boolean;
}

/** The motion as the figure reads it. */
interface Model {
  fall: Fall;
  /** terminal speed [m/s] and characteristic time (τ, or v_t/g) [s] */
  vt: number;
  ts: number;
  /** the time the figure runs to: the top (if thrown up) plus five time scales [s] */
  tEnd: number;
  v: (t: number) => number;
  y: (t: number) => number;
}

interface Run {
  n: number;
  setup: Setup;
  model: Model;
}

/** Linear interpolation in samples taken at equal steps. */
function interp(s: FallSample[], t: number, key: 'v' | 'y'): number {
  const tEnd = s[s.length - 1].t;
  if (t <= 0) return s[0][key];
  if (t >= tEnd) return s[s.length - 1][key];
  const x = (t / tEnd) * (s.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return s[i][key] * (1 - f) + s[i + 1][key] * f;
}

function fallOf(s: Setup, scene: Scene): Fall {
  if (scene === 'regime') {
    const body = BODIES[s.body];
    return { m: body.m, ...sphereDrag(body.D) };
  }
  return s.law === 'linear' ? { m: s.m, b: s.b, v0: s.v0 } : { m: s.m, c: s.c, v0: s.v0 };
}

function modelOf(fall: Fall): Model {
  const vt = terminalSpeed(fall);
  const ts = timeScale(fall);
  const v0 = fall.v0 ?? 0;
  // the top of a throw up comes first; it is never longer than the drag-free v₀/g
  const tTop = v0 < 0 ? -v0 / G : 0;
  const tEnd = tTop + 5 * ts;
  if (lawOf(fall) === 'both') {
    const s = sampleFall(fall, tEnd, 400);
    return { fall, vt, ts, tEnd, v: (t) => interp(s, t, 'v'), y: (t) => interp(s, t, 'y') };
  }
  return { fall, vt, ts, tEnd, v: (t) => velocity(fall, t), y: (t) => position(fall, t) };
}

/** The smallest of 1, 2, 2.5, 5 × 10ⁿ that is ≥ x. */
function niceUp(x: number): number {
  if (!(x > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(x));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * mag >= x * (1 - 1e-9)) return k * mag;
  return 10 * mag;
}

/** Canvas text with a paper halo (Latin and math labels only; Hebrew goes through handNote). */
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

/** A symbol with a true subscript (F with a small d below the line), centred at (x, y), with a paper halo. */
function subText(ctx: CanvasRenderingContext2D, p: Palette, base: string, sub: string, x: number, y: number, size: number, color: string) {
  const fBase = `italic 600 ${size}px ${p.fontUi}`;
  const fSub = `italic 600 ${Math.round(size * 0.72)}px ${p.fontUi}`;
  ctx.save();
  ctx.font = fBase;
  const wb = ctx.measureText(base).width;
  ctx.font = fSub;
  const ws = ctx.measureText(sub).width;
  ctx.restore();
  const x0 = x - (wb + ws + 1) / 2;
  haloText(ctx, p, base, x0, y, { font: fBase, color, align: 'left' });
  haloText(ctx, p, sub, x0 + wb + 1, y + size * 0.3, { font: fSub, color, align: 'left' });
}

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Does the curve v(t) pass through the rectangle (2 px of margin)? Each step between samples is a segment. */
function crosses(plot: Plot, f: (t: number) => number, r: Rect): boolean {
  const { box } = plot;
  const tOf = (x: number) => plot.x.min + ((x - box.x) / box.w) * (plot.x.max - plot.x.min);
  let prev: number | null = null;
  for (let x = r.x - 2; x <= r.x + r.w + 2; x += 2) {
    const t = tOf(x);
    const v = t >= plot.x.min && t <= plot.x.max ? f(t) : NaN;
    if (!Number.isFinite(v)) {
      prev = null;
      continue;
    }
    const y = plot.py(v);
    const lo = prev === null ? y : Math.min(prev, y);
    const hi = prev === null ? y : Math.max(prev, y);
    if (hi >= r.y - 2 && lo <= r.y + r.h + 2) return true;
    prev = y;
  }
  return false;
}

/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 0) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));

export default function DragFall(props: DragFallProps) {
  const scene: Scene = props.scene ?? 'fall';
  const M_MIN = props.mMin ?? 0.02;
  const M_MAX = props.mMax ?? 0.2;
  const B_MIN = props.bMin ?? 0.05;
  const B_MAX = props.bMax ?? 0.5;
  const C_MIN = props.cMin ?? 0.005;
  const C_MAX = props.cMax ?? 0.1;
  const V0_MIN = props.v0Min ?? -15;
  const V0_MAX = props.v0Max ?? 10;

  const initialSetup = (): Setup => ({
    law: props.law ?? 'linear',
    m: clamp(props.m ?? 0.05, M_MIN, M_MAX),
    b: clamp(props.b ?? 0.1, B_MIN, B_MAX),
    c: clamp(props.c ?? 0.02, C_MIN, C_MAX),
    v0: clamp(props.v0 ?? 0, V0_MIN, V0_MAX),
    body: props.body ?? 'rain',
  });
  const initialShow = (): Show => ({
    forces: props.forces ?? true,
    tangent: props.tangent ?? false,
    freeFall: props.freeFall ?? false,
    compare: props.compare ?? false,
  });

  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [show, setShow] = useState<Show>(initialShow);
  /** the instant shown when nothing is falling [s]; a negative value is a fraction of tEnd, resolved below */
  const [time, setTime] = useState(0);
  const [runs, setRuns] = useState<Run[]>([]);
  const [flying, setFlying] = useState<Run | null>(null);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  const landed = useRef(0);
  const count = useRef(0);
  /** every release of this visit, for the tasks that compare releases */
  const history = useRef<Run[]>([]);

  const model = modelOf(fallOf(setup, scene));
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the setup and the toggles and choose the instant shown; they never release or scrub
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setSetup((prev) => ({
          law: st.law === 'linear' || st.law === 'quadratic' ? st.law : prev.law,
          m: clamp(num(st.m) ?? prev.m, M_MIN, M_MAX),
          b: clamp(num(st.b) ?? prev.b, B_MIN, B_MAX),
          c: clamp(num(st.c) ?? prev.c, C_MIN, C_MAX),
          v0: clamp(num(st.v0) ?? prev.v0, V0_MIN, V0_MAX),
          body: typeof st.body === 'string' && st.body in BODIES ? (st.body as BodyId) : prev.body,
        }));
        setShow((prev) => ({
          forces: bool(st.forces) ?? prev.forces,
          tangent: bool(st.tangent) ?? prev.tangent,
          freeFall: bool(st.freeFall) ?? prev.freeFall,
          compare: bool(st.compare) ?? prev.compare,
        }));
        if (st.clear === true) setRuns([]);
        setFlying(null);
        const t = num(st.t);
        const tf = num(st.tFrac);
        setTime(t !== null ? Math.max(0, t) : tf !== null ? -Math.max(1e-9, tf) : 0);
      }),
    [props.id],
  );
  useEffect(() => {
    if (time < 0) setTime(-time * model.tEnd);
  }, [time, model.tEnd]);

  /** the drag law with the same terminal speed and initial velocity, for the comparison curve */
  const otherModel = (): Model | null => {
    if (scene !== 'fall') return null;
    const W = setup.m * G;
    const vt = model.vt;
    const f: Fall = setup.law === 'linear' ? { m: setup.m, c: W / (vt * vt), v0: setup.v0 } : { m: setup.m, b: W / vt, v0: setup.v0 };
    return modelOf(f);
  };

  const describe = (r: Run) =>
    scene === 'regime'
      ? `${BODIES[r.setup.body].label}: המהירות הסופית ${sci(r.model.vt)} מטר בשנייה.`
      : `הגוף שוחרר. המהירות הסופית ${sci(r.model.vt)} מטר בשנייה, והזמן האופייני ${sci(r.model.ts)} שניות.`;

  const land = (r: Run) => {
    if (landed.current === r.n) return;
    landed.current = r.n;
    setFlying(null);
    setTime(r.model.tEnd);
    setRuns((prev) => [...prev, r].slice(-KEEP));
    setLive(describe(r));
    // a release the learner started ran to the end: the speed is within 1 % of the terminal speed
    if (show.forces) done('terminal-forces');
  };

  const fire = () => {
    const n = ++count.current;
    t0.current = null;
    const r: Run = { n, setup: { ...setup }, model };
    done('release');
    const h = history.current;
    const s = setup;
    if (scene === 'fall') {
      const same = (o: Run) => o.setup.law === s.law && o.setup.v0 === s.v0;
      const ratio = (o: Run) => Math.max(o.setup.m / s.m, s.m / o.setup.m);
      if (s.law === 'linear' && h.some((o) => same(o) && o.setup.b === s.b && Math.abs(ratio(o) - 2) < 1e-9)) done('double-mass');
      if (s.law === 'quadratic' && h.some((o) => same(o) && o.setup.c === s.c && Math.abs(ratio(o) - 4) < 1e-9)) done('quad-mass');
      if (s.law === 'linear' && s.v0 <= -5 && show.freeFall) done('throw-up');
    } else {
      if (s.body === 'fog') done('regime-linear');
      if (s.body === 'baseball') done('regime-quad');
    }
    h.push(r);
    if (!motionAllowed()) {
      land(r);
      return;
    }
    setFlying(r);
    setLive('הגוף נופל.');
  };

  /** axes: fixed by the current motion, the comparison and the kept releases, so curves can be compared */
  const axes = () => {
    const ms = [model, ...runs.map((r) => r.model)];
    const o = show.compare ? otherModel() : null;
    if (o) ms.push(o);
    const tMax = niceUp(Math.max(...ms.map((m) => m.tEnd)));
    let vTop = Math.max(...ms.map((m) => 1.15 * m.vt));
    if (scene === 'fall') vTop = Math.max(vTop, setup.v0 * 1.05);
    const vMax = niceUp(vTop);
    const vMin = scene === 'fall' ? Math.min(0, ...ms.map((m) => m.fall.v0 ?? 0)) : 0;
    return { tMax, vMax, vMin: vMin < 0 ? -niceUp(-vMin) : 0 };
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const narrow = view.w < 520;
    const fs = narrow ? 10 : 12;
    const colW = Math.round(view.w * (narrow ? 0.3 : 0.22));

    // the instant shown
    let now = clamp(time, 0, model.tEnd);
    let m = model;
    if (flying) {
      if (t0.current === null) t0.current = t;
      m = flying.model;
      const rate = m.tEnd / clamp(m.tEnd, 1.5, 6); // a release plays in 1.5 to 6 seconds (slow motion for a fog drop)
      now = Math.min((t - t0.current) * rate, m.tEnd);
      if (now >= m.tEnd) land(flying);
    }
    const vNow = m.v(now);
    const yNow = m.y(now);

    /* ---------------- the column of air, following the body */
    const top = 22;
    const bottom = view.h - 10;
    const colH = bottom - top;
    const cx = colW * 0.5;
    const bodyY = top + colH * 0.45;
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.06);
    ctx.fillRect(6, top, colW - 12, colH);
    ctx.strokeStyle = p.rule;
    ctx.strokeRect(6, top, colW - 12, colH);
    ctx.restore();
    // ruler marks along the downward axis, spaced so that a few are in view
    const span = niceUp(Math.max(Math.abs(m.y(m.tEnd)) / 3, 1.5 * m.vt * m.ts, 1e-9));
    const ppm = colH / span;
    const step = niceUp(span / 5);
    // the unit goes once into the axis name, so the ruler numbers stay short and clear of the body and its forces
    const [unit, perUnit] = step >= 0.1 ? ['m', 1] : step >= 1e-4 ? ['mm', 1e-3] : ['µm', 1e-6];
    const k0 = Math.floor((yNow - span) / step);
    const k1 = Math.ceil((yNow + span) / step);
    ctx.save();
    ctx.beginPath();
    ctx.rect(6, top, colW - 12, colH);
    ctx.clip();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    for (let k = k0; k <= k1; k++) {
      const yy = bodyY + (k * step - yNow) * ppm;
      if (yy < top - 2 || yy > bottom + 2) continue;
      ctx.beginPath();
      ctx.moveTo(6, yy);
      ctx.lineTo(18, yy);
      ctx.stroke();
      haloText(ctx, p, signed((k * step) / perUnit, (step / perUnit) * 1e-6), 21, yy, { font: `${fs - 1}px ${p.fontUi}`, color: p.ink2, align: 'left' });
    }
    ctx.restore();
    haloText(ctx, p, `y (${unit}) ↓`, colW - 12, top - 10, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });

    // the body, and its velocity as an arrow to the left of it
    const r = narrow ? 6 : 8;
    const { vMax } = axes();
    const kv = (0.3 * colH) / vMax;
    if (Math.abs(vNow) > 1e-12) arrow(ctx, cx - 18, bodyY, cx - 18, bodyY + kv * vNow, { color: p.velocity, width: 2.2, head: 8 });
    if (Math.abs(kv * vNow) > 14) haloText(ctx, p, 'v', cx - 30, bodyY + kv * vNow * 0.6, { font: `italic 600 ${fs + 2}px ${p.fontUi}`, color: p.velocity });
    ctx.save();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(cx, bodyY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // the forces on the body: its weight (by the Earth), the drag (by the air), and the net force, emphasised.
    // Three parallel lines to the right of the body: the weight, the drag (a little to its right, so that the
    // two never overlap when both point down, as in a throw up), and the net force. Every label sits beyond the
    // tip of its own arrow (the weight's to the left of its tip), so no label meets another arrow.
    if (show.forces) {
      const W = m.fall.m * G;
      // one scale for the whole run: the weight takes 22 % of the column, unless a throw makes the forces at
      // the release larger, and then the largest of them takes 42 % (so no arrow leaves the canvas)
      const v0 = m.fall.v0 ?? 0;
      const Fbig = Math.max(W, Math.abs(dragForce(m.fall, v0)), Math.abs(W + dragForce(m.fall, v0)));
      const kF = Math.min((0.22 * colH) / W, (0.42 * colH) / Fbig);
      const fx = cx + 12;
      const dxd = fx + 8;
      const beyond = (len: number, gap = 10) => clamp(bodyY + len + Math.sign(len) * gap, top + 8, bottom - 8);
      arrow(ctx, fx, bodyY, fx, bodyY + kF * W, { color: p.force, width: 2, head: 8, alpha: 0.7 });
      haloText(ctx, p, 'mg', fx - 5, bodyY + kF * W - 3, { font: `italic 600 ${fs + 1}px ${p.fontUi}`, color: p.force, align: 'right' });
      if (scene === 'regime') {
        // the two parts of the drag side by side, each label beyond its tip, on its own side
        const bv = -(m.fall.b ?? 0) * vNow;
        const cv = -(m.fall.c ?? 0) * Math.abs(vNow) * vNow;
        const cx2 = dxd + 7;
        arrow(ctx, dxd, bodyY, dxd, bodyY + kF * bv, { color: p.force, width: 1.6, head: 7, alpha: 0.7 });
        arrow(ctx, cx2, bodyY, cx2, bodyY + kF * cv, { color: p.force, width: 1.6, head: 7, alpha: 0.7 });
        if (Math.abs(kF * bv) > 16) haloText(ctx, p, 'bv', dxd + 2, beyond(kF * bv, 8), { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.force, align: 'right' });
        if (Math.abs(kF * cv) > 16) haloText(ctx, p, 'cv²', cx2 - 2, beyond(kF * cv, 8), { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.force, align: 'left' });
      } else {
        const Fd = dragForce(m.fall, vNow);
        arrow(ctx, dxd, bodyY, dxd, bodyY + kF * Fd, { color: p.force, width: 2, head: 8, alpha: 0.7 });
        if (Math.abs(kF * Fd) > 14) subText(ctx, p, 'F', 'd', dxd, beyond(kF * Fd), fs + 1, p.force);
      }
      const net = m.fall.m * accelerationAt(m.fall, vNow);
      const nx = fx + (narrow ? 26 : 36);
      if (Math.abs(net) > 0.01 * W) {
        arrow(ctx, nx, bodyY, nx, bodyY + kF * net, { color: p.force, width: 4, head: 11 });
        // the label beyond the arrow's tip, clear of the other labels and of the plot to the right
        haloText(ctx, p, 'ΣF', nx, beyond(kF * net, 11), { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.force });
      } else {
        ctx.save();
        ctx.fillStyle = p.force;
        ctx.beginPath();
        ctx.arc(nx, bodyY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // under the dot that stands for the net force, clear of the ruler numbers and of the other forces
        haloText(ctx, p, 'ΣF ≈ 0', nx, bodyY + 16, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force });
      }
    }

    /* ---------------- the plot of v(t) */
    const ax = axes();
    const box = insetBox({ x: colW, y: 0, w: view.w - colW, h: view.h }, { l: narrow ? 52 : 60, r: 14, t: 16, b: 44 });
    // a fog drop's axes run to milliseconds and millimetres per second: the ticks say so in short numbers
    const tMs = ax.tMax < 0.1;
    const vMm = Math.max(ax.vMax, -ax.vMin) < 0.1;
    const plot: Plot = makePlot(
      box,
      { min: 0, max: ax.tMax, label: tMs ? 'הזמן t (ms)' : 'הזמן t (s)', format: (x) => sci(tMs ? x * 1e3 : x, 2) },
      { min: ax.vMin, max: ax.vMax, label: vMm ? 'המהירות כלפי מטה v (mm/s)' : 'המהירות כלפי מטה v (m/s)', format: (x) => sci(vMm ? x * 1e3 : x, 2) },
    );
    drawAxes(ctx, plot, p);
    if (ax.vMin < 0) {
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(box.x, plot.py(0));
      ctx.lineTo(box.x + box.w, plot.py(0));
      ctx.stroke();
      ctx.restore();
    }

    // earlier releases, faint, each labelled at its end
    runs.forEach((run, i) => {
      if (flying && run.n === flying.n) return;
      drawCurve(ctx, plot, (tt) => (tt <= run.model.tEnd ? run.model.v(tt) : NaN), { color: withAlpha(p.ink3, 0.9), width: 1.4 });
      const te = Math.min(run.model.tEnd, ax.tMax * 0.97);
      const tag = scene === 'regime' ? BODIES[run.setup.body].label : `m = ${sci(run.setup.m)} kg`;
      if (scene === 'regime') handNote(ctx, tag, plot.px(te) - 40, plot.py(run.model.v(te)) - 10 - 12 * i, p, narrow ? 11 : 13);
      else haloText(ctx, p, tag, plot.px(te) - 4, plot.py(run.model.v(te)) - 9 - 12 * (i % 2), { font: `${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });
    });

    /* labels on the plot are placed, not pinned: each tries a few spots and takes the first one inside the plot,
       clear of the curves, of the labels already placed, and of the reset/fullscreen buttons in the top-right
       corner of the stage */
    const corner: Rect = { x: view.w - 84, y: 0, w: 84, h: 44 };
    const taken: Rect[] = [corner];
    const rectAt = (x: number, y: number, w: number, h: number): Rect => ({ x: x - w / 2, y: y - h / 2, w, h });
    const textW = (txt: string, font: string) => {
      ctx.save();
      ctx.font = font;
      const w = ctx.measureText(txt).width;
      ctx.restore();
      return w;
    };
    const place = (cands: Rect[], curves: ((t: number) => number)[]): Rect | null => {
      const ok = cands.find(
        (r) =>
          r.x >= box.x + 2 &&
          r.x + r.w <= box.x + box.w - 2 &&
          r.y >= box.y &&
          r.y + r.h <= box.y + box.h &&
          !taken.some((o) => overlaps(o, r)) &&
          !curves.some((f) => crosses(plot, f, r)),
      );
      // with no clear spot, at least one inside the plot and off the other labels and the buttons
      const inside = cands.find((r) => r.x >= box.x && r.x + r.w <= box.x + box.w && !taken.some((o) => overlaps(o, r)));
      const r = ok ?? inside ?? cands[0] ?? null;
      if (r) taken.push(r);
      return r;
    };
    /** the instant at which an increasing v(t) reaches v, or null if it does not within the plot */
    const reach = (f: (t: number) => number, v: number): number | null => {
      if (!(f(ax.tMax) >= v) || f(0) >= v) return null;
      let lo = 0;
      let hi = ax.tMax;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (f(mid) < v) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };

    const current = (tt: number) => (tt <= m.tEnd ? m.v(tt) : NaN);
    const free = show.freeFall && scene === 'fall' ? (tt: number) => setup.v0 + G * tt : null;
    let tangentLine: ((t: number) => number) | null = null;
    if (show.tangent && scene === 'fall') {
      const v0 = m.fall.v0 ?? 0;
      const a0 = accelerationAt(m.fall, v0);
      const tHit = (m.vt - v0) / a0;
      tangentLine = (tt) => (tt <= tHit ? v0 + a0 * tt : NaN);
    }
    const lines = [free, tangentLine].filter((f): f is (t: number) => number => f !== null);
    /** the v = 0 line, drawn when the plot goes below zero */
    const axis0 = ax.vMin < 0 ? [() => 0] : [];

    // the terminal speed's label, above its line: at the right end, or left of the buttons, or at the left end;
    // where none of these is clear, just "vₜ" (the readout gives the number)
    const vtFont = `600 ${fs}px ${p.fontUi}`;
    const vtY = plot.py(m.vt) - 9;
    const vtCands: { text: string; r: Rect }[] = [];
    for (const text of [`vₜ = ${sci(m.vt)} m/s`, 'vₜ']) {
      const w = textW(text, vtFont) + 4;
      const y = vtY - fs / 2 - 2;
      vtCands.push(
        { text, r: { x: box.x + box.w - 4 - w, y, w, h: fs + 4 } },
        { text, r: { x: Math.min(box.x + box.w, corner.x) - 6 - w, y, w, h: fs + 4 } },
        { text, r: { x: box.x + 6, y, w, h: fs + 4 } },
      );
    }
    const vtRect = place(
      vtCands.map((c) => c.r),
      lines,
    );
    const vtText = vtCands.find((c) => c.r === vtRect)?.text ?? 'vₜ';

    const hand = narrow ? 12 : 14;
    const handFont = (size: number) => `500 ${size}px ${p.fontHand}`;
    const note = (txt: string, r: Rect | null, size: number) => r && handNote(ctx, txt, r.x + r.w / 2, r.y + r.h / 2, p, size);

    // the drag-free line v = v₀ + g t, labelled beside it, on whichever side is clear
    if (free) {
      drawCurve(ctx, plot, free, { color: p.ink2, width: 1.4, dash: [6, 5] });
      const txt = 'בלי אוויר';
      const w = textW(txt, handFont(hand)) + 4;
      const h = hand + 4;
      const cands: Rect[] = [];
      for (const f of [0.8, 0.65, 0.5, 0.35, 0.2]) {
        const vv = ax.vMin + f * (ax.vMax - ax.vMin);
        const tt = (vv - setup.v0) / G;
        if (tt <= 0 || tt >= ax.tMax) continue;
        cands.push(rectAt(plot.px(tt) - w / 2 - 12, plot.py(vv), w, h), rectAt(plot.px(tt) + w / 2 + 12, plot.py(vv), w, h));
      }
      note(txt, place(cands, [current, ...lines, ...axis0]), hand);
    }

    // each drag alone (regime), or the other law with the same terminal speed (fall), each label on its own curve
    if (scene === 'regime') {
      const f = m.fall;
      const lin = modelOf({ m: f.m, b: f.b });
      const quad = modelOf({ m: f.m, c: f.c });
      drawCurve(ctx, plot, lin.v, { color: p.ink2, width: 1.6, dash: [7, 5] });
      drawCurve(ctx, plot, quad.v, { color: p.ink2, width: 1.6, dash: [2, 4] });
      const size = narrow ? 11 : 13;
      const curves = [current, lin.v, quad.v];
      // the drag that is weaker at the terminal speed gives the higher, steeper curve: its label beside the
      // rising part; the other one runs with the full motion: its label under the plateau
      const [hiM, hiTxt, loM, loTxt] = lin.vt >= quad.vt ? [lin, 'רק ליניארי', quad, 'רק ריבועי'] : [quad, 'רק ריבועי', lin, 'רק ליניארי'];
      const wLo = textW(loTxt, handFont(size)) + 4;
      const h = size + 4;
      // beside the rising part, left or right of it; on a narrow plot, without "רק" if the full name finds no room
      const hiC: Rect[] = [];
      const hiText = new Map<Rect, string>();
      for (const txt of [hiTxt, hiTxt.replace('רק ', '')]) {
        const wHi = textW(txt, handFont(size)) + 4;
        for (const fr of [0.7, 0.55, 0.85, 0.4, 0.95]) {
          const vv = fr * ax.vMax;
          const tt = reach(hiM.v, vv);
          if (tt === null) continue;
          for (const r of [rectAt(plot.px(tt) - wHi / 2 - 6, plot.py(vv), wHi, h), rectAt(plot.px(tt) + wHi / 2 + 6, plot.py(vv), wHi, h)]) {
            hiC.push(r);
            hiText.set(r, txt);
          }
        }
      }
      const hiR = place(hiC, curves);
      note(hiR ? (hiText.get(hiR) ?? hiTxt) : hiTxt, hiR, size);
      const loC: Rect[] = [];
      for (const fr of [0.55, 0.7, 0.4, 0.85]) {
        const tt = fr * ax.tMax;
        const y = Math.max(plot.py(loM.v(tt)), plot.py(m.v(tt)));
        loC.push(rectAt(plot.px(tt), y + h / 2 + 4, wLo, h));
      }
      note(loTxt, place(loC, curves), size);
    } else if (show.compare) {
      const o = otherModel();
      if (o) {
        const oc = (tt: number) => (tt <= o.tEnd ? o.v(tt) : NaN);
        drawCurve(ctx, plot, oc, { color: p.ink2, width: 1.6, dash: [2, 4] });
        const txt = setup.law === 'linear' ? 'ריבועי' : 'ליניארי';
        const w = textW(txt, handFont(hand)) + 4;
        const h = hand + 4;
        const cands: Rect[] = [];
        for (const k of [0.8, 1.5, 0.5, 2.5]) {
          const tt = Math.min(o.ts * k, ax.tMax);
          const x = plot.px(tt);
          const y = plot.py(o.v(tt));
          cands.push(rectAt(x - w / 2 - 4, y - h / 2 - 4, w, h), rectAt(x + w / 2 + 4, y + h / 2 + 4, w, h));
        }
        note(txt, place(cands, [current, oc, ...lines, ...axis0]), hand);
      }
    }

    // the terminal speed
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(box.x, plot.py(m.vt));
    ctx.lineTo(box.x + box.w, plot.py(m.vt));
    ctx.stroke();
    ctx.restore();
    if (vtRect) haloText(ctx, p, vtText, vtRect.x + vtRect.w - 2, vtY, { font: vtFont, color: p.accent, align: 'right' });

    // the tangent at t = 0 meets the asymptote one time scale later
    if (show.tangent && scene === 'fall') {
      const v0 = m.fall.v0 ?? 0;
      if (tangentLine) drawCurve(ctx, plot, tangentLine, { color: p.accel, width: 1.6, dash: [5, 4] });
      if ((setup.law === 'linear' && v0 >= 0) || v0 === 0) {
        const tau = m.ts;
        ctx.save();
        ctx.strokeStyle = p.accel;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(plot.px(tau), plot.py(m.vt));
        ctx.lineTo(plot.px(tau), box.y + box.h);
        ctx.stroke();
        ctx.restore();
        // to the right of its dashed line, where neither the tangent nor the curve passes near the t axis
        haloText(ctx, p, setup.law === 'linear' ? 'τ' : 'vₜ/g', plot.px(tau) + 4, box.y + box.h - 10, { font: `italic 700 ${fs + 3}px ${p.fontUi}`, color: p.accel, align: 'left' });
        drawMarker(ctx, plot, tau, m.v(tau), p.accel, { radius: 4 });
        haloText(ctx, p, `${sci((100 * (m.v(tau) - v0)) / (m.vt - v0), 2)}%`, plot.px(tau) + 8, plot.py(m.v(tau)) + 12, { font: `600 ${fs}px ${p.fontUi}`, color: p.accel, align: 'left' });
      }
    }

    // the current motion: faint ahead, solid up to the instant shown, and the instant itself
    drawCurve(ctx, plot, (tt) => (tt <= m.tEnd ? m.v(tt) : NaN), { color: withAlpha(p.velocity, 0.3), width: 2 });
    drawCurve(ctx, plot, (tt) => (tt <= now ? m.v(tt) : NaN), { color: p.velocity, width: 2.6, samples: 240 });
    drawMarker(ctx, plot, now, vNow, p.velocity, { guides: true, radius: 5 });
    if ((m.fall.v0 ?? 0) < 0 && Math.abs(vNow) < 0.03 * m.vt && now > 0) handNote(ctx, 'שיא', plot.px(now), plot.py(0) - 18, p, narrow ? 12 : 14);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: flying !== null });
  useEffect(invalidate, [setup, show, time, runs, flying]);

  const change = (f: (s: Setup) => Setup) => {
    setFlying(null);
    setTime(0);
    setSetup((s) => f(s));
  };
  const setM = (v: number) => change((s) => ({ ...s, m: clamp(roundTo(v, 0.01), M_MIN, M_MAX) }));
  const setB = (v: number) => change((s) => ({ ...s, b: clamp(roundTo(v, 0.01), B_MIN, B_MAX) }));
  const setC = (v: number) => change((s) => ({ ...s, c: clamp(roundTo(v, 0.001), C_MIN, C_MAX) }));
  const setV0 = (v: number) => change((s) => ({ ...s, v0: clamp(Math.round(v), V0_MIN, V0_MAX) }));
  const setLaw = (law: Law) => change((s) => ({ ...s, law }));
  const setBody = (body: BodyId) => change((s) => ({ ...s, body }));
  const scrub = (tt: number) => {
    setFlying(null);
    const t = clamp(tt, 0, model.tEnd);
    setTime(t);
    if (scene !== 'fall') return;
    if (show.forces && model.v(t) >= 0.99 * model.vt) done('terminal-forces');
    if (setup.law === 'linear' && setup.v0 >= 0 && Math.abs(t - model.ts) <= Math.max(0.03 * model.ts, 0.011)) done('tau');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') fire();
    else if (scene === 'fall' && e.key === 'ArrowUp') setM(setup.m + 0.01);
    else if (scene === 'fall' && e.key === 'ArrowDown') setM(setup.m - 0.01);
    else return;
    e.preventDefault();
  };

  const shown = clamp(time, 0, model.tEnd);
  const v = model.v(shown);
  const a = accelerationAt(model.fall, v);
  const Fd = dragForce(model.fall, v);
  const W = model.fall.m * G;
  const tiny = 1e-6 * model.vt;
  const regime = scene === 'regime';
  const body = BODIES[setup.body];
  const ratioAtVt = dragRatio(body.D, model.vt);
  const tsLabel = regime || setup.law === 'quadratic' ? 'vₜ/g' : 'τ';
  const label = regime
    ? `איור חי: ${body.label} בקוטר ${sci(body.D)} מטר נופלת באוויר, עם גרר ליניארי וגרר ריבועי יחד. המהירות הסופית ${sci(model.vt)} מטר בשנייה. Enter משחרר.`
    : `איור חי: גוף במסה ${sci(setup.m)} קילוגרם נופל באוויר עם גרר ${setup.law === 'linear' ? 'ליניארי' : 'ריבועי'}. המהירות הסופית ${sci(model.vt)} מטר בשנייה. במקלדת: חץ למעלה ולמטה משנה את המסה, Enter משחרר.`;

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onReset={() => {
        setSetup(initialSetup());
        setShow(initialShow());
        setRuns([]);
        setFlying(null);
        setTime(0);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        flying ? (
          <span>הגוף נופל…</span>
        ) : (
          <>
            <span class="q" data-readout="t">
              t = <b>{signed(shown)} s</b>
            </span>
            <span class="q" data-readout="v">
              v = <b>{signed(v, tiny)} m/s</b>
            </span>
            <span class="q" data-readout="a">
              a = <b>{signed(a, 1e-6 * G)} m/s²</b>
            </span>
            {!regime && (
              <span class="q" data-readout="net">
                ΣF = <b>{signed(W + Fd, 1e-6 * W)} N</b>
              </span>
            )}
            <span>
              מהירות סופית{' '}
              <b class="q" data-readout="vt">
                {sci(model.vt)} m/s
              </b>
            </span>
            <span class="q" data-readout="ts">
              {tsLabel} = <b>{sci(model.ts)} s</b>
            </span>
            {v >= 0 && (
              <span>
                מתוך המהירות הסופית{' '}
                <b class="q" data-readout="frac">
                  {sci((100 * v) / model.vt, 3)}%
                </b>
              </span>
            )}
            {regime && (
              <span>
                יחס הגררים במהירות הסופית{' '}
                <b class="q" data-readout="ratio">
                  cv²/bv = {sci(ratioAtVt)}
                </b>
              </span>
            )}
          </>
        )
      }
      controls={
        <>
          {regime ? (
            <div class="group" role="group" aria-label="איזה גוף">
              {BODY_IDS.map((id) => (
                <Toggle key={id} label={BODIES[id].label} on={setup.body === id} onChange={() => setBody(id)} />
              ))}
            </div>
          ) : (
            <>
              {props.lawToggle && (
                <div class="group" role="group" aria-label="חוק הגרר">
                  <Toggle label="גרר ליניארי" on={setup.law === 'linear'} onChange={() => setLaw('linear')} />
                  <Toggle label="גרר ריבועי" on={setup.law === 'quadratic'} onChange={() => setLaw('quadratic')} />
                </div>
              )}
              <Slider label="מסה" value={setup.m} min={M_MIN} max={M_MAX} step={0.01} format={(x) => `${sci(x)} kg`} onChange={setM} />
              {setup.law === 'linear' ? (
                <Slider label="מקדם הגרר b" value={setup.b} min={B_MIN} max={B_MAX} step={0.01} format={(x) => `${sci(x)} kg/s`} onChange={setB} />
              ) : (
                <Slider label="מקדם הגרר c" value={setup.c} min={C_MIN} max={C_MAX} step={0.001} format={(x) => `${sci(x)} kg/m`} onChange={setC} />
              )}
              {props.v0Slider && (
                <Slider label="מהירות התחלתית כלפי מטה" value={setup.v0} min={V0_MIN} max={V0_MAX} step={1} format={(x) => `${signed(x)} m/s`} onChange={setV0} />
              )}
            </>
          )}
          <Slider label="זמן" value={Number(shown.toPrecision(3))} min={0} max={Number(model.tEnd.toPrecision(3))} step={niceUp(model.tEnd / 500)} format={(x) => `${sci(x)} s`} onChange={scrub} />
          <div class="group" role="group" aria-label="שחרור">
            <button type="button" class="btn primary" onClick={fire}>
              שחררו
            </button>
            <button type="button" class="btn ghost" onClick={() => setRuns([])}>
              נקו עקומות
            </button>
          </div>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="כוחות" on={show.forces} swatch="var(--force)" onChange={(on) => setShow((s) => ({ ...s, forces: on }))} />
            {!regime && (
              <>
                <Toggle label="משיק וקבוע זמן" on={show.tangent} swatch="var(--accel)" onChange={(on) => setShow((s) => ({ ...s, tangent: on }))} />
                <Toggle label="בלי אוויר" on={show.freeFall} onChange={(on) => setShow((s) => ({ ...s, freeFall: on }))} />
                <Toggle label="השוואה לגרר האחר" on={show.compare} onChange={(on) => setShow((s) => ({ ...s, compare: on }))} />
              </>
            )}
          </div>
        </>
      }
    />
  );
}
