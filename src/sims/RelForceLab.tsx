/**
 * RelForceLab: a proton under a constant force from rest, by the relativistic second law F = dp/dt (lesson 10.5).
 *
 * Three panels on one canvas, all against the time t in S (0 to 15 μs):
 *   top left     p/(mc) = Ft/(mc): the momentum grows linearly, exactly as in Newton's mechanics;
 *   bottom left  v/c: the relativistic speed c·u/√(1 + u²) (u = Ft/(mc)) creeps up to c and never reaches it; the
 *                dashed line is Newton's v = Ft/m, which crosses c at t = mc/F;
 *   right        the Minkowski diagram (x, ct) in km, one scale for both axes: the worldline is the hyperbola
 *                (x + mc²/F)² − (ct)² = (mc²/F)², between two light lines: above the flash from the origin x = ct
 *                (dashed; the proton falls behind it, the gap growing towards mc²/F) and below the flash sent at t = 0
 *                from x = −mc²/F, x = ct − mc²/F (thin, dotted; the asymptote, which closes in on the proton from
 *                behind and never reaches it); Newton's parabola x = ½(F/m)t² (grey, dashed) crosses x = ct at
 *                t = 2mc/F, leaving the light cone of the start.
 * The readout gives t and u, p, v (and Newton's v), x (and Newton's x), the work W = F·x, the energy gained
 * (γ − 1)mc², and ½mv² with the true speed, which falls short. A toggle adds the acceleration the same force would
 * give along the velocity, F/(γ³m), and across it, F/(γm).
 *
 * Model: src/physics/hyperbolic.ts (MODEL SPECIFICATION there), constants from src/physics/constants.ts.
 * Physics space: LTR; colours: momentum --momentum, velocity --velocity, worldline ink, light lines --accent,
 * Newton's predictions --ink-3 dashed.
 *
 * Props: id (required), F (in units of 10⁻¹³ N, 0.4…3.2, default 1.6), t (μs, default 0), newton (default true),
 * perp (default false), tasks. Step `set` keys: F, t, playing, newton, perp.
 *
 * Tasks are judged only on states the learner produced (the time slider, the arrow keys, play, the F slider,
 * the toggles), never on a state a text step produced:
 *   newton-c   bring t to where Newton's speed reaches c, Ft/(mc) = 1 (±0.03): the true speed is c/√2
 *   near-c     reach v ≥ 0.95c, and compare W, (γ − 1)mc² and ½mv²
 *   inertia    with the along/across comparison on, reach v ≥ 0.8c (γ³ = 4.63 against γ = 1.67)
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { C_LIGHT, E_CHARGE, M_PROTON } from '~/physics/constants';
import {
  hyperbolicLength,
  hyperbolicMotion,
  newtonPosition,
  newtonSpeed,
  newtonTimeToC,
  reducedTime,
} from '~/physics/hyperbolic';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { withAlpha } from './core/ink';
import { drawAxes, drawCurve, drawMarker, makePlot, type Plot } from './core/plot';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/** The body: a proton [kg]. */
const M = M_PROTON;
/** The force unit of the slider [N]. */
const F_UNIT = 1e-13;
const F_MIN = 0.4;
const F_MAX = 3.2;
const F_STEP = 0.4;
/** The time window [μs]. */
const T_MAX = 15;
/** One run lasts about this many seconds of wall time. */
const RUN_SECONDS = 7;
const MEV = 1e6 * E_CHARGE;
/** The Minkowski diagram shows x and ct from 0 to this many km. */
const D_MAX = 4.6;

const TASK_LABEL: Record<string, string> = {
  'newton-c': 'הביאו את הזמן לרגע שבו המהירות של ניוטון מגיעה ל-c. מה המהירות האמיתית ברגע הזה?',
  'near-c': 'הגיעו למהירות של 0.95c לפחות (בזמן או בכוח). השוו את העבודה, את האנרגיה שנוספה ואת ½mv².',
  inertia: 'הפעילו את ההשוואה בין כוח לאורך המהירות לכוח ניצב לה, והגיעו ל-0.8c לפחות. איזו תאוצה קטנה יותר?',
};

export interface RelForceLabProps {
  id: string;
  F?: number;
  t?: number;
  newton?: boolean;
  perp?: boolean;
  tasks?: string[];
}

