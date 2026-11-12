/**
 * TopLab (lesson 8.8): two rotating bodies in three dimensions, drawn on a 2D canvas in an orthographic projection
 * that the learner turns by dragging (or with the arrow keys). No WebGL: the projection is the figure, so it works
 * on every screen and in still mode.
 *
 * Mode 'dumbbell' (figure 8.8א): two masses on a light rod whose centre is fixed on a vertical axle; the rod makes
 * the angle θ with the axle and everything turns at a constant ω. Drawn: ω along the axle, L about the centre
 * (perpendicular to the rod, in the plane of the rod and the axle), the cone that L sweeps, the torque τ = ω × L
 * that the axle must get, and the two bearing forces that make it, a couple, each at its bearing.
 *
 * Mode 'top' (figure 8.8ב): a gyroscope, a disc rotor on a light axle whose tip sits on a post. Drawn: the spin,
 * L about the pivot, the weight at the CM and the push of the post at the pivot, the torque of gravity about the
 * pivot, and the change of L in a short time (τ Δt) at L's tip. The axis moves by the full equations of a heavy
 * symmetric top (src/physics/top.ts, RK4): steady precession, or a start with no precession (it dips and nods).
 *
 * Every number comes from src/physics/top.ts and rigidbody.ts. Tasks tick only in the learner's own handlers
 * (sliders, buttons); a text step sets the state but never plays and never goes through a handler.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import { precessionRate } from '~/physics/rigidbody';
import {
  LAB_DUMBBELL,
  LAB_GYRO,
  bearingForce,
  discTop,
  dumbbell,
  integrateTop,
  phiDotOf,
  pivotForce,
  steadyRate,
  topAxis,
  topL,
  topStep,
  topTorque,
  type Top,
  type TopConstants,
  type TopState,
} from '~/physics/top';
import { cross3, len3, type Vec3 } from '~/physics/vec';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type TopLabMode = 'dumbbell' | 'top';
export type TopStart = 'steady' | 'release';

export interface TopLabProps {
  id: string;
  mode: TopLabMode;
  /** dumbbell: the rod from the axle; top: the axis from the upward vertical [degrees] */
  theta?: number;
  /** dumbbell: the angular velocity about the axle [rad/s] */
  omega?: number;
  /** dumbbell: draw the parts of L along and across the axle */
  parts?: boolean;
  /** top: the spin ω₃ [rad/s] */
  spin?: number;
  /** top: steady precession, or let go with no precession */
  start?: TopStart;
  /** top: slow motion (1/10) */
  slow?: boolean;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

const NARROW_W = 520;
const isNarrow = (w: number) => w > 0 && w < NARROW_W;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const rad = (d: number) => (d * Math.PI) / 180;
const degOf = (r: number) => (r * 180) / Math.PI;
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 1e-9) => (Math.abs(x) <= tiny ? '0' : sci(Number(x.toPrecision(12)), 3).replace('-', '−'));
/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside, for Hebrew task labels. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  'spin-tilted': `כשהמוט נטוי, לחצו "הפעלה" או הזיזו את זווית הסיבוב. האם ${ltr('L')} מקביל ל-${ltr('ω')}? איזה משטח הוא סורק?`,
  principal: `מצאו במחוון ${ltr('θ')} את שתי הזוויות שבהן המסבים לא צריכים להפעיל מומנט.`,
  'max-torque': `העבירו את ${ltr('θ')} ל-${ltr('45°')}. האם שם המומנט של המסבים הכי גדול?`,
  'omega-half': `הקטינו את ${ltr('ω')} לחצי, ל-${ltr('3 rad/s')}. פי כמה קטן המומנט?`,
  precess: 'לחצו "הפעלה". לאן זז הציר: למטה, או הצידה?',
  'half-spin': `הקטינו את הסיבוב העצמי לחצי, ל-${ltr('200 rad/s')}. מה קרה לקצב הנקיפה?`,
  tilt: `שנו את זווית הנטייה ${ltr('θ')} בעשר מעלות לפחות. האם קצב הנקיפה השתנה?`,
  release: 'בחרו "שחרור בלי נקיפה" ולחצו "הפעלה". מה עושה הציר בהתחלה, ומה אחר כך?',
  'no-spin': 'הורידו את הסיבוב העצמי לאפס ולחצו "הפעלה".',
};

/* ---------------------------------------------------------------- the dumbbell */

const DB = LAB_DUMBBELL;
const OMEGA_MAX = 10;
/** arrow scales, world metres per unit */
const K_OMEGA = 0.032; // per rad/s
const K_LD = 1.7; // per kg·m²/s
const K_TAU = 0.3; // per N·m
const K_F = 0.15; // per N
/** the shortest arrow drawn for a non-zero vector [m] */
const MIN_ARROW = 0.025;

/* ---------------------------------------------------------------- the gyroscope */

