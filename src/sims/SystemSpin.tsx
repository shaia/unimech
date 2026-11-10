/**
 * SystemSpin (lesson 3.8): a dumbbell, two particles on a light rod or on a spring, thrown in a uniform field.
 * Its centre of mass flies the projectile parabola while the particles turn about it. Below the flight, bars
 * show the two splits of König's theorem at the instant shown: the angular momentum about a fixed, named
 * point O, L_O = (R − O) × MV + L_rel, and the kinetic energy, K = ½MV² + K_rel. A thin dashed tick on each
 * bar marks its value at the launch, so what changes and what stays is visible at a glance.
 *
 * Options: O at the launch point or on the launch level under the top; the field's weights with their lever
 * arms about the CM (their torques about the CM cancel); a spring instead of the rod (central: L_rel stays,
 * ω and K_rel change); and a HYPOTHETICAL non-central internal pair, equal and opposite but perpendicular to
 * the line of the particles, labelled on the canvas as a thought experiment: it spins the system up.
 *
 * Every number comes from src/physics/systemangular.ts. Tasks tick only in the learner's own handlers (the
 * throw button, the time slider, the toggles); a text step sets the state and the instant shown but never
 * throws or scrubs through a handler, so a step can never tick a task.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import {
  angularMomentum,
  centerOfMass,
  cmKineticEnergy,
  externalTorque,
  flightTime,
  integrate,
  internalTorque,
  kineticEnergy,
  orbitalAngularMomentum,
  relativeKineticEnergy,
  rigidState,
  rk4,
  spinAngularMomentum,
  type Launch,
  type Rigid,
  type State,
  type System,
} from '~/physics/systemangular';
import type { Vec2 } from '~/physics/vec';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/** the dumbbell: m₁ fixed, m₂ set by the learner, rod (or spring at rest) length d₀ */
const M1 = 0.3;
const D0 = 0.8;
/** the throw: the CM leaves O at 5.0 m/s, 60° above the horizontal */
const V0: Vec2 = [5 * Math.cos(Math.PI / 3), 5 * Math.sin(Math.PI / 3)];
const T_FLIGHT = flightTime(V0, G);
/** the spring constant [N/m] and the strength of the hypothetical non-central pair [N] */
const K_SPRING = 60;
const SHEAR = 1.0;
/** samples of a flight, and RK4 steps between samples for the spring */
const N = 300;
const SUB = 6;
/** a throw plays in this many seconds */
const PLAY = 3.2;

const NARROW_W = 520;
const isNarrow = (w: number) => w > 0 && w < NARROW_W;

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside, so it reads left to right in Hebrew. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  throw: 'זרקו את המשקולת פעם אחת, בכפתור "זרקו". מה עושה המהירות הזוויתית בזמן התעופה?',
  mass: `שנו את המסה ${ltr('m₂')} וזרקו שוב. האם הסיבוב סביב מרכז המסה עדיין קבוע?`,
  gravity: 'הדליקו "כובד וזרועות" והזיזו את פס הזמן. מה המומנט של הכובד ביחס למרכז המסה, ומה ביחס ל-O?',
  origin: 'החליפו את הנקודה O. איזה עמוד בגרף התנע הזוויתי משתנה, ואיזה לא?',
  top: 'הזיזו את פס הזמן לשיא של מרכז המסה. איזה חלק של האנרגיה הקינטית קטן שם, ואיזה לא?',
  spring: 'החליפו את המוט בקפיץ וזרקו. מה עושה המהירות הזוויתית, ומה התנע הזוויתי ביחס למרכז המסה?',
  pair: 'הדליקו את הזוג הלא מרכזי (ניסוי מחשבתי) וזרקו. מה קורה לתנע הזוויתי ביחס למרכז המסה?',
};

export type Connector = 'rod' | 'spring';
export type Origin = 'launch' | 'top';

