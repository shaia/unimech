/**
 * TrajectoryVectors: a point body on a path in the plane with its position vector r, its velocity
 * v = dr/dt and its acceleration a = dv/dt drawn at a movable instant (lesson 1.1). Two modes:
 *
 *   mode 'derive'     a prescribed path r(t) (circle about O, ellipse about O, the rim of a rolling wheel);
 *                     the readout sets the speed |v| beside the two rates it is confused with: d|r|/dt (the
 *                     rate of change of the distance from O) and d|v|/dt (the part of a along v). Optional:
 *                     a split into the parts of a along v (a_t) and across v (a_⊥), and the hodograph (the curve traced by
 *                     the tip of v drawn from one point), to which a is tangent just as v is tangent to the path.
 *   mode 'integrate'  the path rebuilt from a given a(t) and the initial conditions r(0), v(0) by RK4
 *                     (a rotating acceleration of constant size, or constant gravity). Two sliders set v(0);
 *                     the path of the preset's own v(0) stays as a dashed ghost, so the learner sees that the
 *                     same a(t) gives different motions.
 *
 * Model: src/physics/kinematics.ts (MODEL SPECIFICATION there). Physics space: x right, y up, metres;
 * velocity arrows to a stated scale (metres of drawing per m/s), acceleration likewise per m/s², both printed
 * under the figure. Colours: position ink, velocity --velocity, acceleration --accel.
 *
 * Props: id (required), mode, preset, t, v0 ([x, y], integrate only), showPos, showV, showA, showSplit,
 * showHodo, showGhost, tasks. Step `set` keys: preset, t, playing, v0, and the show* booleans.
 *
 * Tasks are ticked only by the learner's own actions (a step's `set` clears what counts as "own"):
 *   ellipse-end   ellipse preset; the learner moves or plays the body to an end of the long axis
 *                 (|r| > 3.9 m), where d|r|/dt = 0 while |v| = 2 m/s
 *   circle-accel  circle preset with the acceleration shown, after the learner shows it, picks the preset or moves
 *   cusp          cycloid preset with the acceleration shown; the learner brings the body to a touch of the
 *                 ground (|v| < 0.1 m/s), where v = 0 and a = (0, 1) m/s²
 *   same-a        integrate mode; the learner moves v(0) more than 0.5 m/s away from the preset's
 *   find-circle   rotating preset; the learner sets v(0) within 0.15 m/s of (0, −a₀/ω) = (0, −2) m/s
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { G } from '~/physics/constants';
import {
  circlePath,
  cycloidPath,
  distanceRate,
  ellipsePath,
  gravityAccel,
  integrateAccel,
  rotatingAccel,
  rotatingDrift,
  speed,
  speedRate,
  splitAccel,
  turningAccel,
  type AccelOfTime,
  type Path2,
} from '~/physics/kinematics';
import { len, type Vec2 } from '~/physics/vec';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 13.4;
const WORLD_H = 10;

export type TVMode = 'derive' | 'integrate';
export type DerivePreset = 'circle' | 'ellipse' | 'cycloid';
export type IntegratePreset = 'rotating' | 'gravity';
type Preset = DerivePreset | IntegratePreset;

const DERIVE: DerivePreset[] = ['circle', 'ellipse', 'cycloid'];
const INTEGRATE: IntegratePreset[] = ['rotating', 'gravity'];
const NAME: Record<Preset, string> = {
  circle: 'מעגל סביב O',
  ellipse: 'אליפסה',
  cycloid: 'נקודה על גלגל מתגלגל',
  rotating: 'תאוצה שמסתובבת',
  gravity: 'תאוצה קבועה כלפי מטה',
};

/** The prescribed paths: circle R = 3 m, ω = 0.8 rad/s; ellipse 4 m × 2.5 m, ω = 0.8 rad/s; wheel R = 1 m, ω = 1 rad/s. */
const PATHS: Record<DerivePreset, Path2> = {
  circle: circlePath(3, 0.8),
  ellipse: ellipsePath(4, 2.5, 0.8),
  cycloid: cycloidPath(1, 1, -2 * Math.PI, -3),
};

