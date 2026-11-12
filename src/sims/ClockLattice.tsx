/**
 * ClockLattice (lesson 9.3): two rows of clocks drawn at ONE instant of one frame. The bottom row is the platform,
 * frame S: clocks at rest in S, 2 light-seconds apart, synchronised in S. The top row is a very long train, frame
 * S′, moving at v = βc along +x: clocks at rest in S′, 2 light-seconds apart in S′, synchronised in S′. The origins
 * (the ringed clocks) coincide at t = t′ = 0. Units: c = 1, places in light-seconds (c·s), times in seconds.
 *
 * View S: the picture is the instant t of S. Every platform clock reads t; the train clock at proper place ξ′ is at
 *   x = vt + ξ′/γ and reads t′ = γ(t − vx/c²) = t/γ − βξ′: the train's spacing is 2/γ, its origin clock reads t/γ,
 *   and along the train the readings fall by 2β per clock toward the front (the rear clock is ahead).
 * View S′: the instant t′ of S′; the train stands still and the platform moves at −v (the same with v → −v).
 * Galileo mode: the transformation of lesson 1.5 (x′ = x − vt, t′ = t): no contraction, every clock reads alike.
 *
 * Lightning: a strike is an event, placed at the current instant of the drawing frame and at the chosen place. At its
 * instant it is drawn as a bolt with the reading of the local clock of each row (its t on the platform, its t′ on the
 * train); later it is a scorch mark on each row, which travels with that row. The readout lists each strike's
 * coordinates in both frames. Events are kept in S coordinates and transformed with src/physics/lorentzmap.ts.
 *
 * Tasks tick only inside the learner's own handlers (buttons, sliders, a click on the canvas); a text step sets a
 * state and never ticks anything.
 *   galileo    the learner switches the transformation (either way) with β ≥ 0.3
 *   strike-s   the learner places two strikes simultaneous in S, at least 1 c·s apart, β ≥ 0.3, Lorentz
 *   strike-sp  the learner places two strikes simultaneous in S′ (|Δt′| ≤ 0.05 s), at least 1 c·s apart in S′, β ≥ 0.3,
 *              Lorentz
 *   view-sp    the learner switches to the view from S′ with β ≥ 0.3
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Event } from '~/physics/relativity';
import { gammaOf } from '~/physics/relativity';
import {
  eventIn,
  eventToS,
  galileanEventIn,
  galileanEventToS,
  galileanMovingClock,
  latticeSpacing,
  movingClock,
  rearClockLead,
  type FrameName,
} from '~/physics/lorentzmap';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { sci } from './core/format';
import { arrow, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type LatticeView = 'S' | 'Sp';
export type LatticeMode = 'lorentz' | 'galileo';

export interface ClockLatticeProps {
  id: string;
  /** β = v/c of S′ relative to S, 0 … 0.9 */
  beta?: number;
  /** the instant of the drawing frame [s] */
  t?: number;
  view?: LatticeView;
  mode?: LatticeMode;
  /** lightning strikes A, B in S coordinates (c = 1: t in s, x in light-seconds) */
  events?: Event[];
  tasks?: string[];
}

const TASK_LABEL: Record<string, string> = {
  galileo: 'עברו לטרנספורמציה של גליליי ובחזרה ללורנץ, כש-β לפחות 0.3. מה משתנה ברכבת?',
  'strike-s': 'הנחיתו שני ברקים באותו רגע של S, במקומות שונים. מתי הם קרו ב-S′?',
  'strike-sp': 'מצאו שני ברקים במקומות שונים שהם בו-זמניים ב-S′. איזה מהם קרה קודם ב-S?',
  'view-sp': 'עברו למבט מ-S′. מה מראים עכשיו שעוני הרציף?',
};

const B_MAX = 0.9;
const T_MIN = -4;
const T_MAX = 10;
const X_MIN = -2;
const X_MAX = 12;
const D0 = 2; // proper spacing of both lattices [c·s]
const HAND_PERIOD = 8; // one turn of a clock hand [s]
const BOLT_WINDOW = 0.15; // a strike is drawn as a bolt within this time of its instant [s]
const LABELS = ['A', 'B'] as const;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/** a readout number: 3 significant figures, a true minus sign, and no "−0" */
const num = (x: number) => (Math.abs(x) < 5e-4 ? '0' : sci(x, 3).replace('-', '−'));
/** a clock face number: one decimal, a true minus sign */
const face = (x: number) => {
  const s = (Math.round(x * 10) / 10).toFixed(1);
  return s === '-0.0' ? '0.0' : s.replace('-', '−');
};

