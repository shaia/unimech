/**
 * TaylorLab (lesson 0.3): two views of one idea, that near a point a smooth function is a polynomial.
 *
 * - mode 'secant': the height y(t) of a ball thrown straight up, the secant through (t₀, y(t₀)) and
 *   (t₀ + h, y(t₀ + h)) with its rise-over-run triangle, and the tangent at t₀. The learner shrinks h (from either
 *   side) and watches the secant slope, the average velocity, approach the tangent slope, the velocity ẏ(t₀).
 * - mode 'taylor': a function f (sin θ, cos θ, √(1 + x), 1/(1 + x)², e^(−x), ln(1 + x)), its Taylor polynomials of
 *   order 1, 2 and 3 about a point x₀, the band around x₀ where the highest order shown is within a chosen relative
 *   error of f, and a probe x that reads the true error beside the first neglected term.
 *
 * Physics and mathematics come from src/physics/taylor.ts. Tasks tick only in the learner's own handlers (the
 * sliders, the chips, the h → 0 button); a text step sets the state and never ticks anything.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  TAYLOR_PRESETS,
  approximationError,
  firstNeglectedTerm,
  secant,
  taylorOf,
  throwHeight,
  throwVelocity,
  validInterval,
  type TaylorPresetId,
} from '~/physics/taylor';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { withAlpha } from './core/ink';
import { drawAxes, drawCurve, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Mode = 'secant' | 'taylor';
type Order = 1 | 2 | 3;
type Tol = 0.1 | 0.01 | 0.001;

interface PresetView {
  /** the name of the function, for chips and readouts */
  label: string;
  /** the variable's name and unit, for the axis and the readouts */
  v: string;
  unit: string;
  window: [number, number];
  y: [number, number];
  x0: number;
  /** the range of the x₀ slider */
  x0Range: [number, number];
  probe: number;
}

const VIEWS: Record<TaylorPresetId, PresetView> = {
  sin: { label: 'sin θ', v: 'θ', unit: 'rad', window: [-3.2, 3.2], y: [-1.6, 1.6], x0: 0, x0Range: [-1.5, 1.5], probe: 0.6 },
  cos: { label: 'cos θ', v: 'θ', unit: 'rad', window: [-3.2, 3.2], y: [-1.6, 1.6], x0: 0, x0Range: [-1.5, 1.5], probe: 0.6 },
  sqrt: { label: '√(1+x)', v: 'x', unit: '', window: [-1, 3], y: [-0.5, 2.5], x0: 0, x0Range: [-0.5, 2], probe: 0.5 },
  inv2: { label: '1/(1+x)²', v: 'x', unit: '', window: [-0.6, 2], y: [-0.5, 4], x0: 0, x0Range: [-0.3, 1.5], probe: 0.3 },
  exp: { label: 'e⁻ˣ', v: 'x', unit: '', window: [-1, 4], y: [-1, 3], x0: 0, x0Range: [-0.5, 3], probe: 0.5 },
  ln: { label: 'ln(1+x)', v: 'x', unit: '', window: [-0.9, 3], y: [-2.5, 1.8], x0: 0, x0Range: [-0.5, 2], probe: 0.5 },
};
const PRESET_IDS = Object.keys(VIEWS) as TaylorPresetId[];

const TOLS: Tol[] = [0.1, 0.01, 0.001];
const tolLabel = (t: Tol) => `${t * 100}%`;

/** the secant view: the time window and the height window of the throw */
const T_MAX = 4.1;
const Y_RANGE: [number, number] = [-2, 24];
const H_MAX = 1.5;
const H_STEP = 0.01;
/** the smallest |h| that counts as "h shrunk to zero" */
const H_SMALL = 0.01;

