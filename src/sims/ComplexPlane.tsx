/**
 * ComplexPlane (lesson 0.6): complex numbers as points and arrows, and oscillations as the shadows of rotating
 * arrows.
 *
 * Mode "polar": a draggable number z = x + iy on a grid (Re to the right, Im up). Dashed legs show x and y; an arc
 * shows the argument φ, and the readout gives |z|, φ and, beside it, the calculator's arctan(y/x), which is wrong by
 * 180° whenever x < 0. "צמוד" adds the mirror image z̄ = x − iy.
 * Mode "multiply": two draggable numbers z and w and their product zw (accent). Arcs show arg z, arg w and arg zw,
 * which is their sum; the readout compares |zw| with |z||w|. Buttons set w = i, w = −1 or w = z̄.
 * Mode "rotate": the complex amplitude Ã (a dashed, draggable arrow) and the arrow Ãe^(iωt), ω = 1 rad/s, turning
 * as time runs; its shadow on the real axis is x(t) = Re(Ãe^(iωt)), traced against t on the side plot. "מהירות"
 * adds the arrow iωÃe^(iωt), a quarter turn ahead, and its shadow v(t), dashed, on the plot.
 * Mode "sum": Ã₁ = A₁ (real) and Ã₂ = A₂e^(iΔφ), both turning with e^(iωt), drawn head to tail, and their sum
 * (accent). The plot shows x₁(t), x₂(t) and x₁ + x₂.
 *
 * Physics: src/physics/complexnum.ts. Tasks tick only inside the learner's own handlers (drag, button, slider,
 * toggle), never when a text step sets the figure.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { cabs, carg, cis, cmul, complex, conj, derivativeAmplitude, reAt, sumAmplitude, type Complex } from '~/physics/complexnum';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, withAlpha } from './core/ink';
import { drawAxes, drawCurve, insetBox, makePlot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Mode = 'polar' | 'multiply' | 'rotate' | 'sum';
type Handle = 'z' | 'w' | 'amp';
type Pt = [number, number];

const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  'second-quadrant': `גררו את z לרביע השני (חלק ממשי שלילי, מדומה חיובי). השוו את ${ltr('φ')} ל-${ltr('arctan(y/x)')}.`,
  conjugate: `הדליקו "צמוד". איפה ${ltr('z̄')} ביחס ל-z, ומה הזווית שלו?`,
  'times-i': `במצב כפל: קבעו ${ltr('w = i')}. מה קורה לחץ של z?`,
  'real-product': 'במצב כפל: מצאו z ו-w, שאף אחד מהם לא ממשי, שהמכפלה שלהם ממשית.',
  velocity: 'הדליקו "מהירות". כמה לפני ההעתק מגיעה המהירות לשיא?',
  'start-zero': `גררו את ${ltr('Ã')} כך שהתנודה תתחיל מ-${ltr('x(0) = 0')}.`,
  cancel: 'במצב חיבור: קבעו שתי אמפליטודות שוות והפרש פאזה שבו התנודות מבטלות זו את זו.',
  quarter: `במצב חיבור: קבעו הפרש פאזה של רבע מחזור, ${ltr('Δφ = 90°')}, והשוו את האמפליטודה לסכום ${ltr('A₁ + A₂')}.`,
};

const MODE_LABEL: Record<Mode, string> = { polar: 'מספר', multiply: 'כפל', rotate: 'תנודה', sum: 'חיבור תנודות' };

export interface ComplexPlaneProps {
  id: string;
  mode?: Mode;
  /** the mode buttons shown (default: the starting mode only) */
  modes?: Mode[];
  z?: Pt;
  w?: Pt;
  conj?: boolean;
  /** rotate: the complex amplitude Ã */
  amp?: Pt;
  vel?: boolean;
  /** sum: the two amplitudes and the phase difference [deg] */
  A1?: number;
  A2?: number;
  dphi?: number;
  /** time [s], ω = 1 rad/s */
  t?: number;
  tasks?: string[];
}

interface Setup {
  mode: Mode;
  z: Pt;
  w: Pt;
  conj: boolean;
  amp: Pt;
  vel: boolean;
  A1: number;
  A2: number;
  dphi: number;
  t: number;
}

