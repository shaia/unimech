/**
 * InertiaBuilder (lesson 8.2): a moment of inertia built from pieces, and the two axis theorems.
 *
 * Mode 'sum': a body (a uniform rod, a thin cone whose linear density grows as x², a thin ring, a uniform disc or a
 * uniform solid sphere) cut into n pieces. Each piece's mass sits at its middle; the bars compare the sum Σ mᵢ rᵢ²
 * with the integral ∫ r² dm. The axis (⊙, perpendicular to the page; for the sphere a vertical line in the page) is
 * dragged parallel to itself; the plot shows either the sum against n (it climbs to the integral) or I against the
 * axis position (the parabola I_cm + M d², lowest at the centre of mass). Every value is a coefficient of M L² (rod,
 * cone) or M R² (round bodies): src/physics/inertia.ts.
 *
 * Mode 'perp': a square plate, a disc or a ring in the xy plane, seen from above and from the side, with a thickness
 * h the learner sets. Stacked bars build I_x = Σm(y² + z²), I_y = Σm(x² + z²), I_z = Σm(x² + y²) and I_x + I_y from
 * the three sums Σmx², Σmy², Σmz², so the perpendicular-axis theorem holds exactly when Σmz² = 0.
 *
 * Tasks tick only in the learner's own handlers (chips, sliders, dragging the axis, keys), never from a text step.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { axisMoments, centreOfMass, cut, exactInertia, pieceSum, secondMoments, type CutBody, type FlatBody, type Piece } from '~/physics/inertia';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { depthGlyph, handNote, withAlpha } from './core/ink';
import { drawAxes, insetBox, makePlot, type Box, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Mode = 'sum' | 'perp';
type PlotKind = 'n' | 'axis';

const N_MAX = 200;
/** the convergence plot shows n = 1 … N_PLOT */
const N_PLOT = 40;
const BODIES: CutBody[] = ['rod', 'cone', 'ring', 'disc', 'sphere'];
const FLATS: FlatBody[] = ['plate', 'disc', 'ring'];
const H_MAX = 1.2;

const isRod = (b: CutBody) => b === 'rod' || b === 'cone';
/** the range of the axis position: along the rod (units of L, the rod from 0 to 1) or across the round body (units of R) */
const aRange = (b: CutBody): [number, number] => (isRod(b) ? [-0.25, 1.25] : [-1.5, 1.5]);
const aDefault = (b: CutBody) => (isRod(b) ? 0.5 : 0);
const unitOf = (b: CutBody) => (isRod(b) ? 'L' : 'R');
const flatUnit = (b: FlatBody) => (b === 'plate' ? 'a' : 'R');

const BODY_NAME: Record<CutBody, string> = { rod: 'מוט אחיד', cone: 'קונוס דק', ring: 'טבעת', disc: 'דסקה', sphere: 'כדור מלא' };
const FLAT_NAME: Record<FlatBody, string> = { plate: 'לוח ריבועי', disc: 'דסקה', ring: 'טבעת' };

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  'rod-pieces': 'במוט האחיד, הגדילו את מספר החתיכות ל-50 לפחות. לאיזה מספר מתקרב הסכום?',
  'rod-end': 'במוט האחיד, גררו את הציר אל אחד מקצות המוט, וקראו את מומנט ההתמד.',
  'disc-rings': 'בדסקה, התחילו מטבעת אחת והגדילו את מספר הטבעות ל-30 לפחות.',
  'cone-min': 'בקונוס הדק, עברו לגרף I מול מקום הציר, ומצאו את הציר שסביבו מומנט ההתמד הקטן ביותר.',
  'sphere-slices': 'בכדור, הגדילו את מספר הפרוסות ל-30 לפחות.',
  'disc-flat': 'בחרו בדסקה, בעובי אפס, וקראו את מומנט ההתמד סביב קוטר.',
  thick: `תנו לגוף עובי של ${ltr('0.3')} לפחות, והשוו את מומנט ההתמד סביב z לסכום של אלה סביב x וסביב y.`,
  cube: 'בלוח הריבועי, הגדילו את העובי עד שהלוח נהיה קובייה. מה קורה לשלושת מומנטי ההתמד?',
};

export interface InertiaBuilderProps {
  id: string;
  mode?: Mode;
  /** sum mode: the body shown first and the chips offered */
  body?: CutBody;
  bodies?: CutBody[];
  /** number of pieces */
  n?: number;
  /** axis position: along the rod in units of L (rod from 0 to 1), or from the centre in units of R */
  a?: number;
  plot?: PlotKind;
  /** perp mode: the flat body and its thickness (units of the side a or the radius R) */
  flat?: FlatBody;
  flats?: FlatBody[];
  h?: number;
  tasks?: string[];
}

interface State {
  body: CutBody;
  n: number;
  a: number;
  plot: PlotKind;
  flat: FlatBody;
  h: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const isBody = (x: unknown): x is CutBody => typeof x === 'string' && (BODIES as string[]).includes(x);
const isFlat = (x: unknown): x is FlatBody => typeof x === 'string' && (FLATS as string[]).includes(x);
const round3 = (x: number) => Math.round(x * 1000) / 1000;
/** A readout number: 3 significant figures and no "−0". */
const fmt = (x: number, tiny = 1e-12) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));

