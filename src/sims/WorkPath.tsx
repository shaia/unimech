/**
 * WorkPath: the work of a force field along a path, and the work-energy theorem along a computed trajectory
 * (lesson 3.1). Two modes:
 *
 *   mode 'path'    a force field drawn as faint arrows on a grid, and a path from A to B: a straight segment, an arc
 *                  about O (distance and angle from O change steadily; a circle about O when A and B are equally far
 *                  from it), or a curve (a quadratic Bézier) the learner bends by dragging its middle handle. A, B and
 *                  the handle can be dragged. The path is cut into n chords Δr, each drawn in the colour of the sign
 *                  of F·Δr (positive: --pos, solid; negative: --neg, dashed; zero: grey). A marker runs along the path;
 *                  at it, the force F, the direction of dr and (optionally) the projection F∥ of F on dr. Beside it
 *                  (below it on a phone), the running work W(ℓ) against the length ℓ along the path, with the work
 *                  along the straight segment from A to B as a dashed reference.
 *   mode 'motion'  the same fields; a body of mass 0.40 kg starts at A with a launch speed and angle and moves under
 *                  the field alone (RK4). Its path is coloured by the sign of the work as it goes; the graph shows the
 *                  work of the force so far, W, and the change of the kinetic energy, ΔK, against the time.
 *
 * Model: src/physics/work.ts (MODEL SPECIFICATION there). Physics space: LTR, x to the right, y up (metres).
 * Colours: force --force, velocity --velocity, kinetic energy --energy-k, positive / negative work --pos / --neg.
 *
 * Props: id (required), mode, field, path, A, B, M, n, s, proj, v0, angle, t, tasks.
 * Step `set` keys: field, path, A, B, M, n, s, proj, v0, angle, t, playing.
 *
 * Tasks are checked against the figure's own state, never a state a text step produced:
 *   bend-gravity   gravity, the curve raised at least 0.30 m above A, the marker brought to B
 *   spring-arc     spring, the arc about O with A and B equally far from O (±0.03 m), the marker brought to B
 *   shear-paths    the force (c y, 0), a curve whose work differs from the straight segment's by 2 J or more, at B
 *   segments       the learner sets 32 pieces or more
 *   gravity-run    motion under gravity run (or scrubbed) to the end
 *   spring-period  motion under the spring run through a whole period
 *   shear-launch   motion under (c y, 0) after the learner changed the launch speed or angle, run to the end
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { G } from '~/physics/constants';
import {
  bezierPath,
  gravityField,
  lineIntegral,
  linePath,
  polarPath,
  shearField,
  springField,
  tangentOf,
  trajectoryWork,
  workPieces,
  type Field,
  type Path,
  type TrajectorySample,
  type WorkPiece,
} from '~/physics/work';
import { len, sub, type Vec2 } from '~/physics/vec';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, handNote, withAlpha } from './core/ink';
import { drawAxes, drawCurve, makePlot, niceTicks, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type WPMode = 'path' | 'motion';
export type FieldId = 'gravity' | 'spring' | 'shear';
export type PathId = 'line' | 'arc' | 'curve';

/** the body's mass [kg], the spring constant [N/m] and the shear coefficient c [N/m] */
export const MASS = 0.4;
export const K_SPRING = 3;
export const C_SHEAR = 2.5;

const FIELDS: FieldId[] = ['gravity', 'spring', 'shear'];
const PATHS: PathId[] = ['line', 'arc', 'curve'];
const FIELD: Record<FieldId, { F: Field; name: string; formula: string }> = {
  gravity: { F: gravityField(MASS), name: 'כובד', formula: `F = (0, −${(MASS * G).toFixed(2)}) N` },
  spring: { F: springField(K_SPRING), name: 'קפיץ', formula: `F = −(${K_SPRING.toFixed(1)} N/m)·r` },
  shear: { F: shearField(C_SHEAR), name: 'כוח שתלוי בגובה', formula: `F = ((${C_SHEAR.toFixed(1)} N/m)·y, 0)` },
};
const PATH_NAME: Record<PathId, string> = { line: 'קטע ישר', arc: 'קשת סביב O', curve: 'עקומה' };

/** the drawn window of the plane [m] */
const X_MIN = -2.1;
const X_MAX = 2.1;
const Y_MIN = -1.4;
const Y_MAX = 1.8;
/** handles stay a little inside the window */
const clampIn = (r: Vec2): Vec2 => [Math.max(X_MIN + 0.15, Math.min(X_MAX - 0.15, r[0])), Math.max(Y_MIN + 0.15, Math.min(Y_MAX - 0.2, r[1]))];

/** where each field's motion starts, and for how long it runs (or until it leaves the window) */
const LAUNCH: Record<FieldId, { A: Vec2; v0: number; angle: number; T: number }> = {
  gravity: { A: [-1.6, -0.6], v0: 4.5, angle: 60, T: 1.0 },
  spring: { A: [1.5, 0], v0: 2.2, angle: 90, T: 2 * Math.PI * Math.sqrt(MASS / K_SPRING) },
  shear: { A: [-1.6, -0.6], v0: 2.0, angle: 60, T: 1.2 },
};
const MOTION_STEPS = 1200;
const RUN_SECONDS = 5;