const GY = LAB_GYRO;
const TOP: Top = discTop(GY.M, GY.R, GY.d);
const SPIN_MAX = 600;
const THETA_TOP_MIN = 20;
const THETA_TOP_MAX = 110;
/** simulated time of a run [s], its samples */
const T_RUN = 12;
const N_RUN = 2400;
/** the axle reaches this far from the pivot [m]; the post below the pivot */
const AXLE = 0.075;
const POST = 0.1;
/** arrow scales for the top */
const K_LT = 2.4; // m per kg·m²/s
const K_TT = 0.7; // m per N·m
const K_FT = 0.032; // m per N
/** the short time over which ΔL = τ Δt is drawn at the tip of L [s] */
const DT_SHOW = 0.15;
/** the line on the rotor turns this fraction of the true spin */
const SPIN_VISUAL = 0.05;

interface TopModel {
  spin: number;
  theta0: number;
  start: TopStart;
  /** no steady precession at this spin and tilt: let go instead */
  noSteady: boolean;
  c: TopConstants;
  samples: TopState[];
  /** the fast-top rate M g d/(I₃ ω₃) (∞ with no spin) */
  omegaFast: number;
}

function topModel(spin: number, thetaDeg: number, start: TopStart): TopModel {
  const th = rad(thetaDeg);
  const steady = start === 'steady' && spin > 0 ? steadyRate(TOP, spin, th) : null;
  const noSteady = start === 'steady' && steady === null;
  const { c, samples } = integrateTop(TOP, spin, th, steady ?? 0, T_RUN, N_RUN);
  const omegaFast = spin > 0 ? precessionRate(TOP.M, TOP.d, TOP.I3, spin) : Infinity;
  return { spin, theta0: thetaDeg, start, noSteady, c, samples, omegaFast };
}

/** The state at time t: the sample before it, carried forward by RK4 substeps fine enough for the nutation. */
function topStateAt(m: TopModel, t: number): TopState {
  const h = T_RUN / N_RUN;
  const tt = clamp(t, 0, T_RUN);
  const i = Math.min(N_RUN, Math.floor(tt / h));
  let s = m.samples[i];
  const rem = tt - i * h;
  if (s.fallen || rem <= 1e-12) return s;
  const rate = Math.max(Math.abs(TOP.I3 * m.spin) / TOP.I1, Math.sqrt((TOP.M * G * TOP.d) / TOP.I1));
  const k = Math.max(1, Math.ceil((rem * rate * 40) / (2 * Math.PI)));
  for (let j = 0; j < k; j++) s = topStep(TOP, m.c, s, rem / k);
  return s;
}

/* ---------------------------------------------------------------- projection */

interface Cam {
  az: number;
  el: number;
  /** px per metre */
  s: number;
  cx: number;
  cy: number;
}

/** Orthographic view from azimuth az, elevation el: [screen x, screen y, depth toward the viewer]. */
function proj(c: Cam, p: Vec3): [number, number, number] {
  const ca = Math.cos(c.az);
  const sa = Math.sin(c.az);
  const ce = Math.cos(c.el);
  const se = Math.sin(c.el);
  const xr = -sa * p[0] + ca * p[1];
  const yu = -se * ca * p[0] - se * sa * p[1] + ce * p[2];
  const depth = ce * ca * p[0] + ce * sa * p[1] + se * p[2];
  return [c.cx + c.s * xr, c.cy - c.s * yu, depth];
}

