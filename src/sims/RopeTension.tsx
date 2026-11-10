/**
 * RopeTension (lesson 2.3): the forces of mechanics that have no formula of their own. Seven scenes, each a
 * drawing on the left and a graph on the right:
 * - elevator: a person on a scale in an elevator; the normal force N = m(g + a) against the elevator's
 *   acceleration, and the person's free-body diagram (weight by the Earth, N by the scale);
 * - hump: a car at the top of a hump of radius R; N = m(g − v²/R) against its speed, zero at √(gR);
 * - slope: a block on a frictionless incline pushed by a horizontal force; N = mg cos θ + F sin θ against
 *   the angle, beside the push-free mg cos θ (N is not "mg cos θ" by formula);
 * - spring: a body hanging on one spring, on two in series or on two in parallel (Hooke's law): the spring
 *   force against the extension, and where it meets mg;
 * - atwood: a massless string over a massless frictionless pulley: one tension along the whole string,
 *   between m₁g and m₂g;
 * - hanging: a uniform rope hanging from a ceiling (or lifted with acceleration a), with a load: T against
 *   the depth, and the free-body diagram of the part below a cut;
 * - pulled: a uniform rope dragging a block along a frictionless floor: T against the distance from the
 *   block, and the part behind a cut.
 *
 * Physics comes from src/physics/tension.ts. Nothing moves: every scene is the state at one instant (or an
 * equilibrium), so there is no animation and nothing for still mode to freeze.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import {
  atwood,
  elevatorNormal,
  hangingExtension,
  hangingRope,
  hangingTensionAtDepth,
  humpNormal,
  humpTakeoffSpeed,
  inclinePush,
  parallelK,
  pulledRope,
  ropeTension,
  seriesK,
} from '~/physics/tension';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/** The bodies of each scene (fixed; the sliders change the rest). */
const PERSON = 60; // kg
const SPRING_K = 100; // N/m, each spring
const MASS_MAX = 1; // kg, the spring slider's top
const M1 = 2; // kg, the lighter side of the Atwood machine
const M2_MAX = 6; // kg, the top of the m₂ slider
const ROPE_M = 1; // kg, the hanging rope
const ROPE_L = 2; // m
const PULL_F = 12; // N
const BLOCK = 2; // kg
const PULL_L = 3; // m
const CAR = 800; // kg
const HUMP_R = 50; // m
const V_MAX = 25; // m/s
const SLOPE_M = 4; // kg
const PUSH_MAX = 40; // N
const THETA_MAX = 60; // deg

const A_MIN = -G;
const A_MAX = 5;

/** the reset and fullscreen buttons cover this corner of the stage (CSS px from the top-right) */
const BUTTONS_W = 96;
const BUTTONS_H = 52;

/** below this stage width (CSS px) the canvas is taller, axis titles are short and ticks are fewer */
const NARROW_W = 520;
const NARROW_ASPECT = 1.1;
const isNarrow = (w: number) => w > 0 && w < NARROW_W;
/** an axis title and its ticks: the full title on a wide stage, a short one on a narrow stage */
const axisText = (v: View, full: string, short: string) => (isNarrow(v.w) ? short : full);
const axisTicks = (v: View, full: number[] | undefined, few: number[]) => (isNarrow(v.w) ? few : full);

export type Preset = 'elevator' | 'hump' | 'slope' | 'spring' | 'atwood' | 'hanging' | 'pulled';
type SpringMode = 'one' | 'series' | 'parallel';

const PRESET_LABEL: Record<Preset, string> = {
  elevator: 'מאזניים במעלית',
  hump: 'מכונית בפסגת גבעה',
  slope: 'גוש על מדרון',
  spring: 'גוף על קפיץ',
  atwood: 'חוט חסר מסה על גלגלת',
  hanging: 'חבל תלוי',
  pulled: 'חבל שמושך גוש',
};
const MODE_LABEL: Record<SpringMode, string> = { one: 'קפיץ אחד', series: 'שניים בטור', parallel: 'שניים במקביל' };

const TASK_LABEL: Record<string, string> = {
  'elev-heavy': 'גרמו למאזניים להראות יותר מ-mg. לאיזה כיוון פונה התאוצה?',
  'elev-light': 'גרמו למאזניים להראות פחות מ-mg, אבל לא אפס.',
  'elev-free': 'מצאו את התאוצה שבה המאזניים מראים אפס.',
  'spring-double': 'הכפילו את המסה התלויה. פי כמה גדלה ההתארכות?',
  'spring-series': 'תלו את הגוף על שני קפיצים בטור. פי כמה גדלה ההתארכות?',
  'spring-parallel': 'תלו את הגוף על שני קפיצים במקביל. איזה חלק מהכובד נושא כל קפיץ?',
  'atwood-equal': 'בחרו "חוט חסר מסה על גלגלת" והשוו את m₂ ל-m₁. מה המתיחות עכשיו?',
  'hang-mid': 'בחרו "חבל תלוי" בלי משקולת ובלי הרמה, והזיזו את החתך לאמצע החבל. איזה חלק מהכובד של החבל המתיחות שם מחזיקה?',
  'pull-massless': 'בחרו "חבל שמושך גוש" והקטינו את מסת החבל לאפס. מה קורה לגרף?',
};

interface State {
  preset: Preset;
  /** elevator acceleration, up + [m/s²] */
  a: number;
  /** the car's speed at the top of the hump [m/s] */
  v: number;
  /** the slope's angle [deg] and the horizontal push toward it [N] */
  theta: number;
  push: number;
  /** mass on the spring [kg] */
  mass: number;
  mode: SpringMode;
  /** the heavier side of the Atwood machine [kg] */
  m2: number;
  /** load at the bottom of the hanging rope [kg] */
  load: number;
  /** the hanging rope's lift acceleration, up + [m/s²] */
  lift: number;
  /** the cut, as a fraction of the rope's length: depth below the ceiling (hanging), distance from the block (pulled) */
  cut: number;
  /** mass of the pulled rope [kg] */
  ropeMass: number;
}

export interface RopeTensionProps {
  id: string;
  preset?: Preset;
  /** presets offered as buttons (default: only the starting one, no buttons) */
  presets?: Preset[];
  a?: number;
  v?: number;
  theta?: number;
  push?: number;
  mass?: number;
  mode?: SpringMode;
  m2?: number;
  load?: number;
  lift?: number;
  cut?: number;
  ropeMass?: number;
  tasks?: string[];
}