interface State {
  beta: number;
  T: number;
  view: LatticeView;
  mode: LatticeMode;
  /** strikes in S coordinates; index 0 is A, 1 is B; null where not placed */
  events: (Event | null)[];
  strikeX: number;
  playing: boolean;
}

function initial(p: ClockLatticeProps): State {
  const ev = p.events ?? [];
  return {
    beta: clamp(p.beta ?? 0.8, 0, B_MAX),
    T: clamp(p.t ?? 0, T_MIN, T_MAX),
    view: p.view ?? 'S',
    mode: p.mode ?? 'lorentz',
    events: [ev[0] ?? null, ev[1] ?? null],
    strikeX: 6,
    playing: false,
  };
}

const frameOf = (v: LatticeView): FrameName => (v === 'S' ? 'S' : 'S′');

/** An event of S in the drawing frame of the state (Lorentz or Galileo). */
function inView(e: Event, s: State): Event {
  const f = frameOf(s.view);
  return s.mode === 'lorentz' ? eventIn(e, f, s.beta, 1) : galileanEventIn(e, f, s.beta, 1);
}
/** An event in S′ coordinates (Lorentz or Galileo). */
function inSp(e: Event, s: State): Event {
  return s.mode === 'lorentz' ? eventIn(e, 'S′', s.beta, 1) : galileanEventIn(e, 'S′', s.beta, 1);
}
/** An event given in the drawing frame, back to S. */
function toS(e: Event, s: State): Event {
  const f = frameOf(s.view);
  return s.mode === 'lorentz' ? eventToS(e, f, s.beta, 1) : galileanEventToS(e, f, s.beta, 1);
}

/** The moving row's velocity in the drawing frame [c]: the train moves at +β in S, the platform at −β in S′. */
const movingBeta = (s: State) => (s.view === 'S' ? s.beta : -s.beta);

/** A clock of the moving row at proper place ξ, at the instant T of the drawing frame. */
function moving(xi: number, s: State) {
  const b = movingBeta(s);
  return s.mode === 'lorentz' ? movingClock(xi, s.T, b, 1) : galileanMovingClock(xi, s.T, b, 1);
}

/* ================================================================== drawing */

interface Geo {
  w: number;
  h: number;
  /** world x → screen x */
  sx: (x: number) => number;
  /** screen x → world x */
  wx: (px: number) => number;
  k: number;
  /** rows: the y of the band, the dial centres and the reading text of each row */
  trainBand: number;
  trainDial: number;
  trainRead: number;
  trainLab: number;
  platBand: number;
  platDial: number;
  platRead: number;
  platLab: number;
  dial: number;
  font: number;
}

function geometry(view: View): Geo {
  const { w, h } = view;
  const pad = Math.max(14, w * 0.03);
  const k = (w - 2 * pad) / (X_MAX - X_MIN);
  const narrow = w < 520;
  const font = narrow ? 11 : 12;
  const dial = clamp(k * 0.32, 7, 12);
  // the readings of the top row start below the figure's tool buttons (top-right, 42 px)
  const top = narrow ? 52 : 42;
  const trainRead = top + 12;
  const trainDial = trainRead + font / 2 + dial + 5;
  const trainBand = trainDial + dial + 6;
  const trainLab = trainBand + 16;
  const platRead = h - 16;
  const platDial = platRead - font / 2 - dial - 5;
  const platBand = platDial - dial - 6;
  const platLab = platBand - 16;
  return {
    w,
    h,
    k,
    sx: (x: number) => pad + (x - X_MIN) * k,
    wx: (px: number) => X_MIN + (px - pad) / k,
    trainBand,
    trainDial,
    trainRead,
    trainLab,
    platBand,
    platDial,
    platRead,
    platLab,
    dial,
    font,
  };
}

