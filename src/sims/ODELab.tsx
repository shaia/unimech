/**
 * ODELab (lesson 0.5): two views of an ordinary differential equation.
 *
 * - mode 'field': the direction field of a first-order equation ẏ = f(t, y), a short segment of slope f at each
 *   grid point, and solution curves the learner launches from an initial condition (a slider and a button for
 *   t = 0, or a tap anywhere on the field). Presets: a coasting boat (v̇ = −v/τ), a cooling cup
 *   (Ṫ = −(T − T_env)/τ) and a draining barrel (ḣ = −k√h).
 * - mode 'roots': the second-order equation ẍ + γẋ + ω₀²x = 0. The characteristic polynomial p(s) = s² + γs + ω₀²
 *   over real s, its roots in the complex plane below it on the same real axis, and the solution x(t) for
 *   x(0) = x₀, ẋ(0) = v₀ with the two parts it is built from.
 *
 * Physics comes from src/physics/ode.ts; the curves are its closed forms. Every task ticks inside a handler of
 * the learner's own input (a launch, a slider, a tap), never from a text step.
 */

import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  charPoly,
  emptyTime,
  quarterDiscriminant,
  regime,
  relaxRhs,
  relaxSolution,
  solveSecondOrder,
  tankRhs,
  tankSolution,
  zeroCrossings,
  type Complex,
  type Rhs,
} from '~/physics/ode';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawCurve, insetBox, makePlot, niceTicks, type Box, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/* ------------------------------------------------------------------ presets of the field */

export type FieldName = 'decay' | 'cooling' | 'tank';

interface FieldPreset {
  label: string;
  /** the vertical axis title */
  yAxis: string;
  /** the equation as the readout writes it */
  eq: string;
  y: string;
  yUnit: string;
  tUnit: string;
  tMax: number;
  yMin: number;
  yMax: number;
  y0: number;
  yStep: number;
  tStep: number;
  f: Rhs;
  solve: (t0: number, y0: number) => (t: number) => number;
  /** the equilibrium value, drawn as a dashed line (none for the barrel: h = 0 is its floor) */
  yEq?: number;
  /** the time constant, for the "after τ" readout */
  tau?: number;
  /** the barrel's k */
  k?: number;
}

const TAU_BOAT = 5;
const TAU_CUP = 10;
const T_ROOM = 20;
const K_TANK = 0.02;

const FIELDS: Record<FieldName, FieldPreset> = {
  decay: {
    label: 'סירה שמאטה',
    yAxis: 'המהירות v (m/s)',
    eq: 'dv/dt = −v/τ, τ = 5 s',
    y: 'v',
    yUnit: 'm/s',
    tUnit: 's',
    tMax: 20,
    yMin: -2,
    yMax: 8,
    y0: 6,
    yStep: 0.1,
    tStep: 0.1,
    f: relaxRhs(0, TAU_BOAT),
    solve: (t0, y0) => relaxSolution(0, TAU_BOAT, t0, y0),
    yEq: 0,
    tau: TAU_BOAT,
  },
  cooling: {
    label: 'כוס תה מתקררת',
    yAxis: 'הטמפרטורה T (°C)',
    eq: 'dT/dt = −(T − 20 °C)/τ, τ = 10 min',
    y: 'T',
    yUnit: '°C',
    tUnit: 'min',
    tMax: 40,
    yMin: 0,
    yMax: 100,
    y0: 90,
    yStep: 1,
    tStep: 0.5,
    f: relaxRhs(T_ROOM, TAU_CUP),
    solve: (t0, y0) => relaxSolution(T_ROOM, TAU_CUP, t0, y0),
    yEq: T_ROOM,
    tau: TAU_CUP,
  },
  tank: {
    label: 'חבית מתרוקנת',
    yAxis: 'הגובה h (m)',
    eq: 'dh/dt = −k√h, k = 0.020 m½/s',
    y: 'h',
    yUnit: 'm',
    tUnit: 's',
    tMax: 150,
    yMin: 0,
    yMax: 1.2,
    y0: 1,
    yStep: 0.01,
    tStep: 1,
    f: tankRhs(K_TANK),
    solve: (t0, y0) => tankSolution(K_TANK, t0, y0),
    k: K_TANK,
  },
};

