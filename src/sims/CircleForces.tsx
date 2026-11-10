/**
 * CircleForces: the real forces on one body moving on a circle, and their sum (lesson 2.6). The net force is
 * drawn as the vector sum of the real forces, emphasised; its radial component IS the centripetal force, so
 * no "centripetal force" arrow is ever drawn beside the real ones, and there is no centrifugal force (the
 * ground is an inertial frame; rotating frames are chapter 7).
 *
 * Model: src/physics/circulardynamics.ts (MODEL SPECIFICATION there); a = v²/R from curvilinear.ts.
 * Physics space, LTR, y up. Each preset is a diagram, not a map: the forces are drawn to a stated scale in
 * units of the weight mg (printed under the figure), every force from the body's centre (a point body). The
 * mg arrow is at least MG_PX long on screen (forceScale), so the diagram stays readable on a phone. Forces
 * that point the same way are drawn a few px apart, still on the body; a net force that parallels a force
 * is drawn beside the body, tied to it (drawForces).
 * Colours: forces --force (the net force thicker, on a paper halo), velocity --velocity, the circle --ink-2,
 * light-like accents --accent. Motion (the vertical circle's play) checks motionAllowed().
 *
 * Presets:
 *   banked    cross-section of a curve of radius 80 m banked at θ (centre of the curve to the left): weight,
 *             normal force, the static friction the car needs (up or down the slope) and the net force,
 *             horizontal toward the centre, m v²/R. Sliders: v (0–35 m/s), θ (0–40°), μs (0–1). When the
 *             friction needed exceeds μs N it is drawn dashed and the car slides. θ = 0 is a flat curve.
 *   conical   a bob on a 1.0 m string turning at ω (0–6.5 rad/s), drawn at the instant it is in the plane of
 *             the page (its velocity ⊗ into the page): weight, tension, and the horizontal net force
 *             toward the axis. Below ω = √(g/L) = 3.13 rad/s it hangs straight down.
 *   vertical  a ball on a string or a light rod of length 1.0 m in a vertical circle; slider v_b, the speed at
 *             the lowest point (0–7.5 m/s), and the angle φ from the lowest point. Weight, the string or rod
 *             force (a rod may push), the net force and, on demand, its radial and tangential components
 *             (the radial one is m v²/R). An inset plots T/mg (or F/mg) against φ. A string that would have
 *             to push goes slack: the ball can't be on the circle there; at the slack angle the figure draws
 *             its free flight (a projectile, curvilinear.ts) until the string is taut again. Play integrates
 *             the tangential second law (circleStep) and follows the free flight, then stops.
 *
 * Props (Astro wrapper: <Spread figure={CircleForces} figureProps={{ preset: 'banked', tasks: [...] }}>)
 *   id (required), preset, v, theta (deg), mu, omega, vb, support ('string' | 'rod'), phi (deg), showSum,
 *   showSplit, showV, tasks.
 * Step `set` keys: the same, plus playing.
 *
 * Tasks, ticked only by the learner's own actions (a step's `set` clears what counts as "own"):
 *   design-speed    banked: the learner sets v or θ so that the friction needed is under 2% of mg (v > 1 m/s)
 *   friction-up     banked: the learner finds a speed below the design speed at which the car holds and the
 *                   friction points up the slope (f < −0.05 mg, |f| ≤ μs N, v > 1 m/s)
 *   tension-double  conical: the learner sets ω so that the tension is twice the weight (within 0.03 mg)
 *   top-min         vertical, string: the learner sets v_b so that the tension at the top is within 0.05 mg
 *                   of zero (v_b ≈ √(5gR) = 7.00 m/s)
 *   rod-push        vertical, rod: the learner brings the ball to a point of the circle where the rod pushes
 *                   (F < −0.05 mg)
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { G } from '~/physics/constants';
import {
  bankedDesignSpeed,
  bankedForces,
  bankedSpeedRange,
  circleStep,
  conicalAngle,
  retautTime,
  slackAngle,
  stopAngle,
  supportForce,
  verticalPosition,
  verticalSpeed2,
  verticalVelocity,
  type Support,
} from '~/physics/circulardynamics';
import { type Vec2 } from '~/physics/vec';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 12;
const WORLD_H = 8;
const MINUS = '−';
/** shortest force arrow drawn on screen [px], so its head clears the body (radius 8-9 px); the readouts give the true values */
const MIN_ARROW = 18;

export type CirclePreset = 'banked' | 'conical' | 'vertical';
const PRESETS: CirclePreset[] = ['banked', 'conical', 'vertical'];
const PRESET_NAME: Record<CirclePreset, string> = {
  banked: 'כביש משופע',
  conical: 'מטוטלת קונית',
  vertical: 'מעגל אנכי',
};

/** the physical sizes behind each preset */
const BANK_R = 80;
const CONE_L = 1;
const LOOP_R = 1;
/** drawing units per mg, per preset, at the least */
const FORCE_SCALE: Record<CirclePreset, number> = { banked: 2.2, conical: 1.0, vertical: 0.5 };
/** the weight's arrow is at least this long on screen [px] where it fits */
const MG_PX = 28;
/** room [px] kept between the vertical circle's longest arrows and the canvas edge */
const EDGE = 8;
/** drawing units per m/s (vertical circle) */
const V_SCALE = 0.35;
/** the reset and fullscreen buttons cover the top-right corner of the stage down to this height [CSS px] */
const BUTTONS_H = 48;

/* geometry of the drawings (diagram units) */
const BANK_P0: Vec2 = [1.4, -0.7];
const BANK_AXIS_X = -5.5;
const CONE_PIVOT: Vec2 = [-1.2, 3.3];
const CONE_LEN = 4;
const LOOP_X = -2.9;
const LOOP_RD = 2.6;
const PLOT = { x0: 1.1, x1: 5.6, y0: -3.2, y1: 3.2, fMin: -5, fMax: 8 };

/**
 * Drawing units per mg: mg is at least MG_PX on screen. On the vertical circle the scale is the same all
 * round for one v_b (so arrows at different φ compare), and as large as lets the lowest point fit: there mg
 * points down and the pull (v_b²/gR + 1) mg up, on one line.
 */
function forceScale(view: View, preset: CirclePreset, vb = 0): number {
  if (preset !== 'vertical') return Math.max(FORCE_SCALE[preset], MG_PX / view.ppm);
  const fit = (view.h - 2 * EDGE) / (2 + (vb * vb) / (G * LOOP_R));
  return Math.min(MG_PX, fit) / view.ppm;
}

const TASK_LABEL: Record<string, string> = {
  'design-speed': 'מצאו מהירות שבה המכונית לא צריכה שום חיכוך.',
  'friction-up': 'מצאו מהירות, איטית ממהירות התכנון, שבה המכונית לא מחליקה. לאן פונה החיכוך?',
  'tension-double': 'קבעו את ω כך שהמתיחות תהיה פי 2 מהמשקל. מה הזווית?',
  'top-min': 'עם חוט: מצאו את המהירות הנמוכה ביותר בתחתית שבה החוט עוד מתוח בנקודה העליונה.',
  'rod-push': 'עם מוט: מצאו נקודה במעגל שבה המוט דוחף את הכדור במקום למשוך אותו.',
};

