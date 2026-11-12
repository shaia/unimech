/**
 * DampedOscillator (lesson 5.3): a body on a spring with linear damping, ẍ + γẋ + ω₀²x = 0, read three ways.
 * - x(t): the displacement against time, with the envelope ±A₀e^(−γt/2) dashed when the motion is under-damped,
 *   and the body itself, on its spring, in a strip at the left edge drawn on the same x scale.
 * - E(t)/E₀: the mechanical energy, with the cycle average e^(−γt) dashed (under-damped); linear or logarithmic.
 * - The complex plane of s: the two roots of the characteristic equation s² + γs + ω₀² = 0, on the circle |s| = ω₀
 *   while under-damped, meeting at −ω₀ at critical damping and splitting along the negative real axis above it.
 * The motion comes from src/physics/oscillator.ts (closed form in every regime); the roots, the envelope, the
 * decrement and the crossing time from src/physics/damping.ts.
 *
 * The learner sets γ (and the initial velocity, in the first figure), moves a time cursor or plays the motion.
 * Tasks tick only inside the learner's own handlers (sliders, toggles); a text step sets the state through
 * subscribeSteps and never ticks a task.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { characteristicRoots, crossingTime, dampedPeriod, energyLossPerCycle, envelopeAmplitude, logDecrement } from '~/physics/damping';
import { dampedFrequency, energy, freeMotion, regime, type Oscillator, type Regime, type State } from '~/physics/oscillator';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, withAlpha } from './core/ink';
import { drawAxes, drawCurve, makePlot, type Box, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  under: `קבעו את ${ltr('γ')} בין ${ltr('ω₀')} ל-${ltr('2ω₀')}. האם הגוף עדיין עובר את שיווי המשקל?`,
  critical: `קבעו ${ltr('γ = 2ω₀ = 8 s⁻¹')}, ריסון קריטי. איפה נפגשים שני השורשים?`,
  slower: `הגבירו את הריסון אל מעבר לקריטי, ${ltr('γ ≥ 12 s⁻¹')}. האם הגוף חוזר מהר יותר?`,
  cross: 'בעל-ריסון: מצאו מהירות התחלתית שבה הגוף כן עובר את שיווי המשקל. כמה פעמים הוא עובר אותו?',
  log: 'הפעילו את הסקאלה הלוגריתמית של האנרגיה. איזו צורה מקבלת הדעיכה?',
  'half-amp': 'הזיזו את פס הזמן לרגע שבו המעטפת ירדה לחצי מערכה ההתחלתי. לאיזה חלק ירדה האנרגיה?',
  'q-cycles': `הזיזו את פס הזמן לרגע שבו עברו ${ltr('Q')} תנודות. מה ${ltr('E/E₀')} אז?`,
};

const REGIME_HE: Record<Regime, string> = {
  undamped: 'בלי ריסון',
  under: 'תת-ריסון',
  critical: 'ריסון קריטי',
  over: 'על-ריסון',
};

export interface DampedOscillatorProps {
  id: string;
  /** natural angular frequency ω₀ [rad/s] and mass [kg] */
  omega0?: number;
  mass?: number;
  /** damping rate γ = b/m [1/s] and its slider */
  gamma?: number;
  gammaMin?: number;
  gammaMax?: number;
  gammaStep?: number;
  /** initial displacement [m] and velocity [m/s]; `v0Slider` offers the velocity to the learner */
  x0?: number;
  v0?: number;
  v0Slider?: boolean;
  /** the time window shown [s] */
  window?: number;
  /** draw the complex plane of s */
  plane?: boolean;
  /** energy axis logarithmic at the start, and the toggle offered */
  log?: boolean;
  logToggle?: boolean;
  /** the readouts of the decay (Q, T_d, Λ, energy lost per cycle, cycles elapsed) */
  decay?: boolean;
  tasks?: string[];
}

interface Setup {
  gamma: number;
  v0: number;
  log: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 0) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));

/** Canvas text with a paper halo (Latin and math labels). */
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

