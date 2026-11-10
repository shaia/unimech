/**
 * ForceIntegrator: the equation of motion along a line under a force that depends on the time or on the position
 * (lesson 2.8). Two modes:
 *
 *   mode 'time'      a force history F(t) (constant, ramp, cosine, sine, decaying push) on a 2.0 kg body that starts
 *                    at rest at x = 0. Three stacked graphs: F(t) with the area under it shaded up to the current
 *                    instant, v(t) = (that area)/m, and x(t) = the area under v(t). The ghost (dashed) is the motion
 *                    under a constant force equal to F(0): what the constant-acceleration formulas would predict.
 *   mode 'position'  a force field F(x): a spring (k = 50 N/m, 2.0 kg released from rest at 0.40 m) or the Earth's
 *                    pull along a radius (a 1000 kg probe released from rest at 3R_E). The body moves on a strip at
 *                    the top (stepped in time with RK4); below, F(x) with the area from x₀ to x shaded, and the speed
 *                    |v| as a function of x from the chain rule, v² = v₀² + (2/m)∫F dx, with the RK4 body on it. The
 *                    ghost is the motion under the constant force F(x₀).
 *
 * Model: src/physics/forcelaw.ts (MODEL SPECIFICATION there). Physics space: LTR, time or position to the right;
 * colours: force --force, velocity --velocity, position ink.
 *
 * Props: id (required), mode, preset, t, showGhost, tasks. Step `set` keys: preset, t, playing, showGhost.
 *
 * Tasks are checked against the figure's own state, never a state a text step produced:
 *   ramp-two      ramp preset; the learner brings t to 2.0 s (v = 3.0 m/s, half of a(2)·t = 6.0 m/s)
 *   cos-max       cosine preset; the learner brings the body to its farthest point, x ≥ 0.98 m (x_max = 1.0 m)
 *   sin-drift     sine preset; the learner runs or scrubs to the end of the two periods (x = 2π m, still growing)
 *   spring-half   spring preset; the learner brings the block to x = 0.20 m (±0.01 m), where |v| = 1.73 m/s
 *   gravity-ghost Earth preset with the ghost shown; the learner runs or scrubs to the surface
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { R_EARTH } from '~/physics/constants';
import {
  GM_EARTH,
  integrateForceOfPosition,
  integrateForceOfTime,
  inverseSquareForce,
  radialFallTime,
  sampleAt,
  speedFromForce,
  springForce,
  type ForceOfPosition,
  type ForceOfTime,
  type TimeSample,
} from '~/physics/forcelaw';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { drawAxes, drawCurve, drawMarker, makePlot, type Plot } from './core/plot';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type FIMode = 'time' | 'position';
export type TimePreset = 'const' | 'ramp' | 'cos' | 'sin' | 'decay';
export type PositionPreset = 'spring' | 'gravity';
type Preset = TimePreset | PositionPreset;

const TIME: TimePreset[] = ['const', 'ramp', 'cos', 'sin', 'decay'];
const POSITION: PositionPreset[] = ['spring', 'gravity'];
const isTime = (p: Preset): p is TimePreset => (TIME as string[]).includes(p);

const NAME: Record<Preset, string> = {
  const: 'כוח קבוע',
  ramp: 'כוח שגדל קווית',
  cos: 'קוסינוס',
  sin: 'סינוס',
  decay: 'דחיפה שדועכת',
  spring: 'קפיץ',
  gravity: 'נפילה לכדור הארץ',
};

/** The mass of the time-mode body [kg]. */
const M_TIME = 2;

interface TimeSpec {
  F: ForceOfTime;
  T: number;
  /** the formula, for the readout (LTR) */
  formula: string;
}
const TIME_SPEC: Record<TimePreset, TimeSpec> = {
  const: { F: () => 4, T: 4, formula: 'F = 4.0 N' },
  ramp: { F: (t) => 3 * t, T: 4, formula: 'F = (3.0 N/s)·t' },
  cos: { F: (t) => 4 * Math.cos(2 * t), T: 2 * Math.PI, formula: 'F = 4.0 cos(2.0t) N' },
  sin: { F: (t) => 4 * Math.sin(2 * t), T: 2 * Math.PI, formula: 'F = 4.0 sin(2.0t) N' },
  decay: { F: (t) => 4 * Math.exp(-t), T: 6, formula: 'F = 4.0 e^(−t/1.0 s) N' },
};