interface State {
  /** force in units of 10⁻¹³ N */
  F: number;
  /** time in μs */
  t: number;
  playing: boolean;
  newton: boolean;
  perp: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const roundF = (F: number) => clamp(Math.round(F / F_STEP) * F_STEP, F_MIN, F_MAX);
/** 3 significant figures with a true minus sign. */
const num = (x: number, sig = 3) => sci(x, sig).replace('-', '−');
const fixed = (x: number, d: number) => x.toFixed(d).replace('-', '−');

function initial(p: RelForceLabProps): State {
  return {
    F: roundF(p.F ?? 1.6),
    t: clamp(p.t ?? 0, 0, T_MAX),
    playing: false,
    newton: p.newton ?? true,
    perp: p.perp ?? false,
  };
}

/** Everything the readout, the drawing and the tasks need, at time t [μs] under F [10⁻¹³ N]. */
function analyse(F: number, t: number) {
  const f = F * F_UNIT;
  const ts = t * 1e-6;
  const s = hyperbolicMotion(f, M, ts);
  const u = reducedTime(f, M, ts);
  const b = s.v / C_LIGHT;
  return {
    u,
    b,
    gamma: s.gamma,
    p: s.p,
    x: s.x,
    bN: newtonSpeed(f, M, ts) / C_LIGHT,
    xN: newtonPosition(f, M, ts),
    W: (f * s.x) / MEV,
    dE: s.K / MEV,
    halfMv2: (0.5 * M * s.v * s.v) / MEV,
    aPar: 1 / s.gamma ** 3,
    aPerp: 1 / s.gamma,
    /** Newton's time to c [μs] and the hyperbola's length mc²/F [km] */
    T: newtonTimeToC(f, M) * 1e6,
    L: hyperbolicLength(f, M) / 1e3,
  };
}

export default function RelForceLab(props: RelForceLabProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  /** the learner has acted on the figure since the last step */
  const learner = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev, playing: false };
          if (typeof step.F === 'number') next.F = roundF(step.F);
          if (typeof step.t === 'number') next.t = clamp(step.t, 0, T_MAX);
          if (typeof step.playing === 'boolean') next.playing = step.playing;
          if (typeof step.newton === 'boolean') next.newton = step.newton;
          if (typeof step.perp === 'boolean') next.perp = step.perp;
          stepState.current = next;
          learner.current = false;
          return next;
        });
      }),
    [props.id],
  );

  // playback: a run from 0 to 15 μs lasts about RUN_SECONDS and stops at the end; still mode freezes it
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (motionAllowed() && !document.hidden) {
        setS((prev) => {
          const t = prev.t + (dt * T_MAX) / RUN_SECONDS;
          return t >= T_MAX ? { ...prev, t: T_MAX, playing: false } : { ...prev, t };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  const k = useMemo(() => analyse(s.F, s.t), [s.F, s.t]);

  // tasks: judged on the figure's own state, never on a state a text step produced
  useEffect(() => {
    if (s === stepState.current || !learner.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (has('newton-c') && Math.abs(k.u - 1) <= 0.03) done('newton-c');
    if (has('near-c') && k.b >= 0.95) done('near-c');
    if (has('inertia') && s.perp && k.b >= 0.8) done('inertia');
  }, [s, k, props.id, props.tasks]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s)), 700);
    return () => clearTimeout(h);
  }, [s.F, s.perp, Math.round(s.t * 2)]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  const act = (patch: Partial<State>) => {
    learner.current = true;
    setS((prev) => ({ ...prev, ...patch }));
  };
  const setTime = (t: number) => act({ t: clamp(t, 0, T_MAX), playing: false });
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setTime(s.t + 0.25);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setTime(s.t - 0.25);
    else return;
    e.preventDefault();
  };
  const reset = () => {
    stepState.current = null;
    learner.current = false;
    setS(initial(props));
    setLive('האיור חזר למצב ההתחלה.');
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: פרוטון שמתחיל ממנוחה ונע תחת כוח קבוע. משמאל למעלה התנע, משמאל למטה המהירות, ומימין קו העולם בדיאגרמת מינקובסקי. ${describe(s)} השתמשו בפס הזמן או בחצים במקלדת.`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      readout={
        <>
          <span data-readout="t">
            הזמן: <b class="q" dir="ltr">t = {fixed(s.t, 2)} μs, Ft/(mc) = {fixed(k.u, 2)}</b>
          </span>
          <span data-readout="p">
            התנע, <bdi>p = Ft</bdi>: <b class="q" dir="ltr">p = {num(k.p)} kg·m/s</b>
          </span>
          <span data-readout="v">
            המהירות: <b class="q" dir="ltr">v = {fixed(k.b, 3)}c</b>
          </span>
          {s.newton && (
            <span data-readout="v-newton">
              לפי ניוטון: <b class="q" dir="ltr">v = Ft/m = {fixed(k.bN, 2)}c</b>
            </span>
          )}
          <span data-readout="x">
            המקום: <b class="q" dir="ltr">x = {num(k.x)} m</b>
            {s.newton && (
              <>
                {' '}
                (לפי ניוטון <bdi class="q">{num(k.xN)} m</bdi>)
              </>
            )}
          </span>
          <span data-readout="work">
            העבודה של הכוח: <b class="q" dir="ltr">W = F·x = {num(k.W)} MeV</b>
          </span>
          <span data-readout="energy">
            האנרגיה שנוספה: <b class="q" dir="ltr">(γ − 1)mc² = {num(k.dE)} MeV</b>
          </span>
          <span data-readout="half-mv2">
            עם המהירות האמיתית: <b class="q" dir="ltr">½mv² = {num(k.halfMv2)} MeV</b>
          </span>
          {s.perp && (
            <>
              <span data-readout="a-par">
                כוח לאורך המהירות: <b class="q" dir="ltr">a = F/(γ³m) = {num(k.aPar)}·F/m</b>
              </span>
              <span data-readout="a-perp">
                כוח ניצב למהירות: <b class="q" dir="ltr">a = F/(γm) = {num(k.aPerp)}·F/m</b>
              </span>
            </>
          )}
        </>
      }
      controls={
        <>
          <Slider label="הזמן" min={0} max={T_MAX} step={0.05} value={s.t} format={(v) => `${fixed(v, 2)} μs`} onChange={setTime} />
          <Slider
            label="הכוח"
            min={F_MIN}
            max={F_MAX}
            step={F_STEP}
            value={s.F}
            format={(v) => `${fixed(v, 1)}·10⁻¹³ N`}
            onChange={(v) => act({ F: roundF(v) })}
          />
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle
              label={s.playing ? 'עצירה' : 'הפעלה'}
              on={s.playing}
              onChange={(on) => act({ playing: on, t: on && s.t >= T_MAX ? 0 : s.t })}
            />
            <Toggle label="התחזית של ניוטון" on={s.newton} swatch="var(--ink-3)" onChange={(on) => act({ newton: on })} />
            <Toggle label="לאורך המהירות או ניצב לה" on={s.perp} onChange={(on) => act({ perp: on })} />
          </div>
          <p class="hint">
            פרוטון מתחיל ממנוחה ב-<bdi class="q">x = 0</bdi>, וכוח קבוע פועל עליו לאורך <bdi class="q">+x</bdi>. הקווים
            המקווקווים האפורים הם התחזית של ניוטון.
          </p>
        </>
      }
    />
  );
}

function describe(s: State): string {
  const k = analyse(s.F, s.t);
  return `הכוח ${fixed(s.F, 1)} כפול עשר בחזקת מינוס 13 ניוטון. ברגע t = ${fixed(s.t, 2)} מיקרו-שניות התנע חלקי mc הוא ${fixed(k.u, 2)}, המהירות ${fixed(k.b, 3)} מהירות האור, ולפי ניוטון ${fixed(k.bN, 2)}. הפרוטון עבר ${num(k.x)} מטר, והאנרגיה שלו גדלה ב-${num(k.dE)} מגה-אלקטרון-וולט, בדיוק העבודה של הכוח.`;
}

/* ---------------------------------------------------------------- drawing */

/** Stage width / height. */
const ASPECT = 1.3;
/** The top of the stage left free for the reset and fullscreen buttons. */
const BUTTONS_BOTTOM = 46;

function title(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left', dir: CanvasDirection = 'ltr') {
  ctx.save();
  ctx.font = `600 12px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.direction = dir;
  ctx.textAlign = align;
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, x, y);
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

