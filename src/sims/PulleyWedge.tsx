/**
 * PulleyWedge (lesson 2.5): bodies tied by constraints, released from rest.
 *  - 'atwood': two bodies on the two ends of one string over a fixed pulley (y₁ + y₂ = const);
 *  - 'movable': body 1 on the free end, body 2 on a movable pulley held by two segments of the string,
 *    whose other end is tied to the ceiling (y₁ + 2y₂ = const);
 *  - 'wedge': a block on the smooth face of a wedge that is itself free on a smooth floor.
 * The string-length toggle draws the depths y₁, y₂ from the ceiling and their constant combination; the
 * relative-acceleration toggle draws a = a_rel + A as a vector triangle on the block; the paths toggle
 * draws the block's path over the floor beside the face's starting direction. A free-body diagram shows
 * the forces on one chosen body only.
 *
 * Physics comes from src/physics/constraints.ts. Every acceleration is constant, so positions are
 * ½at² from rest, exactly.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import { freeWedge, hangingPulleys } from '~/physics/constraints';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type PresetName = 'atwood' | 'movable' | 'wedge';
type Fbd = 'none' | 'b1' | 'b2' | 'block' | 'wedge';

const WORLD_W = 2.4;
const WORLD_H = 2.0;
/** the reset and fullscreen buttons cover this corner of the stage (CSS px from the top-right) */
const BUTTONS_W = 96;
const BUTTONS_H = 52;
/** a full run plays in about this many seconds of real time */
const RUN_SECONDS = 4;

/* pulley scenes: depths below the ceiling [m]; world y = CEIL − depth */
const CEIL = 1.9;
const R_P = 0.15;
const FIXED_DEPTH = 0.3;
const BOX = 0.2;
/** the movable pulley's block hangs this far below the pulley's centre (to the block's top) */
const HOOK = 0.24;
const Y1_0 = 1.0;
const Y2_0 = 1.0;
const Y2_0_MOVABLE = 0.85;
const Y1_RANGE: [number, number] = [0.6, 1.62];
const Y2_RANGE_ATWOOD: [number, number] = [0.6, 1.62];
const Y2_RANGE_MOVABLE: [number, number] = [0.62, 1.38];
const X_ATWOOD = 1.2;
const X_ANCHOR = 0.8;
const X_MOVABLE = X_ANCHOR + R_P;
const X_FIXED = X_MOVABLE + 2 * R_P;
const X_B1_MOVABLE = X_FIXED + R_P;

/* wedge scene [m] */
const FLOOR = 0.42;
const FACE = 1.3;
const X_WEDGE = 0.85;
const S0 = 0.08;
const BLOCK = 0.16;
const S_END = FACE - 0.22;

/** acceleration arrows: world metres per m/s² */
const A_SCALE = 0.07;

const M_PULLEY: [number, number] = [0.5, 6];
const M_BLOCK: [number, number] = [0.5, 4];
const M_WEDGE: [number, number] = [1, 20];
const TH_RANGE: [number, number] = [20, 60];

const PRESET_LABEL: Record<PresetName, string> = {
  atwood: 'מכונת אטווד',
  movable: 'גלגלת נעה',
  wedge: 'טריז חופשי',
};

const TASK_LABEL: Record<string, string> = {
  'movable-run': 'בגלגלת הנעה, הריצו עד שגוש 1 זז 0.40 m. כמה זז גוש 2, ולאיזה כיוון?',
  'movable-balance': 'בגלגלת הנעה, שנו את המסות עד שהמערכת נשארת במנוחה. מה היחס m₂/m₁?',
  'atwood-limit': 'במכונת אטווד, קבעו את m₁ הקטנה ביותר ואת m₂ הגדולה ביותר. האם התאוצה מגיעה ל-g?',
  'wedge-rel': 'הדליקו "תאוצה יחסית" והריצו. לאן מצביעה התאוצה של הגוש ביחס לטריז, ולאן ביחס לרצפה?',
  'wedge-path': 'הדליקו "מסלולים" והריצו עד הסוף. האם הגוש יורד ביחס לרצפה בזווית θ, או בזווית תלולה יותר?',
  'wedge-heavy': 'הגדילו את M עד הסוף. מה קורה לתאוצה של הטריז ולכוח הנורמלי?',
};

interface State {
  preset: PresetName;
  m1: number;
  m2: number;
  m: number;
  M: number;
  theta: number;
  t: number;
  playing: boolean;
  showLengths: boolean;
  showAccel: boolean;
  showRel: boolean;
  showPaths: boolean;
  fbd: Fbd;
}