const TASK_LABEL: Record<string, string> = {
  'shrink-h': 'הקטינו את h עד 0.01 s (בפס הגרירה או בכפתור). מה שיפוע המיתר עכשיו, ומה שיפוע המשיק?',
  'from-left': 'גררו את h לערך שלילי, 0.2 s לפחות: מיתר משמאל ל-t₀. השיפוע שלו גדול או קטן משיפוע המשיק?',
  top: 'הזיזו את t₀ עד שהמשיק אופקי. מה המהירות ברגע הזה, ומה הזמן?',
  'cos-one-percent': 'בחרו cos θ, סדר 2 ושגיאה 1%. הזיזו את נקודת הבדיקה לקצה של הרצועה המוצללת. מה הזווית שם, ברדיאנים?',
  'sqrt-order3': 'בחרו √(1+x), והזיזו את נקודת הבדיקה ל-x = 1. מה השגיאה בסדר 1, ומה בסדר 3?',
  'ln-x0': 'בחרו ln(1+x), והזיזו את נקודת הפיתוח x₀ ל-1. מה השיפוע של המשיק שם?',
};

export interface TaylorLabProps {
  id: string;
  mode?: Mode;
  /* the secant view */
  t0?: number;
  h?: number;
  showTangent?: boolean;
  /* the Taylor view */
  preset?: TaylorPresetId;
  /** the functions offered as chips (default: only the starting one, no chips) */
  presets?: TaylorPresetId[];
  x0?: number;
  order?: Order;
  probe?: number;
  tol?: Tol;
  tasks?: string[];
}

interface State {
  t0: number;
  h: number;
  showTangent: boolean;
  preset: TaylorPresetId;
  x0: number;
  order: Order;
  probe: number;
  tol: Tol;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
const isPreset = (x: unknown): x is TaylorPresetId => typeof x === 'string' && x in VIEWS;
const isOrder = (x: unknown): x is Order => x === 1 || x === 2 || x === 3;
const isTol = (x: unknown): x is Tol => x === 0.1 || x === 0.01 || x === 0.001;
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 0, sig = 3) => (Math.abs(x) <= tiny ? '0' : sci(x, sig).replace('-', '−'));
const pct = (e: number) => (!Number.isFinite(e) ? '∞' : e < 1e-6 ? '0%' : `${sci(e * 100, 2)}%`);

function initial(p: TaylorLabProps): State {
  const preset = p.preset ?? 'sin';
  const v = VIEWS[preset];
  return {
    t0: p.t0 ?? 1,
    h: p.h ?? 1,
    showTangent: p.showTangent ?? true,
    preset,
    x0: p.x0 ?? v.x0,
    order: p.order ?? 1,
    probe: p.probe ?? v.probe,
    tol: p.tol ?? 0.01,
  };
}

/** Canvas text with a paper halo (Latin and math labels only). */
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

function segment(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string, width: number, dash: number[] = []) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

/** A straight line y = y₀ + m(t − t₀) across the plot, clipped to its box. */
function line(ctx: CanvasRenderingContext2D, plot: Plot, t0: number, y0: number, m: number, color: string, width: number, dash: number[] = []) {
  drawCurve(ctx, plot, (t) => y0 + m * (t - t0), { color, width, dash, samples: 2 });
}