const MAX_CURVES = 6;

const FIELD_TASKS: Record<string, string> = {
  three: 'שגרו שלושה פתרונות באותו שדה, מתנאי התחלה שונים. האם שתי עקומות נחתכות?',
  equilibrium: 'בכוס התה, מצאו תנאי התחלה שבו הטמפרטורה לא משתנה בכלל.',
  cold: 'בכוס התה, שגרו משקה קר, מתחת לטמפרטורת החדר. לאן הוא שואף, ומאיזה כיוון?',
  'tank-four': 'בחבית, שגרו שני פתרונות מהכפתור, אחד מגובה גדול פי 4 מהשני. פי כמה ארוך זמן ההתרוקנות?',
};

const ROOT_TASKS: Record<string, string> = {
  double: 'הזיזו את γ עד ששני השורשים נפגשים בשורש כפול. מה היחס בין γ ל-ω₀ אז?',
  'no-damping': 'קבעו את קצב הריסון לאפס. איפה השורשים עכשיו, ומה קורה לאמפליטודה?',
  'over-cross': 'כשיש שני שורשים ממשיים, מצאו מהירות התחלתית שבה הגוף עובר את שיווי המשקל. כמה פעמים הוא עובר אותו?',
};

/* ------------------------------------------------------------------ state */

interface Curve {
  t0: number;
  y0: number;
  /** launched by the learner (not by a text step) */
  user: boolean;
}

interface State {
  preset: FieldName;
  y0: number;
  curves: Curve[];
  gamma: number;
  omega0: number;
  v0: number;
}

export interface ODELabProps {
  id: string;
  mode: 'field' | 'roots';
  /** field: the starting preset and the presets offered as buttons */
  preset?: FieldName;
  presets?: FieldName[];
  /** field: curves drawn at the start, as [t₀, y₀] */
  curves?: [number, number][];
  /** roots: γ [1/s], ω₀ [rad/s], x₀ [m], v₀ [m/s] */
  gamma?: number;
  omega0?: number;
  x0?: number;
  v0?: number;
  tasks?: string[];
}

function initial(p: ODELabProps): State {
  const preset = p.preset ?? 'cooling';
  return {
    preset,
    y0: FIELDS[preset].y0,
    curves: (p.curves ?? []).map(([t0, y0]) => ({ t0, y0, user: false })),
    gamma: p.gamma ?? 1,
    omega0: p.omega0 ?? 3,
    v0: p.v0 ?? 0,
  };
}

/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const num = (x: number, tiny = 1e-9) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));
const snap = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const complexText = (z: Complex) => {
  const re = Math.abs(z.re) < 1e-12 ? 0 : z.re;
  const im = Math.abs(z.im) < 1e-12 ? 0 : z.im;
  if (im === 0) return num(re);
  const imag = `${num(Math.abs(im))}i`;
  if (re === 0) return im > 0 ? imag : `−${imag}`;
  return `${num(re)} ${im > 0 ? '+' : '−'} ${imag}`;
};

/* ------------------------------------------------------------------ the component */

