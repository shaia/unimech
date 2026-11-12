/**
 * RigidKinematics (lesson 8.1): a rigid body in the plane that translates and turns.
 *
 * Three scenes:
 * - 'rod': a rod of length 1.0 m on ice. The learner sets the CM velocity V = (Vx, Vy) and the angular velocity ω
 *   (counter-clockwise positive). Velocity arrows at five points of the rod, each the sum V + ω × r (the parts shown
 *   on request), and the point Q of the instantaneous axis (ציר סיבוב רגעי), where V + ω × r = 0. The time slider
 *   runs the motion from −0.5 s to +0.5 s; at t = 0 the CM is at the centre of the stage and the rod lies along x.
 * - 'wheel': a wheel of radius 0.40 m above a road. V along x and ω set apart, so the contact point may slip; the
 *   button "גלגול" sets ω = −V/R. Velocity arrows at the centre, the top, the bottom, the front and the back; the
 *   path of a stone stuck in the rim (at the bottom at t = 0), a cycloid when the wheel rolls; the run is −0.6 s to
 *   +0.6 s.
 * - 'alpha': a disc of radius 0.50 m on a fixed axle, turning at constant angular acceleration α from ω₀. A point P
 *   at radius r on a line painted on the disc, with its velocity and its acceleration and the acceleration's
 *   tangential and centripetal parts; θ(t) and ω(t) plotted below.
 *
 * Axes: x right, y up, z out of the page. The physics comes from src/physics/rigidbody.ts and rigidkinematics.ts.
 * Tasks are judged only in the learner's own handlers (sliders, buttons, the end of a run they started), never in
 * an effect that watches state, so a state a text step produced never ticks one.
 */

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { instantaneousCentre, pointVelocity, rotationVelocity, uniformAlpha } from '~/physics/rigidbody';
import { contactVelocity, pointAccelerationVec, pointPosition, reversalTime, rollingOmega, rotate, uniformPose } from '~/physics/rigidkinematics';
import { len, type Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Scene = 'rod' | 'wheel' | 'alpha';

/* ------------------------------------------------------------ the scenes (SI) */

/** the rod: length L; the run from −HALF to +HALF s */
const ROD = { L: 1.0, half: 0.5, vMax: 1, wMax: 4, vStep: 0.1, wStep: 0.2 };
/** the wheel: radius R; the run from −HALF to +HALF s */
const WHEEL = { R: 0.4, half: 0.6, vMax: 1.2, wMax: 6, vStep: 0.1, wStep: 0.25 };
/** the disc on a fixed axle: radius R; the run from 0 to T */
const DISC = { R: 0.5, T: 8, w0Max: 4, aMax: 2, w0Step: 0.25, aStep: 0.25, rMin: 0.1, rStep: 0.05 };

/** world boxes [m] the stage must show */
const BOX: Record<'rod' | 'wheel', { x0: number; x1: number; y0: number; y1: number }> = {
  rod: { x0: -1.3, x1: 1.3, y0: -1.0, y1: 1.0 },
  wheel: { x0: -1.25, x1: 1.25, y0: -0.55, y1: 0.85 },
};
/** arrow length per unit speed [m per m/s] */
const V_SCALE = { rod: 0.3, wheel: 0.3 };
/** slow motion: one second of the run takes this many seconds of real time */
const SLOW = { rod: 2.5, wheel: 2, alpha: 1 };
/** the reset and fullscreen buttons cover this corner of the stage (CSS px from the top-right) */
const BUTTONS_W = 96;
const BUTTONS_H = 52;
/** the shortest arrow drawn for a nonzero quantity [px] */
const MIN_ARROW = 14;

const TASK_LABEL: Record<string, string> = {
  'end-at-rest': 'שנו את ω (או את מהירות מרכז המסה) כך שאחד מקצות המוט יעמוד במקום ברגע הזה. מה היחס בין מהירות מרכז המסה ל-ω?',
  'q-outside': 'הקטינו את ω עד שהנקודה Q יוצאת מהמוט. האם עדיין יש נקודה שעומדת?',
  'q-clockwise': 'הפכו את כיוון הסיבוב (ω שלילי). לאיזה צד של מרכז המסה עברה Q?',
  'roll-by-hand': 'בחרו מהירות למרכז, ומצאו בעצמכם, במחוון של ω, את הערך שבו נקודת המגע עומדת. מה ωR?',
  cycloid: 'בגלגול בלי החלקה, הדליקו את מסלול האבן והריצו את הזמן עד הסוף. מה קורה למסלול כשהאבן נוגעת בכביש?',
  'spin-out': 'גרמו לגלגל להסתובב מהר מדי, כך שנקודת המגע מחליקה אחורה, כמו גלגל של מכונית שמסתובב במקום ברמזור.',
  'stop-instant': 'הזיזו את הזמן לרגע שבו הדסקה עוצרת. האם לנקודה P יש תאוצה ברגע הזה? לאן היא פונה?',
  'equal-parts': 'מצאו רגע שבו התאוצה הצנטריפטלית של P שווה בגודלה לתאוצה המשיקית. מה הזווית בין התאוצה לרדיוס?',
  'half-radius': 'הזיזו את P לחצי הרדיוס. מה קרה למהירות הזוויתית, ומה קרה לגודל המהירות של P?',
};

export interface RigidKinematicsProps {
  id: string;
  scene?: Scene;
  /** CM velocity [m/s] (rod: both; wheel: Vx only) */
  Vx?: number;
  Vy?: number;
  /** angular velocity [rad/s], counter-clockwise positive (rod, wheel) */
  omega?: number;
  /** alpha scene: initial angular velocity and angular acceleration, counter-clockwise positive */
  omega0?: number;
  alpha?: number;
  /** alpha scene: the radius of the point P [m] */
  r?: number;
  t?: number;
  parts?: boolean;
  q?: boolean;
  trace?: boolean;
  tasks?: string[];
}

interface State {
  Vx: number;
  Vy: number;
  omega: number;
  omega0: number;
  alpha: number;
  r: number;
  t: number;
  playing: boolean;
  parts: boolean;
  q: boolean;
  trace: boolean;
}

function initial(p: RigidKinematicsProps): State {
  const scene = p.scene ?? 'rod';
  return {
    Vx: p.Vx ?? (scene === 'wheel' ? 1 : 0),
    Vy: scene === 'wheel' ? 0 : (p.Vy ?? 0.8),
    omega: p.omega ?? (scene === 'wheel' ? rollingOmega(1, WHEEL.R) : 2),
    omega0: p.omega0 ?? 3,
    alpha: p.alpha ?? -0.75,
    r: p.r ?? DISC.R,
    t: p.t ?? 0,
    playing: false,
    parts: p.parts ?? false,
    q: p.q ?? false,
    trace: p.trace ?? false,
  };
}

const tRange = (scene: Scene): [number, number] =>
  scene === 'rod' ? [-ROD.half, ROD.half] : scene === 'wheel' ? [-WHEEL.half, WHEEL.half] : [0, DISC.T];
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const snap = (x: number, step: number) => Math.round(x / step) * step;
/** a number for the readouts: 3 significant figures, a true minus, and 0 for float dust */
const num = (x: number) => (Math.abs(x) < 5e-4 ? '0' : sci(x, 3).replace('-', '−'));

type Source = 'V' | 'omega' | 'time' | 'run-end' | 'pause' | 'omega0' | 'alpha' | 'r' | 'roll' | 'view';

export default function RigidKinematics(props: RigidKinematicsProps) {
  const scene: Scene = props.scene ?? 'rod';
  const [s, setS] = useState<State>(() => initial(props));
  const sRef = useRef<State>(s);
  sRef.current = s;
  const [live, setLive] = useState('');
  /** the learner pressed play since the last step or reset */
  const userPlayed = useRef(false);
  const visible = useRef(true);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const [t0, t1] = tRange(scene);
  const tt = clamp(s.t, t0, t1);

  // ---------------------------------------------------------------- derived physics
  const V: Vec2 = scene === 'wheel' ? [s.Vx, 0] : [s.Vx, s.Vy];
  const pose = uniformPose([0, 0], 0, V, s.omega, tt);
  const ic = instantaneousCentre(V, s.omega);
  const slip = contactVelocity(V, s.omega, WHEEL.R)[0];
  const rodEnd = (sign: 1 | -1) => pointVelocity(V, s.omega, rotate([(sign * ROD.L) / 2, 0], pose.phi));
  const disc = uniformAlpha(0, s.omega0, s.alpha, tt);
  const rev = reversalTime(s.omega0, s.alpha);

  /** judge the tasks against a state the learner produced; `src` names the handler */
  const judge = (n: State, src: Source) => {
    if (src === 'view') return;
    const has = (id: string) => props.tasks?.includes(id);
    const done = (id: string) => markTask(`${props.id}:${id}`);
    if (scene === 'rod') {
      const Vn: Vec2 = [n.Vx, n.Vy];
      const moving = len(Vn) > 0.05 && Math.abs(n.omega) > 0.05;
      const phi = n.omega * clamp(n.t, t0, t1);
      const vA = len(pointVelocity(Vn, n.omega, rotate([ROD.L / 2, 0], phi)));
      const vB = len(pointVelocity(Vn, n.omega, rotate([-ROD.L / 2, 0], phi)));
      if (has('end-at-rest') && moving && Math.min(vA, vB) < 0.02) done('end-at-rest');
      if (has('q-outside') && moving && len(Vn) / Math.abs(n.omega) > ROD.L / 2 + 0.02) done('q-outside');
      if (has('q-clockwise') && moving && n.omega < 0 && src === 'omega') done('q-clockwise');
    } else if (scene === 'wheel') {
      const sl = contactVelocity([n.Vx, 0], n.omega, WHEEL.R)[0];
      const moving = Math.abs(n.Vx) >= 0.2 - 1e-9;
      const rolling = moving && Math.abs(sl) < 0.01;
      if (has('roll-by-hand') && rolling && (src === 'V' || src === 'omega')) done('roll-by-hand');
      if (has('spin-out') && moving && sl * n.Vx < 0 && Math.abs(sl) >= 0.2 - 1e-9 && (src === 'V' || src === 'omega')) done('spin-out');
      const atEnd = n.t >= t1 - 0.011;
      if (has('cycloid') && rolling && n.trace && atEnd && (src === 'run-end' || src === 'time')) done('cycloid');
    } else {
      const { omega } = uniformAlpha(0, n.omega0, n.alpha, clamp(n.t, t0, t1));
      const timeLike = src === 'time' || src === 'pause' || src === 'omega0' || src === 'alpha';
      if (has('stop-instant') && n.alpha !== 0 && n.t > 0.05 && Math.abs(omega) < 0.02 && timeLike) done('stop-instant');
      if (has('equal-parts') && n.alpha !== 0 && Math.abs(omega) > 0.05 && Math.abs(omega * omega - Math.abs(n.alpha)) <= 0.06 * Math.abs(n.alpha) && timeLike)
        done('equal-parts');
      if (has('half-radius') && src === 'r' && n.r <= DISC.R / 2 + 1e-9) done('half-radius');
    }
  };

  /** a change the learner made: apply it, then judge the tasks */
  const update = (patch: Partial<State>, src: Source) => {
    const next: State = { ...sRef.current, ...patch };
    sRef.current = next;
    setS(next);
    judge(next, src);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        const prev = sRef.current;
        const next: State = { ...prev, playing: false };
        const n = (k: string) => (typeof step[k] === 'number' ? (step[k] as number) : undefined);
        const b = (k: string) => (typeof step[k] === 'boolean' ? (step[k] as boolean) : undefined);
        next.Vx = n('Vx') ?? next.Vx;
        next.Vy = scene === 'wheel' ? 0 : (n('Vy') ?? next.Vy);
        next.omega = n('omega') ?? next.omega;
        if (step.roll === true) next.omega = rollingOmega(next.Vx, WHEEL.R);
        next.omega0 = n('omega0') ?? next.omega0;
        next.alpha = n('alpha') ?? next.alpha;
        next.r = n('r') ?? next.r;
        next.t = n('t') ?? next.t;
        next.parts = b('parts') ?? next.parts;
        next.q = b('q') ?? next.q;
        next.trace = b('trace') ?? next.trace;
        userPlayed.current = false;
        sRef.current = next;
        setS(next);
      }),
    [props.id],
  );

  // playback; still mode freezes it
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const prev = sRef.current;
      if (!prev.playing) return;
      if (motionAllowed() && visible.current && !document.hidden) {
        const t = prev.t + dt / SLOW[scene];
        const ended = t >= t1;
        const next: State = ended ? { ...prev, t: t1, playing: false } : { ...prev, t };
        sRef.current = next;
        setS(next);
        if (ended) {
          if (userPlayed.current) judge(next, 'run-end');
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  // a taller stage on a narrow screen
  const [narrowStage, setNarrowStage] = useState(false);

  /* ------------------------------------------------------------ drawing */

  const frameOf = (view: View) => {
    if (scene === 'alpha') {
      const areaH = view.h * (narrowStage ? 0.5 : 0.56);
      const span = 2.1 * DISC.R * 1.18;
      const ppm = Math.min(view.w, areaH) / span;
      const at = (x: number, y: number): [number, number] => [view.w / 2 + x * ppm, areaH / 2 - y * ppm];
      return { ppm, at, areaH };
    }
    const b = BOX[scene];
    const ppm = Math.min(view.w / (b.x1 - b.x0), view.h / (b.y1 - b.y0));
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    const at = (x: number, y: number): [number, number] => [view.w / 2 + (x - cx) * ppm, view.h / 2 - (y - cy) * ppm];
    return { ppm, at, areaH: view.h };
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const { ppm, at, areaH } = frameOf(view);
    const fs = view.w < 520 ? 11 : 13;
    const L = (text: string, x: number, y: number, color: string) => label(ctx, text, x, y, color, p, view, fs);
    const unit = clamp(view.w / 640, 0.62, 1);

    if (scene === 'rod' || scene === 'wheel') {
      const vs = V_SCALE[scene] * ppm;
      /** a velocity arrow from a screen point, at least MIN_ARROW long when nonzero unless `exact` */
      const vArrow = (a: [number, number], v: Vec2, color: string, width = 3, alpha = 1, exact = false): [number, number] => {
        const sp = len(v);
        if (sp < 1e-6) return a;
        const l = exact ? sp * vs : Math.max(sp * vs, MIN_ARROW);
        const tip: [number, number] = [a[0] + (v[0] / sp) * l, a[1] - (v[1] / sp) * l];
        arrow(ctx, a[0], a[1], tip[0], tip[1], { color, width, head: 10 + width, alpha });
        return tip;
      };
      /** the body points drawn, as offsets from the CM in space, with a name */
      let pts: { r: Vec2; name: string }[];
      if (scene === 'rod') {
        grid(ctx, view, p, at, BOX.rod);
        pts = [
          { r: rotate([ROD.L / 2, 0], pose.phi), name: 'A' },
          { r: rotate([ROD.L / 4, 0], pose.phi), name: '' },
          { r: [0, 0], name: '' },
          { r: rotate([-ROD.L / 4, 0], pose.phi), name: '' },
          { r: rotate([-ROD.L / 2, 0], pose.phi), name: 'B' },
        ];
        // paths over the run
        if (s.trace) {
          for (const b of [[ROD.L / 2, 0], [-ROD.L / 2, 0], [0, 0]] as Vec2[]) {
            const path: [number, number][] = [];
            const done: [number, number][] = [];
            for (let i = 0; i <= 120; i++) {
              const ti = t0 + ((t1 - t0) * i) / 120;
              const q = uniformPose([0, 0], 0, V, s.omega, ti);
              const w = pointPosition(q.R, q.phi, b);
              path.push(at(w[0], w[1]));
              if (ti <= tt + 1e-9) done.push(at(w[0], w[1]));
            }
            polyline(ctx, path, withAlpha(p.ink3, 0.55), 1.2, [4, 4]);
            polyline(ctx, done, p.ink2, 1.6);
          }
        }
        // the rod
        const A = pointPosition(pose.R, pose.phi, [ROD.L / 2, 0]);
        const B = pointPosition(pose.R, pose.phi, [-ROD.L / 2, 0]);
        line(ctx, at(A[0], A[1]), at(B[0], B[1]), p.ink2, Math.max(6, 9 * unit));
      } else {
        const R = WHEEL.R;
        // the road
        const gy = at(0, -R)[1];
        ctx.save();
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(view.w, gy);
        ctx.stroke();
        ctx.strokeStyle = withAlpha(p.ink3, 0.6);
        ctx.lineWidth = 1;
        for (let x = -((view.w * 2) % 14); x < view.w + 14; x += 14) {
          ctx.beginPath();
          ctx.moveTo(x, gy + 1);
          ctx.lineTo(x - 8, gy + 9);
          ctx.stroke();
        }
        ctx.restore();
        pts = [
          { r: [0, R], name: '' },
          { r: [R, 0], name: '' },
          { r: [0, 0], name: '' },
          { r: [-R, 0], name: '' },
          { r: [0, -R], name: '' },
        ];
        // the stone's path over the run
        const stoneB: Vec2 = [0, -R];
        if (s.trace) {
          const path: [number, number][] = [];
          const done: [number, number][] = [];
          for (let i = 0; i <= 240; i++) {
            const ti = t0 + ((t1 - t0) * i) / 240;
            const q = uniformPose([0, 0], 0, V, s.omega, ti);
            const w = pointPosition(q.R, q.phi, stoneB);
            path.push(at(w[0], w[1]));
            if (ti <= tt + 1e-9) done.push(at(w[0], w[1]));
          }
          polyline(ctx, path, withAlpha(p.accent, 0.4), 1.4, [4, 4]);
          polyline(ctx, done, p.accent, 2.2);
        }
        // the wheel: rim, spokes, hub
        const C = at(pose.R[0], pose.R[1]);
        ctx.save();
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = Math.max(3, 4 * unit);
        ctx.beginPath();
        ctx.arc(C[0], C[1], R * ppm, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = withAlpha(p.ink3, 0.8);
        ctx.lineWidth = 1.4;
        for (let k = 0; k < 6; k++) {
          const e = pointPosition(pose.R, pose.phi + (k * Math.PI) / 3, [R, 0]);
          const E = at(e[0], e[1]);
          ctx.beginPath();
          ctx.moveTo(C[0], C[1]);
          ctx.lineTo(E[0], E[1]);
          ctx.stroke();
        }
        ctx.restore();
        // the stone
        const st = pointPosition(pose.R, pose.phi, stoneB);
        const S = at(st[0], st[1]);
        ctx.save();
        ctx.fillStyle = p.accent;
        ctx.strokeStyle = p.paper;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(S[0], S[1], Math.max(5, 7 * unit), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Q, the instantaneous axis, and the lines from it to the points
      const Qw: Vec2 | null = ic ? [pose.R[0] + ic[0], pose.R[1] + ic[1]] : null;
      if (Qw && s.q) {
        const Qs = at(Qw[0], Qw[1]);
        for (const q of pts) {
          const w = at(pose.R[0] + q.r[0], pose.R[1] + q.r[1]);
          dashed(ctx, Qs, w, withAlpha(p.accent, 0.7), 1.3);
        }
      }

      // the velocity arrows: parts first (V, then ω × r from its tip), then the sum
      for (const q of pts) {
        const w: Vec2 = [pose.R[0] + q.r[0], pose.R[1] + q.r[1]];
        const rot = rotationVelocity(s.omega, q.r);
        const v = pointVelocity(V, s.omega, q.r);
        const isCm = q.r[0] === 0 && q.r[1] === 0;
        const ws = at(w[0], w[1]);
        if (s.parts && !isCm) {
          // head to tail, at the true scale, so the triangle closes on the sum
          const tipV = vArrow(ws, V, p.velocity, 1.8, 0.45, true);
          vArrow(tipV, rot, p.accent, 2, 1, true);
        }
        vArrow(ws, v, p.velocity, 3);
      }

      // the CM and the points' names
      const G = at(pose.R[0], pose.R[1]);
      cmMark(ctx, G, p, Math.max(5, 7 * unit));
      spin(ctx, G, Math.max(18, 26 * unit), s.omega, p.accent);
      if (scene === 'rod') {
        for (const q of pts) {
          if (!q.name) continue;
          const w = at(pose.R[0] + q.r[0], pose.R[1] + q.r[1]);
          const u = q.r[0] * Math.cos(pose.phi) + q.r[1] * Math.sin(pose.phi) > 0 ? 1 : -1;
          L(q.name, w[0] + u * Math.cos(pose.phi) * 18, w[1] - u * Math.sin(pose.phi) * 18 + 16, p.ink);
        }
      }
      if (Qw) {
        const Qs = at(Qw[0], Qw[1]);
        if (Qs[0] > -10 && Qs[0] < view.w + 10 && Qs[1] > -10 && Qs[1] < view.h + 10) {
          qMark(ctx, Qs, p, Math.max(6, 8 * unit));
          L('Q', Qs[0] - 14, Qs[1] - 14, p.accent);
        }
      }
      return;
    }

    // ------------------------------------------------------------ alpha: the disc, P, its arrows, the plots
    const R = DISC.R;
    const C = at(0, 0);
    const th = disc.theta;
    const w = disc.omega;
    // the axle's stand
    ctx.save();
    ctx.fillStyle = withAlpha(p.ink3, 0.25);
    ctx.strokeStyle = withAlpha(p.ink3, 0.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(C[0], C[1], R * ppm, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = Math.max(2, 3 * unit);
    ctx.beginPath();
    ctx.arc(C[0], C[1], R * ppm, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // the painted line, and the reference line θ = 0
    dashed(ctx, C, at(R * 1.12, 0), withAlpha(p.ink3, 0.9), 1.2);
    const E = at(R * Math.cos(th), R * Math.sin(th));
    line(ctx, C, E, p.ink, 2.4);
    // the arc of θ (mod 2π) near the centre
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink2, 0.8);
    ctx.lineWidth = 1.2;
    const m = ((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    ctx.beginPath();
    ctx.arc(C[0], C[1], 0.16 * R * ppm, 0, -m, true);
    ctx.stroke();
    ctx.restore();
    L('θ', C[0] + 0.24 * R * ppm * Math.cos(m / 2), C[1] - 0.24 * R * ppm * Math.sin(m / 2), p.ink2);
    // axle
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(C[0], C[1], 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // P and its arrows
    const rv: Vec2 = [s.r * Math.cos(th), s.r * Math.sin(th)];
    const P = at(rv[0], rv[1]);
    const vP = rotationVelocity(w, rv);
    const aP = pointAccelerationVec([0, 0], w, s.alpha, rv);
    const aT = rotationVelocity(s.alpha, rv);
    const aC: Vec2 = [-w * w * rv[0], -w * w * rv[1]];
    // v is scaled to the run's largest speed (at r = R), so its length compares across time; a is drawn at a fixed
    // length with its two parts in proportion (the magnitudes are in the readout), so its direction always reads
    const wMax = Math.max(Math.abs(s.omega0), Math.abs(s.omega0 + s.alpha * DISC.T), 0.5);
    const aNow = len(aP);
    const vLen = (x: number) => (x < 1e-9 ? 0 : Math.max((x / (wMax * R)) * 0.6 * R * ppm, MIN_ARROW));
    const aLen = (x: number) => (x < 1e-9 || aNow < 1e-9 ? 0 : Math.max((x / aNow) * 0.7 * R * ppm, 8));
    const draw2 = (vec: Vec2, l: number, color: string, width: number, dash = false) => {
      const sp = len(vec);
      if (sp < 1e-9) return null;
      const tip: [number, number] = [P[0] + (vec[0] / sp) * l, P[1] - (vec[1] / sp) * l];
      if (dash) {
        ctx.save();
        ctx.setLineDash([4, 3]);
      }
      arrow(ctx, P[0], P[1], tip[0], tip[1], { color, width, head: 9 + width });
      if (dash) ctx.restore();
      return tip;
    };
    // the parts, when both exist (with one of them zero the other is the whole arrow)
    if (s.parts && len(aT) > 1e-9 && len(aC) > 1e-9) {
      const tT = draw2(aT, aLen(len(aT)), withAlpha(p.accel, 0.65), 1.8);
      const tC = draw2(aC, aLen(len(aC)), withAlpha(p.accel, 0.65), 1.8);
      if (tT) beyondSub(ctx, 'a', 't', [P[0], P[1]], tT, p.accel, p, fs);
      if (tC) beyondSub(ctx, 'a', 'c', [P[0], P[1]], tC, p.accel, p, fs);
    }
    const tA = draw2(aP, aLen(len(aP)), p.accel, 3.2);
    const tV = draw2(vP, vLen(len(vP)), p.velocity, 3);
    if (tV) beyond(L, 'v', [P[0], P[1]], tV, p.velocity);
    if (tA) beyond(L, 'a', [P[0], P[1]], tA, p.accel);
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.strokeStyle = p.paper;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(P[0], P[1], Math.max(5, 6.5 * unit), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    L('P', P[0] + 17 * Math.cos(th), P[1] - 17 * Math.sin(th), p.ink);
    spin(ctx, C, Math.max(26, R * ppm * 0.42), w, p.accent);

    // the plots: θ(t) and ω(t)
    const below = { x: 0, y: areaH, w: view.w, h: view.h - areaH };
    const boxes = narrowStage
      ? [
          { x: below.x, y: below.y, w: below.w, h: below.h / 2 },
          { x: below.x, y: below.y + below.h / 2, w: below.w, h: below.h / 2 },
        ]
      : [
          { x: below.x, y: below.y, w: below.w / 2, h: below.h },
          { x: below.x + below.w / 2, y: below.y, w: below.w / 2, h: below.h },
        ];
    const N = 200;
    const ts = Array.from({ length: N + 1 }, (_, i) => (DISC.T * i) / N);
    const ths = ts.map((x) => uniformAlpha(0, s.omega0, s.alpha, x).theta);
    const ws = ts.map((x) => uniformAlpha(0, s.omega0, s.alpha, x).omega);
    const panel = (bx: { x: number; y: number; w: number; h: number }, ys: number[], name: string, color: string, now: number) => {
      const inner = insetBox(bx, { l: 50, r: 12, t: 10, b: 40 });
      const lo = Math.min(0, ...ys);
      const hi = Math.max(0, ...ys);
      const pad = 0.08 * (hi - lo || 1);
      const plot = makePlot(inner, { min: 0, max: DISC.T, label: 'הזמן t (s)' }, { min: lo - pad, max: hi + pad, label: name });
      drawAxes(ctx, plot, p);
      curve(ctx, plot, ts, ys, color, ts.length - 1, 0.3);
      const iNow = Math.round((tt / DISC.T) * N);
      curve(ctx, plot, ts, ys, color, iNow, 1);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink, 0.5);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(plot.px(tt), inner.y);
      ctx.lineTo(plot.px(tt), inner.y + inner.h);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(plot.px(tt), plot.py(now), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // the zero line
      if (lo < 0) {
        ctx.save();
        ctx.strokeStyle = withAlpha(p.ink2, 0.6);
        ctx.beginPath();
        ctx.moveTo(inner.x, plot.py(0));
        ctx.lineTo(inner.x + inner.w, plot.py(0));
        ctx.stroke();
        ctx.restore();
      }
    };
    panel(boxes[0], ths, 'θ (rad)', p.ink, th);
    panel(boxes[1], ws, 'ω (rad/s)', p.accent, w);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [s, narrowStage]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const io = new IntersectionObserver((es) => {
      visible.current = es.some((e) => e.isIntersecting);
    });
    io.observe(c);
    const ro = new ResizeObserver(() => setNarrowStage(c.getBoundingClientRect().width < 520));
    ro.observe(c);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  /* ------------------------------------------------------------ interaction */

  const setTime = (t: number) => update({ t: clamp(t, t0, t1), playing: false }, 'time');
  const togglePlay = () => {
    const prev = sRef.current;
    if (prev.playing) {
      update({ playing: false }, 'pause');
      return;
    }
    userPlayed.current = true;
    const next: State = { ...prev, playing: true, t: prev.t >= t1 - 1e-9 ? t0 : prev.t };
    sRef.current = next;
    setS(next);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      togglePlay();
      return;
    }
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setTime(sRef.current.t + (d * (t1 - t0)) / 40);
  };
  const reset = () => {
    userPlayed.current = false;
    const next = initial(props);
    sRef.current = next;
    setS(next);
    setLive('האיור אופס.');
  };

  function describe(): string {
    if (scene === 'rod') {
      const q = ic ? `הנקודה Q במרחק ${num(len(ic))} m ממרכז המסה` : 'אין נקודה שעומדת (הזזה טהורה)';
      return `מוט ברגע t = ${num(tt)} s: מהירות מרכז המסה ${num(len(V))} m/s, ω = ${num(s.omega)} rad/s; הקצה A נע ב-${num(len(rodEnd(1)))} m/s והקצה B ב-${num(len(rodEnd(-1)))} m/s; ${q}.`;
    }
    if (scene === 'wheel')
      return `גלגל: V = ${num(s.Vx)} m/s, ω = ${num(s.omega)} rad/s, ωR = ${num(s.omega * WHEEL.R)} m/s; נקודת המגע נעה ב-${num(slip)} m/s, והנקודה העליונה ב-${num(pointVelocity(V, s.omega, [0, WHEEL.R])[0])} m/s.`;
    return `דסקה ברגע t = ${num(tt)} s: θ = ${num(disc.theta)} rad, ω = ${num(disc.omega)} rad/s; לנקודה P ברדיוס ${num(s.r)} m תאוצה משיקית ${num(s.alpha * s.r)} m/s² ותאוצה צנטריפטלית ${num(disc.omega * disc.omega * s.r)} m/s².`;
  }
  useEffect(() => {
    const h = setTimeout(() => setLive(describe()), 700);
    return () => clearTimeout(h);
  }, [s.Vx, s.Vy, s.omega, s.omega0, s.alpha, s.r]);

  /* ------------------------------------------------------------ readouts and controls */

  let readout: ComponentChildren;
  if (scene === 'rod') {
    readout = (
      <>
        <span class="q" data-readout="t">t = {num(tt)} s</span>
        <span class="q" data-readout="V">|v<sub>cm</sub>| = {num(len(V))} m/s</span>
        <span class="q" data-readout="omega">ω = {num(s.omega)} rad/s</span>
        <b class="q" data-readout="vA">|v<sub>A</sub>| = {num(len(rodEnd(1)))} m/s</b>
        <b class="q" data-readout="vB">|v<sub>B</sub>| = {num(len(rodEnd(-1)))} m/s</b>
        <span class="q" data-readout="Q">{ic ? <>|v<sub>cm</sub>|/|ω| = {num(len(ic))} m</> : <>|v<sub>cm</sub>|/|ω| = ∞</>}</span>
      </>
    );
  } else if (scene === 'wheel') {
    readout = (
      <>
        <span class="q" data-readout="t">t = {num(tt)} s</span>
        <span class="q" data-readout="V">v<sub>cm</sub> = {num(s.Vx)} m/s</span>
        <span class="q" data-readout="omega">ω = {num(s.omega)} rad/s</span>
        <span class="q" data-readout="wR">ωR = {num(s.omega * WHEEL.R)} m/s</span>
        <b data-readout="contact">
          נקודת המגע: <bdi class="q">v = {num(slip)} m/s</bdi>
        </b>
        <b data-readout="top">
          הנקודה העליונה: <bdi class="q">v = {num(pointVelocity(V, s.omega, [0, WHEEL.R])[0])} m/s</bdi>
        </b>
      </>
    );
  } else {
    const at_ = s.alpha * s.r;
    const ac = disc.omega * disc.omega * s.r;
    readout = (
      <>
        <span class="q" data-readout="t">t = {num(tt)} s</span>
        <span class="q" data-readout="theta">θ = {num(disc.theta)} rad</span>
        <b class="q" data-readout="omega">ω = {num(disc.omega)} rad/s</b>
        <span class="q" data-readout="v">v<sub>P</sub> = {num(disc.omega * s.r)} m/s</span>
        <span class="q" data-readout="at">a<sub>t</sub> = {num(at_)} m/s²</span>
        <span class="q" data-readout="ac">a<sub>c</sub> = {num(ac)} m/s²</span>
        <b class="q" data-readout="a">|a| = {num(Math.hypot(at_, ac))} m/s²</b>
        {rev !== null && (
          <span data-readout="rev">
            עוצרת לרגע: <bdi class="q">t = {num(rev)} s</bdi>
          </span>
        )}
      </>
    );
  }

  const ms = (x: number) => `${num(x)} m/s`;
  const rads = (x: number) => `${num(x)} rad/s`;
  let controls: ComponentChildren;
  if (scene === 'rod') {
    controls = (
      <>
        <Slider label="מהירות מרכז המסה, רכיב x" min={-ROD.vMax} max={ROD.vMax} step={ROD.vStep} value={s.Vx} format={ms} onChange={(x) => update({ Vx: snap(x, ROD.vStep), playing: false }, 'V')} />
        <Slider label="מהירות מרכז המסה, רכיב y" min={-ROD.vMax} max={ROD.vMax} step={ROD.vStep} value={s.Vy} format={ms} onChange={(x) => update({ Vy: snap(x, ROD.vStep), playing: false }, 'V')} />
        <Slider label="המהירות הזוויתית ω" min={-ROD.wMax} max={ROD.wMax} step={ROD.wStep} value={s.omega} format={rads} onChange={(x) => update({ omega: snap(x, ROD.wStep), playing: false }, 'omega')} />
      </>
    );
  } else if (scene === 'wheel') {
    controls = (
      <>
        <Slider label="מהירות המרכז" min={-WHEEL.vMax} max={WHEEL.vMax} step={WHEEL.vStep} value={s.Vx} format={ms} onChange={(x) => update({ Vx: snap(x, WHEEL.vStep), playing: false }, 'V')} />
        <Slider label="המהירות הזוויתית ω" min={-WHEEL.wMax} max={WHEEL.wMax} step={WHEEL.wStep} value={s.omega} format={rads} onChange={(x) => update({ omega: snap(x, WHEEL.wStep), playing: false }, 'omega')} />
        <div class="group" role="group" aria-label="גלגול">
          <button type="button" class="toggle" onClick={() => update({ omega: rollingOmega(sRef.current.Vx, WHEEL.R) || 0, playing: false }, 'roll')}>
            גלגול בלי החלקה
          </button>
        </div>
      </>
    );
  } else {
    controls = (
      <>
        <Slider label="מהירות התחלתית ω₀" min={-DISC.w0Max} max={DISC.w0Max} step={DISC.w0Step} value={s.omega0} format={rads} onChange={(x) => update({ omega0: snap(x, DISC.w0Step), playing: false }, 'omega0')} />
        <Slider label="התאוצה הזוויתית α" min={-DISC.aMax} max={DISC.aMax} step={DISC.aStep} value={s.alpha} format={(x) => `${num(x)} rad/s²`} onChange={(x) => update({ alpha: snap(x, DISC.aStep), playing: false }, 'alpha')} />
        <Slider label="המרחק של P מהציר r" min={DISC.rMin} max={DISC.R} step={DISC.rStep} value={s.r} format={(x) => `${num(x)} m`} onChange={(x) => update({ r: snap(x, DISC.rStep) }, 'r')} />
      </>
    );
  }

  const label0 =
    scene === 'rod'
      ? 'איור חי: מוט שמחליק על קרח ומסתובב, עם חצי מהירות בחמש נקודות שלו והנקודה Q שעומדת ברגע הזה. '
      : scene === 'wheel'
        ? 'איור חי: גלגל מעל כביש, עם חצי מהירות במרכז, למעלה, למטה, מלפנים ומאחור, ואבן תקועה בשפה. '
        : 'איור חי: דסקה על ציר קבוע שמסתובבת בתאוצה זוויתית קבועה, נקודה P עליה וגרפים של הזווית והמהירות הזוויתית. ';

  return (
    <SimShell
      fig={props.id}
      label={`${label0}${describe()} רווח מפעיל ועוצר; חיצים ימינה ושמאלה מזיזים את הזמן.`}
      canvasRef={canvasRef}
      aspect={scene === 'rod' ? (narrowStage ? 0.95 : 1.3) : scene === 'wheel' ? (narrowStage ? 1.35 : 2.0) : narrowStage ? 0.68 : 1.15}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      readout={readout}
      controls={
        <>
          {controls}
          <div class="group" role="group" aria-label="זמן">
            <button type="button" class="toggle" onClick={togglePlay} aria-pressed={s.playing}>
              {s.playing ? 'עצירה' : 'הפעלה'}
            </button>
          </div>
          <Slider label="הזמן t" min={t0} max={t1} step={(t1 - t0) / 400} value={tt} format={(x) => `${num(x)} s`} onChange={setTime} />
          <div class="group" role="group" aria-label="מה להציג">
            {scene !== 'alpha' && <Toggle label={<>פירוק: <bdi dir="ltr">v<sub>cm</sub> + ω × r</bdi></>} on={s.parts} swatch="var(--accent)" onChange={(x) => update({ parts: x }, 'view')} />}
            {scene !== 'alpha' && <Toggle label="קווים מ-Q" on={s.q} swatch="var(--accent)" onChange={(x) => update({ q: x }, 'view')} />}
            {scene === 'rod' && <Toggle label="מסלולים" on={s.trace} onChange={(x) => update({ trace: x }, 'view')} />}
            {scene === 'wheel' && <Toggle label="מסלול האבן" on={s.trace} swatch="var(--accent)" onChange={(x) => update({ trace: x }, 'view')} />}
            {scene === 'alpha' && <Toggle label="רכיבי התאוצה" on={s.parts} swatch="var(--accel)" onChange={(x) => update({ parts: x }, 'view')} />}
          </div>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------ drawing helpers */

/** The centre of mass: a ring with two opposite quarters filled. */
function cmMark(ctx: CanvasRenderingContext2D, c: [number, number], p: Palette, r: number) {
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.ink;
  for (const a of [0, Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(c[0], c[1]);
    ctx.arc(c[0], c[1], r, a, a + Math.PI / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Q, the point of the instantaneous axis: a ring with a cross. */
function qMark(ctx: CanvasRenderingContext2D, c: [number, number], p: Palette, r: number) {
  ctx.save();
  ctx.strokeStyle = p.accent;
  ctx.fillStyle = p.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c[0] - r * 0.7, c[1]);
  ctx.lineTo(c[0] + r * 0.7, c[1]);
  ctx.moveTo(c[0], c[1] - r * 0.7);
  ctx.lineTo(c[0], c[1] + r * 0.7);
  ctx.stroke();
  ctx.restore();
}

/** A curved arrow around c showing the sense of ω (counter-clockwise when ω > 0); nothing when ω = 0. */
function spin(ctx: CanvasRenderingContext2D, c: [number, number], r: number, omega: number, color: string) {
  if (Math.abs(omega) < 1e-9) return;
  const a0 = -Math.PI * 0.15;
  const a1 = -Math.PI * 0.85;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  // screen angles run clockwise; the arc spans the top of the circle
  ctx.arc(c[0], c[1], r, a1, a0);
  ctx.stroke();
  // the head at the end the rotation runs toward: counter-clockwise on the page = toward the left end (a1)
  const end = omega > 0 ? a1 : a0;
  const dir = omega > 0 ? -1 : 1;
  const ex = c[0] + r * Math.cos(end);
  const ey = c[1] + r * Math.sin(end);
  // the tangent along the motion (screen coordinates)
  const tx = -Math.sin(end) * dir;
  const ty = Math.cos(end) * dir;
  const h = 8;
  ctx.beginPath();
  ctx.moveTo(ex + tx * h * 0.6, ey + ty * h * 0.6);
  ctx.lineTo(ex - tx * h * 0.6 - ty * h * 0.5, ey - ty * h * 0.6 + tx * h * 0.5);
  ctx.lineTo(ex - tx * h * 0.6 + ty * h * 0.5, ey - ty * h * 0.6 - tx * h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function curve(ctx: CanvasRenderingContext2D, plot: Plot, xs: number[], ys: number[], color: string, upto: number, alpha: number) {
  const pts = xs.slice(0, upto + 1).map((x, i): [number, number] => [plot.px(x), plot.py(ys[i])]);
  polyline(ctx, pts, withAlpha(color, alpha), 2.2);
}

function line(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string, width: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.restore();
}

function dashed(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string, width = 1.2) {
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.restore();
}

function polyline(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, width: number, dash: number[] = []) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
  ctx.stroke();
  ctx.restore();
}

/** Faint grid lines every 0.5 m (the ice). */
function grid(ctx: CanvasRenderingContext2D, v: View, p: Palette, at: (x: number, y: number) => [number, number], b: { x0: number; x1: number; y0: number; y1: number }) {
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  for (let x = Math.ceil((b.x0 - 1) / 0.5) * 0.5; x <= b.x1 + 1; x += 0.5) {
    const [sx] = at(x, 0);
    if (sx < 0 || sx > v.w) continue;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, v.h);
    ctx.stroke();
  }
  for (let y = Math.ceil((b.y0 - 1) / 0.5) * 0.5; y <= b.y1 + 1; y += 0.5) {
    const [, sy] = at(0, y);
    if (sy < 0 || sy > v.h) continue;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(v.w, sy);
    ctx.stroke();
  }
  ctx.restore();
}

/** A label just beyond the tip of an arrow from `from` to `to`. */
function beyond(L: (text: string, x: number, y: number, color: string) => void, text: string, from: [number, number], to: [number, number], color: string, gap = 13) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const d = Math.hypot(dx, dy) || 1;
  L(text, to[0] + (gap * dx) / d, to[1] + (gap * dy) / d, color);
}

/** A label "base" with a subscript, just beyond the tip of an arrow from `from` to `to`. */
function beyondSub(ctx: CanvasRenderingContext2D, base: string, sub: string, from: [number, number], to: [number, number], color: string, p: Palette, size: number) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const d = Math.hypot(dx, dy) || 1;
  const x = to[0] + (15 * dx) / d;
  const y = to[1] + (15 * dy) / d;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.font = `600 ${size}px ${p.fontUi}`;
  const wb = ctx.measureText(base).width;
  ctx.font = `600 ${Math.round(size * 0.75)}px ${p.fontUi}`;
  const ws = ctx.measureText(sub).width;
  const x0 = x - (wb + ws) / 2;
  ctx.textAlign = 'left';
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 4;
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ${p.fontUi}`;
  ctx.strokeText(base, x0, y);
  ctx.fillText(base, x0, y);
  ctx.font = `600 ${Math.round(size * 0.75)}px ${p.fontUi}`;
  ctx.strokeText(sub, x0 + wb, y + size * 0.3);
  ctx.fillText(sub, x0 + wb, y + size * 0.3);
  ctx.restore();
}

/** A canvas label with a paper-coloured halo, kept inside the stage and out of the corner of the buttons. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, p: Palette, v: View, size: number) {
  ctx.save();
  ctx.font = `600 ${size}px ${p.fontUi}`;
  ctx.direction = 'ltr';
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