interface Layout {
  narrow: boolean;
  strip: Box;
  xBox: Box;
  eBox: Box;
  sBox: Box | null;
}

export default function DampedOscillator(props: DampedOscillatorProps) {
  const W0 = props.omega0 ?? 4;
  const M = props.mass ?? 1;
  const X0 = props.x0 ?? 0.1;
  const G_MIN = props.gammaMin ?? 0;
  const G_MAX = props.gammaMax ?? 16;
  const G_STEP = props.gammaStep ?? 0.1;
  const TW = props.window ?? 6;
  const showPlane = props.plane ?? true;

  const initialSetup = (): Setup => ({
    gamma: clamp(props.gamma ?? 0.8, G_MIN, G_MAX),
    v0: props.v0 ?? 0,
    log: props.log ?? false,
  });

  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [time, setTime] = useState(TW);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);

  const osc: Oscillator = { omega0: W0, gamma: setup.gamma };
  const s0: State = { x: X0, v: setup.v0 };
  const reg = regime(osc);
  const roots = characteristicRoots(osc);
  const wd = dampedFrequency(osc);
  const Td = dampedPeriod(osc);
  const E0 = energy(M, M * W0 * W0, s0);
  const A0 = reg === 'under' || reg === 'undamped' ? envelopeAmplitude(osc, s0) : Number.NaN;
  const Q = setup.gamma > 0 ? W0 / setup.gamma : Number.POSITIVE_INFINITY;

  // samples of the motion across the window
  const samples = useMemo(() => {
    const n = 1200;
    const o: Oscillator = { omega0: W0, gamma: setup.gamma };
    const st: State = { x: X0, v: setup.v0 };
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = (TW * i) / n;
      const s = freeMotion(o, st, t);
      return { t, x: s.x, E: energy(M, M * W0 * W0, s) };
    });
  }, [setup.gamma, setup.v0]);
  const xMax = useMemo(() => Math.max(X0 * 1.15, ...samples.map((s) => Math.abs(s.x) * 1.08)), [samples]);

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set γ, v₀, the energy scale and the instant shown; they never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setPlaying(false);
        setSetup((prev) => ({
          gamma: clamp(num(st.gamma) ?? prev.gamma, G_MIN, G_MAX),
          v0: num(st.v0) ?? prev.v0,
          log: bool(st.log) ?? prev.log,
        }));
        setTime(clamp(num(st.t) ?? TW, 0, TW));
      }),
    [props.id],
  );

  /* ---------------------------------------------------------------- layout */

  const layoutOf = (view: { w: number; h: number }): Layout => {
    const narrow = view.w < 520;
    const stripW = narrow ? 30 : 38;
    const l = stripW + (narrow ? 34 : 40);
    const pad = 10;
    if (!showPlane) {
      const xH = Math.round(view.h * 0.5);
      return {
        narrow,
        strip: { x: 4, y: 26, w: stripW - 6, h: xH - 26 - 24 },
        xBox: { x: l, y: 26, w: view.w - l - pad, h: xH - 26 - 24 },
        eBox: { x: l, y: xH + 22, w: view.w - l - pad, h: view.h - xH - 22 - 44 },
        sBox: null,
      };
    }
    if (narrow) {
      const xH = Math.round(view.h * 0.38);
      const eH = Math.round(view.h * 0.27);
      const sTop = xH + eH;
      return {
        narrow,
        strip: { x: 4, y: 24, w: stripW - 6, h: xH - 24 - 22 },
        xBox: { x: l, y: 24, w: view.w - l - pad, h: xH - 24 - 22 },
        eBox: { x: l, y: xH + 18, w: view.w - l - pad, h: eH - 18 - 40 },
        sBox: { x: 12, y: sTop + 10, w: view.w - 24, h: view.h - sTop - 14 },
      };
    }
    const xH = Math.round(view.h * 0.5);
    const split = Math.round(view.w * 0.56);
    return {
      narrow,
      strip: { x: 4, y: 26, w: stripW - 6, h: xH - 26 - 24 },
      xBox: { x: l, y: 26, w: view.w - l - pad, h: xH - 26 - 24 },
      eBox: { x: l, y: xH + 22, w: split - l - 14, h: view.h - xH - 22 - 44 },
      sBox: { x: split + 6, y: xH + 8, w: view.w - split - 12, h: view.h - xH - 14 },
    };
  };

  /* ---------------------------------------------------------------- drawing */

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const L = layoutOf(view);
    const fs = L.narrow ? 11 : 12;

    let now = clamp(time, 0, TW);
    if (playing) {
      if (t0.current === null) t0.current = t;
      const rate = Math.max(1, TW / 15);
      now = Math.min((t - t0.current) * rate, TW);
      if (now >= TW) {
        setPlaying(false);
        setTime(TW);
      }
    }
    const cur = freeMotion(osc, s0, now);

    /* ---- x(t) */
    const xp: Plot = makePlot(
      L.xBox,
      { min: 0, max: TW, format: (v) => sci(v, 2) },
      { min: -xMax, max: xMax, format: (v) => sci(v, 2) },
    );
    drawAxes(ctx, xp, p);
    haloText(ctx, p, 'x (m)', L.xBox.x + 4, L.xBox.y - 12, { font: `italic 600 ${fs + 1}px ${p.fontUi}`, color: p.ink, align: 'left' });
    // x = 0
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L.xBox.x, xp.py(0));
    ctx.lineTo(L.xBox.x + L.xBox.w, xp.py(0));
    ctx.stroke();
    ctx.restore();
    // envelope
    if (reg === 'under') {
      const env = (tt: number) => A0 * Math.exp((-setup.gamma * tt) / 2);
      drawCurve(ctx, xp, env, { color: p.ink2, width: 1.4, dash: [6, 5], samples: 200 });
      drawCurve(ctx, xp, (tt) => -env(tt), { color: p.ink2, width: 1.4, dash: [6, 5], samples: 200 });
    }
    // the motion
    {
      ctx.save();
      ctx.beginPath();
      ctx.rect(L.xBox.x, L.xBox.y - 2, L.xBox.w, L.xBox.h + 4);
      ctx.clip();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      samples.forEach((s, i) => (i ? ctx.lineTo(xp.px(s.t), xp.py(s.x)) : ctx.moveTo(xp.px(s.t), xp.py(s.x))));
      ctx.stroke();
      ctx.restore();
    }

    /* ---- E(t)/E₀ */
    const LOG_MIN = 1e-4;
    const ep: Plot = makePlot(
      L.eBox,
      { min: 0, max: TW, label: 'הזמן t (s)', format: (v) => sci(v, 2) },
      setup.log ? { min: LOG_MIN, max: 1, scale: 'log' } : { min: 0, max: 1, ticks: [0, 0.5, 1], format: (v) => sci(v, 2) },
    );
    drawAxes(ctx, ep, p);
    haloText(ctx, p, 'E/E₀', L.eBox.x + 4, L.eBox.y - 11, { font: `italic 600 ${fs + 1}px ${p.fontUi}`, color: p.energyK, align: 'left' });
    if (reg === 'under' && E0 > 0) {
      // the cycle average e^(−γt), scaled by the envelope's start (equal to 1 when released from rest)
      const c = (0.5 * M * W0 * W0 * A0 * A0) / E0;
      drawCurve(ctx, ep, (tt) => c * Math.exp(-setup.gamma * tt), { color: p.ink2, width: 1.4, dash: [6, 5], samples: 200 });
    }
    {
      ctx.save();
      ctx.beginPath();
      ctx.rect(L.eBox.x, L.eBox.y - 2, L.eBox.w, L.eBox.h + 4);
      ctx.clip();
      ctx.strokeStyle = p.energyK;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (const s of samples) {
        const r = E0 > 0 ? s.E / E0 : 0;
        if (setup.log && r < LOG_MIN * 0.5) {
          started = false;
          continue;
        }
        const X = ep.px(s.t);
        const Y = ep.py(r);
        if (started) ctx.lineTo(X, Y);
        else ctx.moveTo(X, Y);
        started = true;
      }
      ctx.stroke();
      ctx.restore();
    }

    /* ---- the time cursor through both plots, and the dots on the curves */
    {
      const X = xp.px(now);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.accent, 0.7);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X, L.xBox.y);
      ctx.lineTo(X, L.xBox.y + L.xBox.h);
      ctx.moveTo(ep.px(now), L.eBox.y);
      ctx.lineTo(ep.px(now), L.eBox.y + L.eBox.h);
      ctx.stroke();
      ctx.restore();
      const dot = (x: number, y: number) => {
        ctx.save();
        ctx.fillStyle = p.accent;
        ctx.strokeStyle = p.paper;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, L.narrow ? 4.5 : 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };
      dot(X, xp.py(cur.x));
      const r = E0 > 0 ? energy(M, M * W0 * W0, cur) / E0 : 0;
      if (!setup.log || r >= LOG_MIN) dot(ep.px(now), ep.py(r));
    }

    /* ---- the body on its spring, at the left edge, on the x(t) scale */
    {
      const S = L.strip;
      const cx = S.x + S.w / 2;
      const top = S.y - 8;
      const yb = xp.py(cur.x);
      const half = Math.min(10, S.w / 2 - 1);
      // ceiling
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(S.x, top);
      ctx.lineTo(S.x + S.w, top);
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(S.x + 3 + k * (S.w / 4), top);
        ctx.lineTo(S.x + k * (S.w / 4), top - 5);
        ctx.stroke();
      }
      // spring: a zigzag from the ceiling to the top of the body
      const y1 = top;
      const y2 = yb - half;
      const turns = 9;
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = p.ink;
      ctx.beginPath();
      ctx.moveTo(cx, y1);
      for (let k = 1; k < 2 * turns; k++) {
        const y = y1 + ((y2 - y1) * k) / (2 * turns);
        ctx.lineTo(cx + (k % 2 ? -1 : 1) * (S.w / 2 - 3), y);
      }
      ctx.lineTo(cx, y2);
      ctx.stroke();
      // the equilibrium level
      ctx.strokeStyle = p.ink3;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(S.x, xp.py(0));
      ctx.lineTo(S.x + S.w, xp.py(0));
      ctx.stroke();
      ctx.setLineDash([]);
      // the body
      ctx.fillStyle = p.accent;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(cx - half, yb - half, 2 * half, 2 * half);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    /* ---- the complex plane of s */
    if (L.sBox) {
      const B = L.sBox;
      const reMin = -2.6 * W0;
      const reMax = 0.6 * W0;
      const imSpan = 1.35 * W0;
      const k = Math.min(B.w / (reMax - reMin), B.h / (2 * imSpan));
      const ox = B.x + (B.w - k * (reMax - reMin)) / 2 - k * reMin;
      const oy = B.y + B.h / 2;
      const sx = (re: number) => ox + k * re;
      const sy = (im: number) => oy - k * im;
      const left = sx(reMin);
      const right = sx(reMax);
      // axes
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.3;
      arrow(ctx, left, oy, right, oy, { color: p.ink2, width: 1.3, head: 7 });
      arrow(ctx, ox, sy(-imSpan), ox, sy(imSpan), { color: p.ink2, width: 1.3, head: 7 });
      ctx.restore();
      haloText(ctx, p, 'Re s', right - 2, oy + 12, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });
      haloText(ctx, p, 'Im s', ox - 6, sy(imSpan) + 4, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });
      // the circle |s| = ω₀, dashed, and its marks
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(ox, oy, k * W0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      for (const [re, im, s] of [
        [-W0, 0, '−ω₀'],
        [0, W0, 'ω₀'],
        [0, -W0, '−ω₀'],
      ] as [number, number, string][]) {
        ctx.save();
        ctx.fillStyle = p.ink2;
        ctx.beginPath();
        ctx.arc(sx(re), sy(im), 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // −ω₀ under the real axis, hidden while a real root sits near it (that root's label goes there);
        // ±ω₀ just inside the circle, right of the imaginary axis: the roots are at Re s ≤ 0 and label above/below
        const nearRoot = reg !== 'under' && reg !== 'undamped' && roots.some((r) => Math.abs(r.re - re) < 0.45 * W0);
        if (im === 0) {
          if (!nearRoot) haloText(ctx, p, s, sx(re), oy + 12, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2 });
        } else haloText(ctx, p, s, ox + 6, sy(im) + (im > 0 ? 11 : -11), { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'left' });
      }
      // the roots
      const drawRoot = (re: number, im: number, label: string, labelAbove: boolean) => {
        const R = L.narrow ? 5.5 : 6.5;
        if (re < reMin) {
          // off the plane to the left: an arrow at the edge with its value
          const y = sy(im);
          arrow(ctx, left + 22, y, left + 2, y, { color: p.accent, width: 2.4, head: 8 });
          haloText(ctx, p, `${label} = ${signed(re)}`, left + 26, y + (labelAbove ? -12 : 12), { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.accent, align: 'left' });
          return;
        }
        ctx.save();
        ctx.fillStyle = p.accent;
        ctx.strokeStyle = p.paper;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx(re), sy(im), R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        haloText(ctx, p, label, sx(re) + (im === 0 ? 0 : 12), sy(im) + (labelAbove ? -14 : 14), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.accent, align: im === 0 ? 'center' : 'left' });
      };
      const [r1, r2] = roots;
      if (reg === 'critical') {
        drawRoot(r1.re, 0, 's₁ = s₂', true);
        ctx.save();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx(r1.re), oy, L.narrow ? 9 : 10.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else {
        drawRoot(r1.re, r1.im, 's₁', true);
        drawRoot(r2.re, r2.im, 's₂', false);
      }
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: playing });
  useEffect(invalidate, [setup, time, playing, samples]);

  // the stage is taller on a narrow screen
  const wideAspect = showPlane ? 1.12 : 1.35;
  const [aspect, setAspect] = useState(wideAspect);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 520 ? (showPlane ? 0.62 : 0.85) : wideAspect));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [aspect]);

  /* ---------------------------------------------------------------- input (tasks tick only here) */

  const checkTasks = (s: Setup) => {
    const o: Oscillator = { omega0: W0, gamma: s.gamma };
    const r = regime(o);
    if (s.gamma > W0 && s.gamma < 2 * W0 - 0.05) done('under');
    if (Math.abs(s.gamma - 2 * W0) < 0.05) done('critical');
    if (s.gamma >= 3 * W0) done('slower');
    if (r === 'over') {
      const tc = crossingTime(o, { x: X0, v: s.v0 });
      if (tc !== null && tc < TW) done('cross');
    }
  };
  const change = (f: (s: Setup) => Setup) => {
    setPlaying(false);
    const next = f(setup);
    setSetup(next);
    checkTasks(next);
  };
  const setGamma = (g: number) => change((s) => ({ ...s, gamma: clamp(roundTo(g, G_STEP), G_MIN, G_MAX) }));
  const setV0 = (v: number) => change((s) => ({ ...s, v0: roundTo(v, 0.1) }));
  const scrub = (tt: number) => {
    setPlaying(false);
    const t = clamp(tt, 0, TW);
    setTime(t);
    if (reg === 'under') {
      const ratio = Math.exp((-setup.gamma * t) / 2);
      if (ratio >= 0.48 && ratio <= 0.52) done('half-amp');
      if (Number.isFinite(Td) && Math.abs(t / Td - Q) < 0.25) done('q-cycles');
    }
  };
  const play = () => {
    t0.current = null;
    if (!motionAllowed()) {
      setTime(TW);
      setLive('התנועה מוצגת כולה: מצב סטטי.');
      return;
    }
    setPlaying(true);
    setLive('הגוף נע.');
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') setGamma(setup.gamma + G_STEP);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setGamma(setup.gamma - G_STEP);
    else if (e.key === 'Enter' || e.key === ' ') play();
    else return;
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const shown = clamp(time, 0, TW);
  const st = freeMotion(osc, s0, shown);
  const Er = E0 > 0 ? energy(M, M * W0 * W0, st) / E0 : 0;
  const rootText = (() => {
    const [a, b] = roots;
    if (reg === 'undamped') return `±${signed(a.im)}i`;
    if (reg === 'under') return `${signed(a.re)} ± ${signed(a.im)}i`;
    if (reg === 'critical') return `${signed(a.re)}`;
    return `${signed(a.re)}, ${signed(b.re)}`;
  })();
  const label = `איור חי: גוף על קפיץ עם ריסון. ${REGIME_HE[reg]}, קצב הריסון ${sci(setup.gamma)} לשנייה, התדירות העצמית ${sci(W0)} רדיאנים לשנייה. במקלדת: חיצים משנים את קצב הריסון, Enter מפעיל.`;

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
        setSetup(initialSetup());
        setPlaying(false);
        setTime(TW);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        <>
          <span class="q" data-readout="regime">
            <b>{REGIME_HE[reg]}</b>
          </span>
          <span class="q" data-readout="gamma">
            γ = <b>{signed(setup.gamma)} s⁻¹</b>
          </span>
          <span class="q" data-readout="Q">
            Q = ω₀/γ = <b>{Number.isFinite(Q) ? signed(Q) : '∞'}</b>
          </span>
          <span class="q" data-readout="roots">
            {reg === 'critical' ? 's₁ = s₂' : 's₁,₂'} = <b>{rootText} s⁻¹</b>
          </span>
          {(reg === 'under' || reg === 'undamped') && (
            <span class="q" data-readout="wd">
              ω<sub>d</sub> = <b>{signed(wd)} rad/s</b>
            </span>
          )}
          {props.decay && reg === 'under' && (
            <>
              <span class="q" data-readout="Td">
                T<sub>d</sub> = <b>{signed(Td)} s</b>
              </span>
              <span class="q" data-readout="decrement">
                Λ = <b>{signed(logDecrement(osc))}</b>
              </span>
              <span class="q" data-readout="loss">
                1 − e<sup>−γT<sub>d</sub></sup> = <b>{signed(energyLossPerCycle(osc))}</b>
              </span>
              <span class="q" data-readout="2piQ">
                2π/Q = <b>{signed((2 * Math.PI) / Q)}</b>
              </span>
              <span class="q" data-readout="cycles">
                N = t/T<sub>d</sub> = <b>{signed(shown / Td)}</b>
              </span>
              <span class="q" data-readout="env">
                e<sup>−γt/2</sup> = <b>{signed(Math.exp((-setup.gamma * shown) / 2))}</b>
              </span>
            </>
          )}
          <span class="q" data-readout="t">
            t = <b>{signed(shown)} s</b>
          </span>
          <span class="q" data-readout="x">
            x = <b>{signed(st.x, 1e-6 * X0)} m</b>
          </span>
          <span class="q" data-readout="E">
            E/E₀ = <b>{signed(Er, 1e-9)}</b>
          </span>
        </>
      }
      controls={
        <>
          <Slider label="קצב הריסון γ" value={setup.gamma} min={G_MIN} max={G_MAX} step={G_STEP} format={(x) => `${signed(x)} s⁻¹`} onChange={setGamma} />
          {props.v0Slider && <Slider label="מהירות התחלתית" value={setup.v0} min={-3} max={3} step={0.1} format={(x) => `${signed(x)} m/s`} onChange={setV0} />}
          <Slider label="זמן" value={Number(shown.toPrecision(4))} min={0} max={TW} step={TW / 600} format={(x) => `${sci(x)} s`} onChange={scrub} />
          <div class="group" role="group" aria-label="הפעלה">
            <button type="button" class="btn primary" onClick={play}>
              הפעלה
            </button>
          </div>
          {props.logToggle && (
            <div class="group" role="group" aria-label="סקאלת האנרגיה">
              <Toggle
                label="אנרגיה בסקאלה לוגריתמית"
                on={setup.log}
                swatch="var(--energy-k)"
                onChange={(on) => {
                  setSetup((s) => ({ ...s, log: on }));
                  if (on) done('log');
                }}
              />
            </div>
          )}
        </>
      }
    />
  );
}
