/**
 * SpringOscillator (lesson 5.1): a body on a spring, horizontal or hanging, with its displacement traced live.
 *
 * Horizontal mode: a wall, one spring (or two identical springs in series or in parallel) and a block on a smooth
 * floor. Under the block a chart whose time axis runs DOWN the page: the trace x(t) hangs under the block, on the
 * same x scale, so the trace is literally where the block was at each moment.
 * Vertical mode: a ceiling, a spring and a hanging block, with the axis UP; beside it a chart whose time axis runs to
 * the right, on the same height scale. The vertical position y is measured up from the relaxed-length point, so the
 * equilibrium sits at y = −Δ, Δ = mg/k; the gravity chips (Earth, Moon, none) move the equilibrium, never ω₀.
 *
 * The learner sets m, k, x₀ and v₀ (x is the displacement from the equilibrium) and reads ω₀, T, A and φ. The
 * reference circle (a toggle) shows the point P = (x, −v/ω₀) turning at ω₀: its radius is A, its starting angle φ,
 * and its projection on the x axis is the block.
 *
 * Physics: src/physics/oscillator.ts (freeMotion, amplitudePhase) and src/physics/shm.ts (springs, the vertical
 * spring, the reference circle). Tasks tick only inside the learner's own handlers (sliders, chips, buttons);
 * a text step only sets the state and the instant shown, and never plays or ticks.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import { amplitudePhase, freeMotion, naturalFrequency, periodOf, staticStretch } from '~/physics/oscillator';
import { arrangementK, moonGravity, referencePoint, wrapPhase, type Arrangement } from '~/physics/shm';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import type { Box } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Gravity = 'earth' | 'moon' | 'none';
export type Mode = 'horizontal' | 'vertical';

const G_OF: Record<Gravity, number> = { earth: G, moon: moonGravity(), none: 0 };
const G_LABEL: Record<Gravity, string> = { earth: 'כדור הארץ', moon: 'הירח', none: 'בלי כובד' };
const ARR_LABEL: Record<Arrangement, string> = { single: 'קפיץ אחד', series: 'שניים בטור', parallel: 'שניים במקביל' };

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  outward: `התחילו את הגוף מחוץ לנקודת שיווי המשקל, כשהוא נע החוצה (${ltr('x₀')} ו-${ltr('v₀')} באותו סימן), והפעילו. האם הוא נעצר ב-${ltr('x₀')}?`,
  'phase-half-pi': `מצאו תנאי התחלה שנותנים פאזה ${ltr('φ = +π/2')}.`,
  'amplitude-20': `כוונו את ${ltr('x₀')} ואת ${ltr('v₀')}, שניהם שונים מאפס, כך שהאמפליטודה תהיה ${ltr('A = 0.20 m')}.`,
  'series-parallel': 'הפעילו את התנודה פעם עם שני קפיצים בטור ופעם עם שניים במקביל, והשוו את זמני המחזור.',
  'natural-release': 'לחצו "שחרור מהאורך הרפוי" והפעילו: הגוף משוחרר ממנוחה כשהקפיץ רפוי.',
  lowest: 'אחרי שחרור מהאורך הרפוי, הזיזו את פס הזמן לנקודה הנמוכה ביותר. מה ההתארכות שם?',
  moon: 'עברו לירח והפעילו. מה קרה לנקודת שיווי המשקל, ומה לזמן המחזור?',
};

export interface SpringOscillatorProps {
  id: string;
  mode?: Mode;
  /** the arrangement shown first, and the chips offered (horizontal mode) */
  arrangement?: Arrangement;
  arrangements?: Arrangement[];
  /** mass [kg] and the constant of each spring [N/m] */
  m?: number;
  k?: number;
  /** initial displacement from the equilibrium [m] and velocity [m/s], positive right (horizontal) or up (vertical) */
  x0?: number;
  v0?: number;
  /** gravity (vertical mode) */
  g?: Gravity;
  /** what is drawn at the start */
  circle?: boolean;
  arrows?: boolean;
  /** the time the chart covers [s] */
  tWindow?: number;
  tasks?: string[];
}

interface Setup {
  arrangement: Arrangement;
  m: number;
  k: number;
  x0: number;
  v0: number;
  g: Gravity;
}

interface Limits {
  m: [number, number];
  k: [number, number];
  x0: [number, number];
  v0: [number, number];
}

const LIMITS: Record<Mode, Limits> = {
  horizontal: { m: [0.2, 2], k: [5, 80], x0: [-0.2, 0.2], v0: [-1.5, 1.5] },
  vertical: { m: [0.1, 0.5], k: [20, 50], x0: [-0.2, 0.2], v0: [-1.5, 1.5] },
};
/** half the range of x drawn (horizontal), and the y range drawn (vertical) [m] */
const X_HALF = 0.25;
const Y_RANGE: [number, number] = [-0.55, 0.15];
const N_SAMPLES = 700;
/** the amplitude drawn at full radius on the reference circle [m] */
const A_REF = 0.15;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 1e-9) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));
const isArrangement = (x: unknown): x is Arrangement => x === 'single' || x === 'series' || x === 'parallel';
const isGravity = (x: unknown): x is Gravity => x === 'earth' || x === 'moon' || x === 'none';

