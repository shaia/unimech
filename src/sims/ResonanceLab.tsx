/**
 * ResonanceLab (lesson 5.4): a body on a spring with linear damping, driven by F₀ cos ωt from t = 0.
 *
 * Three plots. On top, x(t): the whole motion (ink) from the chosen start, the driving force F(t) drawn faint and
 * scaled to the height of the steady state (only its timing matters), and, with "פירוק" on, the two parts of the
 * motion: the steady state A cos(ωt − δ) dashed and the transient (the free damped motion) with its envelope
 * ±C e^(−γt/2). Below, the resonance curves: the steady-state amplitude A(ω) (or the average power P̄(ω)) and
 * the lag δ(ω), each with the current ω marked, ω₀ marked, and the half-height width drawn as a bar.
 *
 * Physics: src/physics/oscillator.ts (drivenMotion, steadyState) and src/physics/resonance.ts (decompose, widths).
 *
 * Tasks tick only inside the learner's own handlers (the play button, the sliders), and only for a quantity the
 * learner changed since the last text step: a state a step produced never ticks a task.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { averagePowerPerMass, drivenMotion, steadyState, type Oscillator } from '~/physics/oscillator';
import { amplitudeWidth, decompose, peakAmplitude, peakPowerPerMass, powerWidth, staticAmplitude, transientTime } from '~/physics/resonance';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { withAlpha } from './core/ink';
import { drawAxes, drawCurve, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  resonance: `קבעו בעצמכם ${ltr('ω')} בתוך חצי רוחב מ-${ltr('ω₀')} ולחצו "הפעלה". בכמה מפגר ${ltr('x')} אחרי ${ltr('F')}?`,
  above: `קבעו ${ltr('ω ≥ 2ω₀')} ולחצו "הפעלה". השוו את ${ltr('x')} ל-${ltr('F')}.`,
  forget: 'החליפו את ההתחלה (מנוחה או העתק) ולחצו "הפעלה". האם המצב היציב השתנה?',
  sharp: `קבעו ${ltr('Q ≥ 20')}, ${ltr('ω')} ליד ${ltr('ω₀')}, ולחצו "הפעלה". כמה זמן לוקח להגיע למצב היציב?`,
  width: `בעקומת ההספק: הזיזו את ${ltr('ω')} לנקודה שבה ההספק הממוצע חצי מהשיא.`,
};

export interface ResonanceLabProps {
  id: string;
  /** body, spring and drive [SI] */
  m?: number;
  k?: number;
  F0?: number;
  /** what is shown first */
  omega?: number;
  Q?: number;
  /** start displaced by X0_ON (true) or from rest at equilibrium */
  displaced?: boolean;
  curve?: 'A' | 'P';
  parts?: boolean;
  tasks?: string[];
}

interface Setup {
  omega: number;
  Q: number;
  displaced: boolean;
  curve: 'A' | 'P';
  parts: boolean;
}

const X0_ON = 0.04; // m
const W_MIN = 0.5;
const Q_MIN = 0.5;
const Q_MAX = 30;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
const signed = (x: number, tiny = 0) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));
const deg = (r: number) => (r * 180) / Math.PI;
/** A left-to-right mark: keeps a Latin axis title with its unit in parentheses in order inside an RTL text run. */
const LRM = String.fromCharCode(0x200e);

/** Latin or math text with a paper halo. */
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

function polylineData(ctx: CanvasRenderingContext2D, plot: Plot, xs: number[], ys: number[], color: string, width: number, dash: number[] = []) {
  const { box } = plot;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y - 2, box.w, box.h + 4);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) {
    const X = plot.px(xs[i]);
    const Y = plot.py(ys[i]);
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  }
  ctx.stroke();
  ctx.restore();
}

function vline(ctx: CanvasRenderingContext2D, plot: Plot, xv: number, color: string, dash: number[] = [4, 4]) {
  const X = plot.px(xv);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(X, plot.box.y);
  ctx.lineTo(X, plot.box.y + plot.box.h);
  ctx.stroke();
  ctx.restore();
}

function hline(ctx: CanvasRenderingContext2D, plot: Plot, yv: number, color: string, dash: number[] = [4, 4]) {
  const Y = plot.py(yv);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(plot.box.x, Y);
  ctx.lineTo(plot.box.x + plot.box.w, Y);
  ctx.stroke();
  ctx.restore();
}