export interface PulleyWedgeProps {
  id: string;
  preset?: PresetName;
  /** presets offered as buttons (default: only the starting one, no buttons) */
  presets?: PresetName[];
  m1?: number;
  m2?: number;
  m?: number;
  M?: number;
  theta?: number;
  showLengths?: boolean;
  showAccel?: boolean;
  showRel?: boolean;
  showPaths?: boolean;
  fbd?: Fbd;
  tasks?: string[];
}

function initial(p: PulleyWedgeProps): State {
  return {
    preset: p.preset ?? 'movable',
    m1: p.m1 ?? 2,
    m2: p.m2 ?? 3.5,
    m: p.m ?? 1,
    M: p.M ?? 2,
    theta: p.theta ?? 35,
    t: 0,
    playing: false,
    showLengths: p.showLengths ?? false,
    showAccel: p.showAccel ?? true,
    showRel: p.showRel ?? false,
    showPaths: p.showPaths ?? false,
    fbd: p.fbd ?? 'none',
  };
}

/** Everything about a run that does not change with t. */
function runOf(s: State) {
  if (s.preset === 'wedge') {
    const w = freeWedge(s.m, s.M, s.theta);
    const th = (s.theta * Math.PI) / 180;
    const tEnd = Math.sqrt((2 * (S_END - S0)) / w.aRel);
    return { kind: 'wedge' as const, w, th, tEnd };
  }
  const n = s.preset === 'atwood' ? 1 : 2;
  const sol = hangingPulleys(s.m1, s.m2, n);
  const y20 = n === 1 ? Y2_0 : Y2_0_MOVABLE;
  const r2 = n === 1 ? Y2_RANGE_ATWOOD : Y2_RANGE_MOVABLE;
  /** time for a body starting at y0 with acceleration a to reach the edge of [lo, hi] */
  const hit = (y0: number, a: number, [lo, hi]: [number, number]) =>
    Math.abs(a) < 1e-9 ? Infinity : Math.sqrt((2 * (a > 0 ? hi - y0 : y0 - lo)) / Math.abs(a));
  const tHit = Math.min(hit(Y1_0, sol.a1, Y1_RANGE), hit(y20, sol.a2, r2));
  // a balanced system still gets a time axis, so playing it shows that nothing moves
  return { kind: 'pulley' as const, n, sol, y20, tEnd: Number.isFinite(tHit) ? tHit : 2 };
}

const num = (x: number) => (Math.abs(x) < 5e-4 ? '0' : sci(x, 3).replace('-', '−'));
const vert = (a: number) => (Math.abs(a) < 5e-4 ? '' : a > 0 ? ' למטה' : ' למעלה');
const horiz = (a: number) => (Math.abs(a) < 5e-4 ? '' : a > 0 ? ' ימינה' : ' שמאלה');
const clamp = (x: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, x));

