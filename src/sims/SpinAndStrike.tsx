/**
 * SpinAndStrike (lesson 8.6): the angular momentum of a rigid body and its conservation, in two modes.
 *
 * mode 'spin' — a platform (a uniform disc) on a frictionless vertical axle, seen from above, with two equal
 * weights on rails along a diameter, tied by strings to the axle. The learner moves the weights in and out (a
 * slider for their radius r) and can drop a ring, at rest, onto the turning platform. Nothing outside turns the
 * platform, so L = Iω stays; the bars show L split between platform and ring, and the energy account
 * K = K₀ + W − Q: W the work of the strings so far, Q the heat of the ring's slip.
 *
 * mode 'strike' — a rod on a smooth table, seen from above, either pinned at its top end or free; a puck slides
 * along +x and hits it a distance s below the top end, sticking or elastically. After the hit a multiflash
 * (strobe) shows the motion. Bars compare the momentum, the angular momentum about the pin P (or about O, the
 * fixed point where the free rod's centre was at the hit) and the kinetic energy, before and after. A pinned rod
 * shows the pin's impulse J_P as a force-coloured arrow on the rod at the pin; a free rod marks the point at rest
 * just after the hit.
 *
 * Every number comes from src/physics/rigidangular.ts (which imports rigidbody.ts). Tasks tick only in the
 * learner's own handlers (sliders, toggles, buttons); a text step sets the state but never calls a handler.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { disc as discInertia, ring as ringInertia } from '~/physics/rigidbody';
import { couple, coupleState, keFromL, pointAtRest, pullWork, strike, strikeState, turntableInertia, type Mount, type Strike, type StrikeResult } from '~/physics/rigidangular';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/* ---------------------------------------------------------------- the platform (mode 'spin') */
/** a uniform disc platform: 4.0 kg, radius 0.50 m */
const R_PLAT = 0.5;
const I_PLAT = discInertia(4.0, R_PLAT);
/** two weights of 1.0 kg on the rails */
const M_W = 1.0;
const N_W = 2;
const R_MIN = 0.1;
const R_MAX = 0.45;
/** the start: weights at 0.45 m, turning at 2.0 rad/s */
const OMEGA0 = 2.0;
const L_SPIN = turntableInertia(I_PLAT, M_W, R_MAX, N_W) * OMEGA0;
const K_START = keFromL(L_SPIN, turntableInertia(I_PLAT, M_W, R_MAX, N_W));
/** the ring: 2.0 kg, radius 0.48 m; friction torque between ring and platform while it slips [N·m] */
const R_RING = 0.48;
const I_RING = ringInertia(2.0, R_RING);
const TAU_SLIP = 0.6;
/** the energy bars' full scale: the largest K the platform can reach (weights in, no ring) */
const K_SCALE = keFromL(L_SPIN, turntableInertia(I_PLAT, M_W, R_MIN, N_W)) * 1.05;

/* ---------------------------------------------------------------- the rod (mode 'strike') */
const ROD_M = 1.5;
const ROD_L = 1.2;
const PUCK_V = 4.0;
const PM_MIN = 0.1;
const PM_MAX = 1.5;
/** where the puck starts before the hit [m from the rod] and the most physics time a strobe shows [s] */
const APPROACH = 0.7;
const T_SHOW = 1.0;
/** a launch plays in slow motion: real seconds per physics second */
const SLOW = 2;
/** the table's world window [m] */
const WX0 = -0.85;
const WX1 = 1.55;
const WY0 = -0.75;
const WY1 = 0.75;

const NARROW_W = 520;
const isNarrow = (w: number) => w > 0 && w < NARROW_W;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 1e-9) => (Math.abs(x) <= tiny ? '0' : sci(Number(x.toPrecision(12)), 3).replace('-', '−'));
/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  pull: `משכו את המשקולות עד ${ltr('r = 0.10 m')}. מה קורה ל-${ltr('ω')}, ל-${ltr('Lz')} ול-${ltr('K')}?`,
  out: 'אחרי שמשכתם פנימה, הרחיקו את המשקולות שוב החוצה. מה עושה העבודה של החוטים עכשיו?',
  ring: 'הפילו את הטבעת על הבמה המסתובבת. מה נשמר בזמן שהיא מחליקה, ומה הולך לאיבוד?',
  pin: 'שגרו את הדסקית אל המוט הנעוץ בציר. מה קורה לתנע, ומה לתנע הזוויתי סביב P?',
  free: 'החליפו למוט חופשי ושגרו. מה נשמר עכשיו? ומה עושה הקצה העליון של המוט?',
  percussion: `במוט הנעוץ, חפשו נקודת פגיעה ${ltr('s')} שבה הציר לא מפעיל מתקף.`,
  elastic: 'החליפו להתנגשות אלסטית ושגרו. מה קורה עכשיו לאנרגיה הקינטית?',
};

