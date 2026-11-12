/**
 * MassivePulley (lesson 8.3): rotation about a fixed axis, in two scenes.
 *
 * 'atwood': two blocks m₁ (left) and m₂ (right) on a string over a pulley that has mass M, a uniform disc or a thin
 * ring of radius R on a fixed frictionless axle. Both blocks start at rest at the same height; the heavier one
 * descends D. The learner sets m₁, m₂, M and the shape, and chooses which free-body diagram is drawn: the pulley's
 * (T₁ and T₂ at the rim where each string leaves it, the axle's force N and the weight Mg at the axle) or the two
 * blocks'. A curved arrow on the pulley shows its angular acceleration α. Bars show K₁, K₂, the pulley's ½Iω² and
 * the potential energy U (measured from the end of the run), and their sum E, which stays constant.
 *
 * 'rod': a uniform rod of length L and mass M hinged at its left end, released from rest horizontal, a coin resting
 * on its tip. Arrows show the acceleration of four points of the rod (α s across it and ω² s toward the hinge) next
 * to a reference arrow g, or the forces on the rod (the weight at its centre, the hinge's force at the hinge). The
 * coin falls freely from rest; bars show ½I_Pω², U (from the lowest point of the centre) and E.
 *
 * Physics: src/physics/rigidbody.ts (atwoodMassivePulley, disc, ring, rodEnd) and src/physics/fixedaxis.ts
 * (atwoodState, pivotedRun, pivotedAlpha, pivotForce). The motion plays at half speed. Tasks tick only inside the
 * learner's own handlers (sliders, chips, buttons); a text step only sets the state and the instant shown, and
 * never plays or ticks.
 */

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import { atwoodState, pivotForce, pivotedAlpha, pivotedQuarterTime, pivotedRun, type PivotSample } from '~/physics/fixedaxis';
import { atwoodMassivePulley, disc, ring, rodEnd } from '~/physics/rigidbody';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import type { Box } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Scene = 'atwood' | 'rod';
export type Shape = 'disc' | 'ring';
export type Fbd = 'pulley' | 'blocks' | 'none';

const SHAPE_LABEL: Record<Shape, string> = { disc: 'דסקה', ring: 'טבעת' };
const FBD_LABEL: Record<Fbd, string> = { pulley: 'כוחות על הגלגלת', blocks: 'כוחות על הגופים', none: 'בלי כוחות' };

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  massless: `קבעו מסת גלגלת ${ltr('M = 0')} והפעילו. השוו את ${ltr('T₁')} ל-${ltr('T₂')}.`,
  'ring-disc': 'באותן מסות, הפעילו פעם עם גלגלת דסקה ופעם עם גלגלת טבעת. איזו מערכת מאיצה מהר יותר?',
  'rotation-wins': `מצאו מסות שבהן האנרגיה הקינטית של הגלגלת, ${ltr('½Iω²')}, גדולה מזו של שני הגופים יחד.`,
  coin: 'הפעילו כשהמטבע מונח על קצה המוט. האם הוא נשאר על המוט?',
  'half-length': `קצרו את המוט ל-${ltr('L = 0.50 m')}. מה קרה לתאוצה הזוויתית ברגע השחרור?`,
  'mass-free': 'שנו את מסת המוט. האם התאוצה הזוויתית השתנתה?',
  vertical: 'הזיזו את פס הזמן לרגע שבו המוט תלוי אנכית. איפה האנרגיה עכשיו?',
};

export interface MassivePulleyProps {
  id: string;
  scene?: Scene;
  /** atwood: block masses [kg], the pulley's mass [kg] and shape, its radius [m], the drop [m] */
  m1?: number;
  m2?: number;
  M?: number;
  shape?: Shape;
  R?: number;
  D?: number;
  fbd?: Fbd;
  /** rod: length [m], mass [kg], what is drawn */
  L?: number;
  Mrod?: number;
  coin?: boolean;
  accel?: boolean;
  forces?: boolean;
  tasks?: string[];
}

interface Setup {
  m1: number;
  m2: number;
  M: number;
  shape: Shape;
  L: number;
  Mrod: number;
}

interface Show {
  fbd: Fbd;
  coin: boolean;
  accel: boolean;
  forces: boolean;
}

const LIM = { m: [0.2, 2.5] as [number, number], M: [0, 2.5] as [number, number], L: [0.4, 1.0] as [number, number], Mrod: [0.1, 2.0] as [number, number] };
/** the motion plays at this fraction of real time */
const SLOW = 0.5;
/** the longest Atwood run shown [s] (a nearly balanced machine barely moves) */
const T_CAP = 3;
const N_ROD = 1600;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
const signed = (x: number, tiny = 1e-9) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));
const isShape = (x: unknown): x is Shape => x === 'disc' || x === 'ring';
const isFbd = (x: unknown): x is Fbd => x === 'pulley' || x === 'blocks' || x === 'none';

function inertiaOf(s: Setup, R: number): number {
  if (s.M <= 0) return 0;
  return s.shape === 'ring' ? ring(s.M, R) : disc(s.M, R);
}