interface Derived {
  kEq: number;
  w: number;
  T: number;
  A: number;
  phi: number;
  /** static stretch Δ (vertical; 0 horizontal) */
  D: number;
}

function derive(mode: Mode, s: Setup): Derived {
  const kEq = mode === 'horizontal' ? arrangementK(s.arrangement, s.k) : s.k;
  const w = naturalFrequency(kEq, s.m);
  const { A, phi } = amplitudePhase(w, s.x0, s.v0);
  const D = mode === 'vertical' ? staticStretch(s.m, s.k, G_OF[s.g]) : 0;
  return { kEq, w, T: periodOf(w), A, phi: wrapPhase(phi), D };
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
  ctx.strokeStyle = withAlpha(p.paper, 0.92);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** A Hebrew note on a small paper patch, so a trace under it does not cut through the letters. */
function patchNote(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.font = `500 ${size}px ${p.fontHand}`;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = withAlpha(p.paper, 0.85);
  ctx.fillRect(x - w / 2 - 3, y - size * 0.62, w + 6, size * 1.24);
  ctx.restore();
  handNote(ctx, text, x, y, p, size);
}

/** A coil spring from (x1, y1) to (x2, y2): short straight leads and a zigzag of `coils` turns between them. */
function spring(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, amp: number, coils = 9) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 1) return;
  const ux = (x2 - x1) / L;
  const uy = (y2 - y1) / L;
  const nx = -uy;
  const ny = ux;
  const lead = Math.min(8, 0.15 * L);
  const body = L - 2 * lead;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + ux * lead, y1 + uy * lead);
  const n = coils * 2;
  for (let i = 1; i < n; i++) {
    const d = lead + (body * i) / n;
    const side = i % 2 === 1 ? 1 : -1;
    ctx.lineTo(x1 + ux * d + nx * amp * side, y1 + uy * d + ny * amp * side);
  }
  ctx.lineTo(x2 - ux * lead, y2 - uy * lead);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** A hatched wall (vertical line) or ceiling (horizontal line). */