/** Snap the axis onto the centre of mass and, for the rods, onto their ends. */
function snapA(b: CutBody, a: number): number {
  const [lo, hi] = aRange(b);
  const tol = isRod(b) ? 0.02 : 0.04;
  const marks = isRod(b) ? [0, 1, centreOfMass(b)] : [0];
  for (const m of marks) if (Math.abs(a - m) < tol) return m;
  return clamp(round3(a), lo, hi);
}

/** Canvas text with a paper halo (Latin and math labels only; Hebrew goes through handNote). */
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

/** "I" with a subscript, drawn left-aligned at (x, y); returns the width used. */
function subLabel(ctx: CanvasRenderingContext2D, p: Palette, main: string, sub: string, x: number, y: number, fs: number, color: string): number {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.font = `italic 700 ${fs}px ${p.fontUi}`;
  ctx.fillText(main, x, y);
  const w1 = ctx.measureText(main).width;
  ctx.font = `italic 600 ${Math.round(fs * 0.72)}px ${p.fontUi}`;
  ctx.fillText(sub, x + w1 + 1, y + fs * 0.3);
  const w2 = ctx.measureText(sub).width;
  ctx.restore();
  return w1 + 1 + w2;
}

/** The centre-of-mass glyph: a disc in quarters, two filled and two open (as in lesson 3.4). */
function cmGlyph(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number) {
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.accent;
  for (const a0 of [0, Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, a0 - Math.PI / 2, a0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** A dimension line between two screen x at height y, with a label above it. */
function dimension(ctx: CanvasRenderingContext2D, p: Palette, x1: number, x2: number, y: number, label: string, fs: number, color: string) {
  if (Math.abs(x2 - x1) < 6) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  for (const x of [x1, x2]) {
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
  }
  ctx.stroke();
  ctx.restore();
  haloText(ctx, p, label, (x1 + x2) / 2, y - fs * 0.75, { font: `italic 700 ${fs}px ${p.fontUi}`, color });
}

/* ================================================================ sum mode: layout */

interface SumLayout {
  narrow: boolean;
  geo: Box;
  sx: (x: number) => number;
  sy: (y: number) => number;
  scale: number;
  bars: Box;
  plot: Plot;
}

function sumLayout(w: number, h: number, s: State, yTop: number): SumLayout {
  const narrow = w < 520;
  const gh = h * (isRod(s.body) ? (narrow ? 0.3 : 0.32) : narrow ? 0.4 : 0.42);
  const geo: Box = { x: 0, y: 0, w, h: gh };
  const bars: Box = { x: 0, y: gh, w, h: narrow ? 58 : 62 };
  const plotOuter: Box = { x: 0, y: gh + bars.h, w, h: h - gh - bars.h };
  const [lo, hi] = aRange(s.body);
  const pad = 12;
  // rods: the axis range across, a thin strip tall; round bodies: the axis range across, the body's diameter tall
  const x0 = lo - 0.06;
  const x1 = hi + 0.06;
  const yHalf = isRod(s.body) ? 0.42 : 1.3;
  const scale = Math.max(1, Math.min((geo.w - 2 * pad) / (x1 - x0), (geo.h - 2 * pad) / (2 * yHalf)));
  const left = geo.x + (geo.w - scale * (x1 - x0)) / 2;
  const cy = geo.y + geo.h / 2 + (isRod(s.body) ? 6 : 0);
  const sx = (x: number) => left + (x - x0) * scale;
  const sy = (y: number) => cy - y * scale;
  const box = insetBox(plotOuter, { l: 56, r: narrow ? 12 : 20, t: 10, b: 44 });
  const u = isRod(s.body) ? 'ML²' : 'MR²';
  const plot =
    s.plot === 'n'
      ? makePlot(box, { min: 0, max: N_PLOT, label: 'מספר החתיכות n', ticks: [1, 10, 20, 30, 40], format: (v) => String(v) }, { min: 0, max: yTop, label: `I (${u})`, format: (v) => sci(v, 2) })
      : makePlot(
          box,
          { min: lo, max: hi, label: `מקום הציר (${unitOf(s.body)})`, format: (v) => sci(v, 2).replace('-', '−') },
          { min: 0, max: yTop, label: `I (${u})`, format: (v) => sci(v, 2) },
        );
  return { narrow, geo, sx, sy, scale, bars, plot };
}

/** The top of the plot's y axis: fixed per body and plot, so the curves do not jump while the learner drags. */
function yTopOf(s: State): number {
  if (s.plot === 'axis') {
    const [lo, hi] = aRange(s.body);
    return 1.08 * Math.max(exactInertia(s.body, lo), exactInertia(s.body, hi));
  }
  const ex = exactInertia(s.body, s.a);
  let top = ex;
  for (let k = 1; k <= N_PLOT; k++) top = Math.max(top, pieceSum(cut(s.body, k), s.a));
  return 1.2 * top;
}

/* ================================================================ perp mode: layout */

interface PerpLayout {
  narrow: boolean;
  face: Box;
  side: Box;
  bars: Box;
}

function perpLayout(w: number, h: number): PerpLayout {
  const narrow = w < 520;
  const top = h * (narrow ? 0.52 : 0.56);
  const faceW = w * 0.58;
  return {
    narrow,
    face: { x: 0, y: 0, w: faceW, h: top },
    side: { x: faceW, y: 0, w: w - faceW, h: top },
    bars: { x: 0, y: top, w, h: h - top },
  };
}

export default function InertiaBuilder(props: InertiaBuilderProps) {
  const mode: Mode = props.mode ?? 'sum';
  const offered: CutBody[] = props.bodies ?? [props.body ?? 'rod'];
  const offeredFlat: FlatBody[] = props.flats ?? [props.flat ?? 'plate'];
  const initial = (): State => {
    const body = props.body ?? offered[0];
    const [lo, hi] = aRange(body);
    return {
      body,
      n: clamp(Math.round(props.n ?? 4), 1, N_MAX),
      a: clamp(props.a ?? aDefault(body), lo, hi),
      plot: props.plot ?? 'n',
      flat: props.flat ?? offeredFlat[0],
      h: clamp(props.h ?? 0, 0, H_MAX),
    };
  };
  const [s, setS] = useState<State>(initial);
  const [live, setLive] = useState('');
  const dragging = useRef(false);

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the scene; they never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const body = isBody(st.body) ? st.body : prev.body;
          const [lo, hi] = aRange(body);
          const a = num(st.a) ?? (body === prev.body ? prev.a : aDefault(body));
          return {
            body,
            n: clamp(Math.round(num(st.n) ?? prev.n), 1, N_MAX),
            a: clamp(a, lo, hi),
            plot: st.plot === 'n' || st.plot === 'axis' ? st.plot : prev.plot,
            flat: isFlat(st.flat) ? st.flat : prev.flat,
            h: clamp(num(st.h) ?? prev.h, 0, H_MAX),
          };
        });
      }),
    [props.id],
  );

  // the numbers of the scene
  const pieces: Piece[] = cut(s.body, s.n);
  const sum = pieceSum(pieces, s.a);
  const exact = exactInertia(s.body, s.a);
  const X = centreOfMass(s.body);
  const d = Math.abs(s.a - X);
  const err = (sum - exact) / exact;
  const unit = isRod(s.body) ? 'ML²' : 'MR²';
  const perp = axisMoments(s.flat, s.h);
  const perpUnit = s.flat === 'plate' ? 'Ma²' : 'MR²';

  useEffect(() => {
    const h = setTimeout(() => {
      if (mode === 'sum') {
        setLive(
          `${BODY_NAME[s.body]} חתוך ל-${s.n} חתיכות. הציר במרחק ${fmt(d)} ${unitOf(s.body)} ממרכז המסה. סכום החתיכות ${fmt(sum)} ${unit}, והאינטגרל ${fmt(exact)} ${unit}.`,
        );
      } else {
        setLive(`${FLAT_NAME[s.flat]} בעובי ${fmt(s.h)} ${flatUnit(s.flat)}. מומנט ההתמד סביב x הוא ${fmt(perp.Ix)}, סביב y ${fmt(perp.Iy)}, סביב z ${fmt(perp.Iz)}, ביחידות ${perpUnit}.`);
      }
    }, 700);
    return () => clearTimeout(h);
  }, [s, mode]);

  /* ---------------------------------------------------------------- drawing: sum mode */

  const drawSum = (ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette) => {
    const yTop = yTopOf(s);
    const L = sumLayout(w, h, s, yTop);
    const { sx, sy, scale, narrow } = L;
    const fs = narrow ? 11 : 13;
    const shade = (i: number) => withAlpha(p.accent, i % 2 === 0 ? 0.22 : 0.42);
    const showDots = s.n <= 24;
    const dotR = (m: number, mMax: number) => (narrow ? 2 : 2.5) + (narrow ? 3 : 4) * Math.sqrt(m / mMax);
    const mMax = Math.max(...pieces.map((q) => q.m));

    if (isRod(s.body)) {
      const yc = sy(0);
      // the rod's half-thickness on screen: the uniform rod a fixed bar, the cone growing as x (its area as x²)
      const half = (x: number) => (s.body === 'rod' ? Math.max(5, 0.045 * scale) : Math.max(0.6, 0.13 * scale * x));
      pieces.forEach((q, i) => {
        ctx.save();
        ctx.fillStyle = shade(i);
        ctx.strokeStyle = withAlpha(p.ink2, 0.7);
        ctx.lineWidth = s.n > 60 ? 0 : 1;
        ctx.beginPath();
        ctx.moveTo(sx(q.lo), yc - half(q.lo));
        ctx.lineTo(sx(q.hi), yc - half(q.hi));
        ctx.lineTo(sx(q.hi), yc + half(q.hi));
        ctx.lineTo(sx(q.lo), yc + half(q.lo));
        ctx.closePath();
        ctx.fill();
        if (s.n <= 60) ctx.stroke();
        ctx.restore();
      });
      // the outline
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx(0), yc - half(0));
      ctx.lineTo(sx(1), yc - half(1));
      ctx.lineTo(sx(1), yc + half(1));
      ctx.lineTo(sx(0), yc + half(0));
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      if (showDots) {
        for (const q of pieces) {
          ctx.save();
          ctx.fillStyle = p.ink;
          ctx.beginPath();
          ctx.arc(sx(q.x), yc, dotR(q.m, mMax), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        // the distance of the last piece from the axis, below the rod
        const q = pieces[pieces.length - 1];
        const yr = yc + Math.max(half(1), 8) + 14;
        if (Math.abs(sx(q.x) - sx(s.a)) > 14) dimension(ctx, p, sx(s.a), sx(q.x), yr + 10, 'rᵢ', fs, p.ink2);
      }
      // end labels
      haloText(ctx, p, '0', sx(0), yc + Math.max(half(0), 6) + 30, { font: `${fs}px ${p.fontUi}`, color: p.ink2 });
      haloText(ctx, p, 'L', sx(1), yc + Math.max(half(1), 6) + 30, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink2 });
    } else if (s.body === 'ring' || s.body === 'disc') {
      const O = { x: sx(0), y: sy(0) };
      const R = scale;
      if (s.body === 'disc') {
        // rings of width R/n, outermost first
        for (let i = pieces.length - 1; i >= 0; i--) {
          const q = pieces[i];
          ctx.save();
          ctx.fillStyle = p.paper;
          ctx.beginPath();
          ctx.arc(O.x, O.y, q.hi * R, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = shade(i);
          ctx.fill();
          if (s.n <= 60) {
            ctx.strokeStyle = withAlpha(p.ink2, 0.6);
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          ctx.restore();
        }
        if (s.n <= 16) {
          // the radius at which each ring's mass is counted
          ctx.save();
          ctx.strokeStyle = withAlpha(p.ink, 0.75);
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          for (const q of pieces) {
            ctx.beginPath();
            ctx.arc(O.x, O.y, Math.sqrt(q.own) * R, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }
      } else {
        pieces.forEach((q, i) => {
          ctx.save();
          ctx.strokeStyle = i % 2 === 0 ? withAlpha(p.accent, 0.55) : withAlpha(p.accent, 0.95);
          ctx.lineWidth = narrow ? 6 : 8;
          ctx.lineCap = 'butt';
          ctx.beginPath();
          // world angles are counter-clockwise; the canvas y points down
          ctx.arc(O.x, O.y, R, -q.hi, -q.lo);
          ctx.stroke();
          ctx.restore();
        });
        if (showDots) {
          for (const q of pieces) {
            if (s.n <= 12) {
              ctx.save();
              ctx.strokeStyle = withAlpha(p.ink2, 0.7);
              ctx.setLineDash([4, 4]);
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(sx(s.a), sy(0));
              ctx.lineTo(sx(q.x), sy(q.y));
              ctx.stroke();
              ctx.restore();
            }
            ctx.save();
            ctx.fillStyle = p.ink;
            ctx.beginPath();
            ctx.arc(sx(q.x), sy(q.y), dotR(q.m, mMax), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(O.x, O.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // R, drawn up-left
      const ang = (3 * Math.PI) / 4;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(O.x, O.y);
      ctx.lineTo(O.x + R * Math.cos(ang), O.y - R * Math.sin(ang));
      ctx.stroke();
      ctx.restore();
      haloText(ctx, p, 'R', O.x + 0.5 * R * Math.cos(ang) - 8, O.y - 0.5 * R * Math.sin(ang) - 6, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink2 });
    } else {
      // the sphere, cut into slices perpendicular to the (vertical) axis
      const O = { x: sx(0), y: sy(0) };
      const R = scale;
      pieces.forEach((q, i) => {
        const r = Math.sqrt(2 * q.own); // own = ½ r²
        ctx.save();
        ctx.fillStyle = shade(i);
        ctx.strokeStyle = withAlpha(p.ink2, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(O.x - r * R, sy(q.hi), 2 * r * R, (q.hi - q.lo) * R);
        ctx.fill();
        if (s.n <= 60) ctx.stroke();
        ctx.restore();
      });
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(O.x, O.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // the axis: ⊙ (perpendicular to the page) for rods, ring and disc; a vertical line in the page for the sphere
    if (s.body === 'sphere') {
      const xa = sx(s.a);
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([10, 4, 2, 4]);
      ctx.beginPath();
      ctx.moveTo(xa, sy(1.25));
      ctx.lineTo(xa, sy(-1.25));
      ctx.stroke();
      ctx.restore();
    } else {
      depthGlyph(ctx, sx(s.a), sy(0), narrow ? 6 : 7, 'out', p.ink, { fill: p.paper, width: 1.8 });
    }
    // the centre of mass, and the distance d from it to the axis
    // on the axis, the glyph is drawn larger so the ⊙ inside it stays visible
    cmGlyph(ctx, p, sx(X), sy(0), d > 1e-9 ? (narrow ? 5 : 6) : narrow ? 9 : 10);
    if (s.body !== 'sphere' && d <= 1e-9) depthGlyph(ctx, sx(s.a), sy(0), narrow ? 5 : 6, 'out', p.ink, { fill: p.paper, width: 1.6 });
    const yd = isRod(s.body) ? sy(0) - Math.max(0.13 * scale, 8) - 18 : sy(-1.2);
    if (d > 0.03) dimension(ctx, p, sx(X), sx(s.a), yd, 'd', fs, p.ink);

    /* ---------------- the bars: the sum and the integral */
    {
      const B = L.bars;
      const labW = narrow ? 58 : 66;
      const numW = narrow ? 48 : 58;
      const x0 = B.x + 10 + labW;
      const wMax = B.w - labW - numW - 24;
      const vMax = 1.12 * Math.max(sum, exact);
      const rows: [string, number, string][] = [
        ['Σ mᵢrᵢ²', sum, p.accent],
        ['∫ r² dm', exact, p.ink2],
      ];
      rows.forEach(([lab, v, col], i) => {
        const yy = B.y + 8 + i * (B.h / 2 - 2);
        const bh = B.h / 2 - 12;
        haloText(ctx, p, lab, B.x + 10, yy + bh / 2, { font: `italic 600 ${fs}px ${p.fontUi}`, color: col, align: 'left' });
        ctx.save();
        ctx.fillStyle = withAlpha(col, i === 0 ? 0.8 : 0.45);
        ctx.fillRect(x0, yy, Math.max(1, (v / vMax) * wMax), bh);
        ctx.restore();
        haloText(ctx, p, fmt(v, 1e-12), x0 + Math.max(1, (v / vMax) * wMax) + 6, yy + bh / 2, { font: `${fs}px ${p.fontUi}`, color: p.ink, align: 'left' });
      });
    }

    /* ---------------- the plot */
    const { plot } = L;
    drawAxes(ctx, plot, p);
    const box = plot.box;
    const clip = () => {
      ctx.beginPath();
      ctx.rect(box.x, box.y - 2, box.w, box.h + 4);
      ctx.clip();
    };
    if (s.plot === 'n') {
      // the integral (dashed) and the sums for n = 1 … N_PLOT
      ctx.save();
      clip();
      ctx.strokeStyle = p.ink2;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(box.x, plot.py(exact));
      ctx.lineTo(box.x + box.w, plot.py(exact));
      ctx.stroke();
      ctx.restore();
      haloText(ctx, p, '∫ r² dm', box.x + box.w - 4, plot.py(exact) - 10, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });
      for (let k = 1; k <= N_PLOT; k++) {
        const v = pieceSum(cut(s.body, k), s.a);
        ctx.save();
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.arc(plot.px(k), plot.py(v), narrow ? 2.2 : 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const xn = s.n <= N_PLOT ? plot.px(s.n) : box.x + box.w;
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xn, plot.py(sum), 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (s.n > N_PLOT) haloText(ctx, p, `n = ${s.n}`, xn - 10, plot.py(sum) + 14, { font: `${fs}px ${p.fontUi}`, color: p.accent, align: 'right' });
    } else {
      // the parabola I(a) = I_cm + M d², lowest at the CM, and the n-piece sum against the axis position
      const [lo, hi] = aRange(s.body);
      ctx.save();
      clip();
      ctx.strokeStyle = withAlpha(p.accent, 0.7);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = lo + ((hi - lo) * i) / 120;
        const v = pieceSum(pieces, a);
        if (i === 0) ctx.moveTo(plot.px(a), plot.py(v));
        else ctx.lineTo(plot.px(a), plot.py(v));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = lo + ((hi - lo) * i) / 120;
        const v = exactInertia(s.body, a);
        if (i === 0) ctx.moveTo(plot.px(a), plot.py(v));
        else ctx.lineTo(plot.px(a), plot.py(v));
      }
      ctx.stroke();
      // the CM: a dashed vertical line and the vertex of the parabola
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(plot.px(X), box.y + box.h);
      ctx.lineTo(plot.px(X), box.y);
      ctx.stroke();
      ctx.restore();
      cmGlyph(ctx, p, plot.px(X), plot.py(exactInertia(s.body, X)), narrow ? 5 : 6);
      // the rod's ends
      if (isRod(s.body)) {
        ctx.save();
        ctx.strokeStyle = p.ink3;
        ctx.setLineDash([2, 4]);
        for (const e of [0, 1]) {
          ctx.beginPath();
          ctx.moveTo(plot.px(e), box.y + box.h);
          ctx.lineTo(plot.px(e), box.y);
          ctx.stroke();
        }
        ctx.restore();
      }
      // the axis now: the exact value (full dot) and the sum (ring)
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(plot.px(s.a), plot.py(exact), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(plot.px(s.a), clamp(plot.py(sum), box.y, box.y + box.h), 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  /* ---------------------------------------------------------------- drawing: perp mode */

  const drawPerp = (ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette) => {
    const L = perpLayout(w, h);
    const { narrow } = L;
    const fs = narrow ? 11 : 13;
    const E = s.flat === 'plate' ? 0.5 : 1; // half-size of the body in its own unit
    const colX = p.neg;
    const colY = p.ink2;
    const colZ = p.pos;

    // face view, from above: x right, y up, z out of the page
    {
      const F = L.face;
      const half = E * 1.42;
      const sc = Math.max(1, Math.min((F.w - 20) / (2 * half), (F.h - 40) / (2 * half)));
      const cx = F.x + F.w / 2;
      const cy = F.y + 10 + (F.h - 34) / 2;
      handNote(ctx, 'מלמעלה', cx, F.y + F.h - 12, p, narrow ? 13 : 15);
      ctx.save();
      ctx.fillStyle = withAlpha(p.accent, 0.25);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.5;
      if (s.flat === 'plate') {
        ctx.beginPath();
        ctx.rect(cx - E * sc, cy - E * sc, 2 * E * sc, 2 * E * sc);
        ctx.fill();
        ctx.stroke();
      } else if (s.flat === 'disc') {
        ctx.beginPath();
        ctx.arc(cx, cy, E * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.strokeStyle = withAlpha(p.accent, 0.9);
        ctx.lineWidth = narrow ? 5 : 7;
        ctx.beginPath();
        ctx.arc(cx, cy, E * sc, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      // the axes through the centre
      const ax = half * sc;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cx - ax, cy);
      ctx.lineTo(cx + ax - 8, cy);
      ctx.moveTo(cx, cy + ax);
      ctx.lineTo(cx, cy - ax + 8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = p.ink2;
      ctx.beginPath();
      ctx.moveTo(cx + ax, cy);
      ctx.lineTo(cx + ax - 9, cy - 4);
      ctx.lineTo(cx + ax - 9, cy + 4);
      ctx.closePath();
      ctx.moveTo(cx, cy - ax);
      ctx.lineTo(cx - 4, cy - ax + 9);
      ctx.lineTo(cx + 4, cy - ax + 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      haloText(ctx, p, 'x', cx + ax - 4, cy + 12, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink });
      haloText(ctx, p, 'y', cx + 11, cy - ax + 6, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink });
      depthGlyph(ctx, cx, cy, narrow ? 6 : 7, 'out', p.ink, { fill: p.paper, width: 1.6 });
      haloText(ctx, p, 'z', cx - 13, cy - 12, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink });
    }

    // side view: x right, z up
    {
      const S = L.side;
      const halfW = E * 1.3;
      const halfH = Math.max(H_MAX / 2, E) * 1.25;
      const sc = Math.max(1, Math.min((S.w - 24) / (2 * halfW), (S.h - 70) / (2 * halfH)));
      const cx = S.x + S.w / 2;
      const cy = S.y + 40 + (S.h - 64) / 2;
      handNote(ctx, 'מהצד', cx, S.y + S.h - 12, p, narrow ? 13 : 15);
      const hh = Math.max(1.5, (s.h / 2) * sc);
      ctx.save();
      ctx.fillStyle = withAlpha(p.accent, 0.3);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.5;
      if (s.flat === 'ring') {
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.rect(cx + sgn * E * sc - 3, cy - hh, 6, 2 * hh);
          ctx.fill();
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.rect(cx - E * sc, cy - hh, 2 * E * sc, 2 * hh);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      // the x and z axes
      const ax = halfW * sc;
      const az = halfH * sc;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cx - ax, cy);
      ctx.lineTo(cx + ax - 8, cy);
      ctx.moveTo(cx, cy + az);
      ctx.lineTo(cx, cy - az + 8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = p.ink2;
      ctx.beginPath();
      ctx.moveTo(cx + ax, cy);
      ctx.lineTo(cx + ax - 9, cy - 4);
      ctx.lineTo(cx + ax - 9, cy + 4);
      ctx.closePath();
      ctx.moveTo(cx, cy - az);
      ctx.lineTo(cx - 4, cy - az + 9);
      ctx.lineTo(cx + 4, cy - az + 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      haloText(ctx, p, 'x', cx + ax - 4, cy + 12, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink });
      haloText(ctx, p, 'z', cx + 11, cy - az + 6, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink });
      if (s.h > 0.08) {
        // the thickness h, beside the body
        const xh = cx - E * sc - 12;
        ctx.save();
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(xh, cy - hh);
        ctx.lineTo(xh, cy + hh);
        ctx.moveTo(xh - 4, cy - hh);
        ctx.lineTo(xh + 4, cy - hh);
        ctx.moveTo(xh - 4, cy + hh);
        ctx.lineTo(xh + 4, cy + hh);
        ctx.stroke();
        ctx.restore();
        haloText(ctx, p, 'h', xh - 9, cy - hh / 2 - 4, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink });
      }
    }

    // stacked bars: I_x, I_y, I_z, I_x + I_y, built from Σmx², Σmy², Σmz²
    {
      const B = L.bars;
      const m = secondMoments(s.flat, s.h);
      const vMax = 1.04 * axisMoments(s.flat, H_MAX).Ix * 2;
      const labW = narrow ? 64 : 76;
      const numW = narrow ? 44 : 54;
      const x0 = B.x + 10 + labW;
      const wMax = B.w - labW - numW - 24;
      const legendH = 22;
      const rowH = (B.h - legendH - 8) / 4;
      const seg = (v: number) => (v / vMax) * wMax;
      const rows: { main: string; sub: string; parts: [number, string][]; total: number }[] = [
        { main: 'I', sub: 'x', parts: [[m.yy, colY], [m.zz, colZ]], total: perp.Ix },
        { main: 'I', sub: 'y', parts: [[m.xx, colX], [m.zz, colZ]], total: perp.Iy },
        { main: 'I', sub: 'z', parts: [[m.xx, colX], [m.yy, colY]], total: perp.Iz },
        { main: 'I', sub: 'x', parts: [[m.yy, colY], [m.zz, colZ], [m.xx, colX], [m.zz, colZ]], total: perp.Ix + perp.Iy },
      ];
      rows.forEach((r, i) => {
        const yy = B.y + 4 + i * rowH;
        const bh = Math.max(8, rowH - 9);
        const ym = yy + bh / 2;
        if (i < 3) subLabel(ctx, p, r.main, r.sub, B.x + 10, ym, fs + 1, p.ink);
        else {
          const w1 = subLabel(ctx, p, 'I', 'x', B.x + 10, ym, fs + 1, p.ink);
          haloText(ctx, p, '+', B.x + 10 + w1 + 7, ym, { font: `600 ${fs}px ${p.fontUi}`, color: p.ink });
          subLabel(ctx, p, 'I', 'y', B.x + 10 + w1 + 14, ym, fs + 1, p.ink);
        }
        let x = x0;
        for (const [v, col] of r.parts) {
          const wv = seg(v);
          if (wv > 0.3) {
            ctx.save();
            ctx.fillStyle = withAlpha(col, 0.75);
            ctx.fillRect(x, yy, wv, bh);
            ctx.strokeStyle = p.paper;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, yy, wv, bh);
            ctx.restore();
          }
          x += wv;
        }
        haloText(ctx, p, fmt(r.total), x + 6, ym, { font: `${fs}px ${p.fontUi}`, color: p.ink, align: 'left' });
      });
      // where I_z ends, carried down to the last row: the excess beyond it is 2Σmz²
      const xz = x0 + seg(perp.Iz);
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xz, B.y + 4 + 2 * rowH);
      ctx.lineTo(xz, B.y + 4 + 3 * rowH + rowH - 6);
      ctx.stroke();
      ctx.restore();
      // the legend
      const ly = B.y + B.h - legendH / 2 - 2;
      const items: [string, string][] = [
        ['Σmx²', colX],
        ['Σmy²', colY],
        ['Σmz²', colZ],
      ];
      const step = Math.min(110, (B.w - 20) / 3);
      items.forEach(([lab, col], i) => {
        const lx = B.x + 10 + i * step;
        ctx.save();
        ctx.fillStyle = withAlpha(col, 0.75);
        ctx.fillRect(lx, ly - 6, 14, 12);
        ctx.restore();
        haloText(ctx, p, lab, lx + 20, ly, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink, align: 'left' });
      });
    }
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    if (mode === 'sum') drawSum(ctx, view.w, view.h, p);
    else drawPerp(ctx, view.w, view.h, p);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  // a taller stage on a narrow screen
  const [aspect, setAspect] = useState(mode === 'sum' ? 0.95 : 1.2);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const narrow = el.getBoundingClientRect().width < 520;
      setAspect(mode === 'sum' ? (narrow ? 0.6 : 0.95) : narrow ? 0.72 : 1.2);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [aspect]);

  /* ---------------------------------------------------------------- input (the only place tasks tick) */

  type How = 'n' | 'a' | 'body' | 'plot' | 'flat' | 'h';
  const checkTasks = (next: State, how: How) => {
    if (next.body === 'rod' && how === 'n' && next.n >= 50) done('rod-pieces');
    if (next.body === 'rod' && how === 'a' && (next.a === 0 || next.a === 1)) done('rod-end');
    if (next.body === 'disc' && how === 'n' && next.n >= 30) done('disc-rings');
    if (next.body === 'cone' && next.plot === 'axis' && next.a === centreOfMass('cone') && (how === 'a' || how === 'plot')) done('cone-min');
    if (next.body === 'sphere' && how === 'n' && next.n >= 30) done('sphere-slices');
    if (next.flat === 'disc' && next.h === 0 && (how === 'flat' || how === 'h')) done('disc-flat');
    if (how === 'h' && next.h >= 0.3) done('thick');
    if (next.flat === 'plate' && how === 'h' && next.h >= 0.995) done('cube');
  };

  const change = (patch: Partial<State>, how: How) => {
    const next: State = { ...s, ...patch };
    setS(next);
    checkTasks(next, how);
  };

  const setA = (a: number) => change({ a: snapA(s.body, a) }, 'a');
  const setN = (n: number) => change({ n: clamp(Math.round(n), 1, N_MAX) }, 'n');
  const setH = (h: number) => {
    const v = clamp(round3(h), 0, H_MAX);
    change({ h: Math.abs(v - 1) < 0.01 ? 1 : v }, 'h');
  };
  const setBody = (b: CutBody) => change({ body: b, a: aDefault(b) }, 'body');

  const pointerA = (e: PointerEvent): number | null => {
    const view = viewRef.current;
    if (!view || mode !== 'sum') return null;
    const L = sumLayout(view.w, view.h, s, yTopOf(s));
    const { box } = L.plot;
    if (s.plot === 'axis' && e.offsetX >= box.x - 6 && e.offsetX <= box.x + box.w + 6 && e.offsetY >= box.y - 6 && e.offsetY <= box.y + box.h + 6) {
      const [lo, hi] = aRange(s.body);
      return lo + ((e.offsetX - box.x) / box.w) * (hi - lo);
    }
    const g = L.geo;
    if (e.offsetY >= g.y && e.offsetY <= g.y + g.h) return (e.offsetX - L.sx(0)) / L.scale;
    return null;
  };
  const onPointerDown = (e: PointerEvent) => {
    const a = pointerA(e);
    if (a === null) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    setA(a);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const a = pointerA(e);
    if (a !== null) setA(a);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (mode === 'sum') {
      const step = isRod(s.body) ? 0.05 : 0.1;
      if (e.key === 'ArrowRight') setA(s.a + step);
      else if (e.key === 'ArrowLeft') setA(s.a - step);
      else if (e.key === 'ArrowUp' || e.key === '+') setN(s.n + 1);
      else if (e.key === 'ArrowDown' || e.key === '-') setN(s.n - 1);
      else return;
    } else {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setH(s.h + 0.05);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setH(s.h - 0.05);
      else return;
    }
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const [lo, hi] = aRange(s.body);
  const label =
    mode === 'sum'
      ? `איור חי: ${BODY_NAME[s.body]} חתוך ל-${s.n} חתיכות, וציר מקביל שהלומד גורר. במקלדת: חצים ימינה ושמאלה מזיזים את הציר, למעלה ולמטה משנים את מספר החתיכות.`
      : `איור חי: ${FLAT_NAME[s.flat]} במישור xy, מלמעלה ומהצד, ועמודות של מומנטי ההתמד סביב שלושת הצירים. במקלדת: החצים משנים את העובי.`;

  const readout =
    mode === 'sum' ? (
      <>
        <span>
          חתיכות{' '}
          <span class="q" data-readout="n">
            <b>{String(s.n)}</b>
          </span>
        </span>
        <span class="q" data-readout="d">
          d = <b>{`${fmt(d)} ${unitOf(s.body)}`}</b>
        </span>
        <span>
          סכום החתיכות{' '}
          <span class="q" data-readout="sum">
            Σ mᵢrᵢ² = <b>{`${fmt(sum)} ${unit}`}</b>
          </span>
        </span>
        <span>
          האינטגרל{' '}
          <span class="q" data-readout="exact">
            ∫ r² dm = <b>{`${fmt(exact)} ${unit}`}</b>
          </span>
        </span>
        <span>
          שגיאה{' '}
          <span class="q" data-readout="err">
            <b>{Math.abs(err) < 1e-10 ? '0%' : `${sci(Math.abs(err) * 100, 3)}%`}</b>
          </span>
        </span>
      </>
    ) : (
      <>
        <span class="q" data-readout="h">
          h = <b>{`${fmt(s.h)} ${flatUnit(s.flat)}`}</b>
        </span>
        <span class="q" data-readout="Ix">
          <i>I</i>
          <sub>x</sub> = <b>{`${fmt(perp.Ix)} ${perpUnit}`}</b>
        </span>
        <span class="q" data-readout="Iy">
          <i>I</i>
          <sub>y</sub> = <b>{`${fmt(perp.Iy)} ${perpUnit}`}</b>
        </span>
        <span class="q" data-readout="Iz">
          <i>I</i>
          <sub>z</sub> = <b>{`${fmt(perp.Iz)} ${perpUnit}`}</b>
        </span>
        <span class="q" data-readout="IxIy">
          <i>I</i>
          <sub>x</sub> + <i>I</i>
          <sub>y</sub> = <b>{`${fmt(perp.Ix + perp.Iy)} ${perpUnit}`}</b>
        </span>
      </>
    );

  const controls =
    mode === 'sum' ? (
      <>
        {offered.length > 1 && (
          <div class="group" role="group" aria-label="איזה גוף">
            {offered.map((b) => (
              <Toggle key={b} label={BODY_NAME[b]} on={s.body === b} onChange={() => setBody(b)} />
            ))}
          </div>
        )}
        <Slider label={s.body === 'disc' ? 'מספר הטבעות n' : s.body === 'sphere' ? 'מספר הפרוסות n' : 'מספר החתיכות n'} value={s.n} min={1} max={N_MAX} step={1} format={(x) => String(x)} onChange={setN} />
        <Slider label="מקום הציר" value={s.a} min={lo} max={hi} step={0.005} format={(x) => `${fmt(x)} ${unitOf(s.body)}`} onChange={setA} />
        <div class="group" role="group" aria-label="איזה גרף">
          <Toggle label="I מול n" on={s.plot === 'n'} onChange={() => change({ plot: 'n' }, 'plot')} />
          <Toggle label="I מול מקום הציר" on={s.plot === 'axis'} onChange={() => change({ plot: 'axis' }, 'plot')} />
        </div>
      </>
    ) : (
      <>
        {offeredFlat.length > 1 && (
          <div class="group" role="group" aria-label="איזה גוף">
            {offeredFlat.map((b) => (
              <Toggle key={b} label={FLAT_NAME[b]} on={s.flat === b} onChange={() => change({ flat: b }, 'flat')} />
            ))}
          </div>
        )}
        <Slider label="העובי h" value={s.h} min={0} max={H_MAX} step={0.01} format={(x) => `${fmt(x)} ${flatUnit(s.flat)}`} onChange={setH} />
      </>
    );

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
      cursor={mode === 'sum' ? 'ew-resize' : 'default'}
      onReset={() => {
        setS(initial());
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={readout}
      controls={controls}
    />
  );
}
