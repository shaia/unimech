/**
 * LadderStatics (lesson 8.5): a rigid body at rest and the torques of the forces on it about a point P the learner
 * chooses. Three scenes:
 *   - 'ladder': a uniform ladder (5.0 m, 15 kg) against a smooth wall on a rough floor, with a person (75 kg) on a
 *     rung. Every force on the ladder is drawn from its point of application: the floor's push N₁ and its static
 *     friction f at the foot, the wall's push N₂ at the top, the Earth's pull Mg at the centre, the person's push mg on
 *     the rung. Sliders: the angle, the person's place, μ_s. The friction the ladder needs is compared with μ_s N₁; when
 *     it is more, the ladder slips (the part of the needed friction the floor cannot give is drawn dashed).
 *   - 'beam': a uniform plank (4.0 m, 30 kg) on two supports with a 40 kg box the learner slides along it. A support
 *     only pushes: when the box passes the tipping point the near support would have to pull, and the plank tips.
 *   - 'couple': a rod on a smooth table seen from above with two equal, opposite forces at its ends (a couple), or only
 *     one of them: ΣF = 0 makes the torque the same about every point; ΣF ≠ 0 does not.
 * The table under the stage lists, for every force, its magnitude, its lever arm d about P and its torque τ_P
 * (counter-clockwise positive, z out of the page), and the sums. The chosen force's line of action and lever arm are
 * drawn. P is moved by a click or drag on the stage, the arrow keys, or the preset buttons.
 *
 * All physics from src/physics/statics.ts. Tasks tick only in the learner's own handlers (buttons, sliders, pointer,
 * keys); a text step sets the state directly and never runs a handler, so a step cannot tick a task.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  armFoot,
  ladderMaxClimb,
  ladderMinAngle,
  leverArm,
  netForce,
  solveBeam,
  solveLadder,
  torqueAbout,
  type PointForce,
} from '~/physics/statics';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Scene = 'ladder' | 'beam' | 'couple';

/** the ladder */
const L_LAD = 5;
const M_LAD = 15;
const M_PERSON = 75;
/** the plank: from x = 0 to 4.0 m, supports at 0.5 and 2.5 m, a 40 kg box; thickness for the drawing */
const BEAM = { L: 4, M: 30, a: 0.5, b: 2.5 };
const M_BOX = 40;
const BEAM_H = 0.14;
const BOX_SIZE = 0.5;
/** the couple: a 2.0 m rod, 10 N at each end */
const ROD_HALF = 1;
const F_COUPLE = 10;

const TH_MIN = 30;
const TH_MAX = 85;
const MU_MIN = 0.1;
const MU_MAX = 0.8;

const NARROW_W = 520;
const isNarrow = (w: number) => w > 0 && w < NARROW_W;

const SCENE_LABEL: Record<Scene, string> = { ladder: 'סולם', beam: 'קורה על שתי תמיכות', couple: 'זוג כוחות' };

const TASK_LABEL: Record<string, string> = {
  foot: 'בחרו את רגלי הסולם, B, כנקודה P. אילו כוחות נעלמים מהטבלה, ולמה?',
  'off-ladder': 'גררו את P לנקודה שאינה על הסולם, באוויר או בקיר. מה סכום המומנטים שם?',
  'climb-slip': 'העלו את האדם על הסולם עד שהסולם מחליק. באיזה גובה זה קורה?',
  steeper: 'הציבו את האדם בראש הסולם, ומצאו זווית שבה הסולם לא מחליק.',
  'couple-move': 'בזוג הכוחות, הזיזו את P לשלוש נקודות לפחות. האם סכום המומנטים משתנה?',
  'one-force': 'השאירו רק כוח אחד והזיזו את P. מה קורה עכשיו לסכום המומנטים?',
  'box-over': 'בקורה, העבירו את הארגז מעבר לתמיכה הימנית. מה קורה לכוח של התמיכה השמאלית?',
  tip: 'המשיכו להזיז את הארגז ימינה עד שהקורה מתהפכת.',
};

export interface LadderStaticsProps {
  id: string;
  scene?: Scene;
  /** scenes offered as buttons */
  scenes?: Scene[];
  /** the ladder's angle with the floor [°], the person's distance from the foot [m], μ_s */
  theta?: number;
  s?: number;
  mu?: number;
  /** the box's place along the plank [m] */
  box?: number;
  /** the couple scene with only one of its forces */
  one?: boolean;
  /** the point P: a preset name of the scene, or world coordinates [m] */
  P?: string | [number, number];
  /** the force whose line of action and lever arm are drawn */
  arm?: string | null;
  tasks?: string[];
}

type PointRef = { name: string } | { at: Vec2 };

interface State {
  scene: Scene;
  theta: number;
  s: number;
  mu: number;
  box: number;
  one: boolean;
  P: PointRef;
  arm: string | null;
}