interface Trace {
  t: number[];
  x: number[];
  xs: number[];
  xh: number[];
  env: number[];
  F: number[];
  tEnd: number;
  top: number;
}

export default function ResonanceLab(props: ResonanceLabProps) {
  const m = props.m ?? 0.5;
  const k = props.k ?? 50;
  const F0 = props.F0 ?? 0.5;
  const w0 = Math.sqrt(k / m);
  const f0 = F0 / m;
  const W_MAX = roundTo(2.5 * w0, 0.5);

  const initial = (): Setup => ({
    omega: clamp(props.omega ?? 0.6 * w0, W_MIN, W_MAX),
    Q: clamp(props.Q ?? 8, Q_MIN, Q_MAX),
    displaced: props.displaced ?? false,
    curve: props.curve ?? 'A',
    parts: props.parts ?? false,
  });

  const [setup, setSetup] = useState<Setup>(initial);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  // what the learner changed since the last text step (a task needs the learner's own change)
  const touched = useRef(new Set<string>());

  const o: Oscillator = { omega0: w0, gamma: w0 / setup.Q };
  const gamma = w0 / setup.Q;
  const ss = steadyState(o, f0, setup.omega);
  const tau = transientTime(o);

  const trace: Trace = useMemo(() => {
    const tEnd = clamp(5 * tau, 8, 40);
    const n = Math.round(clamp(tEnd * Math.max(setup.omega, w0) * 4, 800, 5000));
    const s0 = { x: setup.displaced ? X0_ON : 0, v: 0 };
    const tr: Trace = { t: [], x: [], xs: [], xh: [], env: [], F: [], tEnd, top: 0 };
    // the transient's envelope: the size of the free motion √(x² + ((v + ax)/ω_d)²) at t = 0, times e^(−γt/2)
    const a = gamma / 2;
    const wd = Math.sqrt(Math.max(1e-12, w0 * w0 - a * a));
    const d0 = decompose(o, f0, setup.omega, s0, 0).transient;
    const C = a < w0 ? Math.hypot(d0.x, (d0.v + a * d0.x) / wd) : Math.abs(d0.x) + Math.abs(d0.v) / w0;
    for (let i = 0; i <= n; i++) {
      const t = (tEnd * i) / n;
      const d = decompose(o, f0, setup.omega, s0, t);
      const x = drivenMotion(o, f0, setup.omega, s0, t).x;
      tr.t.push(t);
      tr.x.push(x);
      tr.xs.push(d.steady.x);
      tr.xh.push(d.transient.x);
      tr.env.push(C * Math.exp(-a * t));
      tr.F.push(ss.A * Math.cos(setup.omega * t));
      tr.top = Math.max(tr.top, Math.abs(x));
    }
    tr.top = Math.max(tr.top, ss.A, setup.displaced ? X0_ON : 0);
    return tr;
  }, [setup.omega, setup.Q, setup.displaced]);

  const [shownT, setShownT] = useState<number | null>(null); // null: the whole trace

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        touched.current.clear();
        setPlaying(false);
        setShownT(null);
        setSetup((prev) => ({
          omega: clamp(num(st.omega) ?? prev.omega, W_MIN, W_MAX),
          Q: clamp(num(st.Q) ?? prev.Q, Q_MIN, Q_MAX),
          displaced: bool(st.displaced) ?? prev.displaced,
          curve: st.curve === 'A' || st.curve === 'P' ? st.curve : prev.curve,
          parts: bool(st.parts) ?? prev.parts,
        }));
      }),
    [props.id],
  );

  const describe = (s: Setup) => {
    const r = steadyState({ omega0: w0, gamma: w0 / s.Q }, f0, s.omega);
    return `תדירות מאלצת ${sci(s.omega)} רדיאן לשנייה, מקדם איכות ${sci(s.Q)}. במצב היציב האמפליטודה ${sci(r.A * 100)} סנטימטר, וההעתק מפגר אחרי הכוח ב-${sci(deg(r.delta))} מעלות.`;
  };

  const play = () => {
    const nearRes = Math.abs(setup.omega - w0) <= gamma / 2;
    const mine = (key: string) => touched.current.has(key);
    if (mine('omega') && nearRes) done('resonance');
    if (mine('omega') && setup.omega >= 2 * w0 - 1e-9) done('above');
    if (mine('displaced')) done('forget');
    if (mine('Q') && setup.Q >= 20 && nearRes) done('sharp');
    if (!motionAllowed()) {
      setShownT(null);
      setLive(describe(setup));
      return;
    }
    t0.current = null;
    setShownT(0);
    setPlaying(true);
    setLive('הגוף נע.');
  };

  /* ---------------------------------------------------------------- drawing */

  const layout = (view: { w: number; h: number }) => {
    const narrow = view.w < 520;
    if (narrow) {
      const h1 = Math.round(view.h * 0.38);
      const h2 = Math.round((view.h - h1) / 2);
      return {
        narrow,
        top: { x: 0, y: 0, w: view.w, h: h1 },
        left: { x: 0, y: h1, w: view.w, h: h2 },
        right: { x: 0, y: h1 + h2, w: view.w, h: view.h - h1 - h2 },
      };
    }
    const h1 = Math.round(view.h * 0.5);
    const half = Math.round(view.w / 2);
    return {
      narrow,
      top: { x: 0, y: 0, w: view.w, h: h1 },
      left: { x: 0, y: h1, w: half, h: view.h - h1 },
      right: { x: half, y: h1, w: view.w - half, h: view.h - h1 },
    };
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const L = layout(view);
    const fs = L.narrow ? 11 : 12;
    const margins = { l: L.narrow ? 46 : 54, r: 14, t: 26, b: 42 };

    // the instant shown
    let now = shownT ?? trace.tEnd;
    if (playing) {
      if (t0.current === null) t0.current = t;
      const dur = clamp(trace.tEnd, 6, 12);
      now = Math.min(((t - t0.current) / dur) * trace.tEnd, trace.tEnd);
      if (now >= trace.tEnd) {
        setPlaying(false);
        setShownT(null);
        setLive(describe(setup));
      }
    }

    /* ---- x(t) */
    {
      const yTop = (trace.top * 100 * 1.15) || 1;
      const plot = makePlot(
        insetBox(L.top, margins),
        { min: 0, max: trace.tEnd, label: 'הזמן t (s)', format: (v) => sci(v, 2) },
        { min: -yTop, max: yTop, label: 'x (cm)' + LRM, format: (v) => sci(v, 2) },
      );
      drawAxes(ctx, plot, p);
      hline(ctx, plot, 0, p.ink3, []);
      const iEnd = Math.min(trace.t.length - 1, Math.round((now / trace.tEnd) * (trace.t.length - 1)));
      const ts = trace.t.slice(0, iEnd + 1);
      const cm = (a: number[]) => a.slice(0, iEnd + 1).map((v) => v * 100);
      // the force, scaled to the steady-state height: only its timing is meant
      polylineData(ctx, plot, ts, cm(trace.F), withAlpha(p.force, 0.55), 1.6, [2, 3]);
      if (setup.parts) {
        polylineData(ctx, plot, ts, cm(trace.env), withAlpha(p.ink3, 0.9), 1, [5, 4]);
        polylineData(ctx, plot, ts, cm(trace.env).map((v) => -v), withAlpha(p.ink3, 0.9), 1, [5, 4]);
        polylineData(ctx, plot, ts, cm(trace.xh), p.ink3, 1.6);
        polylineData(ctx, plot, ts, cm(trace.xs), p.accent, 2, [7, 4]);
      }
      polylineData(ctx, plot, ts, cm(trace.x), p.ink, 2.2);
      const X = plot.px(trace.t[iEnd]);
      const Y = plot.py(trace.x[iEnd] * 100);
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(X, Y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // legend, in a row above the plot from its left edge (the tool buttons sit at the upper right)
      let lx = plot.box.x;
      const ly = plot.box.y - 12;
      const item = (s: string, color: string, dash: number[]) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + 16, ly);
        ctx.stroke();
        ctx.font = `italic 700 ${fs}px ${p.fontUi}`;
        const w = ctx.measureText(s).width;
        ctx.restore();
        haloText(ctx, p, s, lx + 20, ly, { font: `italic 700 ${fs}px ${p.fontUi}`, color, align: 'left' });
        lx += 20 + w + 14;
      };
      item('x(t)', p.ink, []);
      item('F(t)', p.force, [2, 3]);
      if (setup.parts) {
        item('xₚ', p.accent, [7, 4]);
        item('xₕ', p.ink3, []);
      }
    }

    /* ---- A(ω) or P̄(ω) */
    const wAxis = { min: 0, max: W_MAX, label: 'התדירות המאלצת ω (rad/s)', format: (v: number) => sci(v, 2) };
    {
      const isP = setup.curve === 'P';
      const peakA = Number.isFinite(peakAmplitude(o, f0)) ? peakAmplitude(o, f0) : staticAmplitude(o, f0);
      const yMax = isP ? peakPowerPerMass(o, f0) * m * 1.15 : peakA * 100 * 1.15;
      const plot = makePlot(insetBox(L.left, margins), wAxis, { min: 0, max: yMax, label: (isP ? 'P̄ (W)' : 'A (cm)') + LRM, format: (v) => sci(v, 2) });
      drawAxes(ctx, plot, p);
      vline(ctx, plot, w0, p.ink3);
      haloText(ctx, p, 'ω₀', plot.px(w0) + 4, plot.box.y + 9, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'left' });
      const f = isP ? (w: number) => averagePowerPerMass(o, f0, w) * m : (w: number) => steadyState(o, f0, w).A * 100;
      if (!isP) {
        const st = staticAmplitude(o, f0) * 100;
        hline(ctx, plot, st, withAlpha(p.ink2, 0.8), [2, 3]);
        haloText(ctx, p, 'F₀/k', plot.box.x + plot.box.w - 4, plot.py(st) - 9, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });
      }
      drawCurve(ctx, plot, f, { color: isP ? p.energyK : p.ink, width: 2.4, samples: 500 });
      // the half-height width as a bar (A at 1/√2 of its peak, or P̄ at half its peak)
      const wd = isP ? powerWidth(o) : amplitudeWidth(o);
      const yBar = isP ? 0.5 * peakPowerPerMass(o, f0) * m : (peakA * 100) / Math.SQRT2;
      if (wd.hi <= W_MAX) {
        const x1 = plot.px(wd.lo);
        const x2 = plot.px(wd.hi);
        const Y = plot.py(yBar);
        ctx.save();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, Y);
        ctx.lineTo(x2, Y);
        ctx.moveTo(x1, Y - 5);
        ctx.lineTo(x1, Y + 5);
        ctx.moveTo(x2, Y - 5);
        ctx.lineTo(x2, Y + 5);
        ctx.stroke();
        ctx.restore();
        haloText(ctx, p, 'Δω', Math.max(x2 + 6, x1 + 26), Y, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.accent, align: 'left' });
      }
      const yv = f(setup.omega);
      vline(ctx, plot, setup.omega, withAlpha(p.accent, 0.8), [2, 3]);
      ctx.save();
      ctx.fillStyle = p.accent;
      ctx.strokeStyle = p.paper;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(plot.px(setup.omega), plot.py(Math.min(yv, yMax)), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    /* ---- δ(ω) */
    {
      const plot = makePlot(insetBox(L.right, margins), wAxis, { min: 0, max: 180, label: 'δ (°)' + LRM, ticks: [0, 45, 90, 135, 180], format: (v) => sci(v, 3) });
      drawAxes(ctx, plot, p);
      vline(ctx, plot, w0, p.ink3);
      hline(ctx, plot, 90, withAlpha(p.ink2, 0.8), [2, 3]);
      haloText(ctx, p, 'ω₀', plot.px(w0) + 4, plot.box.y + 9, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'left' });
      drawCurve(ctx, plot, (w) => deg(steadyState(o, f0, w).delta), { color: p.ink, width: 2.4, samples: 500 });
      vline(ctx, plot, setup.omega, withAlpha(p.accent, 0.8), [2, 3]);
      ctx.save();
      ctx.fillStyle = p.accent;
      ctx.strokeStyle = p.paper;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(plot.px(setup.omega), plot.py(deg(ss.delta)), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.4, worldHeight: 1, animate: playing });
  useEffect(invalidate, [setup, playing, shownT, trace]);

  const [aspect, setAspect] = useState(1.35);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 520 ? 0.6 : 1.35));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [aspect]);

  /* ---------------------------------------------------------------- input */

  const change = (key: keyof Setup, patch: Partial<Setup>) => {
    touched.current.add(key);
    setPlaying(false);
    setShownT(null);
    const next = { ...setup, ...patch };
    setSetup(next);
    if (next.curve === 'P' && (key === 'omega' || key === 'curve')) {
      const on: Oscillator = { omega0: w0, gamma: w0 / next.Q };
      const ratio = averagePowerPerMass(on, f0, next.omega) / peakPowerPerMass(on, f0);
      if (touched.current.has('omega') && Math.abs(ratio - 0.5) < 0.04) done('width');
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') play();
    else if (e.key === 'ArrowRight') change('omega', { omega: clamp(roundTo(setup.omega + 0.1, 0.1), W_MIN, W_MAX) });
    else if (e.key === 'ArrowLeft') change('omega', { omega: clamp(roundTo(setup.omega - 0.1, 0.1), W_MIN, W_MAX) });
    else return;
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const P = averagePowerPerMass(o, f0, setup.omega) * m;
  const label = `איור חי: מתנד מאולץ. גוף בעל מסה ${sci(m)} קילוגרם על קפיץ ${sci(k)} ניוטון למטר, תדירות עצמית ${sci(w0)} רדיאן לשנייה. ${describe(setup)} במקלדת: חצים ימינה ושמאלה משנים את התדירות המאלצת, Enter מפעיל.`;

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
        touched.current.clear();
        setSetup(initial());
        setPlaying(false);
        setShownT(null);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        <>
          <span class="q" data-readout="omega">
            ω = <b>{signed(setup.omega)} rad/s</b>
          </span>
          <span class="q" data-readout="omega0">
            ω₀ = <b>{signed(w0)} rad/s</b>
          </span>
          <span class="q" data-readout="Q">
            Q = <b>{signed(setup.Q)}</b>, γ = ω₀/Q = <b>{signed(gamma)} 1/s</b>
          </span>
          <span class="q" data-readout="A">
            A = <b>{signed(ss.A * 100)} cm</b>
          </span>
          <span class="q" data-readout="delta">
            δ = <b>{signed(deg(ss.delta))}°</b>
          </span>
          <span class="q" data-readout="gain">
            A/(F₀/k) = <b>{signed(ss.A / staticAmplitude(o, f0))}</b>
          </span>
          <span class="q" data-readout="P">
            P̄ = <b>{signed(P)} W</b>
          </span>
          <span class="q" data-readout="tau">
            2/γ = <b>{signed(tau)} s</b>
          </span>
        </>
      }
      controls={
        <>
          <Slider label="התדירות המאלצת ω" value={setup.omega} min={W_MIN} max={W_MAX} step={0.1} format={(x) => `${signed(x)} rad/s`} onChange={(v) => change('omega', { omega: clamp(roundTo(v, 0.1), W_MIN, W_MAX) })} />
          <Slider label="מקדם האיכות Q" value={setup.Q} min={Q_MIN} max={Q_MAX} step={0.5} format={(x) => signed(x)} onChange={(v) => change('Q', { Q: clamp(roundTo(v, 0.5), Q_MIN, Q_MAX) })} />
          <div class="group" role="group" aria-label="עקומת התהודה">
            <Toggle label="אמפליטודה" on={setup.curve === 'A'} onChange={() => change('curve', { curve: 'A' })} />
            <Toggle label="הספק ממוצע" on={setup.curve === 'P'} swatch="var(--energy-k)" onChange={() => change('curve', { curve: 'P' })} />
          </div>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="התחלה מהעתק 4 cm" on={setup.displaced} onChange={(on) => change('displaced', { displaced: on })} />
            <Toggle label="פירוק" on={setup.parts} swatch="var(--accent)" onChange={(on) => change('parts', { parts: on })} />
          </div>
          <div class="group" role="group" aria-label="הפעלה">
            <button type="button" class="btn primary" onClick={play}>
              הפעלה
            </button>
          </div>
        </>
      }
    />
  );
}