export type Mode = 'spin' | 'strike';
export type Shown = 'before' | 'after';

export interface SpinAndStrikeProps {
  id: string;
  mode: Mode;
  /** spin: the weights' radius [m] and whether the ring lies (settled) on the platform */
  r?: number;
  ring?: boolean;
  /** strike: pinned or free, sticking (false) or elastic, hit point s below the top end [m], puck mass [kg] */
  mount?: Mount;
  elastic?: boolean;
  s?: number;
  m?: number;
  /** strike: show the setup before the hit, or the multiflash after it */
  shown?: Shown;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

type RingPhase = 'none' | 'slipping' | 'on';
interface SpinState {
  r: number;
  ring: RingPhase;
  /** the work of the strings and the heat of the ring's slip so far [J] */
  W: number;
  Q: number;
  /** the platform's moment of inertia and angular velocity when the ring was dropped */
  dropI: number;
  dropW: number;
}

interface StrikeSetup {
  mount: Mount;
  elastic: boolean;
  s: number;
  m: number;
}

/** The platform's moment of inertia (weights, without the ring). */
const platformI = (r: number) => turntableInertia(I_PLAT, M_W, r, N_W);
/** The whole turning body's moment of inertia when the ring turns with it. */
const totalI = (st: SpinState) => platformI(st.r) + (st.ring === 'on' ? I_RING : 0);

/**
 * A spin state as a text step describes it: the weights at r; with the ring, the ring was dropped with the weights
 * at their start (0.45 m) and they moved to r afterwards.
 */
function spinStateOf(r: number, withRing: boolean): SpinState {
  if (!withRing) return { r, ring: 'none', W: pullWork(L_SPIN, platformI(R_MAX), platformI(r)), Q: 0, dropI: 0, dropW: 0 };
  const c = couple(platformI(R_MAX), OMEGA0, I_RING, 0);
  return { r, ring: 'on', W: pullWork(L_SPIN, platformI(R_MAX) + I_RING, platformI(r) + I_RING), Q: c.heat, dropI: platformI(R_MAX), dropW: OMEGA0 };
}

const strikeOf = (st: StrikeSetup): Strike => ({ m: st.m, v: PUCK_V, M: ROD_M, L: ROD_L, s: st.s, mount: st.mount, e: st.elastic ? 1 : 0 });

/** How long a strobe runs: until 1 s, a quarter turn of the rod, or (a free rod) the window's edge. */
function showTime(S: Strike, r: StrikeResult): number {
  let T = T_SHOW;
  const w = Math.abs(r.omega);
  if (w > 1e-9) T = Math.min(T, Math.PI / 2 / w);
  if (S.mount === 'free' && Math.abs(r.u) > 1e-9) T = Math.min(T, 0.9 / Math.abs(r.u));
  return T;
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
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** The sign convention in the top-left corner: counter-clockwise is positive (z out of the page). */
function signGlyph(ctx: CanvasRenderingContext2D, p: Palette, fs: number) {
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
  const tx = Math.sin(a);
  const ty = -Math.cos(a);
  arrow(ctx, ex - tx * 5, ey - ty * 5, ex + tx * 2, ey + ty * 2, { color: p.ink2, width: 1.4, head: 6 });
  haloText(ctx, p, '+', cx, cy + 1, { font: `700 ${fs}px ${p.fontUi}`, color: p.ink2 });
}

interface Bar {
  value: number;
  color: string;
  name: string;
  /** a dashed tick at a reference value (the start) */
  tick?: number;
  /** the name in Hebrew (drawn right-to-left) */
  he?: boolean;
}

/** A panel of bars with a title, a unit and a zero line; signed panels put zero in the middle. */
function barPanel(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  o: { x0: number; w: number; top: number; bottom: number; title: string; unit: string; bars: Bar[]; maxV: number; signed: boolean; fs: number; narrow: boolean },
) {
  const { x0, w, top, bottom, bars, fs } = o;
  const cx = x0 + w / 2;
  heText(ctx, p, o.title, cx, top + 8, fs + 1, p.ink);
  haloText(ctx, p, o.unit, cx, top + 8 + fs + 3, { font: `${fs - 1}px ${p.fontUi}`, color: p.ink2 });
  const nameY = bottom - 6;
  const areaTop = top + 24 + fs;
  const areaBot = nameY - fs - 4;
  const margin = o.narrow ? 6 : 14;
  const slot = (w - 2 * margin) / bars.length;
  const bw = Math.min(28, slot * 0.46);
  const valH = fs + 4;
  const zeroY = o.signed ? (areaTop + areaBot) / 2 : areaBot - valH;
  const k = (zeroY - areaTop - valH) / Math.max(1e-9, o.maxV);
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0 + margin * 0.5, zeroY);
  ctx.lineTo(x0 + w - margin * 0.5, zeroY);
  ctx.stroke();
  ctx.restore();
  bars.forEach((b, i) => {
    const bx = x0 + margin + slot * (i + 0.5);
    const hv = b.value * k;
    ctx.save();
    ctx.fillStyle = b.color;
    ctx.fillRect(bx - bw / 2, Math.min(zeroY, zeroY - hv), bw, Math.abs(hv));
    ctx.restore();
    if (b.tick !== undefined) {
      const ys = zeroY - b.tick * k;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(bx - bw / 2 - 5, ys);
      ctx.lineTo(bx + bw / 2 + 5, ys);
      ctx.stroke();
      ctx.restore();
    }
    const vy = hv >= 0 ? zeroY - hv - valH / 2 : zeroY - hv + valH / 2;
    haloText(ctx, p, signed(b.value, 5e-4 * o.maxV), bx, vy, { font: `600 ${fs - 1}px ${p.fontUi}`, color: p.ink });
    if (b.he) heText(ctx, p, b.name, bx, nameY, fs - 1, p.ink);
    else haloText(ctx, p, b.name, bx, nameY, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink });
  });
}