const NARROW_W = 520;
const ASPECT_WIDE = 1.75;
const ASPECT_NARROW = 0.72;

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  'bend-gravity': `בכובד, כופפו את העקומה כך שתעלה מעל A, והביאו את הסמן עד B. השוו את העבודה לעבודה לאורך הקטע הישר.`,
  'spring-arc': 'בקפיץ, בחרו בקשת סביב O, והביאו את הסמן עד B. כמה עבודה נעשתה בכל קטע?',
  'shear-paths': `בכוח שתלוי בגובה, כופפו את העקומה עד שהעבודה לאורכה שונה מהעבודה לאורך הקטע הישר ב-${ltr('2 J')} לפחות.`,
  segments: 'הגדילו את מספר הקטעים ל-32 לפחות. כמה השתנה הסכום?',
  'gravity-run': 'בכובד, הריצו את הזריקה עד הסוף. מתי W שלילית, ומתי היא גדלה?',
  'spring-period': 'בקפיץ, הריצו מחזור שלם. כמה עבודה עשה הקפיץ בסך הכול?',
  'shear-launch': 'בכוח שתלוי בגובה, שנו את מהירות הזריקה או את הזווית והריצו עד הסוף. האם W עדיין שווה ל-ΔK?',
};

export interface WorkPathProps {
  id: string;
  mode?: WPMode;
  field?: FieldId;
  path?: PathId;
  A?: Vec2;
  B?: Vec2;
  /** the middle handle of the curve */
  M?: Vec2;
  n?: number;
  s?: number;
  proj?: boolean;
  v0?: number;
  angle?: number;
  t?: number;
  tasks?: string[];
}