function mathText(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  s: string,
  x: number,
  y: number,
  o: { color?: string; size?: number; italic?: boolean; align?: CanvasTextAlign; weight?: number } = {},
) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${o.italic ? 'italic ' : ''}${o.weight ?? 600} ${o.size ?? 12}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; align?: CanvasTextAlign } = {}) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = o.align ?? 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${o.size ?? 12}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink2;
  ctx.fillText(s, x, y);
  ctx.restore();
}

function textWidth(ctx: CanvasRenderingContext2D, p: Palette, s: string, size: number) {
  ctx.save();
  ctx.font = `600 ${size}px ${p.fontUi}`;
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/** A clock face at (x, y) of radius r showing `reading`; `origin` rings it. */
function clockFace(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number, reading: number, color: string, origin: boolean) {
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = color;
  ctx.lineWidth = origin ? 2.6 : 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  if (origin) {
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r + 3.5, 0, 2 * Math.PI);
    ctx.stroke();
  }
  // the 12 o'clock mark and the hand: one turn every HAND_PERIOD seconds, clockwise from the top
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y - r * 0.72);
  ctx.stroke();
  const a = (2 * Math.PI * reading) / HAND_PERIOD;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + r * 0.78 * Math.sin(a), y - r * 0.78 * Math.cos(a));
  ctx.stroke();
  ctx.restore();
}

/** A row's band: a long thin bar across the whole picture. */
function band(ctx: CanvasRenderingContext2D, g: Geo, y: number, color: string, thick: number) {
  ctx.save();
  ctx.fillStyle = withAlpha(color, 0.18);
  ctx.strokeStyle = withAlpha(color, 0.7);
  ctx.lineWidth = 1.2;
  ctx.fillRect(0, y - thick / 2, g.w, thick);
  ctx.beginPath();
  ctx.moveTo(0, y - thick / 2);
  ctx.lineTo(g.w, y - thick / 2);
  ctx.moveTo(0, y + thick / 2);
  ctx.lineTo(g.w, y + thick / 2);
  ctx.stroke();
  ctx.restore();
}

/** A lightning bolt from y0 to y1 at x. */
function bolt(ctx: CanvasRenderingContext2D, p: Palette, x: number, y0: number, y1: number) {
  const n = 6;
  const amp = 5;
  ctx.save();
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.shadowColor = withAlpha(p.accent, 0.6);
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(x, y0);
  for (let i = 1; i < n; i++) ctx.lineTo(x + (i % 2 ? amp : -amp), y0 + ((y1 - y0) * i) / n);
  ctx.lineTo(x, y1);
  ctx.stroke();
  ctx.restore();
}

/** A scorch mark: a small dark star on a band. */
function scorch(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, label: string) {
  ctx.save();
  ctx.fillStyle = withAlpha(p.ink, 0.75);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 2.5 : 6;
    const a = (i * Math.PI) / 5;
    ctx.lineTo(x + r * Math.sin(a), y - r * Math.cos(a));
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  mathText(ctx, p, label, x + 9, y - 8, { size: 10, color: p.ink2 });
}