export interface SystemSpinProps {
  id: string;
  connector?: Connector;
  /** the hypothetical non-central internal pair is on */
  pair?: boolean;
  /** mass of particle 2 [kg] and the angular velocity at the throw [rad/s] (+ = counter-clockwise) */
  m2?: number;
  omega?: number;
  origin?: Origin;
  /** the weights and their lever arms about the CM */
  gravity?: boolean;
  /** which controls appear */
  connectorToggle?: boolean;
  pairToggle?: boolean;
  originToggle?: boolean;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

interface Setup {
  connector: Connector;
  pair: boolean;
  m2: number;
  omega: number;
  origin: Origin;
}

interface Model {
  sys: System;
  O: Vec2;
  /** the state at time t ∈ [0, T] */
  stateAt: (t: number) => State;
  samples: State[];
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  /** bar scales: the largest |L| and the largest K of the flight */
  Lmax: number;
  Kmax: number;
  /** the values at the launch, for the ticks on the bars */
  L0: [number, number, number];
  K0: [number, number, number];
}

interface Run {
  n: number;
  setup: Setup;
  model: Model;
}

const M2_MIN = 0.05;
const M2_MAX = 0.6;
const W_MIN = -20;
const W_MAX = 20;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
/**
 * A readout number: 3 significant figures, a true minus sign, and no "−0". The value is first cleaned to 12
 * figures, so float noise (5.624999… for an exact 5.625) cannot move the third figure.
 */
const signed = (x: number, tiny = 1e-9) => (Math.abs(x) <= tiny ? '0' : sci(Number(x.toPrecision(12)), 3).replace('-', '−'));

function modelOf(s: Setup): Model {
  const shear = s.pair ? SHEAR : 0;
  const sys: System = { m1: M1, m2: s.m2, g: G, k: s.connector === 'spring' ? K_SPRING : 0, d0: D0, shear };
  const rigid: Rigid = { m1: M1, m2: s.m2, d: D0, g: G, shear };
  const launch: Launch = { R0: [0, 0], V0, theta0: 0, omega0: s.omega };
  const h = T_FLIGHT / N;
  let samples: State[];
  let stateAt: (t: number) => State;
  if (s.connector === 'rod') {
    samples = Array.from({ length: N + 1 }, (_, i) => rigidState(rigid, launch, i * h));
    stateAt = (t) => rigidState(rigid, launch, clamp(t, 0, T_FLIGHT));
  } else {
    samples = integrate(sys, rigidState(rigid, launch, 0), T_FLIGHT, N, SUB);
    stateAt = (t) => {
      const tt = clamp(t, 0, T_FLIGHT);
      const i = Math.min(N, Math.floor(tt / h));
      const rem = tt - i * h;
      let st = samples[i];
      if (rem <= 1e-12) return st;
      const k = Math.ceil(rem / (h / SUB));
      for (let j = 0; j < k; j++) st = rk4(sys, st, rem / k);
      return st;
    };
  }
  const O: Vec2 = s.origin === 'launch' ? [0, 0] : [(V0[0] * T_FLIGHT) / 2, 0];
  const b = { xMin: O[0], xMax: O[0], yMin: O[1], yMax: O[1] };
  let Lmax = 0.05;
  let Kmax = 0.05;
  for (const st of samples) {
    // the particles, and the tip of the CM's velocity arrow (drawn 0.11 m per m/s) with room for its label
    const c = centerOfMass(sys, st);
    const tip: Vec2 = [c.R[0] + 0.14 * c.V[0], c.R[1] + 0.14 * c.V[1]];
    for (const r of [st.r1, st.r2, tip]) {
      b.xMin = Math.min(b.xMin, r[0]);
      b.xMax = Math.max(b.xMax, r[0]);
      b.yMin = Math.min(b.yMin, r[1]);
      b.yMax = Math.max(b.yMax, r[1]);
    }
    const lo = orbitalAngularMomentum(sys, st, O);
    const lr = spinAngularMomentum(sys, st);
    Lmax = Math.max(Lmax, Math.abs(lo), Math.abs(lr), Math.abs(lo + lr));
    Kmax = Math.max(Kmax, kineticEnergy(sys, st));
  }
  const pad = 0.15;
  const bounds = { xMin: b.xMin - pad, xMax: b.xMax + pad, yMin: b.yMin - pad, yMax: b.yMax + pad };
  const s0 = samples[0];
  const L0: [number, number, number] = [orbitalAngularMomentum(sys, s0, O), spinAngularMomentum(sys, s0), angularMomentum(sys, s0, O)];
  const K0: [number, number, number] = [cmKineticEnergy(sys, s0), relativeKineticEnergy(sys, s0), kineticEnergy(sys, s0)];
  return { sys, O, stateAt, samples, bounds, Lmax, Kmax, L0, K0 };
}

/** Canvas text with a paper halo (Latin and math labels). */
function haloText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { font: string; color?: string; align?: CanvasTextAlign }) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.font = o.font;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Hebrew canvas text (right-to-left), centred at (x, y). */
function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.font = `600 ${size}px ${p.fontUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** A symbol with a true subscript (L with a small "rel" below the line), centred at (x, y). */
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

export default function SystemSpin(props: SystemSpinProps) {
  const initialSetup = (): Setup => ({
    connector: props.connector ?? 'rod',
    pair: props.pair ?? false,
    m2: clamp(props.m2 ?? 0.15, M2_MIN, M2_MAX),
    omega: clamp(props.omega ?? 12, W_MIN, W_MAX),
    origin: props.origin ?? 'launch',
  });
  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [gravity, setGravity] = useState(props.gravity ?? false);
  /** the instant shown when nothing flies [s]; a negative value is a fraction of the flight, resolved below */
  const [time, setTime] = useState(0);
  const [flying, setFlying] = useState<Run | null>(null);
  const [live, setLive] = useState('');
  const [narrowStage, setNarrowStage] = useState(false);
  const t0 = useRef<number | null>(null);
  const landed = useRef(0);
  const count = useRef(0);

  const model = useMemo(() => modelOf(setup), [setup.connector, setup.pair, setup.m2, setup.omega, setup.origin]);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setSetup((prev) => ({
          connector: st.connector === 'rod' || st.connector === 'spring' ? st.connector : prev.connector,
          pair: bool(st.pair) ?? prev.pair,
          m2: clamp(num(st.m2) ?? prev.m2, M2_MIN, M2_MAX),
          omega: clamp(num(st.omega) ?? prev.omega, W_MIN, W_MAX),
          origin: st.origin === 'launch' || st.origin === 'top' ? st.origin : prev.origin,
        }));
        const g = bool(st.gravity);
        if (g !== null) setGravity(g);
        setFlying(null);
        const t = num(st.t);
        const tf = num(st.tFrac);
        setTime(t !== null ? clamp(t, 0, T_FLIGHT) : tf !== null ? clamp(tf, 0, 1) * T_FLIGHT : 0);
      }),
    [props.id],
  );

  const land = (r: Run) => {
    if (landed.current === r.n) return;
    landed.current = r.n;
    setFlying(null);
    setTime(T_FLIGHT);
    setLive(`המשקולת נחתה. המהירות הזוויתית ${sci(currentOmega(r.model, T_FLIGHT))} רדיאנים לשנייה.`);
  };

  const fire = () => {
    const n = ++count.current;
    t0.current = null;
    const r: Run = { n, setup: { ...setup }, model };
    done('throw');
    if (setup.m2 !== initialSetup().m2) done('mass');
    if (setup.connector === 'spring' && !setup.pair) done('spring');
    if (setup.pair) done('pair');
    if (!motionAllowed()) {
      land(r);
      return;
    }
    setFlying(r);
    setLive('המשקולת באוויר.');
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const narrow = isNarrow(view.w);
    const fs = narrow ? 10 : 12;

    // the instant shown
    let now = clamp(time, 0, T_FLIGHT);
    let m = model;
    if (flying) {
      if (t0.current === null) t0.current = t;
      m = flying.model;
      now = Math.min(((t - t0.current) * T_FLIGHT) / PLAY, T_FLIGHT);
      if (now >= T_FLIGHT) land(flying);
    }
    const s = m.stateAt(now);
    const { R, V } = centerOfMass(m.sys, s);

    /* ---------------- the flight, above */
    const worldH = Math.round(view.h * (narrow ? 0.54 : 0.57));
    // with the weights shown, room below the lowest particle for the longer weight arrow and its label
    const b = gravity ? { ...m.bounds, yMin: m.bounds.yMin - 0.32 * Math.max(1, m.sys.m2 / M1) - 0.12 } : m.bounds;
    const top = 30; // room for the notes and the sign convention
    const bottom = worldH - 10;
    const ppm = Math.min((view.w - 24) / (b.xMax - b.xMin), (bottom - top) / (b.yMax - b.yMin));
    const x0 = (view.w - ppm * (b.xMax - b.xMin)) / 2 - ppm * b.xMin;
    const y0 = top + (bottom - top - ppm * (b.yMax - b.yMin)) / 2 + ppm * b.yMax;
    const X = (x: number) => x0 + ppm * x;
    const Y = (y: number) => y0 - ppm * y;

    // the sign convention: counter-clockwise is positive (z out of the page)
    {
      const cx = 18;
      const cy = 16;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.4;
      // canvas angles grow clockwise on the screen, so a counter-clockwise turn is `anticlockwise = true`
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0.15 * Math.PI, 0.45 * Math.PI, true);
      ctx.stroke();
      ctx.restore();
      // the arrowhead at the end of the arc, along the counter-clockwise tangent (sin a, −cos a)
      const a = 0.45 * Math.PI;
      const ex = cx + 8 * Math.cos(a);
      const ey = cy + 8 * Math.sin(a);
      const tx = Math.sin(a);
      const ty = -Math.cos(a);
      arrow(ctx, ex - tx * 5, ey - ty * 5, ex + tx * 2, ey + ty * 2, { color: p.ink2, width: 1.4, head: 6 });
      haloText(ctx, p, '+', cx, cy + 1, { font: `700 ${fs}px ${p.fontUi}`, color: p.ink2 });
    }

    // the CM's parabola, dashed, over the whole flight
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink3, 0.9);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const tt = (i / 60) * T_FLIGHT;
      const xx = X(V0[0] * tt);
      const yy = Y(V0[1] * tt - 0.5 * G * tt * tt);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.restore();

    // the particles' paths so far
    const h = T_FLIGHT / N;
    const upto = Math.floor(now / h);
    for (const [key, color] of [
      ['r1', withAlpha(p.ink2, 0.55)],
      ['r2', withAlpha(p.ink3, 0.75)],
    ] as const) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= upto; i++) {
        const r = m.samples[i][key];
        if (i === 0) ctx.moveTo(X(r[0]), Y(r[1]));
        else ctx.lineTo(X(r[0]), Y(r[1]));
      }
      ctx.lineTo(X(s[key][0]), Y(s[key][1]));
      ctx.stroke();
      ctx.restore();
    }

    // O, the fixed point every angular momentum and torque above the bars is taken about
    const ox = X(m.O[0]);
    const oy = Y(m.O[1]);
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // what the label O must keep off: segments (a point is a segment of no length) with a clearance radius
    const keepOff: { a: [number, number]; b: [number, number]; r: number }[] = [];

    // R, from O to the CM
    const Rpx = Math.hypot(X(R[0]) - ox, Y(R[1]) - oy);
    if (Rpx > 14) {
      arrow(ctx, ox, oy, X(R[0]), Y(R[1]), { color: p.ink2, width: 1.3, head: 7, alpha: 0.8 });
      keepOff.push({ a: [ox, oy], b: [X(R[0]), Y(R[1])], r: 2 });
      const mx = (ox + X(R[0])) / 2;
      const my = (oy + Y(R[1])) / 2;
      const nx = -(Y(R[1]) - oy) / Rpx;
      const ny = (X(R[0]) - ox) / Rpx;
      haloText(ctx, p, 'R', mx + nx * 10, my + ny * 10, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink2 });
    }

    // the weights and their lever arms about the CM
    const p1: [number, number] = [X(s.r1[0]), Y(s.r1[1])];
    const p2: [number, number] = [X(s.r2[0]), Y(s.r2[1])];
    const cmx = X(R[0]);
    const cmy = Y(R[1]);
    const rad = (mass: number) => Math.max(5, 0.075 * ppm * Math.cbrt(mass / M1));
    const r1px = rad(M1);
    const r2px = rad(m.sys.m2);
    if (gravity) {
      ctx.save();
      ctx.strokeStyle = withAlpha(p.accent, 0.85);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const yLo = Math.max(p1[1], p2[1]) + 0.5 * ppm;
      const yHi = Math.min(p1[1], p2[1]) - 0.15 * ppm;
      ctx.moveTo(cmx, yHi);
      ctx.lineTo(cmx, yLo);
      // lever arms: from the vertical through the CM to each weight's line of action
      ctx.moveTo(cmx, p1[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.moveTo(cmx, p2[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
      ctx.restore();
      const kF = (0.32 * ppm) / (M1 * G);
      const wlen = (mass: number) => Math.max(14, kF * mass * G);
      arrow(ctx, p1[0], p1[1], p1[0], p1[1] + wlen(M1), { color: p.force, width: 2, head: 8 });
      arrow(ctx, p2[0], p2[1], p2[0], p2[1] + wlen(m.sys.m2), { color: p.force, width: 2, head: 8 });
      // each label just below the tip of its own arrow, clear of the particle labels beyond the rod's ends
      haloText(ctx, p, 'm₁g', p1[0], p1[1] + wlen(M1) + fs - 2, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.force });
      haloText(ctx, p, 'm₂g', p2[0], p2[1] + wlen(m.sys.m2) + fs - 2, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.force });
      keepOff.push(
        { a: p1, b: [p1[0], p1[1] + wlen(M1) + fs + 2], r: 10 },
        { a: p2, b: [p2[0], p2[1] + wlen(m.sys.m2) + fs + 2], r: 10 },
        { a: [cmx, p1[1] - 9], b: p1, r: 4 },
        { a: [cmx, p2[1] - 9], b: p2, r: 4 },
      );
      if (Math.abs(p1[0] - cmx) > 22) haloText(ctx, p, 'x′₁', (cmx + p1[0]) / 2, p1[1] - 9, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.accent });
      if (Math.abs(p2[0] - cmx) > 22) haloText(ctx, p, 'x′₂', (cmx + p2[0]) / 2, p2[1] - 9, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.accent });
    }

    // the rod, or the spring
    if (m.sys.k) {
      const dx = p1[0] - p2[0];
      const dy = p1[1] - p2[1];
      const L = Math.hypot(dx, dy);
      const ux = dx / L;
      const uy = dy / L;
      const coils = 9;
      const amp = Math.max(3, 0.05 * ppm);
      const a0 = r2px;
      const a1 = L - r1px;
      ctx.save();
      ctx.strokeStyle = p.equip || p.ink2;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p2[0] + ux * a0, p2[1] + uy * a0);
      for (let i = 1; i < 2 * coils; i++) {
        const f = a0 + ((a1 - a0) * i) / (2 * coils);
        const sgn = i % 2 ? 1 : -1;
        ctx.lineTo(p2[0] + ux * f - uy * amp * sgn, p2[1] + uy * f + ux * amp * sgn);
      }
      ctx.lineTo(p2[0] + ux * a1, p2[1] + uy * a1);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
      ctx.restore();
    }

    // the particles, each labelled beyond its end of the rod
    const disc = (pt: [number, number], r: number, color: string) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    disc(p1, r1px, p.ink);
    disc(p2, r2px, p.ink2);
    {
      const dx = p1[0] - p2[0];
      const dy = p1[1] - p2[1];
      const L = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / L;
      const uy = dy / L;
      // where the label V will sit (past the tip of the CM's velocity arrow, drawn below)
      const kV = 0.11 * ppm;
      const vl = Math.max(1e-9, Math.hypot(V[0], V[1]));
      const vLab: [number, number] = [cmx + V[0] * kV + (V[0] / vl) * 9, cmy - V[1] * kV - (V[1] / vl) * 9];
      // each particle's label beyond its end of the rod; if it would sit on the V label, it moves to the side of the rod
      const place = (pt: [number, number], r: number, sgn: number): [number, number] => {
        const at: [number, number] = [pt[0] + sgn * ux * (r + 10), pt[1] + sgn * uy * (r + 10)];
        if (Math.hypot(at[0] - vLab[0], at[1] - vLab[1]) > 26) return at;
        const sx = -uy;
        const sy = ux;
        const side = sx * (vLab[0] - pt[0]) + sy * (vLab[1] - pt[1]) > 0 ? -1 : 1;
        return [pt[0] + side * sx * (r + 14), pt[1] + side * sy * (r + 14)];
      };
      const l1 = place(p1, r1px, 1);
      const l2 = place(p2, r2px, -1);
      haloText(ctx, p, 'm₁', l1[0], l1[1], { font: `italic 700 ${fs + 1}px ${p.fontUi}` });
      haloText(ctx, p, 'm₂', l2[0], l2[1], { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink2 });
      keepOff.push({ a: p1, b: p2, r: Math.max(r1px, r2px) }, { a: l1, b: l1, r: 9 }, { a: l2, b: l2, r: 9 });

      // the hypothetical non-central pair: perpendicular to the line, equal and opposite
      if (m.sys.shear) {
        const len = Math.max(22, 0.3 * ppm);
        // ẑ × û in the world is (−û_y, û_x); the screen flips y, so with the screen û = (ux, uy) it is (uy, −ux)
        const wx = uy;
        const wy = -ux;
        arrow(ctx, p1[0], p1[1], p1[0] + wx * len, p1[1] + wy * len, { color: p.force, width: 2.4, head: 9 });
        arrow(ctx, p2[0], p2[1], p2[0] - wx * len, p2[1] - wy * len, { color: p.force, width: 2.4, head: 9 });
        // in the top margin, between the sign glyph (left) and the reset and fullscreen buttons (right)
        handNote(ctx, narrow ? 'ניסוי מחשבתי' : 'ניסוי מחשבתי: זוג כוחות פנימי שלא לאורך הקו', (36 + view.w - 100) / 2, 15, p, narrow ? 12 : 14);
      }
    }

    // the CM: a cross, and its velocity
    {
      const c = 5;
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cmx - c, cmy - c);
      ctx.lineTo(cmx + c, cmy + c);
      ctx.moveTo(cmx - c, cmy + c);
      ctx.lineTo(cmx + c, cmy - c);
      ctx.stroke();
      ctx.restore();
      const kV = 0.11 * ppm;
      const vx = cmx + V[0] * kV;
      const vy = cmy - V[1] * kV;
      arrow(ctx, cmx, cmy, vx, vy, { color: p.velocity, width: 2, head: 8 });
      const vl = Math.max(1e-9, Math.hypot(V[0], V[1]));
      haloText(ctx, p, 'V', vx + (V[0] / vl) * 9, vy - (V[1] / vl) * 9, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.velocity });
      keepOff.push({ a: [cmx, cmy], b: [cmx, cmy], r: c + 3 }, { a: [cmx, cmy], b: [vx + (V[0] / vl) * 9, vy - (V[1] / vl) * 9], r: 4 });
    }

    // the label O, last: of eight spots around O, the one farthest from everything drawn near it (below-left on a tie)
    {
      const toSeg = (q: [number, number], a: [number, number], b: [number, number]) => {
        const abx = b[0] - a[0];
        const aby = b[1] - a[1];
        const l2 = abx * abx + aby * aby;
        const u = l2 > 0 ? clamp(((q[0] - a[0]) * abx + (q[1] - a[1]) * aby) / l2, 0, 1) : 0;
        return Math.hypot(q[0] - a[0] - u * abx, q[1] - a[1] - u * aby);
      };
      let best: [number, number] = [ox - 11, oy + 11];
      let bestScore = -Infinity;
      for (let k = 0; k < 8; k++) {
        const a = (3 * Math.PI) / 4 - (k * Math.PI) / 4; // from below-left (screen y down), round
        const q: [number, number] = [ox + 15 * Math.cos(a), oy + 15 * Math.sin(a)];
        if (q[0] < 8 || q[0] > view.w - 8 || q[1] < 8 || q[1] > worldH - 8) continue;
        const clear = keepOff.length ? Math.min(...keepOff.map((o) => toSeg(q, o.a, o.b) - o.r)) : 99;
        const score = Math.min(clear, 12) - 0.01 * k;
        if (score > bestScore) {
          bestScore = score;
          best = q;
        }
      }
      haloText(ctx, p, 'O', best[0], best[1], { font: `italic 700 ${fs + 2}px ${p.fontUi}` });
    }

    /* ---------------- the bars, below */
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, worldH);
    ctx.lineTo(view.w - 8, worldH);
    ctx.stroke();
    ctx.restore();

    const Lorb = orbitalAngularMomentum(m.sys, s, m.O);
    const Lrel = spinAngularMomentum(m.sys, s);
    const Kcm = cmKineticEnergy(m.sys, s);
    const Krel = relativeKineticEnergy(m.sys, s);
    const panelW = view.w / 2;
    const titleY = worldH + 14;
    const unitY = worldH + 14 + fs + 3;
    const areaTop = worldH + 30 + fs + 2;
    const nameY = view.h - 10;
    const areaBot = nameY - fs - 4;

    type Bar = { value: number; start: number; color: string; name: (x: number, y: number) => void };
    const panel = (x0p: number, title: string, unit: string, bars: Bar[], signedScale: boolean, maxV: number) => {
      const cxp = x0p + panelW / 2;
      heText(ctx, p, title, cxp, titleY, fs + 1, p.ink);
      haloText(ctx, p, unit, cxp, unitY, { font: `${fs - 1}px ${p.fontUi}`, color: p.ink2 });
      const margin = narrow ? 8 : 18;
      const slot = (panelW - 2 * margin) / 3;
      const bw = Math.min(30, slot * 0.42);
      const valH = fs + 4; // room for the value labels at either end
      const zeroY = signedScale ? (areaTop + areaBot) / 2 : areaBot - valH;
      const k = (zeroY - areaTop - valH) / maxV;
      // the zero line
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0p + margin * 0.6, zeroY);
      ctx.lineTo(x0p + panelW - margin * 0.6, zeroY);
      ctx.stroke();
      ctx.restore();
      bars.forEach((bar, i) => {
        const bx = x0p + margin + slot * (i + 0.5);
        const hv = bar.value * k;
        ctx.save();
        ctx.fillStyle = bar.color;
        ctx.fillRect(bx - bw / 2, Math.min(zeroY, zeroY - hv), bw, Math.abs(hv));
        ctx.restore();
        // the launch value: a thin dashed tick across the slot
        const ys = zeroY - bar.start * k;
        ctx.save();
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(bx - bw / 2 - 5, ys);
        ctx.lineTo(bx + bw / 2 + 5, ys);
        ctx.stroke();
        ctx.restore();
        const vy = hv >= 0 ? zeroY - hv - valH / 2 : zeroY - hv + valH / 2;
        haloText(ctx, p, signed(bar.value, 5e-4 * maxV), bx, vy, { font: `600 ${fs - 1}px ${p.fontUi}`, color: p.ink });
        bar.name(bx, nameY);
        if (i < 2) haloText(ctx, p, i === 0 ? '+' : '=', bx + slot / 2, signedScale ? zeroY - 10 : (areaTop + zeroY) / 2, { font: `700 ${fs + 3}px ${p.fontUi}`, color: p.ink2 });
      });
    };
    const nameFont = (txt: string) => (x: number, y: number) => haloText(ctx, p, txt, x, y, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink });
    const nameSub = (base: string, sub: string) => (x: number, y: number) => subText(ctx, p, base, sub, x, y - 2, fs + 1, p.ink);
    panel(
      0,
      'תנע זוויתי ביחס ל-O',
      'kg·m²/s',
      [
        { value: Lorb, start: m.L0[0], color: p.momentum, name: nameFont('R×MV') },
        { value: Lrel, start: m.L0[1], color: p.accent, name: nameSub('L', 'rel') },
        { value: Lorb + Lrel, start: m.L0[2], color: p.ink2, name: nameSub('L', 'O') },
      ],
      true,
      m.Lmax * 1.05,
    );
    panel(
      panelW,
      'אנרגיה קינטית',
      'J',
      [
        { value: Kcm, start: m.K0[0], color: withAlpha(p.energyK, 0.6), name: nameFont('½MV²') },
        { value: Krel, start: m.K0[1], color: p.energyK, name: nameSub('K', 'rel') },
        { value: Kcm + Krel, start: m.K0[2], color: p.ink2, name: nameFont('K') },
      ],
      false,
      m.Kmax * 1.05,
    );
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.beginPath();
    ctx.moveTo(panelW, worldH + 8);
    ctx.lineTo(panelW, view.h - 8);
    ctx.stroke();
    ctx.restore();
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: flying !== null });
  useEffect(invalidate, [setup, gravity, time, flying, model]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrowStage(isNarrow(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const change = (f: (s: Setup) => Setup) => {
    setFlying(null);
    setTime(0);
    setSetup((s) => f(s));
  };
  const scrub = (tt: number) => {
    setFlying(null);
    const t = clamp(tt, 0, T_FLIGHT);
    setTime(t);
    if (gravity) done('gravity');
    if (Math.abs(t - T_FLIGHT / 2) <= 0.03 * T_FLIGHT) done('top');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') fire();
    else return;
    e.preventDefault();
  };

  const shown = clamp(time, 0, T_FLIGHT);
  const st = model.stateAt(shown);
  const Lorb = orbitalAngularMomentum(model.sys, st, model.O);
  const Lrel = spinAngularMomentum(model.sys, st);
  const tauO = externalTorque(model.sys, st, model.O) + internalTorque(model.sys, st);
  const tauCM = internalTorque(model.sys, st); // the field's torque about the CM is zero
  const dist = Math.hypot(st.r1[0] - st.r2[0], st.r1[1] - st.r2[1]);
  const omega = currentOmega(model, shown);
  const Lscale = 1e-4 * model.Lmax;
  const label = `איור חי: משקולת, שתי מסות של ${sci(M1)} ו-${sci(setup.m2)} קילוגרם ${setup.connector === 'rod' ? 'על מוט' : 'על קפיץ'} באורך ${sci(D0)} מטר, נזרקת ומסתובבת. מרכז המסה נע בפרבולה. ${setup.pair ? 'זוג כוחות פנימי לא מרכזי מופעל, כניסוי מחשבתי. ' : ''}Enter זורק.`;

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={narrowStage ? 0.78 : 1.2}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onReset={() => {
        setSetup(initialSetup());
        setGravity(props.gravity ?? false);
        setFlying(null);
        setTime(0);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        flying ? (
          <span>המשקולת באוויר…</span>
        ) : (
          <>
            <span class="q" data-readout="t">
              t = <b>{signed(shown)} s</b>
            </span>
            <span class="q" data-readout="omega">
              ω = <b>{signed(omega, 1e-6)} rad/s</b>
            </span>
            {setup.connector === 'spring' && (
              <span class="q" data-readout="d">
                d = <b>{sci(dist)} m</b>
              </span>
            )}
            <span class="q" data-readout="Lrel">
              L<sub>rel</sub> = <b>{signed(Lrel, Lscale)} kg·m²/s</b>
            </span>
            <span class="q" data-readout="Lorb">
              R×MV = <b>{signed(Lorb, Lscale)} kg·m²/s</b>
            </span>
            <span class="q" data-readout="LO">
              L<sub>O</sub> = <b>{signed(Lorb + Lrel, Lscale)} kg·m²/s</b>
            </span>
            <span class="q" data-readout="tauO">
              τ<sub>O</sub> = <b>{signed(tauO, 1e-9)} N·m</b>
            </span>
            <span class="q" data-readout="tauCM">
              τ<sub>cm</sub> = <b>{signed(tauCM, 1e-9)} N·m</b>
            </span>
            <span class="q" data-readout="Kcm">
              ½MV² = <b>{signed(cmKineticEnergy(model.sys, st))} J</b>
            </span>
            <span class="q" data-readout="Krel">
              K<sub>rel</sub> = <b>{signed(relativeKineticEnergy(model.sys, st))} J</b>
            </span>
          </>
        )
      }
      controls={
        <>
          {props.connectorToggle && (
            <div class="group" role="group" aria-label="מה מחבר את המסות">
              <Toggle label="מוט" on={setup.connector === 'rod'} onChange={() => change((s) => ({ ...s, connector: 'rod' }))} />
              <Toggle label="קפיץ" on={setup.connector === 'spring'} onChange={() => change((s) => ({ ...s, connector: 'spring' }))} />
            </div>
          )}
          {props.pairToggle && (
            <div class="group" role="group" aria-label="ניסוי מחשבתי">
              <Toggle label="זוג לא מרכזי (ניסוי מחשבתי)" swatch="var(--force)" on={setup.pair} onChange={(on) => change((s) => ({ ...s, pair: on }))} />
            </div>
          )}
          {props.originToggle && (
            <div class="group" role="group" aria-label="הנקודה O">
              <Toggle
                label="O בנקודת הזריקה"
                on={setup.origin === 'launch'}
                onChange={() => {
                  if (setup.origin !== 'launch') done('origin');
                  setSetup((s) => ({ ...s, origin: 'launch' }));
                }}
              />
              <Toggle
                label="O מתחת לשיא"
                on={setup.origin === 'top'}
                onChange={() => {
                  if (setup.origin !== 'top') done('origin');
                  setSetup((s) => ({ ...s, origin: 'top' }));
                }}
              />
            </div>
          )}
          <Slider label="המסה m₂" value={setup.m2} min={M2_MIN} max={M2_MAX} step={0.05} format={(x) => `${sci(x)} kg`} onChange={(v) => change((s) => ({ ...s, m2: clamp(roundTo(v, 0.05), M2_MIN, M2_MAX) }))} />
          <Slider label="מהירות זוויתית בזריקה ω₀" value={setup.omega} min={W_MIN} max={W_MAX} step={1} format={(x) => `${signed(x)} rad/s`} onChange={(v) => change((s) => ({ ...s, omega: clamp(Math.round(v), W_MIN, W_MAX) }))} />
          <Slider label="זמן" value={Number(shown.toPrecision(3))} min={0} max={Number(T_FLIGHT.toPrecision(3))} step={0.002} format={(x) => `${sci(x)} s`} onChange={scrub} />
          <div class="group" role="group" aria-label="זריקה">
            <button type="button" class="btn primary" onClick={fire}>
              זרקו
            </button>
            <Toggle label="כובד וזרועות" swatch="var(--force)" on={gravity} onChange={(on) => setGravity(on)} />
          </div>
        </>
      }
    />
  );
}

/** The angular velocity of the line from particle 2 to particle 1: L_rel/(μd²) (exact for two particles). */
function currentOmega(m: Model, t: number): number {
  const s = m.stateAt(t);
  const d2 = (s.r1[0] - s.r2[0]) ** 2 + (s.r1[1] - s.r2[1]) ** 2;
  const mu = (m.sys.m1 * m.sys.m2) / (m.sys.m1 + m.sys.m2);
  return spinAngularMomentum(m.sys, s) / (mu * d2);
}
