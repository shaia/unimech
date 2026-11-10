/**
 * AngularMomentumLab (lesson 3.7): one particle in the plane and a reference point O the reader drags. The figure
 * draws r from O to the particle, the momentum p, the lever arm d, and the angular momentum about O as a ring at O
 * with ⊙ (out of the page, L_z > 0) or ⊗ (into the page, L_z < 0) and its value. Every L and τ names its point.
 *
 * Three scenes:
 * - 'free': a free particle on a straight line. L about any fixed O is constant (= m v d); the triangles from O to
 *   the path over equal times (1 s) have equal areas.
 * - 'central': a central force toward the fixed centre C (a spring of zero natural length, or an inverse-square
 *   pull), integrated with RK4 (src/physics/angularmomentum.ts). L about C is constant; about another O it is not:
 *   the torque about O is drawn at O, and a plot below shows L about C and about O against time, with the slope of
 *   L about O read numerically beside τ about O.
 * - 'pull': a puck on a smooth table on a string pulled through a hole O at a constant radial speed u. L about the
 *   hole is constant, the tangential speed grows as 1/r, and the string's tension makes an angle under 90° with
 *   the velocity, so it does work.
 *
 * Axes: x right, y up, z out of the page. Physics comes from src/physics/angularmomentum.ts; nothing here is a
 * physics formula beyond reading off its results.
 */

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  angularMomentumZ,
  arealVelocity,
  footOfPerpendicular,
  freePosition,
  integrate,
  inverseSquareForce,
  leverArm,
  pulledPuck,
  springForce,
  torqueZ,
  type Sample,
} from '~/physics/angularmomentum';
import { len, sub, type Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, depthGlyph, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, insetBox, makePlot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Scene = 'free' | 'central' | 'pull';
export type Law = 'spring' | 'inverse-square';

/* ------------------------------------------------------------ the scenes' physics (SI) */

/** free particle: m = 0.40 kg from (−1.5, −0.2) m at (0.8, 0.3) m/s for 4.0 s */
const FREE = { m: 0.4, p0: [-1.5, -0.2] as Vec2, v: [0.8, 0.3] as Vec2, T: 4, O: [0, 1] as Vec2 };
/** central force: m = 0.50 kg from (1.0, 0) m; spring k = 2.0 N/m at 1.0 m/s, inverse square k = 0.50 N·m² at 0.70 m/s */
const CENTRAL = {
  m: 0.5,
  pos0: [1, 0, 0] as const,
  spring: { k: 2, v0: 1 },
  inverse: { k: 0.5, v0: 0.7 },
  O: [0.6, -0.8] as Vec2,
  C: [0, 0] as Vec2,
};
/** pulled puck: m = 0.30 kg in a circle of 0.60 m at 0.80 m/s, pulled in to 0.30 m at u (default 0.05 m/s) */
const PULL = { m: 0.3, r0: 0.6, v0: 0.8, r1: 0.3, u: 0.05, uMin: 0.02, uMax: 0.1 };

/** world boxes [m]: what each scene's stage must show */
const BOX: Record<Scene, { x0: number; x1: number; y0: number; y1: number }> = {
  free: { x0: -2.0, x1: 2.4, y0: -1.0, y1: 1.75 },
  central: { x0: -1.35, x1: 1.35, y0: -1.0, y1: 0.8 },
  pull: { x0: -0.98, x1: 0.98, y0: -0.85, y1: 0.85 },
};
const ASPECT: Record<Scene, number> = { free: 1.6, central: 1.0, pull: 1.15 };
/** the orbit takes this fraction of the central scene's height; the plot the rest */
const ORBIT_FRAC = 0.6;
/** a full run plays in about this many seconds of real time */
const RUN_SECONDS = 8;
/** the reset and fullscreen buttons cover this corner of the stage (CSS px from the top-right) */
const BUTTONS_W = 96;
const BUTTONS_H = 52;
/** dragging O within this distance of the line of motion (free) or of C (central) snaps it there [m] */
const SNAP = { free: 0.06, central: 0.08 };
/** an arrow key moves O this far [m]: more than the snap distance, so a keyboard user can cross the line */
const KEY_STEP = 0.1;
/** sectors per run for the equal-area shading of the central scene */
const SECTORS = 8;

const TASK_LABEL: Record<string, string> = {
  'free-run': 'הפעילו את התנועה עד הסוף, כש-O לא על הקו. האם התנע הזוויתי ביחס ל-O השתנה?',
  'free-zero': 'גררו את O אל קו התנועה. כמה התנע הזוויתי עכשיו?',
  'free-flip': 'גררו את O לצד השני של קו התנועה. מה קרה לכיוון של התנע הזוויתי?',
  'central-at-c': 'גררו את O אל המרכז C, והפעילו מחזור שלם. איך נראה עכשיו הגרף של התנע הזוויתי ביחס ל-O?',
  'tau-zero': 'כש-O רחוקה מ-C, הזיזו את הזמן עד רגע שבו המומנט ביחס ל-O מתאפס. מה עושה הגרף של התנע הזוויתי ביחס ל-O ברגע הזה?',
  'inverse-areas': 'בחרו כוח ריבועי הפוך, הדליקו את השטחים והפעילו מחזור שלם. האם השטחים שווים?',
  'pull-half': 'משכו את החוט עד שהמרחק מהחור קטן פי 2. פי כמה גדלה המהירות המשיקית?',
  'pull-other-u': 'שנו את קצב המשיכה u ומשכו שוב עד הסוף. האם המהירות המשיקית בסוף השתנתה?',
};

const LAW_LABEL: Record<Law, string> = { spring: 'קפיץ', 'inverse-square': 'ריבועי הפוך' };

export interface AngularMomentumLabProps {
  id: string;
  scene?: Scene;
  law?: Law;
  /** offer the spring / inverse-square buttons */
  lawToggle?: boolean;
  /** the reference point O [m] (free and central scenes) */
  O?: [number, number];
  t?: number;
  areas?: boolean;
  lever?: boolean;
  /** pull speed [m/s] (pull scene) */
  u?: number;
  tasks?: string[];
}

interface State {
  law: Law;
  O: Vec2;
  t: number;
  playing: boolean;
  areas: boolean;
  lever: boolean;
  u: number;
}

function initial(p: AngularMomentumLabProps): State {
  const scene = p.scene ?? 'free';
  const O = p.O ?? (scene === 'central' ? CENTRAL.O : FREE.O);
  return {
    law: p.law ?? 'spring',
    O: [O[0], O[1]],
    t: p.t ?? 0,
    playing: false,
    areas: p.areas ?? false,
    lever: p.lever ?? true,
    u: p.u ?? PULL.u,
  };
}

/** One period of the central orbit, sampled by RK4, with its force at each sample. */
function centralRun(law: Law) {
  const { m, pos0 } = CENTRAL;
  const par = law === 'spring' ? CENTRAL.spring : CENTRAL.inverse;
  const F = law === 'spring' ? springForce(par.k) : inverseSquareForce(par.k);
  // the period: spring 2π√(m/k); inverse square 2π√(a³ m/k) with a from the energy
  let T: number;
  if (law === 'spring') T = 2 * Math.PI * Math.sqrt(m / par.k);
  else {
    const mu = par.k / m;
    const a = mu / (2 * mu / pos0[0] - par.v0 * par.v0);
    T = 2 * Math.PI * Math.sqrt((a * a * a) / mu);
  }
  const path: Sample[] = integrate({ m, pos: pos0, vel: [0, par.v0, 0] }, F, T, 2e-3);
  const forces: Vec2[] = path.map((s) => {
    const f = F(s.pos, s.vel, s.t);
    return [f[0], f[1]];
  });
  const LC = angularMomentumZ([pos0[0], pos0[1]], [0, par.v0], m, CENTRAL.C);
  const fMax = Math.max(...forces.map((f) => len(f)));
  const vMax = Math.max(...path.map((s) => Math.hypot(s.vel[0], s.vel[1])));
  return { T, path, forces, LC, fMax, vMax, h: T / (path.length - 1) };
}

const num = (x: number) => (Math.abs(x) < 5e-4 ? '0' : sci(x, 3).replace('-', '−'));
const xy = (s: Sample): Vec2 => [s.pos[0], s.pos[1]];
const vxy = (s: Sample): Vec2 => [s.vel[0], s.vel[1]];
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export default function AngularMomentumLab(props: AngularMomentumLabProps) {
  const scene: Scene = props.scene ?? 'free';
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  const userRan = useRef(false);
  const userMovedO = useRef(false);
  const userLaw = useRef(false);
  const userU = useRef(false);
  const dragging = useRef(false);
  const visible = useRef(true);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const run = useMemo(() => (scene === 'central' ? centralRun(s.law) : null), [scene, s.law]);
  const puck = useMemo(() => pulledPuck(PULL.m, PULL.r0, PULL.v0, s.u), [s.u]);
  const T = scene === 'free' ? FREE.T : scene === 'central' ? run!.T : puck.timeTo(PULL.r1);
  const tt = clamp(s.t, 0, T);

  // central: L about O along the run, and τ about O
  const LO = useMemo(
    () => (run ? run.path.map((q) => angularMomentumZ(xy(q), vxy(q), CENTRAL.m, s.O)) : []),
    [run, s.O[0], s.O[1]],
  );
  const tauO = useMemo(() => (run ? run.path.map((q, i) => torqueZ(xy(q), run.forces[i], s.O)) : []), [run, s.O[0], s.O[1]]);
  const iNow = run ? clamp(Math.round(tt / run.h), 0, run.path.length - 1) : 0;

  // the free particle's state
  const freeNow = freePosition(FREE.p0, FREE.v, tt);
  const Lfree = angularMomentumZ(FREE.p0, FREE.v, FREE.m, s.O);
  const dFree = leverArm(FREE.p0, FREE.v, s.O);
  const L0free = angularMomentumZ(FREE.p0, FREE.v, FREE.m, initial(props).O);

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev, playing: false };
          if (step.law === 'spring' || step.law === 'inverse-square') next.law = step.law;
          if (Array.isArray(step.O) && step.O.length === 2) next.O = [Number(step.O[0]), Number(step.O[1])];
          if (typeof step.areas === 'boolean') next.areas = step.areas;
          if (typeof step.lever === 'boolean') next.lever = step.lever;
          if (typeof step.u === 'number') next.u = step.u;
          if (typeof step.t === 'number') next.t = step.t;
          if (typeof step.tFrac === 'number') {
            const Tn = scene === 'free' ? FREE.T : scene === 'central' ? centralRun(next.law).T : (PULL.r0 - PULL.r1) / next.u;
            next.t = step.tFrac * Tn;
          }
          stepState.current = next;
          userRan.current = false;
          userMovedO.current = false;
          userLaw.current = false;
          userU.current = false;
          return next;
        });
      }),
    [props.id],
  );

  // playback in real time, a run in about RUN_SECONDS; still mode freezes it
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const rate = T / RUN_SECONDS;
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (motionAllowed() && visible.current && !document.hidden) {
        setS((prev) => {
          const t = prev.t + dt * rate;
          return t >= T ? { ...prev, t: T, playing: false } : { ...prev, t };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, T]);

  // tasks: checked against the figure's own state, never a state a text step produced
  useEffect(() => {
    if (s === stepState.current) return;
    const has = (id: string) => props.tasks?.includes(id);
    const done = (id: string) => markTask(`${props.id}:${id}`);
    // the time slider's last stop can fall a step short of T in floating point: within two steps counts as the end
    const atEnd = tt >= T * (1 - 2 / 400);
    if (scene === 'free') {
      if (has('free-run') && userRan.current && atEnd && dFree > 0.05) done('free-run');
      if (has('free-zero') && userMovedO.current && dFree < 0.01) done('free-zero');
      if (has('free-flip') && userMovedO.current && Math.sign(Lfree) === -Math.sign(L0free) && Math.abs(Lfree) > 0.02) done('free-flip');
    } else if (scene === 'central' && run) {
      const atC = len(sub(s.O, CENTRAL.C)) < 1e-9;
      const tauMax = Math.max(...tauO.map(Math.abs));
      if (has('central-at-c') && atC && userRan.current && atEnd) done('central-at-c');
      if (has('tau-zero') && userRan.current && len(sub(s.O, CENTRAL.C)) > 0.3 && Math.abs(tauO[iNow]) < 0.03 * tauMax) done('tau-zero');
      if (has('inverse-areas') && s.law === 'inverse-square' && s.areas && userRan.current && atEnd) done('inverse-areas');
    } else if (scene === 'pull') {
      if (has('pull-half') && userRan.current && atEnd) done('pull-half');
      if (has('pull-other-u') && userRan.current && userU.current && atEnd && Math.abs(s.u - PULL.u) > 1e-6) done('pull-other-u');
    }
  }, [s, props.id, props.tasks, T]);

  /** the world→screen map of the scene's box, centred in the stage (or in its top part, for 'central') */
  const frameOf = (view: View) => {
    const b = BOX[scene];
    const areaH = scene === 'central' ? view.h * ORBIT_FRAC : view.h;
    const ppm = Math.min(view.w / (b.x1 - b.x0), areaH / (b.y1 - b.y0));
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    const at = (x: number, y: number): [number, number] => [view.w / 2 + (x - cx) * ppm, areaH / 2 - (y - cy) * ppm];
    const back = (sx: number, sy: number): Vec2 => [cx + (sx - view.w / 2) / ppm, cy - (sy - areaH / 2) / ppm];
    return { ppm, at, back, areaH };
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const { ppm, at, areaH } = frameOf(view);
    const narrow = view.w < 520;
    const fs = narrow ? 11 : 13;
    const L = (text: string, x: number, y: number, color: string) => label(ctx, text, x, y, color, p, view, fs);
    /** the size of small marks, scaled with the stage */
    const unit = clamp(view.w / 640, 0.62, 1);
    grid(ctx, view, p, at, BOX[scene], areaH);

    if (scene === 'free') {
      const O = at(s.O[0], s.O[1]);
      // the line of motion across the stage, and the travelled part
      const far = 10;
      const A = at(FREE.p0[0] - FREE.v[0] * far, FREE.p0[1] - FREE.v[1] * far);
      const B = at(FREE.p0[0] + FREE.v[0] * far, FREE.p0[1] + FREE.v[1] * far);
      dashed(ctx, A, B, withAlpha(p.ink3, 0.8), 1.2);
      const P0 = at(FREE.p0[0], FREE.p0[1]);
      const P = at(freeNow[0], freeNow[1]);
      line(ctx, P0, P, p.ink2, 2);
      // equal-area triangles: one per second, alternating shades
      if (s.areas) {
        const n = Math.floor(tt + 1e-9);
        for (let i = 0; i <= n && i < FREE.T; i++) {
          const a = freePosition(FREE.p0, FREE.v, i);
          const e = freePosition(FREE.p0, FREE.v, Math.min(i + 1, tt));
          if (i + 1 > tt && tt - i < 1e-6) break;
          fan(ctx, O, at(a[0], a[1]), at(e[0], e[1]), i % 2 ? withAlpha(p.accent, 0.2) : withAlpha(p.momentum, 0.2));
        }
      }
      // the lever arm: from O to the foot of the perpendicular on the line
      let dAt: [number, number] | null = null;
      if (s.lever && dFree > 1e-6) {
        const f = footOfPerpendicular(FREE.p0, FREE.v, s.O);
        const Fp = at(f[0], f[1]);
        dashed(ctx, O, Fp, p.accent, 1.8);
        rightAngle(ctx, Fp, O, B, p.accent, 9 * unit);
        // beside the middle of the lever arm, on the side away from the particle
        const ux = (Fp[0] - O[0]) / (Math.hypot(Fp[0] - O[0], Fp[1] - O[1]) || 1);
        const uy = (Fp[1] - O[1]) / (Math.hypot(Fp[0] - O[0], Fp[1] - O[1]) || 1);
        const side = (P[0] - O[0]) * -uy + (P[1] - O[1]) * ux > 0 ? -1 : 1;
        dAt = [O[0] + 0.62 * (Fp[0] - O[0]) - uy * 42 * side, O[1] + 0.62 * (Fp[1] - O[1]) + ux * 42 * side];
        L(`d = ${num(dFree)} m`, dAt[0], dAt[1], p.accent);
      }
      // r from O to the particle
      arrow(ctx, O[0], O[1], P[0], P[1], { color: p.ink, width: 1.6, head: 10 });
      L('r', O[0] + (P[0] - O[0]) * 0.55 - 10, O[1] + (P[1] - O[1]) * 0.55 - 10, p.ink);
      // p, a fixed length (it never changes)
      const pl = Math.max(0.55 * ppm, 34);
      const vh = [FREE.v[0] / len(FREE.v), FREE.v[1] / len(FREE.v)];
      const Pt: [number, number] = [P[0] + vh[0] * pl, P[1] - vh[1] * pl];
      arrow(ctx, P[0], P[1], Pt[0], Pt[1], { color: p.momentum, width: 3, head: 12 });
      L('p', Pt[0] + 12, Pt[1] - 10, p.momentum);
      particle(ctx, P, p, 7 * unit);
      const f0 = footOfPerpendicular(FREE.p0, FREE.v, s.O);
      const avoid: [number, number][] = [at(f0[0], f0[1]), P, ...(dAt ? [dAt] : [])];
      pointO(ctx, O, Lfree, 0.35, p, unit, 'O', L, undefined, awayFrom(O, avoid, { w: view.w, h: areaH }));
      return;
    }

    if (scene === 'central' && run) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, view.w, areaH);
      ctx.clip();
      const C = at(CENTRAL.C[0], CENTRAL.C[1]);
      const O = at(s.O[0], s.O[1]);
      const pts = run.path.map((q) => at(q.pos[0], q.pos[1]));
      polyline(ctx, pts, withAlpha(p.ink3, 0.55), 1.2, [4, 4]);
      polyline(ctx, pts.slice(0, iNow + 1), p.ink2, 1.8);
      // equal-area sectors from C over equal times
      if (s.areas) {
        const per = (run.path.length - 1) / SECTORS;
        for (let k = 0; k < SECTORS; k++) {
          const i0 = Math.round(k * per);
          const i1 = Math.min(Math.round((k + 1) * per), iNow);
          if (i1 <= i0) break;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(C[0], C[1]);
          for (let i = i0; i <= i1; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.closePath();
          ctx.fillStyle = k % 2 ? withAlpha(p.accent, 0.2) : withAlpha(p.momentum, 0.2);
          ctx.fill();
          ctx.restore();
        }
      }
      const q = run.path[iNow];
      const P = pts[iNow];
      // the agent: a spring from C, or the attracting centre
      if (s.law === 'spring') spring(ctx, C, P, withAlpha(p.ink3, 0.6), 5 * unit);
      // the line of action of the force: through the particle and C
      const fx = run.forces[iNow];
      const fl = len(fx);
      if (fl > 0) {
        const u: Vec2 = [fx[0] / fl, fx[1] / fl];
        dashed(ctx, at(q.pos[0] - u[0] * 10, q.pos[1] - u[1] * 10), at(q.pos[0] + u[0] * 10, q.pos[1] + u[1] * 10), withAlpha(p.force, 0.45), 1.1);
      }
      // the lever arm of the force about O
      const dF = fl > 0 ? leverArm(xy(q), fx, s.O) : 0;
      if (s.lever && dF > 1e-3) {
        const f = footOfPerpendicular(xy(q), fx, s.O);
        const Fp = at(f[0], f[1]);
        dashed(ctx, O, Fp, p.accent, 1.8);
        rightAngle(ctx, Fp, O, C[0] === Fp[0] && C[1] === Fp[1] ? P : C, p.accent, 8 * unit);
      }
      // r from O, the force (toward C) and the momentum
      arrow(ctx, O[0], O[1], P[0], P[1], { color: p.ink, width: 1.5, head: 9 });
      const fLen = Math.max((fl / run.fMax) * 0.5 * ppm, 20);
      const Ft: [number, number] = [P[0] + (fx[0] / fl) * fLen, P[1] - (fx[1] / fl) * fLen];
      arrow(ctx, P[0], P[1], Ft[0], Ft[1], { color: p.force, width: 3, head: 12 });
      const vq = vxy(q);
      const vl = len(vq);
      const pLen = Math.max((vl / run.vMax) * 0.5 * ppm, 20);
      const Pt: [number, number] = [P[0] + (vq[0] / vl) * pLen, P[1] - (vq[1] / vl) * pLen];
      arrow(ctx, P[0], P[1], Pt[0], Pt[1], { color: p.momentum, width: 3, head: 12 });
      // F beside the middle of its arrow, off the spring
      const fu: Vec2 = [(Ft[0] - P[0]) / (Math.hypot(Ft[0] - P[0], Ft[1] - P[1]) || 1), (Ft[1] - P[1]) / (Math.hypot(Ft[0] - P[0], Ft[1] - P[1]) || 1)];
      L('F', (P[0] + Ft[0]) / 2 - fu[1] * 14, (P[1] + Ft[1]) / 2 + fu[0] * 14, p.force);
      beyond(L, 'p', P, Pt, p.momentum);
      particle(ctx, P, p, 7 * unit);
      // C, then O (on top when they coincide)
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(C[0], C[1], 4.5 * unit, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const atC = len(sub(s.O, CENTRAL.C)) < 1e-9;
      if (!atC) L('C', C[0] - 12, C[1] + 14, p.ink);
      const away = atC ? undefined : awayFrom(O, [P, C, at(...footOfPerpendicular(xy(q), fx, s.O))], { w: view.w, h: areaH });
      pointO(ctx, O, LO[iNow], 0.6, p, unit, atC ? 'O = C' : 'O', L, undefined, away);
      // τ about O, beside O with its name on the far side from O: away from the labels of O (which sit along
      // `away`), and clear of O's ring, r, the line of action, the lever arm and the particle
      const tq = tauO[iNow];
      const tauText = Math.abs(tq) > 1e-3 ? 'τ(O)' : 'τ(O) = 0';
      ctx.save();
      ctx.font = `600 ${fs}px ${p.fontUi}`;
      const tauHalf = ctx.measureText(tauText).width / 2;
      ctx.restore();
      const tauR = 8 * unit;
      const tauLabelAt = (q: [number, number]): [number, number] => {
        const side = q[0] >= O[0] ? 1 : -1;
        return [q[0] + side * (tauR + 5 + tauHalf), q[1]];
      };
      let tx = O[0] - 34 * unit;
      let ty = O[1] + 30 * unit;
      if (away) {
        const segs: [[number, number], [number, number]][] = [[O, P]];
        // the force's line of action across the stage (it runs through O exactly when τ about O vanishes)
        if (fl > 0) segs.push([at(q.pos[0] - (fx[0] / fl) * 10, q.pos[1] - (fx[1] / fl) * 10), at(q.pos[0] + (fx[0] / fl) * 10, q.pos[1] + (fx[1] / fl) * 10)]);
        if (s.lever && dF > 1e-3) {
          const f = footOfPerpendicular(xy(q), fx, s.O);
          segs.push([O, at(f[0], f[1])]);
        }
        const toSeg = (q: [number, number], a: [number, number], b: [number, number]) => {
          const ab: [number, number] = [b[0] - a[0], b[1] - a[1]];
          const l2 = ab[0] * ab[0] + ab[1] * ab[1] || 1;
          const t = clamp(((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1]) / l2, 0, 1);
          return Math.hypot(q[0] - a[0] - t * ab[0], q[1] - a[1] - t * ab[1]);
        };
        // the clearance of the glyph and of its label from the segments, and from the particle
        const clear = (q: [number, number]) => {
          const lab = tauLabelAt(q);
          // each probe with its own size: the glyph's radius, half the label's height
          const probes: [[number, number], number][] = [[q, tauR], [lab, 7], [[lab[0] - tauHalf, lab[1]], 7], [[lab[0] + tauHalf, lab[1]], 7]];
          const ringO = 16 * unit;
          return Math.min(
            ...probes.flatMap(([u, r]) => [
              ...segs.map(([a, b]) => toSeg(u, a, b) - r),
              Math.hypot(u[0] - P[0], u[1] - P[1]) - r,
              Math.hypot(u[0] - O[0], u[1] - O[1]) - ringO - r,
            ]),
          );
        };
        const ok = (q: [number, number]) => {
          const lx = tauLabelAt(q)[0];
          return Math.min(lx - tauHalf, q[0] - tauR) > 4 && Math.max(lx + tauHalf, q[0] + tauR) < view.w - 4 && q[1] > 14 && q[1] < areaH - 14;
        };
        const rad = 30 + 12 * unit;
        let best = -Infinity;
        for (let k = 0; k < 16; k++) {
          const a = (k * Math.PI) / 8;
          const u: [number, number] = [Math.cos(a), Math.sin(a)];
          // the half-plane of O's labels is taken
          if (u[0] * away[0] + u[1] * away[1] > 0.35) continue;
          const c: [number, number] = [O[0] + u[0] * rad, O[1] + u[1] * rad];
          const score = Math.min(clear(c), 24) + (ok(c) ? 1e4 : 0) + 1e-3 * Math.hypot(c[0] - P[0], c[1] - P[1]);
          if (score > best) {
            best = score;
            [tx, ty] = c;
          }
        }
      }
      if (Math.abs(tq) > 1e-3) depthGlyph(ctx, tx, ty, tauR, tq > 0 ? 'out' : 'in', p.force, { fill: p.paper, width: 1.8 });
      else ring(ctx, [tx, ty], p.force, tauR);
      L(tauText, ...tauLabelAt([tx, ty]), p.force);
      ctx.restore();

      // the plot: L about C and about O against t
      const box = insetBox({ x: 0, y: areaH, w: view.w, h: view.h - areaH }, { l: 56, r: 16, t: 12, b: 42 });
      const lo = Math.min(0, ...LO, run.LC);
      const hi = Math.max(...LO, run.LC);
      const pad = 0.1 * (hi - lo || 1);
      const plot = makePlot(box, { min: 0, max: run.T, label: 'הזמן t (s)' }, { min: lo - pad, max: hi + pad, label: 'L (kg·m²/s)' });
      drawAxes(ctx, plot, p);
      const curve = (ys: number[], color: string, dash: number[], upto: number, alpha = 1) => {
        const pts2 = ys.slice(0, upto + 1).map((y, i): [number, number] => [plot.px(i * run.h), plot.py(y)]);
        polyline(ctx, pts2, withAlpha(color, alpha), 2.2, dash);
      };
      // whole run faint, travelled part strong
      curve(LO, p.momentum, [], LO.length - 1, 0.25);
      curve(LO, p.momentum, [], iNow);
      curve(LO.map(() => run.LC), p.ink2, [6, 4], LO.length - 1);
      const xNow = plot.px(tt);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink, 0.5);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xNow, box.y);
      ctx.lineTo(xNow, box.y + box.h);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = p.momentum;
      ctx.beginPath();
      ctx.arc(xNow, plot.py(LO[iNow]), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // curve names: at the right end, clear of each other
      const yC = plot.py(run.LC);
      let yO = plot.py(LO[LO.length - 1]);
      if (Math.abs(yO - yC) < 16) yO = yC + (yO >= yC ? 16 : -16);
      const inBox = (y: number) => clamp(y, box.y + 8, box.y + box.h - 8);
      hebrew(ctx, 'ביחס ל-C', box.x + box.w - 4, inBox(yC - 9), p.ink2, p, fs);
      if (!atC) hebrew(ctx, 'ביחס ל-O', box.x + box.w - 4, inBox(yO + (yO > yC ? 9 : -9)), p.momentum, p, fs);
      return;
    }

    // pull: the hole, the string, the spiral, the tension and the velocity
    const O = at(0, 0);
    const n = 400;
    const spiral: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const q = puck.position((T * i) / n);
      spiral.push(at(q[0], q[1]));
    }
    polyline(ctx, spiral, withAlpha(p.ink3, 0.5), 1.1, [4, 4]);
    const done = Math.round((tt / T) * n);
    polyline(ctx, spiral.slice(0, done + 1), p.ink2, 1.8);
    // the starting circle, faint
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink3, 0.35);
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.arc(O[0], O[1], PULL.r0 * ppm, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const q = puck.position(tt);
    const v = puck.velocity(tt);
    const P = at(q[0], q[1]);
    line(ctx, O, P, p.ink2, 1.6);
    const r = puck.r(tt);
    const tension = (puck.L * puck.L) / (PULL.m * r ** 3);
    const tMax = (puck.L * puck.L) / (PULL.m * PULL.r1 ** 3);
    // never past the hole: at most three quarters of the way there
    const tl = Math.min(Math.max((tension / tMax) * 0.42 * ppm, 22), 0.75 * r * ppm);
    const rh: Vec2 = [q[0] / r, q[1] / r];
    const Tt: [number, number] = [P[0] - rh[0] * tl, P[1] + rh[1] * tl];
    arrow(ctx, P[0], P[1], Tt[0], Tt[1], { color: p.force, width: 3, head: 12 });
    const vMax = puck.speed(PULL.r1);
    const vl = len(v);
    const vLen = Math.max((vl / vMax) * 0.42 * ppm, 22);
    const Vt: [number, number] = [P[0] + (v[0] / vl) * vLen, P[1] - (v[1] / vl) * vLen];
    arrow(ctx, P[0], P[1], Vt[0], Vt[1], { color: p.velocity, width: 3, head: 12 });
    L('T', (P[0] + Tt[0]) / 2 + rh[1] * 14, (P[1] + Tt[1]) / 2 + rh[0] * 14, p.force);
    beyond(L, 'v', P, Vt, p.velocity);
    particle(ctx, P, p, 8 * unit);
    pointO(ctx, O, puck.L, 0.2, p, unit, 'O', L, [70, view.h - 16]);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [s, run, puck, LO]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const io = new IntersectionObserver((es) => {
      visible.current = es.some((e) => e.isIntersecting);
    });
    io.observe(c);
    return () => io.disconnect();
  }, []);

  /* ------------------------------------------------------------ interaction */

  /** O kept inside the box, and snapped onto the line of motion (free) or onto C (central) when close */
  const snapO = (w: Vec2): Vec2 => {
    const b = BOX[scene];
    let O: Vec2 = [clamp(w[0], b.x0 + 0.05, b.x1 - 0.05), clamp(w[1], b.y0 + 0.05, b.y1 - 0.05)];
    if (scene === 'free' && leverArm(FREE.p0, FREE.v, O) < SNAP.free) O = footOfPerpendicular(FREE.p0, FREE.v, O);
    if (scene === 'central' && len(sub(O, CENTRAL.C)) < SNAP.central) O = [CENTRAL.C[0], CENTRAL.C[1]];
    return O;
  };
  const placeO = (w: Vec2) => {
    userMovedO.current = true;
    setS((prev) => ({ ...prev, O: snapO(w) }));
  };
  /** move O by (dx, dy) from its current place (keyboard), so quick key presses never read a stale O */
  const moveO = (dx: number, dy: number) => {
    userMovedO.current = true;
    setS((prev) => ({ ...prev, O: snapO([prev.O[0] + dx, prev.O[1] + dy]) }));
  };
  const canDrag = scene !== 'pull';
  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v || !canDrag) return;
    const { at } = frameOf(v);
    const O = at(s.O[0], s.O[1]);
    if (Math.hypot(e.offsetX - O[0], e.offsetY - O[1]) > 24) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v || !dragging.current) return;
    placeO(frameOf(v).back(e.offsetX, e.offsetY));
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(describe());
    dragging.current = false;
  };

  const setTime = (t: number) => {
    userRan.current = true;
    setS((prev) => ({ ...prev, t: clamp(t, 0, T), playing: false }));
  };
  const togglePlay = () => {
    userRan.current = true;
    setS((prev) => ({ ...prev, playing: !prev.playing, t: !prev.playing && prev.t >= T * 0.999 ? 0 : prev.t }));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      togglePlay();
      return;
    }
    const dirs: Record<string, Vec2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    if (canDrag) {
      moveO(KEY_STEP * d[0], KEY_STEP * d[1]);
      setLive(describe());
    } else setTime(tt + d[0] * (T / 40));
  };
  const reset = () => {
    stepState.current = null;
    userRan.current = false;
    userMovedO.current = false;
    userLaw.current = false;
    userU.current = false;
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const dir = (Lz: number) => (Math.abs(Lz) < 5e-4 ? 'אפס' : Lz > 0 ? 'החוצה מהדף' : 'לתוך הדף');
  function describe() {
    if (scene === 'free')
      return `חלקיק חופשי ברגע t = ${num(tt)} s. התנע הזוויתי ביחס ל-O הוא ${num(Lfree)} kg·m²/s, ${dir(Lfree)}; הזרוע d = ${num(dFree)} m.`;
    if (scene === 'central' && run)
      return `כוח מרכזי (${LAW_LABEL[s.law]}) ברגע t = ${num(tt)} s. התנע הזוויתי ביחס ל-C הוא ${num(run.LC)} kg·m²/s, וביחס ל-O ${num(LO[iNow])} kg·m²/s; המומנט ביחס ל-O ${num(tauO[iNow])} N·m.`;
    const r = puck.r(tt);
    return `דסקית על חוט ברגע t = ${num(tt)} s: r = ${num(r)} m, מהירות משיקית ${num(puck.vTheta(r))} m/s, התנע הזוויתי ביחס לחור ${num(puck.L)} kg·m²/s.`;
  }

  /* ------------------------------------------------------------ readouts */

  let readout: ComponentChildren;
  if (scene === 'free') {
    const area = arealVelocity(Lfree, FREE.m);
    readout = (
      <>
        <span class="q" data-readout="t">t = {num(tt)} s</span>
        <b class="q" data-readout="L">L<sub>z</sub>(O) = {num(Lfree)} kg·m²/s</b>
        <span class="q" data-readout="d">d = {num(dFree)} m</span>
        <span class="q" data-readout="mvd">m|v|d = {num(FREE.m * len(FREE.v) * dFree)} kg·m²/s</span>
        <span class="q" data-readout="r">|r| = {num(len(sub(freeNow, s.O)))} m</span>
        {s.areas && <span class="q" data-readout="area">ΔA (1 s) = {num(Math.abs(area))} m²</span>}
      </>
    );
  } else if (scene === 'central' && run) {
    const i0 = Math.max(0, iNow - 1);
    const i1 = Math.min(LO.length - 1, iNow + 1);
    const slope = (LO[i1] - LO[i0]) / ((i1 - i0) * run.h);
    readout = (
      <>
        <span class="q" data-readout="t">t = {num(tt)} s</span>
        <span class="q" data-readout="LC">L<sub>z</sub>(C) = {num(run.LC)} kg·m²/s</span>
        <b class="q" data-readout="LO">L<sub>z</sub>(O) = {num(LO[iNow])} kg·m²/s</b>
        <b class="q" data-readout="tau">τ<sub>z</sub>(O) = {num(tauO[iNow])} N·m</b>
        <span class="q" data-readout="slope">ΔL<sub>z</sub>(O)/Δt = {num(slope)} N·m</span>
      </>
    );
  } else {
    const r = puck.r(tt);
    const v = puck.velocity(tt);
    const q = puck.position(tt);
    // the angle between the tension (toward the hole, −r̂) and the velocity
    const cosA = -(q[0] * v[0] + q[1] * v[1]) / (r * len(v));
    readout = (
      <>
        <span class="q" data-readout="t">t = {num(tt)} s</span>
        <span class="q" data-readout="r">r = {num(r)} m</span>
        <b class="q" data-readout="vt">v<sub>θ</sub> = {num(puck.vTheta(r))} m/s</b>
        <span class="q" data-readout="rv">r·v<sub>θ</sub> = {num(r * puck.vTheta(r))} m²/s</span>
        <b class="q" data-readout="L">L<sub>z</sub>(O) = {num(puck.L)} kg·m²/s</b>
        <span class="q" data-readout="K">K = {num(puck.kinetic(r))} J</span>
        <span class="q" data-readout="angle">∠(T, v) = {sci((Math.acos(clamp(cosA, -1, 1)) * 180) / Math.PI, 3)}°</span>
      </>
    );
  }

  const label0 =
    scene === 'free'
      ? 'איור חי: חלקיק חופשי נע בקו ישר, ונקודה O שאפשר לגרור. '
      : scene === 'central'
        ? 'איור חי: חלקיק תחת כוח מרכזי אל C, ונקודה O שאפשר לגרור, וגרף של התנע הזוויתי ביחס ל-C וביחס ל-O. '
        : 'איור חי: דסקית על חוט שנמשך דרך חור בשולחן. ';
  return (
    <SimShell
      fig={props.id}
      label={`${label0}${describe()} רווח מפעיל ועוצר${canDrag ? '; חיצים מזיזים את O' : '; חיצים מזיזים את הזמן'}.`}
      canvasRef={canvasRef}
      aspect={ASPECT[scene]}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={canDrag ? (dragging.current ? 'grabbing' : 'grab') : 'default'}
      readout={readout}
      controls={
        <>
          {scene === 'central' && props.lawToggle && (
            <div class="group" role="group" aria-label="חוק הכוח">
              {(['spring', 'inverse-square'] as Law[]).map((law) => (
                <Toggle
                  key={law}
                  label={LAW_LABEL[law]}
                  on={s.law === law}
                  onChange={() => {
                    userLaw.current = true;
                    userRan.current = false;
                    setS((prev) => ({ ...prev, law, t: 0, playing: false }));
                    setLive(`נבחר כוח ${LAW_LABEL[law]}.`);
                  }}
                />
              ))}
            </div>
          )}
          <div class="group" role="group" aria-label="זמן">
            <button type="button" class="toggle" onClick={togglePlay} aria-pressed={s.playing}>
              {s.playing ? 'עצירה' : 'הפעלה'}
            </button>
          </div>
          <Slider label="הזמן t" min={0} max={T} step={T / 400} value={tt} format={(t) => `${num(t)} s`} onChange={setTime} />
          {scene === 'pull' && (
            <Slider
              label="קצב המשיכה u"
              min={PULL.uMin}
              max={PULL.uMax}
              step={0.01}
              value={s.u}
              format={(u) => `${sci(u, 2)} m/s`}
              onChange={(u) => {
                userU.current = true;
                userRan.current = false;
                setS((prev) => ({ ...prev, u: Math.round(u * 100) / 100, t: 0, playing: false }));
              }}
            />
          )}
          <div class="group" role="group" aria-label="מה להציג">
            {scene !== 'pull' && <Toggle label="זרוע" on={s.lever} swatch="var(--accent)" onChange={(x) => setS({ ...s, lever: x })} />}
            {scene !== 'pull' && <Toggle label="שטחים" on={s.areas} swatch="var(--momentum)" onChange={(x) => setS({ ...s, areas: x })} />}
            {canDrag && (
              <button
                type="button"
                class="toggle"
                onClick={() => {
                  userMovedO.current = true;
                  setS((prev) => ({ ...prev, O: scene === 'central' ? [CENTRAL.C[0], CENTRAL.C[1]] : initial(props).O }));
                }}
              >
                {scene === 'central' ? 'O אל C' : 'O למקום ההתחלתי'}
              </button>
            )}
          </div>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------ drawing helpers */

/**
 * The reference point O as a ring: ⊙ inside when L_z > 0 (out of the page), ⊗ when L_z < 0, empty when L_z = 0. The
 * ring's size grows with |L| (up to `scale`), and beside it the point's name and the value of L_z.
 */
function pointO(
  ctx: CanvasRenderingContext2D,
  O: [number, number],
  Lz: number,
  scale: number,
  p: Palette,
  unit: number,
  name: string,
  L: (text: string, x: number, y: number, color: string) => void,
  valueAt?: [number, number],
  away?: [number, number],
) {
  const r = (9 + 7 * Math.min(1, Math.abs(Lz) / scale)) * unit;
  if (Math.abs(Lz) < 5e-4) ring(ctx, O, p.momentum, r);
  else depthGlyph(ctx, O[0], O[1], r, Lz > 0 ? 'out' : 'in', p.momentum, { fill: p.paper, width: 2.2 });
  const value = `L(O) = ${Math.abs(Lz) < 5e-4 ? '0' : sci(Lz, 3).replace('-', '−')}`;
  if (away) {
    // the name close to the ring, the value further out on the same side, clear of both
    ctx.save();
    ctx.font = `600 13px ${p.fontUi}`;
    const w = ctx.measureText(value).width;
    ctx.restore();
    L(name, O[0] + away[0] * (r + 11), O[1] + away[1] * (r + 11), p.ink);
    const k = r + 26;
    L(value, O[0] + away[0] * (k + w / 2), O[1] + away[1] * k + (away[1] >= 0 ? 6 : -6), p.momentum);
  } else {
    L(name, O[0] - r - (name.length > 2 ? 26 : 12), O[1] - r - 4, p.ink);
    if (!valueAt) L(value, O[0] + r + 36, O[1] - r - 4, p.momentum);
  }
  if (valueAt) L(`${value} kg·m²/s`, valueAt[0] + 40, valueAt[1], p.momentum);
}

/**
 * A unit direction from O for O's labels: of eight directions, the one farthest (in angle) from the given screen
 * points, among those whose labels (about `reach` px out, `half` px wide) stay inside the drawing area.
 */
function awayFrom(O: [number, number], pts: [number, number][], area: { w: number; h: number }, reach = 30, half = 48): [number, number] {
  const dirs = pts
    .map((q) => [q[0] - O[0], q[1] - O[1]] as [number, number])
    .filter((d) => Math.hypot(d[0], d[1]) > 1e-6)
    .map((d) => Math.atan2(d[1], d[0]));
  let best: [number, number] = [-0.7071, -0.7071];
  let bestScore = -Infinity;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const u: [number, number] = [Math.cos(a), Math.sin(a)];
    // where pointO puts the value label: `reach` out along u, shifted half its width further sideways
    const x = O[0] + u[0] * (reach + half);
    const y = O[1] + u[1] * reach;
    const inside = x - half > 4 && x + half < area.w - 4 && y > 12 && y < area.h - 12;
    const sep = dirs.length ? Math.min(...dirs.map((d) => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d))))) : Math.PI;
    const score = sep + (inside ? 10 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = u;
    }
  }
  return best;
}