export default function TaylorLab(props: TaylorLabProps) {
  const mode: Mode = props.mode ?? 'taylor';
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const [shrinking, setShrinking] = useState(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the state shown; they never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setShrinking(false);
        setS((prev) => {
          const preset = isPreset(st.preset) ? st.preset : prev.preset;
          const v = VIEWS[preset];
          const changed = preset !== prev.preset;
          return {
            t0: clamp(num(st.t0) ?? prev.t0, 0.2, T_MAX - 0.2),
            h: clamp(num(st.h) ?? prev.h, -H_MAX, H_MAX),
            showTangent: typeof st.showTangent === 'boolean' ? st.showTangent : prev.showTangent,
            preset,
            x0: clamp(num(st.x0) ?? (changed ? v.x0 : prev.x0), v.x0Range[0], v.x0Range[1]),
            order: isOrder(st.order) ? st.order : prev.order,
            probe: clamp(num(st.probe) ?? (changed ? v.probe : prev.probe), v.window[0], v.window[1]),
            tol: isTol(st.tol) ? st.tol : prev.tol,
          };
        });
      }),
    [props.id],
  );

  /* ---------------------------------------------------------------- the Taylor model */

  const V = VIEWS[s.preset];
  const g = TAYLOR_PRESETS[s.preset];
  /** the probe stays inside the function's domain (√(1+x) and ln(1+x) end at x = −1) */
  const probeMin = Math.max(V.window[0], g.domain[0] + 0.01);
  const polys = useMemo(() => [1, 2, 3].map((n) => taylorOf(g, s.x0, n)), [g, s.x0]);
  const band = useMemo(() => validInterval(g, s.x0, s.order, s.tol, V.window, 1500), [g, s.x0, s.order, s.tol, V]);
  const fx = g.d(s.probe, 0);
  const Px = polys[s.order - 1](s.probe);
  const err = Px - fx;
  const rel = approximationError(fx, Px);
  const next = firstNeglectedTerm(g, s.x0, s.order, s.probe);

  /* ---------------------------------------------------------------- the secant model */

  const y0 = throwHeight(s.t0);
  const v0 = throwVelocity(s.t0);
  const hasSecant = Math.abs(s.h) >= H_STEP / 2;
  const slope = hasSecant ? secant(throwHeight, s.t0, s.h) : NaN;

  /* ---------------------------------------------------------------- drawing */

  const layout = (view: { w: number; h: number }) => {
    const narrow = view.w < 520;
    const box = insetBox({ x: 0, y: 0, w: view.w, h: view.h }, { l: narrow ? 46 : 56, r: 14, t: 14, b: 44 });
    if (mode === 'secant') {
      return {
        narrow,
        plot: makePlot(box, { min: 0, max: T_MAX, label: 'הזמן t (s)', format: (x) => sci(x, 2) }, { min: Y_RANGE[0], max: Y_RANGE[1], label: 'הגובה y (m)', format: (x) => sci(x, 2) }),
      };
    }
    const xLabel = V.unit ? `${V.v} (${V.unit})` : V.v;
    return {
      narrow,
      plot: makePlot(box, { min: V.window[0], max: V.window[1], label: xLabel, format: (x) => sci(x, 2) }, { min: V.y[0], max: V.y[1], label: 'f', format: (x) => sci(x, 2) }),
    };
  };

  const ORDER_COLOR = (p: Palette, n: number) => (n === 1 ? p.accent : n === 2 ? p.hand : p.equip);

  const drawSecant = (ctx: CanvasRenderingContext2D, plot: Plot, p: Palette, narrow: boolean) => {
    const fs = narrow ? 11 : 12;
    drawAxes(ctx, plot, p);
    // y = 0, the ground
    segment(ctx, [plot.box.x, plot.py(0)], [plot.box.x + plot.box.w, plot.py(0)], p.ink3, 1.2);
    drawCurve(ctx, plot, throwHeight, { color: p.ink, width: 2.6, samples: 240 });
    haloText(ctx, p, 'y(t)', plot.px(0.35), plot.py(throwHeight(0.35)) - 14, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, align: 'left' });

    const P: [number, number] = [plot.px(s.t0), plot.py(y0)];
    if (s.showTangent) {
      line(ctx, plot, s.t0, y0, v0, p.velocity, 2.4);
      // the tangent's name, a little way along it to the left of P (or right, near the start)
      const tl = s.t0 > 1.2 ? s.t0 - 0.9 : s.t0 + 0.9;
      const yl = y0 + v0 * (tl - s.t0);
      if (yl > Y_RANGE[0] + 1 && yl < Y_RANGE[1] - 1) haloText(ctx, p, 'משיק', plot.px(tl), plot.py(yl) + 14, { font: `600 ${fs}px ${p.fontUi}`, color: p.velocity });
    }
    if (hasSecant) {
      const t1 = s.t0 + s.h;
      const y1 = throwHeight(t1);
      line(ctx, plot, s.t0, y0, slope, p.accent, 2, [7, 5]);
      const Q: [number, number] = [plot.px(t1), plot.py(y1)];
      // the rise-over-run triangle: Δt along, then Δy up or down
      const C: [number, number] = [Q[0], P[1]];
      segment(ctx, P, C, p.ink2, 1.3, [3, 3]);
      segment(ctx, C, Q, p.ink2, 1.3, [3, 3]);
      if (Math.abs(C[0] - P[0]) > 26) haloText(ctx, p, 'Δt', (P[0] + C[0]) / 2, P[1] + 12, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2 });
      if (Math.abs(Q[1] - C[1]) > 22) haloText(ctx, p, 'Δy', C[0] + (s.h > 0 ? 16 : -16), (C[1] + Q[1]) / 2, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2 });
      dot(ctx, Q[0], Q[1], 5, p.paper, p.accent);
      const ml = clamp(s.t0 + (s.h > 0 ? -0.75 : 0.75), 0.1, T_MAX - 0.1);
      const yl = y0 + slope * (ml - s.t0);
      if (yl > Y_RANGE[0] + 1 && yl < Y_RANGE[1] - 1) haloText(ctx, p, 'מיתר', plot.px(ml), plot.py(yl) - 14, { font: `600 ${fs}px ${p.fontUi}`, color: p.accent });
    }
    dot(ctx, P[0], P[1], 5.5, p.ink);
    haloText(ctx, p, 't₀', P[0], plot.box.y + plot.box.h - 10, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2 });
    segment(ctx, [P[0], P[1]], [P[0], plot.box.y + plot.box.h], p.ink3, 1, [2, 3]);
  };

  const drawTaylor = (ctx: CanvasRenderingContext2D, plot: Plot, p: Palette, narrow: boolean) => {
    const fs = narrow ? 11 : 12;
    const b = plot.box;
    const color = ORDER_COLOR(p, s.order);
    // the band where the highest order shown is within the tolerance
    {
      const X1 = clamp(plot.px(band.lo), b.x, b.x + b.w);
      const X2 = clamp(plot.px(band.hi), b.x, b.x + b.w);
      ctx.save();
      ctx.fillStyle = withAlpha(color, 0.12);
      ctx.fillRect(X1, b.y, X2 - X1, b.h);
      ctx.restore();
      if (band.loBounded) segment(ctx, [X1, b.y], [X1, b.y + b.h], withAlpha(color, 0.7), 1.2, [4, 4]);
      if (band.hiBounded) segment(ctx, [X2, b.y], [X2, b.y + b.h], withAlpha(color, 0.7), 1.2, [4, 4]);
    }
    drawAxes(ctx, plot, p);
    // the axes through zero
    if (V.y[0] < 0 && V.y[1] > 0) segment(ctx, [b.x, plot.py(0)], [b.x + b.w, plot.py(0)], p.ink3, 1);
    if (V.window[0] < 0 && V.window[1] > 0) segment(ctx, [plot.px(0), b.y], [plot.px(0), b.y + b.h], p.ink3, 1);

    const inDomain = (x: number) => x > g.domain[0] && x < g.domain[1];
    drawCurve(ctx, plot, (x) => (inDomain(x) ? g.d(x, 0) : NaN), { color: p.ink, width: 2.8, samples: 400 });
    for (let n = 1; n <= s.order; n++) {
      const top = n === s.order;
      drawCurve(ctx, plot, polys[n - 1], { color: withAlpha(ORDER_COLOR(p, n), top ? 1 : 0.55), width: top ? 2.4 : 1.5, dash: n === 1 ? [] : [8, 5], samples: 300 });
    }

    // labels: f at the left of the window, Pₙ at the edge where it leaves or ends
    {
      const xl = V.window[0] + 0.06 * (V.window[1] - V.window[0]);
      const xf = inDomain(xl) ? xl : V.window[0] + 0.2 * (V.window[1] - V.window[0]);
      const yf = clamp(plot.py(g.d(xf, 0)), b.y + 12, b.y + b.h - 12);
      haloText(ctx, p, 'f', plot.px(xf) + 4, yf - 14, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, align: 'left' });
      const subs = ['₁', '₂', '₃'];
      for (let n = 1; n <= s.order; n++) {
        // walk from x₀ to the right until the polynomial leaves the plot; label it there
        let xr = s.x0;
        const P = polys[n - 1];
        const stepX = (V.window[1] - V.window[0]) / 300;
        while (xr + stepX < V.window[1] && P(xr + stepX) < V.y[1] && P(xr + stepX) > V.y[0]) xr += stepX;
        const X = plot.px(xr) - 10;
        const Y = clamp(plot.py(P(xr)), b.y + 12, b.y + b.h - 12) + (n - 2) * 4;
        haloText(ctx, p, `P${subs[n - 1]}`, X, Y, { font: `italic 700 ${fs}px ${p.fontUi}`, color: ORDER_COLOR(p, n), align: 'right' });
      }
    }

    // the expansion point x₀
    {
      const X = plot.px(s.x0);
      const Y = plot.py(g.d(s.x0, 0));
      segment(ctx, [X, Y], [X, b.y + b.h], p.ink3, 1, [2, 3]);
      dot(ctx, X, Y, 5.5, p.ink);
      haloText(ctx, p, `${V.v}₀`, X, b.y + b.h - 10, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2 });
    }

    // the probe: the true value, the approximation, and the gap between them
    if (inDomain(s.probe)) {
      const X = plot.px(s.probe);
      const Yf = plot.py(fx);
      const Yp = plot.py(Px);
      segment(ctx, [X, b.y], [X, b.y + b.h], withAlpha(p.ink, 0.35), 1, [1, 3]);
      const top = clamp(Math.min(Yf, Yp), b.y, b.y + b.h);
      const bot = clamp(Math.max(Yf, Yp), b.y, b.y + b.h);
      segment(ctx, [X, top], [X, bot], color, 3);
      if (Yp >= b.y && Yp <= b.y + b.h) dot(ctx, X, Yp, 4.5, p.paper, color);
      if (Yf >= b.y && Yf <= b.y + b.h) dot(ctx, X, Yf, 4.5, p.ink);
      haloText(ctx, p, V.v, X, b.y + 10, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2 });
    }
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const { plot, narrow } = layout(view);
    if (mode === 'secant') drawSecant(ctx, plot, p, narrow);
    else drawTaylor(ctx, plot, p, narrow);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.3, worldHeight: 1, animate: false });
  useEffect(invalidate, [s, band, polys]);

  const [aspect, setAspect] = useState(1.3);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 520 ? 0.95 : 1.3));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [aspect]);

  /* ---------------------------------------------------------------- h → 0, animated when motion is allowed */

  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const shrink = () => {
    cancelAnimationFrame(raf.current);
    const sign = s.h < 0 ? -1 : 1;
    const target = sign * H_SMALL;
    const finish = () => {
      setShrinking(false);
      setS((prev) => ({ ...prev, h: target }));
      done('shrink-h');
      setLive(`h קטן ל-${sci(Math.abs(target))} שניות. שיפוע המיתר ${sci(secant(throwHeight, s.t0, target))} מטר לשנייה, שיפוע המשיק ${sci(v0)}.`);
    };
    if (!motionAllowed() || Math.abs(s.h) <= H_SMALL) {
      finish();
      return;
    }
    setShrinking(true);
    const from = Math.abs(s.h);
    const start = performance.now();
    const dur = 2600;
    const tick = (now: number) => {
      const u = Math.min(1, (now - start) / dur);
      if (u >= 1) {
        finish();
        return;
      }
      // geometric: equal ratios in equal times, so the last centimetres are as visible as the first metre
      const mag = from * (H_SMALL / from) ** u;
      setS((prev) => ({ ...prev, h: sign * roundTo(mag, 0.001) }));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  /* ---------------------------------------------------------------- input (every task ticks here) */

  const setT0 = (t: number) => {
    const t0 = clamp(roundTo(t, 0.01), 0.2, T_MAX - 0.2);
    // keep the second point of the secant inside the plot
    setS((prev) => ({ ...prev, t0, h: clamp(prev.h, -t0, T_MAX - t0) }));
    if (Math.abs(throwVelocity(t0)) < 0.05) done('top');
  };
  const setH = (x: number) => {
    cancelAnimationFrame(raf.current);
    setShrinking(false);
    const h = clamp(roundTo(x, H_STEP), Math.max(-H_MAX, -s.t0), Math.min(H_MAX, T_MAX - s.t0));
    setS((prev) => ({ ...prev, h }));
    if (h !== 0 && Math.abs(h) <= H_SMALL + 1e-9) done('shrink-h');
    if (h <= -0.2) done('from-left');
  };

  /** Check the Taylor tasks against the state the learner just made. */
  const checkTaylor = (n: State) => {
    const v = VIEWS[n.preset];
    if (n.preset === 'cos' && n.order === 2 && n.tol === 0.01) {
      const b = validInterval(TAYLOR_PRESETS.cos, n.x0, 2, 0.01, v.window, 1500);
      if ((b.hiBounded && Math.abs(n.probe - b.hi) <= 0.03) || (b.loBounded && Math.abs(n.probe - b.lo) <= 0.03)) done('cos-one-percent');
    }
    if (n.preset === 'sqrt' && n.order === 3 && Math.abs(n.probe - 1) <= 0.05) done('sqrt-order3');
    if (n.preset === 'ln' && Math.abs(n.x0 - 1) <= 0.1) done('ln-x0');
  };
  const update = (f: (prev: State) => State) => {
    const n = f(s);
    setS(n);
    checkTaylor(n);
  };
  const choosePreset = (preset: TaylorPresetId) => {
    const v = VIEWS[preset];
    update((prev) => ({ ...prev, preset, x0: v.x0, probe: v.probe }));
    setLive(`נבחרה הפונקציה ${v.label}.`);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (mode === 'secant') {
      if (e.key === 'ArrowRight') setH(s.h + 0.05);
      else if (e.key === 'ArrowLeft') setH(s.h - 0.05);
      else if (e.key === 'ArrowUp') setT0(s.t0 + 0.05);
      else if (e.key === 'ArrowDown') setT0(s.t0 - 0.05);
      else return;
    } else {
      const step = 0.02 * (V.window[1] - V.window[0]);
      if (e.key === 'ArrowRight') update((prev) => ({ ...prev, probe: clamp(roundTo(prev.probe + step, 0.01), V.window[0], V.window[1]) }));
      else if (e.key === 'ArrowLeft') update((prev) => ({ ...prev, probe: clamp(roundTo(prev.probe - step, 0.01), probeMin, V.window[1]) }));
      else return;
    }
    e.preventDefault();
  };

  const reset = () => {
    cancelAnimationFrame(raf.current);
    setShrinking(false);
    setS(initial(props));
    setLive('האיור חזר למצב ההתחלה.');
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const offered = props.presets ?? [];
  const tinyY = 1e-9;
  const bandText = (x: number, bounded: boolean) => (bounded ? signed(x, 1e-9) : x < s.x0 ? `≤ ${signed(x, 1e-9)}` : `≥ ${signed(x, 1e-9)}`);
  const label =
    mode === 'secant'
      ? `איור חי: הגובה של כדור שנזרק למעלה כפונקציה של הזמן, מיתר בין t₀ = ${sci(s.t0)} s ל-t₀ + h, עם h = ${signed(s.h)} s, והמשיק ב-t₀. שיפוע המיתר ${hasSecant ? sci(slope) : 'לא מוגדר'} m/s; שיפוע המשיק, המהירות ברגע t₀, ${sci(v0)} m/s. במקלדת: חץ ימינה ושמאלה משנה את h, חץ למעלה ולמטה את t₀.`
      : `איור חי: הפונקציה ${V.label} ופולינומי טיילור שלה עד סדר ${s.order} סביב ${V.v}₀ = ${sci(s.x0)}. השגיאה היחסית קטנה מ-${tolLabel(s.tol)} בין ${sci(band.lo)} ל-${sci(band.hi)}. בנקודת הבדיקה ${V.v} = ${sci(s.probe)}: הפונקציה ${sci(fx)}, הקירוב ${sci(Px)}, שגיאה יחסית ${pct(rel)}. במקלדת: חץ ימינה ושמאלה מזיז את נקודת הבדיקה.`;

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
      readout={
        mode === 'secant' ? (
          <>
            <span class="q" data-readout="t0">
              t₀ = <b>{sci(s.t0)} s</b>
            </span>
            <span class="q" data-readout="h">
              h = <b>{signed(s.h)} s</b>
            </span>
            <b class="q" data-readout="secant">
              {hasSecant ? (
                <>Δy/Δt = {signed(slope, 1e-9, 4)} m/s</>
              ) : (
                <>h = 0: Δy/Δt = 0/0</>
              )}
            </b>
            <span class="q" data-readout="tangent">
              ẏ(t₀) = <b>{signed(v0, 1e-9, 4)} m/s</b>
            </span>
            {hasSecant && (
              <span class="q" data-readout="gap">
                Δy/Δt − ẏ(t₀) = <b>{signed(slope - v0, 1e-9)} m/s</b>
              </span>
            )}
          </>
        ) : (
          <>
            <span class="q" data-readout="x0">
              {V.v}₀ = <b>{signed(s.x0, 1e-9)}</b>
            </span>
            <span class="q" data-readout="probe">
              {V.v} = <b>{signed(s.probe, 1e-9)}</b>
            </span>
            <span class="q" data-readout="f">
              f = <b>{signed(fx, tinyY)}</b>
            </span>
            <span class="q" data-readout="P">
              P<sub>{s.order}</sub> = <b>{signed(Px, tinyY)}</b>
            </span>
            <b class="q" data-readout="error">
              P<sub>{s.order}</sub> − f = {signed(err, 1e-12)} ({pct(rel)})
            </b>
            <span class="q" data-readout="next">
              האיבר הראשון שהוזנח (סדר {next.order}): <b>{signed(next.value, 1e-12)}</b>
            </span>
            <span class="q" data-readout="band">
              שגיאה עד {tolLabel(s.tol)}: <b>{bandText(band.lo, band.loBounded)}</b> עד <b>{bandText(band.hi, band.hiBounded)}</b>
            </span>
          </>
        )
      }
      controls={
        mode === 'secant' ? (
          <>
            <Slider label="הרגע t₀" min={0.2} max={T_MAX - 0.2} step={0.01} value={s.t0} format={(x) => `${sci(x, 3)} s`} onChange={setT0} />
            <Slider label="הפרש הזמנים h" min={-H_MAX} max={H_MAX} step={H_STEP} value={s.h} format={(x) => `${signed(x)} s`} onChange={setH} />
            <div class="group" role="group" aria-label="פעולות">
              <button type="button" class="btn primary" onClick={shrink} disabled={shrinking}>
                h → 0
              </button>
              <Toggle label="המשיק" on={s.showTangent} swatch="var(--velocity)" onChange={(on) => setS((prev) => ({ ...prev, showTangent: on }))} />
            </div>
          </>
        ) : (
          <>
            {offered.length > 1 && (
              <div class="group" role="group" aria-label="הפונקציה">
                {offered.map((id) => (
                  <Toggle key={id} label={<bdi dir="ltr">{VIEWS[id].label}</bdi>} on={s.preset === id} onChange={() => choosePreset(id)} />
                ))}
              </div>
            )}
            <div class="group" role="group" aria-label="סדר הקירוב">
              {([1, 2, 3] as Order[]).map((n) => (
                <Toggle key={n} label={`סדר ${n}`} on={s.order === n} swatch={n === 1 ? 'var(--accent)' : n === 2 ? 'var(--hand)' : 'var(--equip)'} onChange={() => update((prev) => ({ ...prev, order: n }))} />
              ))}
            </div>
            <div class="group" role="group" aria-label="השגיאה המותרת">
              {TOLS.map((t) => (
                <Toggle key={t} label={`שגיאה ${tolLabel(t)}`} on={s.tol === t} onChange={() => update((prev) => ({ ...prev, tol: t }))} />
              ))}
            </div>
            <Slider
              label={`נקודת הפיתוח ${V.v}₀`}
              min={V.x0Range[0]}
              max={V.x0Range[1]}
              step={0.05}
              value={s.x0}
              format={(x) => signed(x, 1e-9)}
              onChange={(x) => update((prev) => ({ ...prev, x0: clamp(roundTo(x, 0.05), V.x0Range[0], V.x0Range[1]) }))}
            />
            <Slider
              label={`נקודת הבדיקה ${V.v}`}
              min={probeMin}
              max={V.window[1]}
              step={0.01}
              value={s.probe}
              format={(x) => signed(x, 1e-9)}
              onChange={(x) => update((prev) => ({ ...prev, probe: clamp(roundTo(x, 0.01), probeMin, V.window[1]) }))}
            />
          </>
        )
      }
    />
  );
}