interface Box {
  x0: number;
  x1: number;
}

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State) {
  const g = geometry(view);
  const lor = s.mode === 'lorentz';
  const inS = s.view === 'S';
  const trainColor = p.velocity;
  const platColor = p.ink;
  const frameName = inS ? 'S' : 'S′';
  const tName = inS ? 't' : 't′';

  // header: the instant of the drawing frame
  mathText(ctx, p, `${frameName}:  ${tName} = ${face(s.T)} s`, 12, 18, { align: 'left', size: g.font + 3, color: inS ? platColor : trainColor, weight: 700 });
  if (!lor) heText(ctx, p, 'גליליי', 12 + textWidth(ctx, p, `${frameName}:  ${tName} = ${face(s.T)} s`, g.font + 3) + 14 + textWidth(ctx, p, 'גליליי', g.font), 18, { size: g.font, color: p.hand });

  // the bands
  band(ctx, g, g.trainBand, trainColor, 8);
  band(ctx, g, g.platBand, platColor, 8);

  // row names at the left, between the bands
  mathText(ctx, p, 'S′', 10, g.trainLab + 14, { align: 'left', size: g.font + 2, color: trainColor, italic: true, weight: 700 });
  heText(ctx, p, 'רכבת', 30 + textWidth(ctx, p, 'רכבת', g.font), g.trainLab + 14, { size: g.font, color: trainColor });
  mathText(ctx, p, 'S', 10, g.platLab - 14, { align: 'left', size: g.font + 2, color: platColor, italic: true, weight: 700 });
  heText(ctx, p, 'רציף', 28 + textWidth(ctx, p, 'רציף', g.font), g.platLab - 14, { size: g.font, color: platColor });

  // the moving row's velocity arrow, at the right, between the bands
  const ub = movingBeta(s);
  if (Math.abs(ub) > 1e-9) {
    const yA = inS ? g.trainLab + 14 : g.platLab - 14;
    const L = 26 + 30 * Math.abs(ub);
    const xr = g.w - 16;
    const [x1, x2] = ub > 0 ? [xr - L, xr] : [xr, xr - L];
    arrow(ctx, x1, yA, x2, yA, { color: p.velocity, width: 2.4, head: 9 });
    const lab = `${ub > 0 ? 'v' : '−v'} = ${num(ub)}c`;
    mathText(ctx, p, lab, xr - L - 6, yA, { align: 'right', size: g.font, color: p.velocity });
  }

  // which row stands, which moves
  const restY = inS ? { band: g.platBand, dial: g.platDial, read: g.platRead, lab: g.platLab } : { band: g.trainBand, dial: g.trainDial, read: g.trainRead, lab: g.trainLab };
  const movY = inS ? { band: g.trainBand, dial: g.trainDial, read: g.trainRead, lab: g.trainLab } : { band: g.platBand, dial: g.platDial, read: g.platRead, lab: g.platLab };
  const restColor = inS ? platColor : trainColor;
  const movColor = inS ? trainColor : platColor;

  // rest row: clocks every D0, all reading T
  const restClocks: { x: number; reading: number; xi: number }[] = [];
  for (let xi = Math.ceil((X_MIN - 1) / D0) * D0; xi <= X_MAX + 1; xi += D0) restClocks.push({ x: xi, reading: s.T, xi });
  // moving row: proper places ξ = k·D0 whose positions fall in the picture
  const movClocks: { x: number; reading: number; xi: number }[] = [];
  {
    const b = movingBeta(s);
    const gm = lor ? gammaOf(b) : 1;
    const lo = (X_MIN - 1 - b * s.T) * gm;
    const hi = (X_MAX + 1 - b * s.T) * gm;
    for (let k = Math.ceil(lo / D0); k <= Math.floor(hi / D0); k++) {
      const c = moving(k * D0, s);
      movClocks.push({ x: c.x, reading: c.reading, xi: k * D0 });
    }
  }

  const drawRow = (clocks: { x: number; reading: number; xi: number }[], y: { band: number; dial: number; read: number; lab: number }, color: string, readAbove: boolean) => {
    // tick marks and coordinate labels on the band
    const gapPx = clocks.length > 1 ? Math.abs(g.sx(clocks[1].x) - g.sx(clocks[0].x)) : 1e9;
    const every = gapPx < 22 ? 2 : 1;
    for (const c of clocks) {
      const X = g.sx(c.x);
      if (X < -20 || X > g.w + 20) continue;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(X, y.band - 4);
      ctx.lineTo(X, y.band + 4);
      // the post that holds the clock
      ctx.moveTo(X, y.band + (readAbove ? -4 : 4));
      ctx.lineTo(X, y.dial + (readAbove ? g.dial : -g.dial));
      ctx.stroke();
      ctx.restore();
    }
    const rowLabels: Box[] = [];
    clocks.forEach((c, i) => {
      const X = g.sx(c.x);
      if (X < -20 || X > g.w + 20) return;
      // a crowded (strongly contracted) row draws smaller faces, so neighbours do not touch
      clockFace(ctx, p, X, y.dial, Math.max(4, Math.min(g.dial, gapPx * 0.36)), c.reading, color, Math.abs(c.xi) < 1e-9);
      // the reading: staggered when the clocks crowd
      const stagger = gapPx < 34 && i % 2 === 1;
      const ry = y.read + (stagger ? (readAbove ? -g.font - 1 : g.font + 1) : 0);
      if (gapPx >= 17 || i % 2 === 0) mathText(ctx, p, face(c.reading), X, ry, { size: g.font, color });
      // the coordinate of the clock, its proper place, under (above) the band
      const k = Math.round(c.xi / D0);
      if (k % every === 0) {
        const lab = `${num(c.xi)}`;
        const wl = textWidth(ctx, p, lab, g.font - 1);
        const bx: Box = { x0: X - wl / 2 - 2, x1: X + wl / 2 + 2 };
        if (rowLabels.every((o) => bx.x1 < o.x0 || bx.x0 > o.x1)) {
          rowLabels.push(bx);
          mathText(ctx, p, lab, X, y.lab, { size: g.font - 1, color: withAlpha(color, 0.85), weight: 500 });
        }
      }
    });
  };

  drawRow(movClocks, movY, movColor, inS);
  drawRow(restClocks, restY, restColor, !inS);

  // strikes: a bolt at their instant, scorch marks after it on each row (the moving row's mark travels with it)
  s.events.forEach((e, i) => {
    if (!e) return;
    const ev = inView(e, s);
    const label = LABELS[i];
    const dtv = s.T - ev.t;
    if (Math.abs(dtv) <= BOLT_WINDOW) {
      const X = g.sx(ev.x);
      bolt(ctx, p, X, g.trainBand - 8, g.platBand + 8);
      // the local clocks' readings at the event: t on the platform, t′ on the train
      const sp = inSp(e, s);
      const tTrain = `t′ = ${face(sp.t)}`;
      const tPlat = `t = ${face(e.t)}`;
      const ym = (g.trainLab + g.platLab) / 2;
      mathText(ctx, p, label, X, ym, { size: g.font + 3, color: p.accent, weight: 800 });
      mathText(ctx, p, tTrain, X + 10, g.trainLab + 30, { align: 'left', size: g.font, color: trainColor, weight: 700 });
      mathText(ctx, p, tPlat, X + 10, g.platLab - 30, { align: 'left', size: g.font, color: platColor, weight: 700 });
    } else if (dtv > 0) {
      // the rest row's mark stays at the event's place; the moving row's mark moves with the moving row
      const xr = ev.x;
      const xm = ev.x + movingBeta(s) * dtv;
      const rb = inS ? g.platBand : g.trainBand;
      const mb = inS ? g.trainBand : g.platBand;
      scorch(ctx, p, g.sx(xr), rb, label);
      scorch(ctx, p, g.sx(xm), mb, label);
    }
  });
}

