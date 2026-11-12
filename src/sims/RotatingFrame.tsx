/**
 * RotatingFrame (lesson 7.3): one puck sliding on a frictionless turntable, seen from two frames at once. In the
 * room S (the inertial frame) the turntable turns at ω and the puck, on which no horizontal force acts, moves on a
 * straight line. In the turntable frame S′ the turntable is at rest, the painted line on it is the fixed +x′ axis,
 * and the same puck moves on a curve, pushed by two fictitious forces drawn on it: the centrifugal force −mω×(ω×r′)
 * (ω²ρ per unit mass, away from the axis) and the Coriolis force −2mω×v′ (2ωv′ per unit mass, perpendicular to v′:
 * to the right of the motion when ω > 0, counter-clockwise seen from above).
 *
 * Physics: src/physics/carousel.ts (launch, exitTime, integrateRotating, freeLineSeenRotating) on top of
 * src/physics/rotating.ts. The S′ path is integrated with `stepNonInertial` (RK4) and checked against `toRotating`
 * of the straight line; the largest difference is a readout. ½v′² − ½ω²ρ² is a readout too: it stays constant,
 * because the Coriolis force does no work.
 *
 * Props (Astro wrapper: <Spread fig="fig-7-3a" figure={RotatingFrame} figureProps={{ … }}>)
 *   omega  angular velocity of the turntable [rad/s], −1.5…1.5 (> 0 counter-clockwise from above)  (default 1.0)
 *   rho0   launch distance from the centre, along the painted line [m], 0…0.8                     (default 0)
 *   speed  launch speed relative to the turntable [m/s], 0…1                                       (default 0.4)
 *   angle  launch direction relative to the painted line, counter-clockwise [deg], −180…180       (default 0)
 *   tasks  task ids to show (below)
 *
 * Step `set` keys: omega, rho0, speed, angle, prog (fraction of the path shown, 0…1), exact (dots of the exact path).
 *
 * Tasks tick only inside the learner's own launch handler (the "שגרו" button); a text step sets the state and the
 * instant shown and never launches, so scrolling through the text completes nothing.
 *   centre   launch from the centre (ρ₀ = 0) with u > 0 while the turntable turns
 *   release  launch with u = 0 from ρ₀ > 0 while the turntable turns (a string cut)
 *   reverse  launch with u > 0 while the turntable turns clockwise (ω < 0)
 *   still    launch with u > 0 while the turntable is at rest (ω = 0)
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  centrifugalPerMass,
  coriolisPerMass,
  exitTime,
  freeLine,
  freeLineSeenRotating,
  integrateRotating,
  launchInertial,
  launchRotating,
  type PathSample,
} from '~/physics/carousel';
import { jacobiIntegral, type State3 } from '~/physics/rotating';
import { len3, sub3, type Vec3 } from '~/physics/vec';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/** turntable radius [m] */
const R_T = 1;
/** the world half-width each panel shows [m] */
const VIEW = 1.24;
/** longest motion shown [s] (a puck at rest at the centre never leaves) */
const T_MAX = 10;
/** integration step [s] */
const DT = 1 / 240;
const OMEGA_MAX = 1.5;
const RHO_MAX = 0.8;
const U_MAX = 1;
const deg = Math.PI / 180;

const TASK_LABEL: Record<string, string> = {
  centre: 'שגרו את הדיסקית מהמרכז כשהפטיפון מסתובב. השוו את המסלול בשני החלונות.',
  release: 'קבעו מהירות שיגור אפס ומרחק מהמרכז שאינו אפס, ושגרו: הדיסקית משתחררת כמו מחוט שנקרע. איך היא נעה בכל חלון?',
  reverse: 'הפכו את כיוון הסיבוב (ω שלילית) ושגרו. לאיזה צד של כיוון התנועה הדיסקית מוסטת עכשיו?',
  still: 'עצרו את הפטיפון (ω = 0) ושגרו. מה ההבדל בין שני החלונות עכשיו?',
};

export interface RotatingFrameProps {
  id: string;
  omega?: number;
  rho0?: number;
  speed?: number;
  angle?: number;
  tasks?: string[];
}

