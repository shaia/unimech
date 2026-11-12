/**
 * HarmonicApprox (lesson 5.2): a potential U(x) near its minimum x₀ and the osculating parabola
 * U(x₀) + ½U″(x₀)(x − x₀)² drawn over it. The learner sets the mechanical energy E (a slider, or by dragging
 * the E line); the E line cuts the true curve at the turning points x₁, x₂ and the parabola at its own, and the
 * figure compares the true period T (src/physics/smallosc.ts, the energy integral) with the period of the
 * harmonic approximation T₀ = 2π√(m/U″(x₀)).
 *
 * Two particles move along the E line: the true one (a filled dot, RK4 under F = −dU/dx) and the "harmonic" one
 * (an open ring, x₀ ± A cos ω₀t on the parabola at the same energy), both released at rest on the same side.
 * The lower panel shows either their positions against time, x(t) (they drift apart when T ≠ T₀), or the kinetic
 * and potential energy of the true motion against time with their time averages ⟨K⟩ and ⟨U⟩.
 *
 * Tasks tick only in the learner's own handlers (the sliders, the release button, the pointer); a text step sets
 * the well, the energy, the panel and the instant shown, and never ticks anything.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { curvature, sampleAt, simulate, type Motion } from '~/physics/energy';
import { PENDULUM_L, WELLS, boundMotion, parabolaAt, smallOmega, timeAverages, type BoundMotion, type WellId } from '~/physics/smallosc';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { handNote, withAlpha } from './core/ink';
import { drawAxes, drawCurve, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Panel = 'x' | 'energy';

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  'k-equals-u': `הזיזו את פס הזמן לרגע שבו האנרגיה הקינטית שווה לפוטנציאלית, ${ltr('K = U')}. איפה הגוף אז?`,
  'double-amplitude': 'הגדילו את E עד שהאמפליטודה כפולה מזו שבהתחלה. פי כמה גדלה E?',
  averages: `בגרף האנרגיה: שחררו את הגוף, וקראו את הממוצעים ${ltr('⟨K⟩')} ו-${ltr('⟨U⟩')}. מה היחס ביניהם?`,
  'ten-percent': `במטוטלת: הרימו את E עד שזמן המחזור ארוך מ-${ltr('T₀')} ב-10%. מה האמפליטודה בזווית?`,
  lopsided: 'בבור דמוי המולקולה: הרימו את E עד שנקודת המפנה הימנית רחוקה מהמינימום פי 2 מהשמאלית.',
  shorter: `בבור המתקשה: מצאו אנרגיה שבה זמן המחזור קצר מ-${ltr('T₀')} ב-10% לפחות.`,
  drift: `שחררו כש-${ltr('T')} שונה מ-${ltr('T₀')} ביותר מ-5%, וצפו בגרף ${ltr('x(t)')} בשני החלקיקים נפרדים.`,
};

export interface HarmonicApproxProps {
  id: string;
  /** the well shown first, and the chips offered */
  well?: WellId;
  wells?: WellId[];
  /** the mechanical energy shown first [J] */
  E?: number;
  /** the lower panel: positions x(t) or energies K(t), U(t); whether the learner may switch it */
  panel?: Panel;
  panelToggle?: boolean;
  /** draw the parabola and the harmonic particle */
  parabola?: boolean;
  tasks?: string[];
}

interface Setup {
  well: WellId;
  E: number;
  panel: Panel;
  parabola: boolean;
}

interface Run {
  n: number;
  motion: Motion;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const isWell = (x: unknown): x is WellId => typeof x === 'string' && x in WELLS;
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 0) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));

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

function vline(ctx: CanvasRenderingContext2D, X: number, y1: number, y2: number, color: string, dash: number[], width = 1.1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(X, y1);
  ctx.lineTo(X, y2);
  ctx.stroke();
  ctx.restore();
}

function hline(ctx: CanvasRenderingContext2D, x1: number, x2: number, Y: number, color: string, dash: number[], width = 1.2) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, Y);
  ctx.lineTo(x2, Y);
  ctx.stroke();
  ctx.restore();
}

