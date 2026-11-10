/**
 * BallisticPendulum (lesson 4.4): a short collision followed by a long stage, with a visible timeline.
 *
 * Three scenes, one per figure:
 * - 'pendulum': a bullet sticks in a block hanging on two parallel strings; stage 2 is the swing to the top.
 * - 'floor': a bullet sticks in a block on a rough floor; stage 2 is the slide until friction stops it.
 * - 'spring': a block sticks to a block that rests against a spring fixed to a wall; stage 2 is the compression.
 *
 * Stage 1 is the finite-duration collision of src/physics/ballistic.ts (`collide`): a constant contact force
 * that would stop the relative motion in Δt, with the external forces acting meanwhile; stage 2 starts from the
 * state at the lock (`stage2`). The learner sets Δt on a slider and sees when the staged answer (Δt → 0) stops
 * being right. Bars show the momentum along the motion and the energy (kinetic K, potential U, heat Q) as the
 * timeline runs; a third bar magnifies the energy that is left for stage 2.
 *
 * Motion runs only while motionAllowed(); in still mode a shot jumps to the end of stage 2. Tasks tick only in
 * the learner's own handlers (the shot button, a shot it started running to the end, the sliders); a text step
 * sets the state through `subscribeSteps`, which never calls a handler, so a step can never tick a task.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import { collide, pendulumPath, stage2, stuckVelocity, type Collision, type Scene, type Setup, type Stage2 } from '~/physics/ballistic';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const NARROW_W = 520;
/** the collision times the Δt slider offers [s] */
const DTS = [1e-4, 2e-4, 4e-4, 1e-3, 2e-3, 4e-3, 1e-2, 2e-2, 4e-2, 0.1, 0.2, 0.4];
/** the staged answer counts as wrong past this relative error (the dt-fail task) */
const FAIL = 0.01;
/** the timeline: u in [0, 1] is stage 1, [1, 2] stage 2; a shot starts at U_START (the projectile approaching) */
const U_START = -0.25;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const fmtDt = (dt: number) => (dt < 0.1 ? `${sci(dt * 1e3, 3)} ms` : `${sci(dt, 3)} s`);
/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside, so it reads left to right in Hebrew. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);
const nearestDt = (dt: number) => {
  let best = 0;
  DTS.forEach((d, i) => {
    if (Math.abs(Math.log(d / dt)) < Math.abs(Math.log(DTS[best] / dt))) best = i;
  });
  return best;
};
/** A readout number: 3 significant figures and a true minus sign. */
const signed = (x: number) => (x === 0 ? '0' : sci(x, 3).replace('-', '−'));

const TASK_LABEL: Record<string, string> = {
  fire: 'שגרו את הקליע, וצפו בשני השלבים עד הסוף.',
  'stage1-end': 'הזיזו את ציר הזמן לסוף שלב 1. כמה מהאנרגיה הקינטית של הקליע נשארה בתנועה?',
  'dt-fail': 'הגדילו את משך ההתנגשות עד שהחיזוי בשני שלבים לתוצאה של שלב 2 שוגה ביותר מאחוז אחד.',
  heavier: 'שגרו פעם אחת, הכפילו את מסת הגוש, ושגרו שוב באותה מהירות. פי כמה קטן מרחק ההחלקה?',
  'max-compression': 'הזיזו את ציר הזמן לסוף שלב 2, וקראו את הכיווץ המרבי.',
};

export interface BallisticPendulumProps {
  id: string;
  scene: Scene;
  /** projectile mass [kg] (fixed), its speed [m/s] and the target's mass [kg] (sliders) */
  m?: number;
  v?: number;
  M?: number;
  vMin?: number;
  vMax?: number;
  vStep?: number;
  MMin?: number;
  MMax?: number;
  /** pendulum string length [m], floor kinetic coefficient, spring constant [N/m] */
  L?: number;
  muk?: number;
  k?: number;
  /** the collision time at the start [s] (snapped to the slider's values) */
  dt?: number;
  tasks?: string[];
}

interface State {
  v: number;
  M: number;
  dti: number;
  /** the timeline, U_START … 2 */
  u: number;
}

/** Canvas text with a paper halo; Latin and math only (Hebrew goes through handNote). `_X` subscripts one character. */
function label(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, color: string, size = 13, align: CanvasTextAlign = 'center') {
  const runs: [string, boolean][] = [];
  for (const part of s.split(/(_.)/)) {
    if (!part) continue;
    if (part.startsWith('_') && part.length === 2) runs.push([part[1], true]);
    else runs.push([part, false]);
  }
  const subSize = Math.round(size * 0.72);
  const fontOf = (sub: boolean) => `italic 600 ${sub ? subSize : size}px ${p.fontUi}`;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.fillStyle = color;
  const widths = runs.map(([t, sub]) => {
    ctx.font = fontOf(sub);
    return ctx.measureText(t).width;
  });
  const total = widths.reduce((a, b) => a + b, 0);
  const x0 = align === 'center' ? x - total / 2 : align === 'right' || align === 'end' ? x - total : x;
  for (const pass of ['halo', 'ink'] as const) {
    let px = x0;
    runs.forEach(([t, sub], i) => {
      ctx.font = fontOf(sub);
      const py = sub ? y + size * 0.3 : y;
      if (pass === 'halo') ctx.strokeText(t, px, py);
      else ctx.fillText(t, px, py);
      px += widths[i];
    });
  }
  ctx.restore();
}

