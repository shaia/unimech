/**
 * EnergyLandscape (lesson 3.3; planned for 5.2 and 6.3): one-dimensional motion read from the potential-energy
 * diagram. The curve U(x), a horizontal line at the mechanical energy E, the allowed region (U ≤ E) shaded
 * between the two, the turning points (U = E) marked on the x axis, and the equilibria (U′ = 0) marked stable
 * (a full dot) or unstable (an open ring). A particle, released at rest at a turning point, moves along x
 * under F = −dU/dx (RK4, src/physics/energy.ts): it is drawn on the E line, with its kinetic energy as the
 * vertical gap from the curve up to E, the force and the velocity as horizontal arrows, and live bars of
 * K, U and E on the diagram's own energy scale.
 *
 * With the drag on, a linear drag −b v (lesson 2.7) acts too: E(t) falls, the line follows it down, the
 * allowed region shrinks, and the bars show the energy the drag took, −W_nc, stacked on E up to the
 * initial E₀. The readouts give W_nc (integrated on its own) next to ΔE, and the drag's power P = F·v.
 *
 * The potential is an object (`Potential`, energy.ts), not a hard-coded formula: MDX passes a preset id
 * (`preset`, and `presets` for the chips); a later figure can import this component and pass `potential`.
 *
 * The learner sets E by dragging the line (or the slider) and the release point by dragging the particle
 * along the curve (E = U(x₀)). Tasks tick only in the learner's handlers (the release button, the time
 * slider); a text step sets the state and the instant shown but never releases.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  PRESETS,
  allowedIntervals,
  equilibria,
  sampleAt,
  simulate,
  turningPoints,
  type Motion,
  type Potential,
  type PresetId,
} from '~/physics/energy';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import { drawAxes, drawCurve, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const DT = 0.004;

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  release: 'שחררו את החלקיק פעם אחת, בכפתור "שחררו".',
  trapped: `בבור הכפול: שחררו את החלקיק באנרגיה מכנית נמוכה מראש הגבעה, ${ltr('E < 2 J')}. לאן הוא מגיע?`,
  'over-hump': `בבור הכפול: שחררו אותו באנרגיה גבוהה מראש הגבעה, ${ltr('E > 2 J')}. לאן הוא מגיע עכשיו?`,
  'turning-force': 'הזיזו את פס הזמן לרגע שבו החלקיק עוצר. מה גודל הכוח עליו ברגע הזה?',
  escape: `בבור דמוי המולקולה: שחררו את החלקיק באנרגיה מכנית חיובית, ${ltr('E > 0')}.`,
  'drag-release': 'עם הגרר: שחררו את החלקיק, והסתכלו על הקו של E.',
  wnc: `עם הגרר: הזיזו את פס הזמן עד הסוף, והשוו את העבודה של הגרר לשינוי באנרגיה המכנית, ${ltr('ΔE')}.`,
  'no-cross': 'עם הגרר: מצאו מקדם גרר שבו החלקיק לא עובר את הגבעה, אף שהוא מתחיל באנרגיה גבוהה ממנה.',
  'other-well': 'עם הגרר: מצאו מקדם גרר שבו החלקיק נעצר בסוף בבור השני, לא בבור שבו התחיל.',
};

export interface EnergyLandscapeProps {
  id: string;
  /** the potential shown first, and the chips offered (MDX passes ids) */
  preset?: PresetId;
  presets?: PresetId[];
  /** a potential object, for a figure that imports this component (not serialisable from MDX) */
  potential?: Potential;
  /** the mechanical energy [J] and the side the particle is released on (the turning point nearest xs) [m] */
  E?: number;
  xs?: number;
  /** linear drag: on at the start, offered as a toggle, coefficient [kg/s] and its slider limits */
  drag?: boolean;
  dragToggle?: boolean;
  b?: number;
  bMin?: number;
  bMax?: number;
  /** how long a release runs [s] */
  tEnd?: number;
  /** what is drawn at the start */
  arrows?: boolean;
  marks?: boolean;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

interface Setup {
  preset: PresetId | 'custom';
  E: number;
  xs: number;
  drag: boolean;
  b: number;
}