interface Row {
  f: PointForce;
  /** canvas label (Unicode subscripts) */
  label: string;
  /** who exerts it, in Hebrew */
  agent: string;
}

interface Built {
  rows: Row[];
  /** named points of the scene and their Hebrew names */
  points: Record<string, { at: Vec2; name: string }>;
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  ladder?: ReturnType<typeof solveLadder>;
  beam?: ReturnType<typeof solveBeam>;
}

const DEFAULT_P: Record<Scene, string> = { ladder: 'C', beam: 'S1', couple: 'M' };
const DEFAULT_ARM: Record<Scene, string | null> = { ladder: 'N2', beam: 'N1', couple: 'F2' };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
/** 3 significant figures, a true minus sign, no "−0" */
const signed = (x: number, tiny = 1e-9) => (Math.abs(x) <= tiny ? '0' : sci(Number(x.toPrecision(12)), 3).replace('-', '−'));

function build(st: State): Built {
  if (st.scene === 'ladder') {
    const sol = solveLadder({ L: L_LAD, M: M_LAD, m: M_PERSON, s: st.s, theta: rad(st.theta), mu: st.mu });
    const label: Record<string, [string, string]> = {
      N1: ['N₁', 'הרצפה'],
      f: ['f', 'הרצפה, חיכוך'],
      N2: ['N₂', 'הקיר'],
      W: ['Mg', 'כדור הארץ'],
      P: ['mg', 'האדם'],
    };
    return {
      rows: sol.forces.map((f) => ({ f, label: label[f.id][0], agent: label[f.id][1] })),
      points: {
        B: { at: sol.B, name: 'רגלי הסולם' },
        A: { at: sol.A, name: 'ראש הסולם' },
        C: { at: sol.C, name: 'מרכז הסולם' },
        O: { at: sol.O, name: 'פינת הקיר' },
        Q: { at: sol.Q, name: 'Q' },
      },
      bounds: { xMin: -0.9, xMax: 5.5, yMin: -1.75, yMax: 5.75 },
      ladder: sol,
    };
  }
  if (st.scene === 'beam') {
    const sol = solveBeam({ ...BEAM, loads: [{ id: 'box', m: M_BOX, x: st.box }] });
    const at = (f: PointForce): Vec2 => {
      if (f.id === 'N1' || f.id === 'N2') return [f.at[0], -BEAM_H / 2];
      if (f.id === 'box') return [f.at[0], BEAM_H / 2];
      return f.at;
    };
    const label: Record<string, [string, string]> = {
      N1: ['N₁', 'התמיכה השמאלית'],
      N2: ['N₂', 'התמיכה הימנית'],
      W: ['Mg', 'כדור הארץ'],
      box: ['mg', 'הארגז'],
    };
    return {
      rows: sol.forces.map((f) => ({ f: { ...f, at: at(f) }, label: label[f.id][0], agent: label[f.id][1] })),
      points: {
        S1: { at: [BEAM.a, -BEAM_H / 2], name: 'התמיכה השמאלית' },
        S2: { at: [BEAM.b, -BEAM_H / 2], name: 'התמיכה הימנית' },
        C: { at: [BEAM.L / 2, 0], name: 'מרכז הקורה' },
        X: { at: [st.box, BEAM_H / 2], name: 'מתחת לארגז' },
      },
      bounds: { xMin: -0.35, xMax: 4.35, yMin: -1.75, yMax: 1.55 },
      beam: sol,
    };
  }
  const rows: Row[] = [];
  if (!st.one) rows.push({ f: { id: 'F1', at: [-ROD_HALF, 0], F: [0, -F_COUPLE] }, label: 'F₁', agent: 'יד שמאל' });
  rows.push({ f: { id: 'F2', at: [ROD_HALF, 0], F: [0, F_COUPLE] }, label: 'F₂', agent: 'יד ימין' });
  return {
    rows,
    points: {
      M: { at: [0, 0], name: 'מרכז המוט' },
      E1: { at: [-ROD_HALF, 0], name: 'הקצה השמאלי' },
      E2: { at: [ROD_HALF, 0], name: 'הקצה הימני' },
      F: { at: [0.6, 1.2], name: 'נקודה מחוץ למוט' },
    },
    bounds: { xMin: -1.9, xMax: 1.9, yMin: -1.45, yMax: 1.6 },
  };
}

function pointOf(st: State, b: Built): Vec2 {
  if ('at' in st.P) return st.P.at;
  return (b.points[st.P.name] ?? b.points[DEFAULT_P[st.scene]]).at;
}