interface PosSpec {
  F: ForceOfPosition;
  m: number;
  x0: number;
  T: number;
  /** display unit of position (m, or R_E) and of speed (m/s, or km/s) */
  xUnit: number;
  xLabel: string;
  vUnit: number;
  vLabel: string;
  xMin: number;
  xMax: number;
  formula: string;
}
const GRAV_M = 1000;
const POS_SPEC: Record<PositionPreset, PosSpec> = {
  spring: {
    F: springForce(50),
    m: 2,
    x0: 0.4,
    T: (2 * Math.PI) / 5,
    xUnit: 1,
    xLabel: 'x (m)',
    vUnit: 1,
    vLabel: '|v| (m/s)',
    xMin: -0.45,
    xMax: 0.45,
    formula: 'F = −(50 N/m)·x',
  },
  gravity: {
    F: inverseSquareForce(GM_EARTH, GRAV_M),
    m: GRAV_M,
    x0: 3 * R_EARTH,
    T: radialFallTime(GM_EARTH, 3 * R_EARTH, R_EARTH),
    xUnit: R_EARTH,
    xLabel: 'r (R_E)',
    vUnit: 1000,
    vLabel: '|v| (km/s)',
    xMin: 0.9 * R_EARTH,
    xMax: 3.1 * R_EARTH,
    formula: 'F = −GMm/r²',
  },
};

const STEPS = 1200;
const RUN_SECONDS = 6;

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside, so it reads left to right in Hebrew. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  'ramp-two': `בכוח שגדל קווית, הביאו את הזמן ל-${ltr('2.0 s')}. השוו את המהירות למכפלה של התאוצה ברגע הזה בזמן.`,
  'cos-max': 'בקוסינוס, הביאו את הגוף לנקודה הרחוקה ביותר שלו. סביב איזו נקודה הוא מתנודד?',
  'sin-drift': 'בסינוס, הריצו עד סוף שני המחזורים. האם הגוף חוזר לנקודת ההתחלה?',
  'spring-half': `בקפיץ, הביאו את הגוש לחצי הדרך, ${ltr('x = 0.20 m')}. האם הוא נע שם בחצי מהמהירות המרבית?`,
  'gravity-ghost': 'בנפילה לכדור הארץ, הציגו את הכוח הקבוע והריצו עד פני הקרקע. מי מגיע מהר יותר?',
};

export interface ForceIntegratorProps {
  id: string;
  mode?: FIMode;
  preset?: Preset;
  t?: number;
  showGhost?: boolean;
  tasks?: string[];
}