export default function SpinAndStrike(props: SpinAndStrikeProps) {
  const mode = props.mode;
  /* ------------------------------------------------ state */
  const initialSpin = (): SpinState => spinStateOf(clamp(props.r ?? R_MAX, R_MIN, R_MAX), props.ring ?? false);
  const initialStrike = (): StrikeSetup => ({
    mount: props.mount ?? 'pivot',
    elastic: props.elastic ?? false,
    s: clamp(props.s ?? ROD_L, 0, ROD_L),
    m: clamp(props.m ?? 0.3, PM_MIN, PM_MAX),
  });
  const [spin, setSpin] = useState<SpinState>(initialSpin);
  const [setup, setSetup] = useState<StrikeSetup>(initialStrike);
  const [shown, setShown] = useState<Shown>(props.shown ?? 'before');
  const [flying, setFlying] = useState<{ n: number; setup: StrikeSetup } | null>(null);
  const [live, setLive] = useState('');
  const [narrowStage, setNarrowStage] = useState(false);
  /** the platform's and the ring's drawn angles, integrated frame by frame; the time of the last frame */
  const phase = useRef({ plat: 0, ring: 0, last: -1 });
  /** the frame time at which the ring was dropped, or a launch started */
  const t0 = useRef<number | null>(null);
  const count = useRef(0);
  const settled = useRef(0);
  /** the weights went in to 0.20 m or closer (for the task 'out') */
  const wentIn = useRef(false);

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  const S = useMemo(() => strikeOf(setup), [setup.mount, setup.elastic, setup.s, setup.m]);
  const res = useMemo(() => strike(S), [S]);

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        if (mode === 'spin') {
          const r = clamp(num(st.r) ?? R_MAX, R_MIN, R_MAX);
          setSpin(spinStateOf(r, bool(st.ring) ?? false));
          t0.current = null;
        } else {
          setSetup((prev) => ({
            mount: st.mount === 'pivot' || st.mount === 'free' ? st.mount : prev.mount,
            elastic: bool(st.elastic) ?? prev.elastic,
            s: clamp(num(st.s) ?? prev.s, 0, ROD_L),
            m: clamp(num(st.m) ?? prev.m, PM_MIN, PM_MAX),
          }));
          setFlying(null);
          setShown(st.shown === 'after' ? 'after' : 'before');
        }
      }),
    [props.id],
  );

  /* ------------------------------------------------ the spin: the ring's slip at time t after the drop */
  const slipAt = (st: SpinState, t: number) => coupleState(st.dropI, st.dropW, I_RING, 0, TAU_SLIP, t);
  const settleRing = (st: SpinState): SpinState => {
    const c = couple(st.dropI, st.dropW, I_RING, 0);
    return { ...st, ring: 'on', Q: st.Q + c.heat };
  };

  /** The platform's and the ring's angular velocities, and the heat so far, at frame time t. */
  const spinNow = (st: SpinState, t: number) => {
    if (st.ring === 'slipping') {
      const el = t0.current === null ? 0 : Math.max(0, t - t0.current);
      const sl = slipAt(st, el);
      const K = 0.5 * st.dropI * sl.omega1 * sl.omega1 + 0.5 * I_RING * sl.omega2 * sl.omega2;
      const Kdrop = 0.5 * st.dropI * st.dropW * st.dropW;
      return { wPlat: sl.omega1, wRing: sl.omega2, Q: st.Q + (Kdrop - K), K, done: !sl.slipping };
    }
    const w = L_SPIN / totalI(st);
    return { wPlat: w, wRing: st.ring === 'on' ? w : 0, Q: st.Q, K: keFromL(L_SPIN, totalI(st)), done: true };
  };

  /* ------------------------------------------------ drawing */
  const drawSpin = (ctx: CanvasRenderingContext2D, view: FrameInfo['view'], p: Palette, t: number) => {
    const narrow = isNarrow(view.w);
    const fs = narrow ? 10 : 12;
    const now = spinNow(spin, t);
    if (spin.ring === 'slipping' && now.done && settled.current !== count.current) {
      settled.current = count.current;
      // settle on the next tick, outside the draw
      queueMicrotask(() => {
        setSpin((s) => (s.ring === 'slipping' ? settleRing(s) : s));
        setLive('הטבעת מסתובבת עכשיו יחד עם הבמה.');
      });
    }
    // integrate the drawn angles
    const ph = phase.current;
    const dt = ph.last < 0 ? 0 : Math.max(0, Math.min(0.05, t - ph.last));
    ph.last = t;
    ph.plat += now.wPlat * dt;
    ph.ring += now.wRing * dt;

    const worldH = Math.round(view.h * (narrow ? 0.56 : 0.6));
    // before the first measurement the view can be 0 px tall: keep every radius positive (ctx.arc throws otherwise)
    const Rpx = Math.max(1, Math.min(view.w * 0.42, (worldH - 30) * 0.47));
    const ppm = Rpx / R_PLAT;
    const cx = view.w / 2;
    const cy = 14 + worldH / 2;
    const S2 = (x: number, y: number): [number, number] => [cx + x * ppm, cy - y * ppm];
    signGlyph(ctx, p, fs);

    // the platform
    ctx.save();
    ctx.fillStyle = p.paper2;
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, Rpx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    const a = ph.plat;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    // a mark on the platform's rim, to see it turn
    {
      const [x1, y1] = S2(0.9 * R_PLAT * -uy, 0.9 * R_PLAT * ux);
      const [x2, y2] = S2(R_PLAT * -uy, R_PLAT * ux);
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }
    // the rails, along a diameter
    const railHalf = 0.035;
    ctx.save();
    ctx.strokeStyle = p.equip || p.ink3;
    ctx.lineWidth = 1.4;
    for (const side of [-1, 1]) {
      const ox = -uy * railHalf * side;
      const oy = ux * railHalf * side;
      const [x1, y1] = S2(-0.47 * ux + ox, -0.47 * uy + oy);
      const [x2, y2] = S2(0.47 * ux + ox, 0.47 * uy + oy);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
    // the ring
    if (spin.ring !== 'none') {
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink, 0.75);
      ctx.lineWidth = Math.max(4, 0.03 * ppm);
      ctx.beginPath();
      ctx.arc(cx, cy, R_RING * ppm, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // a notch on the ring
      const ra = ph.ring;
      const [nx, ny] = S2(R_RING * Math.cos(ra + 2.4), R_RING * Math.sin(ra + 2.4));
      ctx.save();
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(nx, ny, Math.max(4, 0.025 * ppm), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // the hub (the axle)
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(4, 0.03 * ppm), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // the weights, their strings, the strings' pull and their velocity
    const w = now.wPlat;
    const half = Math.max(6, 0.04 * ppm);
    for (const side of [1, -1]) {
      const bx = side * spin.r * ux;
      const by = side * spin.r * uy;
      const [px, py] = S2(bx, by);
      // the string, from the weight's inner face to the hub
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px - side * ux * half, py + side * uy * half);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.restore();
      // the weight: a square along the rail
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-a);
      ctx.fillStyle = p.ink;
      ctx.fillRect(-half, -half, 2 * half, 2 * half);
      ctx.restore();
      // the string's pull on the weight (the net radial force of its circle): inward, from the weight
      const T = M_W * w * w * spin.r;
      // 0.1 m per newton, but never past the hub (near the axle the arrow keeps its minimum length)
      const lenT = Math.max(12, Math.min(0.1 * ppm * T, spin.r * ppm - half - 8));
      const dirx = -side * ux;
      const diry = side * uy; // screen y is flipped
      arrow(ctx, px, py, px + dirx * lenT, py + diry * lenT, { color: p.force, width: 2.2, head: 8 });
      // the velocity: ω r, perpendicular to the rail, counter-clockwise (0.25 m per m/s)
      const vlen = Math.max(14, 0.25 * ppm * Math.abs(w) * spin.r);
      const vx = -side * uy;
      const vy = -side * ux; // ẑ × (side·û) on screen
      arrow(ctx, px, py, px + vx * vlen, py + vy * vlen, { color: p.velocity, width: 2.2, head: 8 });
      if (side === 1) {
        // T beside its arrow, on the side away from the velocity
        haloText(ctx, p, 'T', px + (dirx * lenT) / 2 - vx * (half + 8), py + (diry * lenT) / 2 - vy * (half + 8), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force });
        haloText(ctx, p, 'v', px + vx * (vlen + 9), py + vy * (vlen + 9), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.velocity });
      }
    }
    if (spin.ring === 'slipping') handNote(ctx, 'הטבעת מחליקה', view.w / 2, 14, p, narrow ? 12 : 14);

    /* the bars */
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, worldH + 20);
    ctx.lineTo(view.w - 8, worldH + 20);
    ctx.moveTo(view.w / 2, worldH + 28);
    ctx.lineTo(view.w / 2, view.h - 8);
    ctx.stroke();
    ctx.restore();
    const Lp = platformI(spin.r) * now.wPlat;
    const Lr = spin.ring === 'none' ? 0 : I_RING * now.wRing;
    const panelTop = worldH + 22;
    barPanel(ctx, p, {
      x0: 0,
      w: view.w / 2,
      top: panelTop,
      bottom: view.h,
      title: 'תנע זוויתי סביב הציר',
      unit: 'kg·m²/s',
      bars: [
        { value: Lp, color: p.momentum, name: 'במה', he: true, tick: L_SPIN },
        { value: Lr, color: withAlpha(p.momentum, 0.55), name: 'טבעת', he: true, tick: 0 },
        { value: Lp + Lr, color: p.ink2, name: 'סה״כ', he: true, tick: L_SPIN },
      ],
      maxV: L_SPIN * 1.1,
      signed: false,
      fs,
      narrow,
    });
    barPanel(ctx, p, {
      x0: view.w / 2,
      w: view.w / 2,
      top: panelTop,
      bottom: view.h,
      title: 'אנרגיה',
      unit: 'J',
      bars: [
        { value: now.K, color: p.energyK, name: 'K', tick: K_START },
        { value: spin.W, color: p.force, name: 'W', tick: 0 },
        { value: now.Q, color: p.energyTh, name: 'Q', tick: 0 },
      ],
      maxV: K_SCALE,
      signed: false,
      fs,
      narrow,
    });
  };

  const drawStrike = (ctx: CanvasRenderingContext2D, view: FrameInfo['view'], p: Palette, t: number) => {
    const narrow = isNarrow(view.w);
    const fs = narrow ? 10 : 12;
    const st = flying ? flying.setup : setup;
    const SS = flying ? strikeOf(flying.setup) : S;
    const rr = flying ? strike(SS) : res;
    const Tshow = showTime(SS, rr);

    // the physics time shown: negative before the hit
    let now = shown === 'after' ? Tshow : -APPROACH / PUCK_V;
    if (flying) {
      if (t0.current === null) t0.current = t;
      now = (t - t0.current) / SLOW - APPROACH / PUCK_V;
      if (now >= Tshow && settled.current !== flying.n) {
        settled.current = flying.n;
        queueMicrotask(() => {
          setFlying(null);
          setShown('after');
          setLive('הפגיעה הסתיימה. האיור מראה את התנועה בצילום הבזקים.');
        });
      }
      now = Math.min(now, Tshow);
    }

    const worldH = Math.round(view.h * (narrow ? 0.56 : 0.6));
    const ppm = Math.max(0.01, Math.min((view.w - 16) / (WX1 - WX0), (worldH - 34) / (WY1 - WY0)));
    const x0 = (view.w - ppm * (WX1 - WX0)) / 2 - ppm * WX0;
    const y0 = 30 + (worldH - 34 - ppm * (WY1 - WY0)) / 2 + ppm * WY1;
    const X = (x: number) => x0 + ppm * x;
    const Y = (y: number) => y0 - ppm * y;
    signGlyph(ctx, p, fs);
    const yHit = ROD_L / 2 - st.s;

    // the reference point: the pin P, or O where the free rod's centre is at the hit
    const pivot = st.mount === 'pivot';
    const ref: [number, number] = pivot ? [0, ROD_L / 2] : [0, 0];

    const rodLine = (top: [number, number], bottom: [number, number], color: string, width: number) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(X(top[0]), Y(top[1]));
      ctx.lineTo(X(bottom[0]), Y(bottom[1]));
      ctx.stroke();
      ctx.restore();
    };
    const puckR = Math.max(5, 0.05 * ppm * Math.cbrt(st.m / 0.3));
    const puck = (x: number, y: number, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), puckR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // the puck's line before the hit
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink3, 0.8);
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(X(WX0), Y(yHit));
    ctx.lineTo(X(0), Y(yHit));
    ctx.stroke();
    ctx.restore();

    const rodW = Math.max(5, 0.045 * ppm);
    if (now <= 0) {
      // before the hit: the rod at rest, the puck on its way
      rodLine([0, ROD_L / 2], [0, -ROD_L / 2], p.ink2, rodW);
      const xp = Math.min(0, now * PUCK_V) - puckR / ppm;
      puck(xp, yHit, 1);
      const vlen = Math.max(16, 0.1 * ppm * PUCK_V);
      arrow(ctx, X(xp), Y(yHit), X(xp) + vlen, Y(yHit), { color: p.velocity, width: 2.2, head: 8 });
      haloText(ctx, p, 'v', X(xp) + vlen / 2, Y(yHit) - 11, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.velocity });
    } else {
      // after: a multiflash of the rod and the puck, the last image solid
      const nGhost = 5;
      for (let i = 0; i < nGhost; i++) {
        const tt = (i / nGhost) * now;
        const g = strikeState(SS, rr, tt);
        rodLine(g.top, g.bottom, withAlpha(p.ink2, 0.12 + 0.1 * i), rodW * 0.8);
        puck(g.particle[0] + (SS.e === 0 ? 0 : -puckR / ppm), g.particle[1], 0.15 + 0.08 * i);
      }
      const g = strikeState(SS, rr, now);
      rodLine(g.top, g.bottom, p.ink2, rodW);
      puck(g.particle[0] + (SS.e === 0 ? 0 : -puckR / ppm), g.particle[1], 1);
      // the rod's centre
      haloText(ctx, p, '+', X(g.centre[0]), Y(g.centre[1]), { font: `700 ${fs + 2}px ${p.fontUi}`, color: p.accent });
    }

    // the rod at the instant of the hit: what happens just after
    if (now > 0 || shown === 'after') {
      // the velocity of the rod's centre just after
      const c0: [number, number] = [0, 0];
      if (Math.abs(rr.u) > 1e-6) {
        const len = Math.max(14, 0.1 * ppm * Math.abs(rr.u));
        arrow(ctx, X(c0[0]), Y(c0[1]), X(c0[0]) + Math.sign(rr.u) * len, Y(c0[1]), { color: p.velocity, width: 2, head: 7, alpha: 0.9 });
      }
      // a free rod: the point at rest just after the hit
      if (!pivot) {
        const sr = pointAtRest(SS, rr);
        if (sr !== null && sr >= -1e-9 && sr <= ROD_L + 1e-9) {
          const yr = ROD_L / 2 - sr;
          ctx.save();
          ctx.strokeStyle = p.accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(X(0), Y(yr), Math.max(6, 0.04 * ppm), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          heText(ctx, p, 'במנוחה', X(0) + (narrow ? 34 : 40), Y(yr) - 12, fs, p.accent);
        }
      }
    }

    // the pin and its impulse, or the point O
    if (pivot) {
      const [px, py] = [X(ref[0]), Y(ref[1])];
      if (now > 0 || shown === 'after') {
        const JP = rr.pivotImpulse;
        if (Math.abs(JP) > 0.005) {
          const len = Math.max(14, 0.35 * ppm * Math.abs(JP));
          arrow(ctx, px, py, px + Math.sign(JP) * len, py, { color: p.force, width: 2.6, head: 9 });
          haloText(ctx, p, 'Jₚ', px + Math.sign(JP) * (len + 12), py - 2, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force });
        } else {
          haloText(ctx, p, 'Jₚ = 0', px + 30, py - 12, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force });
        }
      }
      ctx.save();
      ctx.fillStyle = p.paper;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(5, 0.03 * ppm), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      haloText(ctx, p, 'P', px - 13, py - 8, { font: `italic 700 ${fs + 2}px ${p.fontUi}` });
    } else {
      const [ox, oy] = [X(0), Y(0)];
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ox - 5, oy - 5);
      ctx.lineTo(ox + 5, oy + 5);
      ctx.moveTo(ox - 5, oy + 5);
      ctx.lineTo(ox + 5, oy - 5);
      ctx.stroke();
      ctx.restore();
      haloText(ctx, p, 'O', ox - 12, oy + 13, { font: `italic 700 ${fs + 2}px ${p.fontUi}` });
    }
    // the hit point and its distance s from the top end, measured on the left of the rod
    {
      const hx = X(0) - rodW / 2 - 12;
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, Y(ROD_L / 2));
      ctx.lineTo(hx, Y(yHit));
      ctx.moveTo(hx - 4, Y(ROD_L / 2));
      ctx.lineTo(hx + 4, Y(ROD_L / 2));
      ctx.stroke();
      ctx.restore();
      if (st.s > 0.12) haloText(ctx, p, 's', hx - 9, Y(ROD_L / 2 - 0.75 * st.s), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink2 });
    }

    /* the bars: before and after */
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, worldH + 4);
    ctx.lineTo(view.w - 8, worldH + 4);
    ctx.stroke();
    ctx.restore();
    const pw = view.w / 3;
    const pMax = Math.max(Math.abs(rr.p0), Math.abs(rr.p1)) * 1.1;
    const LMax = Math.max(Math.abs(rr.L0), Math.abs(rr.L1), 0.05) * 1.1;
    const KMax = Math.max(rr.K0, rr.K1) * 1.1;
    const pair = (b: number, a: number, color: string): Bar[] => [
      { value: b, color: withAlpha(color, 0.55), name: 'לפני', he: true },
      { value: a, color, name: 'אחרי', he: true },
    ];
    barPanel(ctx, p, { x0: 2 * pw, w: pw, top: worldH + 6, bottom: view.h, title: 'תנע', unit: 'kg·m/s', bars: pair(rr.p0, rr.p1, p.momentum), maxV: pMax, signed: true, fs, narrow });
    barPanel(ctx, p, {
      x0: pw,
      w: pw,
      top: worldH + 6,
      bottom: view.h,
      title: pivot ? 'תנע זוויתי סביב P' : 'תנע זוויתי סביב O',
      unit: 'kg·m²/s',
      bars: pair(rr.L0, rr.L1, p.accent),
      maxV: LMax,
      signed: true,
      fs,
      narrow,
    });
    barPanel(ctx, p, { x0: 0, w: pw, top: worldH + 6, bottom: view.h, title: 'אנרגיה קינטית', unit: 'J', bars: pair(rr.K0, rr.K1, p.energyK), maxV: KMax, signed: false, fs, narrow });
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.beginPath();
    for (const xx of [pw, 2 * pw]) {
      ctx.moveTo(xx, worldH + 12);
      ctx.lineTo(xx, view.h - 8);
    }
    ctx.stroke();
    ctx.restore();
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    if (mode === 'spin') drawSpin(ctx, view, p, t);
    else drawStrike(ctx, view, p, t);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: mode === 'spin' || flying !== null });
  useEffect(invalidate, [spin, setup, shown, flying]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrowStage(isNarrow(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------------------------ the learner's handlers */
  const moveWeights = (v: number) => {
    if (spin.ring === 'slipping') return;
    const r = clamp(roundTo(v, 0.01), R_MIN, R_MAX);
    if (r === spin.r) return;
    const W = spin.W + pullWork(L_SPIN, totalI(spin), totalI({ ...spin, r }));
    setSpin({ ...spin, r, W });
    if (r <= R_MIN + 1e-9) done('pull');
    if (r <= 0.2 + 1e-9) wentIn.current = true;
    if (wentIn.current && r >= 0.4 - 1e-9) done('out');
  };
  const dropRing = () => {
    if (spin.ring !== 'none') return;
    done('ring');
    const st: SpinState = { ...spin, ring: 'slipping', dropI: platformI(spin.r), dropW: L_SPIN / platformI(spin.r) };
    count.current += 1;
    t0.current = null;
    if (!motionAllowed()) {
      setSpin(settleRing(st));
      setLive('הטבעת מסתובבת עכשיו יחד עם הבמה.');
      return;
    }
    // the slip starts at the next frame's time
    t0.current = phase.current.last;
    setSpin(st);
    setLive('הטבעת מחליקה על הבמה.');
  };

  const changeSetup = (f: (s: StrikeSetup) => StrikeSetup) => {
    setFlying(null);
    setShown('before');
    setSetup((s) => f(s));
  };
  const fire = () => {
    const n = ++count.current;
    t0.current = null;
    if (setup.mount === 'pivot') done('pin');
    else done('free');
    if (setup.elastic) done('elastic');
    if (!motionAllowed()) {
      setFlying(null);
      setShown('after');
      setLive('הפגיעה הסתיימה. האיור מראה את התנועה בצילום הבזקים.');
      return;
    }
    setFlying({ n, setup: { ...setup } });
    setLive('הדסקית בדרך אל המוט.');
  };
  const moveHit = (v: number) => {
    const s = clamp(roundTo(v, 0.05), 0, ROD_L);
    changeSetup((x) => ({ ...x, s }));
    if (setup.mount === 'pivot') {
      const r = strike(strikeOf({ ...setup, s }));
      if (Math.abs(r.pivotImpulse) < 0.02 * r.p0) done('percussion');
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (mode === 'strike') fire();
    else dropRing();
  };

  const onReset = () => {
    setSpin(initialSpin());
    setSetup(initialStrike());
    setShown(props.shown ?? 'before');
    setFlying(null);
    t0.current = null;
    wentIn.current = false;
    setLive('האיור חזר למצב ההתחלה.');
  };

  /* ------------------------------------------------ readouts and controls */
  if (mode === 'spin') {
    const I = totalI(spin);
    const w = L_SPIN / I;
    const label = `איור חי: במה מסתובבת במבט מלמעלה, עם שתי משקולות על מסילות במרחק ${sci(spin.r)} מטר מהציר${spin.ring === 'none' ? '' : ' וטבעת עליה'}. מהירות זוויתית ${sci(w)} רדיאנים לשנייה. Enter מפיל את הטבעת.`;
    return (
      <SimShell
        fig={props.id}
        label={label}
        canvasRef={canvasRef}
        aspect={narrowStage ? 0.72 : 1.05}
        live={live}
        tasks={tasks}
        onKeyDown={onKeyDown}
        onReset={onReset}
        readout={
          spin.ring === 'slipping' ? (
            <span>הטבעת מחליקה על הבמה…</span>
          ) : (
            <>
              <span class="q" data-readout="r">
                r = <b>{signed(spin.r)} m</b>
              </span>
              <span class="q" data-readout="I">
                I = <b>{signed(I)} kg·m²</b>
              </span>
              <span class="q" data-readout="omega">
                ω = <b>{signed(w)} rad/s</b>
              </span>
              <span class="q" data-readout="L">
                L<sub>z</sub> = Iω = <b>{signed(L_SPIN)} kg·m²/s</b>
              </span>
              <span class="q" data-readout="K">
                K = <b>{signed(keFromL(L_SPIN, I))} J</b>
              </span>
              <span class="q" data-readout="W">
                W = <b>{signed(spin.W, 1e-6)} J</b>
              </span>
              <span class="q" data-readout="Q">
                Q = <b>{signed(spin.Q, 1e-6)} J</b>
              </span>
            </>
          )
        }
        controls={
          <>
            <Slider label="המרחק של המשקולות מהציר r" value={spin.r} min={R_MIN} max={R_MAX} step={0.01} format={(x) => `${sci(x)} m`} onChange={moveWeights} />
            <div class="group" role="group" aria-label="הטבעת">
              <button type="button" class="btn primary" onClick={dropRing} disabled={spin.ring !== 'none'}>
                הפילו את הטבעת
              </button>
            </div>
          </>
        }
      />
    );
  }

  const label = `איור חי: מוט על שולחן חלק במבט מלמעלה, ${setup.mount === 'pivot' ? 'נעוץ בציר בקצהו העליון' : 'חופשי'}. דסקית של ${sci(setup.m)} קילוגרם פוגעת בו ${setup.elastic ? 'באופן אלסטי' : 'ונדבקת'}, ${sci(setup.s)} מטר מתחת לקצה העליון. Enter משגר.`;
  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={narrowStage ? 0.8 : 1.1}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onReset={onReset}
      readout={
        flying ? (
          <span>הדסקית בדרך…</span>
        ) : (
          <>
            <span class="q" data-readout="omega">
              ω = <b>{signed(res.omega, 1e-9)} rad/s</b>
            </span>
            <span class="q" data-readout="u">
              v<sub>c</sub> = <b>{signed(res.u, 1e-9)} m/s</b>
            </span>
            <span class="q" data-readout="vAfter">
              v′ = <b>{signed(res.vAfter, 1e-9)} m/s</b>
            </span>
            {setup.mount === 'pivot' && (
              <span class="q" data-readout="JP">
                J<sub>P</sub> = <b>{signed(res.pivotImpulse, 1e-9)} N·s</b>
              </span>
            )}
            <span class="q" data-readout="p">
              p: <b>{signed(res.p0)}</b> → <b>{signed(res.p1)}</b> kg·m/s
            </span>
            <span class="q" data-readout="L">
              L<sub>{setup.mount === 'pivot' ? 'P' : 'O'}</sub>: <b>{signed(res.L0, 1e-9)}</b> → <b>{signed(res.L1, 1e-9)}</b> kg·m²/s
            </span>
            <span class="q" data-readout="K">
              K: <b>{signed(res.K0)}</b> → <b>{signed(res.K1)}</b> J
            </span>
          </>
        )
      }
      controls={
        <>
          <div class="group" role="group" aria-label="איך המוט מוחזק">
            <Toggle label="נעוץ בציר P" on={setup.mount === 'pivot'} onChange={() => changeSetup((s) => ({ ...s, mount: 'pivot' }))} />
            <Toggle label="חופשי" on={setup.mount === 'free'} onChange={() => changeSetup((s) => ({ ...s, mount: 'free' }))} />
          </div>
          <div class="group" role="group" aria-label="סוג ההתנגשות">
            <Toggle label="נדבקת" on={!setup.elastic} onChange={() => changeSetup((s) => ({ ...s, elastic: false }))} />
            <Toggle label="אלסטית" on={setup.elastic} onChange={() => changeSetup((s) => ({ ...s, elastic: true }))} />
          </div>
          <Slider label="נקודת הפגיעה, מתחת לקצה העליון s" value={setup.s} min={0} max={ROD_L} step={0.05} format={(x) => `${sci(x)} m`} onChange={moveHit} />
          <Slider label="מסת הדסקית m" value={setup.m} min={PM_MIN} max={PM_MAX} step={0.05} format={(x) => `${sci(x)} kg`} onChange={(v) => changeSetup((x) => ({ ...x, m: clamp(roundTo(v, 0.05), PM_MIN, PM_MAX) }))} />
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