function initial(p: RopeTensionProps): State {
  return {
    preset: p.preset ?? 'elevator',
    a: p.a ?? 0,
    v: p.v ?? 15,
    theta: p.theta ?? 30,
    push: p.push ?? 0,
    mass: p.mass ?? 0.3,
    mode: p.mode ?? 'one',
    m2: p.m2 ?? 3,
    load: p.load ?? 0,
    lift: p.lift ?? 0,
    cut: p.cut ?? 0.25,
    ropeMass: p.ropeMass ?? 1,
  };
}

const kOf = (mode: SpringMode) => (mode === 'one' ? SPRING_K : mode === 'series' ? seriesK(SPRING_K, SPRING_K) : parallelK(SPRING_K, SPRING_K));

/** Everything the scene shows, computed from the state by src/physics/tension.ts. */
function solve(s: State) {
  const N = elevatorNormal(PERSON, s.a);
  const Nhump = humpNormal(CAR, s.v, HUMP_R);
  const slope = inclinePush(SLOPE_M, s.theta, s.push);
  const k = kOf(s.mode);
  const x = hangingExtension(s.mass, k);
  const at = atwood(M1, s.m2);
  const hang = hangingRope(s.load, ROPE_M, ROPE_L, s.lift);
  const y = s.cut * ROPE_L;
  const pull = pulledRope(PULL_F, BLOCK, s.ropeMass, PULL_L);
  const sp = s.cut * PULL_L;
  return {
    N,
    Nhump,
    slope,
    k,
    x,
    at,
    hang,
    y,
    Thang: hangingTensionAtDepth(hang, y),
    pull,
    sp,
    Tpull: ropeTension(pull, sp),
  };
}

const num = (x: number) => (Math.abs(x) < 5e-4 ? '0' : sci(x, 3).replace('-', '−'));

