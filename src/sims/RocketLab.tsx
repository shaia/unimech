/**
 * RocketLab (lesson 3.6): bodies whose mass changes.
 *
 * Two scenes:
 * - 'rocket': a rocket that burns its fuel at a constant rate, in free space or launched vertically from a pad in
 *   uniform gravity. On the left, the rocket (the camera follows it: the ruler marks move past it), its fuel gauge,
 *   the exhaust, and the forces on it: the thrust uμ (exerted by the exhaust gas), its weight Mg (by the Earth),
 *   the pad's normal force while it sits there, and the net force, emphasised. On demand, the system of the
 *   derivation: the rocket and the mass −dM it ejects in dt, inside one dashed boundary (the thrust is then an
 *   internal force and is not drawn). On the right, v(t), with the line v = u, Tsiolkovsky's u ln(m₀/M) (the
 *   free-space curve) and, in gravity, u ln(m₀/M) − g t; earlier launches stay faint.
 * - 'sand': a cart on a smooth level track, followed by the camera. Mode 'pushed': sand falls vertically into it
 *   from a long hopper fixed to the ground, and a force F = v μ keeps its speed; the right panel shows the power
 *   budget (motor = kinetic + heat). Mode 'coast': the same sand, no force, the cart slows. Mode 'leak': sand pours
 *   out through its floor, no force, the speed stays; the (wrong) prediction of F = d(Mv)/dt can be overlaid.
 *
 * Every number comes from src/physics/rocket.ts. Tasks tick only in the learner's own handlers (the launch button,
 * the time slider); a text step sets the state but never launches or scrubs through a handler.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import {
  beltPower,
  blindLeakVelocity,
  burnTime,
  burnout,
  coastingCart,
  height,
  liftoffTime,
  massAt,
  padForce,
  sandForce,
  thrust,
  tsiolkovsky,
  velocity,
  type Rocket,
} from '~/physics/rocket';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const NARROW_W = 560;
const KEEP = 3;
/** the sand scene runs this long [s] */
const SAND_T = 25;
/** the cart without sand, and the sand in it at the start [kg] */
const CART_EMPTY = 100;
const SAND_START = 100;
/** the hopper's drop height above the sand in the cart [m], and the cart floor above the track [m] */
const DROP_H = 1.5;
const FLOOR_H = 0.5;
/** the cart's length [m] */
const CART_L = 2;

const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  launch: 'שגרו את הרקטה פעם אחת, בכפתור "שגרו".',
  'pass-u': `בחלל: הזיזו את פס הזמן לרגע שבו מהירות הרקטה שווה למהירות הפליטה, ${ltr('v = u')}. מה המסה שלה ברגע הזה?`,
  'rate-same': 'בחלל: שגרו פעם אחת, שנו רק את קצב השריפה, ושגרו שוב. השוו את המהירויות בסוף השריפה.',
  'gravity-launch': 'הדליקו את הכובד ושגרו. כמה מהירות הפסידה הרקטה לעומת העקומה של החלל?',
  'no-liftoff': 'עם כובד: הקטינו את קצב השריפה עד שהרקטה לא מתרוממת בכלל, ושגרו.',
  pushed: 'במצב "כוח דוחף": הריצו את העגלה. איזה חלק מההספק של המנוע נשאר באנרגיה הקינטית של החול?',
  coast: 'במצב "בלי כוח": הריצו את העגלה. מה קורה למהירות, ומה קורה לתנע של העגלה עם החול שבה?',
  'leak-blind': 'במצב "חול נשפך": הדליקו את החיזוי של F = d(Mv)/dt והריצו. מי צודק?',
};

export type Scene = 'rocket' | 'sand';
export type SandMode = 'pushed' | 'coast' | 'leak';

export interface RocketLabProps {
  id: string;
  scene?: Scene;
  /** rocket: exhaust speed [m/s], initial and dry mass [kg], burn rate [kg/s], gravity on */
  u?: number;
  m0?: number;
  m1?: number;
  rate?: number;
  gravity?: boolean;
  gravityToggle?: boolean;
  boundary?: boolean;
  forces?: boolean;
  /** sand: mode, cart speed (initial speed) [m/s], sand rate [kg/s], the blind prediction shown */
  mode?: SandMode;
  v?: number;
  sandRate?: number;
  blind?: boolean;
  modeToggle?: boolean;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

interface RSetup {
  u: number;
  m0: number;
  m1: number;
  rate: number;
  gravity: boolean;
}
interface SSetup {
  mode: SandMode;
  v: number;
  rate: number;
}
interface Show {
  forces: boolean;
  boundary: boolean;
  blind: boolean;
}

/** The rocket's motion as the figure reads it. */
interface RModel {
  r: Rocket;
  tb: number;
  tl: number;
  tEnd: number;
  dvFree: number;
  v: (t: number) => number;
  y: (t: number) => number;
}

interface Run {
  n: number;
  setup: RSetup;
  model: RModel;
}

const rocketOf = (s: RSetup): Rocket => ({ m0: s.m0, m1: s.m1, u: s.u, rate: s.rate, g: s.gravity ? G : 0 });

function rModelOf(s: RSetup): RModel {
  const r = rocketOf(s);
  const tb = burnTime(r);
  return {
    r,
    tb,
    tl: liftoffTime(r),
    tEnd: tb * 1.15,
    dvFree: tsiolkovsky(s.u, s.m0, s.m1),
    v: (t) => velocity(r, t),
    y: (t) => height(r, t),
  };
}

/** The cart's velocity, mass and position at time t in each mode (sand scene). */
function cartAt(s: SSetup, t: number) {
  const M0 = CART_EMPTY + SAND_START;
  if (s.mode === 'pushed') return { v: s.v, M: M0 + s.rate * t, x: s.v * t };
  if (s.mode === 'coast') {
    return { v: coastingCart(M0, s.v, s.rate, t), M: M0 + s.rate * t, x: ((M0 * s.v) / s.rate) * Math.log1p((s.rate * t) / M0) };
  }
  // leaking: the sand runs out once the cart is empty
  const tOut = SAND_START / s.rate;
  return { v: s.v, M: M0 - s.rate * Math.min(t, tOut), x: s.v * t };
}
const leakEnd = (s: SSetup) => Math.min(SAND_T, SAND_START / s.rate);

function niceUp(x: number): number {
  if (!(x > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(x));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * mag >= x * (1 - 1e-9)) return k * mag;
  return 10 * mag;
}

/** Canvas text with a paper halo (Latin and math labels only; Hebrew goes through handNote). */
function haloText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { font: string; color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline }) {
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

/** A symbol with a true subscript (t with a small b below the line), left-aligned at (x, y), with a paper halo. */
function subText(ctx: CanvasRenderingContext2D, p: Palette, base: string, sub: string, x: number, y: number, size: number, color: string) {
  const fBase = `italic 700 ${size}px ${p.fontUi}`;
  const fSub = `italic 700 ${Math.round(size * 0.72)}px ${p.fontUi}`;
  ctx.save();
  ctx.font = fBase;
  const wb = ctx.measureText(base).width;
  ctx.restore();
  haloText(ctx, p, base, x, y, { font: fBase, color, align: 'left' });
  haloText(ctx, p, sub, x + wb + 1, y + size * 0.3, { font: fSub, color, align: 'left' });
}

/** A deterministic pseudo-random number in [0, 1) for grain k (so a still frame is reproducible). */
const hash = (k: number) => {
  const s = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 0, sig = 3) => (Math.abs(x) <= tiny ? '0' : sci(x, sig).replace('-', '−'));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));