/** The rebuilt motions: a(t), r(0), the preset's v(0), the time window, the slider range of v(0), the drawing scales. */
interface Rebuild {
  acc: AccelOfTime;
  r0: Vec2;
  v0: Vec2;
  T: number;
  vMax: number;
  scaleV: number;
  scaleA: number;
}
const A0 = 2;
const OMEGA = 1;
const REBUILD: Record<IntegratePreset, Rebuild> = {
  rotating: { acc: rotatingAccel(A0, OMEGA), r0: [-5, 1], v0: [0.5, -2], T: (4 * Math.PI) / OMEGA, vMax: 3, scaleV: 1, scaleA: 1 },
  gravity: { acc: gravityAccel(G), r0: [-5, -3.5], v0: [4, 7], T: 1.6, vMax: 8, scaleV: 0.45, scaleA: 0.2 },
};
const STEPS = 600;
/** where each preset starts: away from the special instants the tasks ask the learner to find */
const START: Record<Preset, number> = { circle: 0.6, ellipse: 1, cycloid: 1.5, rotating: 0, gravity: 0 };
const SCALE_DERIVE = { v: 1, a: 1 };

const TASK_LABEL: Record<string, string> = {
  'ellipse-end': 'באליפסה, הביאו את הגוף לקצה הציר הארוך, שם המרחק שלו מ-O מפסיק לגדול. האם גודל המהירות שם אפס?',
  'circle-accel': 'במעגל, הציגו את התאוצה. האם היא אפס כשגודל המהירות קבוע?',
  cusp: 'בגלגל המתגלגל, הציגו את התאוצה והביאו את הנקודה לרגע שבו היא נוגעת בקרקע. מה המהירות שם, ומה התאוצה?',
  'same-a': 'שנו את המהירות ההתחלתית. האם התאוצה השתנתה? והמסלול?',
  'find-circle': 'מצאו מהירות התחלתית שבה המסלול נסגר למעגל.',
};

export interface TrajectoryVectorsProps {
  id: string;
  mode?: TVMode;
  preset?: Preset;
  t?: number;
  v0?: [number, number];
  showPos?: boolean;
  showV?: boolean;
  showA?: boolean;
  showSplit?: boolean;
  showHodo?: boolean;
  showGhost?: boolean;
  tasks?: string[];
}

interface State {
  preset: Preset;
  t: number;
  v0: Vec2;
  playing: boolean;
  showPos: boolean;
  showV: boolean;
  showA: boolean;
  showSplit: boolean;
  showHodo: boolean;
  showGhost: boolean;
}

const BOOLS = ['showPos', 'showV', 'showA', 'showSplit', 'showHodo', 'showGhost'] as const;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const isDerive = (p: Preset): p is DerivePreset => (DERIVE as string[]).includes(p);
const duration = (p: Preset) => (isDerive(p) ? PATHS[p].duration : REBUILD[p].T);
/** a number for the readout: two decimals, a true minus sign, no "−0.00" */
const fmt = (x: number, d = 2) => (Math.abs(x) < 0.5 * 10 ** -d ? (0).toFixed(d) : x.toFixed(d)).replace('-', '−');
const vecText = (v: Vec2, d = 2) => `(${fmt(v[0], d)}, ${fmt(v[1], d)})`;

function initial(p: TrajectoryVectorsProps): State {
  const mode = p.mode ?? 'derive';
  const fallback: Preset = mode === 'derive' ? 'ellipse' : 'rotating';
  const preset = p.preset && (mode === 'derive' ? isDerive(p.preset) : !isDerive(p.preset)) ? p.preset : fallback;
  const v0 = isDerive(preset) ? ([0, 0] as Vec2) : ((p.v0 ?? REBUILD[preset].v0) as Vec2);
  return {
    preset,
    t: clamp(p.t ?? START[preset], 0, duration(preset)),
    v0,
    playing: false,
    showPos: p.showPos ?? true,
    showV: p.showV ?? true,
    showA: p.showA ?? false,
    showSplit: p.showSplit ?? false,
    showHodo: p.showHodo ?? false,
    showGhost: p.showGhost ?? true,
  };
}

/** The motion at the current state: r, v, a at time t, and the drawn path (and, when integrating, the ghost). */
interface Kin {
  r: Vec2;
  v: Vec2;
  a: Vec2;
  path: Vec2[];
  hodo: Vec2[];
  ghost: Vec2[] | null;
  T: number;
}

function sample(f: (t: number) => Vec2, T: number, n = 240): Vec2[] {
  return Array.from({ length: n + 1 }, (_, i) => f((T * i) / n));
}