export interface CircleForcesProps {
  id: string;
  preset?: CirclePreset;
  v?: number;
  theta?: number;
  mu?: number;
  omega?: number;
  vb?: number;
  support?: Support;
  phi?: number;
  showSum?: boolean;
  showSplit?: boolean;
  showV?: boolean;
  tasks?: string[];
}

interface State {
  preset: CirclePreset;
  v: number;
  theta: number;
  mu: number;
  omega: number;
  vb: number;
  support: Support;
  /** angle on the vertical circle [rad], any real number */
  phi: number;
  /** signed angular speed on the vertical circle [rad/s] (sign: direction of travel) */
  w: number;
  /** seconds of free flight since the string went slack, or null on the circle */
  flight: number | null;
  playing: boolean;
  showSum: boolean;
  showSplit: boolean;
  showV: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;
const wrap = (phi: number) => ((phi % TWO_PI) + TWO_PI) % TWO_PI;
const plain = (x: number, sig = 3) => (Math.abs(x) < 1e-9 ? '0' : sci(x, sig).replace('-', MINUS));

/** the largest angle from the lowest point the ball reaches on the circle (π or more: it goes round) */
function reachLimit(vb: number, support: Support): number {
  const v2 = vb * vb;
  const gR = G * LOOP_R;
  if (support === 'string') {
    if (v2 >= 5 * gR) return TWO_PI;
    if (v2 > 2 * gR) return slackAngle(vb, LOOP_R) ?? Math.PI;
    return stopAngle(vb, LOOP_R);
  }
  if (v2 > 4 * gR) return TWO_PI;
  return stopAngle(vb, LOOP_R);
}
/** whether a string goes slack for this v_b */
const goesSlack = (vb: number, support: Support) => support === 'string' && slackAngle(vb, LOOP_R) !== null;

/** snap an angle into the reachable arcs [0, lim] ∪ [2π − lim, 2π) */
function snapReach(phi: number, vb: number, support: Support): number {
  const lim = reachLimit(vb, support);
  const p = wrap(phi);
  if (lim >= Math.PI || p <= lim || p >= TWO_PI - lim) return p;
  return p - lim < TWO_PI - lim - p ? lim : TWO_PI - lim;
}

/** the speed on the circle at φ for the current v_b (0 where it is not reached) */
const speedAt = (vb: number, phi: number) => Math.sqrt(Math.max(0, verticalSpeed2(vb, LOOP_R, phi)));

function initial(p: CircleForcesProps): State {
  const vb = clamp(p.vb ?? 7.5, 0, 7.5);
  const support = p.support ?? 'string';
  const phi = snapReach((p.phi ?? 0) * DEG, vb, support);
  return {
    preset: p.preset ?? 'banked',
    v: clamp(p.v ?? 12, 0, 35),
    theta: clamp(p.theta ?? 20, 0, 40),
    mu: clamp(p.mu ?? 0.3, 0, 1),
    omega: clamp(p.omega ?? 4, 0, 6.5),
    vb,
    support,
    phi,
    w: speedAt(vb, phi) / LOOP_R,
    flight: null,
    playing: false,
    showSum: p.showSum ?? false,
    showSplit: p.showSplit ?? false,
    showV: p.showV ?? false,
  };
}

/** release point, velocity and retaut time of the free flight after the string goes slack */
function flightOf(s: State): { p0: Vec2; v0: Vec2; tEnd: number } | null {
  if (!goesSlack(s.vb, s.support)) return null;
  const ps = slackAngle(s.vb, LOOP_R)!;
  // released going counter-clockwise at φ_s, or clockwise at 2π − φ_s
  const ccw = s.w >= 0;
  const phi = ccw ? ps : -ps;
  const sp = speedAt(s.vb, ps);
  const p0 = verticalPosition(LOOP_R, phi);
  const v0 = verticalVelocity(ccw ? sp : -sp, phi);
  return { p0, v0, tEnd: retautTime(p0, v0, LOOP_R) };
}

/** the ball's state on the vertical circle or in flight: position [m] from the centre, velocity, support force/mg */
function ballOf(s: State): { r: Vec2; v: Vec2; Fs: number; onCircle: boolean } {
  if (s.flight !== null) {
    const fl = flightOf(s);
    if (fl) {
      const t = Math.min(s.flight, fl.tEnd);
      return {
        r: [fl.p0[0] + fl.v0[0] * t, fl.p0[1] + fl.v0[1] * t - 0.5 * G * t * t],
        v: [fl.v0[0], fl.v0[1] - G * t],
        Fs: 0,
        onCircle: false,
      };
    }
  }
  const sp = speedAt(s.vb, s.phi);
  const v = verticalVelocity(s.w < 0 ? -sp : sp, s.phi);
  return { r: verticalPosition(LOOP_R, s.phi), v, Fs: supportForce(1, sp * sp, LOOP_R, s.phi) / G, onCircle: true };
}

export default function CircleForces(props: CircleForcesProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const touched = useRef(new Set<string>());
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const change = (patch: Partial<State>) => {
    for (const k of Object.keys(patch)) touched.current.add(k);
    setS((prev) => ({ ...prev, ...patch }));
  };
  /** put the ball at φ on the circle, moving counter-clockwise, and stop the play */
  const placeBall = (phiRad: number, vb = s.vb, support = s.support): Partial<State> => {
    const phi = snapReach(phiRad, vb, support);
    return { phi, w: speedAt(vb, phi) / LOOP_R, flight: null, playing: false };
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        // a step's state is never the learner's own action
        touched.current.clear();
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.preset === 'string' && (PRESETS as string[]).includes(st.preset)) next.preset = st.preset as CirclePreset;
          if (typeof st.v === 'number') next.v = clamp(st.v, 0, 35);
          if (typeof st.theta === 'number') next.theta = clamp(st.theta, 0, 40);
          if (typeof st.mu === 'number') next.mu = clamp(st.mu, 0, 1);
          if (typeof st.omega === 'number') next.omega = clamp(st.omega, 0, 6.5);
          if (typeof st.vb === 'number') next.vb = clamp(st.vb, 0, 7.5);
          if (st.support === 'string' || st.support === 'rod') next.support = st.support;
          for (const k of ['showSum', 'showSplit', 'showV'] as const) if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          if (typeof st.phi === 'number' || typeof st.vb === 'number' || st.support !== undefined) {
            const phi = snapReach(typeof st.phi === 'number' ? st.phi * DEG : next.phi, next.vb, next.support);
            next.phi = phi;
            next.w = speedAt(next.vb, phi) / LOOP_R;
            next.flight = null;
          }
          next.playing = typeof st.playing === 'boolean' ? st.playing : false;
          return next;
        });
      }),
    [props.id],
  );

  // play: the vertical circle only; RK4 of the tangential law, then the free flight; frozen in still mode
  useEffect(() => {
    if (!s.playing || s.preset !== 'vertical') return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const d = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => {
        if (prev.flight !== null) {
          const fl = flightOf(prev);
          const t = prev.flight + d;
          if (!fl || t >= fl.tEnd) return { ...prev, flight: fl ? fl.tEnd : null, playing: false };
          return { ...prev, flight: t };
        }
        let phi = prev.phi;
        let w = prev.w;
        const slack = goesSlack(prev.vb, prev.support);
        const n = Math.max(1, Math.ceil(d / 0.002));
        for (let i = 0; i < n; i++) {
          [phi, w] = circleStep(phi, w, LOOP_R, d / n);
          if (slack && supportForce(1, w * w * LOOP_R * LOOP_R, LOOP_R, phi) < 0) {
            // the string would have to push: from here the ball is a projectile
            const ps = slackAngle(prev.vb, LOOP_R)!;
            return { ...prev, phi: w >= 0 ? ps : TWO_PI - ps, w, flight: 0 };
          }
        }
        return { ...prev, phi: wrap(phi), w };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, s.preset]);

  // tasks
  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const own = (...keys: string[]) => keys.some((k) => touched.current.has(k));
    if (s.preset === 'banked') {
      const F = bankedForces(1, BANK_R, s.theta * DEG, s.v);
      if (has('design-speed') && own('v', 'theta') && s.v > 1 && Math.abs(F.f) / G < 0.02) done('design-speed');
      if (has('friction-up') && own('v', 'theta', 'mu') && s.v > 1 && F.f / G < -0.05 && Math.abs(F.f) <= s.mu * F.N) done('friction-up');
    }
    if (s.preset === 'conical' && has('tension-double') && own('omega')) {
      const th = conicalAngle(CONE_L, s.omega);
      if (Math.abs(1 / Math.cos(th) - 2) < 0.03) done('tension-double');
    }
    if (s.preset === 'vertical') {
      if (has('top-min') && s.support === 'string' && own('vb')) {
        const top = supportForce(1, verticalSpeed2(s.vb, LOOP_R, Math.PI), LOOP_R, Math.PI) / G;
        if (Math.abs(top) < 0.05) done('top-min');
      }
      if (has('rod-push') && s.support === 'rod' && own('phi', 'playing', 'vb', 'support')) {
        const b = ballOf(s);
        if (b.onCircle && b.Fs < -0.05) done('rod-push');
      }
    }
  }, [s, props.id, props.tasks]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s)), 700);
    return () => clearTimeout(h);
  }, [s.preset, Math.round(s.v), Math.round(s.theta), Math.round(s.mu * 20), Math.round(s.omega * 4), Math.round(s.vb * 4), s.support, Math.round(wrap(s.phi) / (10 * DEG)), s.flight === null]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  const reset = () => {
    touched.current.clear();
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    let dir = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') dir = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') dir = -1;
    else return;
    e.preventDefault();
    if (s.preset === 'banked') change({ v: clamp(s.v + dir * 0.5, 0, 35) });
    else if (s.preset === 'conical') change({ omega: clamp(s.omega + dir * 0.05, 0, 6.5) });
    else change(placeBall(wrap(s.phi) + dir * 5 * DEG));
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: הכוחות על גוף שנע במעגל, והכוח השקול שלהם. ${describe(s)} החצים במקלדת משנים את ${s.preset === 'banked' ? 'המהירות' : s.preset === 'conical' ? 'המהירות הזוויתית' : 'מקום הכדור'}.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      readout={<Readout s={s} />}
      controls={
        <>
          <div class="group" role="group" aria-label="מצב">
            {PRESETS.map((id) => (
              <Toggle key={id} label={PRESET_NAME[id]} on={s.preset === id} onChange={() => change({ preset: id, playing: false })} />
            ))}
          </div>
          {s.preset === 'banked' && (
            <>
              <Slider label="מהירות" min={0} max={35} step={0.1} value={s.v} format={(x) => `${plain(x)} m/s`} onChange={(x) => change({ v: x })} />
              <Slider label="זווית השיפוע" min={0} max={40} step={0.5} value={s.theta} format={(x) => `${plain(x)}°`} onChange={(x) => change({ theta: x })} />
              <Slider label="מקדם חיכוך סטטי" min={0} max={1} step={0.01} value={s.mu} format={(x) => plain(x, 2)} onChange={(x) => change({ mu: x })} />
            </>
          )}
          {s.preset === 'conical' && (
            <Slider label="מהירות זוויתית" min={0} max={6.5} step={0.01} value={s.omega} format={(x) => `${plain(x)} rad/s`} onChange={(x) => change({ omega: x })} />
          )}
          {s.preset === 'vertical' && (
            <>
              <div class="group" role="group" aria-label="במה הכדור קשור">
                <Toggle label="חוט" on={s.support === 'string'} onChange={() => change({ support: 'string', ...placeBall(s.phi, s.vb, 'string') })} />
                <Toggle label="מוט" on={s.support === 'rod'} onChange={() => change({ support: 'rod', ...placeBall(s.phi, s.vb, 'rod') })} />
                <Toggle label={s.playing ? 'עצירה' : 'הפעלה'} on={s.playing} onChange={(on) => change(on ? { ...(s.flight !== null ? placeBall(0) : {}), playing: true } : { playing: false })} />
              </div>
              <Slider label="מהירות בנקודה התחתונה" min={0} max={7.5} step={0.01} value={s.vb} format={(x) => `${plain(x)} m/s`} onChange={(x) => change({ vb: x, ...placeBall(s.phi, x, s.support) })} />
              <Slider label="זווית מהנקודה התחתונה" min={0} max={360} step={1} value={wrap(s.phi) / DEG} format={(x) => `${plain(x)}°`} onChange={(x) => change(placeBall(x * DEG))} />
            </>
          )}
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="סכום הכוחות, ראש לזנב" on={s.showSum} swatch="var(--force)" onChange={(on) => change({ showSum: on })} />
            {s.preset === 'vertical' && (
              <>
                <Toggle label="רכיבי השקול" on={s.showSplit} swatch="var(--force)" onChange={(on) => change({ showSplit: on })} />
                <Toggle label="מהירות" on={s.showV} swatch="var(--velocity)" onChange={(on) => change({ showV: on })} />
              </>
            )}
          </div>
          <p class="hint">
            קנה מידה: אורך החץ של הכובד, mg, הוא קנה המידה של כל הכוחות. הכוחות משורטטים ממרכז הגוף.{' '}
            {s.preset === 'banked' && <>רדיוס העקומה <span class="q">80 m</span>, ומרכז העקומה משמאל.</>}
            {s.preset === 'conical' && <>אורך החוט <span class="q">1.0 m</span>. המשקולת מצוירת ברגע שהיא במישור הדף, ונעה לתוכו.</>}
            {s.preset === 'vertical' && <>רדיוס המעגל <span class="q">1.0 m</span>.</>}
          </p>
        </>
      }
    />
  );
}