export default function PulleyWedge(props: PulleyWedgeProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  /** since the last step or preset change: the reader ran or scrubbed time / moved a mass slider / toggled */
  const userRan = useRef(false);
  const userMass = useRef(false);
  const userToggled = useRef(false);
  const visible = useRef(true);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const run = useMemo(() => runOf(s), [s.preset, s.m1, s.m2, s.m, s.M, s.theta]);
  const t = Math.min(s.t, run.tEnd);

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev, playing: false };
          if (typeof step.preset === 'string' && step.preset in PRESET_LABEL) next.preset = step.preset as PresetName;
          for (const k of ['m1', 'm2', 'm', 'M', 'theta', 't'] as const) {
            if (typeof step[k] === 'number') next[k] = step[k] as number;
          }
          for (const k of ['showLengths', 'showAccel', 'showRel', 'showPaths'] as const) {
            if (typeof step[k] === 'boolean') next[k] = step[k] as boolean;
          }
          if (typeof step.fbd === 'string') next.fbd = step.fbd as Fbd;
          if (typeof step.tFrac === 'number') next.t = (step.tFrac as number) * runOf(next).tEnd;
          else if (typeof step.t !== 'number') next.t = 0;
          stepState.current = next;
          userRan.current = false;
          userMass.current = false;
          userToggled.current = false;
          return next;
        });
      }),
    [props.id],
  );

  // playback: advance t in real time, scaled so a run lasts about RUN_SECONDS; still mode freezes it
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const rate = run.tEnd / RUN_SECONDS;
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (motionAllowed() && visible.current && !document.hidden) {
        setS((prev) => {
          const tt = prev.t + dt * rate;
          return tt >= run.tEnd ? { ...prev, t: run.tEnd, playing: false } : { ...prev, t: tt };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, run]);

  // tasks: checked against the figure's own state, never against a state a text step produced
  useEffect(() => {
    if (s === stepState.current) return;
    const has = (id: string) => props.tasks?.includes(id);
    const done = (id: string) => markTask(`${props.id}:${id}`);
    if (run.kind === 'pulley') {
      const dy1 = 0.5 * run.sol.a1 * t * t;
      if (has('movable-run') && userRan.current && s.preset === 'movable' && Math.abs(dy1) >= 0.4 - 1e-9) done('movable-run');
      if (has('movable-balance') && userMass.current && s.preset === 'movable' && Math.abs(s.m2 - 2 * s.m1) < 1e-6) done('movable-balance');
      if (has('atwood-limit') && userMass.current && s.preset === 'atwood' && s.m1 <= M_PULLEY[0] + 1e-9 && s.m2 >= M_PULLEY[1] - 1e-9) {
        done('atwood-limit');
      }
    } else {
      if (has('wedge-rel') && userRan.current && userToggled.current && s.showRel && t > 0) done('wedge-rel');
      // "to the end": the last slider step may sit a rounding error below tEnd
      if (has('wedge-path') && userRan.current && s.showPaths && t >= 0.99 * run.tEnd) done('wedge-path');
      if (has('wedge-heavy') && userMass.current && s.M >= M_WEDGE[1] - 1e-9) done('wedge-heavy');
    }
  }, [s, props.id, props.tasks, run, t]);

  const draw = ({ ctx, view: frame, palette: p }: FrameInfo) => {
    // the scene lives in 0…WORLD_W × 0…WORLD_H; the canvas centre shows the middle of that box
    const view: View = { ...frame, ox: WORLD_W / 2, oy: WORLD_H / 2 };
    const at = (x: number, y: number) => toScreen(view, x, y);
    const L = (text: string, x: number, y: number, color: string) => label(ctx, text, x, y, color, p, view);
    /** an arrow from a world point along a world vector */
    const vec = (x: number, y: number, dx: number, dy: number, color: string, width = 3, alpha = 1) => {
      const [sx, sy] = at(x, y);
      const [ex, ey] = at(x + dx, y + dy);
      arrow(ctx, sx, sy, ex, ey, { color, width, head: 11, alpha });
      return [ex, ey] as [number, number];
    };
    const beyond = (text: string, x: number, y: number, dx: number, dy: number, color: string, gap = 14) => {
      const [ex, ey] = at(x + dx, y + dy);
      const d = Math.hypot(dx, dy) || 1;
      L(text, ex + (gap * dx) / d, ey - (gap * dy) / d, color);
    };

    if (run.kind === 'pulley') {
      const { sol, n, y20 } = run;
      const y1 = Y1_0 + 0.5 * sol.a1 * t * t;
      const y2 = y20 + 0.5 * sol.a2 * t * t;
      const W = (d: number) => CEIL - d;
      // ceiling
      hatch(ctx, at(0.25, CEIL), at(2.15, CEIL), p, true);

      const x1 = n === 1 ? X_ATWOOD - R_P : X_B1_MOVABLE;
      const xF = n === 1 ? X_ATWOOD : X_FIXED;
      const x2 = n === 1 ? X_ATWOOD + R_P : X_MOVABLE;
      // fixed pulley and its hanger
      line(ctx, at(xF, CEIL), at(xF, W(FIXED_DEPTH)), p.ink2, 2);
      wheel(ctx, at(xF, W(FIXED_DEPTH)), R_P * view.ppm, p);
      const seg = (xa: number, ya: number, xb: number, yb: number, hot = false) =>
        line(ctx, at(xa, ya), at(xb, yb), hot ? p.accent : p.ink, hot ? 2.6 : 1.8);
      // string to body 1
      seg(x1, W(FIXED_DEPTH), x1, W(y1));
      if (n === 1) {
        seg(x2, W(FIXED_DEPTH), x2, W(y2), s.showLengths);
      } else {
        // fixed pulley ↓ movable pulley ↑ ceiling anchor
        seg(X_MOVABLE + R_P, W(FIXED_DEPTH), X_MOVABLE + R_P, W(y2), s.showLengths);
        seg(X_ANCHOR, CEIL, X_ANCHOR, W(y2), s.showLengths);
        wheel(ctx, at(X_MOVABLE, W(y2)), R_P * view.ppm, p);
        line(ctx, at(X_MOVABLE, W(y2)), at(X_MOVABLE, W(y2 + HOOK)), p.ink2, 2);
        if (s.showLengths) {
          const ym = at(0, W((FIXED_DEPTH + y2) / 2))[1];
          L('1', at(X_ANCHOR, 0)[0] - 12, ym, p.accent);
          L('2', at(X_MOVABLE + R_P, 0)[0] + 12, ym, p.accent);
        }
      }
      // bodies (their top at the coordinate point; the movable one hangs HOOK below the pulley)
      const top2 = n === 1 ? y2 : y2 + HOOK;
      box(ctx, at(x1 - BOX / 2, W(y1)), BOX * view.ppm, `m₁ ${num(s.m1)}`, p);
      box(ctx, at(x2 - BOX / 2, W(top2)), BOX * view.ppm, `m₂ ${num(s.m2)}`, p);

      // the coordinates measured from the ceiling
      if (s.showLengths) {
        // atwood: y₁ to the left of body 1, y₂ to the right of body 2; movable: y₁ right of body 1, y₂ left of the anchor
        const sd1 = n === 1 ? -1 : 1;
        const xd1 = x1 + sd1 * (BOX / 2 + 0.12);
        const xd2 = n === 1 ? x2 + BOX / 2 + 0.12 : X_ANCHOR - 0.2;
        const sd2 = n === 1 ? 1 : -1;
        dimension(ctx, at(xd1, CEIL), at(xd1, W(y1)), p.ink2);
        L(`y₁ = ${num(y1)} m`, at(xd1, 0)[0] + sd1 * 46, at(0, W(y1 / 2))[1], p.ink2);
        dimension(ctx, at(xd2, CEIL), at(xd2, W(y2)), p.ink2);
        L(`y₂ = ${num(y2)} m`, at(xd2, 0)[0] + sd2 * 46, at(0, W(y2 / 2))[1], p.ink2);
      }

      // accelerations
      if (s.showAccel) {
        const c1: [number, number] = [x1, W(y1 + BOX / 2)];
        const c2: [number, number] = [x2, W(top2 + BOX / 2)];
        // each arrow beside its body, on the side away from the other body's strings
        const s1 = n === 1 ? -1 : 1;
        for (const [c, a, name, side] of [
          [c1, sol.a1, 'a₁', s1],
          [c2, sol.a2, 'a₂', -s1],
        ] as const) {
          const dx = side * (BOX / 2 + 0.06);
          if (Math.abs(a) > 5e-4) {
            vec(c[0] + dx, c[1], 0, -a * A_SCALE, p.accel, 3);
            beyond(name, c[0] + dx, c[1], 0, -a * A_SCALE, p.accel);
          } else L(`${name} = 0`, at(c[0] + dx, 0)[0] + side * 18, at(0, c[1])[1], p.accel);
        }
      }

      // free-body diagram of one body
      if (s.fbd === 'b1' || s.fbd === 'b2') {
        const one = s.fbd === 'b1';
        const m = one ? s.m1 : s.m2;
        const fMax = Math.max(s.m1 * G, s.m2 * G, n * sol.T);
        const k = 0.55 / fMax;
        const cx = one ? x1 : x2;
        const cy = one ? W(y1 + BOX / 2) : W(top2 + BOX / 2);
        vec(cx, cy, 0, -m * G * k, p.force, 2.6);
        beyond(one ? 'm₁g' : 'm₂g', cx, cy, 0, -m * G * k, p.force);
        if (one || n === 1) {
          const ty = one ? W(y1) : W(y2);
          vec(cx, ty, 0, sol.T * k, p.force, 2.6);
          beyond('T', cx, ty, 0, sol.T * k, p.force);
        } else {
          // the body with its massless pulley: two segments pull up, each with T
          for (const xs of [X_MOVABLE - R_P, X_MOVABLE + R_P]) {
            vec(xs, W(y2), 0, sol.T * k, p.force, 2.6);
            beyond('T', xs, W(y2), 0, sol.T * k, p.force);
          }
        }
      }
    } else {
      const { w, th } = run;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const H = FACE * sn;
      const B = FACE * c;
      const X = X_WEDGE + 0.5 * w.A * t * t;
      const sRel = S0 + 0.5 * w.aRel * t * t;
      // floor
      hatch(ctx, at(0, FLOOR), at(WORLD_W, FLOOR), p, false);
      // the face where it started (faint) and the block's ground path
      const P0: [number, number] = [X_WEDGE + S0 * c, FLOOR + H - S0 * sn];
      const P: [number, number] = [X + sRel * c, FLOOR + H - sRel * sn];
      if (s.showPaths) {
        const far = FACE;
        dashedLine(ctx, at(P0[0], P0[1]), at(P0[0] + far * c, P0[1] - far * sn), withAlpha(p.ink3, 0.8));
        const pc = Math.cos(w.pathAngle);
        const ps = Math.sin(w.pathAngle);
        const reach = (P0[1] - FLOOR) / ps;
        dashedLine(ctx, at(P0[0], P0[1]), at(P0[0] + reach * pc, FLOOR), withAlpha(p.velocity, 0.6));
        line(ctx, at(P0[0], P0[1]), at(P[0], P[1]), p.velocity, 2.2);
        L('θ', at(P0[0] + 0.5 * c, 0)[0] + 8, at(0, P0[1] - 0.5 * sn)[1] + 14, p.ink3);
        L('φ', at(P0[0] + 0.32 * pc, 0)[0] - 14, at(0, P0[1] - 0.32 * ps)[1], p.velocity);
      }
      // the wedge
      ctx.save();
      ctx.beginPath();
      const v0 = at(X, FLOOR);
      const v1 = at(X, FLOOR + H);
      const v2 = at(X + B, FLOOR);
      ctx.moveTo(v0[0], v0[1]);
      ctx.lineTo(v1[0], v1[1]);
      ctx.lineTo(v2[0], v2[1]);
      ctx.closePath();
      ctx.fillStyle = p.paper2;
      ctx.fill();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
      // low on the wedge, clear of A at the centroid and of the block's weight arrow near the back
      // a steep wedge is narrow on a phone: its name alone, clear of the θ at the toe (the slider gives M)
      L(B * view.ppm < 120 ? 'M' : `M ${num(s.M)} kg`, at(X + (B * view.ppm < 120 ? 0.3 : 0.45) * B, 0)[0], at(0, FLOOR + 0.1)[1], p.ink2);
      // θ at the toe
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(v2[0], v2[1], 26, Math.PI, Math.PI + th);
      ctx.stroke();
      ctx.restore();
      L('θ', v2[0] - 36, v2[1] - 9, p.ink3);

      // the block: a square standing on the face, its contact point P
      const nrm: [number, number] = [sn, c];
      const Cb: [number, number] = [P[0] + nrm[0] * (BLOCK / 2), P[1] + nrm[1] * (BLOCK / 2)];
      ctx.save();
      const cs = at(Cb[0], Cb[1]);
      ctx.translate(cs[0], cs[1]);
      ctx.rotate(th);
      const side = BLOCK * view.ppm;
      ctx.fillStyle = p.paper;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.8;
      ctx.fillRect(-side / 2, -side / 2, side, side);
      ctx.strokeRect(-side / 2, -side / 2, side, side);
      ctx.restore();
      L('m', cs[0], cs[1], p.ink);

      const Wc: [number, number] = [X + B / 3, FLOOR + H / 3];
      if (s.showAccel || s.showRel) {
        // the block's acceleration over the floor, and the wedge's
        vec(Cb[0], Cb[1], w.ax * A_SCALE, w.ay * A_SCALE, p.accel, 3.2);
        beyond('a', Cb[0], Cb[1], w.ax * A_SCALE, w.ay * A_SCALE, p.accel);
        vec(Wc[0], Wc[1], w.A * A_SCALE, 0, p.accel, 3.2);
        beyond('A', Wc[0], Wc[1], w.A * A_SCALE, 0, p.accel);
      }
      if (s.showRel) {
        // a = a_rel + A: a_rel along the face from the block, then A from its tip
        const rx = w.aRel * c * A_SCALE;
        const ry = -w.aRel * sn * A_SCALE;
        vec(Cb[0], Cb[1], rx, ry, p.accent, 2.4);
        const [mx, my] = at(Cb[0] + rx / 2, Cb[1] + ry / 2);
        // on the outer side of the arrow, away from the face
        L('a_{rel}', mx + 22 * sn, my - 22 * c, p.accent);
        vec(Cb[0] + rx, Cb[1] + ry, w.A * A_SCALE, 0, p.accel, 2, 0.6);
      }
      if (s.fbd === 'block' || s.fbd === 'wedge') {
        const fMax = Math.max(s.m * G, w.N, s.fbd === 'wedge' ? Math.max(s.M * G, w.Nfloor) : 0);
        const k = 0.48 / fMax;
        if (s.fbd === 'block') {
          vec(Cb[0], Cb[1], 0, -s.m * G * k, p.force, 2.6);
          beyond('mg', Cb[0], Cb[1], 0, -s.m * G * k, p.force);
          vec(Cb[0], Cb[1], nrm[0] * w.N * k, nrm[1] * w.N * k, p.force, 2.6);
          beyond('N', Cb[0], Cb[1], nrm[0] * w.N * k, nrm[1] * w.N * k, p.force);
        } else {
          vec(Wc[0], Wc[1], 0, -s.M * G * k, p.force, 2.6);
          beyond('Mg', Wc[0], Wc[1], 0, -s.M * G * k, p.force);
          // the floor's push, near the vertical back, clear of the weight's arrow at the centroid
          const base = X + 0.1;
          vec(base, FLOOR, 0, w.Nfloor * k, p.force, 2.6);
          // beside the head, not above it, where the block sits on the face
          const [nfx, nfy] = at(base, FLOOR + w.Nfloor * k);
          L('N_{f}', nfx + 16, nfy + 10, p.force);
          // the block's push on the wedge, at the contact point, into the face
          const nx = -nrm[0] * w.N * k;
          const ny = -nrm[1] * w.N * k;
          vec(P[0] - nx, P[1] - ny, nx, ny, p.force, 2.6);
          const [lx, ly] = at(P[0] - 1.2 * nx, P[1] - 1.2 * ny);
          L('N', lx, ly, p.force);
        }
      }
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s, run]);

  // keep playback off while the stage is off-screen
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const io = new IntersectionObserver((es) => {
      visible.current = es.some((e) => e.isIntersecting);
    });
    io.observe(cv);
    return () => io.disconnect();
  }, []);

  const describe = () => {
    if (run.kind === 'pulley') {
      const { sol } = run;
      return (
        `${PRESET_LABEL[s.preset]}: m₁ = ${num(s.m1)} kg, m₂ = ${num(s.m2)} kg. ` +
        `התאוצה של גוש 1: ${num(Math.abs(sol.a1))} m/s²${vert(sol.a1)}; של גוש 2: ${num(Math.abs(sol.a2))} m/s²${vert(sol.a2)}; המתיחות ${num(sol.T)} N.`
      );
    }
    const { w } = run;
    return (
      `גוש של ${num(s.m)} kg על טריז של ${num(s.M)} kg, זווית ${s.theta}°. התאוצה של הטריז ${num(Math.abs(w.A))} m/s²${horiz(w.A)}; ` +
      `התאוצה של הגוש ביחס לטריז ${num(w.aRel)} m/s² במורד הפאה; הכוח הנורמלי ${num(w.N)} N.`
    );
  };

  const setTime = (x: number) => {
    userRan.current = true;
    setS((prev) => ({ ...prev, t: Math.max(0, Math.min(run.tEnd, x)), playing: false }));
  };
  const togglePlay = () => {
    userRan.current = true;
    setS((prev) => ({ ...prev, playing: !prev.playing, t: !prev.playing && prev.t >= run.tEnd - 1e-9 ? 0 : prev.t }));
  };
  const setMass = (key: 'm1' | 'm2' | 'm' | 'M' | 'theta', x: number, range: [number, number], stepSize: number) => {
    userMass.current = true;
    const v = clamp(Math.round(x / stepSize) * stepSize, range);
    setS((prev) => ({ ...prev, [key]: Number(v.toFixed(2)), t: 0, playing: false }));
  };
  const toggle = (key: 'showLengths' | 'showAccel' | 'showRel' | 'showPaths', on: boolean) => {
    userToggled.current = true;
    setS((prev) => ({ ...prev, [key]: on }));
  };
  const choosePreset = (preset: PresetName) => {
    userRan.current = false;
    userMass.current = false;
    setS((prev) => ({ ...prev, preset, t: 0, playing: false, fbd: 'none' }));
    setLive(`נבחרה המערכת: ${PRESET_LABEL[preset]}.`);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setTime(s.t + (e.key === 'ArrowRight' ? 1 : -1) * (run.tEnd / 40));
      setLive(describe());
    }
  };
  const reset = () => {
    stepState.current = null;
    userRan.current = false;
    userMass.current = false;
    userToggled.current = false;
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const presets = props.presets ?? [];
  const fbdChoices: [Fbd, string][] =
    run.kind === 'pulley'
      ? [
          ['b1', 'גוש 1'],
          ['b2', s.preset === 'movable' ? 'גוש 2 עם הגלגלת' : 'גוש 2'],
        ]
      : [
          ['block', 'הגוש'],
          ['wedge', 'הטריז'],
        ];

  let readout;
  if (run.kind === 'pulley') {
    const { sol, n, y20 } = run;
    const y1 = Y1_0 + 0.5 * sol.a1 * t * t;
    const y2 = y20 + 0.5 * sol.a2 * t * t;
    readout = (
      <>
        <span class="q" data-readout="t">t = {num(t)} s</span>
        <b class="q" data-readout="a1">a₁ = {num(Math.abs(sol.a1))} m/s²{vert(sol.a1)}</b>
        <b class="q" data-readout="a2">a₂ = {num(Math.abs(sol.a2))} m/s²{vert(sol.a2)}</b>
        <span class="q" data-readout="T">T = {num(sol.T)} N</span>
        <span class="q" data-readout="dy">Δy₁ = {num(y1 - Y1_0)} m, Δy₂ = {num(y2 - y20)} m</span>
        {s.showLengths && (
          <span class="q" data-readout="constraint">
            {n === 1 ? 'y₁ + y₂' : 'y₁ + 2y₂'} = {num(y1 + n * y2)} m
          </span>
        )}
      </>
    );
  } else {
    const { w } = run;
    readout = (
      <>
        <span class="q" data-readout="t">t = {num(t)} s</span>
        <b class="q" data-readout="A">A = {num(Math.abs(w.A))} m/s²{horiz(w.A)}</b>
        <span class="q" data-readout="a">
          a = ({num(w.ax)}, {num(w.ay)}) m/s²
        </span>
        <b class="q" data-readout="arel">a<sub>rel</sub> = {num(w.aRel)} m/s²</b>
        <span class="q" data-readout="N">
          N = {num(w.N)} N (mg cosθ = {num(s.m * G * Math.cos(run.th))} N)
        </span>
        <span class="q" data-readout="px">mvₓ + MV = {num(s.m * w.ax * t + s.M * w.A * t)} kg·m/s</span>
        {s.showPaths && (
          <span class="q" data-readout="path">
            φ = {num((w.pathAngle * 180) / Math.PI)}°, θ = {s.theta}°
          </span>
        )}
      </>
    );
  }

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: גופים שקשורים באילוץ, משתחררים ממנוחה. ${describe()} רווח מפעיל ועוצר, חיצים מזיזים את הזמן.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      readout={readout}
      controls={
        <>
          {presets.length > 1 && (
            <div class="group" role="group" aria-label="בחירת מערכת">
              {presets.map((name) => (
                <Toggle key={name} label={PRESET_LABEL[name]} on={s.preset === name} onChange={() => choosePreset(name)} />
              ))}
            </div>
          )}
          <div class="group" role="group" aria-label="זמן">
            <button type="button" class="toggle" onClick={togglePlay} aria-pressed={s.playing}>
              {s.playing ? 'עצירה' : 'הפעלה'}
            </button>
          </div>
          <Slider label="הזמן t" min={0} max={run.tEnd} step={run.tEnd / 400} value={t} format={(x) => `${num(x)} s`} onChange={setTime} />
          {run.kind === 'pulley' ? (
            <>
              <Slider label="המסה m₁" min={M_PULLEY[0]} max={M_PULLEY[1]} step={0.1} value={s.m1} format={(x) => `${num(x)} kg`} onChange={(x) => setMass('m1', x, M_PULLEY, 0.1)} />
              <Slider label="המסה m₂" min={M_PULLEY[0]} max={M_PULLEY[1]} step={0.1} value={s.m2} format={(x) => `${num(x)} kg`} onChange={(x) => setMass('m2', x, M_PULLEY, 0.1)} />
            </>
          ) : (
            <>
              <Slider label="מסת הגוש m" min={M_BLOCK[0]} max={M_BLOCK[1]} step={0.1} value={s.m} format={(x) => `${num(x)} kg`} onChange={(x) => setMass('m', x, M_BLOCK, 0.1)} />
              <Slider label="מסת הטריז M" min={M_WEDGE[0]} max={M_WEDGE[1]} step={0.5} value={s.M} format={(x) => `${num(x)} kg`} onChange={(x) => setMass('M', x, M_WEDGE, 0.5)} />
              <Slider label="הזווית θ" min={TH_RANGE[0]} max={TH_RANGE[1]} step={1} value={s.theta} format={(x) => `${x}°`} onChange={(x) => setMass('theta', x, TH_RANGE, 1)} />
            </>
          )}
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="תאוצות" on={s.showAccel} swatch="var(--accel)" onChange={(x) => toggle('showAccel', x)} />
            {run.kind === 'pulley' ? (
              <Toggle label="אורכי החוט" on={s.showLengths} swatch="var(--accent)" onChange={(x) => toggle('showLengths', x)} />
            ) : (
              <>
                <Toggle label="תאוצה יחסית" on={s.showRel} swatch="var(--accent)" onChange={(x) => toggle('showRel', x)} />
                <Toggle label="מסלולים" on={s.showPaths} swatch="var(--velocity)" onChange={(x) => toggle('showPaths', x)} />
              </>
            )}
          </div>
          <div class="group" role="group" aria-label="תרשים כוחות של גוף אחד">
            {fbdChoices.map(([key, name]) => (
              <Toggle
                key={key}
                label={`כוחות על ${name}`}
                on={s.fbd === key}
                swatch="var(--force)"
                onChange={(on) => setS((prev) => ({ ...prev, fbd: on ? key : 'none' }))}
              />
            ))}
          </div>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------ drawing helpers */

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

function dashedLine(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string) {
  ctx.save();
  ctx.setLineDash([5, 5]);
  line(ctx, a, b, color, 1.4);
  ctx.restore();
}

/** A ceiling (hatch above the line) or a floor (hatch below it). */
function hatch(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], p: Palette, above: boolean) {
  line(ctx, a, b, p.ink2, 2);
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1;
  const dir = above ? -1 : 1;
  for (let x = a[0]; x < b[0]; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, a[1]);
    ctx.lineTo(x + 8, a[1] + dir * 8);
    ctx.stroke();
  }
  ctx.restore();
}