/* ================================================================== the component */

export default function ClockLattice(props: ClockLatticeProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const [narrow, setNarrow] = useState(false);
  const ownPlay = useRef(false);
  const next = useRef(0);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        ownPlay.current = false;
        setS((prev) => {
          const n: State = { ...prev, playing: false };
          if (typeof st.beta === 'number') n.beta = clamp(st.beta, 0, B_MAX);
          if (typeof st.t === 'number') n.T = clamp(st.t, T_MIN, T_MAX);
          if (st.view === 'S' || st.view === 'Sp') n.view = st.view;
          if (st.mode === 'lorentz' || st.mode === 'galileo') n.mode = st.mode;
          if (Array.isArray(st.events)) {
            const ev = st.events as unknown[];
            const ok = (x: unknown): Event | null =>
              x && typeof x === 'object' && typeof (x as Event).t === 'number' && typeof (x as Event).x === 'number' ? { t: (x as Event).t, x: (x as Event).x } : null;
            n.events = [ok(ev[0]), ok(ev[1])];
          }
          return n;
        });
      }),
    [props.id],
  );

  // playback, frozen in still mode: the instant runs forward at 1 s per second until T_MAX
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => {
        const T = prev.T + dt;
        if (T >= T_MAX) return { ...prev, T: T_MAX, playing: false };
        return { ...prev, T };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s)), 700);
    return () => clearTimeout(h);
  }, [s.beta, s.view, s.mode, s.events, Math.round(s.T * 2)]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, s);
  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: X_MAX - X_MIN, worldHeight: 8, animate: false });
  useEffect(invalidate, [s, narrow]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.getBoundingClientRect().width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reset = () => {
    ownPlay.current = false;
    next.current = 0;
    setS(initial(props));
    setLive('האיור אופס.');
  };

  /** the learner's strike: event `i` at the place x of the drawing frame and its current instant */
  const strike = (i: number, x: number) => {
    const e = toS({ t: s.T, x }, s);
    const events = s.events.slice();
    events[i] = e;
    next.current = (i + 1) % 2;
    const n = { ...s, events, strikeX: x };
    setS(n);
    setLive(`ברק ${LABELS[i]}: ${eventSentence(e, n)}`);
    const [a, b] = events;
    if (a && b && s.beta >= 0.3 - 1e-9 && s.mode === 'lorentz') {
      if (Math.abs(a.t - b.t) < 1e-9 && Math.abs(a.x - b.x) >= 1 - 1e-9) done('strike-s');
      const ap = eventIn(a, 'S′', s.beta, 1);
      const bp = eventIn(b, 'S′', s.beta, 1);
      if (Math.abs(ap.t - bp.t) <= 0.05 && Math.abs(ap.x - bp.x) >= 1 - 1e-9) done('strike-sp');
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const g = geometry(v);
    const x = clamp(Math.round(g.wx(e.offsetX) * 2) / 2, X_MIN, X_MAX);
    strike(next.current, x);
  };

  const ev = s.events;
  const pair = ev[0] && ev[1] ? [ev[0], ev[1]] : null;
  const sp = (e: Event) => inSp(e, s);
  const prime = s.mode === 'lorentz' ? '' : ' (גליליי)';

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: שורת שעונים של רציף, מערכת S, ושורת שעונים של רכבת, מערכת S′, שנעה ביחס לרציף במהירות ${num(s.beta)} c, בתמונה של רגע אחד. ${describe(s)}`}
      canvasRef={canvasRef}
      aspect={narrow ? 1.25 : 2}
      live={live}
      tasks={tasks}
      onReset={reset}
      onPointerDown={onPointerDown}
      cursor="crosshair"
      readout={
        <>
          <span data-readout="beta">
            <bdi dir="ltr">
              <i>β</i> = <b class="q">{num(s.beta)}</b>
            </bdi>
          </span>
          <span data-readout="gamma">
            <bdi dir="ltr">
              <i>γ</i> = <b class="q">{s.mode === 'lorentz' ? num(gammaOf(s.beta)) : '1'}</b>
            </bdi>
          </span>
          <span data-readout="spacing">
            המרווח בין שעונים בשורה הנעה:{' '}
            <bdi dir="ltr">
              <b class="q">{num(s.mode === 'lorentz' ? latticeSpacing(D0, s.beta) : D0)} c·s</b>
            </bdi>
          </span>
          <span data-readout="lead">
            הקדמה של כל שעון בשורה הנעה על שכנו הקדמי:{' '}
            <bdi dir="ltr">
              <b class="q">{num(s.mode === 'lorentz' ? rearClockLead(D0, s.beta, 1) : 0)} s</b>
            </bdi>
          </span>
          {ev.map((e, i) =>
            e ? (
              <span data-readout={LABELS[i]} key={LABELS[i]}>
                {`ברק ${LABELS[i]}: `}
                <bdi dir="ltr">
                  S: (t, x) = <b class="q">({num(e.t)} s, {num(e.x)} c·s)</b>
                </bdi>
                {' · '}
                <bdi dir="ltr">
                  S′: (t′, x′) = <b class="q">({num(sp(e).t)} s, {num(sp(e).x)} c·s)</b>
                </bdi>
                {prime}
              </span>
            ) : null,
          )}
          {pair && (
            <>
              <span data-readout="dt">
                <bdi dir="ltr">
                  Δt = t<sub>B</sub> − t<sub>A</sub> = <b class="q">{num(pair[1].t - pair[0].t)} s</b>
                </bdi>
              </span>
              <span data-readout="dtp">
                <bdi dir="ltr">
                  Δt′ = t′<sub>B</sub> − t′<sub>A</sub> = <b class="q">{num(sp(pair[1]).t - sp(pair[0]).t)} s</b>
                </bdi>
              </span>
            </>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מאיזו מערכת מסתכלים">
            <Toggle
              label={<>מבט מ-<bdi dir="ltr">S</bdi></>}
              on={s.view === 'S'}
              onChange={() => setS((prev) => ({ ...prev, view: 'S', playing: false }))}
            />
            <Toggle
              label={<>מבט מ-<bdi dir="ltr">S′</bdi></>}
              on={s.view === 'Sp'}
              onChange={() => {
                setS((prev) => ({ ...prev, view: 'Sp', playing: false }));
                if (s.beta >= 0.3 - 1e-9) done('view-sp');
              }}
            />
          </div>
          <div class="group" role="group" aria-label="איזו טרנספורמציה">
            <Toggle
              label="לורנץ"
              on={s.mode === 'lorentz'}
              onChange={() => {
                if (s.mode !== 'lorentz' && s.beta >= 0.3 - 1e-9) done('galileo');
                setS((prev) => ({ ...prev, mode: 'lorentz' }));
              }}
            />
            <Toggle
              label="גליליי"
              on={s.mode === 'galileo'}
              onChange={() => {
                if (s.mode !== 'galileo' && s.beta >= 0.3 - 1e-9) done('galileo');
                setS((prev) => ({ ...prev, mode: 'galileo' }));
              }}
            />
          </div>
          <Slider
            label="מהירות הרכבת ביחס לרציף, β = v/c"
            min={0}
            max={B_MAX}
            step={0.05}
            value={s.beta}
            format={(v) => num(v)}
            onChange={(v) => setS((prev) => ({ ...prev, beta: Math.round(v * 100) / 100 }))}
          />
          <Slider
            label={s.view === 'S' ? 'הרגע t של הרציף' : 'הרגע t′ של הרכבת'}
            min={T_MIN}
            max={T_MAX}
            step={0.1}
            value={Math.round(s.T * 10) / 10}
            format={(v) => `${face(v)} s`}
            onChange={(v) => setS((prev) => ({ ...prev, T: Math.round(v * 10) / 10, playing: false }))}
          />
          <div class="group" role="group" aria-label="זמן">
            <Toggle
              label={s.playing ? 'עצירה' : 'הפעלה'}
              on={s.playing}
              onChange={(on) => {
                ownPlay.current = on;
                if (on && s.T >= T_MAX - 1e-9) setS((prev) => ({ ...prev, T: T_MIN, playing: true }));
                else setS((prev) => ({ ...prev, playing: on }));
              }}
            />
          </div>
          <Slider
            label={s.view === 'S' ? 'מקום הברק x ברציף' : 'מקום הברק x′ ברכבת'}
            min={X_MIN}
            max={X_MAX}
            step={0.5}
            value={s.strikeX}
            format={(v) => `${num(v)} c·s`}
            onChange={(v) => setS((prev) => ({ ...prev, strikeX: v }))}
          />
          <div class="group" role="group" aria-label="ברקים">
            <button type="button" class="btn primary" onClick={() => strike(0, s.strikeX)}>
              ברק A
            </button>
            <button type="button" class="btn primary" onClick={() => strike(1, s.strikeX)}>
              ברק B
            </button>
            <button
              type="button"
              class="btn ghost"
              onClick={() => {
                next.current = 0;
                setS((prev) => ({ ...prev, events: [null, null] }));
                setLive('הברקים נמחקו.');
              }}
            >
              מחיקת הברקים
            </button>
          </div>
        </>
      }
    />
  );
}

function eventSentence(e: Event, s: State): string {
  const p = inSp(e, s);
  return `ב-S בזמן ${num(e.t)} שניות ובמקום ${num(e.x)} שניות אור; ב-S′ בזמן ${num(p.t)} שניות ובמקום ${num(p.x)} שניות אור.`;
}

function describe(s: State): string {
  const inS = s.view === 'S';
  const lor = s.mode === 'lorentz';
  const head = inS ? `רגע אחד של הרציף, t שווה ${num(s.T)} שניות.` : `רגע אחד של הרכבת, t′ שווה ${num(s.T)} שניות.`;
  const rule = lor
    ? `טרנספורמציית לורנץ: המרווח בין שעוני השורה הנעה ${num(latticeSpacing(D0, s.beta))} שניות אור, וכל שעון בה מפגר אחרי השכן שמאחוריו ב-${num(rearClockLead(D0, s.beta, 1))} שניות.`
    : 'טרנספורמציית גליליי: כל השעונים מראים אותו זמן, והמרווחים שווים.';
  const evs = s.events
    .map((e, i) => (e ? `ברק ${LABELS[i]}: ${eventSentence(e, s)}` : ''))
    .filter(Boolean)
    .join(' ');
  return `${head} ${rule} ${evs}`;
}