const v3 = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** Canvas text with a paper halo (Latin and math labels), centred at (x, y). */
function haloText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center') {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Hebrew canvas text (right-to-left), with a halo, centred at (x, y). */
function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.font = `600 ${size}px ${p.fontUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** A polyline through projected world points. */
function path3(ctx: CanvasRenderingContext2D, c: Cam, pts: Vec3[], color: string, width: number, dash: number[] = []) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach((q, i) => {
    const [x, y] = proj(c, q);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

/** A circle in 3D: centre, radius, and two unit vectors spanning its plane. */
function circle3(centre: Vec3, R: number, e1: Vec3, e2: Vec3, n = 64): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * i) / n;
    out.push(v3(v3(centre, e1, R * Math.cos(a)), e2, R * Math.sin(a)));
  }
  return out;
}

/** Two unit vectors perpendicular to the unit vector n (and to each other). */
function basisAround(n: Vec3): [Vec3, Vec3] {
  const t: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const a = cross3(n, t);
  const la = len3(a);
  const e1: Vec3 = [a[0] / la, a[1] / la, a[2] / la];
  return [e1, cross3(n, e1)];
}

/**
 * A world vector drawn as an arrow from `from`, scaled by k, never shorter than MIN_ARROW (in the world) when it is
 * not zero. Returns the screen tip and the screen unit direction (for the label), or null for a zero vector.
 */
function arrow3(ctx: CanvasRenderingContext2D, c: Cam, from: Vec3, v: Vec3, k: number, color: string, width = 2.4, minLen = MIN_ARROW) {
  const L = len3(v);
  if (L * k < 1e-6) return null;
  const len = Math.max(L * k, minLen);
  const tipW = v3(from, v, len / L);
  const [x1, y1] = proj(c, from);
  const [x2, y2] = proj(c, tipW);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l = Math.hypot(dx, dy);
  if (l < 3) {
    // along the line of sight: a ring with a dot (toward the viewer) or a cross (away)
    const toward = proj(c, tipW)[2] > proj(c, from)[2];
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(x1, y1, 7, 0, Math.PI * 2);
    ctx.stroke();
    if (toward) {
      ctx.beginPath();
      ctx.arc(x1, y1, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x1 - 4.5, y1 - 4.5);
      ctx.lineTo(x1 + 4.5, y1 + 4.5);
      ctx.moveTo(x1 - 4.5, y1 + 4.5);
      ctx.lineTo(x1 + 4.5, y1 - 4.5);
      ctx.stroke();
    }
    ctx.restore();
    return { tip: [x1 + 10, y1 - 10] as [number, number], u: [0.7, -0.7] as [number, number] };
  }
  arrow(ctx, x1, y1, x2, y2, { color, width, head: Math.min(11, 4 + width * 2.4) });
  return { tip: [x2, y2] as [number, number], u: [dx / l, dy / l] as [number, number] };
}

/** A shaded ball. */
function ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, p: Palette) {
  ctx.save();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
  g.addColorStop(0, withAlpha(p.paper, 0.95));
  g.addColorStop(0.35, color);
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(p.ink, 0.35);
  ctx.stroke();
  ctx.restore();
}

/** The axes triad in a corner: x, y, z as they point in the current view. */
function triad(ctx: CanvasRenderingContext2D, c: Cam, p: Palette, x: number, y: number, size: number, fs: number) {
  const c0: Cam = { ...c, s: size, cx: x, cy: y };
  const axes: [Vec3, string][] = [
    [[1, 0, 0], 'x'],
    [[0, 1, 0], 'y'],
    [[0, 0, 1], 'z'],
  ];
  for (const [e, name] of axes) {
    const [ex, ey] = proj(c0, e);
    arrow(ctx, x, y, ex, ey, { color: p.ink3, width: 1.3, head: 6 });
    const dx = ex - x;
    const dy = ey - y;
    const l = Math.max(1, Math.hypot(dx, dy));
    haloText(ctx, p, name, ex + (dx / l) * 8, ey + (dy / l) * 8, `italic 600 ${fs}px ${p.fontUi}`, p.ink2);
  }
}

/** Label beyond the tip of an arrow, pushed out along it. */
function tipLabel(ctx: CanvasRenderingContext2D, p: Palette, a: { tip: [number, number]; u: [number, number] } | null, s: string, color: string, fs: number, push = 11) {
  if (!a) return;
  haloText(ctx, p, s, a.tip[0] + a.u[0] * push, a.tip[1] + a.u[1] * push, `italic 700 ${fs}px ${p.fontUi}`, color);
}

/** The view a figure starts in (and returns to on reset): azimuth 32°, elevation 15° (dumbbell) or 17° (top). */
const defaultView = (isTop: boolean) => ({ az: rad(isTop ? -120 : 32), el: rad(isTop ? 18 : 15) });

/* ---------------------------------------------------------------- the component */

export default function TopLab(props: TopLabProps) {
  const isTop = props.mode === 'top';
  const init = {
    theta: isTop ? clamp(props.theta ?? 60, THETA_TOP_MIN, THETA_TOP_MAX) : clamp(props.theta ?? 35, 0, 90),
    omega: clamp(props.omega ?? 6, 0, OMEGA_MAX),
    parts: props.parts ?? false,
    spin: clamp(props.spin ?? 400, 0, SPIN_MAX),
    start: props.start ?? ('steady' as TopStart),
    slow: props.slow ?? false,
  };
  const [theta, setTheta] = useState(init.theta);
  const [omega, setOmega] = useState(init.omega);
  const [parts, setParts] = useState(init.parts);
  const [spin, setSpin] = useState(init.spin);
  const [start, setStart] = useState<TopStart>(init.start);
  const [slow, setSlow] = useState(init.slow);
  /** dumbbell: the rotation angle shown [rad]; top: the time shown [s] */
  const [phase, setPhase] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState(() => defaultView(isTop));
  const [live, setLive] = useState('');
  const [narrowStage, setNarrowStage] = useState(false);
  const t0 = useRef<number | null>(null);
  const base = useRef(0);
  const drag = useRef<{ x: number; y: number; az: number; el: number } | null>(null);
  const visitedPrincipal = useRef<{ zero: boolean; right: boolean }>({ zero: false, right: false });
  /** the instant last drawn (rotation angle or time), so a stop keeps what is on the screen */
  const lastShown = useRef(0);

  const model = useMemo(() => (isTop ? topModel(spin, theta, start) : null), [isTop, spin, theta, start]);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setPlaying(false);
        t0.current = null;
        const th = num(st.theta);
        if (th !== null) setTheta(isTop ? clamp(th, THETA_TOP_MIN, THETA_TOP_MAX) : clamp(th, 0, 90));
        const w = num(st.omega);
        if (w !== null) setOmega(clamp(w, 0, OMEGA_MAX));
        const pa = bool(st.parts);
        if (pa !== null) setParts(pa);
        const sp = num(st.spin);
        if (sp !== null) setSpin(clamp(sp, 0, SPIN_MAX));
        if (st.start === 'steady' || st.start === 'release') setStart(st.start);
        const sl = bool(st.slow);
        if (sl !== null) setSlow(sl);
        const ph = num(st.phase);
        setPhase(ph !== null ? rad(ph) : 0);
        const tt = num(st.t);
        setTime(tt !== null ? clamp(tt, 0, T_RUN) : 0);
        const az = num(st.az);
        const el = num(st.el);
        if (az !== null || el !== null) setView((v) => ({ az: az !== null ? rad(az) : v.az, el: el !== null ? rad(el) : v.el }));
      }),
    [props.id],
  );

  /** the instant shown now (dumbbell: rotation angle; top: time), advancing while playing */
  const nowOf = (t: number): number => {
    if (!playing) return isTop ? time : phase;
    if (t0.current === null) t0.current = t;
    const dt = t - t0.current;
    if (isTop) return Math.min(T_RUN, base.current + dt * (slow ? 0.1 : 1));
    return base.current + omega * dt;
  };

  const draw = ({ ctx, view: vw, palette: p, t }: FrameInfo) => {
    const narrow = isNarrow(vw.w);
    const fs = narrow ? 11 : 13;
    const now = nowOf(t);
    lastShown.current = now;
    if (isTop && playing && now >= T_RUN) {
      setPlaying(false);
      setTime(T_RUN);
    }
    if (isTop && model) drawTop(ctx, vw.w, vw.h, p, fs, narrow, model, now);
    else drawDumbbell(ctx, vw.w, vw.h, p, fs, narrow, now);
  };

  const camFor = (w: number, h: number, span: number, cyFrac: number): Cam => ({
    az: view.az,
    el: view.el,
    s: Math.min(w, h * 1.05) / span,
    cx: w / 2,
    cy: h * cyFrac,
  });

  function drawDumbbell(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, fs: number, narrow: boolean, ph: number) {
    const c = camFor(w, h, narrow ? 0.85 : 0.9, 0.5);
    const th = rad(theta);
    const d = dumbbell(DB.m, DB.r, th, omega);
    const u: Vec3 = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
    const O: Vec3 = [0, 0, 0];
    const top: Vec3 = [DB.r * u[0], DB.r * u[1], DB.r * u[2]];
    const bot: Vec3 = mul(top, -1);
    // L = 2mr²ω (ẑ − cos θ û): perpendicular to the rod, in the plane of the rod and the axle
    const k = 2 * DB.m * DB.r * DB.r * omega;
    const Lv: Vec3 = [-k * Math.cos(th) * u[0], -k * Math.cos(th) * u[1], k - k * Math.cos(th) * u[2]];
    const wv: Vec3 = [0, 0, omega];
    const tau = cross3(wv, Lv);
    const ex: Vec3 = [1, 0, 0];
    const ey: Vec3 = [0, 1, 0];

    // the floor ring under the axle and the circles the masses travel (dashed)
    const zFloor = -DB.H - 0.06;
    path3(ctx, c, circle3([0, 0, zFloor], 0.2, ex, ey), withAlpha(p.ink3, 0.5), 1, [3, 5]);
    if (Math.sin(th) > 1e-3) {
      path3(ctx, c, circle3([0, 0, top[2]], DB.r * Math.sin(th), ex, ey), withAlpha(p.ink3, 0.8), 1.1, [4, 4]);
      path3(ctx, c, circle3([0, 0, bot[2]], DB.r * Math.sin(th), ex, ey), withAlpha(p.ink3, 0.8), 1.1, [4, 4]);
    }

    // the axle and its two bearings (the bearings are fixed; the axle turns in them)
    path3(ctx, c, [[0, 0, zFloor], [0, 0, DB.H + 0.07]], p.ink2, 3);
    for (const z of [DB.H, -DB.H]) {
      const pts = circle3([0, 0, z], 0.03, ex, ey, 32);
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.35);
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((q, i) => {
        const [x, y] = proj(c, q);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // the cone that L sweeps: the circle of its tip
    const Llen = Math.max(len3(Lv) * K_LD, len3(Lv) > 0 ? MIN_ARROW : 0);
    const Lscale = len3(Lv) > 0 ? Llen / len3(Lv) : 0;
    if (d.Lperp * Lscale > 0.004) {
      const tipCircle = circle3([0, 0, d.Lz * Lscale], d.Lperp * Lscale, ex, ey);
      path3(ctx, c, tipCircle, withAlpha(p.momentum, 0.55), 1.3, [5, 4]);
    }

    // the rod and the masses, back to front
    const [tx, ty, tz] = proj(c, top);
    const [bx, by, bz] = proj(c, bot);
    const [ox, oy] = proj(c, O);
    const R = Math.max(7, 0.035 * c.s);
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();
    const balls: [number, number, number][] = [
      [tx, ty, tz],
      [bx, by, bz],
    ];
    balls.sort((a, b) => a[2] - b[2]).forEach(([x, y]) => ball(ctx, x, y, R, p.ink2, p));
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(ox, oy, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // the parts of L along and across the axle
    if (parts && len3(Lv) > 0) {
      const Lt = mul(Lv, Lscale);
      const along: Vec3 = [0, 0, Lt[2]];
      path3(ctx, c, [O, along], withAlpha(p.momentum, 0.8), 1.4, [3, 3]);
      path3(ctx, c, [along, Lt], withAlpha(p.momentum, 0.8), 1.4, [3, 3]);
      const [ax, ay] = proj(c, along);
      if (d.Lz * Lscale > 0.02) haloText(ctx, p, 'L_z', ax - 16, ay, `italic 600 ${fs - 1}px ${p.fontUi}`, p.momentum);
      const mid = proj(c, v3(along, mul(v3(Lt, along, -1), 0.5)));
      if (d.Lperp * Lscale > 0.02) haloText(ctx, p, 'L⊥', mid[0], mid[1] - 10, `italic 600 ${fs - 1}px ${p.fontUi}`, p.momentum);
    }

    // ω along the axle, L about the centre, τ = ω × L at the centre. L (the longer, wider arrow) goes under ω, so on a
    // principal axis (L ∥ ω, θ = 90°) ω still shows on top of it, and ω's name moves beside the shaft.
    const parallel = len3(Lv) > 0 && len3(cross3(wv, Lv)) < 0.05 * len3(wv) * len3(Lv);
    const aL = arrow3(ctx, c, O, Lv, K_LD, p.momentum, 3.6);
    tipLabel(ctx, p, aL, 'L', p.momentum, fs + 2);
    const aw = arrow3(ctx, c, O, wv, K_OMEGA, p.velocity, 2.2);
    if (parallel && aw) haloText(ctx, p, 'ω', aw.tip[0] - aw.u[1] * 14, aw.tip[1] + aw.u[0] * 14, `italic 700 ${fs + 2}px ${p.fontUi}`, p.velocity);
    else tipLabel(ctx, p, aw, 'ω', p.velocity, fs + 2, 10);
    const aT = arrow3(ctx, c, O, tau, K_TAU, p.force, 2.6);
    tipLabel(ctx, p, aT, 'τ', p.force, fs + 2);

    // the bearing forces on the axle: a couple, F at the top bearing and −F at the bottom one
    const F = d.tau > 1e-9 ? bearingForce(d.tau, 2 * DB.H) : 0;
    /** the screen side (+1 right, −1 left) each bearing force points to, so the bearing's name goes on the other side */
    let side = 1;
    if (F > 0) {
      // τ = 2H ẑ × F_top, so F_top = (τ × ẑ)/(2H)
      const Ft = mul(cross3(tau, [0, 0, 1]), 1 / (2 * DB.H));
      const a1 = arrow3(ctx, c, [0, 0, DB.H], Ft, K_F, p.force, 2);
      tipLabel(ctx, p, a1, 'F', p.force, fs);
      const a2 = arrow3(ctx, c, [0, 0, -DB.H], mul(Ft, -1), K_F, p.force, 2);
      tipLabel(ctx, p, a2, '−F', p.force, fs);
      if (a1) side = a1.u[0] >= 0 ? 1 : -1;
    }
    // the bearings' names, on the side away from their forces
    {
      const off = narrow ? 26 : 32;
      const [x, y] = proj(c, [0, 0, DB.H]);
      heText(ctx, p, 'מסב', x - side * off, y - 12, fs - 1, p.equip);
      const [x2, y2] = proj(c, [0, 0, -DB.H]);
      heText(ctx, p, 'מסב', x2 + side * off, y2 + 12, fs - 1, p.equip);
    }
    triad(ctx, c, p, 30, h - 30, narrow ? 16 : 20, fs - 1);
    if (theta > 0 && theta < 90 && omega > 0) return;
    // on a principal axis: a note
    const note = omega === 0 ? 'ω = 0' : theta === 0 ? 'L = 0' : 'L || ω'; // the UI font has no ∥ glyph (it drew a box)
    // top-left, clear of the L and ω arrows on the axle (top centre) and of the buttons (top right)
    haloText(ctx, p, note, 52, 18, `600 ${fs + 1}px ${p.fontUi}`, p.hand);
  }

  function drawTop(ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, fs: number, narrow: boolean, m: TopModel, now: number) {
    const c = camFor(w, h, narrow ? 0.25 : 0.26, 0.5);
    const s = topStateAt(m, now);
    const e3 = topAxis(s);
    const P: Vec3 = [0, 0, 0];
    const cm: Vec3 = mul(e3, TOP.d);
    const ex: Vec3 = [1, 0, 0];
    const ey: Vec3 = [0, 1, 0];

    // the floor ring and the post
    path3(ctx, c, circle3([0, 0, -POST], 0.06, ex, ey), withAlpha(p.ink3, 0.6), 1, [3, 4]);
    path3(ctx, c, [[0, 0, -POST], P], p.equip, 4);

    // the path of the axle's tip so far (the last 4 s)
    const h0 = T_RUN / N_RUN;
    const iNow = Math.floor(clamp(now, 0, T_RUN) / h0);
    const from = Math.max(0, iNow - Math.round(4 / h0));
    const trail: Vec3[] = [];
    for (let i = from; i <= iNow; i++) trail.push(mul(topAxis(m.samples[i]), AXLE));
    trail.push(mul(e3, AXLE));
    path3(ctx, c, trail, withAlpha(p.ink3, 0.9), 1.2);
    // the horizontal circle of steady precession, dashed, at the tilt it started with
    {
      const th0 = rad(m.theta0);
      path3(ctx, c, circle3([0, 0, AXLE * Math.cos(th0)], AXLE * Math.sin(th0), ex, ey), withAlpha(p.ink3, 0.5), 1, [3, 5]);
    }

    // the axle, and the rotor: a disc at the CM, perpendicular to the axle, with a line that turns with the spin
    path3(ctx, c, [P, mul(e3, AXLE)], p.ink, 2.4);
    const [e1, e2] = basisAround(e3);
    const rim = circle3(cm, GY.R, e1, e2, 48);
    ctx.save();
    ctx.fillStyle = withAlpha(p.ink2, 0.22);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    rim.forEach((q, i) => {
      const [x, y] = proj(c, q);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    const psi = SPIN_VISUAL * m.spin * now;
    const spoke = v3(mul(e1, Math.cos(psi)), e2, Math.sin(psi));
    path3(ctx, c, [v3(cm, spoke, -GY.R), v3(cm, spoke, GY.R)], p.ink2, 1.6);
    // the sense of the spin: a small curved arrow round the axle beyond the rotor
    if (m.spin > 0) {
      const ring: Vec3[] = [];
      const cc = mul(e3, AXLE + 0.004);
      for (let i = 0; i <= 20; i++) {
        const a = -0.2 + (1.5 * Math.PI * i) / 20;
        ring.push(v3(v3(cc, e1, 0.011 * Math.cos(a)), e2, 0.011 * Math.sin(a)));
      }
      path3(ctx, c, ring, p.velocity, 1.8);
      const [x1, y1] = proj(c, ring[ring.length - 2]);
      const [x2, y2] = proj(c, ring[ring.length - 1]);
      const l = Math.max(1e-6, Math.hypot(x2 - x1, y2 - y1));
      arrow(ctx, x2 - ((x2 - x1) / l) * 6, y2 - ((y2 - y1) / l) * 6, x2 + ((x2 - x1) / l) * 2, y2 + ((y2 - y1) / l) * 2, { color: p.velocity, width: 1.8, head: 7 });
      const [lx, ly] = proj(c, v3(cc, e3, 0.016));
      haloText(ctx, p, 'ω₃', lx, ly, `italic 700 ${fs}px ${p.fontUi}`, p.velocity);
    }

    // the pivot
    {
      const [x, y] = proj(c, P);
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      haloText(ctx, p, 'P', x - 12, y + 4, `italic 700 ${fs}px ${p.fontUi}`, p.ink);
    }

    // forces: the weight at the CM, the push of the post at the pivot (each on the gyroscope, at its point)
    const Wv: Vec3 = [0, 0, -TOP.M * G];
    const aW = arrow3(ctx, c, cm, Wv, K_FT, p.force, 2.2, 0.012);
    tipLabel(ctx, p, aW, 'Mg', p.force, fs);
    const Fp = s.fallen ? ([0, 0, TOP.M * G] as Vec3) : pivotForce(TOP, m.c, s);
    const aN = arrow3(ctx, c, P, Fp, K_FT, p.force, 2.2, 0.012);
    tipLabel(ctx, p, aN, 'N', p.force, fs);

    // L about the pivot, τ of gravity about the pivot, and ΔL = τ Δt at the tip of L
    const L = s.fallen ? ([0, 0, 0] as Vec3) : topL(TOP, m.c, s);
    const aL = arrow3(ctx, c, P, L, K_LT, p.momentum, 3);
    tipLabel(ctx, p, aL, 'L', p.momentum, fs + 2, 12);
    const tau = topTorque(TOP, s);
    const aT = arrow3(ctx, c, P, tau, K_TT, p.force, 2.6, 0.012);
    tipLabel(ctx, p, aT, 'τ', p.force, fs + 2);
    if (!s.fallen && len3(L) > 1e-9) {
      const tipL = mul(L, K_LT);
      const dL = mul(tau, DT_SHOW);
      const a = arrow3(ctx, c, tipL, dL, K_LT, withAlpha(p.momentum, 0.85), 2, 0.008);
      tipLabel(ctx, p, a, 'ΔL', p.momentum, fs, 14);
    }

    triad(ctx, c, p, 30, h - 30, narrow ? 16 : 20, fs - 1);
    if (s.fallen) heText(ctx, p, 'בלי סיבוב עצמי הג׳ירוסקופ נופל', w / 2, 18, fs + 1, p.hand);
    else if (m.noSteady) heText(ctx, p, 'בסיבוב כזה אין נקיפה יציבה: משחררים בלי נקיפה', w / 2, 18, fs, p.hand);
  }

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: playing });
  useEffect(invalidate, [theta, omega, parts, spin, start, slow, phase, time, playing, view, model]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrowStage(isNarrow(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------------- handlers (the learner's own: only these tick tasks) */

  const play = () => {
    if (playing) {
      // stop: keep the instant shown
      const shown = lastShown.current;
      if (isTop) setTime(shown);
      else setPhase(shown);
      setPlaying(false);
      setLive('עצרתם.');
      return;
    }
    if (isTop) {
      if (spin > 0 && start === 'steady') done('precess');
      if (start === 'release') done('release');
      if (spin === 0) done('no-spin');
      const from = time >= T_RUN - 1e-9 ? 0 : time;
      if (!motionAllowed()) {
        // still mode: show a later instant instead of a motion
        const Om = Number.isFinite(model?.omegaFast ?? Infinity) ? (model?.omegaFast ?? 1) : 1;
        setTime(clamp(from + Math.min(T_RUN / 4, Math.PI / 2 / Om), 0, T_RUN));
        setLive('תנועה מושבתת: האיור קפץ לרגע מאוחר יותר.');
        return;
      }
      base.current = from;
    } else {
      if (theta >= 5 && theta <= 85 && omega > 0) done('spin-tilted');
      if (!motionAllowed()) {
        setPhase((ph) => ph + Math.PI / 2);
        setLive('תנועה מושבתת: המשקולת הסתובבה רבע סיבוב.');
        return;
      }
      base.current = phase;
    }
    t0.current = null;
    setPlaying(true);
    setLive(isTop ? 'הג׳ירוסקופ בתנועה.' : 'המשקולת מסתובבת.');
  };
  const halt = () => {
    if (playing) {
      if (isTop) setTime(lastShown.current);
      else setPhase(lastShown.current);
      setPlaying(false);
    }
  };

  const onThetaDumbbell = (v: number) => {
    halt();
    const th = clamp(Math.round(v), 0, 90);
    setTheta(th);
    if (omega > 0) {
      if (th === 0) visitedPrincipal.current.zero = true;
      if (th === 90) visitedPrincipal.current.right = true;
      if (visitedPrincipal.current.zero && visitedPrincipal.current.right) done('principal');
      if (th === 45) done('max-torque');
    }
  };
  const onOmega = (v: number) => {
    const wv = clamp(Math.round(v * 2) / 2, 0, OMEGA_MAX);
    if (playing) {
      // keep the rotation continuous: restart the clock from the angle shown
      base.current = lastShown.current;
      t0.current = null;
    }
    setOmega(wv);
    if (wv === 3) done('omega-half');
  };
  const onPhase = (v: number) => {
    halt();
    setPhase(rad(v));
    if (theta >= 5 && theta <= 85 && omega > 0) done('spin-tilted');
  };
  const onSpin = (v: number) => {
    halt();
    const sp = clamp(Math.round(v / 10) * 10, 0, SPIN_MAX);
    setSpin(sp);
    setTime(0);
    if (sp === 200) done('half-spin');
  };
  const onThetaTop = (v: number) => {
    halt();
    const th = clamp(Math.round(v), THETA_TOP_MIN, THETA_TOP_MAX);
    setTheta(th);
    setTime(0);
    if (Math.abs(th - init.theta) >= 10) done('tilt');
  };
  const onTime = (v: number) => {
    halt();
    setTime(clamp(v, 0, T_RUN));
  };

  /* ---------------- dragging turns the view */

  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, az: view.az, el: view.el };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const az = d.az - (e.clientX - d.x) * 0.01;
    const el = clamp(d.el + (e.clientY - d.y) * 0.01, -0.35, 1.45);
    setView({ az, el });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setView((v) => ({ ...v, az: v.az + 0.1 }));
    else if (e.key === 'ArrowRight') setView((v) => ({ ...v, az: v.az - 0.1 }));
    else if (e.key === 'ArrowUp') setView((v) => ({ ...v, el: clamp(v.el + 0.1, -0.35, 1.45) }));
    else if (e.key === 'ArrowDown') setView((v) => ({ ...v, el: clamp(v.el - 0.1, -0.35, 1.45) }));
    else if (e.key === 'Enter' || e.key === ' ') play();
    else return;
    e.preventDefault();
  };

  /* ---------------- readouts (of the instant shown when stopped) */

  const reset = () => {
    setTheta(init.theta);
    setOmega(init.omega);
    setParts(init.parts);
    setSpin(init.spin);
    setStart(init.start);
    setSlow(init.slow);
    setPhase(0);
    setTime(0);
    setPlaying(false);
    setView(defaultView(isTop));
    visitedPrincipal.current = { zero: false, right: false };
    setLive('האיור חזר למצב ההתחלה.');
  };

  let readout;
  let controls;
  let label: string;
  if (!isTop) {
    const d = dumbbell(DB.m, DB.r, rad(theta), omega);
    const F = bearingForce(d.tau, 2 * DB.H);
    label = `איור חי בתלת-ממד: משקולת על ציר אנכי, המוט נטוי ${theta} מעלות לציר, מהירות זוויתית ${sci(omega)} רדיאנים לשנייה. התנע הזוויתי ${sci(d.L)}, והמומנט שהמסבים מפעילים ${sci(d.tau)} ניוטון-מטר. גררו כדי לסובב את נקודת המבט; Enter מפעיל.`;
    readout = (
      <>
        <span class="q" data-readout="L">
          |L| = <b>{signed(d.L, 1e-12)} kg·m²/s</b>
        </span>
        <span class="q" data-readout="Lz">
          L<sub>z</sub> = <b>{signed(d.Lz, 1e-12)} kg·m²/s</b>
        </span>
        <span class="q" data-readout="Lperp">
          L<sub>⊥</sub> = <b>{signed(d.Lperp, 1e-12)} kg·m²/s</b>
        </span>
        <span class="q" data-readout="angle">
          ∠(L, ω) = <b>{d.L > 1e-12 ? `${signed(degOf(d.angle), 1e-9)}°` : '—'}</b>
        </span>
        <span class="q" data-readout="tau">
          τ = ωL<sub>⊥</sub> = <b>{signed(d.tau, 1e-12)} N·m</b>
        </span>
        <span class="q" data-readout="F">
          F = <b>{signed(F, 1e-12)} N</b>
        </span>
      </>
    );
    controls = (
      <>
        <Slider label="זווית המוט מהציר θ" value={theta} min={0} max={90} step={1} format={(x) => `${Math.round(x)}°`} onChange={onThetaDumbbell} />
        <Slider label="מהירות זוויתית ω" value={omega} min={0} max={OMEGA_MAX} step={0.5} format={(x) => `${sci(x)} rad/s`} onChange={onOmega} />
        <Slider label="זווית הסיבוב" value={Math.round(((degOf(phase) % 360) + 360) % 360)} min={0} max={360} step={1} format={(x) => `${Math.round(x)}°`} onChange={onPhase} />
        <div class="group" role="group" aria-label="תנועה ותצוגה">
          <button type="button" class="btn primary" onClick={play}>
            {playing ? 'עצירה' : 'הפעלה'}
          </button>
          <Toggle label="רכיבים של L" swatch="var(--momentum)" on={parts} onChange={(on) => setParts(on)} />
        </div>
      </>
    );
  } else {
    const m = model!;
    const s = topStateAt(m, time);
    const tauNow = TOP.M * G * TOP.d * Math.sin(s.theta);
    const OmNow = s.fallen ? 0 : phiDotOf(TOP, m.c, s.theta);
    const Fz = s.fallen ? TOP.M * G : pivotForce(TOP, m.c, s)[2];
    label = `איור חי בתלת-ממד: ג׳ירוסקופ על עמוד, סיבוב עצמי ${sci(spin)} רדיאנים לשנייה, ציר נטוי ${theta} מעלות מהאנך. קצב הנקיפה של סביבון מהיר ${Number.isFinite(m.omegaFast) ? sci(m.omegaFast) : 'אינסופי'} רדיאנים לשנייה. גררו כדי לסובב את נקודת המבט; Enter מפעיל.`;
    const atInstant = playing ? (
      <span>הג׳ירוסקופ בתנועה…</span>
    ) : (
      <>
        <span class="q" data-readout="t">
          t = <b>{signed(time, 1e-9)} s</b>
        </span>
        <span class="q" data-readout="tau">
          τ = <b>{signed(tauNow, 1e-12)} N·m</b>
        </span>
        <span class="q" data-readout="Omega">
          φ̇ = <b>{signed(OmNow, 1e-9)} rad/s</b>
        </span>
        <span class="q" data-readout="theta">
          θ = <b>{signed(degOf(s.theta), 1e-9)}°</b>
        </span>
        <span class="q" data-readout="N">
          N<sub>z</sub> = <b>{s.fallen ? '—' : `${signed(Fz, 1e-12)} N`}</b>
        </span>
      </>
    );
    readout = (
      <>
        <span class="q" data-readout="L">
          I₃ω₃ = <b>{signed(TOP.I3 * spin, 1e-12)} kg·m²/s</b>
        </span>
        <span class="q" data-readout="OmegaFast">
          Mgd/(I₃ω₃) = <b>{Number.isFinite(m.omegaFast) ? `${signed(m.omegaFast)} rad/s` : '—'}</b>
        </span>
        <span class="q" data-readout="Tp">
          2π/Ω = <b>{Number.isFinite(m.omegaFast) ? `${signed((2 * Math.PI) / m.omegaFast)} s` : '—'}</b>
        </span>
        {atInstant}
      </>
    );
    controls = (
      <>
        <Slider label="סיבוב עצמי ω₃" value={spin} min={0} max={SPIN_MAX} step={10} format={(x) => `${Math.round(x)} rad/s`} onChange={onSpin} />
        <Slider label="נטיית הציר מהאנך θ" value={theta} min={THETA_TOP_MIN} max={THETA_TOP_MAX} step={1} format={(x) => `${Math.round(x)}°`} onChange={onThetaTop} />
        <Slider label="זמן" value={Number(time.toPrecision(4))} min={0} max={T_RUN} step={0.01} format={(x) => `${sci(x)} s`} onChange={onTime} />
        <div class="group" role="group" aria-label="איך מתחילים">
          <Toggle
            label="נקיפה יציבה"
            on={start === 'steady'}
            onChange={() => {
              halt();
              setStart('steady');
              setTime(0);
            }}
          />
          <Toggle
            label="שחרור בלי נקיפה"
            on={start === 'release'}
            onChange={() => {
              halt();
              setStart('release');
              setTime(0);
            }}
          />
        </div>
        <div class="group" role="group" aria-label="תנועה">
          <button type="button" class="btn primary" onClick={play}>
            {playing ? 'עצירה' : 'הפעלה'}
          </button>
          <Toggle label="הילוך איטי (פי 10)" on={slow} onChange={(on) => {
            if (playing) {
              base.current = lastShown.current;
              t0.current = null;
            }
            setSlow(on);
          }} />
        </div>
      </>
    );
  }

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={narrowStage ? 0.82 : isTop ? 1.3 : 1.15}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor="grab"
      onReset={reset}
      readout={readout}
      controls={controls}
    />
  );
}