interface State {
  preset: Preset;
  t: number;
  playing: boolean;
  showGhost: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const fmt = (x: number, d = 2) => (Math.abs(x) < 0.5 * 10 ** -d ? (0).toFixed(d) : x.toFixed(d)).replace('-', '−');
const sgn = (s: string) => s.replace('-', '−');
const windowOf = (p: Preset) => (isTime(p) ? TIME_SPEC[p].T : POS_SPEC[p].T);

function initial(p: ForceIntegratorProps): State {
  const mode = p.mode ?? 'time';
  const fallback: Preset = mode === 'time' ? 'ramp' : 'spring';
  const preset = p.preset && (mode === 'time' ? isTime(p.preset) : !isTime(p.preset)) ? p.preset : fallback;
  return { preset, t: clamp(p.t ?? 0, 0, windowOf(preset)), playing: false, showGhost: p.showGhost ?? false };
}

/* ---------------------------------------------------------------- the runs */

interface TimeRun {
  kind: 'time';
  run: TimeSample[];
  T: number;
  F0: number;
  range: { F: [number, number]; v: [number, number]; x: [number, number] };
}
interface PosRun {
  kind: 'position';
  spec: PosSpec;
  run: { t: number; x: number; v: number }[];
  T: number;
  Fx0: number;
  range: { F: [number, number]; v: [number, number] };
}

const pad = (lo: number, hi: number): [number, number] => {
  const a = Math.min(0, lo);
  const b = Math.max(0, hi);
  const d = (b - a || 1) * 0.08;
  return [a < 0 ? a - d : 0, b > 0 ? b + d : 0];
};

function timeRun(p: TimePreset): TimeRun {
  const s = TIME_SPEC[p];
  const run = integrateForceOfTime(s.F, M_TIME, 0, 0, s.T, STEPS);
  const ext = (k: 'F' | 'v' | 'x') => pad(Math.min(...run.map((r) => r[k])), Math.max(...run.map((r) => r[k])));
  return { kind: 'time', run, T: s.T, F0: s.F(0), range: { F: ext('F'), v: ext('v'), x: ext('x') } };
}

function posRun(p: PositionPreset): PosRun {
  const spec = POS_SPEC[p];
  const run = integrateForceOfPosition(spec.F, spec.m, spec.x0, 0, spec.T / STEPS, STEPS);
  const Fs = run.map((r) => spec.F(r.x));
  const vMax = Math.max(...run.map((r) => Math.abs(r.v)));
  const Fx0 = spec.F(spec.x0);
  // the ghost under F(x₀) can outrun the true motion (the spring); keep the v axis to the true motion, a little more
  return { kind: 'position', spec, run, T: spec.T, Fx0, range: { F: pad(Math.min(...Fs), Math.max(...Fs)), v: [0, vMax * 1.6] } };
}

function posAt(r: PosRun, t: number): { t: number; x: number; v: number } {
  const n = r.run.length - 1;
  const u = clamp((t / r.T) * n, 0, n);
  const i = Math.min(n - 1, Math.floor(u));
  const f = u - i;
  const a = r.run[i];
  const b = r.run[i + 1];
  return { t, x: a.x + (b.x - a.x) * f, v: a.v + (b.v - a.v) * f };
}

/** ∫ₓ₀ˣ F dx′, midpoint pieces. */
function workIntegral(F: ForceOfPosition, x0: number, x: number, n = 400): number {
  const dx = (x - x0) / n;
  let s = 0;
  for (let i = 0; i < n; i++) s += F(x0 + (i + 0.5) * dx);
  return s * dx;
}

/* ---------------------------------------------------------------- the component */

export default function ForceIntegrator(props: ForceIntegratorProps) {
  const mode: FIMode = props.mode ?? 'time';
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  /** the learner has run or scrubbed time since the last step or preset change */
  const userTime = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const presets: Preset[] = mode === 'time' ? TIME : POSITION;

  const data = useMemo<TimeRun | PosRun>(() => (isTime(s.preset) ? timeRun(s.preset) : posRun(s.preset)), [s.preset]);
  const T = data.T;

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev, playing: false };
          if (typeof step.preset === 'string' && (presets as string[]).includes(step.preset)) {
            if (step.preset !== prev.preset) next.t = 0;
            next.preset = step.preset as Preset;
          }
          if (typeof step.t === 'number') next.t = clamp(step.t, 0, windowOf(next.preset));
          if (typeof step.playing === 'boolean') next.playing = step.playing;
          if (typeof step.showGhost === 'boolean') next.showGhost = step.showGhost;
          stepState.current = next;
          userTime.current = false;
          return next;
        });
      }),
    [props.id],
  );

  // playback: a run lasts about RUN_SECONDS and stops at the end; still mode freezes it
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (motionAllowed() && !document.hidden) {
        setS((prev) => {
          const W = windowOf(prev.preset);
          const t = prev.t + (dt * W) / RUN_SECONDS;
          return t >= W ? { ...prev, t: W, playing: false } : { ...prev, t };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  const now = data.kind === 'time' ? sampleAt(data.run, s.t) : null;
  const pnow = data.kind === 'position' ? posAt(data, s.t) : null;

  // tasks: checked against the figure's own state, never against a state a text step produced
  useEffect(() => {
    if (s === stepState.current || !userTime.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (now && has('ramp-two') && s.preset === 'ramp' && Math.abs(s.t - 2) <= 0.05) done('ramp-two');
    if (now && has('cos-max') && s.preset === 'cos' && now.x >= 0.98) done('cos-max');
    if (now && has('sin-drift') && s.preset === 'sin' && s.t >= 0.97 * T) done('sin-drift');
    if (pnow && has('spring-half') && s.preset === 'spring' && Math.abs(pnow.x - 0.2) <= 0.01) done('spring-half');
    if (pnow && has('gravity-ghost') && s.preset === 'gravity' && s.showGhost && s.t >= 0.99 * T) done('gravity-ghost');
  }, [s, props.id, props.tasks]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s, data)), 700);
    return () => clearTimeout(h);
  }, [s.preset, s.showGhost, Math.round((s.t / T) * 20)]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    if (data.kind === 'time') paintTime(ctx, view, p, s, data);
    else paintPosition(ctx, view, p, s, data);
  };
  const aspect = mode === 'time' ? 1.1 : 1.0;
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: aspect, worldHeight: 1, animate: false });
  useEffect(invalidate, [s, data]);

  const setTime = (t: number) => {
    userTime.current = true;
    setS((prev) => ({ ...prev, t: clamp(t, 0, windowOf(prev.preset)), playing: false }));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setTime(s.t + T / 80);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setTime(s.t - T / 80);
    else return;
    e.preventDefault();
  };
  const reset = () => {
    stepState.current = null;
    userTime.current = false;
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const tFmt = (x: number) => (T > 100 ? `${Math.round(x)} s` : `${fmt(x)} s`);

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${mode === 'time' ? 'כוח שתלוי בזמן, והמהירות והמקום שנבנים ממנו בשתי אינטגרציות' : 'כוח שתלוי במקום, והמהירות כפונקציה של המקום מכלל השרשרת'}. ${describe(s, data)} השתמשו בפס הזמן או בחצים במקלדת.`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      readout={
        data.kind === 'time' && now ? (
          <>
            <span class="q" data-readout="formula">{TIME_SPEC[s.preset as TimePreset].formula}</span>
            <span class="q" data-readout="t">t = {tFmt(s.t)}</span>
            <span class="q" data-readout="F">F = {fmt(now.F)} N</span>
            <span class="q" data-readout="a">a = F/m = {fmt(now.F / M_TIME)} m/s²</span>
            <span data-readout="v">
              השטח מתחת ל-F עד הרגע הזה, חלקי m: <b class="q">v = {fmt(now.v)} m/s</b>
            </span>
            <span data-readout="x">
              השטח מתחת ל-v: <b class="q">x = {fmt(now.x)} m</b>
            </span>
            {s.showGhost && (
              <span data-readout="ghost">
                בכוח קבוע F(0): <b class="q">v = {fmt((data.F0 / M_TIME) * s.t)} m/s, x = {fmt((0.5 * data.F0 * s.t * s.t) / M_TIME)} m</b>
              </span>
            )}
          </>
        ) : data.kind === 'position' && pnow ? (
          <>
            <span class="q" data-readout="formula">{data.spec.formula}</span>
            <span class="q" data-readout="t">t = {tFmt(s.t)}</span>
            <span class="q" data-readout="x">
              {data.spec.xUnit === 1 ? `x = ${fmt(pnow.x)} m` : `r = ${fmt(pnow.x / data.spec.xUnit)} R_E`}
            </span>
            <span class="q" data-readout="F">F = {sgn(sci(data.spec.F(pnow.x)))} N</span>
            <span data-readout="area">
              השטח מתחת ל-F מ-x₀ עד המקום הזה: <b class="q">∫F dx = {sgn(sci(workIntegral(data.spec.F, data.spec.x0, pnow.x)))} J</b>
            </span>
            <span data-readout="v-chain">
              מכלל השרשרת: <b class="q">|v| = {fmt(speedFromForce(data.spec.F, data.spec.m, data.spec.x0, 0, pnow.x, 400) / data.spec.vUnit)} {data.spec.vUnit === 1 ? 'm/s' : 'km/s'}</b>
            </span>
            <span data-readout="v-rk4">
              מצעדים קטנים בזמן: <b class="q">|v| = {fmt(Math.abs(pnow.v) / data.spec.vUnit)} {data.spec.vUnit === 1 ? 'm/s' : 'km/s'}</b>
            </span>
            {s.showGhost && (
              <span data-readout="ghost">
                בכוח קבוע F(x₀):{' '}
                <b class="q">
                  |v| = {fmt(Math.sqrt(Math.max(0, (2 * data.Fx0 * (pnow.x - data.spec.x0)) / data.spec.m)) / data.spec.vUnit)} {data.spec.vUnit === 1 ? 'm/s' : 'km/s'}
                </b>
              </span>
            )}
          </>
        ) : null
      }
      controls={
        <>
          <div class="group" role="group" aria-label={mode === 'time' ? 'הכוח כפונקציה של הזמן' : 'הכוח כפונקציה של המקום'}>
            {presets.map((id) => (
              <Toggle
                key={id}
                label={NAME[id]}
                on={s.preset === id}
                onChange={() => {
                  userTime.current = false;
                  setS((prev) => ({ ...prev, preset: id, t: 0, playing: false }));
                }}
              />
            ))}
          </div>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle
              label={mode === 'time' ? 'כוח קבוע F(0)' : 'כוח קבוע F(x₀)'}
              on={s.showGhost}
              swatch="var(--ink-3)"
              onChange={(on) => setS((prev) => ({ ...prev, showGhost: on }))}
            />
            <Toggle
              label={s.playing ? 'עצירה' : 'הפעלה'}
              on={s.playing}
              onChange={(on) => {
                userTime.current = true;
                setS((prev) => ({ ...prev, playing: on, t: on && prev.t >= windowOf(prev.preset) ? 0 : prev.t }));
              }}
            />
          </div>
          <Slider label="זמן" min={0} max={T} step={T / 400} value={s.t} format={tFmt} onChange={setTime} />
          <p class="hint">
            {mode === 'time'
              ? `גוף בעל מסה ${ltr('2.0 kg')} מתחיל במנוחה ב-${ltr('x = 0')}. השטח הצבוע מתחת לגרף של ${ltr('F')}, חלקי המסה, הוא המהירות.`
              : `הגוף משתחרר ממנוחה ב-${ltr('x₀')}. השטח הצבוע מתחת לגרף של ${ltr('F')} משנה את ${ltr('½mv²')}, ומכאן המהירות בכל מקום.`}
          </p>
        </>
      }
    />
  );
}

function describe(s: State, d: TimeRun | PosRun): string {
  if (d.kind === 'time') {
    const n = sampleAt(d.run, s.t);
    return `${NAME[s.preset]}. ברגע t = ${fmt(s.t)} שניות הכוח ${fmt(n.F)} ניוטון, המהירות ${fmt(n.v)} מטר לשנייה והמקום ${fmt(n.x)} מטר.`;
  }
  const n = posAt(d, s.t);
  const v = Math.abs(n.v) / d.spec.vUnit;
  const where = d.spec.xUnit === 1 ? `${fmt(n.x)} מטר` : `${fmt(n.x / d.spec.xUnit)} רדיוסי כדור הארץ`;
  return `${NAME[s.preset]}. הגוף במקום ${where}, וגודל המהירות שלו ${fmt(v)} ${d.spec.vUnit === 1 ? 'מטר לשנייה' : 'קילומטר לשנייה'}.`;
}

/* ---------------------------------------------------------------- drawing */

function title(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') {
  ctx.save();
  ctx.font = `600 12px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.direction = 'ltr';
  ctx.textAlign = align;
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Shade the signed area between y = f(u) and the axis, for u from a to b (either order). */
function shade(ctx: CanvasRenderingContext2D, plot: Plot, f: (u: number) => number, a: number, b: number, color: string) {
  if (Math.abs(b - a) < 1e-12) return;
  const n = 120;
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

const tickFmt = (v: number) => sgn(sci(v, 2));

/** The top of the stage left free for the reset and fullscreen buttons (two 34 px circles, 8 px from the edge). */
const BUTTONS_BOTTOM = 46;
/** Y ticks at least 16 px apart (so the numbers never touch on a short graph): the smallest round step that fits
    and leaves two to six ticks. */
function yTicks([lo, hi]: [number, number], h: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const mag = 10 ** Math.floor(Math.log10(span / 8));
  for (const m of [1, 10, 100])
    for (const k of [1, 2, 5, 2.5, 4]) {
      const step = k * m * mag;
      if ((h * step) / span < 16) continue;
      const out: number[] = [];
      for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + step * 1e-9; i++) out.push(Number((i * step).toPrecision(12)));
      if (out.length >= 2 && out.length <= 6) return out;
    }
  return [lo, hi];
}
const noTick = () => '';

function paintTime(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, d: TimeRun) {
  const L = 52;
  const Rm = 14;
  // the three graphs share the t axis: only the bottom one carries its numbers, so the gaps hold just a title
  const top = BUTTONS_BOTTOM;
  const gap = 22;
  const bottom = 30;
  const h = (view.h - top - bottom - 2 * gap) / 3;
  const w = view.w - L - Rm;
  const T = d.T;
  const at = (u: number) => sampleAt(d.run, u);
  const mk = (i: number, range: [number, number]) =>
    makePlot(
      { x: L, y: top + i * (h + gap), w, h },
      { min: 0, max: T, format: i === 2 ? tickFmt : noTick },
      { min: range[0], max: range[1], format: tickFmt, ticks: yTicks(range, h) },
    );
  const pF = mk(0, d.range.F);
  const pv = mk(1, d.range.v);
  const px = mk(2, d.range.x);
  const ghostV = (u: number) => (d.F0 / M_TIME) * u;
  const ghostX = (u: number) => (0.5 * d.F0 * u * u) / M_TIME;

  // F(t) with the shaded area up to now
  drawAxes(ctx, pF, p);
  zeroLine(ctx, pF, p);
  shade(ctx, pF, (u) => at(u).F, 0, s.t, withAlpha(p.force, 0.25));
  if (s.showGhost) drawCurve(ctx, pF, () => d.F0, { color: p.ink3, width: 1.6, dash: [5, 5] });
  drawCurve(ctx, pF, (u) => at(u).F, { color: p.force, width: 2.4, samples: 300 });
  nowLine(ctx, pF, p, s.t);
  drawMarker(ctx, pF, s.t, at(s.t).F, p.force, { radius: 4.5 });
  title(ctx, p, 'F (N)', L, pF.box.y - 3, p.force);

  // v(t): solid up to now, faint after
  drawAxes(ctx, pv, p);
  zeroLine(ctx, pv, p);
  if (s.showGhost) drawCurve(ctx, pv, ghostV, { color: p.ink3, width: 1.6, dash: [5, 5] });
  drawCurve(ctx, pv, (u) => at(u).v, { color: withAlpha(p.velocity, 0.3), width: 1.6, samples: 300 });
  drawCurve(ctx, { ...pv, x: { ...pv.x, max: Math.max(s.t, 1e-9) }, px: pv.px }, (u) => at(u).v, { color: p.velocity, width: 2.6, samples: 300 });
  nowLine(ctx, pv, p, s.t);
  drawMarker(ctx, pv, s.t, at(s.t).v, p.velocity, { radius: 4.5 });
  title(ctx, p, 'v (m/s)', L, pv.box.y - 3, p.velocity);

  // x(t)
  drawAxes(ctx, px, p);
  zeroLine(ctx, px, p);
  if (s.showGhost) drawCurve(ctx, px, ghostX, { color: p.ink3, width: 1.6, dash: [5, 5] });
  drawCurve(ctx, px, (u) => at(u).x, { color: withAlpha(p.ink, 0.3), width: 1.6, samples: 300 });
  drawCurve(ctx, { ...px, x: { ...px.x, max: Math.max(s.t, 1e-9) }, px: px.px }, (u) => at(u).x, { color: p.ink, width: 2.6, samples: 300 });
  nowLine(ctx, px, p, s.t);
  drawMarker(ctx, px, s.t, at(s.t).x, p.ink, { radius: 4.5 });
  title(ctx, p, 'x (m)', L, px.box.y - 3, p.ink);
  title(ctx, p, 't (s)', L + w, view.h - 2, p.ink2, 'right');
}

function paintPosition(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, d: PosRun) {
  const sp = d.spec;
  const L = 52;
  const Rm = 14;
  // the body starts at the right end of the strip, where the reset and fullscreen buttons sit: the strip's line
  // runs low enough that the force arrow above the body clears them
  const sy = Math.max(Math.max(60, view.h * 0.2) / 2 + 6, BUTTONS_BOTTOM + 28);
  const stripH = Math.max(60, view.h * 0.2, sy + 34);
  const top = stripH + 22;
  // the two graphs share the x axis: only the bottom one carries its numbers; the gap holds x₀ and a title
  const gap = 24;
  const bottom = 30;
  const h = (view.h - top - bottom - gap) / 2;
  const w = view.w - L - Rm;
  const xs = { min: sp.xMin / sp.xUnit, max: sp.xMax / sp.xUnit, format: tickFmt };
  const FRange: [number, number] = [d.range.F[0], d.range.F[1]];
  const vRange: [number, number] = [d.range.v[0] / sp.vUnit, d.range.v[1] / sp.vUnit];
  const pF = makePlot({ x: L, y: top, w, h }, { ...xs, format: noTick }, { min: FRange[0], max: FRange[1], format: tickFmt, ticks: yTicks(FRange, h) });
  const pv = makePlot({ x: L, y: top + h + gap, w, h }, xs, { min: vRange[0], max: vRange[1], format: tickFmt, ticks: yTicks(vRange, h) });
  const n = posAt(d, s.t);
  const X = n.x / sp.xUnit;
  const X0 = sp.x0 / sp.xUnit;
  const Fu = (u: number) => sp.F(u * sp.xUnit);
  const vChain = (u: number) => speedFromForce(sp.F, sp.m, sp.x0, 0, u * sp.xUnit, 300) / sp.vUnit;
  const vGhost = (u: number) => {
    const v2 = (2 * d.Fx0 * (u * sp.xUnit - sp.x0)) / sp.m;
    return v2 >= 0 ? Math.sqrt(v2) / sp.vUnit : Number.NaN;
  };

  // the strip: the body on its line, with the force and velocity arrows
  ctx.save();
  ctx.beginPath();
  ctx.rect(L, 0, w, stripH + 4);
  ctx.clip();
  if (s.preset === 'spring') {
    // the wall sits at the left edge of the strip (the spring's length is not drawn to scale)
    const wallX = L + 6;
    ctx.fillStyle = withAlpha(p.ink2, 0.35);
    ctx.fillRect(L, sy - 26, 6, 52);
    // a zigzag spring from the wall to the block
    const bx = pF.px(X);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const coils = 12;
    ctx.moveTo(wallX, sy);
    for (let i = 1; i < 2 * coils; i++) ctx.lineTo(wallX + ((bx - 14 - wallX) * i) / (2 * coils), sy + (i % 2 ? -9 : 9));
    ctx.lineTo(bx - 14, sy);
    ctx.stroke();
    ctx.fillStyle = p.ink;
    ctx.fillRect(bx - 14, sy - 14, 28, 28);
  } else {
    // the Earth: a disc of radius R_E about r = 0, mostly off the left edge
    const cx = pF.px(0);
    const rr = pF.px(1) - cx;
    ctx.fillStyle = withAlpha(p.accent, 0.2);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, sy, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(pF.px(X), sy, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const Fmax = Math.max(Math.abs(d.range.F[0]), Math.abs(d.range.F[1]));
  const vMax = d.range.v[1] / 1.6;
  const bx = pF.px(X);
  const Fn = sp.F(n.x);
  if (Math.abs(Fn) > 1e-9 * Fmax) arrow(ctx, bx, sy - 22, bx + (Fn / Fmax) * 70, sy - 22, { color: p.force, width: 3, head: 10 });
  if (Math.abs(n.v) > 1e-3 * vMax) arrow(ctx, bx, sy + 24, bx + (n.v / vMax) * 70, sy + 24, { color: p.velocity, width: 3, head: 10 });

  // F(x) with the area from x₀ to x shaded
  drawAxes(ctx, pF, p);
  // the release point: a dashed line from the strip down through F(x), named under the F axis
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink2, 0.6);
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(pF.px(X0), sy - 30);
  ctx.lineTo(pF.px(X0), pF.box.y + pF.box.h);
  ctx.stroke();
  ctx.restore();
  title(ctx, p, 'x₀', pF.px(X0), pF.box.y + pF.box.h + 17, p.ink2, 'center');
  zeroLine(ctx, pF, p);
  shade(ctx, pF, Fu, X0, X, withAlpha(p.force, 0.25));
  if (s.showGhost) drawCurve(ctx, pF, () => d.Fx0, { color: p.ink3, width: 1.6, dash: [5, 5] });
  drawCurve(ctx, pF, Fu, { color: p.force, width: 2.4, samples: 300 });
  nowLine(ctx, pF, p, X);
  drawMarker(ctx, pF, X, Fn, p.force, { radius: 4.5 });
  title(ctx, p, 'F (N)', L, pF.box.y - 3, p.force);

  // |v|(x): the chain-rule curve, the RK4 body on it, and the ghost
  drawAxes(ctx, pv, p);
  if (s.showGhost) drawCurve(ctx, pv, vGhost, { color: p.ink3, width: 1.6, dash: [5, 5], samples: 300 });
  drawCurve(ctx, pv, vChain, { color: p.velocity, width: 2.4, samples: 300 });
  nowLine(ctx, pv, p, X);
  drawMarker(ctx, pv, X, Math.abs(n.v) / sp.vUnit, p.velocity, { radius: 5 });
  title(ctx, p, sp.vLabel, L, pv.box.y - 3, p.velocity);
  title(ctx, p, sp.xLabel, L + w, view.h - 2, p.ink2, 'right');
}