interface Setup {
  omega: number;
  rho0: number;
  speed: number;
  /** degrees */
  angle: number;
}

interface Motion {
  s0p: State3;
  s0In: State3;
  tEnd: number;
  leaves: boolean;
  path: PathSample[];
  /** largest distance between the integrated S′ path and toRotating of the straight line [m] */
  dev: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 1e-9) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));
/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const roundTo = (x: number, step: number) => Math.round(x / step) * step;

function setupOf(p: { omega?: number; rho0?: number; speed?: number; angle?: number }, prev?: Setup): Setup {
  return {
    omega: roundTo(clamp(p.omega ?? prev?.omega ?? 1, -OMEGA_MAX, OMEGA_MAX), 0.01),
    rho0: roundTo(clamp(p.rho0 ?? prev?.rho0 ?? 0, 0, RHO_MAX), 0.01),
    speed: roundTo(clamp(p.speed ?? prev?.speed ?? 0.4, 0, U_MAX), 0.01),
    angle: roundTo(clamp(p.angle ?? prev?.angle ?? 0, -180, 180), 1),
  };
}

function motionOf(s: Setup): Motion {
  const launch = { rho0: s.rho0, speed: s.speed, angle: s.angle * deg };
  const s0p = launchRotating(launch);
  const s0In = launchInertial(launch, s.omega);
  const tExit = exitTime(s0In, R_T);
  const leaves = Number.isFinite(tExit);
  const tEnd = leaves ? Math.min(tExit, T_MAX) : T_MAX;
  const path = integrateRotating(s0p, s.omega, Math.max(tEnd, 1e-6), DT);
  let dev = 0;
  for (const q of path) dev = Math.max(dev, len3(sub3(q.s.r, freeLineSeenRotating(s0In, s.omega, q.t).r)));
  return { s0p, s0In, tEnd, leaves: leaves && tExit <= T_MAX, path, dev };
}

/** The S′ state at time t, interpolated between integration steps. */
function stateAt(m: Motion, t: number): State3 {
  const path = m.path;
  const last = path.length - 1;
  const h = path[last].t / last;
  const x = clamp(t / h, 0, last);
  const i = Math.min(Math.floor(x), last - 1);
  const f = x - i;
  const a = path[i].s;
  const b = path[i + 1].s;
  const mix3 = (u: Vec3, w: Vec3): Vec3 => [u[0] + (w[0] - u[0]) * f, u[1] + (w[1] - u[1]) * f, u[2] + (w[2] - u[2]) * f];
  return { r: mix3(a.r, b.r), v: mix3(a.v, b.v) };
}

/* ================================================================== text on the canvas */

/** Latin/math label with a paper halo, LTR. */
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

/** A symbol with a true subscript, centred on (x, y), with a paper halo. */
function subText(ctx: CanvasRenderingContext2D, p: Palette, base: string, sub: string, x: number, y: number, size: number, color: string) {
  const fBase = `italic 700 ${size}px ${p.fontUi}`;
  const fSub = `600 ${Math.round(size * 0.7)}px ${p.fontUi}`;
  ctx.save();
  ctx.font = fBase;
  const wb = ctx.measureText(base).width;
  ctx.font = fSub;
  const ws = ctx.measureText(sub).width;
  ctx.restore();
  const x0 = x - (wb + ws + 1) / 2;
  haloText(ctx, p, base, x0 + wb / 2, y, { font: fBase, color });
  haloText(ctx, p, sub, x0 + wb + 1 + ws / 2, y + size * 0.3, { font: fSub, color });
}