const OMEGA = 1; // rad/s
const T_MAX = 4 * Math.PI; // two periods
const SNAP = 0.5;
const LIM: Record<Handle, number> = { z: 3.5, w: 2, amp: 2.5 };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const pt = (x: unknown): Pt | null => (Array.isArray(x) && x.length === 2 && num(x[0]) !== null && num(x[1]) !== null ? [x[0] as number, x[1] as number] : null);
const snap = (x: number) => Math.round(x / SNAP) * SNAP;
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
const deg = (r: number) => (r * 180) / Math.PI;
const TAU = 2 * Math.PI;
const fmt = (x: number, sig = 3) => (Math.abs(x) < 5e-4 ? '0' : sci(x, sig).replace('-', '−'));
const C = (p: Pt): Complex => complex(p[0], p[1]);
/** "a + bi", "−bi", "a" */
function cstr(z: Complex): string {
  const re = Math.abs(z.re) < 5e-4 ? 0 : z.re;
  const im = Math.abs(z.im) < 5e-4 ? 0 : z.im;
  const imPart = (v: number) => (Math.abs(v) === 1 ? 'i' : `${fmt(Math.abs(v))}i`);
  if (im === 0) return fmt(re);
  if (re === 0) return `${im < 0 ? '−' : ''}${imPart(im)}`;
  return `${fmt(re)} ${im < 0 ? '−' : '+'} ${imPart(im)}`;
}
const argDeg = (z: Complex) => (cabs(z) < 1e-9 ? 0 : deg(carg(z)));

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

function dashed(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 1.2) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** An arc at (cx, cy) from angle `from` to `to` (math angles, counter-clockwise positive). */
function angleArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, from: number, to: number, color: string, width = 1.6) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -from, -to, to > from);
  ctx.stroke();
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, paper: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = paper;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

interface PlaneMap {
  cx: number;
  cy: number;
  /** px per unit */
  s: number;
}