function hLine(ctx: CanvasRenderingContext2D, plot: Plot, y: number, color: string, dash: number[]) {
  const sy = plot.py(y);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(plot.box.x, sy);
  ctx.lineTo(plot.box.x + plot.box.w, sy);
  ctx.stroke();
  ctx.restore();
}

/** A parametric curve (x(t), y(t)) for t in [a, b], clipped to the plot box. */
function drawParam(ctx: CanvasRenderingContext2D, plot: Plot, fx: (t: number) => number, fy: (t: number) => number, a: number, b: number, color: string, width: number, dash: number[] = []) {
  if (b <= a) return;
  const { box } = plot;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y - 1, box.w + 1, box.h + 1);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  const n = 200;
  for (let i = 0; i <= n; i++) {
    const t = a + ((b - a) * i) / n;
    const sx = plot.px(fx(t));
    const sy = plot.py(fy(t));
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.restore();
}

const tickFmt = (v: number) => sci(v, 2).replace('-', '−');
const noTick = () => '';

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State) {
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, view.w, view.h);
  const k = analyse(s.F, s.t);
  const f = s.F * F_UNIT;
  const at = (t: number) => analyse(s.F, t);

  // the left column: two graphs against t; the right: the Minkowski diagram, square
  const L = 40;
  const gapCol = view.w < 480 ? 34 : 46;
  const bottom = 30;
  const top = BUTTONS_BOTTOM;
  const side = Math.min(view.h - top - bottom, view.w * 0.42);
  const dx = view.w - 12 - side;
  const leftW = dx - gapCol - L;
  const gap = 22;
  const h = (view.h - top - bottom - gap) / 2;

  // p/(mc) against t: a straight line
  const uMax = reducedTime(f, M, T_MAX * 1e-6);
  const uTop = Math.max(1, Math.ceil(uMax));
  const pp = makePlot(
    { x: L, y: top, w: leftW, h },
    { min: 0, max: T_MAX, ticks: [0, 5, 10, 15], format: noTick },
    { min: 0, max: uTop, ticks: uTop <= 5 ? Array.from({ length: uTop + 1 }, (_, i) => i) : [0, Math.round(uTop / 2), uTop], format: tickFmt },
  );
  drawAxes(ctx, pp, p);
  drawCurve(ctx, pp, (t) => at(t).u, { color: withAlpha(p.momentum, 0.3), width: 1.6 });
  drawCurve(ctx, { ...pp, x: { ...pp.x, max: Math.max(s.t, 1e-9) } }, (t) => at(t).u, { color: p.momentum, width: 2.6 });
  nowLine(ctx, pp, p, s.t);
  drawMarker(ctx, pp, s.t, k.u, p.momentum, { radius: 4.5 });
  title(ctx, p, 'p/(mc)', L, pp.box.y - 3, p.momentum);

  // v/c against t, with c and Newton's line
  const pv = makePlot(
    { x: L, y: top + h + gap, w: leftW, h },
    { min: 0, max: T_MAX, ticks: [0, 5, 10, 15], format: tickFmt },
    { min: 0, max: 1.6, ticks: [0, 0.5, 1, 1.5], format: tickFmt },
  );
  drawAxes(ctx, pv, p);
  hLine(ctx, pv, 1, withAlpha(p.accent, 0.9), [6, 4]);
  title(ctx, p, 'c', pv.box.x + pv.box.w - 2, pv.py(1) - 2, p.accent, 'right');
  if (s.newton) {
    drawCurve(ctx, pv, (t) => at(t).bN, { color: p.ink3, width: 1.6, dash: [5, 5] });
    // where Newton's line reaches c: t = mc/F
    if (k.T <= T_MAX) drawMarker(ctx, pv, k.T, 1, p.ink3, { radius: 3.5 });
  }
  drawCurve(ctx, pv, (t) => at(t).b, { color: withAlpha(p.velocity, 0.3), width: 1.6 });
  drawCurve(ctx, { ...pv, x: { ...pv.x, max: Math.max(s.t, 1e-9) } }, (t) => at(t).b, { color: p.velocity, width: 2.6 });
  nowLine(ctx, pv, p, s.t);
  drawMarker(ctx, pv, s.t, k.b, p.velocity, { radius: 4.5 });
  title(ctx, p, 'v/c', L, pv.box.y - 3, p.velocity);
  title(ctx, p, 't (μs)', L + leftW, view.h - 2, p.ink2, 'right');

  // the Minkowski diagram: x and ct in km, one scale
  const pd = makePlot(
    { x: dx, y: top, w: side, h: side },
    { min: 0, max: D_MAX, ticks: [0, 1, 2, 3, 4], format: tickFmt },
    { min: 0, max: D_MAX, ticks: [0, 1, 2, 3, 4], format: tickFmt },
  );
  drawAxes(ctx, pd, p);
  const cKm = (C_LIGHT * 1e-6) / 1e3; // km per μs
  // the light line from the start, and the asymptote x = ct − mc²/F
  drawParam(ctx, pd, (d) => d, (d) => d, 0, D_MAX, p.accent, 1.5, [6, 5]);
  if (k.L < D_MAX) drawParam(ctx, pd, (d) => d - k.L, (d) => d, k.L, D_MAX, withAlpha(p.accent, 0.55), 1.1, [2, 4]);
  if (s.newton) drawParam(ctx, pd, (t) => at(t).xN / 1e3, (t) => cKm * t, 0, T_MAX, p.ink3, 1.6, [5, 5]);
  drawParam(ctx, pd, (t) => at(t).x / 1e3, (t) => cKm * t, 0, T_MAX, withAlpha(p.ink, 0.3), 1.6);
  drawParam(ctx, pd, (t) => at(t).x / 1e3, (t) => cKm * t, 0, Math.max(s.t, 1e-9), p.ink, 2.6);
  drawMarker(ctx, pd, k.x / 1e3, cKm * s.t, p.ink, { radius: 4.5 });
  title(ctx, p, 'ct (km)', dx, pd.box.y - 3, p.ink);
  title(ctx, p, 'x (km)', dx + side, pd.box.y + side + 28, p.ink2, 'right');
}