interface State {
  field: FieldId;
  path: PathId;
  A: Vec2;
  B: Vec2;
  M: Vec2;
  n: number;
  s: number;
  proj: boolean;
  v0: number;
  angle: number;
  t: number;
  playing: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const isVec = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && v.every((c) => typeof c === 'number');
/** two decimals, a true minus sign, and no "−0.00" */
const fmt = (x: number, d = 2) => {
  const r = Number(x.toFixed(d));
  return (Math.abs(r) < 0.5 * 10 ** -d ? 0 : r).toFixed(d).replace('-', '−');
};

function initial(p: WorkPathProps): State {
  const mode = p.mode ?? 'path';
  const field = p.field ?? 'gravity';
  const L = LAUNCH[field];
  return {
    field,
    path: p.path ?? 'line',
    A: p.A ?? (mode === 'motion' ? L.A : [-1.5, 1.0]),
    B: p.B ?? [1.5, 0.2],
    M: p.M ?? [0, 1.2],
    n: p.n ?? 16,
    s: p.s ?? 0,
    proj: p.proj ?? false,
    v0: p.v0 ?? L.v0,
    angle: p.angle ?? L.angle,
    t: p.t ?? 0,
    playing: false,
  };
}

function makePath(s: State): Path {
  if (s.path === 'arc') return polarPath(s.A, s.B);
  if (s.path === 'curve') {
    const C: Vec2 = [2 * s.M[0] - (s.A[0] + s.B[0]) / 2, 2 * s.M[1] - (s.A[1] + s.B[1]) / 2];
    return bezierPath(s.A, C, s.B);
  }
  return linePath(s.A, s.B);
}

/** The part of a path from s = 0 to s = u, as a path of its own. */
const subPath = (p: Path, u: number): Path => ({
  at: (x) => p.at(x * u),
  tangent: (x) => {
    const t = tangentOf(p, x * u);
    return [t[0] * u, t[1] * u];
  },
});

interface PathData {
  kind: 'path';
  path: Path;
  pieces: WorkPiece[];
  fine: WorkPiece[];
  W: number;
  Wline: number;
  sum: number;
  length: number;
  yMax: number;
}
interface MotionData {
  kind: 'motion';
  run: TrajectorySample[];
  dt: number;
  T: number;
  /** the run went the whole planned time without leaving the window */
  full: boolean;
}

const inWindow = (r: Vec2) => r[0] > X_MIN && r[0] < X_MAX && r[1] > Y_MIN && r[1] < Y_MAX;

function pathData(s: State): PathData {
  const F = FIELD[s.field].F;
  const path = makePath(s);
  const pieces = workPieces(F, path, s.n);
  const fine = workPieces(F, path, 240);
  let yMax = -Infinity;
  for (const q of fine) yMax = Math.max(yMax, q.b[1], q.mid[1]);
  return {
    kind: 'path',
    path,
    pieces,
    fine,
    W: lineIntegral(F, path, 800),
    Wline: lineIntegral(F, linePath(s.A, s.B), 50),
    sum: pieces[pieces.length - 1].W,
    length: fine[fine.length - 1].ell,
    yMax: Math.max(yMax, s.A[1]),
  };
}

function motionData(s: State): MotionData {
  const L = LAUNCH[s.field];
  const a = (s.angle * Math.PI) / 180;
  const v: Vec2 = [s.v0 * Math.cos(a), s.v0 * Math.sin(a)];
  const dt = L.T / MOTION_STEPS;
  const run = trajectoryWork(FIELD[s.field].F, MASS, s.A, v, dt, MOTION_STEPS, (q) => inWindow(q.pos));
  const end = run[run.length - 1];
  return { kind: 'motion', run, dt, T: end.t, full: run.length === MOTION_STEPS + 1 && inWindow(end.pos) };
}

const sampleAt = (d: MotionData, t: number) => d.run[clamp(Math.round(t / d.dt), 0, d.run.length - 1)];

/* ---------------------------------------------------------------- layout */

interface Layout {
  narrow: boolean;
  scene: { x: number; y: number; w: number; h: number };
  plot: { x: number; y: number; w: number; h: number };
  sc: number;
  cx: number;
  cy: number;
}

function layoutOf(view: View): Layout {
  const narrow = view.w < NARROW_W;
  const scene = narrow
    ? { x: 6, y: 44, w: view.w - 12, h: view.h * 0.6 - 44 }
    : { x: 8, y: 8, w: view.w * 0.6 - 8, h: view.h - 16 };
  const plot = narrow
    ? { x: 50, y: view.h * 0.6 + 26, w: view.w - 50 - 14, h: view.h * 0.4 - 26 - 32 }
    : { x: view.w * 0.6 + 50, y: 54, w: view.w * 0.4 - 50 - 14, h: view.h - 54 - 34 };
  const sc = Math.min(scene.w / (X_MAX - X_MIN), scene.h / (Y_MAX - Y_MIN));
  return { narrow, scene, plot, sc, cx: scene.x + scene.w / 2, cy: scene.y + scene.h / 2 };
}

const toS = (L: Layout, r: Vec2): [number, number] => [
  L.cx + (r[0] - (X_MIN + X_MAX) / 2) * L.sc,
  L.cy - (r[1] - (Y_MIN + Y_MAX) / 2) * L.sc,
];
const toW = (L: Layout, x: number, y: number): Vec2 => [
  (X_MIN + X_MAX) / 2 + (x - L.cx) / L.sc,
  (Y_MIN + Y_MAX) / 2 - (y - L.cy) / L.sc,
];

/* ---------------------------------------------------------------- the component */

type Handle = 'A' | 'B' | 'M';

export default function WorkPath(props: WorkPathProps) {
  const mode: WPMode = props.mode ?? 'path';
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const [narrowStage, setNarrowStage] = useState(false);
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  /** the learner has acted on the figure since the last step */
  const userAct = useRef(false);
  /** the learner changed the launch speed or angle since the field was chosen */
  const launchTouched = useRef(false);
  const drag = useRef<Handle | null>(null);
  const layout = useRef<Layout | null>(null);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const data = useMemo<PathData | MotionData>(
    () => (mode === 'path' ? pathData(s) : motionData(s)),
    mode === 'path' ? [s.field, s.path, s.A, s.B, s.M, s.n] : [s.field, s.A, s.v0, s.angle],
  );
  const Tend = data.kind === 'motion' ? data.T : 1;

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev, playing: false };
          if (typeof step.field === 'string' && (FIELDS as string[]).includes(step.field)) {
            next.field = step.field as FieldId;
            if (mode === 'motion' && step.field !== prev.field) {
              const L = LAUNCH[next.field];
              next.A = L.A;
              next.v0 = L.v0;
              next.angle = L.angle;
              next.t = 0;
            }
          }
          if (typeof step.path === 'string' && (PATHS as string[]).includes(step.path)) next.path = step.path as PathId;
          if (isVec(step.A)) next.A = step.A;
          if (isVec(step.B)) next.B = step.B;
          if (isVec(step.M)) next.M = step.M;
          if (typeof step.n === 'number') next.n = clamp(Math.round(step.n), 2, 64);
          if (typeof step.s === 'number') next.s = clamp(step.s, 0, 1);
          if (typeof step.proj === 'boolean') next.proj = step.proj;
          if (typeof step.v0 === 'number') next.v0 = step.v0;
          if (typeof step.angle === 'number') next.angle = step.angle;
          if (typeof step.t === 'number') next.t = Math.max(0, step.t);
          if (typeof step.playing === 'boolean') next.playing = step.playing;
          stepState.current = next;
          userAct.current = false;
          launchTouched.current = false;
          return next;
        });
      }),
    [props.id],
  );

  // playback: the marker (path) or the time (motion) runs to the end in about RUN_SECONDS; still mode freezes it
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (motionAllowed() && !document.hidden) {
        setS((prev) => {
          if (mode === 'path') {
            const u = prev.s + dt / RUN_SECONDS;
            return u >= 1 ? { ...prev, s: 1, playing: false } : { ...prev, s: u };
          }
          const t = prev.t + (dt * Tend) / RUN_SECONDS;
          return t >= Tend ? { ...prev, t: Tend, playing: false } : { ...prev, t };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, Tend]);

  // tasks: checked against the figure's own state, never against a state a text step produced
  useEffect(() => {
    if (s === stepState.current || !userAct.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (data.kind === 'path') {
      const atB = s.s >= 0.98;
      if (has('bend-gravity') && s.field === 'gravity' && s.path === 'curve' && data.yMax >= s.A[1] + 0.3 && atB) done('bend-gravity');
      if (has('spring-arc') && s.field === 'spring' && s.path === 'arc' && Math.abs(len(s.A) - len(s.B)) <= 0.03 && atB) done('spring-arc');
      if (has('shear-paths') && s.field === 'shear' && s.path === 'curve' && Math.abs(data.W - data.Wline) >= 2 && atB) done('shear-paths');
      if (has('segments') && s.n >= 32) done('segments');
    } else {
      const end = s.t >= 0.98 * data.T;
      if (has('gravity-run') && s.field === 'gravity' && end) done('gravity-run');
      if (has('spring-period') && s.field === 'spring' && data.full && end) done('spring-period');
      if (has('shear-launch') && s.field === 'shear' && launchTouched.current && end) done('shear-launch');
    }
  }, [s, data, props.id, props.tasks]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s, data)), 700);
    return () => clearTimeout(h);
  }, [s.field, s.path, s.n, s.v0, s.angle, Math.round(s.s * 20), Math.round((s.t / Tend) * 20)]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const L = layoutOf(view);
    layout.current = L;
    if (data.kind === 'path') paintPath(ctx, L, p, s, data);
    else paintMotion(ctx, L, p, s, data);
  };
  const aspect = narrowStage ? ASPECT_NARROW : ASPECT_WIDE;
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: aspect, worldHeight: 1, animate: false });
  useEffect(invalidate, [s, data]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setNarrowStage(w < NARROW_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- interaction */

  const act = (patch: Partial<State> | ((prev: State) => Partial<State>)) => {
    userAct.current = true;
    setS((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
  };

  const handles = (): Handle[] => (mode === 'motion' ? ['A'] : s.path === 'curve' ? ['M', 'A', 'B'] : ['A', 'B']);
  const pick = (e: PointerEvent): Handle | null => {
    const L = layout.current;
    if (!L) return null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: Handle | null = null;
    let bd = 22;
    for (const h of handles()) {
      const [hx, hy] = toS(L, s[h]);
      const d = Math.hypot(hx - x, hy - y);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  };
  const onPointerDown = (e: PointerEvent) => {
    const h = pick(e);
    if (!h) return;
    drag.current = h;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    const L = layout.current;
    const h = drag.current;
    if (!L || !h) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const r = clampIn(toW(L, e.clientX - rect.left, e.clientY - rect.top));
    act((prev) => {
      // A and B never meet: a path needs two ends
      const other = h === 'A' ? prev.B : h === 'B' ? prev.A : null;
      if (mode === 'path' && other && len(sub(r, other)) < 0.3) return {};
      return mode === 'motion' ? { A: r, t: 0, playing: false } : { [h]: r };
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const setProgress = (u: number) => act({ s: clamp(u, 0, 1), playing: false });
  const setTime = (t: number) => act({ t: clamp(t, 0, Tend), playing: false });
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!step) return;
    if (mode === 'path') setProgress(s.s + step / 50);
    else setTime(s.t + (step * Tend) / 80);
    e.preventDefault();
  };
  const reset = () => {
    stepState.current = null;
    userAct.current = false;
    launchTouched.current = false;
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const chooseField = (f: FieldId) =>
    act((prev) => {
      launchTouched.current = false;
      if (mode === 'motion') {
        const L = LAUNCH[f];
        return { field: f, A: L.A, v0: L.v0, angle: L.angle, t: 0, playing: false };
      }
      return { field: f, playing: false };
    });

  /* ---- readout */

  let readout = null;
  if (data.kind === 'path') {
    const u = s.s;
    const Wu = u > 0 ? lineIntegral(FIELD[s.field].F, subPath(data.path, u), 400) : 0;
    const r = data.path.at(u);
    const F = FIELD[s.field].F(r);
    const tg = tangentOf(data.path, u);
    const Fm = len(F);
    const tl = len(tg);
    const Fpar = tl > 0 ? (F[0] * tg[0] + F[1] * tg[1]) / tl : 0;
    const theta = Fm > 1e-12 ? (Math.acos(clamp(Fpar / Fm, -1, 1)) * 180) / Math.PI : null;
    readout = (
      <>
        <span class="q" data-readout="formula">{FIELD[s.field].formula}</span>
        <span data-readout="sum">
          {s.n} קטעים: <b class="q">Σ F·Δr = {fmt(data.sum)} J</b>
        </span>
        <span data-readout="W">
          האינטגרל: <b class="q">W = ∫F·dr = {fmt(data.W)} J</b>
        </span>
        <span data-readout="Wline">
          בקטע הישר מ-A ל-B: <b class="q">{fmt(data.Wline)} J</b>
        </span>
        <span data-readout="Wnow">
          מ-A עד הסמן: <b class="q">W = {fmt(Wu)} J</b>
        </span>
        <span data-readout="Fpar">
          בסמן: <b class="q">|F| = {fmt(Fm)} N{theta === null ? '' : `, θ = ${theta.toFixed(0)}°`}, F∥ = {fmt(Fpar)} N</b>
        </span>
      </>
    );
  } else {
    const q = sampleAt(data, s.t);
    const K0 = data.run[0].K;
    readout = (
      <>
        <span class="q" data-readout="formula">{FIELD[s.field].formula}</span>
        <span class="q" data-readout="t">t = {fmt(q.t)} s</span>
        <span class="q" data-readout="K">K = ½mv² = {fmt(q.K)} J</span>
        <span data-readout="W">
          העבודה עד עכשיו: <b class="q">W = Σ F·Δr = {fmt(q.W)} J</b>
        </span>
        <span data-readout="dK">
          השינוי באנרגיה הקינטית: <b class="q">ΔK = {fmt(q.K - K0)} J</b>
        </span>
        <span class="q" data-readout="gap">
          |W − ΔK| {Math.abs(q.W - (q.K - K0)) < 1e-9 ? '< 10⁻⁹' : `= ${Math.abs(q.W - (q.K - K0)).toExponential(1)}`} J
        </span>
      </>
    );
  }

  const fieldLabel = (f: FieldId) => FIELD[f].name;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${mode === 'path' ? 'שדה כוח ומסלול מ-A ל-B, מחולק לקטעים לפי הסימן של F·Δr, וגרף העבודה לאורך המסלול' : 'גוף שנע תחת שדה הכוח בלבד, והשוואה בין העבודה לשינוי באנרגיה הקינטית'}. ${describe(s, data)} גררו את הנקודות, או השתמשו בפס ובחצים במקלדת.`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current ? 'grabbing' : 'grab'}
      readout={readout}
      controls={
        <>
          <div class="group" role="group" aria-label="שדה הכוח">
            {FIELDS.map((f) => (
              <Toggle key={f} label={fieldLabel(f)} on={s.field === f} onChange={() => chooseField(f)} />
            ))}
          </div>
          {mode === 'path' ? (
            <>
              <div class="group" role="group" aria-label="המסלול">
                {PATHS.map((id) => (
                  <Toggle key={id} label={PATH_NAME[id]} on={s.path === id} onChange={() => act({ path: id })} />
                ))}
              </div>
              <div class="group" role="group" aria-label="מה להציג">
                <Toggle label="היטל של F על dr" on={s.proj} swatch="var(--force)" onChange={(on) => act({ proj: on })} />
                <Toggle
                  label={s.playing ? 'עצירה' : 'הפעלה'}
                  on={s.playing}
                  onChange={(on) => act((prev) => ({ playing: on, s: on && prev.s >= 1 ? 0 : prev.s }))}
                />
              </div>
              <Slider label="מספר הקטעים" min={2} max={64} step={1} value={s.n} format={(v) => `${v}`} onChange={(v) => act({ n: Math.round(v) })} />
              <Slider
                label="הסמן לאורך המסלול"
                min={0}
                max={1}
                step={0.005}
                value={s.s}
                format={(v) => `${fmt(v * ('length' in data ? data.length : 0))} m`}
                onChange={setProgress}
              />
              <p class="hint">גררו את A, את B ואת הידית שבאמצע העקומה. כל קטע צבוע לפי הסימן של F·Δr: אדום מלא חיובי, כחול מקווקו שלילי, אפור אפס.</p>
            </>
          ) : (
            <>
              <div class="group" role="group" aria-label="הרצה">
                <Toggle
                  label={s.playing ? 'עצירה' : 'הפעלה'}
                  on={s.playing}
                  onChange={(on) => act((prev) => ({ playing: on, t: on && prev.t >= Tend ? 0 : prev.t }))}
                />
              </div>
              <Slider
                label="מהירות הזריקה"
                min={0.5}
                max={6}
                step={0.1}
                value={s.v0}
                format={(v) => `${v.toFixed(1)} m/s`}
                onChange={(v) => {
                  launchTouched.current = true;
                  act({ v0: v, t: 0, playing: false });
                }}
              />
              <Slider
                label="זווית הזריקה"
                min={-180}
                max={180}
                step={5}
                value={s.angle}
                format={(v) => `${v.toFixed(0)}°`}
                onChange={(v) => {
                  launchTouched.current = true;
                  act({ angle: v, t: 0, playing: false });
                }}
              />
              <Slider label="זמן" min={0} max={Tend} step={Tend / 400} value={Math.min(s.t, Tend)} format={(v) => `${fmt(v)} s`} onChange={setTime} />
              <p class="hint">{`גוף בעל מסה ${ltr('0.40 kg')} יוצא מ-A. גררו את A כדי להזיז את נקודת היציאה. הזווית נמדדת מציר x, נגד כיוון השעון.`}</p>
            </>
          )}
        </>
      }
    />
  );
}

function describe(s: State, d: PathData | MotionData): string {
  if (d.kind === 'path') {
    return `${FIELD[s.field].name}, ${PATH_NAME[s.path]}. העבודה לאורך כל המסלול ${fmt(d.W)} ג'ול, ולאורך הקטע הישר מ-A ל-B ${fmt(d.Wline)} ג'ול.`;
  }
  const q = sampleAt(d, s.t);
  return `${FIELD[s.field].name}. ברגע ${fmt(q.t)} שניות העבודה של הכוח עד עכשיו ${fmt(q.W)} ג'ול, והשינוי באנרגיה הקינטית ${fmt(q.K - d.run[0].K)} ג'ול.`;
}

/* ---------------------------------------------------------------- drawing */

function label(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color: string, size = 13, align: CanvasTextAlign = 'center') {
  ctx.save();
  ctx.font = `600 ${size}px ${p.fontUi}`;
  ctx.direction = 'ltr';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = p.paper;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** The field as faint arrows on a 0.5 m grid, each centred on its grid point. */
function paintField(ctx: CanvasRenderingContext2D, L: Layout, p: Palette, F: Field) {
  const pts: Vec2[] = [];
  for (let x = -2; x <= 2.001; x += 0.5) for (let y = -1; y <= 1.501; y += 0.5) pts.push([x, y]);
  const mags = pts.map((r) => len(F(r)));
  const Fmax = Math.max(...mags) || 1;
  const maxLen = 0.4 * L.sc;
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.scene.x, L.scene.y, L.scene.w, L.scene.h);
  ctx.clip();
  pts.forEach((r, i) => {
    const [sx, sy] = toS(L, r);
    const f = F(r);
    const m = mags[i];
    const l = (m / Fmax) * maxLen;
    if (l < 4) {
      ctx.fillStyle = withAlpha(p.force, 0.35);
      ctx.beginPath();
      ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const ux = f[0] / m;
    const uy = -f[1] / m;
    arrow(ctx, sx - (ux * l) / 2, sy - (uy * l) / 2, sx + (ux * l) / 2, sy + (uy * l) / 2, { color: p.force, width: 1.5, head: Math.min(8, 0.4 * l), alpha: 0.38 });
  });
  ctx.restore();
}

function paintOrigin(ctx: CanvasRenderingContext2D, L: Layout, p: Palette, s: State) {
  const [ox, oy] = toS(L, [0, 0]);
  if (s.field === 'shear') {
    // the x axis, where the force vanishes
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink2, 0.5);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(L.scene.x, oy);
    ctx.lineTo(L.scene.x + L.scene.w, oy);
    ctx.stroke();
    ctx.restore();
    label(ctx, p, 'y = 0', L.scene.x + 26, oy + 11, p.ink2, 11);
  }
  if (s.field === 'spring' || s.path === 'arc') {
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(ox, oy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    label(ctx, p, 'O', ox - 11, oy + 12, p.ink, 13);
  }
}

/** A labelled end of the path, the label placed away from the path's direction there. */
function paintEnd(ctx: CanvasRenderingContext2D, L: Layout, p: Palette, r: Vec2, name: string, away: Vec2) {
  const [x, y] = toS(L, r);
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  const l = len(away) || 1;
  label(ctx, p, name, x + (away[0] / l) * 17, y - (away[1] / l) * 17, p.ink, 14);
}

function paintPath(ctx: CanvasRenderingContext2D, L: Layout, p: Palette, s: State, d: PathData) {
  const F = FIELD[s.field].F;
  paintField(ctx, L, p, F);
  paintOrigin(ctx, L, p, s);

  // the true path, thin, under the chords
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink2, 0.55);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  d.fine.forEach((q, i) => {
    const [ax, ay] = toS(L, q.a);
    const [bx, by] = toS(L, q.b);
    if (i === 0) ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  });
  ctx.stroke();
  ctx.restore();

  // the curve's handle: dashed lines from the ends to it, and a ring
  if (s.path === 'curve') {
    const [mx, my] = toS(L, s.M);
    ctx.save();
    ctx.strokeStyle = withAlpha(p.accent, 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = withAlpha(p.accent, 0.18);
    ctx.fill();
    ctx.restore();
  }

  // the chords, coloured by the sign of F·Δr; the ones past the marker faint
  const maxdW = Math.max(...d.pieces.map((q) => Math.abs(q.dW)), 1e-12);
  const tol = 1e-6 * Math.max(1, maxdW);
  const k = s.s * d.pieces.length;
  d.pieces.forEach((q, i) => {
    const [ax, ay] = toS(L, q.a);
    const [bx, by] = toS(L, q.b);
    const sign = q.dW > tol ? 1 : q.dW < -tol ? -1 : 0;
    const done = i + 1 <= k + 1e-9;
    ctx.save();
    ctx.globalAlpha = done ? 1 : 0.35;
    ctx.strokeStyle = sign > 0 ? p.pos : sign < 0 ? p.neg : p.ink3;
    ctx.lineWidth = sign === 0 ? 3 : 4;
    ctx.lineCap = 'butt';
    if (sign < 0) ctx.setLineDash([7, 4]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
  });
  // the cuts between pieces
  ctx.save();
  ctx.fillStyle = p.ink2;
  for (const q of d.pieces.slice(0, -1)) {
    const [x, y] = toS(L, q.b);
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // the ends, labelled away from the path
  const tA = tangentOf(d.path, 0);
  const tB = tangentOf(d.path, 1);
  paintEnd(ctx, L, p, s.A, 'A', [-tA[0] - 0.4 * tA[1], -tA[1] + 0.4 * tA[0]]);
  paintEnd(ctx, L, p, s.B, 'B', [tB[0] + 0.4 * tB[1], tB[1] - 0.4 * tB[0]]);

  // the marker, the force on it, the direction of dr, the projection
  const r = d.path.at(s.s);
  const f = F(r);
  const tg = tangentOf(d.path, s.s);
  const tl = len(tg) || 1;
  const u: Vec2 = [tg[0] / tl, tg[1] / tl];
  const [mx, my] = toS(L, r);
  const Fref = Math.max(...[-2, 0, 2].flatMap((x) => [-1, 0.5, 1.5].map((y) => len(F([x, y]))))) || 1;
  const fl = Math.max(26, (len(f) / Fref) * 0.75 * L.sc);
  const fm = len(f);
  const fx = fm > 1e-12 ? mx + (f[0] / fm) * fl : mx;
  const fy = fm > 1e-12 ? my - (f[1] / fm) * fl : my;
  const drl = Math.max(30, 0.45 * L.sc);
  const [dx, dy] = [mx + u[0] * drl, my - u[1] * drl];
  if (s.proj && fm > 1e-12) {
    const par = (f[0] * u[0] + f[1] * u[1]) / fm; // cos θ
    const px = mx + u[0] * par * fl;
    const py = my - u[1] * par * fl;
    ctx.save();
    ctx.strokeStyle = withAlpha(p.force, 0.7);
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(px, py);
    ctx.stroke();
    // the line of dr through the marker, both ways, so a projection behind the marker has somewhere to land
    ctx.strokeStyle = withAlpha(p.ink2, 0.45);
    ctx.beginPath();
    ctx.moveTo(mx - u[0] * fl * 1.1, my + u[1] * fl * 1.1);
    ctx.lineTo(mx + u[0] * fl * 1.1, my - u[1] * fl * 1.1);
    ctx.stroke();
    ctx.restore();
    if (Math.abs(par) * fl > 3) {
      // a pale band under the arrow keeps it readable on top of the coloured pieces
      arrow(ctx, mx, my, px, py, { color: p.paper, width: 8, head: 13 });
      arrow(ctx, mx, my, px, py, { color: p.force, width: 4, head: 11 });
      label(ctx, p, 'F∥', px - u[1] * 15, py - u[0] * 15, p.force, 12);
    }
  }
  arrow(ctx, mx, my, dx, dy, { color: p.ink, width: 2, head: 9 });
  label(ctx, p, 'dr', dx + u[0] * 12, dy - u[1] * 12, p.ink, 12);
  if (fm > 1e-12) {
    arrow(ctx, mx, my, fx, fy, { color: p.force, width: 3, head: 11 });
    label(ctx, p, 'F', fx + ((fx - mx) / fl) * 11, fy + ((fy - my) / fl) * 11, p.force, 13);
  }
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(mx, my, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // the graph: W against the length along the path
  const all = [0, d.Wline, ...d.fine.map((q) => q.W)];
  const [lo, hi] = padRange(Math.min(...all), Math.max(...all));
  const plot = makePlot(
    L.plot,
    { min: 0, max: d.length, ticks: niceTicks(0, d.length, L.narrow ? 4 : 3), format: tick },
    { min: lo, max: hi, ticks: niceTicks(lo, hi, 4), format: tick },
  );
  drawAxes(ctx, plot, p);
  zeroLine(ctx, plot, p);
  // the straight segment's work, for comparison
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(plot.box.x, plot.py(d.Wline));
  ctx.lineTo(plot.box.x + plot.box.w, plot.py(d.Wline));
  ctx.stroke();
  ctx.restore();
  const ell = (u: number) => interp(d.fine, u);
  const cut = ell(s.s);
  const Wcurve = (x: number) => interpW(d.fine, x);
  drawCurve(ctx, plot, Wcurve, { color: withAlpha(p.ink, 0.25), width: 1.6, samples: 240 });
  if (cut > 0) drawCurve(ctx, { ...plot, x: { ...plot.x, max: Math.max(cut, 1e-9) } }, Wcurve, { color: p.ink, width: 2.6, samples: 240 });
  const [cx, cy] = [plot.px(cut), plot.py(Wcurve(cut))];
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // the straight segment's note sits above its line, at the left, unless the curve passes there
  // above the line, or below it when the line runs along the top of the graph
  const lineY = plot.py(d.Wline);
  const noteY = lineY - 11 < plot.box.y + 9 ? lineY + 12 : lineY - 11;
  handNote(ctx, 'בקטע הישר', plot.box.x + Math.min(plot.box.w / 2, 46), noteY, p, L.narrow ? 12 : 13);
  title(ctx, p, 'W (J)', plot.box.x, plot.box.y - 6, p.ink, 'left');
  title(ctx, p, 'ℓ (m)', plot.box.x + plot.box.w, plot.box.y + plot.box.h + 30, p.ink2, 'right');
}

function paintMotion(ctx: CanvasRenderingContext2D, L: Layout, p: Palette, s: State, d: MotionData) {
  const F = FIELD[s.field].F;
  paintField(ctx, L, p, F);
  paintOrigin(ctx, L, p, s);
  const now = sampleAt(d, s.t);
  const iNow = d.run.indexOf(now);

  // the whole path, faint; the travelled part in chunks coloured by the sign of the work over the chunk
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.scene.x, L.scene.y, L.scene.w, L.scene.h);
  ctx.clip();
  ctx.strokeStyle = withAlpha(p.ink2, 0.4);
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  d.run.forEach((q, i) => {
    const [x, y] = toS(L, q.pos);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  // the sign of the work over each short chunk; consecutive chunks of one sign are stroked as one line, so the
  // dashes of the negative stretches run on instead of restarting at every chunk
  const chunk = Math.max(1, Math.round(MOTION_STEPS / 60));
  const maxW = Math.max(...d.run.map((q) => Math.abs(q.W)), 1e-12);
  const runs: { sign: number; from: number; to: number }[] = [];
  for (let i = 0; i < iNow; i += chunk) {
    const j = Math.min(iNow, i + chunk);
    const dW = d.run[j].W - d.run[i].W;
    const sign = dW > 1e-9 * maxW ? 1 : dW < -1e-9 * maxW ? -1 : 0;
    const last = runs[runs.length - 1];
    if (last && last.sign === sign) last.to = j;
    else runs.push({ sign, from: i, to: j });
  }
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  for (const r of runs) {
    ctx.strokeStyle = r.sign > 0 ? p.pos : r.sign < 0 ? p.neg : p.ink3;
    ctx.setLineDash(r.sign < 0 ? [7, 4] : []);
    ctx.beginPath();
    for (let k = r.from; k <= r.to; k++) {
      const [x, y] = toS(L, d.run[k].pos);
      if (k === r.from) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // the start, the body, its velocity and the force on it
  const v0 = d.run[0].vel;
  paintEnd(ctx, L, p, s.A, 'A', [-v0[0] || -1, -v0[1]]);
  const [bx, by] = toS(L, now.pos);
  const f = F(now.pos);
  const fm = len(f);
  const Fref = Math.max(...[-2, 0, 2].flatMap((x) => [-1, 0.5, 1.5].map((y) => len(F([x, y]))))) || 1;
  const fl = Math.max(24, (fm / Fref) * 0.7 * L.sc);
  const v = now.vel;
  const vm = len(v);
  const vl = Math.max(22, Math.min(1.1 * L.sc, vm * 0.16 * L.sc));
  if (vm > 1e-6) arrow(ctx, bx, by, bx + (v[0] / vm) * vl, by - (v[1] / vm) * vl, { color: p.velocity, width: 3, head: 10 });
  if (fm > 1e-9) {
    const fx = bx + (f[0] / fm) * fl;
    const fy = by - (f[1] / fm) * fl;
    arrow(ctx, bx, by, fx, fy, { color: p.force, width: 3, head: 10 });
    label(ctx, p, 'F', fx + ((fx - bx) / fl) * 10, fy + ((fy - by) / fl) * 10, p.force, 13);
  }
  if (vm > 1e-6) label(ctx, p, 'v', bx + (v[0] / vm) * (vl + 10), by - (v[1] / vm) * (vl + 10), p.velocity, 13);
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(bx, by, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // the graph: W and ΔK against the time
  const K0 = d.run[0].K;
  const all = [0, ...d.run.map((q) => q.W), ...d.run.map((q) => q.K - K0)];
  const [lo, hi] = padRange(Math.min(...all), Math.max(...all));
  const plot = makePlot(
    L.plot,
    { min: 0, max: d.T, ticks: niceTicks(0, d.T, L.narrow ? 4 : 3), format: tick },
    { min: lo, max: hi, ticks: niceTicks(lo, hi, 4), format: tick },
  );
  drawAxes(ctx, plot, p);
  zeroLine(ctx, plot, p);
  const at = (t: number) => sampleAt(d, t);
  const upTo = { ...plot, x: { ...plot.x, max: Math.max(now.t, 1e-9) } };
  if (now.t > 0) {
    drawCurve(ctx, upTo, (t) => at(t).K - K0, { color: withAlpha(p.energyK, 0.75), width: 7, samples: 300 });
    drawCurve(ctx, upTo, (t) => at(t).W, { color: p.force, width: 2.2, samples: 300, dash: [6, 4] });
  }
  // the key on the time axis's row, bottom left: over the plot it met the labels of the arrows at the body, whose
  // F reaches down into the plot when the body starts low
  const keyY = plot.box.y + plot.box.h + 30;
  title(ctx, p, 'ΔK', plot.box.x, keyY, p.energyK, 'left');
  title(ctx, p, 'W (J)', plot.box.x + 30, keyY, p.force, 'left');
  title(ctx, p, 't (s)',plot.box.x + plot.box.w, plot.box.y + plot.box.h + 30, p.ink2, 'right');
}

function title(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color: string, align: CanvasTextAlign) {
  ctx.save();
  ctx.font = `600 12px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.direction = 'ltr';
  ctx.textAlign = align;
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function zeroLine(ctx: CanvasRenderingContext2D, plot: Plot, p: Palette) {
  const y = plot.py(0);
  if (y < plot.box.y || y > plot.box.y + plot.box.h) return;
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink2, 0.7);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(plot.box.x, y);
  ctx.lineTo(plot.box.x + plot.box.w, y);
  ctx.stroke();
  ctx.restore();
}

const tick = (v: number) => (Math.abs(v) < 1e-9 ? '0' : String(Number(v.toPrecision(3))).replace('-', '−'));

/** The range of a work graph: always 0, a margin, and at least 1 J tall, so that a work that is zero all along (up
    to rounding, 10⁻¹⁶ J) draws as a flat line instead of magnified noise. */
function padRange(lo: number, hi: number): [number, number] {
  let a = Math.min(0, lo);
  let b = Math.max(0, hi);
  if (b - a < 1) {
    const extra = (1 - (b - a)) / 2;
    a -= extra;
    b += extra;
  }
  const d = (b - a) * 0.1;
  return [a - d, b + d];
}

/** the length along the path at parameter u, from the fine pieces */
function interp(fine: WorkPiece[], u: number): number {
  const n = fine.length;
  const x = clamp(u, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const before = i === 0 ? 0 : fine[i - 1].ell;
  return before + (fine[i].ell - before) * (x - i);
}

/** the running work at length ℓ along the path, from the fine pieces */
function interpW(fine: WorkPiece[], ell: number): number {
  let prevEll = 0;
  let prevW = 0;
  for (const q of fine) {
    if (ell <= q.ell) {
      const f = q.ell > prevEll ? (ell - prevEll) / (q.ell - prevEll) : 0;
      return prevW + (q.W - prevW) * f;
    }
    prevEll = q.ell;
    prevW = q.W;
  }
  return prevW;
}