function kinematics(s: State, rebuilt: { r: Vec2[]; v: Vec2[] } | null, ghost: Vec2[] | null): Kin {
  if (isDerive(s.preset)) {
    const p = PATHS[s.preset];
    return { r: p.r(s.t), v: p.v(s.t), a: p.a(s.t), path: sample(p.r, p.duration), hodo: sample(p.v, p.duration), ghost: null, T: p.duration };
  }
  const R = REBUILD[s.preset];
  const rs = rebuilt!.r;
  const vs = rebuilt!.v;
  const u = (s.t / R.T) * STEPS;
  const i = Math.min(STEPS - 1, Math.floor(u));
  const f = u - i;
  const lerp = (a: Vec2, b: Vec2): Vec2 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  return { r: lerp(rs[i], rs[i + 1]), v: lerp(vs[i], vs[i + 1]), a: R.acc(s.t), path: rs, hodo: vs, ghost, T: R.T };
}

export default function TrajectoryVectors(props: TrajectoryVectorsProps) {
  const mode: TVMode = props.mode ?? 'derive';
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const touched = useRef(new Set<string>());
  const drag = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const presets: Preset[] = mode === 'derive' ? DERIVE : INTEGRATE;

  const rebuilt = useMemo(() => {
    if (isDerive(s.preset)) return null;
    const R = REBUILD[s.preset];
    const out = integrateAccel(R.acc, R.r0, s.v0, R.T, STEPS);
    return { r: out.map((o) => o.r), v: out.map((o) => o.v) };
  }, [s.preset, s.v0[0], s.v0[1]]);
  const ghost = useMemo(() => {
    if (isDerive(s.preset)) return null;
    const R = REBUILD[s.preset];
    return integrateAccel(R.acc, R.r0, R.v0, R.T, STEPS).map((o) => o.r);
  }, [s.preset]);
  const k = kinematics(s, rebuilt, ghost);

  const change = (patch: Partial<State>) => {
    for (const key of Object.keys(patch)) touched.current.add(key);
    setS((prev) => ({ ...prev, ...patch }));
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        touched.current.clear();
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.preset === 'string' && (presets as string[]).includes(st.preset)) {
            next.preset = st.preset as Preset;
            next.t = START[next.preset];
            next.v0 = isDerive(next.preset) ? [0, 0] : REBUILD[next.preset].v0;
          }
          if (typeof st.t === 'number') next.t = clamp(st.t, 0, duration(next.preset));
          if (Array.isArray(st.v0) && st.v0.length === 2 && !isDerive(next.preset)) {
            const m = REBUILD[next.preset].vMax;
            next.v0 = [clamp(Number(st.v0[0]), -m, m), clamp(Number(st.v0[1]), -m, m)];
          }
          if (typeof st.playing === 'boolean') next.playing = st.playing;
          for (const key of BOOLS) if (typeof st[key] === 'boolean') next[key] = st[key] as boolean;
          return next;
        });
      }),
    [props.id],
  );

  // playback loops over the time window; frozen in still mode
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const d = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => {
        const T = duration(prev.preset);
        const t = prev.t + d * (isDerive(prev.preset) || prev.preset === 'rotating' ? 1 : 0.4);
        return { ...prev, t: t > T ? t - T : t };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  // tasks
  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const own = (...keys: string[]) => keys.some((key) => touched.current.has(key));
    if (has('ellipse-end') && s.preset === 'ellipse' && own('t', 'playing') && len(k.r) > 3.9) done('ellipse-end');
    if (has('circle-accel') && s.preset === 'circle' && s.showA && own('showA', 'preset', 't', 'playing')) done('circle-accel');
    if (has('cusp') && s.preset === 'cycloid' && s.showA && own('t', 'playing') && speed(k.v) < 0.1) done('cusp');
    if (!isDerive(s.preset) && own('v0')) {
      const R = REBUILD[s.preset];
      if (has('same-a') && Math.hypot(s.v0[0] - R.v0[0], s.v0[1] - R.v0[1]) > 0.5) done('same-a');
      if (has('find-circle') && s.preset === 'rotating' && Math.hypot(s.v0[0], s.v0[1] + A0 / OMEGA) < 0.15) done('find-circle');
    }
  }, [s, props.id, props.tasks]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s, k)), 700);
    return () => clearTimeout(h);
  }, [s.preset, s.showA, s.v0[0], s.v0[1], Math.round(s.t * 2)]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, s, k);
  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s, rebuilt]);

  /** move the body to the point of the path nearest the pointer */
  const grab = (e: PointerEvent) => {
    const view = viewRef.current;
    if (!view) return;
    const [wx, wy] = toWorld(view, e.offsetX, e.offsetY);
    const n = k.path.length - 1;
    let best = 0;
    let bd = Infinity;
    k.path.forEach((r, i) => {
      const d = Math.hypot(r[0] - wx, r[1] - wy);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    change({ t: (k.T * best) / n, playing: false });
  };
  const onPointerDown = (e: PointerEvent) => {
    drag.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    grab(e);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (drag.current) grab(e);
  };
  const onPointerUp = () => {
    drag.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = k.T / 80;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') change({ t: clamp(s.t + step, 0, k.T), playing: false });
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') change({ t: clamp(s.t - step, 0, k.T), playing: false });
    else return;
    e.preventDefault();
  };
  const reset = () => {
    touched.current.clear();
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const sc = isDerive(s.preset) ? SCALE_DERIVE : { v: REBUILD[s.preset].scaleV, a: REBUILD[s.preset].scaleA };
  const vMax = isDerive(s.preset) ? 0 : REBUILD[s.preset].vMax;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: גוף נע במישור, עם וקטור המקום, המהירות והתאוצה שלו. ${describe(s, k)} גררו את הגוף לאורך המסלול או השתמשו בחצים במקלדת.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current ? 'grabbing' : 'grab'}
      readout={
        <>
          <span class="q" data-readout="t">t = {fmt(s.t)} s</span>
          <span class="q" data-readout="speed">|v| = {fmt(speed(k.v))} m/s</span>
          {mode === 'derive' && (
            <span data-readout="dist-rate">
              קצב השינוי של המרחק מ-O: <b class="q">d|r|/dt = {fmt(distanceRate(k.r, k.v))} m/s</b>
            </span>
          )}
          {(s.showA || s.showSplit) && <span class="q" data-readout="accel">|a| = {fmt(len(k.a))} m/s²</span>}
          {mode === 'derive' && (s.showA || s.showSplit) && (
            <span data-readout="speed-rate">
              קצב השינוי של גודל המהירות: <b class="q">aₜ = d|v|/dt = {fmt(speedRate(k.v, k.a))} m/s²</b>
            </span>
          )}
          {s.showSplit && (
            <span data-readout="turning">
              החלק של a שניצב ל-v: <b class="q">a⊥ = {fmt(turningAccel(k.v, k.a))} m/s²</b>
            </span>
          )}
          {mode === 'integrate' && (
            <>
              <span class="q" data-readout="v0">v(0) = {vecText(s.v0, 1)} m/s</span>
              <span class="q" data-readout="v">v(t) = {vecText(k.v)} m/s</span>
              <span class="q" data-readout="a">a(t) = {vecText(k.a)} m/s²</span>
              {s.preset === 'rotating' && (
                <span data-readout="drift">
                  המהירות הממוצעת על פני סיבוב: <b class="q">{vecText(rotatingDrift(A0, OMEGA, s.v0))} m/s</b>
                </span>
              )}
            </>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label={mode === 'derive' ? 'מסלול' : 'תאוצה'}>
            {presets.map((id) => (
              <Toggle
                key={id}
                label={NAME[id]}
                on={s.preset === id}
                onChange={() => {
                  change({ preset: id, t: START[id], playing: false, v0: isDerive(id) ? [0, 0] : REBUILD[id].v0 });
                  // a new preset restarts t and v(0); that is not the learner moving the body or the sliders
                  for (const key of ['t', 'playing', 'v0']) touched.current.delete(key);
                }}
              />
            ))}
          </div>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="וקטור מקום" on={s.showPos} swatch="var(--ink-2)" onChange={(on) => change({ showPos: on })} />
            <Toggle label="מהירות" on={s.showV} swatch="var(--velocity)" onChange={(on) => change({ showV: on })} />
            <Toggle label="תאוצה" on={s.showA} swatch="var(--accel)" onChange={(on) => change({ showA: on })} />
            {mode === 'derive' && (
              <>
                <Toggle label="פירוק התאוצה" on={s.showSplit} swatch="var(--accel)" onChange={(on) => change({ showSplit: on })} />
                <Toggle label="מסלול קצה המהירות" on={s.showHodo} swatch="var(--velocity)" onChange={(on) => change({ showHodo: on })} />
              </>
            )}
            {mode === 'integrate' && (
              <Toggle label="המסלול המקורי" on={s.showGhost} swatch="var(--ink-3)" onChange={(on) => change({ showGhost: on })} />
            )}
            <Toggle label={s.playing ? 'עצירה' : 'הפעלה'} on={s.playing} onChange={(on) => change({ playing: on })} />
          </div>
          <Slider label="זמן" min={0} max={k.T} step={k.T / 300} value={s.t} format={(x) => `${fmt(x)} s`} onChange={(x) => change({ t: x, playing: false })} />
          {mode === 'integrate' && (
            <>
              <Slider
                label="רכיב x של המהירות ההתחלתית"
                min={-vMax}
                max={vMax}
                step={0.1}
                value={s.v0[0]}
                format={(x) => `${fmt(x, 1)} m/s`}
                onChange={(x) => change({ v0: [Math.round(x * 10) / 10, s.v0[1]] })}
              />
              <Slider
                label="רכיב y של המהירות ההתחלתית"
                min={-vMax}
                max={vMax}
                step={0.1}
                value={s.v0[1]}
                format={(x) => `${fmt(x, 1)} m/s`}
                onChange={(x) => change({ v0: [s.v0[0], Math.round(x * 10) / 10] })}
              />
            </>
          )}
          <p class="hint">
            קנה מידה: מטר אחד באיור הוא <span class="q">{fmt(1 / sc.v, 2)} m/s</span> של מהירות או{' '}
            <span class="q">{fmt(1 / sc.a, 2)} m/s²</span> של תאוצה. משבצת היא מטר. גררו את הגוף לאורך המסלול.
          </p>
        </>
      }
    />
  );
}

function describe(s: State, k: Kin): string {
  const base = `${NAME[s.preset]}. ברגע t = ${fmt(s.t)} שניות גודל המהירות ${fmt(speed(k.v))} מטר לשנייה וגודל התאוצה ${fmt(len(k.a))} מטר לשנייה בריבוע.`;
  if (isDerive(s.preset)) return `${base} המרחק מ-O משתנה בקצב ${fmt(distanceRate(k.r, k.v))} מטר לשנייה.`;
  return `${base} המהירות ההתחלתית ${vecText(s.v0, 1)} מטר לשנייה.`;
}

function label(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color: string, size = 14) {
  ctx.save();
  ctx.font = `italic 700 ${size}px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function polylineOf(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, width: number, dash: number[] = []) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  ctx.restore();
}

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, k: Kin) {
  const at = (w: Vec2) => toScreen(view, w[0], w[1]);
  const derive = isDerive(s.preset);
  const sc = isDerive(s.preset) ? SCALE_DERIVE : { v: REBUILD[s.preset].scaleV, a: REBUILD[s.preset].scaleA };

  // 1 m grid and the axes through O
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  for (let i = -7; i <= 7; i++) {
    const [x] = at([i, 0]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, view.h);
    ctx.stroke();
  }
  for (let j = -6; j <= 6; j++) {
    const [, y] = at([0, j]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = withAlpha(p.ink2, 0.5);
  const O = at([0, 0]);
  ctx.beginPath();
  ctx.moveTo(0, O[1]);
  ctx.lineTo(view.w, O[1]);
  ctx.moveTo(O[0], 0);
  ctx.lineTo(O[0], view.h);
  ctx.stroke();
  ctx.restore();
  label(ctx, p, 'x', view.w - 10, O[1] - 10, p.ink2, 13);
  label(ctx, p, 'y', O[0] + 10, 10, p.ink2, 13);

  // the ghost (integrate mode): the path of the preset's own v(0)
  if (!derive && s.showGhost && k.ghost) polylineOf(ctx, k.ghost.map(at), withAlpha(p.ink3, 0.8), 1.6, [3, 5]);

  // the path: dashed in full, solid up to now when integrating
  polylineOf(ctx, k.path.map(at), withAlpha(p.ink2, derive ? 1 : 0.45), derive ? 2 : 1.6, [7, 5]);
  if (!derive) {
    const n = Math.round((s.t / k.T) * (k.path.length - 1));
    polylineOf(ctx, k.path.slice(0, n + 1).map(at), p.ink2, 2.4);
  }

  // origin
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(O[0], O[1], 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  label(ctx, p, 'O', O[0] - 11, O[1] + 12, p.ink, 14);

  const B = at(k.r);
  const tip = (w: Vec2, scale: number): [number, number] => at([k.r[0] + w[0] * scale, k.r[1] + w[1] * scale]);
  const tag = (text: string, to: [number, number], color: string) => {
    const dx = to[0] - B[0];
    const dy = to[1] - B[1];
    const L = Math.hypot(dx, dy) || 1;
    label(ctx, p, text, to[0] + (dx / L) * 13 - (dy / L) * 6, to[1] + (dy / L) * 13 + (dx / L) * 6, color);
  };

  if (s.showPos) {
    arrow(ctx, O[0], O[1], B[0], B[1], { color: p.ink2, width: 2.2, head: 11 });
    label(ctx, p, 'r', (O[0] + B[0]) / 2 + 9, (O[1] + B[1]) / 2 - 9, p.ink2, 15);
  }
  if (s.showV && speed(k.v) > 1e-6) {
    const tv = tip(k.v, sc.v);
    arrow(ctx, B[0], B[1], tv[0], tv[1], { color: p.velocity, width: 3.2, head: 13 });
    tag('v', tv, p.velocity);
  }
  if (s.showA && len(k.a) > 1e-6) {
    const ta = tip(k.a, sc.a);
    if (derive && s.showSplit) {
      const { along, across } = splitAccel(k.v, k.a);
      const t1 = tip(along, sc.a);
      const t2 = tip(across, sc.a);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = withAlpha(p.accel, 0.5);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(t1[0], t1[1]);
      ctx.lineTo(ta[0], ta[1]);
      ctx.lineTo(t2[0], t2[1]);
      ctx.stroke();
      ctx.restore();
      if (len(along) > 1e-3) {
        arrow(ctx, B[0], B[1], t1[0], t1[1], { color: withAlpha(p.accel, 0.75), width: 2.2, head: 10 });
        tag('aₜ', t1, p.accel);
      }
      if (len(across) > 1e-3) {
        arrow(ctx, B[0], B[1], t2[0], t2[1], { color: withAlpha(p.accel, 0.75), width: 2.2, head: 10 });
        tag('a⊥', t2, p.accel);
      }
    }
    arrow(ctx, B[0], B[1], ta[0], ta[1], { color: p.accel, width: 4, head: 14 });
    tag('a', ta, p.accel);
  } else if (s.showA) {
    label(ctx, p, 'a = 0', B[0] + 26, B[1] - 18, p.accel, 13);
  }

  // the body, on top
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(B[0], B[1], 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (derive && s.showHodo) hodograph(ctx, view, p, k);
}

/** The hodograph inset (top right): the tips of v(t) drawn from one point, with v now and a at its tip, tangent to it. */
function hodograph(ctx: CanvasRenderingContext2D, view: View, p: Palette, k: Kin) {
  const w = Math.min(view.w * 0.34, 210);
  const h = w * 0.8;
  const x0 = view.w - w - 8;
  const y0 = 8;
  let m = 0.5;
  for (const v of k.hodo) m = Math.max(m, Math.abs(v[0]), Math.abs(v[1]));
  const ppu = (Math.min(w, h) / 2 - 14) / m;
  const cx = x0 + w / 2;
  const cy = y0 + h / 2 + 6;
  const at = (v: Vec2): [number, number] => [cx + v[0] * ppu, cy - v[1] * ppu];
  ctx.save();
  ctx.fillStyle = withAlpha(p.paper, 0.92);
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  polylineOf(ctx, k.hodo.map(at), withAlpha(p.velocity, 0.6), 1.6, [5, 4]);
  const tv = at(k.v);
  arrow(ctx, cx, cy, tv[0], tv[1], { color: p.velocity, width: 2.6, head: 11 });
  label(ctx, p, 'v', tv[0] + 10, tv[1] - 8, p.velocity, 13);
  if (len(k.a) > 1e-6) {
    const ta = at([k.v[0] + k.a[0] * 0.6, k.v[1] + k.a[1] * 0.6]);
    arrow(ctx, tv[0], tv[1], ta[0], ta[1], { color: p.accel, width: 2.6, head: 10 });
    label(ctx, p, 'a', ta[0] + 9, ta[1] + 9, p.accel, 13);
  }
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `600 11px ${p.fontUi}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = p.ink2;
  ctx.fillText('v (m/s)', x0 + 6, y0 + 5);
  ctx.restore();
}