interface Run {
  n: number;
  setup: Setup;
  motion: Motion;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
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

/** A symbol with a true subscript, its left edge at x, with a paper halo; returns its width. */
function subText(ctx: CanvasRenderingContext2D, p: Palette, base: string, sub: string, x: number, y: number, size: number, color: string, align: 'left' | 'center' | 'right' = 'left'): number {
  const fBase = `italic 600 ${size}px ${p.fontUi}`;
  const fSub = `italic 600 ${Math.round(size * 0.72)}px ${p.fontUi}`;
  ctx.save();
  ctx.font = fBase;
  const wb = ctx.measureText(base).width;
  ctx.font = fSub;
  const ws = ctx.measureText(sub).width;
  ctx.restore();
  const w = wb + ws + 1;
  const x0 = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
  haloText(ctx, p, base, x0, y, { font: fBase, color, align: 'left' });
  haloText(ctx, p, sub, x0 + wb + 1, y + size * 0.3, { font: fSub, color, align: 'left' });
  return w;
}

/** The lowest value of U on the domain (a fine scan). */
function minU(p: Potential): number {
  const [a, b] = p.domain;
  let m = Infinity;
  for (let i = 0; i <= 2000; i++) m = Math.min(m, p.U(a + ((b - a) * i) / 2000));
  return m;
}

/** The turning point of E nearest the side anchor xs: where a particle at rest with energy E is released. */
function releasePoint(p: Potential, E: number, xs: number): number {
  const tp = turningPoints(p, E, 1500);
  if (!tp.length) return xs;
  return tp.reduce((best, x) => (Math.abs(x - xs) < Math.abs(best - xs) ? x : best), tp[0]);
}

/** The x where a hump between two wells sits (an unstable equilibrium), if any. */
const humpOf = (p: Potential) => equilibria(p, 1500).find((e) => e.kind === 'unstable') ?? null;

export default function EnergyLandscape(props: EnergyLandscapeProps) {
  const B_MIN = props.bMin ?? 0.05;
  const B_MAX = props.bMax ?? 1;
  const offered: PresetId[] = props.presets ?? (props.preset ? [props.preset] : ['double']);

  const potentialOf = (s: Setup): Potential => (s.preset === 'custom' && props.potential ? props.potential : PRESETS[s.preset as PresetId] ?? PRESETS.double);
  const limitsOf = (p: Potential) => {
    const lo = minU(p);
    return { lo: lo + 0.01 * (p.uRange[1] - p.uRange[0]), hi: p.uRange[1] - 0.08 * (p.uRange[1] - p.uRange[0]) };
  };

  const initialSetup = (): Setup => {
    const preset: Setup['preset'] = props.potential ? 'custom' : (props.preset ?? offered[0]);
    const s: Setup = { preset, E: 0, xs: 0, drag: props.drag ?? false, b: clamp(props.b ?? 0.1, B_MIN, B_MAX) };
    const p = potentialOf(s);
    const lim = limitsOf(p);
    s.xs = props.xs ?? p.domain[1];
    s.E = clamp(props.E ?? p.U(clamp(0.75 * p.domain[1] + 0.25 * p.domain[0], p.domain[0], p.domain[1])), lim.lo, lim.hi);
    return s;
  };

  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [show, setShow] = useState({ arrows: props.arrows ?? true, marks: props.marks ?? true });
  /** the instant shown when nothing is moving [s] */
  const [time, setTime] = useState(0);
  const [flying, setFlying] = useState<Run | null>(null);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  const count = useRef(0);
  const landed = useRef(0);
  const grabbing = useRef<'particle' | 'energy' | null>(null);

  const pot = potentialOf(setup);
  const lim = limitsOf(pot);
  const tEnd = props.tEnd ?? (setup.drag ? 30 : 12);
  const x0 = releasePoint(pot, setup.E, setup.xs);
  const b = setup.drag ? setup.b : 0;
  const motion = useMemo(() => simulate(pot, { x0, b, dt: DT, tEnd }), [setup.preset, setup.E, x0, b, tEnd]);
  const runEnd = motion.samples[motion.samples.length - 1].t;
  const vMax = useMemo(() => Math.max(1e-9, ...motion.samples.map((s) => Math.abs(s.v))), [motion]);
  const hump = useMemo(() => humpOf(pot), [setup.preset]);
  const eqs = useMemo(() => equilibria(pot, 1500), [setup.preset]);

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the potential, the energy, the side, the drag and the instant shown; they never release
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setFlying(null);
        setSetup((prev) => {
          const preset = typeof st.preset === 'string' && st.preset in PRESETS ? (st.preset as PresetId) : prev.preset;
          const p = potentialOf({ ...prev, preset });
          const l = limitsOf(p);
          return {
            preset,
            E: clamp(num(st.E) ?? prev.E, l.lo, l.hi),
            xs: num(st.xs) ?? (preset !== prev.preset ? p.domain[1] : prev.xs),
            drag: bool(st.drag) ?? prev.drag,
            b: clamp(num(st.b) ?? prev.b, B_MIN, B_MAX),
          };
        });
        setShow((prev) => ({ arrows: bool(st.arrows) ?? prev.arrows, marks: bool(st.marks) ?? prev.marks }));
        setTime(Math.max(0, num(st.t) ?? 0));
      }),
    [props.id],
  );

  const describe = (r: Run) => {
    const s = r.motion.samples;
    const end = s[s.length - 1];
    if (r.motion.escapedAt !== null) return `החלקיק שוחרר באנרגיה ${sci(r.setup.E)} ג'אול ויצא מהאיור: אין לו נקודת מפנה מימין.`;
    const xs = s.map((q) => q.x);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    if (r.setup.drag) return `החלקיק שוחרר עם גרר. האנרגיה המכנית ירדה מ-${sci(s[0].E)} ל-${sci(end.E)} ג'אול, והוא נעצר ליד x שווה ${sci(end.x)} מטר.`;
    return `החלקיק שוחרר באנרגיה ${sci(r.setup.E)} ג'אול ונע הלוך ושוב בין x שווה ${sci(lo)} ל-${sci(hi)} מטר.`;
  };

  const land = (r: Run) => {
    if (landed.current === r.n) return;
    landed.current = r.n;
    setFlying(null);
    setTime(r.motion.samples[r.motion.samples.length - 1].t);
    setLive(describe(r));
  };

  const fire = () => {
    const n = ++count.current;
    t0.current = null;
    const r: Run = { n, setup: { ...setup }, motion };
    done('release');
    const s = motion.samples;
    if (setup.preset === 'double' && hump) {
      if (!setup.drag && setup.E < hump.U) done('trapped');
      if (!setup.drag && setup.E > hump.U) done('over-hump');
    }
    if (setup.preset === 'morse' && !setup.drag && setup.E > 0) done('escape');
    if (setup.drag) {
      done('drag-release');
      if (hump) {
        const side = Math.sign(s[0].x - hump.x);
        const crossed = s.some((q) => Math.sign(q.x - hump.x) === -side);
        const end = s[s.length - 1];
        if (setup.E > hump.U && !crossed) done('no-cross');
        if (crossed && Math.sign(end.x - hump.x) === -side) done('other-well');
      }
    }
    if (!motionAllowed()) {
      land(r);
      return;
    }
    setFlying(r);
    setLive('החלקיק נע.');
  };

  /* ---------------------------------------------------------------- drawing */

  const plotOf = (view: { w: number; h: number }): { plot: Plot; barsX: number; barsW: number; narrow: boolean } => {
    const narrow = view.w < 520;
    const barsW = Math.round(view.w * (narrow ? 0.25 : 0.19));
    const box = insetBox({ x: 0, y: 0, w: view.w - barsW, h: view.h }, { l: narrow ? 46 : 54, r: 10, t: 34, b: 44 });
    const plot = makePlot(
      box,
      { min: pot.domain[0], max: pot.domain[1], label: 'המקום x (m)', format: (x) => sci(x, 2) },
      { min: pot.uRange[0], max: pot.uRange[1], label: 'אנרגיה (J)', format: (x) => sci(x, 2) },
    );
    return { plot, barsX: view.w - barsW, barsW, narrow };
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const { plot, barsX, barsW, narrow } = plotOf(view);
    const { box } = plot;
    const fs = narrow ? 11 : 12;

    // the instant shown
    let m = motion;
    let now = clamp(time, 0, runEnd);
    if (flying) {
      if (t0.current === null) t0.current = t;
      m = flying.motion;
      const end = m.samples[m.samples.length - 1].t;
      const rate = Math.max(1, end / 15); // a release plays in at most 15 seconds
      now = Math.min((t - t0.current) * rate, end);
      if (now >= end) land(flying);
    }
    const st = sampleAt(m, now);
    const E0 = m.samples[0].E;
    const Enow = st.E;

    drawAxes(ctx, plot, p);
    const clipPlot = () => {
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
    };

    // U = 0, when it is inside the range
    if (pot.uRange[0] < 0 && pot.uRange[1] > 0) {
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(box.x, plot.py(0));
      ctx.lineTo(box.x + box.w, plot.py(0));
      ctx.stroke();
      ctx.restore();
    }

    // the allowed region: between U(x) and the E line where U ≤ E (the gap is the kinetic energy)
    const ivs = allowedIntervals(pot, Enow, 1500);
    ctx.save();
    clipPlot();
    ctx.fillStyle = withAlpha(p.energyK, 0.16);
    for (const iv of ivs) {
      const n = 120;
      ctx.beginPath();
      ctx.moveTo(plot.px(iv.lo), plot.py(Enow));
      for (let i = 0; i <= n; i++) {
        const x = iv.lo + ((iv.hi - iv.lo) * i) / n;
        ctx.lineTo(plot.px(x), plot.py(Math.min(pot.U(x), Enow)));
      }
      ctx.lineTo(plot.px(iv.hi), plot.py(Enow));
      ctx.closePath();
      ctx.fill();
    }
    // the allowed region along the x axis, as a band
    ctx.fillStyle = withAlpha(p.energyK, 0.55);
    for (const iv of ivs) ctx.fillRect(plot.px(iv.lo), box.y + box.h - 5, plot.px(iv.hi) - plot.px(iv.lo), 5);
    ctx.restore();

    // the curve U(x)
    drawCurve(ctx, plot, pot.U, { color: p.energyP, width: 2.6, samples: 400 });
    {
      // its label at the upper left, beside the curve
      const xs = pot.domain[0] + 0.06 * (pot.domain[1] - pot.domain[0]);
      const yU = clamp(plot.py(pot.U(xs)), box.y + 12, box.y + box.h - 12);
      haloText(ctx, p, 'U(x)', plot.px(xs) + 10, yU, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.energyP, align: 'left' });
    }

    // the initial energy (with drag), dashed
    if (m.samples.length && Math.abs(E0 - Enow) > 1e-3 * (pot.uRange[1] - pot.uRange[0])) {
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(box.x, plot.py(E0));
      ctx.lineTo(box.x + box.w, plot.py(E0));
      ctx.stroke();
      ctx.restore();
      subText(ctx, p, 'E', '0', box.x + box.w - 4, plot.py(E0) - 9, fs + 1, p.ink2, 'right');
    }

    // the E line, solid, at the mechanical energy now
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(box.x, plot.py(Enow));
    ctx.lineTo(box.x + box.w, plot.py(Enow));
    ctx.stroke();
    ctx.restore();
    // its label at the right end, above the line (below it when the dashed E₀ is just above)
    {
      const yE = plot.py(Enow);
      const crowded = Math.abs(plot.py(E0) - yE) > 1 && Math.abs(plot.py(E0) - yE) < 22;
      haloText(ctx, p, 'E', box.x + box.w - 6, crowded ? yE + 11 : yE - 10, { font: `italic 700 ${fs + 3}px ${p.fontUi}`, color: p.ink, align: 'right' });
    }

    // the stretch of x the particle has covered, on its energy (a zigzag down when E falls)
    {
      const s = m.samples;
      const iEnd = Math.min(s.length - 1, Math.round(now / DT));
      const stride = Math.max(1, Math.floor(iEnd / 700));
      ctx.save();
      clipPlot();
      ctx.strokeStyle = withAlpha(p.accent, 0.55);
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= iEnd; i += stride) {
        const X = plot.px(s[i].x);
        const Y = plot.py(s[i].E);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.lineTo(plot.px(st.x), plot.py(st.E));
      ctx.stroke();
      ctx.restore();
    }

    // turning points: dashed down to the x axis, named x₁, x₂, … from the left
    const tps = turningPoints(pot, Enow, 1500);
    const subs = ['₁', '₂', '₃', '₄', '₅', '₆'];
    tps.forEach((x, i) => {
      const X = plot.px(x);
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X, plot.py(Enow));
      ctx.lineTo(X, box.y + box.h);
      ctx.stroke();
      ctx.restore();
      // the name above the E line, just beside the dashed line, on the side away from the allowed region
      const inside = ivs.find((iv) => Math.abs(iv.lo - x) < 1e-9);
      // outside the allowed stretch, clear of the particle's dot when it sits on this turning point
      const dx = inside ? -9 : 9;
      haloText(ctx, p, `x${subs[i] ?? ''}`, X + dx, plot.py(Enow) - 10, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: inside ? 'right' : 'left' });
    });

    // equilibria: a full dot (stable) or an open ring (unstable) on the curve, named under it
    if (show.marks) {
      for (const e of eqs) {
        const X = plot.px(e.x);
        const Y = plot.py(e.U);
        if (Y < box.y || Y > box.y + box.h) continue;
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.ink;
        ctx.fillStyle = e.kind === 'stable' ? p.ink : p.paper;
        ctx.beginPath();
        ctx.arc(X, Y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        const label = e.kind === 'stable' ? 'יציב' : e.kind === 'unstable' ? 'לא יציב' : 'אדיש';
        // on the side away from the curve: under a minimum, over a maximum (under a hump the curve's flanks run
        // through the label on a narrow plot), and over the E line rather than across it
        const below = Y + 18 <= box.y + box.h - 8;
        let ly = below ? Y + 17 : Y - 16;
        if (e.kind === 'unstable' && Y - 24 >= box.y) {
          ly = Y - 16;
          const yE = plot.py(Enow);
          if (Math.abs(yE - ly) < 11 && yE - 13 >= box.y + 6) ly = yE - 13;
        }
        handNote(ctx, label, X, ly, p, narrow ? 12 : 14);
      }
    }

    // the particle on the E line, its kinetic energy as the gap from U(x) up to E, and the force and velocity
    {
      const X = plot.px(st.x);
      const Y = plot.py(st.E);
      const inPlot = X >= box.x - 1 && X <= box.x + box.w + 1;
      if (inPlot) {
        ctx.save();
        ctx.strokeStyle = p.energyK;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(X, clamp(plot.py(st.U), box.y, box.y + box.h));
        ctx.lineTo(X, Y);
        ctx.stroke();
        ctx.restore();
        if (show.arrows) {
          // the force of the potential, −dU/dx (the drag, when on, is in the power readout)
          const F = -pot.dU(st.x);
          // one scale per run: the largest force (speed) over the motion takes 16 % (14 %) of the plot's width
          const Fmax = Math.max(1e-9, ...sampleForces(m, pot));
          const vTop = Math.max(1e-9, ...m.samples.filter((_, i) => i % 50 === 0).map((q) => Math.abs(q.v)));
          const kF = (0.16 * box.w) / Fmax;
          const kv = (0.14 * box.w) / vTop;
          // an arrow below 1 % of the run's largest value is not drawn (a turning point has no velocity arrow);
          // any other gets at least 16 px, so it never shrinks to a stub
          const minLen = 16;
          const lenOf = (x: number, k: number, top: number) => (Math.abs(x) < 0.01 * top ? 0 : Math.sign(x) * Math.max(minLen, Math.abs(k * x)));
          const LF = lenOf(F, kF, Fmax);
          const Lv = lenOf(st.v, kv, vTop);
          if (LF !== 0) {
            arrow(ctx, X, Y, X + LF, Y, { color: p.force, width: 2.6, head: 9 });
            haloText(ctx, p, 'F', X + LF + Math.sign(LF) * 9, Y, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.force });
          }
          if (Lv !== 0) {
            arrow(ctx, X, Y - 10, X + Lv, Y - 10, { color: p.velocity, width: 2.2, head: 8 });
            haloText(ctx, p, 'v', X + Lv + Math.sign(Lv) * 8, Y - 12, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.velocity });
          }
        }
        ctx.save();
        ctx.fillStyle = p.accent;
        ctx.strokeStyle = p.paper;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(X, Y, narrow ? 6 : 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      if (m.escapedAt !== null && now >= m.escapedAt - 1e-9) {
        // The note in Hebrew, and the arrow drawn on the canvas toward the side the particle left by: an arrow glyph
        // inside an RTL string lands on the wrong end of it.
        const toRight = st.x >= 0.5 * (pot.domain[0] + pot.domain[1]);
        const note = 'יצא לאינסוף';
        const size = narrow ? 12 : 14;
        ctx.save();
        ctx.font = `500 ${size}px ${p.fontHand}`;
        const half = 0.5 * ctx.measureText(note).width;
        ctx.restore();
        const nx = toRight ? box.x + box.w - half - 30 : box.x + half + 30;
        // under the E line, lowered until it clears U(x) and the U = 0 axis across the note and its arrow (with a
        // small E > 0 the curve's tail and the axis sit right under the E line)
        const xOf = (X: number) => plot.x.min + ((X - box.x) / box.w) * (plot.x.max - plot.x.min);
        const lines: number[] = [plot.py(0)];
        for (let X = nx - half - 26; X <= nx + half + 26; X += 4) lines.push(plot.py(pot.U(xOf(X))));
        const clear = (y: number) => lines.every((yl) => Math.abs(yl - y) >= 0.75 * size + 2);
        let ny = plot.py(st.E) + 22;
        for (let y = ny; y <= box.y + box.h - size; y += 3)
          if (clear(y)) {
            ny = y;
            break;
          }
        handNote(ctx, note, nx, ny, p, size);
        const d = toRight ? 1 : -1;
        arrow(ctx, nx + d * (half + 4), ny, nx + d * (half + 24), ny, { color: p.hand, width: 1.8, head: 7 });
      }
    }

    /* ---------------- the bars: K, U and E on the diagram's own energy scale */
    {
      const cols = 3;
      const gap = narrow ? 6 : 10;
      const bw = Math.max(12, Math.min(26, (barsW - gap * (cols + 1)) / cols));
      const x0b = barsX + (barsW - (cols * bw + (cols - 1) * gap)) / 2;
      const zero = clamp(plot.py(0), box.y, box.y + box.h);
      // the zero line of the bars and the E line carried across
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(barsX + 2, zero);
      ctx.lineTo(view.w - 2, zero);
      ctx.stroke();
      ctx.restore();
      const bar = (i: number, from: number, to: number, color: string, alpha = 1) => {
        const X = x0b + i * (bw + gap);
        const y1 = clamp(plot.py(from), box.y, box.y + box.h);
        const y2 = clamp(plot.py(to), box.y, box.y + box.h);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(X, Math.min(y1, y2), bw, Math.abs(y2 - y1));
        ctx.restore();
      };
      bar(0, 0, st.K, p.energyK);
      bar(1, 0, st.U, p.energyP);
      bar(2, 0, st.E, p.ink2, 0.85);
      const lost = E0 - st.E;
      if (lost > 1e-3 * (pot.uRange[1] - pot.uRange[0])) {
        bar(2, st.E, E0, p.energyTh, 0.9);
        const yMid = (plot.py(st.E) + plot.py(E0)) / 2;
        if (Math.abs(plot.py(st.E) - plot.py(E0)) > 18) {
          const X = x0b + 2 * (bw + gap) + bw / 2;
          haloText(ctx, p, '−W', X - 4, yMid, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.energyTh, align: 'center' });
        }
      }
      const yl = box.y + box.h + 14;
      ['K', 'U', 'E'].forEach((s, i) => {
        const X = x0b + i * (bw + gap) + bw / 2;
        haloText(ctx, p, s, X, yl, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: [p.energyK, p.energyP, p.ink][i] });
      });
    }
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1, animate: flying !== null });
  useEffect(invalidate, [setup, show, time, flying, motion]);

  // the stage is taller on a narrow screen
  const [aspect, setAspect] = useState(1.6);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 520 ? 1.0 : 1.6));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [aspect]);

  /* ---------------------------------------------------------------- input */

  const change = (f: (s: Setup) => Setup) => {
    setFlying(null);
    setTime(0);
    setSetup((s) => f(s));
  };
  const setE = (E: number) => change((s) => ({ ...s, E: clamp(roundTo(E, 0.01), lim.lo, lim.hi) }));
  const setRelease = (x: number) =>
    change((s) => {
      const xx = clamp(x, pot.domain[0] + 0.01 * (pot.domain[1] - pot.domain[0]), pot.domain[1] - 0.01 * (pot.domain[1] - pot.domain[0]));
      return { ...s, xs: xx, E: clamp(pot.U(xx), lim.lo, lim.hi) };
    });
  const setPreset = (preset: PresetId) =>
    change((s) => {
      const p = PRESETS[preset];
      const l = limitsOf(p);
      return { ...s, preset, xs: p.domain[1], E: clamp(p.U(0.75 * p.domain[1] + 0.25 * p.domain[0]), l.lo, l.hi) };
    });
  const scrub = (tt: number) => {
    setFlying(null);
    const t = clamp(tt, 0, runEnd);
    setTime(t);
    const s = sampleAt(motion, t);
    if (show.arrows && t > 0 && Math.abs(s.v) < 0.03 * vMax && Math.abs(pot.dU(s.x)) > 1e-3) done('turning-force');
    if (setup.drag && t >= 0.9 * runEnd) done('wnc');
  };

  const pointerData = (e: PointerEvent) => {
    const view = viewRef.current;
    if (!view) return null;
    const { plot } = plotOf(view);
    const { box } = plot;
    const fx = (e.offsetX - box.x) / box.w;
    const fy = (box.y + box.h - e.offsetY) / box.h;
    return {
      x: pot.domain[0] + fx * (pot.domain[1] - pot.domain[0]),
      U: pot.uRange[0] + fy * (pot.uRange[1] - pot.uRange[0]),
      px: e.offsetX,
      py: e.offsetY,
      plot,
    };
  };
  const onPointerDown = (e: PointerEvent) => {
    const d = pointerData(e);
    if (!d) return;
    const { box } = d.plot;
    if (d.px < box.x - 10 || d.px > box.x + box.w + 10 || d.py < box.y - 14 || d.py > box.y + box.h + 6) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const st = sampleAt(motion, flying ? 0 : clamp(time, 0, runEnd));
    const near = Math.hypot(d.px - d.plot.px(st.x), d.py - d.plot.py(st.E)) < 22;
    grabbing.current = near && !setup.drag ? 'particle' : 'energy';
    if (grabbing.current === 'particle') setRelease(d.x);
    else setE(d.U);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!grabbing.current) return;
    const d = pointerData(e);
    if (!d) return;
    if (grabbing.current === 'particle') setRelease(d.x);
    else setE(d.U);
  };
  const onPointerUp = () => {
    grabbing.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = 0.05 * (pot.uRange[1] - pot.uRange[0]);
    if (e.key === 'Enter' || e.key === ' ') fire();
    else if (e.key === 'ArrowUp') setE(setup.E + step);
    else if (e.key === 'ArrowDown') setE(setup.E - step);
    else return;
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const shown = clamp(time, 0, runEnd);
  const s = sampleAt(motion, shown);
  const F = -pot.dU(s.x);
  const E0 = motion.samples[0].E;
  const tinyE = 1e-6 * (pot.uRange[1] - pot.uRange[0]);
  const label = `איור חי: דיאגרמת אנרגיה, ${pot.label}. האנרגיה המכנית ${sci(setup.E)} ג'אול, והחלקיק משוחרר ממנוחה ב-x שווה ${sci(x0)} מטר${
    setup.drag ? `, עם גרר ליניארי שמקדמו ${sci(setup.b)} קילוגרם לשנייה` : ''
  }. במקלדת: חץ למעלה ולמטה משנה את האנרגיה, Enter משחרר.`;

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
      cursor="grab"
      onReset={() => {
        setSetup(initialSetup());
        setShow({ arrows: props.arrows ?? true, marks: props.marks ?? true });
        setFlying(null);
        setTime(0);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        flying ? (
          <span>החלקיק נע…</span>
        ) : (
          <>
            <span class="q" data-readout="t">
              t = <b>{signed(shown)} s</b>
            </span>
            <span class="q" data-readout="x">
              x = <b>{signed(s.x, 1e-9)} m</b>
            </span>
            <span class="q" data-readout="v">
              v = <b>{signed(s.v, 1e-6 * vMax)} m/s</b>
            </span>
            <span class="q" data-readout="K">
              K = <b>{signed(s.K, tinyE)} J</b>
            </span>
            <span class="q" data-readout="U">
              U = <b>{signed(s.U, tinyE)} J</b>
            </span>
            <span class="q" data-readout="E">
              E = K + U = <b>{signed(s.E, tinyE)} J</b>
            </span>
            <span class="q" data-readout="F">
              F = −dU/dx = <b>{signed(F, 1e-9)} N</b>
            </span>
            {setup.drag && (
              <>
                <span class="q" data-readout="wnc">
                  W<sub>nc</sub> = <b>{signed(s.Wnc, tinyE)} J</b>
                </span>
                <span class="q" data-readout="dE">
                  ΔE = E − E<sub>0</sub> = <b>{signed(s.E - E0, tinyE)} J</b>
                </span>
                <span class="q" data-readout="P">
                  P = F<sub>d</sub>v = <b>{signed(s.P, 1e-9)} W</b>
                </span>
              </>
            )}
          </>
        )
      }
      controls={
        <>
          {offered.length > 1 && !props.potential && (
            <div class="group" role="group" aria-label="איזה פוטנציאל">
              {offered.map((id) => (
                <Toggle key={id} label={PRESETS[id].label} on={setup.preset === id} onChange={() => setPreset(id)} />
              ))}
            </div>
          )}
          <Slider label="האנרגיה המכנית E" value={setup.E} min={roundTo(lim.lo, 0.01)} max={roundTo(lim.hi, 0.01)} step={0.01} format={(x) => `${signed(x)} J`} onChange={setE} />
          <Slider
            label="מקום השחרור"
            value={Number(x0.toPrecision(3))}
            min={pot.domain[0]}
            max={pot.domain[1]}
            step={0.01}
            format={(x) => `${signed(x)} m`}
            onChange={setRelease}
          />
          {(props.dragToggle || setup.drag) && setup.drag && (
            <Slider label="מקדם הגרר b" value={setup.b} min={B_MIN} max={B_MAX} step={0.05} format={(x) => `${sci(x)} kg/s`} onChange={(v) => change((st) => ({ ...st, b: clamp(roundTo(v, 0.05), B_MIN, B_MAX) }))} />
          )}
          <Slider label="זמן" value={Number(shown.toPrecision(3))} min={0} max={Number(runEnd.toPrecision(3))} step={0.01} format={(x) => `${sci(x)} s`} onChange={scrub} />
          <div class="group" role="group" aria-label="שחרור">
            <button type="button" class="btn primary" onClick={fire}>
              שחררו
            </button>
          </div>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="כוח ומהירות" on={show.arrows} swatch="var(--force)" onChange={(on) => setShow((x) => ({ ...x, arrows: on }))} />
            <Toggle label="שיווי משקל" on={show.marks} onChange={(on) => setShow((x) => ({ ...x, marks: on }))} />
            {props.dragToggle && <Toggle label="גרר" on={setup.drag} swatch="var(--energy-th)" onChange={(on) => change((st) => ({ ...st, drag: on }))} />}
          </div>
        </>
      }
    />
  );
}

/** A few force magnitudes along the run (every 50th sample), for one arrow scale per run. */
function sampleForces(m: Motion, p: Potential): number[] {
  const out: number[] = [];
  for (let i = 0; i < m.samples.length; i += 50) out.push(Math.abs(p.dU(m.samples[i].x)));
  return out;
}