/** Hebrew label, RTL, its right edge at x. Returns its width. */
function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; weight?: number } = {}) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `${o.weight ?? 700} ${o.size ?? 13}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/* ================================================================== the component */

interface PanelBox {
  cx: number;
  cy: number;
  half: number;
  /** right edge for the title (left of the tool buttons when the panel touches them) */
  titleRight: number;
}

export default function RotatingFrame(props: RotatingFrameProps) {
  const initial = () => setupOf(props);
  const [setup, setSetup] = useState<Setup>(initial);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exact, setExact] = useState(false);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  const landed = useRef(false);

  const motion = useMemo(() => motionOf(setup), [setup.omega, setup.rho0, setup.speed, setup.angle]);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the launch and the instant shown; they never launch and never tick a task
  const setupRef = useRef(setup);
  setupRef.current = setup;
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setPlaying(false);
        const prev = setupRef.current;
        const s = setupOf(
          { omega: num(st.omega) ?? prev.omega, rho0: num(st.rho0) ?? prev.rho0, speed: num(st.speed) ?? prev.speed, angle: num(st.angle) ?? prev.angle },
          prev,
        );
        // two steps may arrive before the next render
        setupRef.current = s;
        setSetup(s);
        const prog = num(st.prog);
        setTime(prog !== null ? clamp(prog, 0, 1) * motionOf(s).tEnd : 0);
        if (typeof st.exact === 'boolean') setExact(st.exact);
      }),
    [props.id],
  );

  const describe = (s: Setup, m: Motion) => {
    const turn = Math.abs(s.omega) < 1e-9 ? 'הפטיפון עומד.' : `הפטיפון מסתובב ${s.omega > 0 ? 'נגד כיוון השעון' : 'עם כיוון השעון'}, ${sci(Math.abs(s.omega))} רדיאנים לשנייה.`;
    const end = m.leaves ? `הדיסקית עוזבת את הפטיפון אחרי ${sci(m.tEnd)} שניות.` : 'הדיסקית לא עוזבת את הפטיפון.';
    return `${turn} במערכת החדר הדיסקית נעה בקו ישר; במערכת הפטיפון היא נעה על עקומה. ${end}`;
  };

  const fire = () => {
    const s = setup;
    const rotating = Math.abs(s.omega) > 1e-9;
    if (rotating && s.rho0 < 1e-9 && s.speed > 1e-9) done('centre');
    if (rotating && s.speed < 1e-9 && s.rho0 > 1e-9) done('release');
    if (s.omega < -1e-9 && s.speed > 1e-9) done('reverse');
    if (!rotating && s.speed > 1e-9) done('still');
    t0.current = null;
    landed.current = false;
    if (!motionAllowed()) {
      setTime(motion.tEnd);
      setPlaying(false);
      setLive(describe(s, motion));
      return;
    }
    setTime(0);
    setPlaying(true);
    setLive('הדיסקית נעה.');
  };

  /* ---------------------------------------------------------------- drawing */

  const layoutOf = (w: number, h: number): { S: PanelBox; Sp: PanelBox; narrow: boolean } => {
    const narrow = w < 560;
    if (narrow) {
      const side = Math.min(w, h / 2);
      const half = side / 2 - 6;
      return {
        S: { cx: w / 2, cy: side / 2, half, titleRight: w - 90 },
        Sp: { cx: w / 2, cy: side + side / 2, half, titleRight: w - 8 },
        narrow,
      };
    }
    const side = Math.min(h, w / 2);
    const half = side / 2 - 8;
    // reading order is right to left: S on the right, S′ on the left
    return {
      S: { cx: w - side / 2, cy: h / 2, half, titleRight: w - 90 },
      Sp: { cx: side / 2, cy: h / 2, half, titleRight: side - 10 },
      narrow,
    };
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    let now = clamp(time, 0, motion.tEnd);
    if (playing) {
      if (t0.current === null) t0.current = t - time;
      now = Math.min(t - t0.current, motion.tEnd);
      if (now >= motion.tEnd && !landed.current) {
        landed.current = true;
        setPlaying(false);
        setTime(motion.tEnd);
        setLive(describe(setup, motion));
      }
    }
    const L = layoutOf(view.w, view.h);
    const fs = L.narrow ? 12 : 13;
    const sp = stateAt(motion, now);
    const sIn = freeLine(motion.s0In, now);
    const turned = setup.omega * now;
    drawPanel(ctx, p, L.S, 'S', fs, turned, sIn, null);
    drawPanel(ctx, p, L.Sp, 'Sp', fs, 0, sp, { now });
  };

  const drawPanel = (
    ctx: CanvasRenderingContext2D,
    p: Palette,
    b: PanelBox,
    frame: 'S' | 'Sp',
    fs: number,
    turned: number,
    st: State3,
    rot: { now: number } | null,
  ) => {
    const k = b.half / VIEW;
    const X = (x: number) => b.cx + x * k;
    const Y = (y: number) => b.cy - y * k;
    const inertial = frame === 'S';

    ctx.save();
    ctx.beginPath();
    ctx.rect(b.cx - b.half, b.cy - b.half, 2 * b.half, 2 * b.half);
    ctx.clip();
    ctx.fillStyle = withAlpha(p.paper2, inertial ? 0.5 : 0.9);
    ctx.fillRect(b.cx - b.half, b.cy - b.half, 2 * b.half, 2 * b.half);

    // the turntable, turned by ωt in S and at rest in S′
    ctx.save();
    ctx.fillStyle = withAlpha(p.equip, 0.12);
    ctx.strokeStyle = p.equip;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(X(0), Y(0), R_T * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // rings every 0.25 m, and three marks on the rim that turn with it
    ctx.strokeStyle = withAlpha(p.equip, 0.35);
    ctx.lineWidth = 0.8;
    for (const r of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.arc(X(0), Y(0), r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = p.equip;
    for (const a of [Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const th = a + turned;
      ctx.beginPath();
      ctx.arc(X(0.93 * Math.cos(th)), Y(0.93 * Math.sin(th)), Math.max(2.5, 0.025 * k), 0, Math.PI * 2);
      ctx.fill();
    }
    // the painted line, from the centre to the rim along +x′
    ctx.strokeStyle = p.equip;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    ctx.lineTo(X(R_T * Math.cos(turned)), Y(R_T * Math.sin(turned)));
    ctx.stroke();
    ctx.restore();

    // the direction of rotation, in S: an arc outside the rim, lower left (clear of the title and the tool buttons)
    if (inertial && Math.abs(setup.omega) > 1e-9) {
      const r = 1.08;
      const a1 = 200 * deg;
      const a2 = 240 * deg;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(X(0), Y(0), r * k, -a2, -a1);
      ctx.stroke();
      ctx.restore();
      const [from, to] = setup.omega > 0 ? [a2 - 8 * deg, a2] : [a1 + 8 * deg, a1];
      arrow(ctx, X(r * Math.cos(from)), Y(r * Math.sin(from)), X(r * Math.cos(to)), Y(r * Math.sin(to)), { color: p.ink2, width: 1.6, head: 8 });
      haloText(ctx, p, 'ω', X(1.17 * Math.cos(220 * deg)), Y(1.17 * Math.sin(220 * deg)), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink2 });
    }

    // the path: all of it faint, the stretch covered so far solid
    const pts: [number, number][] = inertial
      ? [
          [motion.s0In.r[0], motion.s0In.r[1]],
          [freeLine(motion.s0In, motion.tEnd).r[0], freeLine(motion.s0In, motion.tEnd).r[1]],
        ]
      : motion.path.map((q) => [q.s.r[0], q.s.r[1]]);
    const upTo = (n: number) => {
      ctx.beginPath();
      ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
      if (inertial) ctx.lineTo(X(st.r[0]), Y(st.r[1]));
      else {
        for (let i = 1; i < pts.length && motion.path[i].t <= n; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
        ctx.lineTo(X(st.r[0]), Y(st.r[1]));
      }
      ctx.stroke();
    };
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = withAlpha(p.ink, 0.22);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2.2;
    upTo(rot ? rot.now : 0);
    ctx.restore();

    // the exact S′ path, toRotating of the straight line, as dots
    if (!inertial && exact && rot) {
      ctx.save();
      ctx.fillStyle = p.accent;
      const n = 30;
      for (let i = 0; i <= n; i++) {
        const ti = (motion.tEnd * i) / n;
        if (ti > rot.now + 1e-9) break;
        const q = freeLineSeenRotating(motion.s0In, setup.omega, ti);
        ctx.beginPath();
        ctx.arc(X(q.r[0]), Y(q.r[1]), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // the start, a fixed point of this frame's floor
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.5;
    const sx = X(motion.s0p.r[0]);
    const sy = Y(motion.s0p.r[1]);
    ctx.beginPath();
    ctx.moveTo(sx - 5, sy - 5);
    ctx.lineTo(sx + 5, sy + 5);
    ctx.moveTo(sx - 5, sy + 5);
    ctx.lineTo(sx + 5, sy - 5);
    ctx.stroke();
    ctx.restore();

    // the puck and its arrows
    const px = X(st.r[0]);
    const py = Y(st.r[1]);
    const vScale = 0.42 * b.half; // px per m/s
    const fScale = 0.2 * b.half; // px per m/s²
    const minLen = 14;
    const maxV = 0.45 * b.half;
    const maxF = 0.4 * b.half;
    const vecArrow = (v: Vec3, scale: number, cap: number, color: string, dash: number[] | null, width: number) => {
      const mag = Math.hypot(v[0], v[1]);
      if (mag < 1e-6) return null;
      const L = clamp(mag * scale, minLen, cap);
      const ux = v[0] / mag;
      const uy = v[1] / mag;
      ctx.save();
      if (dash) ctx.setLineDash(dash);
      arrow(ctx, px, py, px + ux * L, py - uy * L, { color, width, head: 10 });
      ctx.restore();
      // the label just past the tip, kept inside the panel
      const pad = 16;
      return {
        x: clamp(px + ux * (L + 13), b.cx - b.half + pad, b.cx + b.half - pad),
        y: clamp(py - uy * (L + 13), b.cy - b.half + 30, b.cy + b.half - 26),
      };
    };
    if (!inertial) {
      const fcf = centrifugalPerMass(setup.omega, st.r);
      const fcor = coriolisPerMass(setup.omega, st.v);
      const a = vecArrow(fcf, fScale, maxF, p.force, [7, 4], 2.6);
      if (a) subText(ctx, p, 'F', 'cf', a.x, a.y, fs + 1, p.force);
      const c = vecArrow(fcor, fScale, maxF, p.force, [2.5, 3], 2.6);
      if (c) subText(ctx, p, 'F', 'cor', c.x, c.y, fs + 1, p.force);
    }
    const vt = vecArrow(st.v, vScale, maxV, p.velocity, null, 2.8);
    if (vt) haloText(ctx, p, inertial ? 'v' : 'v′', vt.x, vt.y, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.velocity });
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.strokeStyle = p.paper;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(5, 0.045 * k), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // what this frame says about the forces
    const note = inertial ? 'אין כוח אופקי: קו ישר' : 'כוחות מדומים: עקומה';
    handNote(ctx, note, b.cx, b.cy + b.half - 12, p, fs + 1);

    // the panel's title, left of the tool buttons where the panel touches them
    const tw = heText(ctx, p, inertial ? 'מערכת החדר' : 'מערכת הפטיפון', b.titleRight, b.cy - b.half + 14, { size: fs, color: p.ink });
    haloText(ctx, p, inertial ? 'S' : 'S′', b.titleRight - tw - 12, b.cy - b.half + 14, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink });
    ctx.restore();

    // the panel's frame
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.cx - b.half, b.cy - b.half, 2 * b.half, 2 * b.half);
    ctx.restore();
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 2, worldHeight: 1, animate: playing });
  useEffect(invalidate, [setup, time, playing, exact, motion]);

  // side by side on a wide screen, stacked on a narrow one
  const [aspect, setAspect] = useState(2);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 560 ? 0.5 : 2));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [aspect]);

  /* ---------------------------------------------------------------- input */

  const change = (patch: Partial<Setup>) => {
    setPlaying(false);
    setTime(0);
    setSetup((prev) => setupOf({ ...prev, ...patch }, prev));
  };
  const scrub = (v: number) => {
    setPlaying(false);
    setTime(clamp(v, 0, motion.tEnd));
  };

  /* ---------------------------------------------------------------- readouts */

  const shown = clamp(time, 0, motion.tEnd);
  const sp = stateAt(motion, shown);
  const sIn = freeLine(motion.s0In, shown);
  const rho = Math.hypot(sp.r[0], sp.r[1]);
  const vp = len3(sp.v);
  const w = setup.omega;
  const J = jacobiIntegral(sp, [0, 0, w]);
  const tEndRounded = Math.floor(motion.tEnd * 100 + 1e-6) / 100;
  const label = `איור חי: דיסקית על פטיפון חלק, בשני חלונות. ${describe(setup, motion)}`;

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fire();
        }
      }}
      onReset={() => {
        setSetup(initial());
        setTime(0);
        setPlaying(false);
        setExact(false);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        playing ? (
          <span>הדיסקית נעה…</span>
        ) : (
          <>
            <span class="q" dir="ltr" data-readout="t">
              t = <b>{signed(shown, 1e-6)} s</b>
            </span>
            <span class="q" dir="ltr" data-readout="rho">
              ρ = <b>{signed(rho, 1e-6)} m</b>
            </span>
            <span class="q" dir="ltr" data-readout="v">
              S: <b>|v| = {signed(len3(sIn.v), 1e-6)} m/s</b>
            </span>
            <span class="q" dir="ltr" data-readout="vp">
              S′: <b>|v′| = {signed(vp, 1e-6)} m/s</b>
            </span>
            <span class="q" dir="ltr" data-readout="fcf">
              ω²ρ = <b>{signed(w * w * rho, 1e-6)} m/s²</b>
            </span>
            <span class="q" dir="ltr" data-readout="fcor">
              2|ω|v′ = <b>{signed(2 * Math.abs(w) * vp, 1e-6)} m/s²</b>
            </span>
            <span class="q" dir="ltr" data-readout="jacobi">
              ½v′² − ½ω²ρ² = <b>{signed(J, 1e-7)} J/kg</b>
            </span>
            <span data-readout="exit">
              {motion.leaves ? (
                <>
                  יוצאת מהפטיפון אחרי{' '}
                  <b class="q" dir="ltr">
                    {signed(motion.tEnd)} s
                  </b>
                </>
              ) : (
                <>לא יוצאת מהפטיפון</>
              )}
            </span>
            <span data-readout="dev">
              הפרש מהחישוב המדויק:{' '}
              <b class="q" dir="ltr">
                {sci(Math.max(motion.dev, 1e-15), 1)} m
              </b>
            </span>
          </>
        )
      }
      controls={
        <>
          <Slider label="המהירות הזוויתית ω (חיובית: נגד כיוון השעון)" min={-OMEGA_MAX} max={OMEGA_MAX} step={0.05} value={setup.omega} format={(x) => `${signed(x)} rad/s`} onChange={(x) => change({ omega: x })} />
          <Slider label="מרחק השיגור מהמרכז ρ₀" min={0} max={RHO_MAX} step={0.05} value={setup.rho0} format={(x) => `${signed(x)} m`} onChange={(x) => change({ rho0: x })} />
          <Slider label="מהירות השיגור ביחס לפטיפון u" min={0} max={U_MAX} step={0.05} value={setup.speed} format={(x) => `${signed(x)} m/s`} onChange={(x) => change({ speed: x })} />
          <Slider label="כיוון השיגור מהקו המצויר (נגד כיוון השעון)" min={-180} max={180} step={5} value={setup.angle} format={(x) => `${signed(x)}°`} onChange={(x) => change({ angle: x })} />
          <div class="group" role="group" aria-label="שיגור">
            <button type="button" class="btn primary" onClick={fire}>
              שגרו
            </button>
            <Toggle label="החישוב המדויק" on={exact} swatch="var(--accent)" onChange={setExact} />
          </div>
          <Slider label="זמן מהשיגור" min={0} max={tEndRounded} step={0.01} value={Math.min(Math.round(shown * 100) / 100, tEndRounded)} format={(x) => `${signed(x, 1e-9)} s`} onChange={scrub} />
          <span class="hint">{`המרחק מהציר הוא ${ltr('ρ')}. בחלון ${ltr('S′')} הכוחות על הדיסקית מצוירים ליחידת מסה.`}</span>
        </>
      }
    />
  );
}
