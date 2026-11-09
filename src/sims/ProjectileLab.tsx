/**
 * ProjectileLab (lesson 1.2; lesson 2.7 will add a drag mode): a body launched under constant gravity,
 * over level ground (optionally from a height) or from the foot of an incline. The learner sets the
 * launch speed and angle, launches, and scrubs time to read r(t), v(t) and a = g at any instant.
 * Earlier landings stay as faint paths so launches can be compared. Options: the velocity and
 * acceleration arrows, the velocity components, the envelope of all paths at this speed, tilted axes
 * on the incline (ξ along it, η perpendicular, g split into g sinβ and g cosβ), and a second body
 * thrown at the same instant from a tower, with the relative position r_B − r_A drawn in an inset.
 *
 * Every number comes from src/physics/projectile.ts. The motion is read through a `Model` (position,
 * velocity, flight time, impact); a drag mode only has to build a Model from `numericFlight` with a
 * drag force, and nothing that draws changes.
 *
 * Tasks tick only in the learner's own handlers (the launch button, a landing it started, the time
 * slider). A text step can set the sliders and toggles but never launches or moves time through a
 * handler, so a step can never tick a task.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import {
  envelopeY,
  inclineBestAngle,
  inclineFlight,
  levelFlightTime,
  maxHeight,
  positionAt,
  velocityAt,
  type Launch,
  type Vec2,
} from '~/physics/projectile';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, polyline, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const ASPECT = 16 / 9;
const KEEP = 4;
const rad = (d: number) => (d * Math.PI) / 180;

/** A quantity isolated as LTR (U+2066 … U+2069), so a degree sign stays next to its number in RTL text. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  launch: 'שגרו את הגוף פעם אחת, בכפתור "שגרו".',
  'apex-accel': 'הדליקו את החצים, והזיזו את פס הזמן עד הנקודה הגבוהה ביותר. מה התאוצה שם?',
  complementary: `באותה מהירות, שגרו בשתי זוויות שסכומן ${ltr('90°')} (לא ${ltr('45°')} ו-${ltr('45°')}). איפה נחת כל גוף?`,
  'beat-45': `על המדרון: שגרו פעם בזווית ${ltr('45°')}, ואחר כך מצאו זווית שמגיעה רחוק יותר לאורך המדרון, באותה מהירות.`,
  'incline-best': 'על המדרון: מצאו את הזווית שנותנת את הטווח הגדול ביותר לאורך המדרון, ושגרו בה.',
  'pair-scrub': 'עם שני הגופים: הזיזו את פס הזמן לאורך רוב התנועה, והסתכלו על החץ במסגרת הקטנה.',
};

export type Scene = 'level' | 'incline';

/** The second body of the pair option: thrown at t = 0 from (x, h) with velocity (vx, vy). */
export interface PairBody {
  x: number;
  h: number;
  vx: number;
  vy: number;
}