export default function RopeTension(props: RopeTensionProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  /** the controls the reader has moved since the last step, reset or preset change */
  const touched = useRef(new Set<string>());
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const q = solve(s);
  const m0 = initial(props).mass;

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev };
          if (typeof step.preset === 'string' && step.preset in PRESET_LABEL) next.preset = step.preset as Preset;
          for (const key of ['a', 'v', 'theta', 'push', 'mass', 'm2', 'load', 'lift', 'cut', 'ropeMass'] as const) {
            if (typeof step[key] === 'number') next[key] = step[key] as number;
          }
          if (step.mode === 'one' || step.mode === 'series' || step.mode === 'parallel') next.mode = step.mode;
          stepState.current = next;
          touched.current = new Set();
          return next;
        });
      }),
    [props.id],
  );

  // tasks: checked against the figure's own state, never against a state a text step produced
  useEffect(() => {
    if (s === stepState.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const moved = (c: string) => touched.current.has(c);
    if (s.preset === 'elevator' && moved('a')) {
      if (has('elev-heavy') && s.a >= 1) done('elev-heavy');
      if (has('elev-light') && s.a <= -1 && s.a > A_MIN + 0.05) done('elev-light');
      if (has('elev-free') && s.a <= A_MIN + 1e-9) done('elev-free');
    }
    if (s.preset === 'spring') {
      if (has('spring-double') && moved('mass') && s.mode === 'one' && Math.abs(s.mass - 2 * m0) < 0.026) done('spring-double');
      if (has('spring-series') && moved('mode') && s.mode === 'series') done('spring-series');
      if (has('spring-parallel') && moved('mode') && s.mode === 'parallel') done('spring-parallel');
    }
    if (has('atwood-equal') && s.preset === 'atwood' && moved('m2') && Math.abs(s.m2 - M1) < 1e-9) done('atwood-equal');
    if (has('hang-mid') && s.preset === 'hanging' && moved('cut') && s.load === 0 && s.lift === 0 && Math.abs(s.cut - 0.5) < 0.026)
      done('hang-mid');
    if (has('pull-massless') && s.preset === 'pulled' && moved('ropeMass') && s.ropeMass === 0) done('pull-massless');
  }, [s, props.id, props.tasks, m0]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const L = (text: string, x: number, y: number, color: string) => label(ctx, text, x, y, color, p, view);
    const outer = { x: view.w * 0.5, y: 0, w: view.w * 0.5, h: view.h };
    const narrow = isNarrow(view.w);
    const box = insetBox(outer, { l: narrow ? 50 : 56, r: narrow ? 8 : 14, t: BUTTONS_H + 6, b: 46 });
    if (s.preset === 'elevator') drawElevator(ctx, view, p, s, q, box, L);
    else if (s.preset === 'hump') drawHump(ctx, view, p, s, q, box, L);
    else if (s.preset === 'slope') drawSlope(ctx, view, p, s, q, box, L);
    else if (s.preset === 'spring') drawSpring(ctx, view, p, s, q, box, L);
    else if (s.preset === 'atwood') drawAtwood(ctx, view, p, s, q, box, L);
    else if (s.preset === 'hanging') drawHanging(ctx, view, p, s, q, box, L);
    else drawPulled(ctx, view, p, s, q, box, L);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 3, worldHeight: 2, animate: false });
  useEffect(invalidate, [s]);
  // a narrow stage (a phone) gets a taller canvas: the scene and the graph each have half the width
  const [narrowStage, setNarrowStage] = useState(false);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrowStage(isNarrow(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const describe = (): string => {
    switch (s.preset) {
      case 'elevator':
        return `אדם בעל מסה ${PERSON} kg על מאזניים במעלית שתאוצתה ${num(s.a)} m/s² (חיובי כלפי מעלה). הכוח הנורמלי ${num(q.N)} N, והכובד ${num(PERSON * G)} N.`;
      case 'hump':
        return q.Nhump > 0
          ? `מכונית בעלת מסה ${CAR} kg בפסגה של גבעה ברדיוס ${HUMP_R} m, במהירות ${num(s.v)} m/s. הכוח הנורמלי ${num(q.Nhump)} N, והכובד ${num(CAR * G)} N.`
          : `מכונית בעלת מסה ${CAR} kg בפסגה של גבעה ברדיוס ${HUMP_R} m, במהירות ${num(s.v)} m/s, מעל ${num(humpTakeoffSpeed(HUMP_R))} m/s: הכוח הנורמלי אפס, והמכונית מתנתקת מהכביש.`;
      case 'slope':
        return `גוש בעל מסה ${SLOPE_M} kg על מדרון חלק בזווית ${num(s.theta)} מעלות, ודחיפה אופקית של ${num(s.push)} N אל המדרון. הכוח הנורמלי ${num(q.slope.N)} N, ובלי הדחיפה הוא היה ${num(SLOPE_M * G * Math.cos((s.theta * Math.PI) / 180))} N.`;
      case 'spring':
        return `גוף בעל מסה ${num(s.mass)} kg תלוי על ${MODE_LABEL[s.mode]}. קבוע הקפיץ השקול ${num(q.k)} N/m, וההתארכות ${num(q.x * 100)} cm.`;
      case 'atwood':
        return `שתי משקולות, ${M1} kg ו-${num(s.m2)} kg, על חוט חסר מסה שעובר על גלגלת. התאוצה ${num(q.at.a)} m/s², והמתיחות ${num(q.at.T)} N בכל נקודה בחוט.`;
      case 'hanging':
        return `חבל בעל מסה ${ROPE_M} kg ואורך ${ROPE_L} m תלוי, עם משקולת ${num(s.load)} kg ותאוצת הרמה ${num(s.lift)} m/s². בעומק ${num(q.y)} m המתיחות ${num(q.Thang)} N.`;
      default:
        return `חבל בעל מסה ${num(s.ropeMass)} kg מושך גוש של ${BLOCK} kg בכוח ${PULL_F} N. התאוצה ${num(q.pull.aEff)} m/s², ובמרחק ${num(q.sp)} m מהגוש המתיחות ${num(q.Tpull)} N.`;
    }
  };

  const set = (control: string, patch: Partial<State>) => {
    touched.current.add(control);
    setS((prev) => ({ ...prev, ...patch }));
  };
  const choosePreset = (preset: Preset) => {
    touched.current = new Set();
    setS((prev) => ({ ...prev, preset }));
    setLive(`נבחר המצב: ${PRESET_LABEL[preset]}.`);
  };
  const reset = () => {
    stepState.current = null;
    touched.current = new Set();
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const presets = props.presets ?? [];
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: כוחות במכניקה. ${describe()}`}
      canvasRef={canvasRef}
      aspect={narrowStage ? NARROW_ASPECT : 3 / 2}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          {s.preset === 'elevator' && (
            <>
              <span class="q" data-readout="a">a = {num(s.a)} m/s²</span>
              <b class="q" data-readout="N">N = {num(q.N)} N</b>
              <span class="q" data-readout="mg">mg = {num(PERSON * G)} N</span>
              <span class="q" data-readout="reading">N/g = {num(q.N / G)} kg</span>
            </>
          )}
          {s.preset === 'hump' && (
            <>
              <span class="q" data-readout="v">v = {num(s.v)} m/s</span>
              <b class="q" data-readout="N">N = {num(Math.max(0, q.Nhump))} N</b>
              <span class="q" data-readout="mg">mg = {num(CAR * G)} N</span>
              <span class="q" data-readout="takeoff">√(gR) = {num(humpTakeoffSpeed(HUMP_R))} m/s</span>
            </>
          )}
          {s.preset === 'slope' && (
            <>
              <span class="q" data-readout="theta">θ = {num(s.theta)}°</span>
              <span class="q" data-readout="push">F = {num(s.push)} N</span>
              <b class="q" data-readout="N">N = {num(q.slope.N)} N</b>
              <span class="q" data-readout="mgcos">mg cosθ = {num(SLOPE_M * G * Math.cos((s.theta * Math.PI) / 180))} N</span>
            </>
          )}
          {s.preset === 'spring' && (
            <>
              <span class="q" data-readout="k">k = {num(q.k)} N/m</span>
              <span class="q" data-readout="mg">mg = {num(s.mass * G)} N</span>
              <b class="q" data-readout="x">Δx = {num(q.x * 100)} cm</b>
            </>
          )}
          {s.preset === 'atwood' && (
            <>
              <span class="q" data-readout="masses">m₁ = {M1} kg, m₂ = {num(s.m2)} kg</span>
              <span class="q" data-readout="a">a = {num(q.at.a)} m/s²</span>
              <b class="q" data-readout="T">T = {num(q.at.T)} N</b>
              <span class="q" data-readout="weights">m₁g = {num(M1 * G)} N, m₂g = {num(s.m2 * G)} N</span>
            </>
          )}
          {s.preset === 'hanging' && (
            <>
              <span class="q" data-readout="y">y = {num(q.y)} m</span>
              <b class="q" data-readout="T">T(y) = {num(q.Thang)} N</b>
              <span class="q" data-readout="Ttop">T(0) = {num(hangingTensionAtDepth(q.hang, 0))} N</span>
              <span class="q" data-readout="Tbottom">T(L) = {num(hangingTensionAtDepth(q.hang, ROPE_L))} N</span>
            </>
          )}
          {s.preset === 'pulled' && (
            <>
              <span class="q" data-readout="a">a = {num(q.pull.aEff)} m/s²</span>
              <span class="q" data-readout="s">s = {num(q.sp)} m</span>
              <b class="q" data-readout="T">T(s) = {num(q.Tpull)} N</b>
              <span class="q" data-readout="Tblock">T(0) = {num(ropeTension(q.pull, 0))} N</span>
            </>
          )}
        </>
      }
      controls={
        <>
          {presets.length > 1 && (
            <div class="group" role="group" aria-label="בחירת מצב">
              {presets.map((name) => (
                <Toggle key={name} label={PRESET_LABEL[name]} on={s.preset === name} onChange={() => choosePreset(name)} />
              ))}
            </div>
          )}
          {s.preset === 'elevator' && (
            <Slider label="תאוצת המעלית a" min={A_MIN} max={A_MAX} step={0.1} value={s.a} format={(v) => `${num(v)} m/s²`} onChange={(v) => set('a', { a: Math.max(A_MIN, Math.round(v * 10) / 10) })} />
          )}
          {s.preset === 'hump' && (
            <Slider label="המהירות בפסגה v" min={0} max={V_MAX} step={0.5} value={s.v} format={(v) => `${num(v)} m/s`} onChange={(v) => set('v', { v: Math.round(v * 2) / 2 })} />
          )}
          {s.preset === 'slope' && (
            <>
              <Slider label="זווית המדרון θ" min={0} max={THETA_MAX} step={1} value={s.theta} format={(v) => `${num(v)}°`} onChange={(v) => set('theta', { theta: Math.round(v) })} />
              <Slider label="הדחיפה האופקית F" min={0} max={PUSH_MAX} step={1} value={s.push} format={(v) => `${num(v)} N`} onChange={(v) => set('push', { push: Math.round(v) })} />
            </>
          )}
          {s.preset === 'spring' && (
            <>
              <Slider label="המסה m" min={0.1} max={MASS_MAX} step={0.05} value={s.mass} format={(v) => `${num(v)} kg`} onChange={(v) => set('mass', { mass: Math.round(v * 20) / 20 })} />
              <div class="group" role="group" aria-label="חיבור הקפיצים">
                {(['one', 'series', 'parallel'] as SpringMode[]).map((mode) => (
                  <Toggle key={mode} label={MODE_LABEL[mode]} on={s.mode === mode} swatch="var(--force)" onChange={() => set('mode', { mode })} />
                ))}
              </div>
            </>
          )}
          {s.preset === 'atwood' && (
            <Slider label="המסה m₂" min={1} max={M2_MAX} step={0.5} value={s.m2} format={(v) => `${num(v)} kg`} onChange={(v) => set('m2', { m2: Math.round(v * 2) / 2 })} />
          )}
          {s.preset === 'hanging' && (
            <>
              <Slider label="עומק החתך y" min={0} max={ROPE_L} step={0.05} value={q.y} format={(v) => `${num(v)} m`} onChange={(v) => set('cut', { cut: Math.round((v / ROPE_L) * 40) / 40 })} />
              <Slider label="המשקולת M" min={0} max={1} step={0.1} value={s.load} format={(v) => `${num(v)} kg`} onChange={(v) => set('load', { load: Math.round(v * 10) / 10 })} />
              <Slider label="תאוצת ההרמה a" min={-3} max={3} step={0.1} value={s.lift} format={(v) => `${num(v)} m/s²`} onChange={(v) => set('lift', { lift: Math.round(v * 10) / 10 })} />
            </>
          )}
          {s.preset === 'pulled' && (
            <>
              <Slider label="מקום החתך s" min={0} max={PULL_L} step={0.05} value={q.sp} format={(v) => `${num(v)} m`} onChange={(v) => set('cut', { cut: Math.round((v / PULL_L) * 60) / 60 })} />
              <Slider label="מסת החבל m" min={0} max={2} step={0.1} value={s.ropeMass} format={(v) => `${num(v)} kg`} onChange={(v) => set('ropeMass', { ropeMass: Math.round(v * 10) / 10 })} />
            </>
          )}
        </>
      }
    />
  );
}

type Solved = ReturnType<typeof solve>;
type LabelFn = (text: string, x: number, y: number, color: string) => void;
type Box = { x: number; y: number; w: number; h: number };

/* ----------------------------------------------------------------------------------------- scenes */

function drawElevator(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: State, q: Solved, box: Box, L: LabelFn) {
  const W = v.w;
  const H = v.h;
  // the cabin, hanging from its cable
  const cx0 = W * 0.05;
  const cx1 = W * 0.29;
  const cy0 = H * 0.14;
  const cy1 = H * 0.86;
  line(ctx, (cx0 + cx1) / 2, 0, (cx0 + cx1) / 2, cy0, p.ink3, 2);
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
  ctx.restore();
  // the scale on the floor, and the person on it
  const mid = (cx0 + cx1) / 2;
  const scaleH = 8;
  fillRect(ctx, mid - W * 0.06, cy1 - scaleH, W * 0.12, scaleH, p.ink2);
  const pw = W * 0.06;
  const ph = H * 0.34;
  fillRect(ctx, mid - pw / 2, cy1 - scaleH - ph, pw, ph, withAlpha(p.ink, 0.18));
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mid - pw / 2, cy1 - scaleH - ph, pw, ph);
  ctx.beginPath();
  ctx.arc(mid, cy1 - scaleH - ph - 12, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  L(`${PERSON} kg`, mid, cy1 - scaleH - ph / 2, p.ink);
  // the acceleration of the cabin
  const kA = (H * 0.24) / G;
  const ax = cx1 + 16;
  const ay = H * 0.5;
  if (Math.abs(s.a) > 0.05) {
    // a small acceleration still gets a shaft, not only a head
    const up = Math.sign(s.a) * Math.max(Math.abs(s.a) * kA, 22);
    arrow(ctx, ax, ay, ax, ay - up, { color: p.accel, width: 3, head: 11 });
    L('a', ax + 12, ay - up * 0.6, p.accel);
  } else if (isNarrow(W)) {
    // no room beside the cabin on a phone: the free-body diagram is right there. Inside the cabin, above the head.
    L('a = 0', mid, cy0 + 16, p.accel);
  } else L('a = 0', ax + 18, ay, p.accel);

  // the person's free-body diagram: weight by the Earth, N by the scale
  const fx = W * 0.4;
  const fy = H * 0.52;
  const kF = (H * 0.22) / (PERSON * G);
  dot(ctx, fx, fy, p.ink);
  arrow(ctx, fx, fy, fx, fy + PERSON * G * kF, { color: p.force, width: 3, head: 11 });
  L('mg', fx + 20, fy + PERSON * G * kF * 0.7, p.force);
  if (q.N > 0.5) {
    arrow(ctx, fx, fy, fx, fy - q.N * kF, { color: p.force, width: 3, head: 11 });
    L('N', fx + 16, fy - q.N * kF * 0.7, p.force);
  } else L('N = 0', fx, fy - 20, p.force);

  const plot = makePlot(
    box,
    { min: A_MIN, max: A_MAX, label: axisText(v, 'תאוצת המעלית a (m/s²)', 'התאוצה a (m/s²)'), ticks: axisTicks(v, [-8, -6, -4, -2, 0, 2, 4], [-8, -4, 0, 4]) },
    { min: 0, max: 900, label: 'הכוח הנורמלי N (N)' },
  );
  drawAxes(ctx, plot, p);
  hline(ctx, plot, PERSON * G, withAlpha(p.ink3, 0.9));
  L('mg', plot.box.x + 18, plot.py(PERSON * G) - 10, p.ink3);
  drawCurve(ctx, plot, (a) => elevatorNormal(PERSON, a), { color: p.force, width: 2.4 });
  drawMarker(ctx, plot, s.a, q.N, p.force, { guides: true });
}

function drawHump(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: State, q: Solved, box: Box, L: LabelFn) {
  const W = v.w;
  const H = v.h;
  const leaves = q.Nhump <= 0;
  // the road: an arc of a vertical circle, its top at (topX, topY), its centre far below
  const topX = W * 0.17;
  const topY = H * 0.46;
  const Rpx = W * 0.42;
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(topX, topY + Rpx, Rpx, -Math.PI / 2 - 0.4, -Math.PI / 2 + 0.4);
  ctx.stroke();
  ctx.restore();
  // the radius toward the centre, dashed
  dashedLine(ctx, topX, topY + 6, topX, H * 0.94, withAlpha(p.ink3, 0.8));
  L('R', topX + 10, H * 0.8, p.ink3);
  // the car, lifted a little once it has left the road
  const cw = W * 0.1;
  const ch = H * 0.07;
  const lift = leaves ? 10 : 0;
  const carY = topY - ch - 5 - lift;
  fillRect(ctx, topX - cw / 2, carY, cw, ch, withAlpha(p.ink, 0.18));
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(topX - cw / 2, carY, cw, ch);
  ctx.restore();
  dot(ctx, topX - cw * 0.3, carY + ch + 2, p.ink, 4);
  dot(ctx, topX + cw * 0.3, carY + ch + 2, p.ink, 4);
  // its velocity, along the road (to the right), and its acceleration toward the centre
  const kV = (W * 0.12) / V_MAX;
  if (s.v > 0.2) {
    arrow(ctx, topX - cw / 2, carY - 14, topX - cw / 2 + s.v * kV, carY - 14, { color: p.velocity, width: 2.5, head: 9 });
    L('v', topX - cw / 2 + s.v * kV + 10, carY - 14, p.velocity);
  }
  const aDown = leaves ? G : (s.v * s.v) / HUMP_R;
  const kA = (H * 0.2) / G;
  if (aDown > 0.05) {
    arrow(ctx, topX + cw / 2 + 14, carY + ch / 2, topX + cw / 2 + 14, carY + ch / 2 + aDown * kA, { color: p.accel, width: 2.5, head: 9 });
    L('a', topX + cw / 2 + 26, carY + ch / 2 + aDown * kA * 0.6, p.accel);
  }

  // the car's free-body diagram: weight by the Earth, N by the road
  const fx = W * 0.4;
  const fy = H * 0.52;
  const kF = (H * 0.22) / (CAR * G);
  dot(ctx, fx, fy, p.ink);
  arrow(ctx, fx, fy, fx, fy + CAR * G * kF, { color: p.force, width: 3, head: 11 });
  L('mg', fx + 20, fy + CAR * G * kF * 0.7, p.force);
  if (q.Nhump > 0.005 * CAR * G) {
    arrow(ctx, fx, fy, fx, fy - q.Nhump * kF, { color: p.force, width: 3, head: 11 });
    L('N', fx + 16, fy - q.Nhump * kF * 0.7, p.force);
  } else L('N = 0', fx, fy - 20, p.force);

  // N against the speed, in kN; zero (the car leaves) above √(gR)
  const plot = makePlot(
    box,
    { min: 0, max: V_MAX, label: axisText(v, 'המהירות בפסגה v (m/s)', 'המהירות v (m/s)'), ticks: axisTicks(v, [0, 5, 10, 15, 20, 25], [0, 10, 20]) },
    { min: 0, max: 10, label: 'הכוח הנורמלי N (kN)' },
  );
  drawAxes(ctx, plot, p);
  hline(ctx, plot, (CAR * G) / 1000, withAlpha(p.ink3, 0.9));
  L('mg', plot.box.x + 18, plot.py((CAR * G) / 1000) - 10, p.ink3);
  const vt = humpTakeoffSpeed(HUMP_R);
  dashedLine(ctx, plot.px(vt), plot.box.y, plot.px(vt), plot.box.y + plot.box.h, withAlpha(p.ink3, 0.9));
  L('√(gR)', plot.px(vt), plot.box.y + 10, p.ink3);
  drawCurve(ctx, plot, (x) => Math.max(0, humpNormal(CAR, x, HUMP_R)) / 1000, { color: p.force, width: 2.4 });
  drawMarker(ctx, plot, s.v, Math.max(0, q.Nhump) / 1000, p.force, { guides: true });
}

function drawSlope(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: State, q: Solved, box: Box, L: LabelFn) {
  const W = v.w;
  const H = v.h;
  const th = (s.theta * Math.PI) / 180;
  const c = Math.cos(th);
  const sn = Math.sin(th);
  // the incline rises to the right from its foot
  const footX = W * 0.03;
  const baseY = H * 0.84;
  const len = W * 0.3;
  const topX = footX + len * c;
  const topY = baseY - len * sn;
  ctx.save();
  ctx.fillStyle = withAlpha(p.ink3, 0.12);
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(footX, baseY);
  ctx.lineTo(topX, topY);
  ctx.lineTo(topX, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  L(`θ = ${num(s.theta)}°`, footX + 46, baseY - 10, p.ink);
  // the block, halfway up; its outward normal on screen is (−sin θ, −cos θ)
  const d = len * 0.55;
  const sx = footX + d * c;
  const sy = baseY - d * sn;
  const bw = Math.max(W * 0.07, 36);
  const bh = bw * 0.7;
  const cx = sx - (bh / 2) * sn;
  const cy = sy - (bh / 2) * c;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-th);
  ctx.fillStyle = withAlpha(p.ink, 0.18);
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
  ctx.restore();
  L(`${SLOPE_M} kg`, cx, cy, p.ink);
  // the hand's horizontal push, toward the slope (to the right), ending at the block
  const kP = (W * 0.1) / PUSH_MAX;
  if (s.push > 0.5) {
    arrow(ctx, cx - bw * 0.6 - s.push * kP, cy, cx - bw * 0.6, cy, { color: p.force, width: 2.5, head: 9 });
    L('F', cx - bw * 0.6 - s.push * kP - 10, cy - 12, p.force);
  }

  // the block's free-body diagram: weight by the Earth, N by the incline, F by the hand
  const fx = isNarrow(W) ? W * 0.35 : W * 0.4; // on a phone, room for F before the graph
  const fy = H * 0.5;
  const kF = (H * 0.22) / (SLOPE_M * G);
  dot(ctx, fx, fy, p.ink);
  arrow(ctx, fx, fy, fx, fy + SLOPE_M * G * kF, { color: p.force, width: 3, head: 11 });
  L('mg', fx + 20, fy + SLOPE_M * G * kF * 0.7, p.force);
  arrow(ctx, fx, fy, fx - q.slope.N * kF * sn, fy - q.slope.N * kF * c, { color: p.force, width: 3, head: 11 });
  L('N', fx - q.slope.N * kF * sn - 12, fy - q.slope.N * kF * c - 6, p.force);
  if (s.push > 0.5) {
    arrow(ctx, fx, fy, fx + s.push * kF, fy, { color: p.force, width: 3, head: 11 });
    L('F', fx + s.push * kF + 10, fy - 10, p.force);
  }

  // N against the angle: with this push (solid) and without any push, mg cos θ (dashed)
  const plot = makePlot(
    box,
    { min: 0, max: THETA_MAX, label: axisText(v, 'זווית המדרון θ (°)', 'הזווית θ (°)'), ticks: axisTicks(v, [0, 15, 30, 45, 60], [0, 30, 60]) },
    { min: 0, max: 60, label: 'הכוח הנורמלי N (N)' },
  );
  drawAxes(ctx, plot, p);
  drawCurve(ctx, plot, (x) => SLOPE_M * G * Math.cos((x * Math.PI) / 180), { color: withAlpha(p.ink3, 0.9), width: 1.6, dash: [5, 4] });
  L('mg cosθ', plot.px(THETA_MAX) - 30, plot.py(SLOPE_M * G * 0.5) + 14, p.ink3);
  drawCurve(ctx, plot, (x) => inclinePush(SLOPE_M, x, s.push).N, { color: p.force, width: 2.4 });
  drawMarker(ctx, plot, s.theta, q.slope.N, p.force, { guides: true });
}

function drawSpring(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: State, q: Solved, box: Box, L: LabelFn) {
  const W = v.w;
  const H = v.h;
  const top = H * 0.08;
  ceiling(ctx, W * 0.04, W * 0.34, top, p);
  const cx = W * 0.18;
  const relaxed = H * 0.16; // relaxed length of one spring [px]
  const pxPerM = (H * 0.32) / 0.2;
  const ext = q.x * pxPerM;
  let bottom: number;
  let relaxedBottom: number;
  if (s.mode === 'one') {
    relaxedBottom = top + relaxed;
    bottom = relaxedBottom + ext;
    zigzag(ctx, cx, top, bottom, 9, 12, p.ink);
  } else if (s.mode === 'series') {
    // each spring carries the whole weight and stretches by mg/k: half the total each
    relaxedBottom = top + 2 * relaxed;
    const joint = top + relaxed + ext / 2;
    bottom = relaxedBottom + ext;
    zigzag(ctx, cx, top, joint, 9, 12, p.ink);
    dot(ctx, cx, joint, p.ink2, 3.5);
    zigzag(ctx, cx, joint, bottom, 9, 12, p.ink);
  } else {
    relaxedBottom = top + relaxed;
    bottom = relaxedBottom + ext;
    const d = W * 0.035;
    zigzag(ctx, cx - d, top, bottom, 9, 10, p.ink);
    zigzag(ctx, cx + d, top, bottom, 9, 10, p.ink);
    line(ctx, cx - d - 4, bottom, cx + d + 4, bottom, p.ink, 3);
  }
  // the relaxed end, and the extension
  dashedLine(ctx, cx - W * 0.09, relaxedBottom, cx + W * 0.09, relaxedBottom, p.ink3);
  const bx = cx + W * 0.1;
  line(ctx, bx, relaxedBottom, bx, bottom, p.ink2, 1.4);
  line(ctx, bx - 4, relaxedBottom, bx + 4, relaxedBottom, p.ink2, 1.4);
  line(ctx, bx - 4, bottom, bx + 4, bottom, p.ink2, 1.4);
  // the label beside the bracket, however short the extension
  L('Δx', bx + 18, (relaxedBottom + bottom) / 2, p.ink2);
  // the body
  const size = 20 + 22 * Math.cbrt(s.mass);
  fillRect(ctx, cx - size / 2, bottom, size, size, withAlpha(p.ink, 0.18));
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - size / 2, bottom, size, size);
  ctx.restore();
  L('m', cx, bottom + size / 2, p.ink);

  // the body's free-body diagram: weight by the Earth, the spring's pull
  const fx = W * 0.41;
  const fy = H * 0.52;
  // one scale, set by the slider's largest mass, and never shorter than an arrow that reads as one
  const kF = (H * 0.36) / (MASS_MAX * G);
  const F = s.mass * G;
  const len = Math.max(F * kF, 34);
  dot(ctx, fx, fy, p.ink);
  arrow(ctx, fx, fy, fx, fy + len, { color: p.force, width: 3, head: 11 });
  arrow(ctx, fx, fy, fx, fy - len, { color: p.force, width: 3, head: 11 });
  L('mg', fx + 22, fy + len - 8, p.force);
  L('kΔx', fx + 26, fy - len + 8, p.force);

  const plot = makePlot(box, { min: 0, max: 0.2, label: 'ההתארכות x (m)', ticks: axisTicks(v, undefined, [0, 0.1, 0.2]) }, { min: 0, max: 12, label: 'הכוח של הקפיץ (N)' });
  drawAxes(ctx, plot, p);
  for (const mode of ['one', 'series', 'parallel'] as SpringMode[]) {
    if (mode === s.mode) continue;
    drawCurve(ctx, plot, (x) => kOf(mode) * x, { color: withAlpha(p.force, 0.3), width: 1.4, dash: [5, 4] });
  }
  drawCurve(ctx, plot, (x) => q.k * x, { color: p.force, width: 2.4 });
  hline(ctx, plot, F, withAlpha(p.ink3, 0.9));
  L('mg', plot.box.x + plot.box.w - 16, plot.py(F) - 10, p.ink3);
  drawMarker(ctx, plot, q.x, F, p.force, { guides: true });
}

function drawAtwood(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: State, q: Solved, box: Box, L: LabelFn) {
  const W = v.w;
  const H = v.h;
  const cx = W * 0.25;
  const cy = H * 0.18;
  // the pulley and the blocks scale together, so the two blocks (hanging a diameter apart) never touch
  const r = Math.min(W * 0.085, H * 0.09);
  ceiling(ctx, cx - W * 0.08, cx + W * 0.08, H * 0.05, p);
  line(ctx, cx, H * 0.05, cx, cy, p.ink2, 2);
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  dot(ctx, cx, cy, p.ink2, 3);
  // the string over the top of the pulley
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
  const y1 = H * 0.36;
  const y2 = H * 0.44;
  const side = (m: number) => (2 * r - 10) * (0.62 + 0.38 * Math.cbrt(m / M2_MAX));
  // one force scale: the largest weight (m₂g at the slider's top) fits below its block
  const kF = (H * 0.3) / (M2_MAX * G);
  const kA = (H * 0.25) / G;
  const bodies: [number, number, number, string, number][] = [
    [cx - r, y1, M1, 'm₁', -q.at.a],
    [cx + r, y2, s.m2, 'm₂', q.at.a],
  ];
  for (const [x, y, m, name, down] of bodies) {
    const b = side(m);
    const out = x < cx ? -1 : 1; // the side away from the other block
    line(ctx, x, cy, x, y, p.ink, 1.6);
    fillRect(ctx, x - b / 2, y, b, b, withAlpha(p.ink, 0.18));
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - b / 2, y, b, b);
    ctx.restore();
    L(name, x, y + b / 2, p.ink);
    // forces on the body, each starting on it: T by the string (up, from where the string holds it, along the
    // string) and the weight by the Earth (down, from its bottom)
    arrow(ctx, x, y, x, y - q.at.T * kF, { color: p.force, width: 2.6, head: 10 });
    arrow(ctx, x, y + b, x, y + b + m * G * kF, { color: p.force, width: 2.6, head: 10 });
    L('T', x + out * 12, y - q.at.T * kF * 0.55, p.force);
    L(name === 'm₁' ? 'm₁g' : 'm₂g', x + out * 20, y + b + m * G * kF * 0.6, p.force);
    // its acceleration, beside it on the outer side
    if (Math.abs(down) > 0.01) {
      const axx = x + out * (b / 2 + 10);
      const ay = y + b / 2;
      arrow(ctx, axx, ay, axx, ay + down * kA, { color: p.accel, width: 2.4, head: 9 });
      L('a', axx + out * 10, ay + down * kA * 0.55, p.accel);
    }
  }

  const plot = makePlot(box, { min: 0, max: 1, label: axisText(v, 'המקום לאורך החוט, מ-m₁ אל m₂', 'לאורך החוט'), ticks: [0, 0.5, 1], format: (x) => (x === 0 ? 'm₁' : x === 1 ? 'm₂' : 'גלגלת') }, { min: 0, max: 64, label: 'המתיחות T (N)' });
  drawAxes(ctx, plot, p);
  ctx.save();
  ctx.fillStyle = withAlpha(p.ink3, 0.12);
  ctx.fillRect(plot.px(0.4), plot.box.y, plot.px(0.6) - plot.px(0.4), plot.box.h);
  ctx.restore();
  hline(ctx, plot, M1 * G, withAlpha(p.ink3, 0.9));
  hline(ctx, plot, s.m2 * G, withAlpha(p.ink3, 0.9));
  // each weight's label on the side of its line away from the other line (T lies between them)
  if (Math.abs(s.m2 - M1) < 1e-9) L('m₁g = m₂g', plot.box.x + 36, plot.py(M1 * G) - 11, p.ink3);
  else {
    const m2above = s.m2 > M1;
    L('m₁g', plot.box.x + 22, plot.py(M1 * G) + (m2above ? 11 : -11), p.ink3);
    L('m₂g', plot.box.x + 22, plot.py(s.m2 * G) + (m2above ? -11 : 11), p.ink3);
  }
  drawCurve(ctx, plot, () => q.at.T, { color: p.force, width: 2.6 });
  L('T', plot.box.x + plot.box.w - 12, plot.py(q.at.T) - 11, p.force);
}

function drawHanging(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: State, q: Solved, box: Box, L: LabelFn) {
  const W = v.w;
  const H = v.h;
  const top = H * 0.08;
  const cx = W * 0.16;
  const len = H * 0.66;
  ceiling(ctx, W * 0.06, W * 0.26, top, p);
  const cutY = top + s.cut * len;
  // the rope: above the cut in ink, below it (the body we look at) in the accent colour
  line(ctx, cx, top, cx, cutY, p.ink2, 4);
  line(ctx, cx, cutY, cx, top + len, p.accent, 5);
  let bottom = top + len;
  if (s.load > 0) {
    const b = 16 + 18 * Math.cbrt(s.load);
    fillRect(ctx, cx - b / 2, bottom, b, b, withAlpha(p.accent, 0.35));
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - b / 2, bottom, b, b);
    ctx.restore();
    L('M', cx, bottom + b / 2, p.ink);
    bottom += b;
  }
  // the cut
  line(ctx, cx - 16, cutY, cx + 16, cutY, p.ink, 2);
  L('y', cx - 26, cutY, p.ink2);
  if (Math.abs(s.lift) > 0.05) {
    const kA = (H * 0.12) / 3;
    arrow(ctx, cx + W * 0.07, H * 0.45, cx + W * 0.07, H * 0.45 - s.lift * kA, { color: p.accel, width: 2.6, head: 10 });
    L('a', cx + W * 0.07 + 12, H * 0.45 - s.lift * kA * 0.6, p.accel);
  }
  // the free-body diagram of everything below the cut: T by the rope above, its weight by the Earth
  const fx = W * 0.39;
  const fy = H * 0.5;
  const kF = (H * 0.32) / 26;
  const below = s.load + (ROPE_M * (ROPE_L - q.y)) / ROPE_L;
  dot(ctx, fx, fy, p.accent);
  if (q.Thang > 0.05) {
    arrow(ctx, fx, fy, fx, fy - q.Thang * kF, { color: p.force, width: 3, head: 11 });
    L('T', fx + 14, fy - q.Thang * kF * 0.6, p.force);
  }
  if (below * G > 0.05) {
    arrow(ctx, fx, fy, fx, fy + below * G * kF, { color: p.force, width: 3, head: 11 });
    L("m'g", fx + 22, fy + below * G * kF * 0.6, p.force);
  } else L('T = 0', fx + 20, fy - 16, p.force);

  const tMax = 26;
  const plot = makePlot(box, { min: 0, max: ROPE_L, label: axisText(v, 'העומק y מתחת לתקרה (m)', 'העומק y (m)'), ticks: axisTicks(v, undefined, [0, 1, 2]) }, { min: 0, max: tMax, label: 'המתיחות T (N)' });
  drawAxes(ctx, plot, p);
  drawCurve(ctx, plot, (y) => hangingTensionAtDepth(q.hang, y), { color: p.force, width: 2.4 });
  drawMarker(ctx, plot, q.y, q.Thang, p.force, { guides: true });
}

function drawPulled(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: State, q: Solved, box: Box, L: LabelFn) {
  const W = v.w;
  const H = v.h;
  const floor = H * 0.56;
  line(ctx, W * 0.02, floor, W * 0.46, floor, p.ink2, 2);
  const bw = W * 0.08;
  const bh = H * 0.14;
  const bx = W * 0.03;
  const ropeY = floor - bh * 0.45;
  const r0 = bx + bw;
  const r1 = W * 0.36;
  const cutX = r0 + s.cut * (r1 - r0);
  // the block and the rope behind the cut (the body we look at) in the accent colour
  fillRect(ctx, bx, floor - bh, bw, bh, withAlpha(p.accent, 0.35));
  ctx.save();
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, floor - bh, bw, bh);
  ctx.restore();
  L('M', bx + bw / 2, floor - bh / 2, p.ink);
  if (s.ropeMass > 0) {
    line(ctx, r0, ropeY, cutX, ropeY, p.accent, 2 + 3 * Math.sqrt(s.ropeMass));
    line(ctx, cutX, ropeY, r1, ropeY, p.ink2, 2 + 3 * Math.sqrt(s.ropeMass));
  } else {
    line(ctx, r0, ropeY, cutX, ropeY, p.accent, 1.4);
    line(ctx, cutX, ropeY, r1, ropeY, p.ink2, 1.4);
  }
  line(ctx, cutX, ropeY - 14, cutX, ropeY + 14, p.ink, 2);
  L('s', cutX, ropeY + 24, p.ink2);
  // the pull at the front end
  const kF = (W * 0.1) / PULL_F;
  arrow(ctx, r1, ropeY, r1 + PULL_F * kF, ropeY, { color: p.force, width: 3, head: 11 });
  L('F', r1 + PULL_F * kF * 0.5, ropeY - 14, p.force);
  // acceleration of everything
  const kA = (W * 0.07) / 6;
  arrow(ctx, bx + 4, floor - bh - 18, bx + 4 + q.pull.aEff * kA, floor - bh - 18, { color: p.accel, width: 2.6, head: 10 });
  L('a', bx + 4 + q.pull.aEff * kA + 12, floor - bh - 18, p.accel);
  // the free-body diagram of the part behind the cut (horizontal forces): T by the rope ahead
  const fx = W * 0.12;
  const fy = H * 0.8;
  dot(ctx, fx, fy, p.accent);
  arrow(ctx, fx, fy, fx + q.Tpull * kF, fy, { color: p.force, width: 3, head: 11 });
  L('T', fx + q.Tpull * kF * 0.5, fy - 14, p.force);

  const plot = makePlot(box, { min: 0, max: PULL_L, label: axisText(v, 'המרחק s מהגוש (m)', 'המרחק s (m)'), ticks: axisTicks(v, undefined, [0, 1, 2, 3]) }, { min: 0, max: 14, label: 'המתיחות T (N)' });
  drawAxes(ctx, plot, p);
  hline(ctx, plot, PULL_F, withAlpha(p.ink3, 0.9));
  L('F', plot.box.x + 14, plot.py(PULL_F) - 10, p.ink3);
  drawCurve(ctx, plot, (x) => ropeTension(q.pull, x), { color: p.force, width: 2.4 });
  drawMarker(ctx, plot, q.sp, q.Tpull, p.force, { guides: true });
}

/* -------------------------------------------------------------------------------------- ink helpers */

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function dashedLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.save();
  ctx.setLineDash([4, 4]);
  line(ctx, x1, y1, x2, y2, color, 1.2);
  ctx.restore();
}

function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, r = 5) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A ceiling: a line with short hatches above it. */
function ceiling(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, p: Palette) {
  line(ctx, x1, y, x2, y, p.ink2, 2);
  for (let x = x1 + 4; x < x2; x += 9) line(ctx, x, y, x + 6, y - 6, p.ink3, 1);
}

/** A coil spring from (x, y1) down to (x, y2): straight leads and n zigzags of half-width w. */
function zigzag(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number, n: number, w: number, color: string) {
  const lead = Math.min(8, (y2 - y1) * 0.1);
  const a = y1 + lead;
  const b = y2 - lead;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, a);
  for (let i = 0; i < 2 * n; i++) ctx.lineTo(x + (i % 2 ? -w : w), a + ((i + 0.5) * (b - a)) / (2 * n));
  ctx.lineTo(x, b);
  ctx.lineTo(x, y2);
  ctx.stroke();
  ctx.restore();
}

/** A dashed horizontal guide across a plot at the value y. */
function hline(ctx: CanvasRenderingContext2D, plot: Plot, y: number, color: string) {
  const sy = plot.py(y);
  if (sy < plot.box.y || sy > plot.box.y + plot.box.h) return;
  dashedLine(ctx, plot.box.x, sy, plot.box.x + plot.box.w, sy, color);
}

/**
 * A canvas label with a paper-coloured halo, so it stays readable over grid lines and arrows. It is kept
 * inside the stage and out of the top-right corner, where the reset and fullscreen buttons sit.
 */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, p: Palette, v: View) {
  ctx.save();
  ctx.font = `600 13px ${p.fontUi}`;
  ctx.direction = /[֐-׿]/.test(text) ? 'rtl' : 'ltr';
  const half = ctx.measureText(text).width / 2;
  const pad = 4;
  let cx = Math.min(Math.max(x, half + pad), v.w - half - pad);
  let cy = Math.min(Math.max(y, 9 + pad), v.h - 9 - pad);
  if (cx + half > v.w - BUTTONS_W && cy < BUTTONS_H + 9) {
    if (y < BUTTONS_H / 2 + 9) cy = BUTTONS_H + 9;
    else cx = v.w - BUTTONS_W - half - pad;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = p.paper;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
  ctx.restore();
}