export default function RocketLab(props: RocketLabProps) {
  const scene: Scene = props.scene ?? 'rocket';
  const isRocket = scene === 'rocket';

  const initialR = (): RSetup => {
    const m0 = clamp(props.m0 ?? 10000, 4000, 20000);
    return {
      u: clamp(props.u ?? 2000, 1000, 4000),
      m0,
      m1: clamp(props.m1 ?? 2000, 500, m0 - 500),
      rate: clamp(props.rate ?? 100, 5, 500),
      gravity: props.gravity ?? false,
    };
  };
  const initialS = (): SSetup => ({ mode: props.mode ?? 'pushed', v: clamp(props.v ?? 3, 1, 5), rate: clamp(props.sandRate ?? 4, 1, 10) });
  const initialShow = (): Show => ({ forces: props.forces ?? true, boundary: props.boundary ?? false, blind: props.blind ?? false });

  const [rs, setRs] = useState<RSetup>(initialR);
  const [ss, setSs] = useState<SSetup>(initialS);
  const [show, setShow] = useState<Show>(initialShow);
  /** the instant shown when nothing runs [s]; a negative value is a fraction of the run, resolved below */
  const [time, setTime] = useState(0);
  const [runs, setRuns] = useState<Run[]>([]);
  const [playing, setPlaying] = useState<number | null>(null);
  const [live, setLive] = useState('');
  const [narrowStage, setNarrowStage] = useState(false);
  const t0 = useRef<number | null>(null);
  const count = useRef(0);
  const history = useRef<Run[]>([]);

  const model = rModelOf(rs);
  const tEnd = isRocket ? model.tEnd : SAND_T;
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the setup and the toggles and choose the instant shown; they never launch or scrub
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setRs((prev) => {
          const m0 = clamp(num(st.m0) ?? prev.m0, 4000, 20000);
          return {
            u: clamp(num(st.u) ?? prev.u, 1000, 4000),
            m0,
            m1: clamp(num(st.m1) ?? prev.m1, 500, m0 - 500),
            rate: clamp(num(st.rate) ?? prev.rate, 5, 500),
            gravity: bool(st.gravity) ?? prev.gravity,
          };
        });
        setSs((prev) => ({
          mode: st.mode === 'pushed' || st.mode === 'coast' || st.mode === 'leak' ? st.mode : prev.mode,
          v: clamp(num(st.v) ?? prev.v, 1, 5),
          rate: clamp(num(st.sandRate) ?? prev.rate, 1, 10),
        }));
        setShow((prev) => ({
          forces: bool(st.forces) ?? prev.forces,
          boundary: bool(st.boundary) ?? prev.boundary,
          blind: bool(st.blind) ?? prev.blind,
        }));
        if (st.clear === true) setRuns([]);
        setPlaying(null);
        const t = num(st.t);
        const tf = num(st.tFrac);
        setTime(t !== null ? Math.max(0, t) : tf !== null ? -Math.max(1e-9, tf) : 0);
      }),
    [props.id],
  );
  useEffect(() => {
    if (time < 0) setTime(-time * tEnd);
  }, [time, tEnd]);

  const finish = () => {
    setPlaying(null);
    setTime(tEnd);
  };

  const launch = () => {
    const n = ++count.current;
    t0.current = null;
    if (isRocket) {
      const r: Run = { n, setup: { ...rs }, model };
      done('launch');
      const h = history.current;
      if (!rs.gravity && h.some((o) => !o.setup.gravity && o.setup.u === rs.u && o.setup.m0 === rs.m0 && o.setup.m1 === rs.m1 && o.setup.rate !== rs.rate)) done('rate-same');
      if (rs.gravity && Number.isFinite(model.tl)) done('gravity-launch');
      if (rs.gravity && !Number.isFinite(model.tl)) done('no-liftoff');
      h.push(r);
      setRuns((prev) => [...prev.filter((o) => o.n !== n), r].slice(-KEEP));
      const b = burnout(model.r);
      setLive(
        b.lifted
          ? `הרקטה שוגרה. בסוף השריפה, אחרי ${sci(model.tb)} שניות, מהירותה ${sci(b.v)} מטר בשנייה.`
          : `כוח הדחף קטן מהכובד גם על הרקטה הריקה: היא לא מתרוממת.`,
      );
    } else {
      if (ss.mode === 'pushed') done('pushed');
      if (ss.mode === 'coast') done('coast');
      if (ss.mode === 'leak' && show.blind) done('leak-blind');
      setLive(ss.mode === 'pushed' ? 'העגלה נוסעת, והכוח שומר על מהירותה.' : ss.mode === 'coast' ? 'העגלה נוסעת בלי כוח, והחול נופל לתוכה.' : 'העגלה נוסעת בלי כוח, והחול נשפך ממנה.');
    }
    if (!motionAllowed()) {
      finish();
      return;
    }
    setPlaying(n);
  };

  /* -------------------------------------------------------------------------------------- drawing */

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const narrow = view.w < NARROW_W;
    const fs = narrow ? 10 : 12;
    let now = clamp(time, 0, tEnd);
    if (playing !== null) {
      if (t0.current === null) t0.current = t;
      now = Math.min((t - t0.current) * (tEnd / 6), tEnd); // a run plays in six seconds
      if (now >= tEnd) finish();
    }
    if (isRocket) drawRocket(ctx, view.w, view.h, p, fs, narrow, now, t);
    else drawSand(ctx, view.w, view.h, p, fs, narrow, now);
  };

  function drawRocket(ctx: CanvasRenderingContext2D, W: number, H: number, p: Palette, fs: number, narrow: boolean, now: number, clock: number) {
    const m = model;
    const r = m.r;
    const colW = Math.round(W * (narrow ? 0.4 : 0.26));
    const top = 10;
    const bottom = H - 10;
    const colH = bottom - top;
    const cx = colW * 0.42;
    const yNow = m.y(now);
    const vNow = m.v(now);
    const M = massAt(r, now);
    const burning = now < m.tb;
    const onPad = r.g! > 0 && !(now > m.tl);

    // the column of space or sky
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.06);
    ctx.fillRect(4, top, colW - 8, colH);
    ctx.strokeStyle = p.rule;
    ctx.strokeRect(4, top, colW - 8, colH);
    ctx.beginPath();
    ctx.rect(4, top, colW - 8, colH);
    ctx.clip();

    // the rocket's size scales with the column; it sits a little above the middle
    const rw = Math.max(14, Math.min(colW * 0.17, colH * 0.07));
    const rh = rw * 4.2;
    const bodyY = top + colH * 0.42;
    const baseY = bodyY + rh / 2;

    // ruler marks along the axis (height in gravity, distance in free space): a few in view
    const span = niceUp(Math.max(m.y(m.tEnd) / 3, 50));
    const ppm = colH / span;
    const step = niceUp(span / 4);
    const [unit, per] = step >= 1000 ? ['km', 1000] : ['m', 1];
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    for (let k = Math.floor((yNow - span) / step); k <= Math.ceil((yNow + span) / step); k++) {
      if (k < 0 && r.g! > 0) continue;
      const yy = baseY - (k * step - yNow) * ppm;
      if (yy < top - 2 || yy > bottom + 2) continue;
      ctx.beginPath();
      ctx.moveTo(4, yy);
      ctx.lineTo(14, yy);
      ctx.stroke();
      haloText(ctx, p, signed((k * step) / per), 16, yy, { font: `${fs - 1}px ${p.fontUi}`, color: p.ink2, align: 'left' });
    }
    // the ground and the pad, in gravity
    if (r.g! > 0) {
      const gy = baseY + rw * 0.15 + yNow * ppm;
      if (gy < bottom + 4) {
        ctx.fillStyle = p.equip;
        ctx.fillRect(cx - rw * 1.2, gy, rw * 2.4, 4);
        ctx.fillStyle = withAlpha(p.ink3, 0.35);
        ctx.fillRect(4, gy + 4, colW - 8, bottom - gy);
      }
    }
    ctx.restore();
    haloText(ctx, p, r.g! > 0 ? `y (${unit}) ↑` : `x (${unit}) ↑`, colW - 8, top + 10, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });

    // exhaust: parcels streaming down from the nozzle while it burns (they move down relative to the rocket)
    if (burning || (now >= m.tb && now < m.tb + 0.02 * m.tb)) {
      const gap = rw * 0.9;
      const phase = ((clock * 3) % 1) * gap;
      for (let k = 0; k < 6; k++) {
        const yy = baseY + 6 + k * gap + phase;
        if (yy > bottom) break;
        ctx.fillStyle = withAlpha(p.energyTh, 0.55 - k * 0.07);
        ctx.beginPath();
        ctx.arc(cx + (hash(k) - 0.5) * rw * 0.3, yy, rw * (0.22 - k * 0.02), 0, Math.PI * 2);
        ctx.fill();
      }
      // the flame
      ctx.fillStyle = withAlpha(p.energyTh, 0.85);
      ctx.beginPath();
      ctx.moveTo(cx - rw * 0.32, baseY);
      ctx.lineTo(cx + rw * 0.32, baseY);
      ctx.lineTo(cx, baseY + rw * (1.1 + 0.15 * Math.sin(clock * 30)));
      ctx.closePath();
      ctx.fill();
    }

    // the rocket: body, nose, fins, and the fuel left
    const left = cx - rw / 2;
    const bodyTop = bodyY - rh / 2 + rw * 0.9;
    ctx.save();
    ctx.fillStyle = p.paper2;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, baseY);
    ctx.lineTo(left, bodyTop);
    ctx.quadraticCurveTo(cx - rw * 0.45, bodyY - rh / 2 + rw * 0.2, cx, bodyY - rh / 2);
    ctx.quadraticCurveTo(cx + rw * 0.45, bodyY - rh / 2 + rw * 0.2, left + rw, bodyTop);
    ctx.lineTo(left + rw, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + (sgn * rw) / 2, baseY - rw * 0.9);
      ctx.lineTo(cx + sgn * rw * 0.95, baseY + rw * 0.15);
      ctx.lineTo(cx + (sgn * rw) / 2, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    const fuelFrac = (M - r.m1) / (r.m0 - r.m1);
    const tankTop = bodyTop + rw * 0.25;
    const tankH = baseY - rw * 0.25 - tankTop;
    ctx.fillStyle = withAlpha(p.accent, 0.55);
    ctx.fillRect(left + 3, tankTop + tankH * (1 - fuelFrac), rw - 6, tankH * fuelFrac);
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 3, tankTop, rw - 6, tankH);
    ctx.restore();

    // the system of the derivation: the rocket and the mass −dM it ejects in dt, inside one boundary
    if (show.boundary) {
      const py = baseY + rw * 0.75;
      ctx.save();
      ctx.fillStyle = p.momentum;
      ctx.fillRect(cx - rw * 0.2, py - rw * 0.2, rw * 0.4, rw * 0.4);
      ctx.strokeStyle = p.hand;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(cx - rw * 1.25, bodyY - rh / 2 - 8, rw * 2.5, py + rw * 0.45 - (bodyY - rh / 2 - 8));
      ctx.restore();
      // the rocket's mass and velocity above the boundary, the ejected mass's below it
      const boxTop = bodyY - rh / 2 - 8;
      const boxBottom = py + rw * 0.45;
      const f = `italic 600 ${fs}px ${p.fontUi}`;
      haloText(ctx, p, 'M + dM', cx, boxTop - fs * 2 - 2, { font: f, color: p.ink });
      haloText(ctx, p, 'v + dv', cx, boxTop - fs - 1, { font: f, color: p.velocity });
      haloText(ctx, p, '−dM', cx, boxBottom + fs, { font: f, color: p.momentum });
      haloText(ctx, p, 'v − u', cx, boxBottom + fs * 2 + 1, { font: f, color: p.velocity });
    }

    // the forces on the rocket: the thrust uμ (by the exhaust; internal once the boundary includes it), its weight
    // Mg (by the Earth), the pad's normal force N while it sits there, and the net force, emphasised. One scale
    // for the whole run; every arrow starts on the rocket and has a minimum length.
    if (show.forces) {
      const T = burning ? thrust(r) : 0;
      const Wt = M * r.g!;
      const N = padForce(r, now);
      const Fbig = Math.max(thrust(r), r.m0 * r.g!, 1);
      const kF = (0.26 * colH) / Fbig;
      const len = (F: number) => (F > 0 ? Math.max(14, kF * F) : 0);
      const xr = cx + rw * 0.22;
      const xl = cx - rw * 0.22;
      if (!show.boundary && T > 0) {
        arrow(ctx, xr, bodyY, xr, bodyY - len(T), { color: p.force, width: 2, head: 8, alpha: 0.8 });
        haloText(ctx, p, 'uμ', xr + 3, bodyY - len(T) - 8, { font: `italic 600 ${fs + 1}px ${p.fontUi}`, color: p.force, align: 'left' });
      }
      if (Wt > 0) {
        arrow(ctx, xl, bodyY, xl, bodyY + len(Wt), { color: p.force, width: 2, head: 8, alpha: 0.8 });
        haloText(ctx, p, 'Mg', xl - 4, bodyY + len(Wt) - 2, { font: `italic 600 ${fs + 1}px ${p.fontUi}`, color: p.force, align: 'right' });
      }
      if (N > 0) {
        arrow(ctx, cx, baseY, cx, baseY - len(N), { color: p.force, width: 2, head: 8, alpha: 0.8 });
        haloText(ctx, p, 'N', cx - rw * 0.62, baseY - len(N) * 0.5, { font: `italic 600 ${fs + 1}px ${p.fontUi}`, color: p.force, align: 'right' });
      }
      const net = (show.boundary ? 0 : T) - Wt + N;
      const nx = cx + rw * 0.5 + (narrow ? 16 : 22);
      if (!show.boundary) {
        // the net force sits beside the rocket, joined to it by a short tick so it starts on the body
        ctx.save();
        ctx.strokeStyle = p.force;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + rw * 0.5, bodyY);
        ctx.lineTo(nx, bodyY);
        ctx.stroke();
        ctx.restore();
        if (Math.abs(net) > 0.01 * Fbig) {
          arrow(ctx, nx, bodyY, nx, bodyY - Math.sign(net) * len(Math.abs(net)), { color: p.force, width: 4, head: 11 });
          haloText(ctx, p, 'ΣF', nx + 4, bodyY - Math.sign(net) * (len(Math.abs(net)) + 9), { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.force, align: 'left' });
        } else {
          ctx.fillStyle = p.force;
          ctx.beginPath();
          ctx.arc(nx, bodyY, 3, 0, Math.PI * 2);
          ctx.fill();
          haloText(ctx, p, 'ΣF = 0', nx - 4, bodyY + 15, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force, align: 'left' });
        }
      }
    }

    /* ---------------- the plot of v(t) */
    const ms = [m, ...runs.map((x) => x.model)];
    const tMax = niceUp(Math.max(...ms.map((x) => x.tEnd)));
    const vTop = Math.max(...ms.map((x) => x.dvFree), rs.u) * 1.08;
    const vMax = niceUp(vTop);
    // the formula u ln(m₀/M) − g t dips below zero while the rocket waits on the pad; its minimum is at lift-off
    const dip = (x: RModel) => (x.r.g! > 0 && x.tl > 0 && Number.isFinite(x.tl) ? tsiolkovsky(x.r.u, x.r.m0, massAt(x.r, x.tl)) - x.r.g! * x.tl : 0);
    const vLow = Math.min(0, ...ms.map((x) => Math.min(x.v(x.tEnd), dip(x))));
    const vMin = vLow < 0 ? -niceUp(-vLow) : 0;
    const box = insetBox({ x: colW, y: 0, w: W - colW, h: H }, { l: narrow ? 62 : 62, r: 12, t: 26, b: 44 });
    const plot: Plot = makePlot(
      box,
      { min: 0, max: tMax, label: 'הזמן t (s)' },
      { min: vMin, max: vMax, label: r.g! > 0 ? 'המהירות כלפי מעלה v (m/s)' : 'המהירות v (m/s)' },
    );
    drawAxes(ctx, plot, p);
    const lbl = `600 ${fs}px ${p.fontUi}`;
    const hand = narrow ? 12 : 14;

    // the exhaust speed u, the line the Predict asks about
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(box.x, plot.py(rs.u));
    ctx.lineTo(box.x + box.w, plot.py(rs.u));
    ctx.stroke();
    ctx.restore();
    haloText(ctx, p, `v = u = ${sci(rs.u)} m/s`, box.x + 6, plot.py(rs.u) - 9, { font: lbl, color: p.ink2, align: 'left' });

    // the burn-out instant
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.px(m.tb), box.y);
    ctx.lineTo(plot.px(m.tb), box.y + box.h);
    ctx.stroke();
    ctx.restore();
    subText(ctx, p, 't', 'b', plot.px(m.tb) + 4, box.y + box.h - 12, fs + 1, p.ink2);

    // earlier launches, faint, each labelled with its burn rate at its end
    runs.forEach((run, i) => {
      if (playing !== null && run.n === playing) return;
      const same = run.setup.rate === rs.rate && run.setup.u === rs.u && run.setup.m0 === rs.m0 && run.setup.m1 === rs.m1 && run.setup.gravity === rs.gravity;
      if (same) return;
      drawCurve(ctx, plot, (tt) => (tt <= run.model.tEnd ? run.model.v(tt) : NaN), { color: withAlpha(p.ink3, 0.9), width: 1.4 });
      const te = Math.min(run.model.tEnd, tMax * 0.98);
      haloText(ctx, p, `μ = ${sci(run.setup.rate)} kg/s`, plot.px(te) - 4, plot.py(run.model.v(te)) + 12 + 12 * (i % 2), { font: `${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });
    });

    // in gravity: the free-space curve (Tsiolkovsky) and the formula u ln(m₀/M) − g t during the burn
    const free = (tt: number) => (tt <= m.tEnd ? tsiolkovsky(rs.u, rs.m0, massAt(r, tt)) : NaN);
    if (r.g! > 0) {
      drawCurve(ctx, plot, free, { color: p.accent, width: 1.6, dash: [7, 5] });
      // on the plateau after burn-out, at the right end, above the dashed line
      handNote(ctx, 'בחלל', Math.min(plot.px(m.tEnd), box.x + box.w) - (narrow ? 18 : 24), plot.py(m.dvFree) - 12, p, hand);
      const formula = (tt: number) => (tt <= m.tb ? tsiolkovsky(rs.u, rs.m0, massAt(r, tt)) - G * tt : NaN);
      if (m.tl > 0) {
        drawCurve(ctx, plot, formula, { color: p.ink2, width: 1.4, dash: [2, 3] });
        // the label up and to the left of where the curves end at burn-out: below the free-space curve and the
        // line v = u, above the slow early part of the motion
        haloText(ctx, p, 'u ln(m₀/M) − gt', plot.px(m.tb * 0.97) - 6, plot.py(formula(m.tb)) - 8, { font: `italic ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });
      }
    }

    // the current motion: faint ahead, solid up to the instant shown, and the instant itself
    drawCurve(ctx, plot, (tt) => (tt <= m.tEnd ? m.v(tt) : NaN), { color: withAlpha(p.velocity, 0.3), width: 2 });
    drawCurve(ctx, plot, (tt) => (tt <= now ? m.v(tt) : NaN), { color: p.velocity, width: 2.6, samples: 240 });
    drawMarker(ctx, plot, now, vNow, p.velocity, { guides: true, radius: 5 });

    // the velocity lost to gravity so far, between the free-space curve and the motion (only for a rocket that
    // lifts off at once: with a late lift-off the gap also holds the time on the pad)
    if (r.g! > 0 && now > 0 && now <= m.tb && m.tl === 0) {
      const a = plot.py(free(now));
      const b = plot.py(vNow);
      if (b - a > 16) {
        arrow(ctx, plot.px(now) + 7, a, plot.px(now) + 7, b, { color: p.accent, width: 1.4, head: 6 });
        // under the motion's curve, right of the instant (that region is empty: the curve rises to the right)
        const wNote = narrow ? 64 : 76;
        const xn = clamp(plot.px(now) + wNote / 2 + 6, box.x + wNote / 2, box.x + box.w - wNote / 2);
        handNote(ctx, 'הפסד לכובד', xn, Math.min(b + 18, box.y + box.h - 22), p, narrow ? 11 : 13);
      }
    }
    if (onPad && now > 0 && now < m.tb) handNote(ctx, 'על הכן', plot.px(now) + 34, plot.py(0) - 14, p, hand);
  }

  function drawSand(ctx: CanvasRenderingContext2D, W: number, H: number, p: Palette, fs: number, narrow: boolean, now: number) {
    const sceneW = narrow ? W : W * 0.52;
    const sceneH = narrow ? H * 0.46 : H;
    const c = cartAt(ss, now);
    const trackY = sceneH * (narrow ? 0.8 : 0.66);
    // the cart takes a third of the width, unless the drop from the hopper would not fit above it
    const ppm = Math.min((sceneW * 0.34) / CART_L, (trackY - 46) / (FLOOR_H + 0.36 + DROP_H + 0.2));
    const cartCX = sceneW * 0.5;
    const floorY = trackY - FLOOR_H * ppm;
    const cartH = Math.max(16, 0.45 * ppm);
    const cartL = cartCX - (CART_L * ppm) / 2;
    const cartR = cartCX + (CART_L * ppm) / 2;
    const xs = (xg: number) => cartCX + (xg - c.x) * ppm; // ground x → screen

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, sceneW, sceneH);
    ctx.clip();
    // the track and its sleepers, which move past the cart
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, trackY);
    ctx.lineTo(sceneW, trackY);
    ctx.stroke();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    for (let k = Math.floor(c.x - sceneW / ppm); k <= Math.ceil(c.x + sceneW / ppm); k++) {
      const x = xs(k);
      ctx.beginPath();
      ctx.moveTo(x, trackY);
      ctx.lineTo(x - 5, trackY + 7);
      ctx.stroke();
    }

    // the scene's note; on a narrow stage the reset and fullscreen buttons sit over the scene's top-right corner, so
    // the note keeps left of them
    const note = ss.mode === 'leak' ? 'החול נשפך מהרצפה' : 'החול נופל אנכית ביחס לקרקע';
    const noteSize = narrow ? 12 : 14;
    const noteX = narrow ? (sceneW - 90) / 2 : sceneW * 0.5;
    const noteY = narrow ? 16 : 22;
    ctx.save();
    ctx.font = `500 ${noteSize}px ${p.fontHand}`;
    const noteHalfW = ctx.measureText(note).width / 2 + 8;
    ctx.restore();

    // the hopper, a long trough fixed to the ground above the track (pushed and coast)
    const sandTop = floorY - cartH * 0.8;
    const hopperY = sandTop - DROP_H * ppm;
    if (ss.mode !== 'leak') {
      ctx.fillStyle = withAlpha(p.equip, 0.5);
      ctx.fillRect(0, hopperY - 8, sceneW, 8);
      ctx.strokeStyle = p.equip;
      for (let k = Math.floor((c.x - sceneW / ppm) / 4); k <= Math.ceil((c.x + sceneW / ppm) / 4); k++) {
        const x = xs(4 * k);
        // a post under the note stops below it
        const top = Math.abs(x - noteX) < noteHalfW ? noteY + noteSize * 0.75 : 0;
        if (top >= hopperY - 8) continue;
        ctx.beginPath();
        ctx.moveTo(x, hopperY - 8);
        ctx.lineTo(x, top);
        ctx.stroke();
      }
      // grains: each leaves the hopper with no horizontal velocity and lands in the cart; in the cart's view it
      // drifts backward as it falls. Sand pours into the cart from t = 0, so the grains that land in the first
      // fall time left the hopper before t = 0 (negative k): the stream is full from the first frame.
      const tFall = Math.sqrt((2 * DROP_H) / G);
      const dtE = 1 / (ss.rate * 12);
      const kNow = Math.floor(now / dtE);
      const kMin = Math.ceil((now - tFall) / dtE);
      ctx.fillStyle = withAlpha(p.ink2, 0.85);
      for (let k = kMin; k <= kNow; k++) {
        const te = k * dtE;
        const xg = cartAt(ss, te + tFall).x + (hash(k) - 0.5) * CART_L * 0.8;
        const s = now - te;
        const yy = hopperY + 0.5 * G * s * s * ppm;
        ctx.fillRect(xs(xg) - 1, yy - 1, 2.4, 2.4);
      }
    } else {
      // leaking: each grain leaves through the floor with the cart's own velocity, then falls to the track
      const tFall = Math.sqrt((2 * FLOOR_H) / G);
      const dtE = 1 / (ss.rate * 12);
      const tOut = leakEnd(ss);
      ctx.fillStyle = withAlpha(p.ink2, 0.85);
      for (let k = Math.max(0, Math.ceil((now - 4) / dtE)); k * dtE <= Math.min(now, tOut); k++) {
        const te = k * dtE;
        const s = now - te;
        const x0 = cartAt(ss, te).x + (hash(k) - 0.5) * 0.15;
        if (s < tFall) {
          ctx.fillRect(xs(x0 + ss.v * s) - 1, floorY + 0.5 * G * s * s * ppm - 1, 2.4, 2.4);
        } else {
          // on the track: it keeps the speed it had along the track only until it lands
          ctx.fillRect(xs(x0 + ss.v * tFall) - 1, trackY - 3, 2.4, 2.4);
        }
      }
    }
    ctx.restore();

    // the cart: a box on wheels, with its sand
    ctx.save();
    ctx.fillStyle = p.paper2;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.fillRect(cartL, floorY - cartH, cartR - cartL, cartH);
    ctx.strokeRect(cartL, floorY - cartH, cartR - cartL, cartH);
    const sandFrac = clamp((c.M - CART_EMPTY) / 200, 0, 1);
    ctx.fillStyle = withAlpha(p.equip, 0.75);
    ctx.fillRect(cartL + 2, floorY - 2 - (cartH - 4) * sandFrac, cartR - cartL - 4, (cartH - 4) * sandFrac);
    const wr = Math.max(4, (floorY - trackY) * -0.5);
    for (const wx of [cartL + (cartR - cartL) * 0.2, cartL + (cartR - cartL) * 0.8]) {
      ctx.beginPath();
      ctx.arc(wx, trackY - wr, wr, 0, Math.PI * 2);
      ctx.fillStyle = p.paper;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // the cart's velocity, under the track; the pushing force F on the cart (pushed mode), from its front face
    const vMaxArrow = 5;
    const kv = (sceneW * 0.3) / vMaxArrow;
    const vy = trackY + 18;
    arrow(ctx, cartCX - (kv * c.v) / 2, vy, cartCX + (kv * c.v) / 2, vy, { color: p.velocity, width: 2.2, head: 8 });
    haloText(ctx, p, `v = ${sci(c.v, 3)} m/s`, cartCX, vy + 13, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.velocity });
    if (ss.mode === 'pushed' && show.forces) {
      const F = sandForce(ss.v, ss.rate);
      const L = Math.max(18, (F / 50) * sceneW * 0.3);
      const fy = floorY - cartH / 2;
      arrow(ctx, cartR, fy, Math.min(cartR + L, sceneW - 6), fy, { color: p.force, width: 3, head: 10 });
      haloText(ctx, p, 'F', Math.min(cartR + L, sceneW - 6) - 6, fy - 12, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.force });
    }
    handNote(ctx, note, noteX, noteY, p, noteSize);

    /* ---------------- the right (lower) panel */
    const panel = narrow ? { x: 0, y: sceneH, w: W, h: H - sceneH } : { x: sceneW, y: 0, w: W - sceneW, h: H };
    if (ss.mode === 'pushed') {
      // the power budget: the motor's power next to the kinetic-energy rate plus the heat
      const bp = beltPower(ss.v, ss.rate);
      const box = insetBox(panel, { l: narrow ? 50 : 58, r: 16, t: 30, b: 40 });
      const pMax = niceUp(1.25 * bp.motor);
      const plot = makePlot(box, { min: 0, max: 2, ticks: [] }, { min: 0, max: pMax, label: 'הספק (W)' });
      drawAxes(ctx, plot, p, { grid: true });
      const bw = box.w * 0.22;
      const x1 = box.x + box.w * 0.25 - bw / 2;
      const x2 = box.x + box.w * 0.7 - bw / 2;
      const yb = box.y + box.h;
      const hOf = (P: number) => (P / pMax) * box.h;
      ctx.fillStyle = withAlpha(p.force, 0.75);
      ctx.fillRect(x1, yb - hOf(bp.motor), bw, hOf(bp.motor));
      ctx.fillStyle = withAlpha(p.energyK, 0.85);
      ctx.fillRect(x2, yb - hOf(bp.kinetic), bw, hOf(bp.kinetic));
      ctx.fillStyle = withAlpha(p.energyTh, 0.85);
      ctx.fillRect(x2, yb - hOf(bp.kinetic) - hOf(bp.heat), bw, hOf(bp.heat));
      haloText(ctx, p, `Fv = ${sci(bp.motor)} W`, x1 + bw / 2, yb - hOf(bp.motor) - 10, { font: `600 ${fs}px ${p.fontUi}`, color: p.force });
      haloText(ctx, p, `${sci(bp.kinetic)} W`, x2 + bw / 2, yb - hOf(bp.kinetic) / 2, { font: `600 ${fs}px ${p.fontUi}`, color: p.ink });
      haloText(ctx, p, `${sci(bp.heat)} W`, x2 + bw / 2, yb - hOf(bp.kinetic) - hOf(bp.heat) / 2, { font: `600 ${fs}px ${p.fontUi}`, color: p.ink });
      handNote(ctx, 'המנוע', x1 + bw / 2, yb + 14, p, narrow ? 12 : 14);
      handNote(ctx, 'קינטית + חום', x2 + bw / 2, yb + 14, p, narrow ? 12 : 14);
      // the legend of the stacked bar, beside it
      const lx = x2 + bw + 6;
      if (lx + 30 < box.x + box.w + 14) {
        handNote(ctx, 'חום', lx + 14, yb - hOf(bp.kinetic) - hOf(bp.heat) / 2, p, narrow ? 11 : 13);
        handNote(ctx, 'קינטית', lx + 20, yb - hOf(bp.kinetic) / 2, p, narrow ? 11 : 13);
      }
      return;
    }
    // coast and leak: v(t)
    const blindOn = ss.mode === 'leak' && show.blind;
    const tOut = leakEnd(ss);
    const blindAt = (tt: number) => blindLeakVelocity(CART_EMPTY + SAND_START, ss.v, ss.rate, Math.min(tt, tOut * 0.999));
    const vTop = blindOn ? 2 * ss.v : ss.v;
    const box = insetBox(panel, { l: narrow ? 46 : 56, r: 14, t: 24, b: 44 });
    const plot = makePlot(box, { min: 0, max: SAND_T, label: 'הזמן t (s)' }, { min: 0, max: niceUp(vTop * 1.15), label: 'מהירות העגלה v (m/s)' });
    drawAxes(ctx, plot, p);
    // the speed it started with, for comparison
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(box.x, plot.py(ss.v));
    ctx.lineTo(box.x + box.w, plot.py(ss.v));
    ctx.stroke();
    ctx.restore();
    if (ss.mode === 'coast') handNote(ctx, 'בלי חול', box.x + box.w * 0.8, plot.py(ss.v) - 12, p, narrow ? 12 : 14);
    if (blindOn) {
      drawCurve(ctx, plot, (tt) => (tt <= tOut ? blindAt(tt) : NaN), { color: p.ink2, width: 1.6, dash: [2, 4] });
      const tq = tOut * 0.55;
      haloText(ctx, p, 'F = d(Mv)/dt', plot.px(tq) - 6, plot.py(blindAt(tq)) - 12, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });
      handNote(ctx, 'חיזוי שגוי', plot.px(tq) - 40, plot.py(blindAt(tq)) - 30, p, narrow ? 12 : 14);
    }
    const vf = (tt: number) => cartAt(ss, tt).v;
    drawCurve(ctx, plot, vf, { color: withAlpha(p.velocity, 0.3), width: 2 });
    drawCurve(ctx, plot, (tt) => (tt <= now ? vf(tt) : NaN), { color: p.velocity, width: 2.6, samples: 200 });
    drawMarker(ctx, plot, now, c.v, p.velocity, { guides: true, radius: 5 });
  }

  const aspect = isRocket ? (narrowStage ? 0.95 : 16 / 9) : narrowStage ? 0.82 : 16 / 9;
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: aspect, worldHeight: 1, animate: playing !== null });
  useEffect(invalidate, [rs, ss, show, time, runs, playing, narrowStage]);
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

  /* -------------------------------------------------------------------------------------- controls */

  const changeR = (f: (s: RSetup) => RSetup) => {
    setPlaying(null);
    setTime(0);
    setRs((s) => {
      const n = f(s);
      return { ...n, m1: clamp(n.m1, 500, n.m0 - 500) };
    });
  };
  const changeS = (f: (s: SSetup) => SSetup) => {
    setPlaying(null);
    setTime(0);
    setSs((s) => f(s));
  };
  const scrub = (tt: number) => {
    setPlaying(null);
    const t = clamp(tt, 0, tEnd);
    setTime(t);
    if (isRocket && !rs.gravity && Math.abs(model.v(t) - rs.u) <= 0.02 * rs.u) done('pass-u');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') launch();
    else if (isRocket && e.key === 'ArrowUp') changeR((s) => ({ ...s, rate: clamp(s.rate + 5, 5, 500) }));
    else if (isRocket && e.key === 'ArrowDown') changeR((s) => ({ ...s, rate: clamp(s.rate - 5, 5, 500) }));
    else return;
    e.preventDefault();
  };

  const shown = clamp(time, 0, tEnd);
  const r = model.r;
  let readout;
  let label: string;
  if (isRocket) {
    const M = massAt(r, shown);
    const v = model.v(shown);
    const burningNow = shown < model.tb;
    const a = shown >= model.tl && burningNow ? thrust(r) / M - (r.g ?? 0) : shown > model.tb ? -(r.g ?? 0) : 0;
    const b = burnout(r);
    label = `איור חי: רקטה ${rs.gravity ? 'משוגרת אנכית ליד פני כדור הארץ' : 'בחלל, רחוק מכל גוף'}. מהירות הפליטה ${sci(rs.u)} מטר בשנייה, המסה יורדת מ-${sci(rs.m0)} ל-${sci(rs.m1)} קילוגרם בקצב ${sci(rs.rate)} קילוגרם בשנייה. ${b.lifted ? `בסוף השריפה מהירותה ${sci(b.v)} מטר בשנייה.` : 'כוח הדחף קטן מהכובד, והיא לא מתרוממת.'} במקלדת: חץ למעלה ולמטה משנה את קצב השריפה, Enter משגר.`;
    readout =
      playing !== null ? (
        <span>הרקטה בתנועה…</span>
      ) : (
        <>
          <span class="q" data-readout="t">
            t = <b>{signed(shown)} s</b>
          </span>
          <span class="q" data-readout="M">
            M = <b>{sci(M, 4)} kg</b>
          </span>
          <span class="q" data-readout="v">
            v = <b>{signed(v, 1e-9, 4)} m/s</b>
          </span>
          <span class="q" data-readout="a">
            a = <b>{signed(a, 1e-9)} m/s²</b>
          </span>
          <span>
            כוח הדחף{' '}
            <b class="q" data-readout="thrust">
              {sci(thrust(r))} N
            </b>
          </span>
          {rs.gravity && (
            <span>
              הכובד בהצתה{' '}
              <b class="q" data-readout="weight">
                {sci(rs.m0 * G)} N
              </b>
            </span>
          )}
          <span class="q" data-readout="tb">
            t<sub>b</sub> = <b>{sci(model.tb)} s</b>
          </span>
          <span>
            בסוף השריפה{' '}
            <b class="q" data-readout="vb">
              {sci(b.v, 4)} m/s
            </b>
          </span>
          <span>
            בחלל{' '}
            <b class="q" data-readout="dv">
              u ln(m₀/m₁) = {sci(model.dvFree, 4)} m/s
            </b>
          </span>
        </>
      );
  } else {
    const c = cartAt(ss, shown);
    const bp = beltPower(ss.v, ss.rate);
    label = `איור חי: עגלה על מסילה חלקה. ${ss.mode === 'pushed' ? `חול נופל לתוכה בקצב ${sci(ss.rate)} קילוגרם בשנייה, וכוח של ${sci(sandForce(ss.v, ss.rate))} ניוטון שומר על מהירותה, ${sci(ss.v)} מטר בשנייה.` : ss.mode === 'coast' ? `חול נופל לתוכה בקצב ${sci(ss.rate)} קילוגרם בשנייה, ואין עליה כוח אופקי: היא מאטה.` : `חול נשפך מהרצפה שלה בקצב ${sci(ss.rate)} קילוגרם בשנייה, ואין עליה כוח אופקי: מהירותה לא משתנה.`} Enter מריץ.`;
    readout =
      playing !== null ? (
        <span>העגלה בתנועה…</span>
      ) : (
        <>
          <span class="q" data-readout="t">
            t = <b>{signed(shown)} s</b>
          </span>
          <span class="q" data-readout="M">
            M = <b>{sci(c.M)} kg</b>
          </span>
          <span class="q" data-readout="v">
            v = <b>{sci(c.v)} m/s</b>
          </span>
          <span class="q" data-readout="P">
            Mv = <b>{sci(c.M * c.v)} kg·m/s</b>
          </span>
          {ss.mode === 'pushed' && (
            <>
              <span class="q" data-readout="F">
                F = <b>{sci(sandForce(ss.v, ss.rate))} N</b>
              </span>
              <span>
                הספק המנוע{' '}
                <b class="q" data-readout="motor">
                  {sci(bp.motor)} W
                </b>
              </span>
              <span>
                אנרגיה קינטית{' '}
                <b class="q" data-readout="kinetic">
                  {sci(bp.kinetic)} W
                </b>
              </span>
              <span>
                חום{' '}
                <b class="q" data-readout="heat">
                  {sci(bp.heat)} W
                </b>
              </span>
            </>
          )}
        </>
      );
  }

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onReset={() => {
        setRs(initialR());
        setSs(initialS());
        setShow(initialShow());
        setRuns([]);
        setPlaying(null);
        setTime(0);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={readout}
      controls={
        isRocket ? (
          <>
            {props.gravityToggle && (
              <div class="group" role="group" aria-label="איפה">
                <Toggle label="בחלל" on={!rs.gravity} onChange={() => changeR((s) => ({ ...s, gravity: false }))} />
                <Toggle label="שיגור אנכי, עם כובד" on={rs.gravity} onChange={() => changeR((s) => ({ ...s, gravity: true }))} />
              </div>
            )}
            <Slider label="מהירות הפליטה u" value={rs.u} min={1000} max={4000} step={100} format={(x) => `${sci(x)} m/s`} onChange={(x) => changeR((s) => ({ ...s, u: roundTo(x, 100) }))} />
            <Slider label="קצב השריפה μ" value={rs.rate} min={5} max={500} step={5} format={(x) => `${sci(x)} kg/s`} onChange={(x) => changeR((s) => ({ ...s, rate: roundTo(x, 5) }))} />
            <Slider label="מסה התחלתית m₀" value={rs.m0} min={4000} max={20000} step={500} format={(x) => `${sci(x)} kg`} onChange={(x) => changeR((s) => ({ ...s, m0: roundTo(x, 500) }))} />
            <Slider label="מסה בסוף השריפה m₁" value={rs.m1} min={500} max={rs.m0 - 500} step={500} format={(x) => `${sci(x)} kg`} onChange={(x) => changeR((s) => ({ ...s, m1: roundTo(x, 500) }))} />
            <Slider label="זמן" value={Number(shown.toPrecision(4))} min={0} max={Number(tEnd.toPrecision(4))} step={niceUp(tEnd / 500)} format={(x) => `${sci(x)} s`} onChange={scrub} />
            <div class="group" role="group" aria-label="שיגור">
              <button type="button" class="btn primary" onClick={launch}>
                שגרו
              </button>
              <button type="button" class="btn ghost" onClick={() => setRuns([])}>
                נקו עקומות
              </button>
            </div>
            <div class="group" role="group" aria-label="מה להציג">
              <Toggle label="כוחות" on={show.forces} swatch="var(--force)" onChange={(on) => setShow((s) => ({ ...s, forces: on }))} />
              <Toggle label="המערכת של הגזירה" on={show.boundary} swatch="var(--momentum)" onChange={(on) => setShow((s) => ({ ...s, boundary: on }))} />
            </div>
          </>
        ) : (
          <>
            {props.modeToggle && (
              <div class="group" role="group" aria-label="מה קורה לעגלה">
                <Toggle label="כוח דוחף" on={ss.mode === 'pushed'} onChange={() => changeS((s) => ({ ...s, mode: 'pushed' }))} />
                <Toggle label="בלי כוח" on={ss.mode === 'coast'} onChange={() => changeS((s) => ({ ...s, mode: 'coast' }))} />
                <Toggle label="חול נשפך" on={ss.mode === 'leak'} onChange={() => changeS((s) => ({ ...s, mode: 'leak' }))} />
              </div>
            )}
            <Slider label={ss.mode === 'pushed' ? 'מהירות העגלה' : 'מהירות התחלתית'} value={ss.v} min={1} max={5} step={0.5} format={(x) => `${sci(x)} m/s`} onChange={(x) => changeS((s) => ({ ...s, v: roundTo(x, 0.5) }))} />
            <Slider label="קצב החול" value={ss.rate} min={1} max={10} step={0.5} format={(x) => `${sci(x)} kg/s`} onChange={(x) => changeS((s) => ({ ...s, rate: roundTo(x, 0.5) }))} />
            <Slider label="זמן" value={Number(shown.toPrecision(3))} min={0} max={SAND_T} step={0.1} format={(x) => `${sci(x)} s`} onChange={scrub} />
            <div class="group" role="group" aria-label="הרצה">
              <button type="button" class="btn primary" onClick={launch}>
                הריצו
              </button>
            </div>
            <div class="group" role="group" aria-label="מה להציג">
              {ss.mode === 'pushed' && <Toggle label="כוח" on={show.forces} swatch="var(--force)" onChange={(on) => setShow((s) => ({ ...s, forces: on }))} />}
              {ss.mode === 'leak' && <Toggle label={<>החיזוי של <bdi dir="ltr">F = d(Mv)/dt</bdi></>} on={show.blind} onChange={(on) => setShow((s) => ({ ...s, blind: on }))} />}
            </div>
          </>
        )
      }
    />
  );
}