/** Everything the figure shows for one well and one energy. */
interface Model {
  well: WellId;
  E: number;
  x0: number;
  U0: number;
  k: number;
  w0: number;
  T0: number;
  bm: BoundMotion;
  /** the parabola's turning points at the same energy: x₀ ± a */
  a: number;
  /** the release point and side */
  xr: number;
  side: 1 | -1;
  tEnd: number;
  motion: Motion;
  avgK: number;
  avgU: number;
  parabola: (x: number) => number;
}

function modelOf(well: WellId, E: number): Model {
  const w = WELLS[well];
  const pot = w.potential;
  const x0 = w.x0;
  const U0 = pot.U(x0);
  const k = curvature(pot, x0);
  const w0 = smallOmega(pot, x0);
  const T0 = (2 * Math.PI) / w0;
  const bm = boundMotion(pot, x0, E) ?? { x1: x0, x2: x0, T: T0, T0 };
  const xr = w.side > 0 ? bm.x2 : bm.x1;
  const tEnd = 3 * T0;
  const motion = simulate(pot, { x0: xr, dt: T0 / 500, tEnd });
  const av = timeAverages(pot, E, bm.x1, bm.x2, U0, 2000);
  return {
    well,
    E,
    x0,
    U0,
    k,
    w0,
    T0,
    bm,
    a: Math.sqrt((2 * (E - U0)) / k),
    xr,
    side: w.side,
    tEnd,
    motion,
    avgK: av.K,
    avgU: av.U,
    parabola: parabolaAt(pot, x0),
  };
}