export default function ODELab(props: ODELabProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const [narrow, setNarrow] = useState(false);
  const field = props.mode === 'field';
  const F = FIELDS[s.preset];
  const x0 = props.x0 ?? 0.1;
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: (field ? FIELD_TASKS : ROOT_TASKS)[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  const sol = useMemo(() => solveSecondOrder(s.gamma, s.omega0 * s.omega0, x0, s.v0), [s.gamma, s.omega0, s.v0, x0]);
  const crossings = useMemo(() => zeroCrossings(sol, 50), [sol]);
  const T_WINDOW = 5;

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev };
          if (typeof step.preset === 'string' && step.preset in FIELDS && step.preset !== prev.preset) {
            next.preset = step.preset as FieldName;
            next.y0 = FIELDS[next.preset].y0;
            next.curves = [];
          }
          if (Array.isArray(step.curves)) {
            next.curves = (step.curves as [number, number][]).map(([t0, y0]) => ({ t0, y0, user: false }));
          }
          if (typeof step.y0 === 'number') next.y0 = step.y0;
          for (const k of ['gamma', 'omega0', 'v0'] as const) if (typeof step[k] === 'number') next[k] = step[k] as number;
          return next;
        });
      }),
    [props.id],
  );

  /* ---------------------------------------------------------------- layout */

  const fieldLayout = (w: number, h: number) => insetBox({ x: 0, y: 0, w, h }, { l: 54, r: 16, t: 40, b: 46 });

  const rootsLayout = (w: number, h: number) => {
    if (w >= 520) {
      const split = Math.round(w * 0.54);
      return {
        x: insetBox({ x: 0, y: 0, w: split, h }, { l: 56, r: 14, t: 16, b: 46 }),
        p: insetBox({ x: split, y: 0, w: w - split, h: h * 0.5 }, { l: 46, r: 14, t: 52, b: 30 }),
        c: insetBox({ x: split, y: h * 0.5, w: w - split, h: h * 0.5 }, { l: 46, r: 14, t: 10, b: 30 }),
      };
    }
    const hx = h * 0.4;
    const hp = h * 0.28;
    return {
      x: insetBox({ x: 0, y: 0, w, h: hx }, { l: 56, r: 14, t: 46, b: 44 }),
      p: insetBox({ x: 0, y: hx, w, h: hp }, { l: 46, r: 14, t: 26, b: 28 }),
      c: insetBox({ x: 0, y: hx + hp, w, h: h - hx - hp }, { l: 46, r: 14, t: 8, b: 30 }),
    };
  };

  /* ---------------------------------------------------------------- drawing */

  const drawField = (ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette) => {
    const box = fieldLayout(w, h);
    const plot = makePlot(
      box,
      { min: 0, max: F.tMax, label: `הזמן t (${F.tUnit})` },
      { min: F.yMin, max: F.yMax, label: F.yAxis },
    );
    drawAxes(ctx, plot, p, { grid: false });

    // the direction field: a short segment of slope f(t, y) at each grid point, equal length on screen
    const nx = w < 520 ? 12 : 20;
    const ny = w < 520 ? 10 : 13;
    const cell = Math.min(box.w / nx, box.h / ny);
    const L = cell * 0.36;
    const kx = box.w / F.tMax; // px per unit t
    const ky = box.h / (F.yMax - F.yMin); // px per unit y
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink3, 0.75);
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const t = ((i + 0.5) / nx) * F.tMax;
        const y = F.yMin + ((j + 0.5) / ny) * (F.yMax - F.yMin);
        const m = F.f(t, y);
        const dx = kx;
        const dy = -m * ky;
        const d = Math.hypot(dx, dy) || 1;
        const cx = plot.px(t);
        const cy = plot.py(y);
        ctx.beginPath();
        ctx.moveTo(cx - (L * dx) / d, cy - (L * dy) / d);
        ctx.lineTo(cx + (L * dx) / d, cy + (L * dy) / d);
        ctx.stroke();
      }
    }
    ctx.restore();

    // the equilibrium solution, dashed
    if (F.yEq !== undefined) {
      const Y = plot.py(F.yEq);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink2, 0.8);
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(box.x, Y);
      ctx.lineTo(box.x + box.w, Y);
      ctx.stroke();
      ctx.restore();
      halo(ctx, p, `${F.y} = ${num(F.yEq)} ${F.yUnit}`, box.x + box.w - 4, Y - 10, p.ink2, 'right');
    }

    // the solution curves: older ones faint, the newest bold, each with its starting point
    s.curves.forEach((c, i) => {
      const newest = i === s.curves.length - 1;
      const color = newest ? p.accent : withAlpha(p.accent, 0.5);
      drawCurve(ctx, plot, F.solve(c.t0, c.y0), { color, width: newest ? 2.8 : 1.8, samples: 300 });
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = p.paper;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(plot.px(c.t0), plot.py(c.y0), newest ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // the barrel empties at a finite time: mark it on the axis
      if (F.k !== undefined && c.y0 > 0) {
        const tE = c.t0 + emptyTime(F.k, c.y0);
        if (tE <= F.tMax) {
          const X = plot.px(tE);
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(X, plot.py(0));
          ctx.lineTo(X, plot.py(0) - 26);
          ctx.stroke();
          ctx.restore();
          if (newest) halo(ctx, p, `${num(tE)} s`, X, plot.py(0) - 34, p.accent);
        }
      }
    });
  };

  const drawRoots = (ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette) => {
    const lay = rootsLayout(w, h);
    const w2 = s.omega0 * s.omega0;

    /* ---- x(t) and its two parts */
    let xm = Math.abs(x0);
    for (let i = 0; i <= 200; i++) {
      const t = (T_WINDOW * i) / 200;
      xm = Math.max(xm, Math.abs(sol.x(t)));
    }
    const top = niceCeil(xm * 1.15);
    const xp = makePlot(lay.x, { min: 0, max: T_WINDOW, label: 'הזמן t (s)' }, { min: -top, max: top, label: 'ההעתק x (m)', ticks: niceTicks(-top, top, 4) });
    drawAxes(ctx, xp, p);
    hzero(ctx, xp, p);
    const partColor = withAlpha(p.accent, 0.85);
    if (sol.envelope) {
      const env = sol.envelope;
      drawCurve(ctx, xp, (t) => env(t), { color: withAlpha(p.ink3, 0.9), width: 1.3, dash: [5, 4] });
      drawCurve(ctx, xp, (t) => -env(t), { color: withAlpha(p.ink3, 0.9), width: 1.3, dash: [5, 4] });
    } else {
      drawCurve(ctx, xp, sol.parts[0], { color: partColor, width: 1.6, dash: [6, 4] });
      drawCurve(ctx, xp, sol.parts[1], { color: partColor, width: 1.6, dash: [2, 3] });
    }
    drawCurve(ctx, xp, sol.x, { color: p.ink, width: 2.6, samples: 400 });

    /* ---- p(s) over real s */
    const sMin = -13;
    const sMax = 3;
    const pMin = w2 - (s.gamma * s.gamma) / 4;
    const yHi = Math.max(2.4 * w2, 15);
    const yLo = Math.min(-0.35 * yHi, 1.2 * pMin);
    const pp = makePlot(lay.p, { min: sMin, max: sMax, ticks: [-12, -9, -6, -3, 0, 3] }, { min: yLo, max: yHi, ticks: niceTicks(yLo, yHi, 3) });
    drawAxes(ctx, pp, p);
    hzero(ctx, pp, p);
    drawCurve(ctx, pp, (x) => charPoly(s.gamma, w2, x), { color: p.ink, width: 2.2, samples: 240 });
    halo(ctx, p, 'p(s) = s² + γs + ω₀²', lay.p.x + 6, lay.p.y - 12, p.ink2, 'left');
    // the vertex at s = −γ/2: its height is ω₀² − γ²/4
    const vx = pp.px(-s.gamma / 2);
    const vy = pp.py(pMin);
    dot(ctx, vx, vy, 4, p.ink2, p);
    const reg = regime(s.gamma, w2);
    if (reg === 'under' && pMin > 0) {
      // the height of the vertex above the axis is ω_d²
      arrow(ctx, vx, pp.py(0), vx, vy + 4, { color: p.accent, width: 1.6, head: 7 });
      omegaD2(ctx, p, vx + 8, (pp.py(0) + vy) / 2);
    }
    const [r1, r2] = sol.roots;
    if (reg !== 'under') for (const r of [r1, r2]) if (r.re >= sMin) dot(ctx, pp.px(r.re), pp.py(0), 5.5, p.accent, p);

    /* ---- the complex plane, on the same real axis */
    const imR = Math.max(1.3 * s.omega0, 2);
    const cp = makePlot(lay.c, { min: sMin, max: sMax, ticks: [-12, -9, -6, -3, 0, 3] }, { min: -imR, max: imR, ticks: niceTicks(-imR, imR, 4) });
    drawAxes(ctx, cp, p, { grid: false });
    hzero(ctx, cp, p);
    vzero(ctx, cp, p);
    halo(ctx, p, 'Re s (1/s)', lay.c.x + lay.c.w - 2, lay.c.y + lay.c.h + 22, p.ink2, 'right');
    halo(ctx, p, 'Im s', cp.px(0) + 6, lay.c.y + 9, p.ink2, 'left');
    // the guide from the vertex down to the real part of the roots
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink3, 0.8);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(vx, cp.py(0));
    ctx.stroke();
    ctx.restore();
    const plotRoot = (r: Complex, name: string, above: boolean) => {
      if (r.re < sMin) {
        const y = cp.py(r.im);
        arrow(ctx, lay.c.x + 24, y, lay.c.x + 3, y, { color: p.accent, width: 2.2, head: 8 });
        halo(ctx, p, `${name} = ${num(r.re)}`, lay.c.x + 28, y + (above ? -12 : 12), p.accent, 'left');
        return;
      }
      const X = cp.px(r.re);
      const Y = cp.py(clamp(r.im, -imR, imR));
      dot(ctx, X, Y, 6, p.accent, p);
      halo(ctx, p, name, X + (r.im === 0 ? 0 : -10), Y + (above ? -14 : 14), p.accent, r.im === 0 ? 'center' : 'right');
    };
    if (reg === 'critical') {
      plotRoot(r1, 's₁ = s₂', true);
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cp.px(r1.re), cp.py(0), 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      plotRoot(r1, 's₁', true);
      plotRoot(r2, 's₂', false);
    }
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    if (field) drawField(ctx, view.w, view.h, p);
    else drawRoots(ctx, view.w, view.h, p);
  };

  const aspect = field ? (narrow ? 1.0 : 1.6) : narrow ? 0.66 : 1.55;
  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1 / aspect, animate: false });
  useEffect(invalidate, [s, sol, narrow]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.getBoundingClientRect().width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------------------------------------------------------------- input (every task ticks here) */

  const launch = (t0: number, y0: number) => {
    const c: Curve = { t0: snap(clamp(t0, 0, F.tMax), F.tStep), y0: snap(clamp(y0, F.yMin, F.yMax), F.yStep), user: true };
    const curves = [...s.curves, c].slice(-MAX_CURVES);
    setS({ ...s, curves });
    setLive(`פתרון חדש מ-${F.y}(${num(c.t0)} ${F.tUnit}) = ${num(c.y0)} ${F.yUnit}.`);
    const mine = curves.filter((k) => k.user);
    if (mine.length >= 3) done('three');
    if (s.preset === 'cooling' && Math.abs(c.y0 - T_ROOM) <= 0.5) done('equilibrium');
    if (s.preset === 'cooling' && c.y0 < T_ROOM - 0.5) done('cold');
    if (s.preset === 'tank') {
      const starts = mine.filter((k) => k.t0 === 0 && k.y0 > 0).map((k) => k.y0);
      if (starts.some((a) => starts.some((b) => a / b >= 3.6 && a / b <= 4.4))) done('tank-four');
    }
  };

  const choosePreset = (preset: FieldName) => {
    setS({ ...s, preset, y0: FIELDS[preset].y0, curves: [] });
    setLive(`נבחר השדה: ${FIELDS[preset].label}. ${FIELDS[preset].eq}.`);
  };

  const setRoots = (patch: Partial<Pick<State, 'gamma' | 'omega0' | 'v0'>>) => {
    const next = { ...s, ...patch };
    setS(next);
    const w2 = next.omega0 * next.omega0;
    const reg = regime(next.gamma, w2);
    if (reg === 'critical') done('double');
    if (next.gamma === 0) done('no-damping');
    if (reg === 'over' && zeroCrossings(solveSecondOrder(next.gamma, w2, x0, next.v0)).length === 1) done('over-cross');
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!field) return;
    const view = viewRef.current;
    if (!view) return;
    const b = fieldLayout(view.w, view.h);
    if (e.offsetX < b.x || e.offsetX > b.x + b.w || e.offsetY < b.y || e.offsetY > b.y + b.h) return;
    const t = ((e.offsetX - b.x) / b.w) * F.tMax;
    const y = F.yMax - ((e.offsetY - b.y) / b.h) * (F.yMax - F.yMin);
    launch(t, y);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (field) {
      if (e.key === 'Enter' || e.key === ' ') launch(0, s.y0);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const y0 = snap(clamp(s.y0 + (e.key === 'ArrowUp' ? 1 : -1) * F.yStep * 10, F.yMin, F.yMax), F.yStep);
        setS({ ...s, y0 });
        setLive(`${F.y}(0) = ${num(y0)} ${F.yUnit}`);
      } else return;
    } else {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') setRoots({ gamma: snap(clamp(s.gamma + (e.key === 'ArrowUp' ? 0.1 : -0.1), 0, 12), 0.1) });
      else return;
    }
    e.preventDefault();
  };

  const reset = () => {
    setS(initial(props));
    setLive('האיור חזר למצב ההתחלה.');
  };

  /* ---------------------------------------------------------------- readouts */

  const last = s.curves[s.curves.length - 1];
  const regimeText = () => {
    const reg = regime(s.gamma, s.omega0 * s.omega0);
    if (reg === 'over') return 'שני שורשים ממשיים ושליליים: דעיכה בלי תנודה';
    if (reg === 'critical') return 'שורש כפול: דעיכה בלי תנודה, הכי מהר';
    if (s.gamma === 0) return 'שורשים מדומים: תנודה שלא דועכת';
    return 'שורשים מרוכבים: תנודה דועכת';
  };
  const describe = () =>
    field
      ? `${F.label}: ${F.eq}. ${s.curves.length} עקומות פתרון.` +
        (last ? ` האחרונה יוצאת מ-${F.y} = ${num(last.y0)} ${F.yUnit} ברגע t = ${num(last.t0)} ${F.tUnit}.` : '')
      : `ẍ + γẋ + ω₀²x = 0 עם γ = ${num(s.gamma)} 1/s ו-ω₀ = ${num(s.omega0)} rad/s. השורשים ${complexText(sol.roots[0])} ו-${complexText(sol.roots[1])}. ${regimeText()}.`;

  const fieldReadout = () => {
    const out = [
      <span class="q" data-readout="eq" key="eq">
        {F.eq}
      </span>,
      <span data-readout="count" key="count">
        עקומות: <bdi class="q">{s.curves.length}</bdi>
      </span>,
    ];
    if (last) {
      const y = F.solve(last.t0, last.y0);
      out.push(
        <b class="q" data-readout="ic" key="ic">
          {F.y}({num(last.t0)} {F.tUnit}) = {num(last.y0)} {F.yUnit}
        </b>,
        <span data-readout="slope" key="slope">
          השיפוע שם: <bdi class="q">{num(F.f(last.t0, last.y0))} {F.yUnit}/{F.tUnit}</bdi>
        </span>,
      );
      if (F.tau !== undefined)
        out.push(
          <span data-readout="later" key="later">
            אחרי קבוע זמן: <bdi class="q">{F.y} = {num(y(last.t0 + F.tau))} {F.yUnit}</bdi>
          </span>,
        );
      if (F.k !== undefined)
        out.push(
          <span data-readout="empty" key="empty">
            {last.y0 > 0 ? (
              <>
                מתרוקנת ברגע <bdi class="q">t = {num(last.t0 + emptyTime(F.k, last.y0))} s</bdi>
              </>
            ) : (
              'ריקה כל הזמן'
            )}
          </span>,
        );
    }
    return out;
  };

  const rootsReadout = () => {
    const [r1, r2] = sol.roots;
    const reg = sol.regime;
    const inWindow = crossings.filter((t) => t <= T_WINDOW).length;
    return (
      <>
        <span class="q" data-readout="eq">
          γ = {num(s.gamma)} 1/s, ω₀ = {num(s.omega0)} rad/s, x₀ = {num(x0)} m, v₀ = {num(s.v0)} m/s
        </span>
        <b class="q" data-readout="roots">
          {reg === 'critical' ? `s₁ = s₂ = ${complexText(r1)}` : `s₁ = ${complexText(r1)}, s₂ = ${complexText(r2)}`} 1/s
        </b>
        <span class="q" data-readout="disc">
          γ²/4 − ω₀² = {num(quarterDiscriminant(s.gamma, s.omega0 * s.omega0), 1e-9)} 1/s²
        </span>
        <span data-readout="regime">{regimeText()}</span>
        <span data-readout="crossings">
          מעברים דרך <bdi class="q">x = 0</bdi> עד <bdi class="q">t = {T_WINDOW} s</bdi>: <bdi class="q">{inWindow}</bdi>
        </span>
      </>
    );
  };

  /* ---------------------------------------------------------------- render */

  const presets = props.presets ?? [];
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${describe()} ${field ? 'הקשה על השדה משגרת פתרון מאותה נקודה; Enter משגר פתרון מהרגע אפס, חץ למעלה ולמטה משנה את ערך ההתחלה.' : 'חץ למעלה ולמטה משנה את γ.'}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      cursor={field ? 'crosshair' : 'default'}
      readout={field ? fieldReadout() : rootsReadout()}
      controls={
        field ? (
          <>
            {presets.length > 1 && (
              <div class="group" role="group" aria-label="בחירת משוואה">
                {presets.map((name) => (
                  <Toggle key={name} label={FIELDS[name].label} on={s.preset === name} onChange={() => choosePreset(name)} />
                ))}
              </div>
            )}
            <Slider
              label={`ערך ההתחלה ${F.y}(0)`}
              min={F.yMin}
              max={F.yMax}
              step={F.yStep}
              value={s.y0}
              format={(v) => `${num(v)} ${F.yUnit}`}
              onChange={(v) => setS({ ...s, y0: snap(v, F.yStep) })}
            />
            <div class="group" role="group" aria-label="פתרונות">
              <button type="button" class="toggle" onClick={() => launch(0, s.y0)}>
                שגרו פתרון מההתחלה
              </button>
              <button type="button" class="toggle" onClick={() => setS({ ...s, curves: [] })}>
                ניקוי העקומות
              </button>
            </div>
          </>
        ) : (
          <>
            <Slider label="קצב הריסון γ" min={0} max={12} step={0.1} value={s.gamma} format={(v) => `${num(v)} 1/s`} onChange={(v) => setRoots({ gamma: snap(v, 0.1) })} />
            <Slider label="התדירות העצמית ω₀" min={1} max={6} step={0.1} value={s.omega0} format={(v) => `${num(v)} rad/s`} onChange={(v) => setRoots({ omega0: snap(v, 0.1) })} />
            <Slider label="המהירות ההתחלתית v₀" min={-3} max={3} step={0.1} value={s.v0} format={(v) => `${num(v)} m/s`} onChange={(v) => setRoots({ v0: snap(v, 0.1) })} />
          </>
        )
      }
    />
  );
}