function Readout({ s }: { s: State }) {
  if (s.preset === 'banked') {
    const th = s.theta * DEG;
    const F = bankedForces(1, BANK_R, th, s.v);
    const range = bankedSpeedRange(BANK_R, th, s.mu);
    const holds = Math.abs(F.f) <= s.mu * F.N + 1e-12;
    // a flat road has no slope: friction points to the centre of the curve
    const flat = s.theta === 0;
    return (
      <>
        <span>
          מהירות התכנון: <span class="q" data-readout="v0">v₀ = {plain(bankedDesignSpeed(BANK_R, th))} m/s</span>
        </span>
        <span class="q" data-readout="normal">N = {plain(F.N / G)} mg</span>
        <span>
          חיכוך נדרש: <span class="q" data-readout="friction">f = {plain(Math.abs(F.f) / G)} mg</span>{' '}
          <span data-readout="friction-dir">{Math.abs(F.f) / G < 0.005 ? '(אין צורך)' : F.f > 0 ? (flat ? '(אל המרכז)' : '(במורד השיפוע)') : '(במעלה השיפוע)'}</span>
        </span>
        <span class="q" data-readout="fmax">μsN = {plain((s.mu * F.N) / G)} mg</span>
        <span class="q" data-readout="net">ΣF = mv²/R = {plain(F.net / G)} mg</span>
        <span>
          טווח בלי החלקה:{' '}
          <span class="q" data-readout="range">
            {plain(range.vMin)} – {Number.isFinite(range.vMax) ? plain(range.vMax) : '∞'} m/s
          </span>
        </span>
        <b data-readout="status">{holds ? 'המכונית לא מחליקה' : F.f > 0 ? (flat ? 'המכונית מחליקה החוצה' : 'המכונית מחליקה החוצה, במעלה השיפוע') : 'המכונית מחליקה פנימה, במורד השיפוע'}</b>
      </>
    );
  }
  if (s.preset === 'conical') {
    const th = conicalAngle(CONE_L, s.omega);
    const hangs = th === 0;
    return (
      <>
        <span class="q" data-readout="theta">θ = {plain(th / DEG)}°</span>
        <span class="q" data-readout="tension">T = {plain(1 / Math.cos(th))} mg</span>
        <span class="q" data-readout="net">ΣF = {plain(Math.tan(th))} mg</span>
        <span class="q" data-readout="radius">r = {plain(CONE_L * Math.sin(th))} m</span>
        {s.omega > 0 && <span class="q" data-readout="period">2π/ω = {plain(TWO_PI / s.omega)} s</span>}
        {hangs && <b data-readout="hangs">מתחת ל-ω = 3.13 rad/s אין פתרון עם θ &gt; 0: המשקולת תלויה אנכית.</b>}
      </>
    );
  }
  const b = ballOf(s);
  const sp = Math.hypot(b.v[0], b.v[1]);
  const name = s.support === 'string' ? 'T' : 'F';
  const lim = reachLimit(s.vb, s.support);
  const ps = goesSlack(s.vb, s.support) ? slackAngle(s.vb, LOOP_R) : null;
  return (
    <>
      <span class="q" data-readout="phi">φ = {plain(wrap(s.phi) / DEG)}°</span>
      <span class="q" data-readout="speed">v = {plain(sp)} m/s</span>
      <span>
        {s.support === 'string' ? 'מתיחות' : 'כוח המוט'}:{' '}
        <span class="q" data-readout="support">
          {name} = {plain(b.Fs)} mg
        </span>{' '}
        {s.support === 'rod' && b.onCircle && Math.abs(b.Fs) > 0.005 && <span>{b.Fs > 0 ? '(מושך)' : '(דוחף)'}</span>}
      </span>
      {b.onCircle && <span class="q" data-readout="radial">ΣF<sub>r</sub> = mv²/R = {plain((sp * sp) / LOOP_R / G)} mg</span>}
      {ps !== null && (
        <span>
          החוט מתרופף ב-<span class="q" data-readout="slack">φ = {plain(ps / DEG)}°</span>
        </span>
      )}
      {ps === null && lim < TWO_PI && (
        <span>
          הכדור נעצר ב-<span class="q" data-readout="stop">φ = {plain(lim / DEG)}°</span> וחוזר
        </span>
      )}
      {!b.onCircle && <b data-readout="flight">החוט רפוי, T = 0: הכדור נע כמו גוף בזריקה</b>}
    </>
  );
}