function wheel(ctx: CanvasRenderingContext2D, c: [number, number], r: number, p: Palette) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
  ctx.fillStyle = p.paper2;
  ctx.fill();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c[0], c[1], 3, 0, Math.PI * 2);
  ctx.fillStyle = p.ink;
  ctx.fill();
  ctx.restore();
}

/** A hanging body: a square with its top-left corner at `tl`, its name and mass inside. */
function box(ctx: CanvasRenderingContext2D, tl: [number, number], side: number, text: string, p: Palette) {
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.8;
  ctx.fillRect(tl[0], tl[1], side, side);
  ctx.strokeRect(tl[0], tl[1], side, side);
  ctx.fillStyle = p.ink;
  ctx.font = `600 12px ${p.fontUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const [name, mass] = text.split(' ');
  // a narrow screen leaves no room for the mass inside the box: the name alone (the sliders give the mass)
  if (side < 44) {
    ctx.fillText(name, tl[0] + side / 2, tl[1] + side / 2);
    ctx.restore();
    return;
  }
  ctx.fillText(name, tl[0] + side / 2, tl[1] + side / 2 - 8);
  ctx.font = `500 11px ${p.fontUi}`;
  ctx.fillText(`${mass} kg`, tl[0] + side / 2, tl[1] + side / 2 + 8);
  ctx.restore();
}

/** A vertical dimension line with ticks at both ends. */
function dimension(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  for (const q of [a, b]) {
    ctx.moveTo(q[0] - 5, q[1]);
    ctx.lineTo(q[0] + 5, q[1]);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * A canvas label with a paper-coloured halo, so it stays readable over lines and arrows. It is kept
 * inside the stage and out of the top-right corner, where the reset and fullscreen buttons sit.
 * "a_{rel}" draws a with a lowered, smaller "rel".
 */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, p: Palette, v: View) {
  ctx.save();
  ctx.direction = 'ltr';
  const parts = text.split(/_\{([^}]*)\}/);
  const big = `600 13px ${p.fontUi}`;
  const small = `600 10px ${p.fontUi}`;
  const widths = parts.map((t, i) => {
    ctx.font = i % 2 ? small : big;
    return ctx.measureText(t).width;
  });
  const half = widths.reduce((a, b) => a + b, 0) / 2;
  const pad = 4;
  let cx = Math.min(Math.max(x, half + pad), v.w - half - pad);
  let cy = Math.min(Math.max(y, 9 + pad), v.h - 9 - pad);
  if (cx + half > v.w - BUTTONS_W && cy < BUTTONS_H + 9) {
    if (y < BUTTONS_H / 2 + 9) cy = BUTTONS_H + 9;
    else cx = v.w - BUTTONS_W - half - pad;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = p.paper;
  ctx.fillStyle = color;
  let at = cx - half;
  parts.forEach((t, i) => {
    ctx.font = i % 2 ? small : big;
    const yy = i % 2 ? cy + 4 : cy;
    ctx.strokeText(t, at, yy);
    ctx.fillText(t, at, yy);
    at += widths[i];
  });
  ctx.restore();
}