function rect(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, w: number, h: number, fill: string, name?: string, fs = 13, at = 0.5) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
  if (name) label(ctx, p, name, x + w * at, y + h / 2, p.ink, fs);
}

/** The motion along s at one instant of the timeline. */
interface Instant {
  /** projectile and target positions [m] and velocities [m/s] */
  sb: number;
  vb: number;
  sB: number;
  vB: number;
  stage: 0 | 1 | 2;
}

export default function BallisticPendulum(props: BallisticPendulumProps) {
  const scene = props.scene;
  const m = props.m ?? (scene === 'spring' ? 0.5 : 0.012);
  const L = props.L ?? 1.2;
  const muk = props.muk ?? 0.3;
  const kSpring = props.k ?? 300;
  const V_MIN = props.vMin ?? (scene === 'spring' ? 1 : 100);
  const V_MAX = props.vMax ?? (scene === 'spring' ? 6 : 400);
  const V_STEP = props.vStep ?? (scene === 'spring' ? 0.5 : 10);
  const M_MIN = props.MMin ?? (scene === 'spring' ? 0.5 : 1);
  const M_MAX = props.MMax ?? (scene === 'spring' ? 3 : 5);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  const initial = (): State => ({
    v: clamp(props.v ?? (scene === 'spring' ? 4 : 300), V_MIN, V_MAX),
    M: clamp(props.M ?? 1.5, M_MIN, M_MAX),
    dti: nearestDt(props.dt ?? 2e-4),
    u: 0,
  });
  const [st, setSt] = useState<State>(initial);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  /** shots of this visit, for the task that compares two shots */
  const shots = useRef<{ v: number; M: number; dti: number }[]>([]);

  const setup: Setup = { scene, m, M: st.M, v: st.v, L, muk, k: kSpring };
  const dt = DTS[st.dti];
  const model = useMemo(() => {
    const V0 = stuckVelocity(m, st.v, st.M);
    const staged: Stage2 = stage2(setup, 0, V0);
    const col: Collision = collide(setup, dt, 300);
    const fin: Stage2 = stage2(setup, col.sLock, col.VLock);
    const key = scene === 'pendulum' ? 'h' : scene === 'floor' ? 'd' : 'x';
    const err = ((fin[key] as number) - (staged[key] as number)) / (staged[key] as number);
    // the pendulum's swing in stage 2, sampled for drawing
    const path = scene === 'pendulum' ? pendulumPath(L, col.sLock / L, col.VLock / L, fin.T2, 240) : [];
    const E0 = 0.5 * m * st.v * st.v;
    const Elock = 0.5 * (m + st.M) * col.VLock ** 2 + potential(col.sLock);
    return { V0, staged, col, fin, key, err, path, E0, Elock };
  }, [st.v, st.M, st.dti, scene]);

  function potential(sB: number): number {
    if (scene === 'pendulum') return (m + st.M) * G * L * (1 - Math.cos(sB / L));
    if (scene === 'spring') return 0.5 * kSpring * sB * sB;
    return 0;
  }

  /** The state of the motion at timeline u. */
  function at(u: number): Instant {
    const { col, fin, path } = model;
    if (u < 0) return { sb: (u / -U_START) * 0.0001, vb: st.v, sB: 0, vB: 0, stage: 0 };
    if (u <= 1) {
      const t = u * col.tLock;
      const s = col.samples;
      let i = 0;
      while (i < s.length - 2 && s[i + 1].t < t) i++;
      const a = s[i];
      const b = s[i + 1] ?? a;
      const f = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
      const mix = (x: number, y: number) => x + (y - x) * f;
      return { sb: mix(a.sb, b.sb), vb: mix(a.vb, b.vb), sB: mix(a.sB, b.sB), vB: mix(a.vB, b.vB), stage: 1 };
    }
    const tau = (Math.min(u, 2) - 1) * fin.T2;
    let s = col.sLock;
    let V = col.VLock;
    if (scene === 'pendulum') {
      const x = ((Math.min(u, 2) - 1) * (path.length - 1)) | 0;
      const f = (Math.min(u, 2) - 1) * (path.length - 1) - x;
      const phi = path[x] + ((path[Math.min(x + 1, path.length - 1)] ?? path[x]) - path[x]) * f;
      s = phi * L;
      // the speed from energy, which stage 2 conserves
      const E = 0.5 * col.VLock ** 2 + G * L * (1 - Math.cos(col.sLock / L));
      V = Math.sqrt(Math.max(0, 2 * (E - G * L * (1 - Math.cos(phi)))));
    } else if (scene === 'floor') {
      const a = muk * G;
      s = col.sLock + col.VLock * tau - 0.5 * a * tau * tau;
      V = Math.max(0, col.VLock - a * tau);
    } else {
      const w = Math.sqrt(kSpring / (m + st.M));
      const A = fin.x as number;
      const phi0 = Math.atan2(col.sLock, col.VLock / w);
      s = A * Math.sin(w * tau + phi0);
      V = A * w * Math.cos(w * tau + phi0);
    }
    return { sb: s, vb: V, sB: s, vB: V, stage: 2 };
  }

  // text steps set the speed, the mass, Δt and the instant shown; they never shoot or call a handler
  useEffect(
    () =>
      subscribeSteps(props.id, (s) => {
        setPlaying(false);
        setSt((prev) => {
          const dtv = num(s.dt);
          return {
            v: clamp(num(s.v) ?? prev.v, V_MIN, V_MAX),
            M: clamp(num(s.M) ?? prev.M, M_MIN, M_MAX),
            dti: dtv !== null ? nearestDt(dtv) : prev.dti,
            u: clamp(num(s.u) ?? 0, 0, 2),
          };
        });
      }),
    [props.id],
  );

  // the screen-reader line, after the controls settle
  useEffect(() => {
    const h = setTimeout(() => setLive(describe()), 600);
    return () => clearTimeout(h);
  }, [st, playing]);

  function stage2Name(): string {
    return scene === 'pendulum' ? 'העלייה' : scene === 'floor' ? 'ההחלקה' : 'הכיווץ';
  }

  function describe(): string {
    const { fin, col, err } = model;
    const res =
      scene === 'pendulum'
        ? `הגוש עולה לגובה ${sci(fin.h as number)} מטר`
        : scene === 'floor'
          ? `הגוש נעצר אחרי ${sci(fin.d as number)} מטר`
          : `הקפיץ מתכווץ עד ${sci(fin.x as number)} מטר`;
    return `משך ההתנגשות ${fmtDt(dt)}. המתקף של הכוחות החיצוניים בזמן ההתנגשות ${sci(Math.abs(col.Jext))} ניוטון שנייה. ${res}, והחיזוי בשני שלבים שונה מזה ב-${sci(Math.abs(100 * err), 2)} אחוז (${scene === 'pendulum' ? 'השגיאה בגובה' : scene === 'floor' ? 'השגיאה במרחק' : 'השגיאה בכיווץ'}, לא בתנע).`;
  }

  /* ---------- the learner's handlers (the only places tasks tick) ---------- */
  const change = (patch: Partial<State>) => {
    setPlaying(false);
    setSt((prev) => ({ ...prev, ...patch, u: 0 }));
  };
  const onDt = (i: number) => {
    const dti = clamp(Math.round(i), 0, DTS.length - 1);
    change({ dti });
    // the error of that Δt: computed here, from the learner's own choice
    const s: Setup = { ...setup, M: st.M, v: st.v };
    const V0 = stuckVelocity(m, st.v, st.M);
    const staged = stage2(s, 0, V0);
    const c = collide(s, DTS[dti], 300);
    const f = stage2(s, c.sLock, c.VLock);
    const key = scene === 'pendulum' ? 'h' : scene === 'floor' ? 'd' : 'x';
    if (Math.abs(((f[key] as number) - (staged[key] as number)) / (staged[key] as number)) > FAIL) done('dt-fail');
  };
  const scrub = (u: number) => {
    setPlaying(false);
    setSt((prev) => ({ ...prev, u: clamp(u, 0, 2) }));
    if (u >= 0.97 && u <= 1.03) done('stage1-end');
    if (u >= 1.97) done('max-compression');
  };
  const landed = useRef(false);
  const land = () => {
    if (landed.current) return;
    landed.current = true;
    setPlaying(false);
    setSt((prev) => ({ ...prev, u: 2 }));
    done('fire');
  };
  const fire = () => {
    const prev = shots.current;
    const same = prev.some((o) => o.v === st.v && o.dti === st.dti && Math.abs(o.M / st.M - 0.5) < 1e-9);
    if (same) done('heavier');
    prev.push({ v: st.v, M: st.M, dti: st.dti });
    if (!motionAllowed()) {
      land();
      setLive(describe());
      return;
    }
    t0.current = null;
    landed.current = false;
    setSt((s) => ({ ...s, u: U_START }));
    setPlaying(true);
  };

  /* ---------- drawing ---------- */
  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    let u = st.u;
    if (playing) {
      if (t0.current === null) t0.current = t;
      const el = t - t0.current;
      // the approach takes 0.5 s, stage 1 1.6 s (slow motion), stage 2 2.2 s
      u = el < 0.5 ? U_START + (el / 0.5) * -U_START : el < 2.1 ? (el - 0.5) / 1.6 : 1 + (el - 2.1) / 2.2;
      if (u >= 2) {
        u = 2;
        land();
      }
    }
    const W = view.w;
    const H = view.h;
    // a canvas that has not been laid out yet has no room for the drawing
    if (W < 60 || H < 160) return;
    const narrow = W < NARROW_W;
    const fs = narrow ? 11 : 13;
    const tlH = narrow ? 58 : 54;
    const scene_ = narrow ? { x: 0, y: 0, w: W, h: (H - tlH) * 0.6 } : { x: 0, y: 0, w: W * 0.64, h: H - tlH };
    const bars = narrow ? { x: 0, y: scene_.h, w: W, h: H - tlH - scene_.h } : { x: W * 0.64, y: 0, w: W * 0.36, h: H - tlH };
    const I = at(u);
    if (scene === 'pendulum') drawPendulum(ctx, p, scene_, I, u, fs);
    else if (scene === 'floor') drawFloor(ctx, p, scene_, I, u, fs);
    else drawSpring(ctx, p, scene_, I, u, fs);
    drawBars(ctx, p, bars, I, u, fs, narrow);
    drawTimeline(ctx, p, { x: 10, y: H - tlH, w: W - 20, h: tlH }, u, fs, narrow);
    // the panels' border
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.beginPath();
    if (narrow) {
      ctx.moveTo(10, bars.y);
      ctx.lineTo(W - 10, bars.y);
    } else {
      ctx.moveTo(bars.x, 10);
      ctx.lineTo(bars.x, H - tlH - 8);
    }
    ctx.stroke();
    ctx.restore();
  };

  type Box = { x: number; y: number; w: number; h: number };

  function drawPendulum(ctx: CanvasRenderingContext2D, p: Palette, b: Box, I: Instant, u: number, fs: number) {
    const top = b.y + 26;
    const Lpx = Math.max(12, Math.min(b.h * 0.62, b.w * 0.42));
    const cx = b.x + b.w * 0.36;
    const bw = clamp(Lpx * 0.36, 34, 80);
    const bh = bw * 0.6;
    const phi = I.sB / L;
    // the ceiling
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - bw, top);
    ctx.lineTo(cx + bw, top);
    ctx.stroke();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    for (let x = cx - bw; x < cx + bw; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + 7, top - 7);
      ctx.stroke();
    }
    ctx.restore();
    // the top of the swing: a dashed arc of the block's centre and the rise h
    const fin = model.fin;
    const th = ((fin.thetaDeg as number) * Math.PI) / 180;
    const yLow = top + Lpx;
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, top, Lpx, Math.PI / 2 - th, Math.PI / 2);
    ctx.stroke();
    const yTop = top + Lpx * Math.cos(th);
    const xTop = cx + Lpx * Math.sin(th);
    ctx.beginPath();
    ctx.moveTo(xTop - bw * 0.2, yTop);
    ctx.lineTo(xTop + bw * 0.9, yTop);
    ctx.moveTo(cx + bw * 0.6, yLow);
    ctx.lineTo(xTop + bw * 0.9, yLow);
    ctx.stroke();
    ctx.restore();
    const hx = xTop + bw * 0.75;
    if (yLow - yTop > 14) arrow(ctx, hx, yLow, hx, yTop, { color: p.ink2, width: 1.4, head: 7 });
    label(ctx, p, 'h', hx + 10, (yLow + yTop) / 2, p.ink2, fs + 1, 'left');
    // two parallel strings; the block stays level
    const bxc = cx + Lpx * Math.sin(phi);
    const byc = top + Lpx * Math.cos(phi);
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.3;
    for (const dx of [-bw * 0.32, bw * 0.32]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx, top);
      ctx.lineTo(bxc + dx, byc - bh / 2);
      ctx.stroke();
    }
    ctx.restore();
    rect(ctx, p, bxc - bw / 2, byc - bh / 2, bw, bh, withAlpha(p.equip, 0.55), 'M', fs, 0.68);
    drawBullet(ctx, p, I, u, bxc - bw / 2, byc, bw, b.x + 10, fs);
    // the block's velocity, along the arc, from the end of the collision (u = 1, t = Δt) on
    if (u >= 1 && I.vB > 1e-3) {
      const len = Math.max(18, (I.vB / Math.max(model.V0, 1e-9)) * bw * 1.2);
      arrow(ctx, bxc, byc - bh / 2 - 10, bxc + len * Math.cos(phi), byc - bh / 2 - 10 - len * Math.sin(phi), { color: p.velocity, width: 2.2, head: 8 });
      label(ctx, p, 'V', bxc - 10, byc - bh / 2 - 12, p.velocity, fs, 'right');
    }
    if (fin.slack) handNote(ctx, 'החוט מתרופף', cx, b.y + b.h - 14, p, fs + 1);
  }

  /** The projectile: approaching, entering (schematic depth), then inside the target. */
  function drawBullet(ctx: CanvasRenderingContext2D, p: Palette, I: Instant, u: number, face: number, y: number, bw: number, xLeft: number, fs: number) {
    const lw = Math.max(9, bw * 0.24);
    const lh = 4;
    let x: number;
    if (u < 0) x = face - lw - (u / U_START) * Math.max(0, face - lw - xLeft);
    else if (u <= 1) x = face - lw + u * bw * 0.3;
    else x = face - lw + bw * 0.3;
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.fillRect(x, y - lh / 2, lw, lh);
    ctx.restore();
    if (u < 0 || (u === 0 && !playing)) {
      arrow(ctx, x - 4 - Math.max(26, bw * 0.6), y, x - 4, y, { color: p.velocity, width: 2.2, head: 8 });
      label(ctx, p, 'v', x - 4 - Math.max(26, bw * 0.6) / 2, y - 12, p.velocity, fs);
      label(ctx, p, 'm', x + lw / 2, y + 12, p.ink, fs - 1);
    }
  }

  function drawFloor(ctx: CanvasRenderingContext2D, p: Palette, b: Box, I: Instant, u: number, fs: number) {
    const floorY = b.y + b.h * 0.62;
    const bw = clamp(b.w * 0.14, 34, 80);
    const bh = bw * 0.6;
    const x0 = b.x + b.w * 0.24;
    const dMax = Math.max(model.staged.d as number, model.fin.d as number, 0.2);
    const ppm = (b.x + b.w - 14 - bw - x0) / dMax;
    // the floor, rough: hatching
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(b.x + 8, floorY);
    ctx.lineTo(b.x + b.w - 8, floorY);
    ctx.stroke();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    for (let x = b.x + 12; x < b.x + b.w - 8; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, floorY);
      ctx.lineTo(x - 7, floorY + 7);
      ctx.stroke();
    }
    ctx.restore();
    // the staged stopping point and the distance d
    const xEnd = x0 + (model.fin.d as number) * ppm;
    const xStaged = x0 + (model.staged.d as number) * ppm;
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xStaged, floorY - bh - 8);
    ctx.lineTo(xStaged, floorY + 4);
    ctx.stroke();
    ctx.restore();
    const yd = floorY + 22;
    arrow(ctx, x0, yd, xEnd, yd, { color: p.ink2, width: 1.4, head: 7 });
    label(ctx, p, 'd', (x0 + xEnd) / 2, yd + 13, p.ink2, fs + 1);
    const bx = x0 + I.sB * ppm;
    rect(ctx, p, bx, floorY - bh, bw, bh, withAlpha(p.equip, 0.55), 'M', fs, 0.68);
    drawBullet(ctx, p, I, u, bx, floorY - bh / 2, bw, b.x + 10, fs);
    if (I.stage >= 1 && I.vB > 1e-6) {
      // kinetic friction on the block, by the floor, against its motion: from the bottom face, never a stub
      const fl = Math.max(34, bw * 0.95);
      arrow(ctx, bx + bw * 0.5, floorY - 3, bx + bw * 0.5 - fl, floorY - 3, { color: p.force, width: 2.4, head: 8 });
      label(ctx, p, 'f_k', bx + bw * 0.5 - fl - 3, floorY - 12, p.force, fs, 'right');
      if (u >= 1) {
        const len = Math.max(18, (I.vB / Math.max(model.V0, 1e-9)) * bw * 1.2);
        arrow(ctx, bx + bw / 2, floorY - bh - 12, bx + bw / 2 + len, floorY - bh - 12, { color: p.velocity, width: 2.2, head: 8 });
        label(ctx, p, 'V', bx + bw / 2 - 6, floorY - bh - 12, p.velocity, fs, 'right');
      }
    }
    label(ctx, p, `μ_k = ${sci(muk)}`, b.x + b.w * 0.82, floorY + 46 > b.y + b.h - 8 ? b.y + 18 : floorY + 46, p.ink2, fs);
  }

  function drawSpring(ctx: CanvasRenderingContext2D, p: Palette, b: Box, I: Instant, u: number, fs: number) {
    const floorY = b.y + b.h * 0.62;
    const wallX = b.x + b.w - 16;
    const bw = clamp(b.w * 0.14, 34, 76);
    const bh = bw * 0.62;
    const Lsp = b.w * 0.32;
    const xMax = Math.max(model.staged.x as number, model.fin.x as number, 1e-6);
    const ppm = (Lsp * 0.62) / xMax;
    // the floor (smooth) and the wall
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(b.x + 8, floorY);
    ctx.lineTo(wallX, floorY);
    ctx.lineTo(wallX, floorY - bh * 2.2);
    ctx.stroke();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    for (let y = floorY - bh * 2.2; y < floorY; y += 9) {
      ctx.beginPath();
      ctx.moveTo(wallX, y);
      ctx.lineTo(wallX + 7, y + 7);
      ctx.stroke();
    }
    ctx.restore();
    // the target, its right face at the spring's free end
    const right = wallX - Lsp + I.sB * ppm;
    const cy = floorY - bh / 2;
    // the spring: a zigzag from the block to the wall
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const n = 12;
    const len = wallX - right;
    ctx.moveTo(right, cy);
    for (let i = 1; i < n; i++) ctx.lineTo(right + (len * i) / n, cy + (i % 2 ? -1 : 1) * bh * 0.28);
    ctx.lineTo(wallX, cy);
    ctx.stroke();
    ctx.restore();
    label(ctx, p, 'k', right + len / 2, cy - bh * 0.28 - 12, p.ink2, fs);
    // the largest compression: dashed mark where the right face stops
    const xm = wallX - Lsp + (model.fin.x as number) * ppm;
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(wallX - Lsp, floorY - bh - 10);
    ctx.lineTo(wallX - Lsp, floorY + 6);
    ctx.moveTo(xm, floorY - bh - 10);
    ctx.lineTo(xm, floorY + 6);
    ctx.stroke();
    ctx.restore();
    const yx = floorY + 20;
    if (xm - (wallX - Lsp) > 12) arrow(ctx, wallX - Lsp, yx, xm, yx, { color: p.ink2, width: 1.4, head: 7 });
    label(ctx, p, 'x', (wallX - Lsp + xm) / 2, yx + 13, p.ink2, fs + 1);
    rect(ctx, p, right - bw, floorY - bh, bw, bh, withAlpha(p.equip, 0.55), 'M', fs);
    // the incoming block, touching from the collision on
    const iw = bw * 0.72;
    const ih = bh * 0.8;
    let ix: number;
    if (u < 0) ix = right - bw - iw - (u / U_START) * Math.max(0, right - bw - iw - b.x - 10);
    else ix = right - bw - iw;
    rect(ctx, p, ix, floorY - ih, iw, ih, withAlpha(p.accent, 0.35), 'm', fs - 1);
    if (u < 0 || (u === 0 && !playing)) {
      arrow(ctx, ix + iw / 2, floorY - ih - 12, ix + iw / 2 + Math.max(26, bw * 0.6), floorY - ih - 12, { color: p.velocity, width: 2.2, head: 8 });
      label(ctx, p, 'v', ix + iw / 2 - 6, floorY - ih - 12, p.velocity, fs, 'right');
    }
    if (I.stage >= 1 && I.sB > 1e-6) {
      // the spring's force on the block, by the spring, against the compression
      const fl = Math.max(22, bw * 0.6);
      arrow(ctx, right - 2, floorY - bh, right - 2 - fl, floorY - bh, { color: p.force, width: 2.4, head: 8 });
      label(ctx, p, 'F_s', right - 2 - fl + 4, floorY - bh - 12, p.force, fs);
    }
    if (u >= 1 && I.vB > 1e-3) {
      const vl = Math.max(18, (I.vB / Math.max(model.V0, 1e-9)) * bw);
      arrow(ctx, right - bw / 2, floorY - bh - 34, right - bw / 2 + vl, floorY - bh - 34, { color: p.velocity, width: 2.2, head: 8 });
      label(ctx, p, 'V', right - bw / 2 - 6, floorY - bh - 34, p.velocity, fs, 'right');
    }
  }

  /** p along the motion, and the energy E (K, U, Q) with a magnified bar for what stage 2 receives. */
  function drawBars(ctx: CanvasRenderingContext2D, p: Palette, b: Box, I: Instant, u: number, fs: number, narrow: boolean) {
    const { E0, Elock } = model;
    const P0 = m * st.v;
    const Mt = st.M;
    const P = m * I.vb + Mt * I.vB;
    const K = 0.5 * m * I.vb * I.vb + 0.5 * Mt * I.vB * I.vB;
    const U = I.stage === 0 ? 0 : potential(I.sB);
    const Q = Math.max(0, E0 - K - U);
    const top = b.y + (narrow ? 40 : 60);
    const bottom = b.y + b.h - (narrow ? 30 : 52);
    const hh = Math.max(20, bottom - top);
    const colW = Math.min(46, b.w * 0.14);
    const xs = [0.2, 0.5, 0.8].map((f) => b.x + b.w * f - colW / 2);
    const outline = (x: number) => {
      ctx.save();
      ctx.strokeStyle = p.rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, top, colW, hh);
      ctx.restore();
    };
    const fill = (x: number, y0: number, h: number, c: string) => {
      if (h <= 0) return;
      ctx.save();
      ctx.fillStyle = c;
      ctx.fillRect(x, y0 - h, colW, h);
      ctx.restore();
    };
    // p
    outline(xs[0]);
    fill(xs[0], bottom, clamp(P / P0, 0, 1) * hh, p.momentum);
    label(ctx, p, 'p', xs[0] + colW / 2, bottom + 14, p.momentum, fs + 1);
    // E, stacked K | U | Q, on the scale of the projectile's energy
    outline(xs[1]);
    const kh = (K / E0) * hh;
    const uh = (U / E0) * hh;
    fill(xs[1], bottom, kh, p.energyK);
    fill(xs[1], bottom - kh, uh, p.energyP);
    fill(xs[1], bottom - kh - uh, (Q / E0) * hh, withAlpha(p.energyTh, 0.75));
    label(ctx, p, 'E', xs[1] + colW / 2, bottom + 14, p.ink, fs + 1);
    // E₂: the energy at the lock, magnified, and where it goes in stage 2
    outline(xs[2]);
    if (u >= 1) {
      const K2 = Math.min(K, Elock);
      const U2 = Math.min(U, Elock);
      const k2 = (K2 / Elock) * hh;
      const u2 = (U2 / Elock) * hh;
      fill(xs[2], bottom, k2, p.energyK);
      fill(xs[2], bottom - k2, u2, p.energyP);
      fill(xs[2], bottom - k2 - u2, (Math.max(0, Elock - K2 - U2) / Elock) * hh, withAlpha(p.energyTh, 0.75));
    } else {
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink3, 0.5);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(xs[2], bottom);
      ctx.lineTo(xs[2] + colW, top);
      ctx.stroke();
      ctx.restore();
    }
    label(ctx, p, 'E_2', xs[2] + colW / 2, bottom + 14, p.ink, fs + 1);
    label(ctx, p, `×${sci(E0 / Elock, 2)}`, xs[2] + colW / 2, top - 9, p.ink2, fs - 1);
    // the legend, in one row above the bars
    const ly = narrow ? b.y + 16 : bottom + 36;
    const items: [string, string][] = [
      ['K', p.energyK],
      ['U', p.energyP],
      ['Q', withAlpha(p.energyTh, 0.75)],
    ];
    const step = Math.min(52, b.w / 4);
    items.forEach(([t, c], i) => {
      const x = b.x + b.w / 2 + (i - 1) * step;
      ctx.save();
      ctx.fillStyle = c;
      ctx.fillRect(x - 16, ly - 5, 10, 10);
      ctx.restore();
      label(ctx, p, t, x + 2, ly, p.ink2, fs, 'left');
    });
  }

  function drawTimeline(ctx: CanvasRenderingContext2D, p: Palette, b: Box, u: number, fs: number, narrow: boolean) {
    const y = b.y + (narrow ? 24 : 22);
    const h = 10;
    const split = b.x + b.w * 0.4;
    const x1 = b.x + b.w;
    ctx.save();
    ctx.fillStyle = withAlpha(p.force, 0.18);
    ctx.fillRect(b.x, y, split - b.x, h);
    ctx.fillStyle = withAlpha(p.velocity, 0.18);
    ctx.fillRect(split, y, x1 - split, h);
    ctx.strokeStyle = p.rule;
    ctx.strokeRect(b.x, y, b.w, h);
    ctx.beginPath();
    ctx.moveTo(split, y - 4);
    ctx.lineTo(split, y + h + 4);
    ctx.stroke();
    ctx.restore();
    handNote(ctx, 'שלב 1: ההתנגשות', (b.x + split) / 2, y - 11, p, fs + 1);
    handNote(ctx, `שלב 2: ${stage2Name()}`, (split + x1) / 2, y - 11, p, fs + 1);
    label(ctx, p, `Δt = ${fmtDt(model.col.tLock)}`, (b.x + split) / 2, y + h + 13, p.ink2, fs - 1);
    label(ctx, p, `T_2 = ${fmtDt(model.fin.T2)}`, (split + x1) / 2, y + h + 13, p.ink2, fs - 1);
    const xu = u <= 0 ? b.x : u <= 1 ? b.x + u * (split - b.x) : split + (Math.min(u, 2) - 1) * (x1 - split);
    ctx.save();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.moveTo(xu, y - 2);
    ctx.lineTo(xu - 6, y - 10);
    ctx.lineTo(xu + 6, y - 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(xu - 1.5, y - 2, 3, h + 4);
    ctx.restore();
  }

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: playing });
  useEffect(invalidate, [st, playing, model]);

  const [narrowStage, setNarrowStage] = useState(false);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      setNarrowStage(w > 0 && w < NARROW_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { col, fin, staged, err, E0, Elock } = model;
  const key = model.key as 'h' | 'd' | 'x';
  const what = scene === 'pendulum' ? 'h' : scene === 'floor' ? 'd' : 'x';
  // the error is in the stage-2 result (h, d or x), not in the momentum after the collision
  const errName = scene === 'pendulum' ? 'השגיאה בגובה' : scene === 'floor' ? 'השגיאה במרחק' : 'השגיאה בכיווץ';
  const figLabel =
    scene === 'pendulum'
      ? `איור חי: קליע בעל מסה ${sci(m)} קילוגרם במהירות ${sci(st.v)} מטר לשנייה נתקע בגוש בעל מסה ${sci(st.M)} קילוגרם שתלוי על חוטים באורך ${sci(L)} מטר. ${describe()}`
      : scene === 'floor'
        ? `איור חי: קליע בעל מסה ${sci(m)} קילוגרם במהירות ${sci(st.v)} מטר לשנייה נתקע בגוש בעל מסה ${sci(st.M)} קילוגרם על רצפה עם מקדם חיכוך ${sci(muk)}. ${describe()}`
        : `איור חי: גוש בעל מסה ${sci(m)} קילוגרם במהירות ${sci(st.v)} מטר לשנייה נדבק לגוש בעל מסה ${sci(st.M)} קילוגרם שצמוד לקפיץ. ${describe()}`;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') fire();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') scrub(st.u + (e.key === 'ArrowRight' ? 0.05 : -0.05));
    else return;
    e.preventDefault();
  };

  // the stage goes into the slider's label, which may wrap; the output keeps only the time, so it fits its column at 390 px
  const uLabel = (x: number) => ltr(fmtDt(x <= 1 ? x * col.tLock : (x - 1) * fin.T2));

  return (
    <SimShell
      fig={props.id}
      label={figLabel}
      canvasRef={canvasRef}
      aspect={narrowStage ? 0.82 : 16 / 10}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onReset={() => {
        setPlaying(false);
        shots.current = [];
        setSt(initial());
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        <>
          <span>
            שלב 1: תנע לפני{' '}
            <b class="q" data-readout="p0">
              {sci(col.pBefore)} kg·m/s
            </b>
          </span>
          <span>
            אחרי{' '}
            <b class="q" data-readout="p1">
              {sci(col.pAfter)} kg·m/s
            </b>
          </span>
          <span>
            מתקף חיצוני{' '}
            <b class="q" data-readout="J">
              {signed(col.Jext)} N·s
            </b>
          </span>
          <span>
            אנרגיה קינטית{' '}
            <b class="q" data-readout="K">
              {sci(E0)} J → {sci(0.5 * (m + st.M) * col.VLock ** 2)} J
            </b>
          </span>
          {scene === 'pendulum' && (
            <span>
              שלב 2: גובה{' '}
              <b class="q" data-readout="h">
                h = {sci(fin.h as number)} m
              </b>{' '}
              זווית{' '}
              <b class="q" data-readout="theta">
                {sci(fin.thetaDeg as number)}°
              </b>
            </span>
          )}
          {scene === 'floor' && (
            <span>
              שלב 2: מרחק{' '}
              <b class="q" data-readout="d">
                d = {sci(fin.d as number)} m
              </b>
            </span>
          )}
          {scene === 'spring' && (
            <span>
              שלב 2: כיווץ מרבי{' '}
              <b class="q" data-readout="x">
                x = {sci(fin.x as number)} m
              </b>
            </span>
          )}
          <span>
            בשני שלבים{' '}
            <b class="q" data-readout="staged">
              {what} = {sci(staged[key] as number)} m
            </b>
          </span>
          <span>
            {errName}{' '}
            <b class="q" data-readout="err">
              {sci(Math.abs(100 * err), 2)}%
            </b>
          </span>
        </>
      }
      controls={
        <>
          <Slider label={scene === 'spring' ? 'המהירות v' : 'מהירות הקליע v'} value={st.v} min={V_MIN} max={V_MAX} step={V_STEP} format={(x) => `${sci(x)} m/s`} onChange={(x) => change({ v: x })} />
          <Slider label="מסת הגוש M" value={st.M} min={M_MIN} max={M_MAX} step={0.1} format={(x) => `${sci(x)} kg`} onChange={(x) => change({ M: Number(x.toFixed(2)) })} />
          <Slider label="משך ההתנגשות Δt" value={st.dti} min={0} max={DTS.length - 1} step={1} format={(i) => fmtDt(DTS[Math.round(i)])} onChange={onDt} />
          <Slider label={st.u <= 1 ? 'ציר הזמן, שלב 1' : 'ציר הזמן, שלב 2'} value={Math.max(0, st.u)} min={0} max={2} step={0.01} format={uLabel} onChange={scrub} />
          <div class="group" role="group" aria-label="שיגור">
            <button type="button" class="btn primary" onClick={fire}>
              שגרו
            </button>
          </div>
        </>
      }
    />
  );

}