function describe(s: State): string {
  if (s.preset === 'banked') {
    const F = bankedForces(1, BANK_R, s.theta * DEG, s.v);
    const dir = Math.abs(F.f) / G < 0.005 ? 'בלי חיכוך' : F.f > 0 ? (s.theta === 0 ? 'עם חיכוך אל מרכז העקומה' : 'עם חיכוך במורד השיפוע') : 'עם חיכוך במעלה השיפוע';
    return `כביש משופע בזווית ${plain(s.theta)} מעלות, מכונית במהירות ${plain(s.v)} מטר לשנייה, ${dir}. הכוח השקול אופקי, אל מרכז העקומה, ${plain(F.net / G)} פעמים המשקל.`;
  }
  if (s.preset === 'conical') {
    const th = conicalAngle(CONE_L, s.omega);
    return `מטוטלת קונית במהירות זוויתית ${plain(s.omega)} רדיאנים לשנייה: החוט נטוי ${plain(th / DEG)} מעלות מהאנך, והמתיחות ${plain(1 / Math.cos(th))} פעמים המשקל.`;
  }
  const b = ballOf(s);
  if (!b.onCircle) return 'החוט התרופף, והכדור נע עכשיו כמו גוף בזריקה, בתוך המעגל.';
  return `כדור על ${s.support === 'string' ? 'חוט' : 'מוט'} במעגל אנכי, ${plain(wrap(s.phi) / DEG)} מעלות מהנקודה התחתונה. ${s.support === 'string' ? 'המתיחות' : 'כוח המוט'} ${plain(b.Fs)} פעמים המשקל.`;
}

/* ---------------------------------------------------------------- drawing */

function label(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color: string, size = 14) {
  ctx.save();
  ctx.font = `italic 700 ${size}px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  ctx.lineWidth = 4;
  ctx.strokeStyle = p.paper;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function hebrew(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center') {
  ctx.save();
  ctx.font = `600 13px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillText(text, x, y);
  ctx.restore();
}

interface ForceArrow {
  /** world vector from the body [drawing units] */
  vec: Vec2;
  name: string;
  dashed?: boolean;
}

type Px = [number, number];
const LABEL_SIZE = 14;
/** forces that share a direction are drawn side by side, this far [px] either side of the centre (inside the body) */
const LANE = 4;
/** directions closer than this are "the same" for the layout */
const SAME_DIR = Math.cos(12 * DEG);

const unit = (d: Px): Px => {
  const L = Math.hypot(d[0], d[1]) || 1;
  return [d[0] / L, d[1] / L];
};
const sameDir = (a: Px, b: Px) => {
  const ua = unit(a);
  const ub = unit(b);
  return ua[0] * ub[0] + ua[1] * ub[1] > SAME_DIR;
};
/** half the width [px] of a label */
function halfWidth(ctx: CanvasRenderingContext2D, p: Palette, text: string, size = LABEL_SIZE): number {
  ctx.save();
  ctx.font = `italic 700 ${size}px ${p.fontUi}`;
  const w = ctx.measureText(text).width / 2;
  ctx.restore();
  return w;
}

/**
 * A label at the tip of the arrow tail → tail + d [px]. `side` 0 puts it beyond the tip, along the arrow;
 * ±1 beside the head, on that side of the arrow. A label beyond the tip that would leave the canvas goes
 * beside it, on the `fallback` side. Every label is kept inside the canvas.
 */