export interface ProjectileLabProps {
  id: string;
  scene?: Scene;
  v?: number;
  angle?: number;
  /** launch height above level ground [m] */
  h0?: number;
  /** incline angle [deg] */
  beta?: number;
  /** slider limits; the drawing scale is fixed by vMax and h0Max so launches can be compared */
  vMin?: number;
  vMax?: number;
  h0Max?: number;
  betaMax?: number;
  /** which sliders appear besides speed, angle and time */
  heightSlider?: boolean;
  vectors?: boolean;
  components?: boolean;
  envelope?: boolean;
  tilted?: boolean;
  pair?: boolean;
  pairBody?: PairBody;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

interface Aim {
  scene: Scene;
  v: number;
  angle: number;
  h0: number;
  beta: number;
}

interface Show {
  vectors: boolean;
  components: boolean;
  envelope: boolean;
  tilted: boolean;
  pair: boolean;
}

/** The motion as the figure reads it. A drag mode builds one from numericFlight. */
interface Model {
  position: (t: number) => Vec2;
  velocity: (t: number) => Vec2;
  /** time in the air [s] */
  time: number;
  impact: Vec2;
  /** the distance the lesson calls the range: horizontal on level ground, along the slope on an incline */
  range: number;
}

interface Shot extends Aim {
  n: number;
  model: Model;
}

const launchOf = (a: Aim): Launch => ({ v0: a.v, angleDeg: a.angle, h0: a.scene === 'level' ? a.h0 : 0 });

function modelOf(a: Aim): Model {
  const l = launchOf(a);
  const position = (t: number) => positionAt(l, t);
  const velocity = (t: number) => velocityAt(l, t);
  if (a.scene === 'incline') {
    const f = inclineFlight(a.v, a.angle, a.beta);
    return { position, velocity, time: f.time, impact: f.impact, range: f.along };
  }
  const time = levelFlightTime(l);
  const impact: Vec2 = [position(time)[0], 0];
  return { position, velocity, time, impact, range: impact[0] };
}

/**
 * Canvas text with a paper-coloured halo, so a label stays readable where it crosses a line or an arrow.
 * Latin and math labels only (LTR); Hebrew goes through handNote.
 */
function haloText(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  s: string,
  x: number,
  y: number,
  o: { font: string; color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline },
) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.font = o.font;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.baseline ?? 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/**
 * A vector symbol with a subscript, r⃗_B: the letter italic, an arrow over it, the subscript smaller and lower.
 * Draws with its left edge at x and returns the width it took.
 */
function vecSub(ctx: CanvasRenderingContext2D, p: Palette, letter: string, sub: string, x: number, y: number, size: number, color: string, arrowOver = true): number {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 600 ${size}px ${p.fontUi}`;
  const lw = ctx.measureText(letter).width;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(letter, x, y);
  ctx.fillStyle = color;
  ctx.fillText(letter, x, y);
  if (arrowOver) {
    // the arrow over the letter
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.1;
    const ay = y - size * 0.62;
    ctx.beginPath();
    ctx.moveTo(x, ay);
    ctx.lineTo(x + lw + 1, ay);
    ctx.moveTo(x + lw + 1, ay);
    ctx.lineTo(x + lw - 2, ay - 2.5);
    ctx.moveTo(x + lw + 1, ay);
    ctx.lineTo(x + lw - 2, ay + 2.5);
    ctx.stroke();
  }
  ctx.font = `600 ${Math.round(size * 0.7)}px ${p.fontUi}`;
  const sw = ctx.measureText(sub).width;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(sub, x + lw + 1, y + size * 0.32);
  ctx.fillText(sub, x + lw + 1, y + size * 0.32);
  ctx.restore();
  return lw + 1 + sw;
}

/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number) => (Math.abs(x) < 0.005 ? '0' : sci(x, 3).replace('-', '−'));

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const DEFAULT_PAIR: PairBody = { x: 45, h: 20, vx: -10, vy: 0 };

export default function ProjectileLab(props: ProjectileLabProps) {
  const V_MIN = props.vMin ?? 5;
  const V_MAX = props.vMax ?? 25;
  const H_MAX = props.h0Max ?? 0;
  const B_MAX = props.betaMax ?? 40;
  const pairBody = props.pairBody ?? DEFAULT_PAIR;
  const angleMin = (a: Aim) => (a.scene === 'incline' ? a.beta + 1 : 0);

  const initialAim = (): Aim => {
    const scene = props.scene ?? 'level';
    const beta = scene === 'incline' ? clamp(props.beta ?? 20, 0, B_MAX) : 0;
    return {
      scene,
      v: clamp(props.v ?? 20, V_MIN, V_MAX),
      angle: clamp(props.angle ?? 45, scene === 'incline' ? beta + 1 : 0, 90),
      h0: clamp(props.h0 ?? 0, 0, H_MAX),
      beta,
    };
  };
  const initialShow = (): Show => ({
    vectors: props.vectors ?? false,
    components: props.components ?? false,
    envelope: props.envelope ?? false,
    tilted: props.tilted ?? false,
    pair: props.pair ?? false,
  });

  const [aim, setAim] = useState<Aim>(initialAim);
  const [show, setShow] = useState<Show>(initialShow);
  /** the instant shown when nothing is flying [s] */
  const [time, setTime] = useState(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const [flying, setFlying] = useState<Shot | null>(null);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  const landed = useRef(0);
  const count = useRef(0);
  /** every landing of this visit, for the tasks that compare launches */
  const history = useRef<Shot[]>([]);

  const model = modelOf(aim);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the aim and the toggles, and put the instant back to the launch; they never launch
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setAim((prev) => {
          const scene = st.scene === 'level' || st.scene === 'incline' ? st.scene : prev.scene;
          const beta = scene === 'incline' ? clamp(num(st.beta) ?? prev.beta, 0, B_MAX) : 0;
          return {
            scene,
            v: clamp(num(st.v) ?? prev.v, V_MIN, V_MAX),
            angle: clamp(num(st.angle) ?? prev.angle, scene === 'incline' ? beta + 1 : 0, 90),
            h0: clamp(num(st.h0) ?? prev.h0, 0, H_MAX),
            beta,
          };
        });
        setShow((prev) => ({
          vectors: bool(st.vectors) ?? prev.vectors,
          components: bool(st.components) ?? prev.components,
          envelope: bool(st.envelope) ?? prev.envelope,
          tilted: bool(st.tilted) ?? prev.tilted,
          pair: bool(st.pair) ?? prev.pair,
        }));
        const tf = num(st.tFrac);
        setFlying(null);
        setTime(tf === null ? 0 : -tf); // a negative time is a fraction of the flight, resolved below
      }),
    [props.id],
  );
  // resolve a fraction a step asked for, once the aim it set is known
  useEffect(() => {
    if (time < 0) setTime(-time * model.time);
  }, [time, model.time]);

  const pairModel = (): Model => {
    const position = (t: number): Vec2 => [pairBody.x + pairBody.vx * t, pairBody.h + pairBody.vy * t - 0.5 * G * t * t];
    const tB = (pairBody.vy + Math.sqrt(pairBody.vy ** 2 + 2 * G * pairBody.h)) / G;
    return { position, velocity: (t) => [pairBody.vx, pairBody.vy - G * t], time: tB, impact: position(tB), range: 0 };
  };

  const describe = (s: Shot) =>
    s.scene === 'incline'
      ? `הגוף ששוגר ב-${s.v} מטר בשנייה בזווית ${s.angle} מעלות מעל האופק פגע במדרון במרחק ${sci(s.model.range)} מטר לאורך המדרון, אחרי ${sci(s.model.time)} שניות.`
      : `הגוף ששוגר ב-${s.v} מטר בשנייה בזווית ${s.angle} מעלות נחת ${sci(s.model.range)} מטר מנקודת השיגור, אחרי ${sci(s.model.time)} שניות.`;

  const land = (s: Shot) => {
    if (landed.current === s.n) return;
    landed.current = s.n;
    setFlying(null);
    setTime(s.model.time);
    setShots((prev) => [...prev, s].slice(-KEEP));
    setLive(describe(s));
    history.current.push(s);
    const h = history.current;
    const same = (o: Shot) => o.scene === s.scene && o.v === s.v && o.h0 === s.h0 && o.beta === s.beta;
    if (s.scene === 'level' && s.h0 === 0 && s.angle !== 45 && h.some((o) => same(o) && o.angle + s.angle === 90)) done('complementary');
    if (s.scene === 'incline' && s.beta > 0) {
      const at45 = h.find((o) => same(o) && o.angle === 45);
      if (at45 && s.angle !== 45 && s.model.range > at45.model.range + 0.05) done('beat-45');
      if (s.beta >= 10 && Math.abs(s.angle - inclineBestAngle(s.beta)) <= 0.5) done('incline-best');
    }
  };

  const fire = () => {
    if (model.time <= 0) {
      setLive('בזווית הזו הגוף לא עוזב את המדרון. הגדילו את הזווית.');
      return;
    }
    const n = ++count.current;
    t0.current = null;
    const s: Shot = { ...aim, n, model };
    done('launch');
    if (!motionAllowed()) {
      land(s);
      return;
    }
    setFlying(s);
    setLive('הגוף באוויר.');
  };

  /** the world shown, fixed by the slider limits so that paths keep their scale */
  const world = () => {
    const span = (V_MAX * V_MAX) / G;
    if (aim.scene === 'incline') return { x0: -0.06 * span, x1: 1.04 * span, y0: -0.06 * span, y1: 0.54 * span };
    let far = 0;
    for (let d = 1; d < 90; d++) far = Math.max(far, modelOf({ ...aim, v: V_MAX, angle: d, h0: H_MAX }).range);
    const top = H_MAX + span / 2;
    return { x0: -0.06 * far, x1: 1.04 * far, y0: -0.06 * top, y1: 1.06 * top };
  };

  const layout = (v: View) => {
    const w = world();
    const pad = 10;
    const ppm = Math.min((v.w - 2 * pad) / (w.x1 - w.x0), (v.h - 2 * pad - 14) / (w.y1 - w.y0));
    const left = (v.w - ppm * (w.x1 - w.x0)) / 2;
    const bottom = v.h - pad - 14;
    return { w, ppm, sx: (x: number) => left + (x - w.x0) * ppm, sy: (y: number) => bottom - (y - w.y0) * ppm };
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const { w, ppm, sx, sy } = layout(view);
    const narrow = view.w < 520;
    const pt = (q: Vec2): [number, number] => [sx(q[0]), sy(q[1])];
    const fs = narrow ? 10 : 12;
    const tanA = Math.tan(rad(aim.beta));
    const groundY = (x: number) => (aim.scene === 'incline' ? Math.max(0, x) * tanA : 0);

    // the ground and a scale along it
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.fillStyle = withAlpha(p.ink3, 0.12);
    ctx.beginPath();
    ctx.moveTo(sx(w.x0), sy(0));
    ctx.lineTo(sx(0), sy(0));
    ctx.lineTo(sx(w.x1), sy(groundY(w.x1)));
    ctx.lineTo(sx(w.x1), sy(w.y0));
    ctx.lineTo(sx(w.x0), sy(w.y0));
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx(w.x0), sy(0));
    ctx.lineTo(sx(0), sy(0));
    ctx.lineTo(sx(w.x1), sy(groundY(w.x1)));
    ctx.stroke();
    const step = w.x1 > 60 ? 10 : 5;
    const tickFont = `${fs}px ${p.fontUi}`;
    if (aim.scene === 'level') {
      for (let x = 0; x <= w.x1; x += step) {
        ctx.beginPath();
        ctx.moveTo(sx(x), sy(0));
        ctx.lineTo(sx(x), sy(0) + 4);
        ctx.stroke();
        haloText(ctx, p, x === 0 ? '0' : `${x} m`, sx(x), sy(0) + 5, { font: tickFont, color: p.ink2, baseline: 'top' });
      }
    } else {
      // ticks along the slope, every `step` metres of slope length; labels on every second tick, and on a
      // narrow screen not on the first one, which would sit on the angle mark at the foot of the incline
      const c = Math.cos(rad(aim.beta));
      const s = Math.sin(rad(aim.beta));
      for (let L = step; L * c <= w.x1; L += step) {
        const [x, y] = pt([L * c, L * s]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 4 * s, y + 4 * c);
        ctx.stroke();
        const labelled = (L / step) % 2 === 0 && (!narrow || L > 2 * step);
        if (labelled) haloText(ctx, p, `${L} m`, x + 10 * s, y + 6 * c, { font: tickFont, color: p.ink2, baseline: 'top' });
      }
      // the incline angle, from a dashed horizontal; its label below the horizontal, clear of the slope and its ruler
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = p.ink3;
      ctx.beginPath();
      ctx.moveTo(sx(0), sy(0));
      ctx.lineTo(sx(0.3 * w.x1), sy(0));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(sx(0), sy(0), 0.2 * w.x1 * ppm, -rad(aim.beta), 0);
      ctx.stroke();
      haloText(ctx, p, `β = ${aim.beta}°`, sx(0.2 * w.x1), sy(0) + 4, { font: `600 ${fs}px ${p.fontUi}`, baseline: 'top' });
    }
    ctx.restore();

    // a cliff under a raised launch point
    if (aim.scene === 'level' && aim.h0 > 0) {
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.35);
      ctx.fillRect(sx(w.x0), sy(aim.h0), sx(0) - sx(w.x0), sy(0) - sy(aim.h0));
      ctx.restore();
      haloText(ctx, p, `h₀ = ${sci(aim.h0)} m`, sx(0) + 4, sy(aim.h0 / 2), { font: `${fs}px ${p.fontUi}`, color: p.ink2, align: 'left' });
    }

    // the envelope of every path at this speed, from the launch point
    if (show.envelope) {
      const h0 = aim.scene === 'level' ? aim.h0 : 0;
      const env: [number, number][] = [];
      for (let k = 0; k <= 200; k++) {
        const x = (w.x1 * k) / 200;
        const y = h0 + envelopeY(aim.v, x);
        if (y < groundY(x)) break;
        env.push(pt([x, y]));
      }
      polyline(ctx, env, p.accent, 1.8, { dash: [7, 5] });
      if (env.length > 20) {
        const [ex, ey] = env[Math.floor(env.length * 0.55)];
        handNote(ctx, 'מעטפת', ex + 26, ey - 12, p, narrow ? 12 : 14);
      }
    }

    // earlier landings, faint, each with its angle at the impact point
    const sampled = (m: Model, upTo: number) => {
      const out: [number, number][] = [];
      for (let k = 0; k <= 120; k++) out.push(pt(m.position((upTo * k) / 120)));
      return out;
    };
    shots.forEach((s, i) => {
      polyline(ctx, sampled(s.model, s.model.time), p.ink3, 1.3, { alpha: 0.75 });
      const [ix, iy] = pt(s.model.impact);
      ctx.save();
      ctx.fillStyle = p.ink3;
      ctx.beginPath();
      ctx.arc(ix, iy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      haloText(ctx, p, `${s.angle}°`, ix, iy - 6 - (i % 2) * 13, { font: `${fs}px ${p.fontUi}`, color: p.ink2, baseline: 'bottom' });
    });

    // the instant shown
    let now = clamp(time, 0, model.time);
    let m = model;
    if (flying) {
      if (t0.current === null) t0.current = t;
      m = flying.model;
      now = Math.min(t - t0.current, m.time);
      if (t - t0.current >= m.time) land(flying);
    }

    // tilted axes from the launch point
    if (aim.scene === 'incline' && show.tilted) {
      const L = 0.22 * w.x1 * ppm;
      const a = rad(aim.beta);
      const [ox, oy] = pt([0, 0]);
      arrow(ctx, ox, oy, ox + L * Math.cos(a), oy - L * Math.sin(a), { color: p.ink2, width: 1.4, head: 8 });
      arrow(ctx, ox, oy, ox - L * 0.7 * Math.sin(a), oy - L * 0.7 * Math.cos(a), { color: p.ink2, width: 1.4, head: 8 });
      const axisFont = `italic 600 ${fs + 2}px ${p.fontUi}`;
      haloText(ctx, p, 'ξ', ox + (L + 10) * Math.cos(a), oy - (L + 10) * Math.sin(a) - 6, { font: axisFont, color: p.ink2 });
      haloText(ctx, p, 'η', ox - (L * 0.7 + 10) * Math.sin(a) - 8, oy - (L * 0.7 + 10) * Math.cos(a), { font: axisFont, color: p.ink2 });
    }

    // the path so far and the body
    polyline(ctx, sampled(m, now), p.ink, 2);
    const body = m.position(now);
    const [bx, by] = pt(body);

    // the clearance from the incline, perpendicular to it
    if (aim.scene === 'incline' && show.tilted && now > 0 && now < m.time) {
      const a = rad(aim.beta);
      const d = (body[1] - body[0] * tanA) * Math.cos(a);
      const foot: Vec2 = [body[0] + d * Math.sin(a), body[1] - d * Math.cos(a)];
      const [fx, fy] = pt(foot);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = p.hand;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.restore();
    }

    // the second body, its path so far, and the segment from A to B
    let rel: Vec2 | null = null;
    if (show.pair && aim.scene === 'level') {
      const B = pairModel();
      const tb = Math.min(now, B.time);
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.35);
      const half = 0.012 * (w.x1 - w.x0);
      ctx.fillRect(sx(pairBody.x - half), sy(pairBody.h), 2 * half * ppm, sy(0) - sy(pairBody.h));
      ctx.restore();
      polyline(ctx, sampled({ ...B, time: tb } as Model, tb), p.ink2, 1.6);
      const [qx, qy] = pt(B.position(tb));
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = p.hand;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(qx, qy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = p.momentum;
      ctx.beginPath();
      ctx.arc(qx, qy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      haloText(ctx, p, 'B', qx + 12, qy - 10, { font: `600 ${fs + 2}px ${p.fontUi}` });
      haloText(ctx, p, 'A', bx - 12, by - 10, { font: `600 ${fs + 2}px ${p.fontUi}` });
      rel = [B.position(tb)[0] - body[0], B.position(tb)[1] - body[1]];

      // inset: the tip of r_B − r_A over the whole common flight, from one origin
      const tEnd = Math.min(m.time, B.time);
      const pts: Vec2[] = [];
      for (let k = 0; k <= 40; k++) {
        const tt = (tEnd * k) / 40;
        const pa = m.position(tt);
        const pb = B.position(tt);
        pts.push([pb[0] - pa[0], pb[1] - pa[1]]);
      }
      const bw = view.w * (narrow ? 0.34 : 0.27);
      const bh = view.h * 0.32;
      const bx0 = 8;
      const by0 = 8;
      ctx.save();
      ctx.fillStyle = withAlpha(p.paper, 0.9);
      ctx.strokeStyle = p.rule;
      ctx.fillRect(bx0, by0, bw, bh);
      ctx.strokeRect(bx0, by0, bw, bh);
      const xs = [0, ...pts.map((q) => q[0])];
      const ys = [0, ...pts.map((q) => q[1])];
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
      const k = (Math.min(bw, bh) - 34) / span;
      const cx = bx0 + bw / 2 - (k * (Math.max(...xs) + Math.min(...xs))) / 2;
      const cy = by0 + bh / 2 + 6 + (k * (Math.max(...ys) + Math.min(...ys))) / 2;
      const ip = (q: Vec2): [number, number] => [cx + k * q[0], cy - k * q[1]];
      polyline(ctx, pts.map(ip), p.ink3, 1.2, { dash: [3, 3] });
      const [rx, ry] = ip(rel);
      arrow(ctx, cx, cy, rx, ry, { color: p.hand, width: 1.8, head: 7 });
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // the title r⃗_B − r⃗_A, centred: measure the pieces, then draw them left to right
      const ts = fs + 2;
      const ty = by0 + 6 + ts * 0.6;
      ctx.save();
      ctx.font = `600 ${ts}px ${p.fontUi}`;
      const minus = ' − ';
      const mw = ctx.measureText(minus).width;
      ctx.font = `italic 600 ${ts}px ${p.fontUi}`;
      const rw = ctx.measureText('r').width + 1;
      ctx.font = `600 ${Math.round(ts * 0.7)}px ${p.fontUi}`;
      const subw = Math.max(ctx.measureText('A').width, ctx.measureText('B').width);
      ctx.restore();
      let tx = bx0 + bw / 2 - (2 * (rw + subw) + mw) / 2;
      tx += vecSub(ctx, p, 'r', 'B', tx, ty, ts, p.ink);
      haloText(ctx, p, minus, tx, ty, { font: `600 ${ts}px ${p.fontUi}`, align: 'left' });
      tx += mw;
      vecSub(ctx, p, 'r', 'A', tx, ty, ts, p.ink);
    }

    // the launcher, along the aim
    const th = rad(aim.angle);
    const [lx, ly] = pt([0, aim.scene === 'level' ? aim.h0 : 0]);
    const barrel = Math.max(20, 0.035 * view.w);
    ctx.save();
    ctx.strokeStyle = p.equip;
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + barrel * Math.cos(th), ly - barrel * Math.sin(th));
    ctx.stroke();
    ctx.restore();
    {
      // above the barrel, clear of the path's first metres; on an incline high enough that the text, which runs to
      // the right, stays above the slope (the bisector between barrel and slope put it on the slope line)
      const above = aim.scene === 'incline' ? Math.max(aim.angle + 12, aim.beta + 45) : aim.angle + 12;
      const labelAng = above <= 82 ? rad(above) : th - rad(16);
      const r = barrel + 18;
      const ax = lx + r * Math.cos(labelAng);
      const ay = ly - r * Math.sin(labelAng);
      // the text runs to the right of its anchor, away from the launcher and the left edge
      haloText(ctx, p, `θ = ${aim.angle}°`, ax, ay, { font: `600 ${fs + 1}px ${p.fontUi}`, align: 'left' });
    }

    ctx.save();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(bx, by, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // velocity and acceleration, on one scale: the g arrow is the change in velocity over one second
    if (show.vectors || show.components) {
      const kV = (0.16 * view.w) / V_MAX;
      const vel = m.velocity(now);
      if (show.vectors) {
        arrow(ctx, bx, by, bx + kV * vel[0], by - kV * vel[1], { color: p.velocity, width: 2.4, head: 10 });
        arrow(ctx, bx, by, bx, by + kV * G, { color: p.accel, width: 2.4, head: 10 });
        const vf = `italic 600 ${fs + 3}px ${p.fontUi}`;
        haloText(ctx, p, 'v', bx + kV * vel[0] + 8, by - kV * vel[1] - 8, { font: vf, color: p.velocity });
        haloText(ctx, p, 'g', bx + 10, by + kV * G, { font: vf, color: p.accel });
      }
      if (show.components) {
        arrow(ctx, bx, by, bx + kV * vel[0], by, { color: p.velocity, width: 1.5, head: 7, alpha: 0.75 });
        arrow(ctx, bx, by, bx, by - kV * vel[1], { color: p.velocity, width: 1.5, head: 7, alpha: 0.75 });
        vecSub(ctx, p, 'v', 'x', bx + kV * vel[0] + 4, by + 12, fs + 1, p.velocity, false);
        vecSub(ctx, p, 'v', 'y', bx - 20, by - kV * vel[1], fs + 1, p.velocity, false);
      }
      if (show.tilted && aim.scene === 'incline') {
        const a = rad(aim.beta);
        const gs = kV * G;
        // g sinβ along −ξ and g cosβ along −η
        arrow(ctx, bx, by, bx - gs * Math.sin(a) * Math.cos(a), by + gs * Math.sin(a) * Math.sin(a), { color: p.accel, width: 1.4, head: 7, alpha: 0.75 });
        arrow(ctx, bx, by, bx + gs * Math.cos(a) * Math.sin(a), by + gs * Math.cos(a) * Math.cos(a), { color: p.accel, width: 1.4, head: 7, alpha: 0.75 });
      }
      if (Math.abs(vel[1]) < 0.04 * aim.v && now > 0 && now < m.time) handNote(ctx, 'שיא', bx, by - 28, p, narrow ? 12 : 14);
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: flying !== null });
  useEffect(invalidate, [aim, show, time, shots, flying]);

  const change = (f: (a: Aim) => Aim) => {
    setFlying(null);
    setTime(0);
    setAim((a) => f(a));
  };
  const setV = (v: number) => change((a) => ({ ...a, v: clamp(Math.round(v), V_MIN, V_MAX) }));
  const setAngle = (d: number) => change((a) => ({ ...a, angle: clamp(Math.round(d), angleMin(a), 90) }));
  const setH0 = (h: number) => change((a) => ({ ...a, h0: clamp(h, 0, H_MAX) }));
  const setBeta = (al: number) =>
    change((a) => {
      const beta = clamp(Math.round(al / 2) * 2, 0, B_MAX);
      return { ...a, beta, angle: Math.max(a.angle, beta + 1) };
    });
  const scrub = (tt: number) => {
    setFlying(null);
    const t = clamp(tt, 0, model.time);
    setTime(t);
    if (show.vectors && Math.abs(model.velocity(t)[1]) <= 0.04 * aim.v && model.velocity(0)[1] > 0) done('apex-accel');
    if (show.pair && aim.scene === 'level' && t >= 0.8 * Math.min(model.time, pairModel().time)) done('pair-scrub');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') setAngle(aim.angle + 1);
    else if (e.key === 'ArrowDown') setAngle(aim.angle - 1);
    else if (e.key === 'ArrowRight') setV(aim.v + 1);
    else if (e.key === 'ArrowLeft') setV(aim.v - 1);
    else if (e.key === 'Enter' || e.key === ' ') fire();
    else return;
    e.preventDefault();
  };

  const shown = clamp(time, 0, model.time);
  const vel = model.velocity(shown);
  const pos = model.position(shown);
  const incline = aim.scene === 'incline';
  const tilt = incline ? inclineFlight(aim.v, aim.angle, aim.beta) : null;
  const label = incline
    ? `איור חי: זריקה מרגלות מדרון בזווית ${aim.beta} מעלות. מהירות השיגור ${aim.v} מטר בשנייה, בזווית ${aim.angle} מעלות מעל האופק. הטווח לאורך המדרון ${sci(model.range)} מטר. במקלדת: חץ למעלה ולמטה משנה את הזווית, ימינה ושמאלה את המהירות, Enter משגר.`
    : `איור חי: זריקה מעל קרקע מישורית${aim.h0 > 0 ? ` מגובה ${sci(aim.h0)} מטר` : ''}. מהירות השיגור ${aim.v} מטר בשנייה, בזווית ${aim.angle} מעלות. הטווח ${sci(model.range)} מטר. במקלדת: חץ למעלה ולמטה משנה את הזווית, ימינה ושמאלה את המהירות, Enter משגר.`;

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onReset={() => {
        setAim(initialAim());
        setShow(initialShow());
        setShots([]);
        setFlying(null);
        setTime(0);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        flying ? (
          <span>הגוף באוויר…</span>
        ) : (
          <>
            {/* the whole "t = …" is one LTR isolate (.q): with the label outside it, bidi reversed it to "… = t" */}
            <span class="q" data-readout="t">
              t = <b>{signed(shown)} s</b>
            </span>
            <span class="q" data-readout="r">
              r = <b>({signed(pos[0])}, {signed(pos[1])}) m</b>
            </span>
            <span class="q" data-readout="v">
              v = <b>({signed(vel[0])}, {signed(vel[1])}) m/s</b>
            </span>
            <span class="q" data-readout="a">
              a = <b>(0, {signed(-G)}) m/s²</b>
            </span>
            {incline ? (
              <span>
                טווח לאורך המדרון <b class="q">{sci(model.range)} m</b>
              </span>
            ) : (
              <span>
                טווח <b class="q">{sci(model.range)} m</b>
              </span>
            )}
            <span>
              זמן תנועה <b class="q">{sci(model.time)} s</b>
            </span>
            {incline && show.tilted && tilt ? (
              <span>
                מרחק מרבי מהמדרון <b class="q">{sci(tilt.maxClearance)} m</b>
              </span>
            ) : (
              <span>
                גובה מרבי <b class="q">{sci(maxHeight(launchOf(aim)))} m</b>
              </span>
            )}
          </>
        )
      }
      controls={
        <>
          <Slider label="מהירות השיגור" value={aim.v} min={V_MIN} max={V_MAX} step={1} format={(v) => `${v} m/s`} onChange={setV} />
          <Slider label="זווית מעל האופק" value={aim.angle} min={angleMin(aim)} max={90} step={1} format={(d) => `${d}°`} onChange={setAngle} />
          {incline && <Slider label="זווית המדרון" value={aim.beta} min={0} max={B_MAX} step={2} format={(d) => `${d}°`} onChange={setBeta} />}
          {!incline && props.heightSlider && H_MAX > 0 && (
            <Slider label="גובה השיגור" value={aim.h0} min={0} max={H_MAX} step={1} format={(h) => `${h} m`} onChange={setH0} />
          )}
          <Slider label="זמן" value={Number(shown.toFixed(2))} min={0} max={Number(model.time.toFixed(2))} step={0.01} format={(t) => `${sci(t)} s`} onChange={scrub} />
          <div class="group" role="group" aria-label="שיגור">
            <button type="button" class="btn primary" onClick={fire}>
              שגרו
            </button>
            <button type="button" class="btn ghost" onClick={() => setShots([])}>
              נקו מסלולים
            </button>
          </div>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="חצים" on={show.vectors} swatch="var(--velocity)" onChange={(on) => setShow((s) => ({ ...s, vectors: on }))} />
            <Toggle label="רכיבים" on={show.components} onChange={(on) => setShow((s) => ({ ...s, components: on }))} />
            <Toggle label="מעטפת" on={show.envelope} swatch="var(--accent)" onChange={(on) => setShow((s) => ({ ...s, envelope: on }))} />
            {incline && <Toggle label="צירים נטויים" on={show.tilted} onChange={(on) => setShow((s) => ({ ...s, tilted: on }))} />}
            {!incline && props.pair !== undefined && (
              <Toggle label="שני גופים" on={show.pair} swatch="var(--momentum)" onChange={(on) => setShow((s) => ({ ...s, pair: on }))} />
            )}
          </div>
        </>
      }
    />
  );
}