export default function HarmonicApprox(props: HarmonicApproxProps) {
  const offered: WellId[] = props.wells ?? [props.well ?? 'pendulum'];

  const initialSetup = (): Setup => {
    const well = props.well ?? offered[0];
    const w = WELLS[well];
    return { well, E: clamp(props.E ?? w.E, w.Emin, w.Emax), panel: props.panel ?? 'x', parabola: props.parabola ?? true };
  };

  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [time, setTime] = useState(0);
  const [flying, setFlying] = useState<Run | null>(null);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  const count = useRef(0);
  const landed = useRef(0);
  const grabbing = useRef(false);

  const m = useMemo(() => modelOf(setup.well, setup.E), [setup.well, setup.E]);
  const W = WELLS[setup.well];
  const pot = W.potential;

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the well, the energy, the panel, the parabola and the instant shown; they never release or tick
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setFlying(null);
        setSetup((prev) => {
          const well = isWell(st.well) ? st.well : prev.well;
          const w = WELLS[well];
          const panel: Panel = st.panel === 'x' || st.panel === 'energy' ? st.panel : prev.panel;
          return { well, E: clamp(num(st.E) ?? (well !== prev.well ? w.E : prev.E), w.Emin, w.Emax), panel, parabola: bool(st.parabola) ?? prev.parabola };
        });
        setTime(Math.max(0, num(st.t) ?? 0));
      }),
    [props.id],
  );

  const land = (r: Run) => {
    if (landed.current === r.n) return;
    landed.current = r.n;
    setFlying(null);
    setTime(m.tEnd);
    setLive(`הגוף נע שלושה זמני מחזור של הקירוב. זמן המחזור האמיתי ${sci(m.bm.T)} שניות, והקירוב נותן ${sci(m.T0)} שניות.`);
  };

  const fire = () => {
    const n = ++count.current;
    t0.current = null;
    const r: Run = { n, motion: m.motion };
    if (setup.panel === 'energy') done('averages');
    if (Math.abs(m.bm.T / m.T0 - 1) > 0.05) done('drift');
    if (!motionAllowed()) {
      land(r);
      return;
    }
    setFlying(r);
    setLive('הגוף נע.');
  };

  /* ---------------------------------------------------------------- drawing */

  const layout = (view: { w: number; h: number }) => {
    const narrow = view.w < 520;
    const topH = Math.round(view.h * 0.58);
    const top = makePlot(
      insetBox({ x: 0, y: 0, w: view.w, h: topH }, { l: narrow ? 44 : 54, r: 12, t: 16, b: 40 }),
      { min: W.view[0], max: W.view[1], label: 'המקום x (m)', format: (x) => sci(x, 2) },
      { min: pot.uRange[0], max: pot.uRange[1], label: 'אנרגיה (J)', format: (x) => sci(x, 2) },
    );
    const span = 1.18 * Math.max(Math.abs(m.bm.x1 - m.x0), Math.abs(m.bm.x2 - m.x0), m.a, 1e-6);
    const eTop = 1.12 * (m.E - m.U0);
    const bottomBox = insetBox({ x: 0, y: topH, w: view.w, h: view.h - topH }, { l: narrow ? 44 : 54, r: 12, t: 12, b: 40 });
    const bottom: Plot =
      setup.panel === 'x'
        ? makePlot(bottomBox, { min: 0, max: m.tEnd, label: 'הזמן t (s)', format: (x) => sci(x, 2) }, { min: -span, max: span, label: 'ההעתק x − x₀ (m)', format: (x) => sci(x, 2) })
        : makePlot(bottomBox, { min: 0, max: m.tEnd, label: 'הזמן t (s)', format: (x) => sci(x, 2) }, { min: 0, max: eTop, label: 'אנרגיה (J)', format: (x) => sci(x, 2) });
    return { top, bottom, narrow };
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const { top, bottom, narrow } = layout(view);
    const box = top.box;
    const fs = narrow ? 11 : 12;

    let now = clamp(time, 0, m.tEnd);
    if (flying) {
      if (t0.current === null) t0.current = t;
      const rate = Math.max(1, m.tEnd / 12);
      now = Math.min((t - t0.current) * rate, m.tEnd);
      if (now >= m.tEnd) land(flying);
    }
    const st = sampleAt(m.motion, now);
    const xg = m.x0 + m.side * m.a * Math.cos(m.w0 * now);

    /* ---------------- the top plot: U(x), the parabola, the E line */
    drawAxes(ctx, top, p);
    const clip = (b: { x: number; y: number; w: number; h: number }) => {
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
    };

    // the gap between the curve and the parabola, faintly
    if (setup.parabola) {
      ctx.save();
      clip(box);
      ctx.fillStyle = withAlpha(p.hand, 0.1);
      ctx.beginPath();
      const n = 240;
      const xs: number[] = [];
      for (let i = 0; i <= n; i++) xs.push(W.view[0] + ((W.view[1] - W.view[0]) * i) / n);
      const inDomain = (x: number) => x >= pot.domain[0] && x <= pot.domain[1];
      const cap = (y: number) => clamp(y, pot.uRange[0] - 1, pot.uRange[1] + 1);
      const valid = xs.filter(inDomain);
      valid.forEach((x, i) => (i === 0 ? ctx.moveTo(top.px(x), top.py(cap(pot.U(x)))) : ctx.lineTo(top.px(x), top.py(cap(pot.U(x))))));
      for (let i = valid.length - 1; i >= 0; i--) ctx.lineTo(top.px(valid[i]), top.py(cap(m.parabola(valid[i]))));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // the true curve, then the parabola dashed over it
    drawCurve(ctx, top, (x) => (x >= pot.domain[0] && x <= pot.domain[1] ? pot.U(x) : NaN), { color: p.energyP, width: 2.6, samples: 400 });
    if (setup.parabola) drawCurve(ctx, top, m.parabola, { color: p.ink2, width: 1.8, dash: [7, 5], samples: 300 });

    // the E line
    const yE = top.py(m.E);
    hline(ctx, box.x, box.x + box.w, yE, p.ink, [], 2);
    haloText(ctx, p, 'E', box.x + box.w - 6, yE - 10, { font: `italic 700 ${fs + 3}px ${p.fontUi}`, color: p.ink, align: 'right' });

    // the minimum: a dot on the curve, x₀ under it
    {
      const X = top.px(m.x0);
      vline(ctx, X, top.py(m.U0), box.y + box.h, p.ink3, [2, 3]);
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(X, top.py(m.U0), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // the parabola's turning points (open rings on the E line), then the true ones (dashed down, named)
    if (setup.parabola) {
      for (const s of [-1, 1]) {
        const X = top.px(m.x0 + s * m.a);
        if (X < box.x || X > box.x + box.w) continue;
        vline(ctx, X, yE, box.y + box.h, withAlpha(p.ink2, 0.7), [1.5, 3]);
        ctx.save();
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(X, yE, 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    const subs = ['₁', '₂'];
    [m.bm.x1, m.bm.x2].forEach((x, i) => {
      const X = top.px(x);
      vline(ctx, X, yE, box.y + box.h, p.ink, [4, 3], 1.3);
      const dx = i === 0 ? -8 : 8;
      haloText(ctx, p, `x${subs[i]}`, X + dx, box.y + box.h - 12, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink, align: i === 0 ? 'right' : 'left' });
    });

    // labels: U(x) at the upper left of the curve, the parabola on its right arm
    {
      const xl = W.view[0] + 0.08 * (W.view[1] - W.view[0]);
      const yU = clamp(top.py(pot.U(xl)), box.y + 12, box.y + box.h - 24);
      haloText(ctx, p, 'U(x)', top.px(xl) + 8, yU, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.energyP, align: 'left' });
      if (setup.parabola) {
        // where the parabola leaves the top of the plot on the right, or its right end
        // beside the parabola's right arm, on whichever side clears both curves and the E line by 12 px; scanned from
        // halfway up the plot downward, and never under the tool buttons at the top right
        const size = narrow ? 12 : 14;
        ctx.save();
        ctx.font = `500 ${size}px ${p.fontHand}`;
        const half = 0.5 * ctx.measureText('הפרבולה').width;
        ctx.restore();
        const xOf = (X: number) => W.view[0] + ((X - box.x) / box.w) * (W.view[1] - W.view[0]);
        const clearAt = (cx: number, cy: number) => {
          if (cx - half < box.x + 4 || cx + half > box.x + box.w - 4 || cy < box.y + 44 || cy > box.y + box.h - 16) return false;
          if (Math.abs(cy - yE) < 12) return false;
          for (let X = cx - half; X <= cx + half; X += 3) {
            const x = xOf(X);
            const yU = x >= pot.domain[0] && x <= pot.domain[1] ? top.py(pot.U(x)) : -1e9;
            if (Math.abs(yU - cy) < 12 || Math.abs(top.py(m.parabola(x)) - cy) < 12) return false;
          }
          return true;
        };
        let spot: [number, number] | null = null;
        for (let frac = 0.55; frac >= 0.12 && !spot; frac -= 0.03) {
          const u = m.U0 + frac * (pot.uRange[1] - m.U0);
          const X = top.px(m.x0 + Math.sqrt((2 * (u - m.U0)) / m.k));
          const Y = top.py(u);
          for (const dx of [-(half + 10), half + 10]) if (!spot && clearAt(X + dx, Y)) spot = [X + dx, Y];
        }
        if (spot) handNote(ctx, 'הפרבולה', spot[0], spot[1], p, size);
      }
    }

    // the two particles on the E line: the true one filled, the harmonic one open; the true one's K as a gap
    {
      const X = top.px(st.x);
      ctx.save();
      ctx.strokeStyle = p.energyK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(X, clamp(top.py(st.U), box.y, box.y + box.h));
      ctx.lineTo(X, yE);
      ctx.stroke();
      ctx.restore();
      if (setup.parabola) {
        ctx.save();
        ctx.strokeStyle = p.ink2;
        ctx.fillStyle = withAlpha(p.paper, 0.85);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(top.px(xg), yE, narrow ? 7 : 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.fillStyle = p.accent;
      ctx.strokeStyle = p.paper;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(X, yE, narrow ? 5.5 : 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    /* ---------------- the lower panel */
    drawAxes(ctx, bottom, p);
    const bb = bottom.box;
    // the periods on the time axis: multiples of T₀ (dashed) and of T (solid accent ticks)
    for (let j = 1; j * m.T0 <= m.tEnd + 1e-9; j++) vline(ctx, bottom.px(j * m.T0), bb.y, bb.y + bb.h, withAlpha(p.ink2, 0.6), [3, 4]);
    for (let j = 1; j * m.bm.T <= m.tEnd + 1e-9; j++) vline(ctx, bottom.px(j * m.bm.T), bb.y + bb.h - 10, bb.y + bb.h, p.accent, [], 2.4);
    {
      const XT0 = bottom.px(m.T0);
      const XT = bottom.px(m.bm.T);
      const close = Math.abs(XT - XT0) < 26;
      haloText(ctx, p, 'T₀', XT0 + (close && XT < XT0 ? 12 : close ? -12 : 0), bb.y + 9, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2 });
      if (m.bm.T <= m.tEnd) haloText(ctx, p, 'T', XT + (close && XT < XT0 ? -10 : close ? 10 : 0), bb.y + bb.h - 18, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.accent });
    }
    const iEnd = Math.min(m.motion.samples.length - 1, Math.round((now / m.tEnd) * (m.motion.samples.length - 1)));
    const trace = (f: (i: number) => number, color: string, dash: number[], width: number) => {
      ctx.save();
      clip({ x: bb.x, y: bb.y - 2, w: bb.w, h: bb.h + 4 });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const stride = Math.max(1, Math.floor(m.motion.samples.length / 500));
      for (let i = 0; i <= iEnd; i += stride) {
        const s = m.motion.samples[i];
        const X = bottom.px(s.t);
        const Y = bottom.py(f(i));
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      ctx.restore();
    };
    if (setup.panel === 'x') {
      hline(ctx, bb.x, bb.x + bb.w, bottom.py(0), p.ink3, []);
      // the whole harmonic curve faint, the part up to now dashed and full
      if (setup.parabola) {
        drawCurve(ctx, bottom, (tt) => m.side * m.a * Math.cos(m.w0 * tt), { color: withAlpha(p.ink2, 0.25), width: 1.4, samples: 300 });
        trace((i) => m.side * m.a * Math.cos(m.w0 * m.motion.samples[i].t), p.ink2, [6, 4], 2);
      }
      drawCurve(ctx, bottom, (tt) => sampleAt(m.motion, tt).x - m.x0, { color: withAlpha(p.accent, 0.22), width: 1.6, samples: 300 });
      trace((i) => m.motion.samples[i].x - m.x0, p.accent, [], 2.6);
      ctx.save();
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(bottom.px(now), bottom.py(st.x - m.x0), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (setup.parabola) {
        ctx.save();
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(bottom.px(now), bottom.py(xg - m.x0), 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // K(t) and U(t) − U(x₀) of the true motion, the total, and the averages over a period
      hline(ctx, bb.x, bb.x + bb.w, bottom.py(m.E - m.U0), p.ink, [], 1.6);
      drawCurve(ctx, bottom, (tt) => sampleAt(m.motion, tt).K, { color: withAlpha(p.energyK, 0.25), width: 1.4, samples: 300 });
      drawCurve(ctx, bottom, (tt) => sampleAt(m.motion, tt).U - m.U0, { color: withAlpha(p.energyP, 0.25), width: 1.4, samples: 300 });
      trace((i) => m.motion.samples[i].K, p.energyK, [], 2.4);
      trace((i) => m.motion.samples[i].U - m.U0, p.energyP, [], 2.4);
      hline(ctx, bb.x, bb.x + bb.w, bottom.py(m.avgK), p.energyK, [2, 4], 1.4);
      hline(ctx, bb.x, bb.x + bb.w, bottom.py(m.avgU), p.energyP, [2, 4], 1.4);
      const tag = (s: string, y: number, color: string, dy: number) => haloText(ctx, p, s, bb.x + bb.w - 4, y + dy, { font: `italic 700 ${fs}px ${p.fontUi}`, color, align: 'right' });
      const yK = bottom.py(m.avgK);
      const yU = bottom.py(m.avgU);
      const apart = Math.abs(yK - yU) > 14;
      tag('⟨K⟩', yK, p.energyK, apart ? (yK < yU ? -8 : 8) : -8);
      tag('⟨U⟩', yU, p.energyP, apart ? (yU < yK ? -8 : 8) : 8);
      haloText(ctx, p, 'E', bb.x + 6, bottom.py(m.E - m.U0) - 8, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink, align: 'left' });
      vline(ctx, bottom.px(now), bb.y, bb.y + bb.h, withAlpha(p.ink, 0.5), [2, 2]);
    }
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1.3, worldHeight: 1, animate: flying !== null });
  useEffect(invalidate, [setup, time, flying, m]);

  const [aspect, setAspect] = useState(1.3);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 520 ? 0.72 : 1.3));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [aspect]);

  /* ---------------------------------------------------------------- input (every task ticks here) */

  const change = (f: (s: Setup) => Setup) => {
    setFlying(null);
    setTime(0);
    setSetup((s) => f(s));
  };

  /** The learner set a new energy: check the energy tasks against the motion at that energy. */
  const setE = (Ein: number) => {
    const E = clamp(roundTo(Ein, 0.01), W.Emin, W.Emax);
    change((s) => ({ ...s, E }));
    const bm = boundMotion(pot, W.x0, E);
    if (!bm) return;
    const ratio = bm.T / bm.T0;
    // the amplitude at the figure's starting energy (the same well)
    const start = boundMotion(pot, W.x0, initialSetup().E);
    if (setup.well === 'spring' && start && Math.abs((bm.x2 - W.x0) / (start.x2 - W.x0) - 2) < 0.02) done('double-amplitude');
    if (setup.well === 'pendulum' && ratio >= 1.1) done('ten-percent');
    if (setup.well === 'morse' && (bm.x2 - W.x0) / (W.x0 - bm.x1) >= 2) done('lopsided');
    if (setup.well === 'stiff' && ratio <= 0.9) done('shorter');
  };

  const setWell = (well: WellId) => {
    change((s) => ({ ...s, well, E: WELLS[well].E }));
  };

  const scrub = (tt: number) => {
    setFlying(null);
    const t = clamp(tt, 0, m.tEnd);
    setTime(t);
    const s = sampleAt(m.motion, t);
    const Urel = s.U - m.U0;
    if (t > 0 && Math.abs(s.K - Urel) < 0.03 * (m.E - m.U0)) done('k-equals-u');
  };

  const onPointerDown = (e: PointerEvent) => {
    const view = viewRef.current;
    if (!view) return;
    const { top } = layout(view);
    const b = top.box;
    if (e.offsetX < b.x - 10 || e.offsetX > b.x + b.w + 10 || e.offsetY < b.y - 10 || e.offsetY > b.y + b.h + 6) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    grabbing.current = true;
    setE(pot.uRange[0] + ((b.y + b.h - e.offsetY) / b.h) * (pot.uRange[1] - pot.uRange[0]));
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!grabbing.current) return;
    const view = viewRef.current;
    if (!view) return;
    const b = layout(view).top.box;
    setE(pot.uRange[0] + ((b.y + b.h - e.offsetY) / b.h) * (pot.uRange[1] - pot.uRange[0]));
  };
  const onPointerUp = () => {
    grabbing.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = 0.02 * (W.Emax - W.Emin);
    if (e.key === 'Enter' || e.key === ' ') fire();
    else if (e.key === 'ArrowUp') setE(setup.E + step);
    else if (e.key === 'ArrowDown') setE(setup.E - step);
    else return;
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const shown = clamp(time, 0, m.tEnd);
  const s = sampleAt(m.motion, shown);
  const ratio = m.bm.T / m.T0;
  const tinyE = 1e-6 * (pot.uRange[1] - pot.uRange[0]);
  const Ulabel = m.U0 === 0 ? 'U' : 'U − U(x₀)';
  const label = `איור חי: ${pot.label} והפרבולה שמקרבת אותו ליד המינימום. האנרגיה המכנית ${sci(setup.E)} ג'אול; נקודות המפנה ${sci(m.bm.x1)} ו-${sci(m.bm.x2)} מטר; זמן המחזור ${sci(m.bm.T)} שניות, והקירוב ההרמוני נותן ${sci(m.T0)} שניות. במקלדת: חץ למעלה ולמטה משנה את האנרגיה, Enter משחרר.`;

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor="ns-resize"
      onReset={() => {
        setSetup(initialSetup());
        setFlying(null);
        setTime(0);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        flying ? (
          <span>הגוף נע…</span>
        ) : (
          <>
            <span class="q" data-readout="E">
              E = <b>{signed(setup.E, tinyE)} J</b>
            </span>
            <span class="q" data-readout="turning">
              x₁ = <b>{signed(m.bm.x1, 1e-9)} m</b>, x₂ = <b>{signed(m.bm.x2, 1e-9)} m</b>
            </span>
            {setup.well === 'pendulum' && (
              <span class="q" data-readout="theta">
                θ₀ = x₂/L = <b>{sci((m.bm.x2 / PENDULUM_L) * (180 / Math.PI), 3)}°</b>
              </span>
            )}
            <span class="q" data-readout="T">
              T = <b>{sci(m.bm.T)} s</b>
            </span>
            <span class="q" data-readout="T0">
              T₀ = 2π√(m/U″(x₀)) = <b>{sci(m.T0)} s</b>
            </span>
            <span class="q" data-readout="ratio">
              T/T₀ = <b>{sci(ratio, 3)}</b>
            </span>
            <span class="q" data-readout="t">
              t = <b>{signed(shown)} s</b>
            </span>
            {setup.panel === 'x' ? (
              <span class="q" data-readout="x">
                x = <b>{signed(s.x, 1e-9)} m</b>
              </span>
            ) : (
              <>
                <span class="q" data-readout="K">
                  K = <b>{signed(s.K, tinyE)} J</b>
                </span>
                <span class="q" data-readout="U">
                  {Ulabel} = <b>{signed(s.U - m.U0, tinyE)} J</b>
                </span>
                <span class="q" data-readout="avg">
                  ⟨K⟩ = <b>{signed(m.avgK, tinyE)} J</b>, ⟨{Ulabel}⟩ = <b>{signed(m.avgU, tinyE)} J</b>
                </span>
              </>
            )}
          </>
        )
      }
      controls={
        <>
          {offered.length > 1 && (
            <div class="group" role="group" aria-label="איזה בור">
              {offered.map((id) => (
                <Toggle key={id} label={WELLS[id].potential.label} on={setup.well === id} onChange={() => setWell(id)} />
              ))}
            </div>
          )}
          <Slider label="האנרגיה המכנית E" value={setup.E} min={W.Emin} max={W.Emax} step={0.01} format={(x) => `${signed(x)} J`} onChange={setE} />
          <Slider label="זמן" value={Number(shown.toPrecision(3))} min={0} max={Number(m.tEnd.toPrecision(3))} step={0.01} format={(x) => `${sci(x)} s`} onChange={scrub} />
          <div class="group" role="group" aria-label="שחרור">
            <button type="button" class="btn primary" onClick={fire}>
              שחררו
            </button>
          </div>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="הפרבולה" on={setup.parabola} onChange={(on) => setSetup((x) => ({ ...x, parabola: on }))} />
            {props.panelToggle && (
              <>
                <Toggle label="גרף המקום" on={setup.panel === 'x'} swatch="var(--accent)" onChange={() => setSetup((x) => ({ ...x, panel: 'x' }))} />
                <Toggle label="גרף האנרגיה" on={setup.panel === 'energy'} swatch="var(--energy-k)" onChange={() => setSetup((x) => ({ ...x, panel: 'energy' }))} />
              </>
            )}
          </div>
        </>
      }
    />
  );
}