function tagArrow(
  ctx: CanvasRenderingContext2D,
  view: View,
  p: Palette,
  text: string,
  tail: Px,
  d: Px,
  side: number,
  color: string,
  size = LABEL_SIZE,
  fallback = 1,
) {
  const u = unit(d);
  const n: Px = [-u[1], u[0]];
  const tip: Px = [tail[0] + d[0], tail[1] + d[1]];
  const hw = halfWidth(ctx, p, text, size);
  const hh = size / 2 + 1;
  const fits = (x: number, y: number) => x >= hw + 2 && x <= view.w - hw - 2 && y >= hh + 2 && y <= view.h - hh - 2;
  const beside = (sd: number): Px => {
    const off = 8 + Math.abs(n[0]) * hw + Math.abs(n[1]) * hh;
    return [tip[0] - u[0] * 8 + n[0] * sd * off, tip[1] - u[1] * 8 + n[1] * sd * off];
  };
  const reach = 10 + Math.abs(u[0]) * hw + Math.abs(u[1]) * hh;
  let [x, y]: Px = side !== 0 ? beside(side) : [tip[0] + u[0] * reach, tip[1] + u[1] * reach];
  if (side === 0 && !fits(x, y)) [x, y] = beside(fallback);
  label(ctx, p, text, clamp(x, hw + 2, view.w - hw - 2), clamp(y, hh + 2, view.h - hh - 2), color, size);
}

interface Part {
  /** world vector [drawing units] */
  vec: Vec2;
  name: string;
}

/**
 * Draw a set of forces from a body point, the net force emphasised, its components (`parts`, dashed) if
 * given, and optionally the forces' tip-to-tail sum.
 *
 * Forces that point the same way are drawn side by side, each still starting on the body, their labels on
 * opposite sides. When the net force or one of its components points the same way as a force (the flat
 * curve: ΣF = f; the top of the vertical circle: T, mg and ΣF all down; ΣFᵣ along the string), the net force
 * and its components are drawn from a point beside the body, tied to it by a dotted line, so that they never
 * hide the force they equal. Labels stay inside the canvas. Returns the screen point the net force starts at.
 */
function drawForces(
  ctx: CanvasRenderingContext2D,
  view: View,
  p: Palette,
  at: Vec2,
  forces: ForceArrow[],
  net: Vec2,
  showSum: boolean,
  netFaded = false,
  netName = 'ΣF',
  parts: Part[] = [],
): Px {
  const S = (w: Vec2) => toScreen(view, w[0], w[1]);
  const B = S(at);
  /** a world vector as a screen delta, lengthened to `min` px if shorter */
  const screen = (vec: Vec2, min = MIN_ARROW): Px => {
    const t = S([at[0] + vec[0], at[1] + vec[1]]);
    const d: Px = [t[0] - B[0], t[1] - B[1]];
    const L = Math.hypot(d[0], d[1]);
    const k = L > 0 && L < min ? min / L : 1;
    return [d[0] * k, d[1] * k];
  };
  const half = (text: string) => halfWidth(ctx, p, text);
  const dot = (a: Px, b: Px) => a[0] * b[0] + a[1] * b[1];
  const nrm = (d: Px): Px => {
    const u = unit(d);
    return [-u[1], u[0]];
  };

  const list = forces
    .filter((f) => Math.hypot(f.vec[0], f.vec[1]) > 1e-9)
    .map((f) => ({ ...f, d: screen(f.vec), tail: B as Px, side: 0 }));
  // forces sharing a direction: side by side, labels on opposite sides
  const placed = new Set<number>();
  list.forEach((f, i) => {
    if (placed.has(i)) return;
    const group = list.map((_, j) => j).filter((j) => !placed.has(j) && sameDir(list[j].d, f.d));
    group.forEach((j) => placed.add(j));
    if (group.length < 2) return;
    const n = nrm(f.d);
    group.forEach((j, idx) => {
      const o = group.length === 2 ? (idx === 0 ? -LANE : LANE) : (idx - (group.length - 1) / 2) * LANE;
      list[j].tail = [B[0] + n[0] * o, B[1] + n[1] * o];
      list[j].side = o === 0 ? 0 : Math.sign(o);
    });
  });

  const hasNet = Math.hypot(net[0], net[1]) > 1e-9;
  const nd = hasNet ? screen(net) : ([0, 0] as Px);
  // a component equal to a force (ΣFᵣ = T where mg has no radial part) is not drawn twice: the force's
  // label names both
  const pd = parts
    .map((q) => ({ ...q, d: screen(q.vec, 0) }))
    .filter((q) => {
      const twin = list.find((f) => {
        const raw = screen(f.vec, 0);
        return Math.hypot(raw[0] - q.d[0], raw[1] - q.d[1]) < 3;
      });
      if (twin) twin.name = `${twin.name} = ${q.name}`;
      return !twin;
    });
  // a net force equal to one force (the flat curve: ΣF = f) is drawn under it, wide and pale, and the force's
  // label names both; it needs no lane of its own
  const netRaw = hasNet ? screen(net, 0) : ([0, 0] as Px);
  const netTwin = hasNet
    ? list.find((f) => {
        const raw = screen(f.vec, 0);
        return Math.hypot(raw[0] - netRaw[0], raw[1] - netRaw[1]) < 3;
      })
    : undefined;
  const group = [...(hasNet && !netTwin ? [nd] : []), ...pd.map((q) => q.d)];
  /** whether segments p1→p2 and p3→p4 cross */
  const crosses = (p1: Px, p2: Px, p3: Px, p4: Px) => {
    const c = (a: Px, b: Px, q: Px) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    return c(p1, p2, p3) * c(p1, p2, p4) < 0 && c(p3, p4, p1) * c(p3, p4, p2) < 0;
  };

  // the net force (and its components) beside the body when one of them points the way a force does: the
  // nearest of a ring of points that keeps each clear of the force it parallels, clear of the forces'
  // shafts and side labels, and inside the canvas
  let off: Px = [0, 0];
  if (group.some((g) => list.some((f) => sameDir(g, f.d)))) {
    let best = Infinity;
    for (const r of [24, 32, 42, 54]) {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const o: Px = [r * Math.cos(a), r * Math.sin(a)];
        let sep = Infinity;
        for (const g of group)
          for (const f of list)
            if (sameDir(g, f.d)) {
              const u = unit(f.d);
              sep = Math.min(sep, Math.abs(o[0] * u[1] - o[1] * u[0]));
            }
        if (sep < 14) continue;
        let cost = r;
        // pointing into a force's shaft
        for (const f of list) cost += 40 * Math.max(0, dot(o, unit(f.d)) / r - 0.3);
        // onto a side label
        for (const f of list) {
          const n = nrm(f.d);
          if (f.side !== 0 && dot(unit(o), [n[0] * f.side, n[1] * f.side]) > 0.5 && r < LANE + 18 + 2 * half(f.name)) cost += 60;
        }
        const T: Px = [B[0] + o[0], B[1] + o[1]];
        for (const g of group) {
          const e: Px = [T[0] + g[0], T[1] + g[1]];
          // out of the canvas
          if (e[0] < 6 || e[0] > view.w - 6 || e[1] < 6 || e[1] > view.h - 6) cost += 500;
          // across a force, or across the body
          for (const f of list) if (crosses(T, e, f.tail, [f.tail[0] + f.d[0], f.tail[1] + f.d[1]])) cost += 50;
          const along = clamp(dot([B[0] - T[0], B[1] - T[1]], unit(g)), 0, Math.hypot(g[0], g[1]));
          const near = Math.hypot(T[0] + unit(g)[0] * along - B[0], T[1] + unit(g)[1] * along - B[1]);
          if (near < 12) cost += 50;
        }
        if (cost < best) {
          best = cost;
          off = o;
        }
      }
    }
  }
  const netTail: Px = [B[0] + off[0], B[1] + off[1]];
  const laned = off[0] !== 0 || off[1] !== 0;

  if (netTwin) {
    const t: Px = [B[0] + nd[0], B[1] + nd[1]];
    arrow(ctx, B[0], B[1], t[0], t[1], { color: withAlpha(p.force, netFaded ? 0.25 : 0.45), width: 10, head: 20 });
    netTwin.name = `${netTwin.name} = ${netName}`;
  }

  // tip-to-tail sum, under everything; it ends on the net force's tip
  if (showSum) {
    let cur: Px = netTail;
    ctx.save();
    ctx.setLineDash([5, 4]);
    for (const f of list) {
      const raw = S([at[0] + f.vec[0], at[1] + f.vec[1]]);
      const next: Px = [cur[0] + raw[0] - B[0], cur[1] + raw[1] - B[1]];
      arrow(ctx, cur[0], cur[1], next[0], next[1], { color: withAlpha(p.force, 0.55), width: 1.8, head: 9 });
      cur = next;
    }
    ctx.restore();
  }

  for (const f of list) {
    ctx.save();
    if (f.dashed) ctx.setLineDash([6, 4]);
    arrow(ctx, f.tail[0], f.tail[1], f.tail[0] + f.d[0], f.tail[1] + f.d[1], { color: withAlpha(p.force, f.dashed ? 0.7 : 0.9), width: 2.6, head: 11 });
    ctx.restore();
    // a label pushed off the canvas goes beside the head, away from the net force's lane
    const away = laned && dot(off, nrm(f.d)) > 0 ? -1 : 1;
    tagArrow(ctx, view, p, f.name, f.tail, f.d, f.side, p.force, LABEL_SIZE, away);
  }

  if (laned) {
    // the tie to the body
    ctx.save();
    ctx.strokeStyle = withAlpha(p.force, 0.6);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(B[0], B[1]);
    ctx.lineTo(netTail[0], netTail[1]);
    ctx.stroke();
    ctx.restore();
  }

  for (const q of pd) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    arrow(ctx, netTail[0], netTail[1], netTail[0] + q.d[0], netTail[1] + q.d[1], { color: withAlpha(p.force, 0.75), width: 1.8, head: 9 });
    ctx.restore();
    tagArrow(ctx, view, p, q.name, netTail, q.d, 0, p.force, 13, laned && dot(off, nrm(q.d)) < 0 ? -1 : 1);
  }

  if (hasNet && !netTwin) {
    const t: Px = [netTail[0] + nd[0], netTail[1] + nd[1]];
    arrow(ctx, netTail[0], netTail[1], t[0], t[1], { color: p.paper, width: 8.5, head: 17 });
    arrow(ctx, netTail[0], netTail[1], t[0], t[1], { color: netFaded ? withAlpha(p.force, 0.45) : p.force, width: 5, head: 15 });
    // in its own lane, the label goes on the lane's outer side when it fits there
    const outer = dot(off, nrm(nd)) < 0 ? -1 : 1;
    let side = 0;
    if (laned) {
      const hw = half(netName);
      const n = nrm(nd);
      const u = unit(nd);
      const offN = 8 + Math.abs(n[0]) * hw + Math.abs(n[1]) * (LABEL_SIZE / 2 + 1);
      const x = t[0] - u[0] * 8 + n[0] * outer * offN;
      const y = t[1] - u[1] * 8 + n[1] * outer * offN;
      if (x >= hw + 2 && x <= view.w - hw - 2 && y >= 10 && y <= view.h - 10) side = outer;
    }
    tagArrow(ctx, view, p, netName, netTail, nd, side, p.force, LABEL_SIZE, outer);
  }
  return netTail;
}

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State) {
  if (s.preset === 'banked') paintBanked(ctx, view, p, s);
  else if (s.preset === 'conical') paintConical(ctx, view, p, s);
  else paintVertical(ctx, view, p, s);
}