export default function ComplexPlane(props: ComplexPlaneProps) {
  const startMode: Mode = props.mode ?? 'polar';
  const modes: Mode[] = props.modes ?? [startMode];
  const split = startMode === 'rotate' || startMode === 'sum';
  const initial = (): Setup => ({
    mode: startMode,
    z: props.z ?? [2, 1.5],
    w: props.w ?? [1, 1],
    conj: props.conj ?? false,
    amp: props.amp ?? [2, 0],
    vel: props.vel ?? false,
    A1: clamp(props.A1 ?? 2, 0, 2.5),
    A2: clamp(props.A2 ?? 1.5, 0, 2.5),
    dphi: clamp(props.dphi ?? 60, 0, 360),
    t: clamp(props.t ?? 0, 0, T_MAX),
  });
  const [setup, setSetup] = useState<Setup>(initial);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState('');
  const [selected, setSelected] = useState<Handle | null>(null);
  const drag = useRef<Handle | null>(null);
  const plane = useRef<PlaneMap | null>(null);
  const t0 = useRef<{ wall: number; t: number } | null>(null);
  const tNow = useRef(setup.t);

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setPlaying(false);
        t0.current = null;
        setSetup((prev) => {
          const mode = typeof st.mode === 'string' && modes.includes(st.mode as Mode) ? (st.mode as Mode) : prev.mode;
          const next: Setup = {
            mode,
            z: pt(st.z) ?? prev.z,
            w: pt(st.w) ?? prev.w,
            conj: bool(st.conj) ?? prev.conj,
            amp: pt(st.amp) ?? prev.amp,
            vel: bool(st.vel) ?? prev.vel,
            A1: clamp(num(st.A1) ?? prev.A1, 0, 2.5),
            A2: clamp(num(st.A2) ?? prev.A2, 0, 2.5),
            dphi: clamp(num(st.dphi) ?? prev.dphi, 0, 360),
            t: clamp(num(st.t) ?? prev.t, 0, T_MAX),
          };
          tNow.current = next.t;
          return next;
        });
      }),
    [props.id],
  );

  const z = C(setup.z);
  const w = C(setup.w);
  const zw = cmul(z, w);
  const amp = C(setup.amp);
  const a2 = cmul(complex(setup.A2), cis((setup.dphi * Math.PI) / 180));
  const sumA = sumAmplitude(setup.A1, setup.A2, (setup.dphi * Math.PI) / 180);
  const sumPhase = argDeg({ re: setup.A1 + a2.re, im: a2.im });

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const narrow = view.w < 520;
    const fs = narrow ? 12 : 13;
    const font = (w8: number, size = fs, it = true) => `${it ? 'italic ' : ''}${w8} ${size}px ${p.fontUi}`;

    // time now
    let tt = setup.t;
    if (playing) {
      if (t0.current === null) t0.current = { wall: t, t: setup.t };
      tt = (t0.current.t + (t - t0.current.wall)) % T_MAX;
    }
    tNow.current = tt;
    const rot = cis(OMEGA * tt);

    // boxes: the plane alone, or the plane beside (above) the time plot
    const top = narrow ? 34 : 0; // the stage's tool buttons sit over the top edge on a phone
    const planeBox = !split
      ? { x: 0, y: top, w: view.w, h: view.h - top }
      : narrow
        ? { x: 0, y: top, w: view.w, h: view.h * 0.56 - top }
        : { x: 0, y: 0, w: view.w * 0.5, h: view.h };
    const sideBox = narrow ? { x: 0, y: view.h * 0.56, w: view.w, h: view.h * 0.44 } : { x: view.w * 0.5, y: 0, w: view.w * 0.5, h: view.h };

    // the half-range E of the plane, in units
    let E = 3;
    if (setup.mode === 'polar') E = 4;
    else if (setup.mode === 'multiply') E = Math.max(2.5, 1.12 * Math.max(cabs(z), cabs(w), cabs(zw)));
    else if (setup.mode === 'rotate') E = Math.max(2.5, 1.15 * Math.max(cabs(amp), setup.vel ? OMEGA * cabs(amp) : 0));
    else E = Math.max(2.5, 1.12 * (setup.A1 + setup.A2));
    const cx = planeBox.x + planeBox.w / 2;
    const cy = planeBox.y + planeBox.h / 2;
    const s = Math.max(1, (Math.min(planeBox.w, planeBox.h) / 2 - 14) / E);
    plane.current = { cx, cy, s };
    const X = (v: number) => cx + v * s;
    const Y = (v: number) => cy - v * s;

    // grid
    const step = E > 6 ? 2 : 1;
    const nx = Math.floor((planeBox.w / 2) / s / step) * step;
    const ny = Math.floor((planeBox.h / 2) / s / step) * step;
    ctx.save();
    ctx.strokeStyle = withAlpha(p.rule, 0.7);
    ctx.lineWidth = 1;
    for (let g = -nx; g <= nx; g += step) {
      if (g === 0) continue;
      ctx.beginPath();
      ctx.moveTo(X(g), planeBox.y + 2);
      ctx.lineTo(X(g), planeBox.y + planeBox.h - 2);
      ctx.stroke();
    }
    for (let g = -ny; g <= ny; g += step) {
      if (g === 0) continue;
      ctx.beginPath();
      ctx.moveTo(planeBox.x + 2, Y(g));
      ctx.lineTo(planeBox.x + planeBox.w - 2, Y(g));
      ctx.stroke();
    }
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(planeBox.x + 4, cy);
    ctx.lineTo(planeBox.x + planeBox.w - 8, cy);
    ctx.moveTo(cx, planeBox.y + planeBox.h - 4);
    ctx.lineTo(cx, planeBox.y + 8);
    ctx.stroke();
    ctx.restore();
    arrow(ctx, planeBox.x + planeBox.w - 14, cy, planeBox.x + planeBox.w - 4, cy, { color: p.ink2, width: 1.3, head: 7 });
    arrow(ctx, cx, planeBox.y + 14, cx, planeBox.y + 4, { color: p.ink2, width: 1.3, head: 7 });
    haloText(ctx, p, 'Re', planeBox.x + planeBox.w - 6, cy + 13, { font: font(600), color: p.ink2, align: 'right' });
    haloText(ctx, p, 'Im', cx + 8, planeBox.y + 10, { font: font(600), color: p.ink2, align: 'left' });
    // tick numbers, kept clear of the axis names at the right and top edges
    for (let g = -nx; g <= nx; g += step) {
      if (g !== 0 && X(g) - planeBox.x > 12 && planeBox.x + planeBox.w - X(g) > 30) haloText(ctx, p, fmt(g), X(g), cy + 11, { font: font(400, fs - 2, false), color: p.ink3 });
    }
    for (let g = -ny; g <= ny; g += step) {
      if (g !== 0 && Y(g) - planeBox.y > 24 && planeBox.y + planeBox.h - Y(g) > 10) haloText(ctx, p, `${fmt(g)}i`, cx - 6, Y(g), { font: font(400, fs - 2, false), color: p.ink3, align: 'right' });
    }

    const handleRing = (h: Handle, x: number, y: number) => {
      if (selected !== h) return;
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, TAU);
      ctx.stroke();
      ctx.restore();
    };
    const tag = (text: string, at: Complex, color: string, off = 14) => {
      const a = cabs(at) > 1e-9 ? carg(at) : Math.PI / 4;
      haloText(ctx, p, text, X(at.re) + off * Math.cos(a), Y(at.im) - off * Math.sin(a), { font: font(700, fs + 1), color });
    };

    if (setup.mode === 'polar') {
      const zx = X(z.re);
      const zy = Y(z.im);
      dashed(ctx, zx, zy, cx, zy, p.ink2);
      // the legs of the right triangle: x along the real axis, then y straight up (or down) to z
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = withAlpha(p.velocity, 0.75);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(zx, cy);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(p.accel, 0.75);
      ctx.beginPath();
      ctx.moveTo(zx, cy);
      ctx.lineTo(zx, zy);
      ctx.stroke();
      ctx.restore();
      if (Math.abs(z.re) > 0.4) haloText(ctx, p, `x = ${fmt(z.re)}`, (cx + zx) / 2, cy + (z.im >= 0 ? 16 : -16), { font: font(700), color: p.velocity });
      if (Math.abs(z.im) > 0.4) haloText(ctx, p, `y = ${fmt(z.im)}`, zx + (z.re >= 0 ? 10 : -10), (cy + zy) / 2, { font: font(700), color: p.accel, align: z.re >= 0 ? 'left' : 'right' });
      if (cabs(z) > 1e-9) {
        const phi = carg(z);
        angleArc(ctx, cx, cy, Math.min(34, 0.45 * cabs(z) * s), 0, phi, p.accent, 2);
        const r = Math.min(34, 0.45 * cabs(z) * s) + 13;
        haloText(ctx, p, 'φ', cx + r * Math.cos(phi / 2), cy - r * Math.sin(phi / 2), { font: font(700, fs + 1), color: p.accent });
      }
      if (setup.conj) {
        const c = conj(z);
        arrow(ctx, cx, cy, X(c.re), Y(c.im), { color: p.equip, width: 2.2, head: 10 });
        dashed(ctx, zx, zy, X(c.re), Y(c.im), withAlpha(p.equip, 0.8));
        tag('z̄', c, p.equip);
      }
      arrow(ctx, cx, cy, zx, zy, { color: p.ink, width: 2.8, head: 12 });
      dot(ctx, zx, zy, 5.5, p.ink, p.paper);
      handleRing('z', zx, zy);
      tag('z', z, p.ink);
    } else if (setup.mode === 'multiply') {
      const showArcs = cabs(z) > 1e-9 && cabs(w) > 1e-9;
      if (showArcs) {
        const az = carg(z);
        const aw = carg(w);
        angleArc(ctx, cx, cy, 26, 0, az, p.ink, 2);
        angleArc(ctx, cx, cy, 38, 0, aw, p.equip, 2);
        angleArc(ctx, cx, cy, 50, 0, az + aw, p.accent, 2);
      }
      arrow(ctx, cx, cy, X(zw.re), Y(zw.im), { color: p.accent, width: 3, head: 12 });
      arrow(ctx, cx, cy, X(w.re), Y(w.im), { color: p.equip, width: 2.4, head: 11 });
      arrow(ctx, cx, cy, X(z.re), Y(z.im), { color: p.ink, width: 2.6, head: 11 });
      dot(ctx, X(z.re), Y(z.im), 5.5, p.ink, p.paper);
      dot(ctx, X(w.re), Y(w.im), 5.5, p.equip, p.paper);
      handleRing('z', X(z.re), Y(z.im));
      handleRing('w', X(w.re), Y(w.im));
      tag('z', z, p.ink);
      tag('w', w, p.equip);
      tag('zw', zw, p.accent, 18);
    } else if (setup.mode === 'rotate') {
      const zt = cmul(amp, rot);
      // the complex amplitude Ã: dashed, draggable
      if (cabs(amp) > 1e-9) {
        dashed(ctx, cx, cy, X(amp.re), Y(amp.im), withAlpha(p.ink2, 0.9), 1.6);
        dot(ctx, X(amp.re), Y(amp.im), 5, withAlpha(p.ink2, 0.9), p.paper);
        if (tt > 0.05) tag('Ã', amp, p.ink2);
      }
      handleRing('amp', X(amp.re), Y(amp.im));
      // the unit circle of the motion
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink3, 0.6);
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, cabs(amp) * s, 0, TAU);
      ctx.stroke();
      ctx.restore();
      if (setup.vel && cabs(amp) > 1e-9) {
        const vt = cmul(derivativeAmplitude(amp, OMEGA), rot);
        arrow(ctx, cx, cy, X(vt.re), Y(vt.im), { color: p.velocity, width: 2.4, head: 10 });
        dashed(ctx, X(vt.re), Y(vt.im), X(vt.re), cy, withAlpha(p.velocity, 0.8));
        dot(ctx, X(vt.re), cy, 4.5, p.velocity, p.paper);
        tag('ż', vt, p.velocity, 14);
      }
      if (cabs(amp) > 1e-9) {
        dashed(ctx, X(zt.re), Y(zt.im), X(zt.re), cy, withAlpha(p.accent, 0.9));
        arrow(ctx, cx, cy, X(zt.re), Y(zt.im), { color: p.ink, width: 2.8, head: 12 });
        dot(ctx, X(zt.re), cy, 5, p.accent, p.paper);
        haloText(ctx, p, 'x', X(zt.re), cy + (zt.im >= 0 ? 16 : -16), { font: font(700, fs + 1), color: p.accent });
        tag(tt > 0.05 ? 'z' : 'z = Ã', zt, p.ink, tt > 0.05 ? 14 : 24);
      }
    } else {
      // sum: head to tail
      const z1 = cmul(complex(setup.A1), rot);
      const z2 = cmul(a2, rot);
      const zs = { re: z1.re + z2.re, im: z1.im + z2.im };
      if (setup.A1 > 0) arrow(ctx, cx, cy, X(z1.re), Y(z1.im), { color: p.ink2, width: 2.4, head: 10 });
      if (setup.A2 > 0) arrow(ctx, X(z1.re), Y(z1.im), X(zs.re), Y(zs.im), { color: p.equip, width: 2.4, head: 10 });
      if (cabs(zs) > 1e-6) arrow(ctx, cx, cy, X(zs.re), Y(zs.im), { color: p.accent, width: 3, head: 12 });
      else dot(ctx, cx, cy, 5, p.accent, p.paper);
      dashed(ctx, X(zs.re), Y(zs.im), X(zs.re), cy, withAlpha(p.accent, 0.9));
      dot(ctx, X(zs.re), cy, 5, p.accent, p.paper);
      if (setup.A1 > 0) haloText(ctx, p, '1', X(z1.re / 2) - 10 * Math.sin(carg(z1)), Y(z1.im / 2) - 10 * Math.cos(carg(z1)), { font: font(700), color: p.ink2 });
      if (setup.A2 > 0) {
        const mid = { re: z1.re + z2.re / 2, im: z1.im + z2.im / 2 };
        haloText(ctx, p, '2', X(mid.re) - 10 * Math.sin(carg(z2)), Y(mid.im) - 10 * Math.cos(carg(z2)), { font: font(700), color: p.equip });
      }
      if (cabs(zs) > 1e-6) tag('Ã₁ + Ã₂', zs, p.accent, 20);
    }

    /* ---- the time plot */
    if (split) {
      const yMax = setup.mode === 'rotate' ? Math.max(1, 1.12 * Math.max(cabs(amp), setup.vel ? OMEGA * cabs(amp) : 0)) : Math.max(1, 1.12 * (setup.A1 + setup.A2));
      const plot = makePlot(
        // on a wide stage the tool buttons sit over the plot's top right corner: start the plot below them
        insetBox(sideBox, { l: narrow ? 40 : 46, r: 14, t: narrow ? 20 : 50, b: 42 }),
        { min: 0, max: T_MAX, label: 't (s)' + String.fromCharCode(0x200e), ticks: [0, 2, 4, 6, 8, 10, 12], format: (v) => fmt(v) },
        { min: -yMax, max: yMax, label: setup.mode === 'rotate' && setup.vel ? 'x, v' : 'x', format: (v) => fmt(v) },
      );
      drawAxes(ctx, plot, p);
      if (setup.mode === 'rotate') {
        if (setup.vel) drawCurve(ctx, plot, (u) => reAt(derivativeAmplitude(amp, OMEGA), OMEGA, u), { color: p.velocity, width: 1.8, dash: [5, 4], samples: 240 });
        drawCurve(ctx, plot, (u) => reAt(amp, OMEGA, u), { color: p.accent, width: 2.6, samples: 240 });
        dot(ctx, plot.px(tt), plot.py(reAt(amp, OMEGA, tt)), 5, p.accent, p.paper);
        if (setup.vel) dot(ctx, plot.px(tt), plot.py(reAt(derivativeAmplitude(amp, OMEGA), OMEGA, tt)), 4.5, p.velocity, p.paper);
      } else {
        const a1c = complex(setup.A1);
        const sc = { re: setup.A1 + a2.re, im: a2.im };
        drawCurve(ctx, plot, (u) => reAt(a1c, OMEGA, u), { color: withAlpha(p.ink2, 0.85), width: 1.6, samples: 240 });
        drawCurve(ctx, plot, (u) => reAt(a2, OMEGA, u), { color: withAlpha(p.equip, 0.9), width: 1.6, samples: 240 });
        drawCurve(ctx, plot, (u) => reAt(sc, OMEGA, u), { color: p.accent, width: 2.8, samples: 240 });
        dot(ctx, plot.px(tt), plot.py(reAt(sc, OMEGA, tt)), 5, p.accent, p.paper);
      }
      dashed(ctx, plot.px(tt), plot.box.y, plot.px(tt), plot.box.y + plot.box.h, withAlpha(p.ink3, 0.8));
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1, animate: playing });
  useEffect(invalidate, [setup, playing, selected]);

  const [aspect, setAspect] = useState(split ? 1.6 : 1.45);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const narrow = el.getBoundingClientRect().width < 520;
      setAspect(split ? (narrow ? 0.72 : 1.6) : narrow ? 0.95 : 1.45);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [aspect]);

  /** The learner changed the figure: apply, then tick whatever the new state completes. */
  const apply = (patch: Partial<Setup>) => {
    const next = { ...setup, ...patch };
    setSetup(next);
    const nz = C(next.z);
    const nw = C(next.w);
    const prod = cmul(nz, nw);
    if (next.mode === 'polar' && 'z' in patch && nz.re < 0 && nz.im > 0) done('second-quadrant');
    if (next.mode === 'polar' && patch.conj === true) done('conjugate');
    if (next.mode === 'multiply' && ('w' in patch || 'z' in patch) && nw.re === 0 && nw.im === 1 && cabs(nz) > 0) done('times-i');
    if (next.mode === 'multiply' && ('w' in patch || 'z' in patch) && nz.im !== 0 && nw.im !== 0 && Math.abs(prod.im) < 1e-9 && cabs(prod) > 0) done('real-product');
    if (next.mode === 'rotate' && patch.vel === true) done('velocity');
    if (next.mode === 'rotate' && 'amp' in patch && next.amp[0] === 0 && next.amp[1] !== 0) done('start-zero');
    if (next.mode === 'sum' && next.A1 > 0 && next.A1 === next.A2 && next.dphi === 180) done('cancel');
    if (next.mode === 'sum' && 'dphi' in patch && next.dphi === 90 && next.A1 > 0 && next.A2 > 0) done('quarter');
  };

  const stop = () => {
    if (playing) setSetup((s) => ({ ...s, t: roundTo(tNow.current, 0.05) }));
    setPlaying(false);
    t0.current = null;
  };

  const handles = (): Handle[] => (setup.mode === 'polar' ? ['z'] : setup.mode === 'multiply' ? ['z', 'w'] : setup.mode === 'rotate' ? ['amp'] : []);
  const posOf = (h: Handle): Pt => (h === 'z' ? setup.z : h === 'w' ? setup.w : setup.amp);
  const keyOf = (h: Handle): 'z' | 'w' | 'amp' => h;

  const moveTo = (h: Handle, x: number, y: number) => {
    const L = setup.mode === 'multiply' ? LIM.w : LIM[h];
    const q: Pt = [clamp(snap(x), -L, L), clamp(snap(y), -L, L)];
    const cur = posOf(h);
    if (q[0] === cur[0] && q[1] === cur[1]) return;
    apply({ [keyOf(h)]: q } as Partial<Setup>);
  };

  const onPointerDown = (e: PointerEvent) => {
    const m = plane.current;
    if (!m) return;
    let best: Handle | null = null;
    let bd = 22;
    for (const h of handles()) {
      const [x, y] = posOf(h);
      const d = Math.hypot(m.cx + x * m.s - e.offsetX, m.cy - y * m.s - e.offsetY);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    setSelected(best);
    if (!best) return;
    stop();
    drag.current = best;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const m = plane.current;
    const h = drag.current;
    if (!m || !h) return;
    moveTo(h, (e.offsetX - m.cx) / m.s, (m.cy - e.offsetY) / m.s);
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe());
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const hs = handles();
    if (hs.length === 0) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const i = selected ? hs.indexOf(selected) : -1;
      const next = hs[(i + 1) % hs.length];
      setSelected(next);
      setLive(`נבחר ${next === 'amp' ? 'Ã' : next}.`);
      return;
    }
    const dirs: Record<string, Pt> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const h = selected && hs.includes(selected) ? selected : hs[0];
    setSelected(h);
    stop();
    const [x, y] = posOf(h);
    moveTo(h, x + d[0] * SNAP, y + d[1] * SNAP);
  };

  const play = () => {
    if (!motionAllowed()) {
      setLive('מצב שקט: התנועה לא מוצגת. הזיזו את הזמן בפס.');
      return;
    }
    t0.current = null;
    setPlaying(true);
  };

  function describe(): string {
    if (setup.mode === 'polar') return `z = ${cstr(z)}, הגודל ${fmt(cabs(z))}, הזווית ${fmt(argDeg(z))} מעלות.`;
    if (setup.mode === 'multiply') return `z = ${cstr(z)}, w = ${cstr(w)}, המכפלה zw = ${cstr(zw)}, בגודל ${fmt(cabs(zw))} ובזווית ${fmt(argDeg(zw))} מעלות.`;
    if (setup.mode === 'rotate') return `האמפליטודה המרוכבת ${cstr(amp)}: אמפליטודה ${fmt(cabs(amp))} ופאזה ${fmt(argDeg(amp))} מעלות.`;
    return `סכום שתי תנודות: אמפליטודה ${fmt(sumA)}.`;
  }

  const phaseRad = cabs(amp) > 1e-9 ? carg(amp) : 0;
  const label =
    setup.mode === 'polar'
      ? `איור חי: המישור המרוכב והמספר z = ${cstr(z)}, בגודל ${fmt(cabs(z))} ובזווית ${fmt(argDeg(z))} מעלות מהציר הממשי.`
      : setup.mode === 'multiply'
        ? `איור חי: המכפלה של z = ${cstr(z)} ו-w = ${cstr(w)} היא ${cstr(zw)}. הגדלים מוכפלים והזוויות מתחברות.`
        : setup.mode === 'rotate'
          ? `איור חי: החץ Ã כפול e בחזקת iωt מסתובב, והצל שלו על הציר הממשי הוא התנודה, באמפליטודה ${fmt(cabs(amp))}.`
          : `איור חי: שתי תנודות באותה תדירות כחצים ראש לזנב. האמפליטודה של הסכום ${fmt(sumA)}.`;

  const tReadout = (
    <span class="q" data-readout="t">
      t = <b>{fmt(roundTo(playing ? tNow.current : setup.t, 0.05))} s</b>
    </span>
  );

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      cursor={setup.mode === 'sum' ? 'default' : 'grab'}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onReset={() => {
        setSetup(initial());
        setPlaying(false);
        setSelected(null);
        t0.current = null;
        tNow.current = initial().t;
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        setup.mode === 'polar' ? (
          <>
            <span class="q" data-readout="z">
              z = <b>{cstr(z)}</b>
            </span>
            <span class="q" data-readout="mod">
              |z| = <b>{fmt(cabs(z))}</b>
            </span>
            <span class="q" data-readout="arg">
              φ = arg z = <b>{fmt(cabs(z) > 1e-9 ? carg(z) : 0)} rad = {fmt(argDeg(z))}°</b>
            </span>
            <span class="q" data-readout="atan">
              arctan(y/x) = <b>{z.re === 0 ? '—' : `${fmt(deg(Math.atan(z.im / z.re)))}°`}</b>
            </span>
            {setup.conj && (
              <span class="q" data-readout="conj">
                z̄ = <b>{cstr(conj(z))}</b>, zz̄ = <b>{fmt(cabs(z) ** 2)}</b>
              </span>
            )}
          </>
        ) : setup.mode === 'multiply' ? (
          <>
            <span class="q" data-readout="zw">
              ({cstr(z)})({cstr(w)}) = <b>{cstr(zw)}</b>
            </span>
            <span class="q" data-readout="mods">
              |z||w| = {fmt(cabs(z))}·{fmt(cabs(w))} = <b>{fmt(cabs(zw))}</b>
            </span>
            <span class="q" data-readout="args">
              arg z + arg w = {fmt(argDeg(z))}° + {fmt(argDeg(w))}° = <b>{fmt(argDeg(z) + argDeg(w))}°</b>
            </span>
            <span class="q" data-readout="argzw">
              arg zw = <b>{fmt(argDeg(zw))}°</b>
              {cabs(zw) > 1e-9 && Math.round((argDeg(z) + argDeg(w) - argDeg(zw)) / 360) !== 0 && (
                <> (= {fmt(argDeg(z) + argDeg(w))}° {argDeg(z) + argDeg(w) > argDeg(zw) ? '−' : '+'} 360°)</>
              )}
            </span>
          </>
        ) : setup.mode === 'rotate' ? (
          <>
            <span class="q" data-readout="amp">
              Ã = <b>{cstr(amp)}</b>
            </span>
            <span class="q" data-readout="x">
              x(t) = <b>{fmt(cabs(amp))} cos(t {phaseRad < 0 ? '−' : '+'} {fmt(Math.abs(phaseRad))})</b>
            </span>
            {tReadout}
          </>
        ) : (
          <>
            <span class="q" data-readout="sum">
              |Ã₁ + Ã₂| = <b>{fmt(sumA)}</b>
            </span>
            <span class="q" data-readout="phase">
              arg(Ã₁ + Ã₂) = <b>{sumA < 1e-6 ? '—' : `${fmt(sumPhase)}°`}</b>
            </span>
            {tReadout}
          </>
        )
      }
      controls={
        <>
          {modes.length > 1 && (
            <div class="group" role="group" aria-label="מה מציג האיור">
              {modes.map((m) => (
                <Toggle
                  key={m}
                  label={MODE_LABEL[m]}
                  on={setup.mode === m}
                  onChange={() => {
                    stop();
                    setSelected(null);
                    apply({ mode: m });
                  }}
                />
              ))}
            </div>
          )}
          {setup.mode === 'polar' && (
            <div class="group" role="group" aria-label="מה להציג">
              <Toggle label="צמוד" on={setup.conj} swatch="var(--equip)" onChange={(on) => apply({ conj: on })} />
            </div>
          )}
          {setup.mode === 'multiply' && (
            <div class="group" role="group" aria-label="ערכים מוכנים של w">
              <button type="button" class="btn" onClick={() => apply({ w: [0, 1] })}>
                <bdi dir="ltr">w = i</bdi>
              </button>
              <button type="button" class="btn" onClick={() => apply({ w: [-1, 0] })}>
                <bdi dir="ltr">w = −1</bdi>
              </button>
              <button type="button" class="btn" onClick={() => apply({ w: [clamp(setup.z[0], -2, 2), clamp(-setup.z[1], -2, 2)] })}>
                <bdi dir="ltr">w = z̄</bdi>
              </button>
            </div>
          )}
          {setup.mode === 'rotate' && (
            <div class="group" role="group" aria-label="מה להציג">
              <Toggle label="מהירות" on={setup.vel} swatch="var(--velocity)" onChange={(on) => apply({ vel: on })} />
            </div>
          )}
          {setup.mode === 'sum' && (
            <>
              <Slider label="האמפליטודה A₁" value={setup.A1} min={0} max={2.5} step={0.25} format={(x) => fmt(x)} onChange={(v) => apply({ A1: clamp(roundTo(v, 0.25), 0, 2.5) })} />
              <Slider label="האמפליטודה A₂" value={setup.A2} min={0} max={2.5} step={0.25} format={(x) => fmt(x)} onChange={(v) => apply({ A2: clamp(roundTo(v, 0.25), 0, 2.5) })} />
              <Slider label="הפרש הפאזה Δφ" value={setup.dphi} min={0} max={360} step={15} format={(x) => `${fmt(x)}°`} onChange={(v) => apply({ dphi: clamp(roundTo(v, 15), 0, 360) })} />
            </>
          )}
          {split && (
            <>
              <Slider
                label="הזמן t"
                value={roundTo(playing ? tNow.current : setup.t, 0.05)}
                min={0}
                max={roundTo(T_MAX, 0.05)}
                step={0.05}
                format={(x) => `${fmt(x)} s`}
                onChange={(v) => {
                  setPlaying(false);
                  t0.current = null;
                  apply({ t: clamp(roundTo(v, 0.05), 0, T_MAX) });
                }}
              />
              <div class="group" role="group" aria-label="הפעלה">
                <button type="button" class="btn primary" onClick={play}>
                  הפעלה
                </button>
                {playing && (
                  <button type="button" class="btn" onClick={stop}>
                    עצירה
                  </button>
                )}
              </div>
            </>
          )}
        </>
      }
    />
  );
}