function particle(ctx: CanvasRenderingContext2D, P: [number, number], p: Palette, r: number) {
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(P[0], P[1], Math.max(4, r), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function ring(ctx: CanvasRenderingContext2D, at: [number, number], color: string, r: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(at[0], at[1], r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
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

function fan(ctx: CanvasRenderingContext2D, O: [number, number], a: [number, number], b: [number, number], fill: string) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(O[0], O[1]);
  ctx.lineTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

/** A right-angle mark at the corner F, between the directions F→A and F→B. */
function rightAngle(ctx: CanvasRenderingContext2D, F: [number, number], A: [number, number], B: [number, number], color: string, s: number) {
  const ua = unitOf(F, A);
  const ub = unitOf(F, B);
  if (!ua || !ub) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(F[0] + ua[0] * s, F[1] + ua[1] * s);
  ctx.lineTo(F[0] + (ua[0] + ub[0]) * s, F[1] + (ua[1] + ub[1]) * s);
  ctx.lineTo(F[0] + ub[0] * s, F[1] + ub[1] * s);
  ctx.stroke();
  ctx.restore();
}

function unitOf(a: [number, number], b: [number, number]): [number, number] | null {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return d < 1e-6 ? null : [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
}

/** A zigzag spring from C to the particle (equipment, drawn thin). */
function spring(ctx: CanvasRenderingContext2D, C: [number, number], P: [number, number], color: string, amp: number) {
  const d = Math.hypot(P[0] - C[0], P[1] - C[1]);
  if (d < 4) return;
  const u = [(P[0] - C[0]) / d, (P[1] - C[1]) / d];
  const nrm = [-u[1], u[0]];
  const turns = 12;
  const lead = Math.min(10, d * 0.15);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(C[0], C[1]);
  ctx.lineTo(C[0] + u[0] * lead, C[1] + u[1] * lead);
  for (let i = 1; i < 2 * turns; i++) {
    const s = lead + ((d - 2 * lead) * i) / (2 * turns);
    const side = i % 2 ? 1 : -1;
    ctx.lineTo(C[0] + u[0] * s + nrm[0] * amp * side, C[1] + u[1] * s + nrm[1] * amp * side);
  }
  ctx.lineTo(P[0] - u[0] * lead, P[1] - u[1] * lead);
  ctx.lineTo(P[0], P[1]);
  ctx.stroke();
  ctx.restore();
}

/** Faint grid lines every 0.5 m in the scene's drawing area. */
function grid(
  ctx: CanvasRenderingContext2D,
  v: View,
  p: Palette,
  at: (x: number, y: number) => [number, number],
  b: { x0: number; x1: number; y0: number; y1: number },
  areaH: number,
) {
  ctx.save();
  // the rule token already carries its own (low) alpha: use it as it is, so the grid stays under the dashed paths
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  const step = 0.5;
  for (let x = Math.ceil((b.x0 - 1) / step) * step; x <= b.x1 + 1; x += step) {
    const [sx] = at(x, 0);
    if (sx < 0 || sx > v.w) continue;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, areaH);
    ctx.stroke();
  }
  for (let y = Math.ceil((b.y0 - 1) / step) * step; y <= b.y1 + 1; y += step) {
    const [, sy] = at(0, y);
    if (sy < 0 || sy > areaH) continue;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(v.w, sy);
    ctx.stroke();
  }
  ctx.restore();
}

/** A label just beyond the tip of an arrow from `from` to `to`. */
function beyond(
  L: (text: string, x: number, y: number, color: string) => void,
  text: string,
  from: [number, number],
  to: [number, number],
  color: string,
  gap = 13,
) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const d = Math.hypot(dx, dy) || 1;
  L(text, to[0] + (gap * dx) / d, to[1] + (gap * dy) / d, color);
}

/**
 * A canvas label with a paper-coloured halo, kept inside the stage and out of the top-right corner where the
 * reset and fullscreen buttons sit.
 */
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

/** A Hebrew label, right-aligned at x (an RTL run, so a Latin letter at its end stays in place). */
function hebrew(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, p: Palette, size: number) {
  ctx.save();
  ctx.font = `600 ${size}px ${p.fontUi}`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = p.paper;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