function paintBanked(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State) {
  const S = (w: Vec2) => toScreen(view, w[0], w[1]);
  const th = s.theta * DEG;
  const along: Vec2 = [Math.cos(th), Math.sin(th)]; // up the slope, away from the centre
  const nrm: Vec2 = [-Math.sin(th), Math.cos(th)]; // out of the road
  const pt = (k: number): Vec2 => [BANK_P0[0] + along[0] * k, BANK_P0[1] + along[1] * k];

  // the axis of the curve
  const ax0 = S([BANK_AXIS_X, -3.9]);
  const ax1 = S([BANK_AXIS_X, 3.6]);
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(ax0[0], ax0[1]);
  ctx.lineTo(ax1[0], ax1[1]);
  ctx.stroke();
  ctx.restore();
  hebrew(ctx, p, 'ציר העקומה', ax1[0] + 6, ax1[1] + 10, p.ink2, 'left');

  // the road: a slab from the axis side outwards, and the ground under it
  const a = pt(-3);
  const b = pt(3.6);
  const yGround = a[1] - 0.25;
  const A = S(a);
  const Bp = S(b);
  const ga = S([a[0], yGround]);
  const gb = S([b[0], yGround]);
  ctx.save();
  ctx.fillStyle = withAlpha(p.ink3, 0.18);
  ctx.beginPath();
  ctx.moveTo(A[0], A[1]);
  ctx.lineTo(Bp[0], Bp[1]);
  ctx.lineTo(gb[0], gb[1]);
  ctx.lineTo(ga[0], ga[1]);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(A[0], A[1]);
  ctx.lineTo(Bp[0], Bp[1]);
  ctx.stroke();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(ga[0] - 20, ga[1]);
  ctx.lineTo(gb[0] + 20, gb[1]);
  ctx.stroke();
  ctx.restore();

  // the bank angle
  if (s.theta > 0.5) {
    const corner = A;
    const rpx = 34;
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(corner[0], corner[1]);
    ctx.lineTo(corner[0] + rpx * 1.6, corner[1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(corner[0], corner[1], rpx, -th, 0);
    ctx.stroke();
    ctx.restore();
    label(ctx, p, 'θ', corner[0] + rpx + 12, corner[1] - Math.max(6, rpx * Math.sin(th / 2)), p.ink2, 13);
  }

  // the car, a box on the road (seen from behind), with its wheels
  const C: Vec2 = [BANK_P0[0] + nrm[0] * 0.5, BANK_P0[1] + nrm[1] * 0.5];
  const corners = [
    [-0.8, 0.12],
    [0.8, 0.12],
    [0.8, 0.85],
    [-0.8, 0.85],
  ].map(([u, n]) => S([BANK_P0[0] + along[0] * u + nrm[0] * n, BANK_P0[1] + along[1] * u + nrm[1] * n]));
  ctx.save();
  ctx.fillStyle = withAlpha(p.ink2, 0.22);
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.ink;
  for (const u of [-0.55, 0.55]) {
    const w = S([BANK_P0[0] + along[0] * u + nrm[0] * 0.08, BANK_P0[1] + along[1] * u + nrm[1] * 0.08]);
    ctx.beginPath();
    ctx.ellipse(w[0], w[1], 9, 5, -th, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const k = forceScale(view, 'banked');
  const F = bankedForces(1, BANK_R, th, s.v);
  const holds = Math.abs(F.f) <= s.mu * F.N + 1e-12;
  const down: Vec2 = [-along[0], -along[1]];
  const forces: ForceArrow[] = [
    { vec: [0, -k], name: 'mg' },
    { vec: [nrm[0] * (F.N / G) * k, nrm[1] * (F.N / G) * k], name: 'N' },
    { vec: [down[0] * (F.f / G) * k, down[1] * (F.f / G) * k], name: 'f', dashed: !holds },
  ];
  drawForces(ctx, view, p, C, forces, [-(F.net / G) * k, 0], s.showSum, !holds);

  // the body's centre
  const Cs = S(C);
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(Cs[0], Cs[1], 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (!holds) hebrew(ctx, p, 'החיכוך הסטטי לא יכול להגיע לזה', S([2.2, 3.4])[0], S([2.2, 3.4])[1], p.neg);
}

function paintConical(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State) {
  const S = (w: Vec2) => toScreen(view, w[0], w[1]);
  const th = conicalAngle(CONE_L, s.omega);
  const P = S(CONE_PIVOT);
  const bob: Vec2 = [CONE_PIVOT[0] + CONE_LEN * Math.sin(th), CONE_PIVOT[1] - CONE_LEN * Math.cos(th)];
  const Bs = S(bob);

  // ceiling and axis
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(P[0] - 40, P[1]);
  ctx.lineTo(P[0] + 40, P[1]);
  ctx.stroke();
  for (let i = -36; i <= 36; i += 9) {
    ctx.beginPath();
    ctx.moveTo(P[0] + i, P[1]);
    ctx.lineTo(P[0] + i + 7, P[1] - 7);
    ctx.stroke();
  }
  const a1 = S([CONE_PIVOT[0], -3.8]);
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(P[0], P[1]);
  ctx.lineTo(a1[0], a1[1]);
  ctx.stroke();
  // the horizontal circle, seen obliquely
  if (th > 0.01) {
    const rx = CONE_LEN * Math.sin(th) * view.ppm;
    const c = S([CONE_PIVOT[0], bob[1]]);
    ctx.strokeStyle = withAlpha(p.ink2, 0.8);
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(c[0], c[1], rx, rx * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
    // the angle at the pivot
    ctx.setLineDash([]);
    ctx.strokeStyle = p.ink2;
    ctx.beginPath();
    ctx.arc(P[0], P[1], 36, Math.PI / 2 - th, Math.PI / 2);
    ctx.stroke();
  }
  ctx.restore();
  if (th > 0.05) label(ctx, p, 'θ', P[0] + 46 * Math.sin(th / 2), P[1] + 46 * Math.cos(th / 2), p.ink2, 13);
  label(ctx, p, 'ω', P[0] - 22, P[1] + 24, p.ink2, 14);

  // the string
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(P[0], P[1]);
  ctx.lineTo(Bs[0], Bs[1]);
  ctx.stroke();
  ctx.restore();

  const k = forceScale(view, 'conical');
  const T = 1 / Math.cos(th);
  const toPivot: Vec2 = [-Math.sin(th), Math.cos(th)];
  drawForces(
    ctx,
    view,
    p,
    bob,
    [
      { vec: [0, -k], name: 'mg' },
      { vec: [toPivot[0] * T * k, toPivot[1] * T * k], name: 'T' },
    ],
    [-Math.tan(th) * k, 0],
    s.showSum,
  );

  // the bob, and its velocity into the page
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(Bs[0], Bs[1], 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (th > 0.01) {
    const vx = Bs[0] + 26;
    const vy = Bs[1] - 22;
    ctx.strokeStyle = p.velocity;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(vx, vy, 8, 0, Math.PI * 2);
    ctx.moveTo(vx - 5, vy - 5);
    ctx.lineTo(vx + 5, vy + 5);
    ctx.moveTo(vx + 5, vy - 5);
    ctx.lineTo(vx - 5, vy + 5);
    ctx.stroke();
    label(ctx, p, 'v', vx + 16, vy - 4, p.velocity, 13);
  }
  ctx.restore();
}

function paintVertical(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State) {
  const S = (w: Vec2) => toScreen(view, w[0], w[1]);
  const k = forceScale(view, 'vertical', s.vb);
  const kpx = k * view.ppm;
  // the lowest point: centred if it can be, else just high enough for mg below it and the pull above it
  const pullMax = (s.vb * s.vb) / (G * LOOP_R) + 1;
  const yLow = clamp(view.h / 2 + LOOP_RD * view.ppm, EDGE + pullMax * kpx, view.h - EDGE - kpx);
  const rpx = Math.min(LOOP_RD * view.ppm, (yLow - 18) / 2);
  const LOOP_O: Vec2 = [LOOP_X, toWorld(view, 0, yLow - rpx)[1]];
  const kd = rpx / view.ppm / LOOP_R; // drawing units per metre
  const W = (r: Vec2): Vec2 => [LOOP_O[0] + r[0] * kd, LOOP_O[1] + r[1] * kd];
  const O = S(LOOP_O);
  const lim = reachLimit(s.vb, s.support);

  // the circle: solid where the ball can be on it, faint elsewhere
  ctx.save();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = withAlpha(p.ink3, 0.6);
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.arc(O[0], O[1], rpx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 2;
  if (lim >= TWO_PI) {
    ctx.beginPath();
    ctx.arc(O[0], O[1], rpx, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // canvas angles run clockwise from +x on screen; the lowest point is at +π/2
    ctx.beginPath();
    ctx.arc(O[0], O[1], rpx, Math.PI / 2 - lim, Math.PI / 2 + lim);
    ctx.stroke();
  }
  ctx.fillStyle = p.ink2;
  ctx.beginPath();
  ctx.arc(O[0], O[1], 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // the free flight after the string goes slack
  const fl = flightOf(s);
  const atSlack = goesSlack(s.vb, s.support) && Math.abs(wrap(s.phi) - (s.w >= 0 ? lim : TWO_PI - lim)) < 1e-6;
  if (fl && (s.flight !== null || atSlack)) {
    ctx.save();
    ctx.strokeStyle = withAlpha(p.accent, 0.9);
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const t = (fl.tEnd * i) / N;
      const q = S(W([fl.p0[0] + fl.v0[0] * t, fl.p0[1] + fl.v0[1] * t - 0.5 * G * t * t]));
      if (i === 0) ctx.moveTo(q[0], q[1]);
      else ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
    ctx.restore();
  }

  const b = ballOf(s);
  const ballW = W(b.r);
  const Bs = S(ballW);
  // the string or rod
  ctx.save();
  ctx.strokeStyle = p.ink;
  if (s.support === 'rod') {
    ctx.lineWidth = 5;
    ctx.strokeStyle = p.equip || p.ink2;
  } else {
    ctx.lineWidth = 1.6;
    if (!b.onCircle) ctx.setLineDash([3, 4]);
  }
  ctx.beginPath();
  ctx.moveTo(O[0], O[1]);
  ctx.lineTo(Bs[0], Bs[1]);
  ctx.stroke();
  ctx.restore();

  // the ball, under its arrows (they start at its centre) and their labels
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(Bs[0], Bs[1], 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // forces
  const r = b.r;
  const rl = Math.hypot(r[0], r[1]) || 1;
  const inward: Vec2 = [-r[0] / rl, -r[1] / rl];
  const forces: ForceArrow[] = [{ vec: [0, -k], name: 'mg' }];
  if (b.onCircle) forces.push({ vec: [inward[0] * b.Fs * k, inward[1] * b.Fs * k], name: s.support === 'string' ? 'T' : 'F' });
  const net: Vec2 = [inward[0] * b.Fs * k, -k + inward[1] * b.Fs * k];
  // the components of the net force: radial (= m v²/R) and tangential; where one of them vanishes the net
  // force IS the other, and its label says so instead of a second arrow on top of it
  const split = s.showSplit && b.onCircle;
  const rad = net[0] * inward[0] + net[1] * inward[1];
  const tan: Vec2 = [-inward[1], inward[0]];
  const tc = net[0] * tan[0] + net[1] * tan[1];
  const radPx = Math.abs(rad) * view.ppm;
  const tanPx = Math.abs(tc) * view.ppm;
  const netName = split && tanPx < 3 && radPx >= 3 ? 'ΣF = ΣFᵣ' : split && radPx < 3 && tanPx >= 3 ? 'ΣF = ΣFₜ' : 'ΣF';
  const parts: Part[] =
    split && radPx >= 3 && tanPx >= 3
      ? [
          { vec: [inward[0] * rad, inward[1] * rad], name: 'ΣFᵣ' },
          { vec: [tan[0] * tc, tan[1] * tc], name: 'ΣFₜ' },
        ]
      : [];
  const netTail = drawForces(ctx, view, p, ballW, forces, net, s.showSum, false, netName, parts);

  // the centre's name, beside it across the string, on the side away from the net force's lane
  {
    const sx = Bs[0] - O[0];
    const sy = Bs[1] - O[1];
    const sl = Math.hypot(sx, sy) || 1;
    let nx = -sy / sl;
    let ny = sx / sl;
    if (nx * (netTail[0] - Bs[0]) + ny * (netTail[1] - Bs[1]) > 0) {
      nx = -nx;
      ny = -ny;
    }
    label(ctx, p, 'O', O[0] + nx * 14, O[1] + ny * 14, p.ink2, 13);
  }

  // velocity
  if (s.showV) {
    const sp = Math.hypot(b.v[0], b.v[1]);
    if (sp > 1e-3) {
      const t = S([ballW[0] + b.v[0] * V_SCALE, ballW[1] + b.v[1] * V_SCALE]);
      arrow(ctx, Bs[0], Bs[1], t[0], t[1], { color: p.velocity, width: 2.6, head: 11 });
      const dx = t[0] - Bs[0];
      const dy = t[1] - Bs[1];
      const L = Math.hypot(dx, dy) || 1;
      label(ctx, p, 'v', t[0] + (dx / L) * 12, t[1] + (dy / L) * 12, p.velocity);
    }
  }

  paintPlot(ctx, view, p, s, b.onCircle ? wrap(s.phi) : null, b.Fs);
}

/** inset: the string (or rod) force in units of mg against the angle φ from the lowest point */
function paintPlot(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, phiNow: number | null, FsNow: number) {
  // the plot's box [px]: its top below the reset and fullscreen buttons, its "360°" tick inside the canvas
  const left = toScreen(view, PLOT.x0, 0)[0];
  const right = Math.min(toScreen(view, PLOT.x1, 0)[0], view.w - 16);
  const top = Math.max(toScreen(view, 0, PLOT.y1)[1], BUTTONS_H + 10);
  const bottom = Math.min(toScreen(view, 0, PLOT.y0)[1], view.h - 18);
  /** a point of the plot, φ in degrees and the force in mg, on screen */
  const S = (deg: number, f: number): [number, number] => [
    left + ((right - left) * deg) / 360,
    bottom - ((bottom - top) * (clamp(f, PLOT.fMin, PLOT.fMax) - PLOT.fMin)) / (PLOT.fMax - PLOT.fMin),
  ];
  const lim = reachLimit(s.vb, s.support);
  const fOf = (deg: number) => {
    const v2 = verticalSpeed2(s.vb, LOOP_R, deg * DEG);
    return v2 < 0 ? null : supportForce(1, v2, LOOP_R, deg * DEG) / G;
  };

  ctx.save();
  // the region where a string would have to push
  if (s.support === 'string') {
    const a = S(0, 0);
    const b = S(360, PLOT.fMin);
    ctx.fillStyle = withAlpha(p.neg, 0.08);
    ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
  }
  // axes
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1;
  const z0 = S(0, 0);
  const z1 = S(360, 0);
  ctx.beginPath();
  ctx.moveTo(z0[0], z0[1]);
  ctx.lineTo(z1[0], z1[1]);
  const yb = [left, bottom];
  const yt = [left, top];
  ctx.moveTo(yb[0], yb[1]);
  ctx.lineTo(yt[0], yt[1]);
  ctx.stroke();
  ctx.font = `12px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const d of [0, 90, 180, 270, 360]) {
    const q = [S(d, 0)[0], bottom];
    ctx.fillText(`${d}°`, q[0], q[1] + 3);
    ctx.strokeStyle = withAlpha(p.ink3, 0.4);
    ctx.beginPath();
    const qt = [S(d, 0)[0], top];
    ctx.moveTo(q[0], q[1]);
    ctx.lineTo(qt[0], qt[1]);
    ctx.stroke();
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const f of [-4, 0, 4, 8]) {
    const q = S(0, f);
    ctx.fillText(f < 0 ? `${MINUS}${-f}` : String(f), q[0] - 4, q[1]);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const tl = [left, top];
  ctx.font = `italic 700 13px ${p.fontUi}`;
  ctx.fillText(s.support === 'string' ? 'T / mg' : 'F / mg', tl[0] + 4, tl[1] - 2);
  ctx.textAlign = 'right';
  const br = [right, bottom];
  ctx.fillText('φ', br[0], br[1] - 4);

  // the curve: solid where the ball is on the circle, dashed where it would need a string that pushes
  const reached = (d: number) => {
    const r = d * DEG;
    return lim >= TWO_PI || r <= lim + 1e-9 || r >= TWO_PI - lim - 1e-9;
  };
  for (const pass of ['off', 'on'] as const) {
    ctx.strokeStyle = pass === 'on' ? p.force : withAlpha(p.force, 0.4);
    ctx.lineWidth = pass === 'on' ? 2.4 : 1.5;
    ctx.setLineDash(pass === 'on' ? [] : [4, 4]);
    ctx.beginPath();
    let pen = false;
    for (let d = 0; d <= 360; d += 1) {
      const f = fOf(d);
      const ok = f !== null && (pass === 'on' ? reached(d) : !reached(d));
      if (!ok) {
        pen = false;
        continue;
      }
      const q = S(d, f!);
      if (!pen) ctx.moveTo(q[0], q[1]);
      else ctx.lineTo(q[0], q[1]);
      pen = true;
    }
    ctx.stroke();
  }
  // the current point
  if (phiNow !== null) {
    const q = S(phiNow / DEG, FsNow);
    ctx.setLineDash([]);
    ctx.fillStyle = p.force;
    ctx.strokeStyle = p.paper;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(q[0], q[1], 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