/** Canvas text with a paper halo. */
function halo(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center', dir: CanvasDirection = 'ltr') {
  ctx.save();
  ctx.direction = dir;
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

export default function LadderStatics(props: LadderStaticsProps) {
  const initial = (): State => {
    const scene = props.scene ?? 'ladder';
    const P: PointRef = Array.isArray(props.P) ? { at: [props.P[0], props.P[1]] } : { name: props.P ?? DEFAULT_P[scene] };
    return {
      scene,
      theta: clamp(props.theta ?? 65, TH_MIN, TH_MAX),
      s: clamp(props.s ?? 2, 0, L_LAD),
      mu: clamp(props.mu ?? 0.3, MU_MIN, MU_MAX),
      box: clamp(props.box ?? 1.5, 0, BEAM.L),
      one: props.one ?? false,
      P,
      arm: props.arm === undefined ? DEFAULT_ARM[scene] : props.arm,
    };
  };
  const [st, setSt] = useState<State>(initial);
  const stRef = useRef(st);
  stRef.current = st;
  const [live, setLive] = useState('');
  const [narrowStage, setNarrowStage] = useState(false);
  const dragging = useRef(false);
  /** where P has been put by hand in the couple scene (distinct spots) */
  const coupleSpots = useRef<Vec2[]>([]);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setSt((prev) => {
          const scene: Scene = step.scene === 'ladder' || step.scene === 'beam' || step.scene === 'couple' ? step.scene : prev.scene;
          const next: State = { ...prev, scene };
          const th = num(step.theta);
          if (th !== null) next.theta = clamp(th, TH_MIN, TH_MAX);
          const s = num(step.s);
          if (s !== null) next.s = clamp(s, 0, L_LAD);
          const mu = num(step.mu);
          if (mu !== null) next.mu = clamp(mu, MU_MIN, MU_MAX);
          const box = num(step.box);
          if (box !== null) next.box = clamp(box, 0, BEAM.L);
          if (typeof step.one === 'boolean') next.one = step.one;
          if (typeof step.P === 'string') next.P = { name: step.P };
          else if (Array.isArray(step.P) && step.P.length === 2) {
            const x = num(step.P[0]);
            const y = num(step.P[1]);
            if (x !== null && y !== null) next.P = { at: [x, y] };
          } else if (scene !== prev.scene) next.P = { name: DEFAULT_P[scene] };
          if (typeof step.arm === 'string' || step.arm === null) next.arm = step.arm;
          else if (scene !== prev.scene) next.arm = DEFAULT_ARM[scene];
          return next;
        });
      }),
    [props.id],
  );

  const b = build(st);
  const P = pointOf(st, b);
  const Fnet = netForce(b.rows.map((r) => r.f));
  const tauSum = b.rows.reduce((acc, r) => acc + torqueAbout(r.f, P), 0);
  const fScale = Math.max(...b.rows.map((r) => Math.hypot(r.f.F[0], r.f.F[1])), 1);
  const span = b.bounds.xMax - b.bounds.xMin;
  const tiny = 1e-9 * fScale * span;

  /** the world → screen map of the current frame, for the pointer */
  const mapRef = useRef<{ x0: number; y0: number; k: number } | null>(null);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const narrow = isNarrow(view.w);
    const fs = narrow ? 11 : 13;
    const bd = b.bounds;
    const pad = 10;
    const k = Math.min((view.w - 2 * pad) / (bd.xMax - bd.xMin), (view.h - 2 * pad) / (bd.yMax - bd.yMin));
    const x0 = (view.w - k * (bd.xMax - bd.xMin)) / 2 - k * bd.xMin;
    const y0 = (view.h + k * (bd.yMax - bd.yMin)) / 2 + k * bd.yMin;
    mapRef.current = { x0, y0, k };
    const X = (x: number) => x0 + k * x;
    const Y = (y: number) => y0 - k * y;
    const font = (size: number, w = 600, it = true) => `${it ? 'italic ' : ''}${w} ${size}px ${p.fontUi}`;

    // the sign convention, top left: counter-clockwise is positive
    {
      const cx = 18;
      const cy = 16;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0.15 * Math.PI, 0.45 * Math.PI, true);
      ctx.stroke();
      ctx.restore();
      const a = 0.45 * Math.PI;
      const ex = cx + 8 * Math.cos(a);
      const ey = cy + 8 * Math.sin(a);
      arrow(ctx, ex - Math.sin(a) * 5, ey + Math.cos(a) * 5, ex + Math.sin(a) * 2, ey - Math.cos(a) * 2, { color: p.ink2, width: 1.4, head: 6 });
      halo(ctx, p, '+', cx, cy + 1, font(fs, 700, false), p.ink2);
    }

    const line = (pts: Vec2[], color: string, width: number, dash: number[] = []) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.setLineDash(dash);
      ctx.beginPath();
      pts.forEach(([u, v], i) => (i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v))));
      ctx.stroke();
      ctx.restore();
    };
    const hatch = (from: Vec2, to: Vec2, side: Vec2) => {
      line([from, to], p.ink2, 2);
      const n = Math.max(2, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.3));
      for (let i = 0; i <= n; i++) {
        const u: Vec2 = [from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n];
        line([u, [u[0] + side[0] - 0.12, u[1] + side[1] - 0.12]], p.ink3, 1);
      }
    };
    const dot = (q: Vec2, r: number, color: string, filled = true) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(X(q[0]), Y(q[1]), r, 0, Math.PI * 2);
      if (filled) {
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.restore();
    };

    // ------------------------------------------------ the scene
    const arm = st.arm ? b.rows.find((r) => r.f.id === st.arm) ?? null : null;
    if (st.scene === 'ladder' && b.ladder) {
      const sol = b.ladder;
      hatch([bd.xMin + 0.1, 0], [bd.xMax - 0.05, 0], [0, -0.18]);
      hatch([0, 0], [0, bd.yMax - 0.1], [-0.18, 0]);
      // the angle θ at the foot
      {
        const r = 24;
        ctx.save();
        ctx.strokeStyle = p.ink3;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(X(sol.B[0]), Y(0), r, Math.PI, Math.PI + rad(st.theta), false);
        ctx.stroke();
        ctx.restore();
        const mid = Math.PI + rad(st.theta) / 2;
        halo(ctx, p, 'θ', X(sol.B[0]) + (r + 9) * Math.cos(mid), Y(0) + (r + 9) * Math.sin(mid), font(fs), p.ink2);
      }
      // the ladder: a thick rail with rungs
      line([sol.A, sol.B], p.ink, Math.max(4, 0.07 * k));
      const ux = sol.A[0] - sol.B[0];
      const uy = sol.A[1] - sol.B[1];
      const ul = Math.hypot(ux, uy);
      for (let d = 0.4; d < L_LAD - 0.1; d += 0.4) {
        const c: Vec2 = [sol.B[0] + (ux * d) / ul, sol.B[1] + (uy * d) / ul];
        const nx = (-uy / ul) * 0.13;
        const ny = (ux / ul) * 0.13;
        line([[c[0] - nx, c[1] - ny], [c[0] + nx, c[1] + ny]], p.ink2, 1.6);
      }
      // the person: a stick figure standing on the rung
      {
        const S = sol.S;
        const head: Vec2 = [S[0] + 0.2, S[1] + 1.05];
        line([S, [S[0] + 0.2, S[1] + 0.45], [S[0] + 0.25, S[1] + 0.85]], withAlpha(p.ink3, 0.9), 2.2);
        line([[S[0] + 0.22, S[1] + 0.7], [S[0] - 0.1, S[1] + 0.85]], withAlpha(p.ink3, 0.9), 1.8);
        ctx.save();
        ctx.strokeStyle = withAlpha(p.ink3, 0.9);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(X(head[0]), Y(head[1]), Math.max(4, 0.12 * k), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // the named points
      const tag = (q: Vec2, s: string, dx: number, dy: number) => halo(ctx, p, s, X(q[0]) + dx, Y(q[1]) + dy, font(fs - 1, 700), p.ink2);
      dot(sol.C, 3, p.ink);
      tag(sol.C, 'C', -13, -11);
      tag(sol.B, 'B', 4, 14);
      tag(sol.A, 'A', -14, -12);
      tag(sol.O, 'O', -10, 12);
      dot(sol.Q, 3.5, p.ink3, false);
      tag(sol.Q, 'Q', 13, -10);
    } else if (st.scene === 'beam' && b.beam) {
      const h = BEAM_H;
      // the ground and the two supports (triangles)
      hatch([bd.xMin + 0.05, -0.75], [bd.xMax - 0.05, -0.75], [0, -0.18]);
      for (const x of [BEAM.a, BEAM.b]) {
        ctx.save();
        ctx.fillStyle = p.paper2;
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(X(x), Y(-h / 2));
        ctx.lineTo(X(x - 0.22), Y(-0.75));
        ctx.lineTo(X(x + 0.22), Y(-0.75));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      // the plank
      ctx.save();
      ctx.fillStyle = withAlpha(p.ink3, 0.35);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.6;
      ctx.fillRect(X(0), Y(h / 2), k * BEAM.L, k * h);
      ctx.strokeRect(X(0), Y(h / 2), k * BEAM.L, k * h);
      ctx.restore();
      // the box
      ctx.save();
      ctx.fillStyle = withAlpha(p.paper2, 0.85);
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.6;
      ctx.fillRect(X(st.box - BOX_SIZE / 2), Y(h / 2 + BOX_SIZE), k * BOX_SIZE, k * BOX_SIZE);
      ctx.strokeRect(X(st.box - BOX_SIZE / 2), Y(h / 2 + BOX_SIZE), k * BOX_SIZE, k * BOX_SIZE);
      ctx.restore();
      halo(ctx, p, 'm', X(st.box), Y(h / 2 + BOX_SIZE / 2), font(fs), p.ink2);
      dot([BEAM.L / 2, 0], 3, p.ink);
      halo(ctx, p, '1', X(BEAM.a), Y(-0.55), font(fs - 1, 700, false), p.ink2);
      halo(ctx, p, '2', X(BEAM.b), Y(-0.55), font(fs - 1, 700, false), p.ink2);
      if (b.beam.tips !== 'none') handNote(ctx, narrow ? 'הקורה מתהפכת' : 'הקורה מתהפכת: התמיכה השמאלית הייתה צריכה למשוך', view.w / 2, Y(bd.yMin) - 16, p, narrow ? 13 : 15);
    } else {
      // the couple: a rod on a smooth table, seen from above
      line([[-ROD_HALF, 0], [ROD_HALF, 0]], p.ink, Math.max(5, 0.08 * k));
      dot([0, 0], 3, p.paper);
      handNote(ctx, 'מבט מלמעלה: מוט על שולחן חלק', view.w / 2, Y(bd.yMax) + 14, p, narrow ? 13 : 15);
    }

    // ------------------------------------------------ the chosen force's line of action and lever arm
    if (arm) {
      const F = arm.f.F;
      const m = Math.hypot(F[0], F[1]);
      if (m > 1e-9) {
        const u: Vec2 = [F[0] / m, F[1] / m];
        const far = 2 * (bd.xMax - bd.xMin + bd.yMax - bd.yMin);
        line(
          [
            [arm.f.at[0] - u[0] * far, arm.f.at[1] - u[1] * far],
            [arm.f.at[0] + u[0] * far, arm.f.at[1] + u[1] * far],
          ],
          withAlpha(p.force, 0.55),
          1.2,
          [6, 5],
        );
        const foot = armFoot(arm.f, P);
        const d = leverArm(arm.f, P);
        if (d * k > 3) {
          line([P, foot], p.accent, 2.4);
          // the right angle at the foot of the arm
          const ax = (P[0] - foot[0]) / d;
          const ay = (P[1] - foot[1]) / d;
          const q = 9 / k;
          line(
            [
              [foot[0] + ax * q, foot[1] + ay * q],
              [foot[0] + ax * q + u[0] * q, foot[1] + ay * q + u[1] * q],
              [foot[0] + u[0] * q, foot[1] + u[1] * q],
            ],
            p.accent,
            1.2,
          );
          const mx = X((P[0] + foot[0]) / 2) - ay * 12;
          const my = Y((P[1] + foot[1]) / 2) - ax * 12;
          halo(ctx, p, 'd', mx, my, font(fs + 1, 700), p.accent);
        }
      }
    }

    // ------------------------------------------------ the forces, each from its point of application
    // the plank and the couple: linear in the force; the ladder, whose forces run from 150 N to over 1000 N: as √F, so
    // the small ones stay visible (the table carries the numbers). At least ARROW_MIN px, at most a fixed length.
    const lenOf = (F: number) => (st.scene === 'ladder' ? 0.059 * Math.sqrt(F) : st.scene === 'beam' ? (1.15 / 800) * F : F / F_COUPLE);
    const maxLen = st.scene === 'ladder' ? 2.4 : 0.42 * Math.min(bd.xMax - bd.xMin, bd.yMax - bd.yMin);
    const ARROW_MIN = 16;
    for (const r of b.rows) {
      const F = r.f.F;
      const m = Math.hypot(F[0], F[1]);
      if (m < 1e-9) continue;
      const u: Vec2 = [F[0] / m, F[1] / m];
      const lenW = Math.min(maxLen, Math.max(ARROW_MIN / k, lenOf(m)));
      const sx = X(r.f.at[0]);
      const sy = Y(r.f.at[1]);
      const isF = st.scene === 'ladder' && r.f.id === 'f' && b.ladder;
      const pull = st.scene === 'beam' && (r.f.id === 'N1' || r.f.id === 'N2') && F[1] < 0;
      if (isF && b.ladder && b.ladder.slips) {
        // what the floor can give, solid; the rest of what equilibrium would need, dashed
        const solid = Math.min(lenW, Math.max(ARROW_MIN / k, lenOf(b.ladder.fMax)));
        const ex = sx + u[0] * solid * k;
        const ey = sy - u[1] * solid * k;
        ctx.save();
        ctx.strokeStyle = p.neg;
        ctx.lineWidth = 2.2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(sx + u[0] * lenW * k, sy - u[1] * lenW * k);
        ctx.stroke();
        ctx.restore();
        arrow(ctx, sx, sy, ex, ey, { color: p.force, width: 2.6, head: 10 });
        halo(ctx, p, 'μₛN₁', ex, ey - 14, font(fs - 1), p.neg);
      } else {
        arrow(ctx, sx, sy, sx + u[0] * lenW * k, sy - u[1] * lenW * k, {
          color: pull ? p.neg : p.force,
          width: r.f.id === st.arm ? 3.2 : 2.4,
          head: 10,
        });
      }
      // the label beyond the tip; the two weights of the ladder on either side of their shafts
      const tx = sx + u[0] * lenW * k;
      const ty = sy - u[1] * lenW * k;
      let lx = tx + u[0] * 14;
      let ly = ty - u[1] * 14;
      if (r.f.id === 'W' && st.scene === 'ladder') {
        lx = tx - 16;
        ly = ty;
      } else if (r.f.id === 'P' && st.scene === 'ladder') {
        // left of the tip too: right of it sit the ladder and, near the foot, the angle θ
        lx = tx - 16;
        ly = ty;
      } else if (r.f.id === 'N2' && st.scene === 'ladder') {
        // above the shaft, clear of a lever arm drawn down from the line of N₂
        lx = (sx + tx) / 2;
        ly = ty - 12;
      } else if (r.f.id === 'f') {
        lx = tx - 4;
        ly = ty + 15;
      }
      halo(ctx, p, r.label, lx, ly, font(fs + 1, 700), r.f.id === st.arm ? p.accent : p.force);
    }

    // ------------------------------------------------ P
    {
      const px = X(P[0]);
      const py = Y(P[1]);
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.fillStyle = withAlpha(p.accent, 0.18);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - 11, py);
      ctx.lineTo(px + 11, py);
      ctx.moveTo(px, py - 11);
      ctx.lineTo(px, py + 11);
      ctx.stroke();
      ctx.restore();
      halo(ctx, p, 'P', px + 15, py + 13, font(fs + 2, 700), p.accent);
    }

    // the ladder slips: a note under the sign convention
    if (st.scene === 'ladder' && b.ladder?.slips) {
      handNote(ctx, narrow ? 'הסולם מחליק' : 'הסולם מחליק: החיכוך הדרוש גדול מהמרבי', view.w / 2 + 20, 18, p, narrow ? 13 : 15);
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [st]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrowStage(isNarrow(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** every change the learner makes goes through here: it sets the state and ticks the tasks it completes */
  const act = (patch: Partial<State>, how: 'point' | 'slider-s' | 'slider-theta' | 'slider-mu' | 'box' | 'scene' | 'other') => {
    const next: State = { ...stRef.current, ...patch };
    stRef.current = next;
    setSt(next);
    const nb = build(next);
    const nP = pointOf(next, nb);
    const sol = nb.ladder;
    if (next.scene === 'ladder' && sol) {
      if (how === 'point' && 'name' in next.P && next.P.name === 'B') done('foot');
      if (how === 'point' && !sol.slips) {
        // distance from P to the ladder segment AB
        const ab: Vec2 = [sol.B[0] - sol.A[0], sol.B[1] - sol.A[1]];
        const t = clamp(((nP[0] - sol.A[0]) * ab[0] + (nP[1] - sol.A[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2), 0, 1);
        const dSeg = Math.hypot(nP[0] - sol.A[0] - t * ab[0], nP[1] - sol.A[1] - t * ab[1]);
        if (dSeg > 0.3) done('off-ladder');
      }
      if (how === 'slider-s' && sol.slips) done('climb-slip');
      if ((how === 'slider-theta' || how === 'slider-s' || how === 'slider-mu') && next.s >= L_LAD - 0.05 && !sol.slips) done('steeper');
    }
    if (next.scene === 'couple' && how === 'point') {
      if (next.one) done('one-force');
      else {
        const spots = coupleSpots.current;
        if (!spots.some((q) => Math.hypot(q[0] - nP[0], q[1] - nP[1]) < 0.3)) spots.push(nP);
        if (spots.length >= 3) done('couple-move');
      }
    }
    if (next.scene === 'beam' && how === 'box' && nb.beam) {
      if (next.box > BEAM.b) done('box-over');
      if (nb.beam.tips !== 'none') done('tip');
    }
  };

  const toWorldPt = (e: PointerEvent): Vec2 | null => {
    const c = canvasRef.current;
    const m = mapRef.current;
    if (!c || !m) return null;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left - m.x0) / m.k;
    const y = (m.y0 - (e.clientY - r.top)) / m.k;
    const bd = b.bounds;
    return [roundTo(clamp(x, bd.xMin, bd.xMax), 0.01), roundTo(clamp(y, bd.yMin, bd.yMax), 0.01)];
  };
  const onPointerDown = (e: PointerEvent) => {
    const q = toWorldPt(e);
    if (!q) return;
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    act({ P: { at: q } }, 'point');
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const q = toWorldPt(e);
    if (q) act({ P: { at: q } }, 'point');
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const cur = stRef.current;
    const cb = build(cur);
    const cP = pointOf(cur, cb);
    const sum = cb.rows.reduce((acc, r) => acc + torqueAbout(r.f, cP), 0);
    setLive(`הנקודה P הוזזה. סכום המומנטים סביבה ${signed(sum, tiny)} ניוטון-מטר.`);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step: Record<string, Vec2> = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    const bd = b.bounds;
    act({ P: { at: [roundTo(clamp(P[0] + d[0], bd.xMin, bd.xMax), 0.01), roundTo(clamp(P[1] + d[1], bd.yMin, bd.yMax), 0.01)] } }, 'point');
  };

  const reset = () => {
    const s0 = initial();
    stRef.current = s0;
    coupleSpots.current = [];
    setSt(s0);
    setLive('האיור חזר למצב ההתחלה.');
  };

  const sol = b.ladder;
  const beam = b.beam;
  const scenes = props.scenes ?? [];
  const sMax = sol ? clamp(ladderMaxClimb(M_LAD, M_PERSON, rad(st.theta), st.mu), 0, 1) * L_LAD : 0;
  const thMin = sol ? deg(ladderMinAngle(M_LAD, M_PERSON, st.s / L_LAD, st.mu)) : 0;
  const tipX = BEAM.b + (BEAM.M * (BEAM.b - BEAM.L / 2)) / M_BOX;
  const pName = 'name' in st.P ? (b.points[st.P.name]?.name ?? '') : '';
  const aspect = st.scene === 'ladder' ? (narrowStage ? 0.8 : 1.0) : st.scene === 'beam' ? (narrowStage ? 1.0 : 1.35) : narrowStage ? 1.0 : 1.2;
  const cell = { padding: '2px 6px', textAlign: 'start' as const, whiteSpace: 'nowrap' as const };
  const numCell = { ...cell, textAlign: 'left' as const, direction: 'ltr' as const, fontVariantNumeric: 'tabular-nums' };

  const label =
    st.scene === 'ladder' && sol
      ? `איור חי: סולם באורך ${sci(L_LAD)} מטר בזווית ${sci(st.theta)} מעלות עם הרצפה, נשען על קיר חלק; אדם עומד במרחק ${sci(st.s)} מטר מהרגליים. הקיר דוחף ${sci(sol.N2)} ניוטון, הרצפה דוחפת ${sci(sol.N1)} ניוטון, והחיכוך הדרוש ${sci(sol.f)} ניוטון מתוך ${sci(sol.fMax)} אפשריים. ${sol.slips ? 'הסולם מחליק.' : ''} לחיצה על הבמה או החצים מזיזים את הנקודה P.`
      : st.scene === 'beam' && beam
        ? `איור חי: קורה על שתי תמיכות וארגז במרחק ${sci(st.box)} מטר מקצה הקורה. התמיכות דוחפות ${signed(beam.N1)} ו-${signed(beam.N2)} ניוטון. לחיצה על הבמה או החצים מזיזים את הנקודה P.`
        : `איור חי: מוט על שולחן חלק ${st.one ? 'וכוח אחד בקצהו' : 'ושני כוחות שווים והפוכים בקצותיו, זוג כוחות'}. סכום המומנטים סביב P הוא ${signed(tauSum, tiny)} ניוטון-מטר.`;

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor="crosshair"
      readout={
        <>
          <span data-readout="P">
            המומנטים סביב <bdi class="q">P</bdi>
            {pName ? ` (${pName})` : ''}: <bdi class="q">P = ({signed(P[0], 1e-6)}, {signed(P[1], 1e-6)}) m</bdi>
          </span>
          <table style={{ flex: '1 1 100%', borderCollapse: 'collapse', fontSize: '0.85rem' }} data-readout="table">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                <th style={cell}>כוח</th>
                <th style={numCell}>F (N)</th>
                <th style={numCell}>d (m)</th>
                <th style={numCell}>τ (N·m)</th>
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r) => {
                const m = Math.hypot(r.f.F[0], r.f.F[1]);
                return (
                  <tr key={r.f.id} data-row={r.f.id} style={r.f.id === st.arm ? { color: 'var(--accent)' } : undefined}>
                    <td style={cell}>
                      <bdi class="q">{r.label}</bdi> <span style={{ fontSize: '0.8em' }}>({r.agent})</span>
                    </td>
                    <td style={numCell}>{signed(m, 1e-9 * fScale)}</td>
                    <td style={numCell}>{signed(leverArm(r.f, P), 1e-6)}</td>
                    <td style={numCell}>{signed(torqueAbout(r.f, P), tiny)}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: '1px solid var(--rule)', fontWeight: 600 }} data-row="sum">
                <td style={cell}>סכום</td>
                <td style={numCell} data-readout="sumF">
                  |ΣF| = {signed(Math.hypot(Fnet[0], Fnet[1]), 1e-9 * fScale)}
                </td>
                <td style={numCell} />
                <td style={numCell} data-readout="sumTau">
                  Στ = {signed(tauSum, tiny)}
                </td>
              </tr>
            </tbody>
          </table>
          {st.scene === 'ladder' && sol && (
            <>
              <span data-readout="fneed">
                חיכוך דרוש <bdi class="q">f = {sci(sol.f)} N</bdi>
              </span>
              <span data-readout="fmax">
                המרבי <bdi class="q">μₛN₁ = {sci(sol.fMax)} N</bdi>
              </span>
              <b data-readout="state">{sol.slips ? 'הסולם מחליק (הטבלה: מה ששיווי משקל היה דורש)' : 'הסולם עומד'}</b>
              <span data-readout="smax">
                האדם יכול לעלות עד <bdi class="q">{sMax >= L_LAD - 1e-9 ? `s = ${sci(L_LAD)} m (הראש)` : `s = ${sci(sMax)} m`}</bdi>
              </span>
              <span data-readout="thmin">
                זווית מזערית במקום הזה: <bdi class="q">θ = {sci(thMin)}°</bdi>
              </span>
            </>
          )}
          {st.scene === 'beam' && beam && (
            <>
              <b data-readout="state">{beam.tips !== 'none' ? 'הקורה מתהפכת: תמיכה לא יכולה למשוך' : 'הקורה עומדת'}</b>
              <span data-readout="tip">
                הקורה מתהפכת כשהארגז מעבר ל-<bdi class="q">x = {sci(tipX)} m</bdi>
              </span>
            </>
          )}
        </>
      }
      controls={
        <>
          {scenes.length > 1 && (
            <div class="group" role="group" aria-label="בחירת מצב">
              {scenes.map((sc) => (
                <Toggle
                  key={sc}
                  label={SCENE_LABEL[sc]}
                  on={st.scene === sc}
                  onChange={() => act({ scene: sc, P: { name: DEFAULT_P[sc] }, arm: DEFAULT_ARM[sc] }, 'scene')}
                />
              ))}
            </div>
          )}
          <div class="group" role="group" aria-label="הנקודה P">
            {Object.entries(b.points).map(([key, q]) => (
              <Toggle
                key={key}
                label={key === 'Q' ? 'Q: מפגש הקווים של N₁ ו-N₂' : st.scene === 'ladder' ? `${key}: ${q.name}` : q.name}
                on={'name' in st.P && st.P.name === key}
                onChange={() => act({ P: { name: key } }, 'point')}
              />
            ))}
          </div>
          <div class="group" role="group" aria-label="הזרוע של כוח">
            <span>זרוע של:</span>
            {b.rows.map((r) => (
              <Toggle key={r.f.id} label={<bdi class="q">{r.label}</bdi>} swatch="var(--accent)" on={st.arm === r.f.id} onChange={(on) => act({ arm: on ? r.f.id : null }, 'other')} />
            ))}
          </div>
          {st.scene === 'ladder' && (
            <>
              <Slider label="הזווית עם הרצפה θ" value={st.theta} min={TH_MIN} max={TH_MAX} step={1} format={(x) => `${sci(x)}°`} onChange={(v) => act({ theta: clamp(Math.round(v), TH_MIN, TH_MAX) }, 'slider-theta')} />
              <Slider label="המקום של האדם s (מהרגליים)" value={st.s} min={0} max={L_LAD} step={0.1} format={(x) => `${sci(x)} m`} onChange={(v) => act({ s: clamp(roundTo(v, 0.1), 0, L_LAD) }, 'slider-s')} />
              <Slider label="מקדם החיכוך הסטטי μₛ" value={st.mu} min={MU_MIN} max={MU_MAX} step={0.05} format={(x) => sci(x)} onChange={(v) => act({ mu: clamp(roundTo(v, 0.05), MU_MIN, MU_MAX) }, 'slider-mu')} />
            </>
          )}
          {st.scene === 'beam' && (
            <Slider label="המקום של הארגז x" value={st.box} min={0} max={BEAM.L} step={0.05} format={(x) => `${sci(x)} m`} onChange={(v) => act({ box: clamp(roundTo(v, 0.05), 0, BEAM.L) }, 'box')} />
          )}
          {st.scene === 'couple' && (
            <div class="group" role="group" aria-label="הכוחות על המוט">
              <Toggle label="שני כוחות (זוג)" on={!st.one} onChange={() => act({ one: false, arm: 'F2' }, 'other')} />
              <Toggle label="רק כוח אחד" on={st.one} onChange={() => act({ one: true, arm: 'F2' }, 'other')} />
            </div>
          )}
        </>
      }
    />
  );
}