interface AtwoodRun {
  I: number;
  a: number;
  alpha: number;
  T1: number;
  T2: number;
  tEnd: number;
  /** the energy released over the whole run [J] */
  E: number;
}

function atwoodRun(s: Setup, R: number, D: number): AtwoodRun {
  const I = inertiaOf(s, R);
  const { a, alpha, T1, T2 } = atwoodMassivePulley(s.m1, s.m2, I, R);
  const tEnd = Math.abs(a) > 1e-12 ? Math.min(Math.sqrt((2 * D) / Math.abs(a)), T_CAP) : T_CAP;
  const xEnd = 0.5 * Math.abs(a) * tEnd * tEnd;
  return { I, a, alpha, T1, T2, tEnd, E: Math.abs(s.m1 - s.m2) * G * xEnd };
}

interface RodRun {
  Ip: number;
  d: number;
  tEnd: number;
  samples: PivotSample[];
}

function rodRun(s: Setup): RodRun {
  const Ip = rodEnd(s.Mrod, s.L);
  const d = s.L / 2;
  const tEnd = 2 * pivotedQuarterTime(Ip, s.Mrod, d);
  return { Ip, d, tEnd, samples: pivotedRun(Ip, s.Mrod, d, tEnd, N_ROD) };
}

function rodAt(run: RodRun, t: number): PivotSample {
  const u = clamp(t / run.tEnd, 0, 1) * N_ROD;
  const i = Math.min(N_ROD - 1, Math.floor(u));
  const f = u - i;
  const a = run.samples[i];
  const b = run.samples[i + 1];
  return { t, phi: a.phi + f * (b.phi - a.phi), omega: a.omega + f * (b.omega - a.omega) };
}

/* ---------------------------------------------------------------- drawing helpers */

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

function line(ctx: CanvasRenderingContext2D, color: string, x1: number, y1: number, x2: number, y2: number, width = 1.4, dash: number[] = []) {
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

function hatchBar(ctx: CanvasRenderingContext2D, p: Palette, x1: number, x2: number, y: number) {
  line(ctx, p.equip || p.ink2, x1, y, x2, y, 2.2);
  ctx.save();
  ctx.strokeStyle = p.equip || p.ink2;
  ctx.lineWidth = 1;
  for (let x = x1 + 4; x < x2; x += 7) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 6, y - 6);
    ctx.stroke();
  }
  ctx.restore();
}

/** An arrow of signed length L (px) along (ux, uy) from (x, y), at least `min` px when nonzero. */
function forceArrow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, ux: number, uy: number, len: number, width = 2.4, min = 14) {
  if (len < 0.5) return { x2: x, y2: y };
  const L = Math.max(min, len);
  arrow(ctx, x, y, x + ux * L, y + uy * L, { color, width, head: 8 });
  return { x2: x + ux * L, y2: y + uy * L };
}