/* ------------------------------------------------------------------ drawing helpers */

/** The smallest of 1, 2, 2.5, 5 × 10ⁿ at or above x. */
function niceCeil(x: number): number {
  if (!(x > 0)) return 1;
  const e = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * e >= x * (1 - 1e-9)) return m * e;
  return 10 * e;
}

/** Canvas text with a paper halo (Latin and math labels only). */
function halo(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center') {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.font = `600 12.5px ${p.fontUi}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = withAlpha(p.paper, 0.92);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** "ω_d²" with a real subscript, left-aligned at (x, y). */
function omegaD2(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = withAlpha(p.paper, 0.92);
  ctx.fillStyle = p.accent;
  ctx.font = `italic 700 13px ${p.fontUi}`;
  ctx.strokeText('ω', x, y);
  ctx.fillText('ω', x, y);
  const w = ctx.measureText('ω').width;
  ctx.font = `italic 700 10px ${p.fontUi}`;
  ctx.strokeText('d', x + w, y + 4);
  ctx.fillText('d', x + w, y + 4);
  ctx.strokeText('2', x + w + 1, y - 5);
  ctx.fillText('2', x + w + 1, y - 5);
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, p: Palette) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** The line y = 0 across a plot, a little darker than the grid. */
function hzero(ctx: CanvasRenderingContext2D, plot: Plot, p: Palette) {
  if (plot.y.min > 0 || plot.y.max < 0) return;
  const Y = plot.py(0);
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(plot.box.x, Y);
  ctx.lineTo(plot.box.x + plot.box.w, Y);
  ctx.stroke();
  ctx.restore();
}

function vzero(ctx: CanvasRenderingContext2D, plot: Plot, p: Palette) {
  const X = plot.px(0);
  const b: Box = plot.box;
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(X, b.y);
  ctx.lineTo(X, b.y + b.h);
  ctx.stroke();
  ctx.restore();
}