function support(ctx: CanvasRenderingContext2D, p: Palette, x1: number, y1: number, x2: number, y2: number, side: 'left' | 'up') {
  ctx.save();
  ctx.strokeStyle = p.equip || p.ink2;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.lineWidth = 1;
  const L = Math.hypot(x2 - x1, y2 - y1);
  for (let d = 4; d < L; d += 7) {
    if (side === 'left') {
      ctx.beginPath();
      ctx.moveTo(x1, y1 + d);
      ctx.lineTo(x1 - 6, y1 + d + 6);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x1 + d, y1);
      ctx.lineTo(x1 + d - 6, y1 - 6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function dashed(ctx: CanvasRenderingContext2D, color: string, x1: number, y1: number, x2: number, y2: number, width = 1.1, dash: number[] = [5, 4]) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Round ticks across [lo, hi]. */
function ticks(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9; k++) out.push(Number((k * step).toPrecision(10)));
  return out;
}

export default function SpringOscillator(props: SpringOscillatorProps) {
  const mode: Mode = props.mode ?? 'horizontal';
  const lim = LIMITS[mode];
  const tWindow = props.tWindow ?? (mode === 'horizontal' ? 6 : 4);
  const offered: Arrangement[] = props.arrangements ?? [props.arrangement ?? 'single'];

  const initialSetup = (): Setup => ({
    arrangement: props.arrangement ?? offered[0],
    m: clamp(props.m ?? (mode === 'horizontal' ? 0.8 : 0.3), ...lim.m),
    k: clamp(props.k ?? 20, ...lim.k),
    x0: clamp(props.x0 ?? 0.1, ...lim.x0),
    v0: clamp(props.v0 ?? 0, ...lim.v0),
    g: props.g ?? 'earth',
  });

  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [show, setShow] = useState({ circle: props.circle ?? false, arrows: props.arrows ?? true });
  /** the instant shown when nothing is moving [s] */
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  /** the arrangements the learner has played (for the series-parallel task) */
  const playedArr = useRef(new Set<Arrangement>());
  /** whether the last release was the learner's natural-length release (for the lowest-point task) */
  const naturalRun = useRef(false);

  const d = derive(mode, setup);
  const trace = useMemo(() => {
    const out: { t: number; x: number; v: number }[] = [];
    for (let i = 0; i <= N_SAMPLES; i++) {
      const t = (tWindow * i) / N_SAMPLES;
      const s = freeMotion({ omega0: d.w }, { x: setup.x0, v: setup.v0 }, t);
      out.push({ t, x: s.x, v: s.v });
    }
    return out;
  }, [d.w, setup.x0, setup.v0, tWindow]);

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the setup, what is drawn and the instant shown; they never play and never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setPlaying(false);
        naturalRun.current = false;
        setSetup((prev) => ({
          arrangement: isArrangement(st.arrangement) ? st.arrangement : prev.arrangement,
          m: clamp(num(st.m) ?? prev.m, ...lim.m),
          k: clamp(num(st.k) ?? prev.k, ...lim.k),
          x0: clamp(num(st.x0) ?? prev.x0, ...lim.x0),
          v0: clamp(num(st.v0) ?? prev.v0, ...lim.v0),
          g: isGravity(st.g) ? st.g : prev.g,
        }));
        setShow((prev) => ({ circle: bool(st.circle) ?? prev.circle, arrows: bool(st.arrows) ?? prev.arrows }));
        setTime(clamp(num(st.t) ?? 0, 0, tWindow));
      }),
    [props.id],
  );

  const describe = (s: Setup, dd: Derived) => {
    const base = `האמפליטודה ${sci(dd.A)} מטר, הפאזה ${signed(dd.phi)} רדיאן, וזמן המחזור ${sci(dd.T)} שניות.`;
    if (mode === 'vertical') return `הגוף התנודד סביב נקודת שיווי המשקל, בהתארכות ${sci(dd.D)} מטר. ${base}`;
    return `הגוף התנודד עם ${ARR_LABEL[s.arrangement]}. ${base}`;
  };

  const stop = () => {
    setPlaying(false);
    setTime(tWindow);
    setLive(describe(setup, d));
  };

  /** the learner's play button: ticks the tasks that are about a release */
  const play = () => {
    const dd = derive(mode, setup);
    if (setup.x0 * setup.v0 > 0) done('outward');
    if (mode === 'horizontal') {
      playedArr.current.add(setup.arrangement);
      if (playedArr.current.has('series') && playedArr.current.has('parallel')) done('series-parallel');
    } else {
      const natural = setup.g !== 'none' && Math.abs(setup.x0 - dd.D) < 0.005 && setup.v0 === 0;
      naturalRun.current = natural;
      if (natural) done('natural-release');
      if (setup.g === 'moon') done('moon');
    }
    t0.current = null;
    if (!motionAllowed()) {
      stop();
      return;
    }
    setTime(0);
    setPlaying(true);
    setLive('הגוף מתנודד.');
  };

  /* ---------------------------------------------------------------- layout */

  interface Layout {
    narrow: boolean;
    main: Box;
    circle: Box | null;
  }
  const layoutOf = (view: { w: number; h: number }): Layout => {
    const narrow = view.w < 520;
    const full: Box = { x: 0, y: 0, w: view.w, h: view.h };
    if (!show.circle) return { narrow, main: full, circle: null };
    if (narrow) {
      const ch = Math.round(view.h * 0.3);
      return { narrow, main: { ...full, h: view.h - ch }, circle: { x: 0, y: view.h - ch, w: view.w, h: ch } };
    }
    const cw = Math.round(view.w * 0.28);
    return { narrow, main: { ...full, w: view.w - cw }, circle: { x: view.w - cw, y: 0, w: cw, h: view.h } };
  };

  /* ---------------------------------------------------------------- drawing */

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    let now = clamp(time, 0, tWindow);
    if (playing) {
      if (t0.current === null) t0.current = t;
      now = Math.min(t - t0.current, tWindow);
      if (now >= tWindow) stop();
    }
    const L = layoutOf(view);
    const fs = L.narrow ? 11 : 12;
    const st = freeMotion({ omega0: d.w }, { x: setup.x0, v: setup.v0 }, now);
    const iNow = Math.min(N_SAMPLES, Math.floor((now / tWindow) * N_SAMPLES));
    if (mode === 'horizontal') drawHorizontal(ctx, p, L, fs, now, st, iNow);
    else drawVertical(ctx, p, L, fs, now, st, iNow);
    if (L.circle) drawCircle(ctx, p, L.circle, fs, now);
  };

  const traceStroke = (ctx: CanvasRenderingContext2D, p: Palette, pt: (q: { t: number; x: number }) => [number, number], iNow: number, now: number, nowX: number, clip: Box) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.w, clip.h);
    ctx.clip();
    // the whole run, faint: what will happen
    ctx.strokeStyle = withAlpha(p.ink3, 0.55);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    trace.forEach((q, i) => {
      const [X, Y] = pt(q);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.stroke();
    // up to now, bold: what has happened
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= iNow; i++) {
      const [X, Y] = pt(trace[i]);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    const [Xn, Yn] = pt({ t: now, x: nowX });
    ctx.lineTo(Xn, Yn);
    ctx.stroke();
    ctx.restore();
  };

  /** arrow length for a value against its largest value over the motion: up to `full` px, at least 14 px */
  const arrowLen = (val: number, top: number, full: number) => (Math.abs(val) < 0.01 * top || top <= 0 ? 0 : Math.sign(val) * Math.max(14, (Math.abs(val) / top) * full));

  function drawHorizontal(ctx: CanvasRenderingContext2D, p: Palette, L: Layout, fs: number, now: number, st: { x: number; v: number }, iNow: number) {
    const M = L.main;
    const left = M.x + (L.narrow ? 40 : 46);
    const right = M.x + M.w - 14;
    const px = (x: number) => left + ((x + X_HALF) / (2 * X_HALF)) * (right - left);
    const bandH = clamp(0.22 * M.h, 70, 96);
    const blockW = L.narrow ? 24 : 30;
    const blockH = L.narrow ? 24 : 28;
    // the band starts under the stage's reset and fullscreen buttons, so the block never slides under them
    const top0 = M.y + (L.circle && !L.narrow ? 0 : 28);
    const floorY = top0 + bandH - 10;
    const by = floorY - blockH / 2;
    const chartTop = top0 + bandH + 32;
    const chartBot = M.y + M.h - 26;
    const ty = (t: number) => chartTop + (t / tWindow) * (chartBot - chartTop);

    // floor and wall
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(M.x + 6, floorY);
    ctx.lineTo(right, floorY);
    ctx.stroke();
    ctx.restore();
    const wallX = M.x + 10;
    support(ctx, p, wallX, Math.max(top0 + 4, floorY - 2 * blockH), wallX, floorY, 'left');

    // the chart: x ticks above it, t ticks at its left, the equilibrium and ±A lines down through it
    ctx.save();
    ctx.font = `11px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    for (const x of ticks(-0.2, 0.2, 0.1)) {
      ctx.beginPath();
      ctx.moveTo(px(x), chartTop);
      ctx.lineTo(px(x), chartBot);
      ctx.stroke();
      ctx.fillText(sci(x, 2).replace('-', '−'), px(x), chartTop - 3);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const tStep = tWindow > 5 ? 1 : 0.5;
    for (const tt of ticks(0, tWindow, tStep)) {
      ctx.beginPath();
      ctx.moveTo(left, ty(tt));
      ctx.lineTo(right, ty(tt));
      ctx.stroke();
      ctx.fillText(sci(tt, 2), left - 5, ty(tt));
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(left, chartBot);
    ctx.lineTo(left, chartTop);
    ctx.lineTo(right, chartTop);
    ctx.stroke();
    ctx.restore();
    haloText(ctx, p, 'x (m)', right, chartTop - 22, { font: `italic 600 ${fs}px ${p.fontUi}`, align: 'right', color: p.ink2 });
    haloText(ctx, p, 't (s) ↓', M.x + 4, chartBot + 14, { font: `italic 600 ${fs}px ${p.fontUi}`, align: 'left', color: p.ink2 });

    // the equilibrium, from the floor down through the chart; ±A
    dashed(ctx, p.ink2, px(0), floorY - blockH - 4, px(0), chartBot, 1.2);
    if (d.A > 1e-6) {
      for (const s of [1, -1]) {
        const X = px(s * d.A);
        if (X < left || X > right) continue;
        dashed(ctx, p.hand, X, chartTop, X, chartBot, 1, [3, 4]);
        haloText(ctx, p, s > 0 ? '+A' : '−A', X, chartBot + 12, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.hand });
      }
    }

    // the trace
    traceStroke(ctx, p, (q) => [px(q.x), ty(q.t)], iNow, now, st.x, { x: left, y: chartTop - 2, w: right - left, h: chartBot - chartTop + 4 });

    // the block, its springs, and its arrows
    const bx = clamp(px(st.x), left - 8, right + 8);
    dashed(ctx, p.accent, bx, by + blockH / 2, bx, ty(now), 1, [2, 3]);
    dot(ctx, bx, ty(now), L.narrow ? 4.5 : 5.5, p.accent, p.paper);
    const amp = L.narrow ? 4 : 5;
    const attach = bx - blockW / 2;
    if (setup.arrangement === 'parallel') {
      for (const off of [-0.3, 0.3]) spring(ctx, wallX, by + off * blockH, attach, by + off * blockH, p.ink2, amp - 1, 8);
    } else if (setup.arrangement === 'series') {
      const mid = (wallX + attach) / 2;
      spring(ctx, wallX, by + 0.2 * blockH, mid, by + 0.2 * blockH, p.ink2, amp, 5);
      spring(ctx, mid, by + 0.2 * blockH, attach, by + 0.2 * blockH, p.ink2, amp, 5);
      dot(ctx, mid, by + 0.2 * blockH, 2.5, p.ink, p.ink);
    } else spring(ctx, wallX, by + 0.2 * blockH, attach, by + 0.2 * blockH, p.ink2, amp, 9);
    ctx.save();
    ctx.fillStyle = p.paper2;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.8;
    ctx.fillRect(bx - blockW / 2, by - blockH / 2, blockW, blockH);
    ctx.strokeRect(bx - blockW / 2, by - blockH / 2, blockW, blockH);
    ctx.restore();
    haloText(ctx, p, 'm', bx, by + 1, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink2 });
    if (show.arrows) {
      const full = 0.2 * (right - left);
      // the force of the springs on the block, −k_eq x, from the block's upper part
      const F = -d.kEq * st.x;
      const LF = arrowLen(F, d.kEq * d.A, full);
      const yF = by - 0.22 * blockH;
      if (LF !== 0) {
        arrow(ctx, bx, yF, bx + LF, yF, { color: p.force, width: 2.6, head: 9 });
        haloText(ctx, p, 'F', bx + LF + Math.sign(LF) * 9, yF, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force });
      }
      const Lv = arrowLen(st.v, d.A * d.w, full);
      const yv = by - blockH / 2 - 9;
      if (Lv !== 0) {
        arrow(ctx, bx, yv, bx + Lv, yv, { color: p.velocity, width: 2.2, head: 8 });
        haloText(ctx, p, 'v', bx + Lv + Math.sign(Lv) * 8, yv - 1, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.velocity });
      }
    }
    if (d.A > X_HALF) patchNote(ctx, p, 'התנודה יוצאת מהאיור', (left + right) / 2, chartBot - 12, L.narrow ? 12 : 13);
  }

  function drawVertical(ctx: CanvasRenderingContext2D, p: Palette, L: Layout, fs: number, now: number, st: { x: number; v: number }, iNow: number) {
    const M = L.main;
    const apW = L.narrow ? 66 : 92;
    const apX = M.x + apW / 2 + 4;
    const left = M.x + apW + (L.narrow ? 38 : 44);
    const right = M.x + M.w - 12;
    const top = M.y + 44;
    const bot = M.y + M.h - 30;
    const py = (y: number) => bot - ((y - Y_RANGE[0]) / (Y_RANGE[1] - Y_RANGE[0])) * (bot - top);
    const tx = (t: number) => left + (t / tWindow) * (right - left);
    const blockW = L.narrow ? 26 : 32;
    const blockH = L.narrow ? 22 : 26;
    const ceilY = M.y + 10;
    const yNow = st.x - d.D;

    // ticks of y at the chart's left, of t under it
    ctx.save();
    ctx.font = `11px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.direction = 'ltr';
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const y of ticks(Y_RANGE[0] + 0.05, Y_RANGE[1], 0.1)) {
      ctx.beginPath();
      ctx.moveTo(left, py(y));
      ctx.lineTo(right, py(y));
      ctx.stroke();
      ctx.fillText(sci(y, 2).replace('-', '−'), left - 5, py(y));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tt of ticks(0, tWindow, tWindow > 5 ? 1 : 0.5)) {
      ctx.beginPath();
      ctx.moveTo(tx(tt), top);
      ctx.lineTo(tx(tt), bot);
      ctx.stroke();
      ctx.fillText(sci(tt, 2), tx(tt), bot + 4);
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bot);
    ctx.lineTo(right, bot);
    ctx.stroke();
    ctx.restore();
    haloText(ctx, p, 'y (m) ↑', left - 4, top - 14, { font: `italic 600 ${fs}px ${p.fontUi}`, align: 'right', color: p.ink2 });
    haloText(ctx, p, 't (s) →', right, bot + 20, { font: `italic 600 ${fs}px ${p.fontUi}`, align: 'right', color: p.ink2 });

    // the relaxed-length level (y = 0) and the equilibrium (y = −Δ), across the apparatus and the chart
    dashed(ctx, p.ink3, M.x + 6, py(0), right, py(0), 1.1, [2, 4]);
    dashed(ctx, p.ink2, M.x + 6, py(-d.D), right, py(-d.D), 1.3);
    const noteSize = L.narrow ? 11 : 13;
    const noteX = right - (L.narrow ? 34 : 44);
    const sep = Math.abs(py(0) - py(-d.D));
    if (d.D > 1e-6 && sep > noteSize + 4) {
      patchNote(ctx, p, 'אורך רפוי', noteX, py(0) - noteSize * 0.75, noteSize);
      patchNote(ctx, p, 'שיווי משקל', noteX, py(-d.D) + noteSize * 0.85, noteSize);
    } else patchNote(ctx, p, d.D > 1e-6 ? 'שיווי משקל, כמעט רפוי' : 'שיווי משקל = אורך רפוי', noteX - 20, py(-d.D) + noteSize * 0.85, noteSize);
    if (d.A > 1e-6) {
      for (const s of [1, -1]) {
        const Y = py(-d.D + s * d.A);
        if (Y < top || Y > bot) continue;
        dashed(ctx, p.hand, left, Y, right, Y, 1, [3, 4]);
        haloText(ctx, p, s > 0 ? '+A' : '−A', left + 14, Y + (s > 0 ? -8 : 8), { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.hand });
      }
    }

    // the trace
    traceStroke(ctx, p, (q) => [tx(q.t), py(q.x - d.D)], iNow, now, st.x, { x: left - 2, y: top, w: right - left + 4, h: bot - top });

    // ceiling, spring, block
    support(ctx, p, apX - 30, ceilY, apX + 30, ceilY, 'up');
    const byc = clamp(py(yNow), top - 30, bot + 20);
    spring(ctx, apX, ceilY, apX, byc - blockH / 2, p.ink2, L.narrow ? 6 : 7, 10);
    ctx.save();
    ctx.fillStyle = p.paper2;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.8;
    ctx.fillRect(apX - blockW / 2, byc - blockH / 2, blockW, blockH);
    ctx.strokeRect(apX - blockW / 2, byc - blockH / 2, blockW, blockH);
    ctx.restore();
    haloText(ctx, p, 'm', apX, byc + 1, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink2 });
    dashed(ctx, p.accent, apX + blockW / 2, byc, tx(now), py(yNow), 1, [2, 3]);
    dot(ctx, tx(now), py(yNow), L.narrow ? 4.5 : 5.5, p.accent, p.paper);
    if (show.arrows) {
      // the two forces on the block: the spring's −k y and the weight −m g (axis up), from the block, side by side
      const g = G_OF[setup.g];
      const Fs = -setup.k * yNow;
      const W = -setup.m * g;
      const Ftop = Math.max(setup.k * (d.D + d.A), setup.m * g, 1e-9);
      const full = L.narrow ? 46 : 62;
      const LF = arrowLen(Fs, Ftop, full);
      const LW = arrowLen(W, Ftop, full);
      const xs = apX - blockW / 2 - 9;
      const xw = apX + blockW / 2 + 9;
      if (LF !== 0) {
        arrow(ctx, xs, byc, xs, byc - LF, { color: p.force, width: 2.4, head: 8 });
        haloText(ctx, p, 'F', xs - 8, byc - LF - Math.sign(LF) * 6, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force });
        ctx.save();
        ctx.strokeStyle = p.force;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xs, byc);
        ctx.lineTo(apX - blockW / 2, byc);
        ctx.stroke();
        ctx.restore();
      }
      if (LW !== 0) {
        arrow(ctx, xw, byc, xw, byc - LW, { color: p.force, width: 2.4, head: 8, alpha: 0.75 });
        haloText(ctx, p, 'mg', xw + 4, byc - LW + 9, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force, align: 'left' });
        ctx.save();
        ctx.strokeStyle = p.force;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(apX + blockW / 2, byc);
        ctx.lineTo(xw, byc);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawCircle(ctx: CanvasRenderingContext2D, p: Palette, C: Box, fs: number, now: number) {
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    if (C.x > 0) {
      ctx.beginPath();
      ctx.moveTo(C.x + 0.5, C.y + 8);
      ctx.lineTo(C.x + 0.5, C.y + C.h - 8);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(C.x + 8, C.y + 0.5);
      ctx.lineTo(C.x + C.w - 8, C.y + 0.5);
      ctx.stroke();
    }
    ctx.restore();
    const cx = C.x + C.w / 2;
    const cy = C.y + C.h / 2 + 4;
    const Rmax = Math.max(10, Math.min(C.w / 2 - 22, C.h / 2 - 20));
    // the radius follows A (so amplitudes compare), full size from A_REF up
    const r = Rmax * Math.min(1, d.A / A_REF);
    // axes: x to the right, −v/ω₀ up
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - Rmax - 8, cy);
    ctx.lineTo(cx + Rmax + 8, cy);
    ctx.moveTo(cx, cy + Rmax + 6);
    ctx.lineTo(cx, cy - Rmax - 8);
    ctx.stroke();
    ctx.restore();
    haloText(ctx, p, 'x', cx + Rmax + 12, cy, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, align: 'left', color: p.ink2 });
    haloText(ctx, p, '−v/ω₀', cx + 4, cy - Rmax - 12, { font: `italic 600 ${fs}px ${p.fontUi}`, align: 'left', color: p.ink2 });
    if (r < 1) {
      dot(ctx, cx, cy, 4, p.accent, p.paper);
      return;
    }
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // the starting angle φ: a ring at P₀ and an arc from the x axis
    const P0x = cx + r * Math.cos(d.phi);
    const P0y = cy - r * Math.sin(d.phi);
    const ra = Math.max(10, 0.32 * r);
    if (Math.abs(d.phi) > 0.03) {
      ctx.save();
      ctx.strokeStyle = p.hand;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      // canvas angles grow clockwise: the counter-clockwise angle φ is −φ on canvas
      ctx.arc(cx, cy, ra, 0, -d.phi, d.phi > 0);
      ctx.stroke();
      ctx.restore();
      haloText(ctx, p, 'φ', cx + (ra + 9) * Math.cos(d.phi / 2), cy - (ra + 9) * Math.sin(d.phi / 2), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.hand });
    }
    dashed(ctx, p.ink3, cx, cy, P0x, P0y, 1, [3, 3]);
    dot(ctx, P0x, P0y, 4, p.paper, p.ink2);
    // P now, its radius A, and its projection on the x axis: the block
    const P = referencePoint(d.A, d.phi, d.w, now);
    const Px = cx + (r * P.px) / d.A;
    const Py = cy - (r * P.py) / d.A;
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(Px, Py);
    ctx.stroke();
    ctx.restore();
    dashed(ctx, p.accent, Px, Py, Px, cy, 1.2, [3, 3]);
    dot(ctx, Px, cy, 3.5, p.ink, p.ink);
    dot(ctx, Px, Py, 5, p.accent, p.paper);
    haloText(ctx, p, 'A', (cx + Px) / 2 + 7 * Math.sin(P.theta), (cy + Py) / 2 + 7 * Math.cos(P.theta), { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink });
    haloText(ctx, p, 'P', Px + 9 * Math.cos(P.theta), Py - 9 * Math.sin(P.theta), { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.accent });
    // the sense of rotation: a small arrow on the circle ahead of P
    const a1 = P.theta + 0.35;
    const a2 = P.theta + 0.6;
    arrow(ctx, cx + r * Math.cos(a1), cy - r * Math.sin(a1), cx + r * Math.cos(a2), cy - r * Math.sin(a2), { color: p.ink2, width: 1.4, head: 6 });
  }

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1, animate: playing });
  useEffect(invalidate, [setup, show, time, playing, trace]);

  // the stage is taller on a narrow screen
  const [narrowStage, setNarrowStage] = useState(false);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrowStage(el.getBoundingClientRect().width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [narrowStage]);
  const aspect = mode === 'horizontal' ? (narrowStage ? 0.78 : 1.2) : narrowStage ? 0.9 : 1.6;

  /* ---------------------------------------------------------------- input (the learner's handlers tick tasks) */

  /** a change the learner made: stop, back to t = 0, and check the tasks about initial conditions */
  const change = (f: (s: Setup) => Setup) => {
    setPlaying(false);
    setTime(0);
    naturalRun.current = false;
    const next = f(setup);
    setSetup(next);
    const dd = derive(mode, next);
    if (dd.A > 1e-6 && Math.abs(dd.phi - Math.PI / 2) < 0.03) done('phase-half-pi');
    if (Math.abs(next.x0) > 1e-9 && Math.abs(next.v0) > 1e-9 && Math.abs(dd.A - 0.2) < 0.004) done('amplitude-20');
  };
  const scrub = (tt: number) => {
    setPlaying(false);
    const t = clamp(tt, 0, tWindow);
    setTime(t);
    if (mode === 'vertical' && naturalRun.current) {
      const s = freeMotion({ omega0: d.w }, { x: setup.x0, v: setup.v0 }, t);
      if (s.x < 0 && Math.abs(s.v) < 0.05 * d.A * d.w) done('lowest');
    }
  };
  const naturalRelease = () => {
    const D = staticStretch(setup.m, setup.k, G_OF[setup.g]);
    change((s) => ({ ...s, x0: roundTo(clamp(D, ...lim.x0), 1e-4), v0: 0 }));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') play();
    else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') change((s) => ({ ...s, x0: clamp(roundTo(s.x0 + 0.01, 0.01), ...lim.x0) }));
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') change((s) => ({ ...s, x0: clamp(roundTo(s.x0 - 0.01, 0.01), ...lim.x0) }));
    else return;
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const shown = clamp(time, 0, tWindow);
  const s = freeMotion({ omega0: d.w }, { x: setup.x0, v: setup.v0 }, shown);
  const what =
    mode === 'horizontal'
      ? `גוף על ${ARR_LABEL[setup.arrangement]} אופקי`
      : `גוף תלוי על קפיץ אנכי, בכובד של ${G_LABEL[setup.g]}, בהתארכות שיווי משקל של ${sci(d.D)} מטר`;
  const label = `איור חי: ${what}, עם גרף ההעתק מול הזמן. המסה ${sci(setup.m)} קילוגרם, ההעתק ההתחלתי ${sci(setup.x0)} מטר והמהירות ההתחלתית ${sci(setup.v0)} מטר לשנייה. במקלדת: חצים משנים את ההעתק ההתחלתי, Enter מפעיל.`;

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
        setShow({ circle: props.circle ?? false, arrows: props.arrows ?? true });
        setPlaying(false);
        setTime(0);
        naturalRun.current = false;
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        playing ? (
          <span>הגוף מתנודד…</span>
        ) : (
          <>
            {mode === 'horizontal' ? (
              <span class="q" data-readout="keq">
                k<sub>eq</sub> = <b>{signed(d.kEq)} N/m</b>
              </span>
            ) : (
              <span class="q" data-readout="D">
                Δ = mg/k = <b>{signed(d.D)} m</b>
              </span>
            )}
            <span class="q" data-readout="w">
              ω₀ = <b>{signed(d.w)} rad/s</b>
            </span>
            <span class="q" data-readout="T">
              T = <b>{signed(d.T)} s</b>
            </span>
            <span class="q" data-readout="A">
              A = <b>{signed(d.A)} m</b>
            </span>
            <span class="q" data-readout="phi">
              φ = <b>{signed(d.phi, 1e-6)} rad</b>
            </span>
            <span class="q" data-readout="t">
              t = <b>{signed(shown)} s</b>
            </span>
            <span class="q" data-readout="x">
              x = <b>{signed(s.x, 1e-9)} m</b>
            </span>
            {mode === 'vertical' && (
              <span class="q" data-readout="stretch">
                <bdi>התארכות</bdi> = <b>{signed(d.D - s.x, 1e-9)} m</b>
              </span>
            )}
            <span class="q" data-readout="v">
              v = <b>{signed(s.v, 1e-6 * Math.max(1e-9, d.A * d.w))} m/s</b>
            </span>
          </>
        )
      }
      controls={
        <>
          {mode === 'horizontal' && offered.length > 1 && (
            <div class="group" role="group" aria-label="סידור הקפיצים">
              {offered.map((a) => (
                <Toggle key={a} label={ARR_LABEL[a]} on={setup.arrangement === a} onChange={() => change((st) => ({ ...st, arrangement: a }))} />
              ))}
            </div>
          )}
          {mode === 'vertical' && (
            <div class="group" role="group" aria-label="הכובד">
              {(['earth', 'moon', 'none'] as Gravity[]).map((g) => (
                <Toggle key={g} label={G_LABEL[g]} on={setup.g === g} onChange={() => change((st) => ({ ...st, g }))} />
              ))}
            </div>
          )}
          <Slider label="המסה m" value={setup.m} min={lim.m[0]} max={lim.m[1]} step={0.05} format={(x) => `${sci(x)} kg`} onChange={(v) => change((st) => ({ ...st, m: clamp(roundTo(v, 0.05), ...lim.m) }))} />
          <Slider
            label={mode === 'horizontal' && setup.arrangement !== 'single' ? 'קבוע כל קפיץ k' : 'קבוע הקפיץ k'}
            value={setup.k}
            min={lim.k[0]}
            max={lim.k[1]}
            step={1}
            format={(x) => `${sci(x)} N/m`}
            onChange={(v) => change((st) => ({ ...st, k: clamp(Math.round(v), ...lim.k) }))}
          />
          <Slider label="ההעתק ההתחלתי x₀" value={Number(setup.x0.toFixed(3))} min={lim.x0[0]} max={lim.x0[1]} step={0.01} format={(x) => `${signed(x)} m`} onChange={(v) => change((st) => ({ ...st, x0: clamp(roundTo(v, 0.01), ...lim.x0) }))} />
          <Slider label="המהירות ההתחלתית v₀" value={setup.v0} min={lim.v0[0]} max={lim.v0[1]} step={0.05} format={(x) => `${signed(x)} m/s`} onChange={(v) => change((st) => ({ ...st, v0: clamp(roundTo(v, 0.05), ...lim.v0) }))} />
          <Slider label="זמן" value={Number(shown.toPrecision(3))} min={0} max={tWindow} step={0.01} format={(x) => `${sci(x)} s`} onChange={scrub} />
          <div class="group" role="group" aria-label="הפעלה">
            <button type="button" class="btn primary" onClick={play}>
              הפעלה
            </button>
            {mode === 'vertical' && (
              <button type="button" class="btn" onClick={naturalRelease}>
                שחרור מהאורך הרפוי
              </button>
            )}
          </div>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="מעגל ייחוס" on={show.circle} onChange={(on) => setShow((x) => ({ ...x, circle: on }))} />
            <Toggle label={mode === 'horizontal' ? 'כוח ומהירות' : 'כוחות'} on={show.arrows} swatch="var(--force)" onChange={(on) => setShow((x) => ({ ...x, arrows: on }))} />
          </div>
        </>
      }
    />
  );
}