/** A break mark across a vertical arrow shaft at (x, y): the arrow is not drawn to the scale of the others. */
function breakMark(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number) {
  ctx.save();
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - 7, y + 1);
  ctx.lineTo(x + 7, y - 5);
  ctx.stroke();
  ctx.strokeStyle = p.force;
  ctx.lineWidth = 1.5;
  for (const dy of [-2.5, 3.5]) {
    ctx.beginPath();
    ctx.moveTo(x - 7, y + dy - 0.5);
    ctx.lineTo(x + 7, y + dy - 6.5);
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- the component */

export default function MassivePulley(props: MassivePulleyProps) {
  const scene: Scene = props.scene ?? 'atwood';
  const R = props.R ?? 0.15;
  const D = props.D ?? 0.8;

  const initialSetup = (): Setup => ({
    m1: clamp(props.m1 ?? 1.6, ...LIM.m),
    m2: clamp(props.m2 ?? 1.0, ...LIM.m),
    M: clamp(props.M ?? 2.4, ...LIM.M),
    shape: props.shape ?? 'disc',
    L: clamp(props.L ?? 1.0, ...LIM.L),
    Mrod: clamp(props.Mrod ?? 0.5, ...LIM.Mrod),
  });
  const initialShow = (): Show => ({ fbd: props.fbd ?? 'pulley', coin: props.coin ?? true, accel: props.accel ?? true, forces: props.forces ?? false });

  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [show, setShow] = useState<Show>(initialShow);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  /** shapes the learner has played, keyed by the masses (for the ring-disc task) */
  const playedShapes = useRef(new Map<string, Set<Shape>>());

  const at = useMemo(() => atwoodRun(setup, R, D), [setup.m1, setup.m2, setup.M, setup.shape, R, D]);
  const rd = useMemo(() => rodRun(setup), [setup.L, setup.Mrod]);
  const tEnd = scene === 'atwood' ? at.tEnd : rd.tEnd;

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the setup, what is drawn and the instant shown; they never play and never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setPlaying(false);
        setSetup((prev) => ({
          m1: clamp(num(st.m1) ?? prev.m1, ...LIM.m),
          m2: clamp(num(st.m2) ?? prev.m2, ...LIM.m),
          M: clamp(num(st.M) ?? prev.M, ...LIM.M),
          shape: isShape(st.shape) ? st.shape : prev.shape,
          L: clamp(num(st.L) ?? prev.L, ...LIM.L),
          Mrod: clamp(num(st.Mrod) ?? prev.Mrod, ...LIM.Mrod),
        }));
        setShow((prev) => ({
          fbd: isFbd(st.fbd) ? st.fbd : prev.fbd,
          coin: bool(st.coin) ?? prev.coin,
          accel: bool(st.accel) ?? prev.accel,
          forces: bool(st.forces) ?? prev.forces,
        }));
        setTime(Math.max(0, num(st.t) ?? 0));
      }),
    [props.id],
  );

  const describe = () => {
    if (scene === 'atwood') {
      return `הגוף הכבד ירד, בתאוצה ${sci(Math.abs(at.a))} מטר לשנייה בריבוע. המתיחות בצד שמאל ${sci(at.T1)} ניוטון ובצד ימין ${sci(at.T2)} ניוטון.`;
    }
    return `המוט הסתובב עד הצד השני. ברגע השחרור התאוצה הזוויתית הייתה ${sci(pivotedAlpha(rd.Ip, setup.Mrod, rd.d, 0))} רדיאן לשנייה בריבוע.`;
  };

  const stop = () => {
    setPlaying(false);
    setTime(tEnd);
    setLive(describe());
  };

  /** the learner's play button: ticks the tasks that are about a run */
  const play = () => {
    if (scene === 'atwood') {
      if (setup.M === 0 && setup.m1 !== setup.m2) done('massless');
      if (setup.M > 0 && setup.m1 !== setup.m2) {
        const key = `${setup.m1}|${setup.m2}|${setup.M}`;
        const set = playedShapes.current.get(key) ?? new Set<Shape>();
        set.add(setup.shape);
        playedShapes.current.set(key, set);
        if (set.has('disc') && set.has('ring')) done('ring-disc');
      }
    } else if (show.coin) done('coin');
    t0.current = null;
    if (!motionAllowed()) {
      stop();
      return;
    }
    setTime(0);
    setPlaying(true);
    setLive(scene === 'atwood' ? 'המערכת נעה.' : 'המוט נופל.');
  };

  /* ---------------------------------------------------------------- layout */

  const layoutOf = (w: number, h: number) => {
    const narrow = w < 520;
    if (narrow) {
      const sh = Math.round(h * 0.62);
      return { narrow, scene: { x: 0, y: 0, w, h: sh } as Box, bars: { x: 0, y: sh, w, h: h - sh } as Box };
    }
    const sw = Math.round(w * 0.64);
    return { narrow, scene: { x: 0, y: 0, w: sw, h } as Box, bars: { x: sw, y: 0, w: w - sw, h } as Box };
  };

  /* ---------------------------------------------------------------- drawing */

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    let now = clamp(time, 0, tEnd);
    if (playing) {
      if (t0.current === null) t0.current = t;
      now = Math.min((t - t0.current) * SLOW, tEnd);
      if (now >= tEnd) stop();
    }
    const Lo = layoutOf(view.w, view.h);
    const fs = Lo.narrow ? 11 : 12;
    // the divider between the scene and the bars
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (Lo.narrow) {
      ctx.moveTo(10, Lo.bars.y + 0.5);
      ctx.lineTo(view.w - 10, Lo.bars.y + 0.5);
    } else {
      ctx.moveTo(Lo.bars.x + 0.5, 34);
      ctx.lineTo(Lo.bars.x + 0.5, view.h - 10);
    }
    ctx.stroke();
    ctx.restore();
    if (scene === 'atwood') drawAtwood(ctx, p, Lo.scene, Lo.bars, fs, Lo.narrow, now);
    else drawRod(ctx, p, Lo.scene, Lo.bars, fs, Lo.narrow, now);
    if (playing) handNote(ctx, 'הילוך איטי פי 2', Lo.scene.x + Lo.scene.w / 2, Lo.scene.y + Lo.scene.h - 12, p, Lo.narrow ? 12 : 13);
  };

  /** Bars of energy on one scale, E the stacked sum. Each item: label, value, colour, striped. */
  function drawBars(ctx: CanvasRenderingContext2D, p: Palette, b: Box, fs: number, narrow: boolean, items: { label: string; value: number; color: string; striped?: boolean }[], E: number) {
    const top = b.y + (narrow ? 34 : 70);
    const bottom = b.y + b.h - (narrow ? 26 : 40);
    const hh = Math.max(20, bottom - top);
    const n = items.length + 1;
    const slot = (b.w - 20) / n;
    const colW = Math.min(36, slot * 0.62);
    const xOf = (i: number) => b.x + 10 + slot * (i + 0.5) - colW / 2;
    const scale = E > 1e-12 ? hh / E : 0;
    handNote(ctx, 'אנרגיה', b.x + b.w / 2, b.y + (narrow ? 14 : 48), p, narrow ? 13 : 14);
    const fillBar = (x: number, y0: number, h: number, color: string, striped: boolean) => {
      if (h <= 0.3) return;
      ctx.save();
      ctx.fillStyle = color;
      ctx.fillRect(x, y0 - h, colW, h);
      if (striped) {
        ctx.beginPath();
        ctx.rect(x, y0 - h, colW, h);
        ctx.clip();
        ctx.strokeStyle = withAlpha(p.paper, 0.75);
        ctx.lineWidth = 2;
        for (let k = -colW; k < h + colW; k += 7) {
          ctx.beginPath();
          ctx.moveTo(x, y0 - k);
          ctx.lineTo(x + colW, y0 - k - colW);
          ctx.stroke();
        }
      }
      ctx.restore();
    };
    const outline = (x: number) => {
      ctx.save();
      ctx.strokeStyle = p.rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, top, colW, hh);
      ctx.restore();
    };
    let stack = 0;
    items.forEach((it, i) => {
      const x = xOf(i);
      outline(x);
      fillBar(x, bottom, it.value * scale, it.color, !!it.striped);
      haloText(ctx, p, it.label, x + colW / 2, bottom + 13, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2 });
      fillBar(xOf(items.length), bottom - stack * scale, it.value * scale, it.color, !!it.striped);
      stack += it.value;
    });
    const xe = xOf(items.length);
    outline(xe);
    haloText(ctx, p, 'E', xe + colW / 2, bottom + 13, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink });
    haloText(ctx, p, `${sci(E)} J`, xe + colW / 2, top - 9, { font: `${fs - 1}px ${p.fontUi}`, color: p.ink2 });
  }

  function drawAtwood(ctx: CanvasRenderingContext2D, p: Palette, S: Box, B: Box, fs: number, narrow: boolean, now: number) {
    const st = atwoodState(setup.m1, setup.m2, at.I, R, now);
    const cx = S.x + S.w / 2;
    const rp = narrow ? 30 : 42;
    const cy = S.y + Math.round(S.h * 0.36);
    const ceilY = S.y + 12;
    const bw = narrow ? 30 : 38;
    const bh = narrow ? 26 : 32;
    const floorY = S.y + S.h - (narrow ? 22 : 30);
    // the blocks start level; each has D of room up (under the pulley) and down (to the floor)
    const room = (floorY - (cy + rp + 10) - bh) / 2;
    const pxPerM = room / D;
    const yStart = cy + rp + 10 + room; // top of each block at the start
    const y1 = yStart + st.x * pxPerM;
    const y2 = yStart - st.x * pxPerM;
    const xL = cx - rp;
    const xR = cx + rp;

    // ceiling, the bracket that holds the axle, the floor
    hatchBar(ctx, p, cx - 70, cx + 70, ceilY);
    line(ctx, p.equip || p.ink2, cx - 26, ceilY, cx, cy, 2);
    line(ctx, p.equip || p.ink2, cx + 26, ceilY, cx, cy, 2);
    line(ctx, p.ink2, S.x + 14, floorY, S.x + S.w - 14, floorY, 1.4);

    // strings: from the rim's sides down to the blocks, and over the top of the pulley
    line(ctx, p.ink, xL, cy, xL, y1, 1.6);
    line(ctx, p.ink, xR, cy, xR, y2, 1.6);
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, rp, Math.PI, 0);
    ctx.stroke();
    ctx.restore();

    // the pulley: a disc (filled) or a ring (a heavy rim with spokes); turned by the string without slipping
    const thetaVis = (st.x * pxPerM) / rp; // counter-clockwise positive (world); m₁ (left) down turns it this way
    ctx.save();
    if (setup.M <= 0) {
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, rp - 1, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (setup.shape === 'disc') {
      ctx.fillStyle = withAlpha(p.ink3, 0.35);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, rp - 1, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.strokeStyle = withAlpha(p.ink2, 0.9);
      ctx.lineWidth = narrow ? 6 : 8;
      ctx.beginPath();
      ctx.arc(cx, cy, rp - (narrow ? 4 : 5), 0, 2 * Math.PI);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = p.ink3;
      for (let k = 0; k < 3; k++) {
        const ang = thetaVis + (k * 2 * Math.PI) / 3 + Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (rp - 8) * Math.cos(ang), cy - (rp - 8) * Math.sin(ang));
        ctx.stroke();
      }
    }
    ctx.restore();
    // a radial mark that turns with the pulley (starts pointing up)
    const angM = Math.PI / 2 + thetaVis;
    line(ctx, p.accent, cx, cy, cx + (rp - 3) * Math.cos(angM), cy - (rp - 3) * Math.sin(angM), 2.4);
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();

    // blocks
    const block = (x: number, yTop: number, lbl: string) => {
      ctx.save();
      ctx.fillStyle = p.paper2;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.8;
      ctx.fillRect(x - bw / 2, yTop, bw, bh);
      ctx.strokeRect(x - bw / 2, yTop, bw, bh);
      ctx.restore();
      haloText(ctx, p, lbl, x, yTop + bh / 2 + 1, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink2 });
    };
    block(xL, y1, 'm₁');
    block(xR, y2, 'm₂');

    // the angular acceleration: a curved arrow above the pulley, in its sense
    if (Math.abs(at.alpha) > 1e-9 && setup.M > 0) {
      const ra = rp + (narrow ? 9 : 12);
      const ccw = at.alpha > 0;
      const a0 = Math.PI * 0.62;
      const a1 = Math.PI * 0.38;
      ctx.save();
      ctx.strokeStyle = p.accel;
      ctx.lineWidth = 2;
      ctx.beginPath();
      // canvas angles grow clockwise: world angle θ is −θ on canvas
      ctx.arc(cx, cy, ra, -a0, -a1, false);
      ctx.stroke();
      ctx.restore();
      const end = ccw ? a0 : a1;
      const from = ccw ? a0 - 0.12 : a1 + 0.12;
      arrow(ctx, cx + ra * Math.cos(from), cy - ra * Math.sin(from), cx + ra * Math.cos(end), cy - ra * Math.sin(end), { color: p.accel, width: 2, head: 7 });
      haloText(ctx, p, 'α', cx + (ccw ? -1 : 1) * (ra * 0.55 + 10), cy - ra - 6, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.accel });
    }

    // the free-body diagram chosen
    if (show.fbd === 'pulley') {
      // The point of this diagram is that T₁ ≠ T₂. On one scale with N = T₁ + T₂ + Mg the two tensions differ by a
      // few pixels, so the tensions get their own, larger scale (the larger one reaches most of the way down to the
      // blocks' start), their difference is marked, and N and Mg are drawn on a smaller scale with a break mark.
      const N = at.T1 + at.T2 + setup.M * G;
      const tMax = Math.max(at.T1, at.T2, 1e-9);
      const tScale = (rp + 10 + room * 0.8) / tMax;
      const t1 = forceArrow(ctx, p.force, xL, cy, 0, 1, at.T1 * tScale);
      haloText(ctx, p, 'T₁', xL - 10, cy + rp + 12, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force, align: 'right' });
      const t2 = forceArrow(ctx, p.force, xR, cy, 0, 1, at.T2 * tScale);
      haloText(ctx, p, 'T₂', xR + 10, cy + rp + 12, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force, align: 'left' });
      const gap = t1.y2 - t2.y2;
      if (Math.abs(gap) >= 3) {
        // a dashed level at the shorter arrow's tip, and a bracket on the longer one: the excess is T₁ − T₂
        const yShort = Math.min(t1.y2, t2.y2);
        const yLong = Math.max(t1.y2, t2.y2);
        const left = t1.y2 > t2.y2;
        line(ctx, withAlpha(p.force, 0.7), xL - 18, yShort, xR + 18, yShort, 1, [4, 3]);
        const bx = left ? xL - 14 : xR + 14;
        const tick = left ? 5 : -5;
        line(ctx, p.force, bx, yShort, bx, yLong, 1.6);
        line(ctx, p.force, bx, yShort, bx + tick, yShort, 1.6);
        line(ctx, p.force, bx, yLong, bx + tick, yLong, 1.6);
        haloText(ctx, p, left ? 'T₁ − T₂' : 'T₂ − T₁', bx + (left ? -6 : 6), (yShort + yLong) / 2, {
          font: `italic 700 ${fs}px ${p.fontUi}`,
          color: p.force,
          align: left ? 'right' : 'left',
        });
      }
      // N fits the room above the axle; Mg on the same (smaller) scale; both broken: not the tensions' scale
      const nScale = (cy - ceilY - 6) / Math.max(N, 1e-9);
      const n = forceArrow(ctx, p.force, cx, cy, 0, -1, N * nScale);
      breakMark(ctx, p, cx, (cy + n.y2) / 2);
      haloText(ctx, p, 'N', cx + 9, n.y2 + 10, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force, align: 'left' });
      if (setup.M > 0) {
        const w = forceArrow(ctx, p.force, cx + 1, cy, 0, 1, setup.M * G * nScale, 2.2, 24);
        breakMark(ctx, p, cx + 1, cy + (w.y2 - cy) * 0.6);
        haloText(ctx, p, 'Mg', cx + 7, w.y2 - 2, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force, align: 'left' });
      }
    } else if (show.fbd === 'blocks') {
      const scale = Math.min(room * 0.8, 64) / Math.max(setup.m1 * G, setup.m2 * G);
      const tl = forceArrow(ctx, p.force, xL, y1, 0, -1, at.T1 * scale);
      haloText(ctx, p, 'T₁', xL - 10, tl.y2 + 6, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force, align: 'right' });
      const wl = forceArrow(ctx, p.force, xL, y1 + bh / 2, 0, 1, setup.m1 * G * scale);
      haloText(ctx, p, 'm₁g', xL - 10, wl.y2 - 6, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force, align: 'right' });
      const tr = forceArrow(ctx, p.force, xR, y2, 0, -1, at.T2 * scale);
      haloText(ctx, p, 'T₂', xR + 10, tr.y2 + 6, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force, align: 'left' });
      const wr = forceArrow(ctx, p.force, xR, y2 + bh / 2, 0, 1, setup.m2 * G * scale);
      haloText(ctx, p, 'm₂g', xR + 10, wr.y2 - 6, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force, align: 'left' });
    }
    if (setup.m1 === setup.m2) handNote(ctx, 'מסות שוות: אין תאוצה', cx, floorY - 10, p, narrow ? 12 : 13);

    // energy bars: U from the end of the run, so E = K₁ + K₂ + ½Iω² + U stays at its start value
    const U = Math.max(0, at.E + st.dU);
    drawBars(
      ctx,
      p,
      B,
      fs,
      narrow,
      [
        { label: 'K₁', value: st.K1, color: p.energyK },
        { label: 'K₂', value: st.K2, color: withAlpha(p.energyK, 0.55) },
        { label: '½Iω²', value: st.Krot, color: p.energyK, striped: true },
        { label: 'U', value: U, color: p.energyP },
      ],
      at.E,
    );
  }

  function drawRod(ctx: CanvasRenderingContext2D, p: Palette, S: Box, B: Box, fs: number, narrow: boolean, now: number) {
    const s = rodAt(rd, now);
    const M = setup.Mrod;
    const L = setup.L;
    const px0 = S.x + (narrow ? 36 : 54);
    const py0 = S.y + Math.round(S.h * (narrow ? 0.24 : 0.22));
    // the tip stays clear of the reference arrow g at the scene's right edge
    const pxPerM = Math.max(10, Math.min(S.w - (px0 - S.x) - (narrow ? 52 : 70), S.y + S.h - py0 - 30)) / LIM.L[1];
    const Lpx = L * pxPerM;
    const c = Math.cos(s.phi);
    const sn = Math.sin(s.phi);
    const pt = (dist: number): [number, number] => [px0 + dist * pxPerM * c, py0 + dist * pxPerM * sn];
    const [tx, ty] = pt(L);

    // the swing's path of the tip, and the support of the hinge
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink3, 0.6);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px0, py0, Lpx, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = withAlpha(p.equip || p.ink2, 0.25);
    ctx.strokeStyle = p.equip || p.ink2;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px0, py0);
    ctx.lineTo(px0 - 16, py0 - 22);
    ctx.lineTo(px0 + 16, py0 - 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    hatchBar(ctx, p, px0 - 24, px0 + 24, py0 - 22);

    // the rod
    const half = narrow ? 4 : 5;
    ctx.save();
    ctx.translate(px0, py0);
    ctx.rotate(s.phi);
    ctx.fillStyle = p.paper2;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.rect(0, -half, Lpx, 2 * half);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = p.paper;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(px0, py0, 4.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // the centre of mass
    const [gx, gy] = pt(L / 2);
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(gx, gy, 2.6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();

    // the coin: free from the start; it falls at g while the tip falls faster
    if (show.coin) {
      const cxn = px0 + Lpx - 7;
      const cyn = py0 - half - 3 + 0.5 * G * now * now * pxPerM;
      if (cyn < S.y + S.h + 10) {
        ctx.save();
        ctx.fillStyle = p.hand;
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cxn, cyn, 7, 3, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    const al = pivotedAlpha(rd.Ip, M, rd.d, s.phi);
    if (show.accel) {
      // the acceleration of points of the rod: α s across the rod, ω² s toward the hinge; scale: 3g fits 0.32 of the scene
      const accPx = (0.32 * S.h) / (3 * G);
      for (const f of [0.25, 0.5, 0.75, 1]) {
        const dist = f * L;
        const [x, y] = pt(dist);
        // across the rod, in the sense of increasing φ: (−sin φ, cos φ) on canvas (y down)
        const at_ = al * dist;
        const ac = s.omega * s.omega * dist;
        const ax = at_ * -sn - ac * c;
        const ay = at_ * c - ac * sn;
        const mag = Math.hypot(ax, ay);
        if (mag * accPx > 0.5) arrow(ctx, x, y, x + (ax / mag) * Math.max(10, mag * accPx), y + (ay / mag) * Math.max(10, mag * accPx), { color: p.accel, width: 2.2, head: 7 });
      }
      // the reference: free fall, g
      const gxr = S.x + S.w - (narrow ? 16 : 24);
      const gyr = py0 - 6;
      arrow(ctx, gxr, gyr, gxr, gyr + G * accPx, { color: withAlpha(p.accel, 0.6), width: 2.2, head: 7 });
      haloText(ctx, p, 'g', gxr, gyr - 10, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.accel });
      if (now === 0) {
        // where the acceleration equals g at the release: s = 2L/3
        const [mx, my] = pt((2 * L) / 3);
        line(ctx, p.hand, mx, my - 12, mx, my + 12, 1.4, [3, 3]);
        haloText(ctx, p, '2L/3', mx, my - 20, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.hand });
      }
    }
    if (show.forces) {
      // forces on the rod: its weight at the centre, the hinge's force at the hinge; 2.5 Mg fits 0.3 of the scene
      const fPx = (0.3 * S.h) / (2.5 * M * G);
      const w = forceArrow(ctx, p.force, gx, gy, 0, 1, M * G * fPx);
      haloText(ctx, p, 'Mg', gx + 8, w.y2 - 4, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force, align: 'left' });
      const [Fx, Fy] = pivotForce(rd.Ip, M, rd.d, s.phi, s.omega);
      const Fm = Math.hypot(Fx, Fy);
      if (Fm > 1e-9) {
        const n = forceArrow(ctx, p.force, px0, py0, Fx / Fm, -Fy / Fm, Fm * fPx);
        haloText(ctx, p, 'F', n.x2 + (Fx >= 0 ? 9 : -9), n.y2 - 2, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force });
      }
    }
    haloText(ctx, p, 'L', px0 + 0.36 * (tx - px0) + 10 * sn, py0 + 0.36 * (ty - py0) - 14 * c, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink2 });
    handNote(ctx, 'ציר', px0 - 20, py0 + 16, p, narrow ? 12 : 13);

    const E = M * G * rd.d;
    const U = M * G * rd.d * (1 - sn);
    drawBars(
      ctx,
      p,
      B,
      fs,
      narrow,
      [
        { label: '½Iₚω²', value: Math.max(0, E - U), color: p.energyK, striped: true },
        { label: 'U', value: U, color: p.energyP },
      ],
      E,
    );
  }

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1, animate: playing });
  useEffect(invalidate, [setup, show, time, playing, at, rd]);

  const [narrowStage, setNarrowStage] = useState(false);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrowStage(el.getBoundingClientRect().width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [narrowStage]);
  const aspect = narrowStage ? 0.62 : 1.35;

  /* ---------------------------------------------------------------- input (the learner's handlers tick tasks) */

  const change = (f: (s: Setup) => Setup) => {
    setPlaying(false);
    setTime(0);
    const next = f(setup);
    if (scene === 'atwood') {
      const I = inertiaOf(next, R);
      if (next.M > 0 && next.m1 !== next.m2 && I / (R * R) > next.m1 + next.m2) done('rotation-wins');
    } else {
      if (Math.abs(next.L - 0.5) < 1e-9 && next.L !== setup.L) done('half-length');
      if (next.Mrod !== setup.Mrod) done('mass-free');
    }
    setSetup(next);
  };
  const scrub = (v: number) => {
    setPlaying(false);
    const tt = clamp(v, 0, tEnd);
    setTime(tt);
    if (scene === 'rod' && Math.abs(rodAt(rd, tt).phi - Math.PI / 2) < 0.035) done('vertical');
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') play();
    else return;
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const shown = clamp(time, 0, tEnd);
  const tStep = Number((tEnd / 200).toPrecision(2));
  let readout: ComponentChildren;
  let label: string;
  if (scene === 'atwood') {
    const st = atwoodState(setup.m1, setup.m2, at.I, R, shown);
    label = `איור חי: מכונת אטווד. גוף של ${sci(setup.m1)} קילוגרם משמאל וגוף של ${sci(setup.m2)} קילוגרם מימין, על חוט שעובר על גלגלת ${setup.M > 0 ? `${SHAPE_LABEL[setup.shape]} במסה ${sci(setup.M)} קילוגרם` : 'חסרת מסה'}. התאוצה ${sci(Math.abs(at.a))} מטר לשנייה בריבוע, המתיחויות ${sci(at.T1)} ו-${sci(at.T2)} ניוטון. Enter מפעיל.`;
    readout = playing ? (
      <span>המערכת נעה…</span>
    ) : (
      <>
        <span class="q" data-readout="a">
          a = <b>{signed(at.a)} m/s²</b>
        </span>
        <span class="q" data-readout="alpha">
          α = <b>{signed(at.alpha)} rad/s²</b>
        </span>
        <span class="q" data-readout="T1">
          T₁ = <b>{signed(at.T1)} N</b>
        </span>
        <span class="q" data-readout="T2">
          T₂ = <b>{signed(at.T2)} N</b>
        </span>
        <span class="q" data-readout="dT">
          T₁ − T₂ = <b>{signed(at.T1 - at.T2, 1e-9)} N</b>
        </span>
        <span class="q" data-readout="IR2">
          I/R² = <b>{signed(at.I / (R * R))} kg</b>
        </span>
        <span class="q" data-readout="t">
          t = <b>{signed(shown)} s</b>
        </span>
        <span class="q" data-readout="v">
          v = <b>{signed(Math.abs(st.v))} m/s</b>
        </span>
        <span class="q" data-readout="omega">
          ω = <b>{signed(st.omega)} rad/s</b>
        </span>
        <span class="q" data-readout="Krot">
          ½Iω² = <b>{signed(st.Krot)} J</b>
        </span>
      </>
    );
  } else {
    const s = rodAt(rd, shown);
    const al = pivotedAlpha(rd.Ip, setup.Mrod, rd.d, s.phi);
    const tip = Math.hypot(al * setup.L, s.omega * s.omega * setup.L);
    const [Fx, Fy] = pivotForce(rd.Ip, setup.Mrod, rd.d, s.phi, s.omega);
    label = `איור חי: מוט באורך ${sci(setup.L)} מטר ובמסה ${sci(setup.Mrod)} קילוגרם, שמסתובב סביב ציר בקצהו ומשוחרר ממנוחה כשהוא אופקי${show.coin ? ', ומטבע מונח על קצהו' : ''}. ברגע השחרור התאוצה הזוויתית ${sci(pivotedAlpha(rd.Ip, setup.Mrod, rd.d, 0))} רדיאן לשנייה בריבוע. Enter מפעיל.`;
    readout = playing ? (
      <span>המוט נופל…</span>
    ) : (
      <>
        <span class="q" data-readout="alpha">
          α = <b>{signed(al, 0.01)} rad/s²</b>
        </span>
        <span class="q" data-readout="tip">
          a<sub>tip</sub> = <b>{signed(tip)} m/s²</b>
        </span>
        <span class="q" data-readout="F">
          F = <b>{signed(Math.hypot(Fx, Fy))} N</b>
        </span>
        <span class="q" data-readout="Mg">
          Mg = <b>{signed(setup.Mrod * G)} N</b>
        </span>
        <span class="q" data-readout="t">
          t = <b>{signed(shown)} s</b>
        </span>
        <span class="q" data-readout="phi">
          φ = <b>{signed((s.phi * 180) / Math.PI, 1e-6)}°</b>
        </span>
        <span class="q" data-readout="omega">
          ω = <b>{signed(s.omega)} rad/s</b>
        </span>
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
        setSetup(initialSetup());
        setShow(initialShow());
        setPlaying(false);
        setTime(0);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={readout}
      controls={
        scene === 'atwood' ? (
          <>
            <Slider label="המסה m₁ (משמאל)" value={setup.m1} min={LIM.m[0]} max={LIM.m[1]} step={0.1} format={(x) => `${sci(x)} kg`} onChange={(v) => change((s) => ({ ...s, m1: clamp(roundTo(v, 0.1), ...LIM.m) }))} />
            <Slider label="המסה m₂ (מימין)" value={setup.m2} min={LIM.m[0]} max={LIM.m[1]} step={0.1} format={(x) => `${sci(x)} kg`} onChange={(v) => change((s) => ({ ...s, m2: clamp(roundTo(v, 0.1), ...LIM.m) }))} />
            <Slider label="מסת הגלגלת M" value={setup.M} min={LIM.M[0]} max={LIM.M[1]} step={0.1} format={(x) => `${sci(x)} kg`} onChange={(v) => change((s) => ({ ...s, M: clamp(roundTo(v, 0.1), ...LIM.M) }))} />
            <div class="group" role="group" aria-label="צורת הגלגלת">
              {(['disc', 'ring'] as Shape[]).map((sh) => (
                <Toggle key={sh} label={SHAPE_LABEL[sh]} on={setup.shape === sh} onChange={() => change((s) => ({ ...s, shape: sh }))} />
              ))}
            </div>
            <Slider label="זמן" value={Number(shown.toPrecision(3))} min={0} max={Number(tEnd.toPrecision(4))} step={tStep} format={(x) => `${sci(x)} s`} onChange={scrub} />
            <div class="group" role="group" aria-label="הפעלה">
              <button type="button" class="btn primary" onClick={play}>
                הפעלה
              </button>
            </div>
            <div class="group" role="group" aria-label="תרשים כוחות">
              {(['pulley', 'blocks', 'none'] as Fbd[]).map((f) => (
                <Toggle key={f} label={FBD_LABEL[f]} on={show.fbd === f} swatch={f === 'none' ? undefined : 'var(--force)'} onChange={() => setShow((x) => ({ ...x, fbd: f }))} />
              ))}
            </div>
          </>
        ) : (
          <>
            <Slider label="אורך המוט L" value={setup.L} min={LIM.L[0]} max={LIM.L[1]} step={0.1} format={(x) => `${sci(x)} m`} onChange={(v) => change((s) => ({ ...s, L: clamp(roundTo(v, 0.1), ...LIM.L) }))} />
            <Slider label="מסת המוט M" value={setup.Mrod} min={LIM.Mrod[0]} max={LIM.Mrod[1]} step={0.1} format={(x) => `${sci(x)} kg`} onChange={(v) => change((s) => ({ ...s, Mrod: clamp(roundTo(v, 0.1), ...LIM.Mrod) }))} />
            <Slider label="זמן" value={Number(shown.toPrecision(3))} min={0} max={Number(tEnd.toPrecision(4))} step={tStep} format={(x) => `${sci(x)} s`} onChange={scrub} />
            <div class="group" role="group" aria-label="הפעלה">
              <button type="button" class="btn primary" onClick={play}>
                הפעלה
              </button>
            </div>
            <div class="group" role="group" aria-label="מה להציג">
              <Toggle label="מטבע" on={show.coin} onChange={(on) => setShow((x) => ({ ...x, coin: on }))} />
              <Toggle label="תאוצות" on={show.accel} swatch="var(--accel)" onChange={(on) => setShow((x) => ({ ...x, accel: on }))} />
              <Toggle label="כוחות על המוט" on={show.forces} swatch="var(--force)" onChange={(on) => setShow((x) => ({ ...x, forces: on }))} />
            </div>
          </>
        )
      }
    />
  );
}
