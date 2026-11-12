/**
 * EffectivePotential (lesson 6.3): the orbit of a body around the Sun read from its effective potential, side by
 * side with the orbit itself. On the left (on top, on a narrow screen) the graph of u_eff(r) = h²/(2r²) + u(r)
 * per unit mass, with its two parts dashed (the angular kinetic energy h²/(2r²) and the potential energy u(r)),
 * a horizontal line at the energy per unit mass ε that the learner drags, the region where u_eff ≤ ε shaded, the
 * turning points r_p, r_a marked and the minimum (the circular orbit) dotted. On the right, the plane of the
 * motion: the Sun at the centre, the ring r_p ≤ r ≤ r_a the same turning points allow, and the orbit those (h, ε)
 * imply, integrated by src/physics/centralforce.ts: a circle at the minimum, an ellipse (or, for a force other
 * than 1/r², a rosette) between the turning points, a path that leaves for good at ε ≥ 0. The body moves on both
 * panels at once: on the graph it rides the ε line at its r(t), with ½ṙ² as the gap down to the curve.
 *
 * Presets: 'gravity' u = −GM/r (the Sun), 'free' u = 0 (no force: a straight line, and the h²/(2r²) term is
 * still there), 'yukawa' u = −(GM/r)e^(−r/λ), λ = 3 AU (an attraction that weakens faster than 1/r²).
 *
 * Tasks tick only inside the learner's own handlers (the release button, the time slider); a text step sets the
 * state and the instant shown and never releases, so scrolling through the text completes nothing.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AU, G_NEWTON, M_SUN, YEAR } from '~/physics/constants';
import {
  circularOrbit,
  effective,
  freePotential,
  keplerPotential,
  radialPeriod,
  sampleOrbit,
  traceOrbit,
  yukawaPotential,
  type CentralPotential,
  type Trace,
} from '~/physics/centralforce';
import { circularRadius, orbitalPeriod } from '~/physics/orbit';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import { drawAxes, drawCurve, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type PresetId = 'gravity' | 'free' | 'yukawa';

const GM = G_NEWTON * M_SUN;
const LAMBDA = 3 * AU;
/** the graph's r axis and the orbit panel's half-width [AU] */
const R_VIEW = 4;
/** the graph's energy axis [10⁸ J/kg] */
const U_LO = -8;
const U_HI = 4;
const UNIT = 1e8;
const H_MIN = 3.5e15;
const H_MAX = 6.5e15;
const R_LO = 0.02 * AU;
const R_HI = 60 * AU;
const ETA = 0.006;

const POTENTIALS: Record<PresetId, CentralPotential> = {
  gravity: keplerPotential(GM),
  free: freePotential(),
  yukawa: yukawaPotential(GM, LAMBDA),
};
const PRESET_LABEL: Record<PresetId, string> = { gravity: 'כבידה', free: 'בלי כוח', yukawa: 'כוח אחר' };

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  circle: `הורידו את הקו ${ltr('ε')} לתחתית הבור של העקומה, ושחררו. איזה מסלול יוצא?`,
  bound: `הרימו את הקו ${ltr('ε')} מעט מעל המינימום, אבל השאירו אותו מתחת לאפס, ושחררו.`,
  unbound: `הרימו את הקו ${ltr('ε')} מעל אפס ושחררו.`,
  'turning-speed': 'במסלול שאינו מעגל: הזיזו את פס הזמן לרגע שבו הגוף הכי רחוק מהשמש. האם הוא עומד שם?',
  'free-line': 'בחרו "בלי כוח" ושחררו. השוו את המסלול במישור לגרף.',
  rosette: `בחרו "כוח אחר", קבעו ${ltr('ε')} בין המינימום לאפס, ושחררו. האם המסלול נסגר?`,
  compare: `חזרו ל"כבידה" באותו ${ltr('h')}, קבעו ${ltr('ε')} בין המינימום לאפס, ושחררו. האם המסלול נסגר עכשיו?`,
};

export interface EffectivePotentialProps {
  id: string;
  preset?: PresetId;
  presets?: PresetId[];
  /** specific angular momentum [m²/s] */
  h?: number;
  /** specific energy [J/kg], or 'min' for the circular orbit */
  E?: number | 'min';
  /** draw the two parts of u_eff dashed */
  parts?: boolean;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

interface Setup {
  preset: PresetId;
  h: number;
  /** ε [J/kg]; ignored while `circ` */
  E: number;
  /** ε pinned at the minimum of u_eff */
  circ: boolean;
}

interface Run {
  n: number;
  setup: Setup;
  trace: Trace;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const isPreset = (x: unknown): x is PresetId => x === 'gravity' || x === 'free' || x === 'yukawa';
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 0) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));

/** The circular orbit of (preset, h) and the bottom of the well, or null (no force: no minimum). */
function minimumOf(preset: PresetId, h: number): { r: number; u: number } | null {
  if (preset === 'free') return null;
  const pot = POTENTIALS[preset];
  const r = preset === 'gravity' ? circularRadius(GM, h) : circularOrbit(pot, h, R_LO, 20 * AU);
  return r === null ? null : { r, u: effective(pot, h, r) };
}

/** The energies the line may take [J/kg]. */
function limitsOf(preset: PresetId, h: number): { lo: number; hi: number } {
  const m = minimumOf(preset, h);
  if (preset === 'free') return { lo: 0.3 * UNIT, hi: 3.6 * UNIT };
  if (preset === 'yukawa') return { lo: (m as { u: number }).u, hi: -0.1 * UNIT };
  return { lo: (m as { u: number }).u, hi: 3 * UNIT };
}

const energyOf = (s: Setup) => (s.circ ? limitsOf(s.preset, s.h).lo : s.E);

/** The motion, from the periapsis (t = 0). */
function traceOf(s: Setup): Trace {
  const pot = POTENTIALS[s.preset];
  const eps = energyOf(s);
  const m = minimumOf(s.preset, s.h);
  const opts = { rLo: R_LO, rHi: R_HI, rEscape: 1.6 * R_VIEW * AU, eta: ETA };
  if (s.circ && m) return traceOrbit(pot, s.h, eps, { ...opts, tEnd: (2 * Math.PI * m.r * m.r) / s.h });
  if (s.preset === 'gravity') {
    if (eps < 0) return traceOrbit(pot, s.h, eps, { ...opts, tEnd: orbitalPeriod(GM, -GM / (2 * eps)) });
    return traceOrbit(pot, s.h, eps, { ...opts, tEnd: 0 });
  }
  if (s.preset === 'yukawa' && m) {
    const first = traceOrbit(pot, s.h, eps, { ...opts, tEnd: 0 });
    const Tr = first.ra - first.rp > 1e-3 * m.r && Number.isFinite(first.ra) ? radialPeriod(pot, s.h, eps, first.rp, first.ra, 2000) : (2 * Math.PI * m.r * m.r) / s.h;
    return traceOrbit(pot, s.h, eps, { ...opts, tEnd: 5 * Tr });
  }
  return traceOrbit(pot, s.h, eps, { ...opts, tEnd: 0 });
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
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** A symbol with a true subscript, with a paper halo; returns its width. */
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

interface Layout {
  plot: Plot;
  /** the orbit panel: centre and pixels per AU */
  cx: number;
  cy: number;
  half: number;
  ppa: number;
  narrow: boolean;
}

export default function EffectivePotential(props: EffectivePotentialProps) {
  const offered: PresetId[] = props.presets ?? [props.preset ?? 'gravity'];

  const initialSetup = (): Setup => {
    const preset: PresetId = props.preset ?? offered[0];
    const h = clamp(props.h ?? 4.5e15, H_MIN, H_MAX);
    const lim = limitsOf(preset, h);
    if (props.E === 'min' && preset !== 'free') return { preset, h, E: lim.lo, circ: true };
    const E = clamp(typeof props.E === 'number' ? props.E : -3e8, lim.lo, lim.hi);
    return { preset, h, E, circ: preset !== 'free' && E <= lim.lo };
  };

  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [parts, setParts] = useState(props.parts ?? true);
  /** the instant shown when nothing is moving [s], from the periapsis */
  const [time, setTime] = useState(0);
  const [flying, setFlying] = useState<Run | null>(null);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  const count = useRef(0);
  const landed = useRef(0);
  const grabbing = useRef(false);

  const pot = POTENTIALS[setup.preset];
  const lim = limitsOf(setup.preset, setup.h);
  const eps = energyOf(setup);
  const minimum = useMemo(() => minimumOf(setup.preset, setup.h), [setup.preset, setup.h]);
  const trace = useMemo(() => traceOf(setup), [setup.preset, setup.h, setup.E, setup.circ]);
  const tStart = trace.samples[0].t;
  const tEnd = trace.samples[trace.samples.length - 1].t;
  const rdotMax = useMemo(() => Math.max(1e-9, ...trace.samples.map((s) => Math.abs(s.rdot))), [trace]);
  const isCircle = setup.circ && setup.preset !== 'free';

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the force, h, ε and the instant shown; they never release and never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setFlying(null);
        setSetup((prev) => {
          const preset = isPreset(st.preset) ? st.preset : prev.preset;
          const h = clamp(num(st.h) ?? prev.h, H_MIN, H_MAX);
          const l = limitsOf(preset, h);
          if (st.E === 'min' && preset !== 'free') return { preset, h, E: l.lo, circ: true };
          const E = clamp(num(st.E) ?? (prev.circ ? l.lo : prev.E), l.lo, l.hi);
          return { preset, h, E, circ: preset !== 'free' && (num(st.E) === null ? prev.circ : false) };
        });
        setParts((prev) => bool(st.parts) ?? prev);
        setTime(num(st.t) !== null ? (num(st.t) as number) * YEAR : 0);
      }),
    [props.id],
  );

  const kindOf = (s: Setup, tr: Trace) => (s.preset === 'free' ? 'free' : s.circ ? 'circle' : tr.bound ? 'bound' : 'unbound');

  const describe = (r: Run) => {
    const k = kindOf(r.setup, r.trace);
    if (k === 'circle') return `מסלול מעגלי ברדיוס ${sci(r.trace.rp / AU)} יחידות אסטרונומיות.`;
    if (k === 'bound') return `מסלול קשור: המרחק מהשמש נע בין ${sci(r.trace.rp / AU)} ל-${sci(r.trace.ra / AU)} יחידות אסטרונומיות.`;
    if (k === 'free') return `תנועה בקו ישר. המרחק הקטן ביותר מהשמש ${sci(r.trace.rp / AU)} יחידות אסטרונומיות.`;
    return `מסלול לא קשור: הגוף מגיע עד ${sci(r.trace.rp / AU)} יחידות אסטרונומיות מהשמש ומתרחק לתמיד.`;
  };

  const land = (r: Run) => {
    if (landed.current === r.n) return;
    landed.current = r.n;
    setFlying(null);
    setTime(r.trace.samples[r.trace.samples.length - 1].t);
    setLive(describe(r));
  };

  const fire = () => {
    const n = ++count.current;
    t0.current = null;
    const r: Run = { n, setup: { ...setup }, trace };
    const k = kindOf(setup, trace);
    if (setup.preset === 'gravity') {
      if (k === 'circle') done('circle');
      if (k === 'bound') {
        done('bound');
        done('compare');
      }
      if (k === 'unbound') done('unbound');
    }
    if (k === 'free') done('free-line');
    if (setup.preset === 'yukawa' && k === 'bound') done('rosette');
    if (!motionAllowed()) {
      land(r);
      return;
    }
    setFlying(r);
    setLive('הגוף נע.');
  };

  /* ---------------------------------------------------------------- drawing */

  const layoutOf = (view: { w: number; h: number }): Layout => {
    const narrow = view.w < 560;
    if (narrow) {
      const plotH = Math.round(view.h * 0.46);
      const box = insetBox({ x: 0, y: 0, w: view.w, h: plotH }, { l: 50, r: 12, t: 16, b: 42 });
      const side = Math.min(view.w, view.h - plotH);
      const half = Math.max(20, side / 2 - 8);
      return { plot: plotOf(box), cx: view.w / 2, cy: plotH + (view.h - plotH) / 2, half, ppa: (half - 4) / R_VIEW, narrow };
    }
    const side = Math.min(view.h, view.w * 0.44);
    const box = insetBox({ x: 0, y: 0, w: view.w - side - 8, h: view.h }, { l: 54, r: 12, t: 16, b: 44 });
    const half = Math.max(20, side / 2 - 8);
    return { plot: plotOf(box), cx: view.w - side / 2, cy: view.h / 2, half, ppa: (half - 4) / R_VIEW, narrow };
  };
  const plotOf = (box: { x: number; y: number; w: number; h: number }) =>
    makePlot(
      box,
      { min: 0, max: R_VIEW, label: 'המרחק r (AU)', format: (x) => sci(x, 2) },
      { min: U_LO, max: U_HI, label: `אנרגיה ליחידת מסה (${ltr('10⁸ J/kg')})`, format: (x) => sci(x, 2).replace('-', '−') },
    );

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const L = layoutOf(view);
    const { plot, narrow } = L;
    const { box } = plot;
    const fs = narrow ? 11 : 12;
    const h = setup.h;

    // the instant shown
    let tr = trace;
    let now = clamp(time, tStart, tEnd);
    if (flying) {
      if (t0.current === null) t0.current = t;
      tr = flying.trace;
      const a = tr.samples[0].t;
      const b = tr.samples[tr.samples.length - 1].t;
      const play = flying.setup.preset === 'yukawa' && !flying.setup.circ ? 14 : 7; // seconds on screen
      now = Math.min(a + (t - t0.current) * ((b - a) / play), b);
      if (now >= b) land(flying);
    }
    const st = sampleOrbit(tr, now);
    const E = energyOf(flying ? flying.setup : setup);
    const uE = E / UNIT;
    const clipTo = (x: number, y: number, w: number, hh: number) => {
      ctx.beginPath();
      ctx.rect(x, y, w, hh);
      ctx.clip();
    };

    /* ---------------- the graph */
    drawAxes(ctx, plot, p);
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, plot.py(0));
    ctx.lineTo(box.x + box.w, plot.py(0));
    ctx.stroke();
    ctx.restore();

    const ueff = (rAU: number) => (rAU <= 0 ? NaN : effective(pot, h, rAU * AU) / UNIT);
    // the allowed region: between u_eff(r) and the ε line where u_eff ≤ ε
    {
      ctx.save();
      clipTo(box.x, box.y, box.w, box.h);
      ctx.fillStyle = withAlpha(p.energyK, 0.16);
      const n = 360;
      let open = false;
      ctx.beginPath();
      for (let i = 1; i <= n; i++) {
        const r = (R_VIEW * i) / n;
        const u = ueff(r);
        if (u <= uE) {
          if (!open) {
            ctx.moveTo(plot.px(r), plot.py(uE));
            open = true;
          }
          ctx.lineTo(plot.px(r), plot.py(Math.max(u, U_LO - 1)));
        } else if (open) {
          ctx.lineTo(plot.px(r), plot.py(uE));
          ctx.closePath();
          open = false;
        }
      }
      if (open) {
        ctx.lineTo(plot.px(R_VIEW), plot.py(uE));
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    }

    // the two parts, dashed: the angular kinetic energy h²/(2r²) and the potential energy u(r)
    if (parts) {
      drawCurve(ctx, plot, (r) => (r <= 0 ? NaN : (h * h) / (2 * r * r * AU * AU) / UNIT), { color: p.energyK, width: 1.6, dash: [6, 5], samples: 300 });
      if (setup.preset !== 'free') drawCurve(ctx, plot, (r) => (r <= 0 ? NaN : pot.u(r * AU) / UNIT), { color: p.ink2, width: 1.6, dash: [6, 5], samples: 300 });
      // labels at the right end of each part, just inside the plot
      const xr = R_VIEW * 0.93;
      const yK = plot.py((h * h) / (2 * xr * xr * AU * AU) / UNIT);
      haloText(ctx, p, 'h²/2r²', plot.px(xr), yK - 11, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.energyK, align: 'right' });
      if (setup.preset !== 'free') {
        // the potential's label low on the plot, just right of its curve, clear of the ε line
        let ru = 0.2;
        while (ru < R_VIEW && pot.u(ru * AU) / UNIT < U_LO + 0.12 * (U_HI - U_LO)) ru += 0.01;
        haloText(ctx, p, setup.preset === 'gravity' ? '−GM/r' : 'u(r)', plot.px(ru) + 8, plot.py(U_LO + 0.12 * (U_HI - U_LO)), { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'left' });
      }
    }
    // the effective potential
    drawCurve(ctx, plot, ueff, { color: p.energyP, width: 2.6, samples: 500 });
    {
      // its label where the curve crosses the top-left part of the plot
      const xs = (() => {
        for (let r = 0.05; r < R_VIEW; r += 0.01) if (ueff(r) < U_HI - 0.07 * (U_HI - U_LO)) return r;
        return 0.5;
      })();
      subText(ctx, p, 'u', 'eff', plot.px(xs) + 8, plot.py(ueff(xs)) - 2, fs + 2, p.energyP, 'left');
    }

    // the ε line
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(box.x, plot.py(uE));
    ctx.lineTo(box.x + box.w, plot.py(uE));
    ctx.stroke();
    ctx.restore();
    haloText(ctx, p, 'ε', box.x + box.w - 8, plot.py(uE) - 11, { font: `italic 700 ${fs + 3}px ${p.fontUi}`, color: p.ink, align: 'right' });

    // the minimum: the circular orbit
    if (minimum && minimum.u / UNIT >= U_LO) {
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.strokeStyle = p.paper;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(plot.px(minimum.r / AU), plot.py(minimum.u / UNIT), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (!isCircle) handNote(ctx, 'מעגל', plot.px(minimum.r / AU), plot.py(minimum.u / UNIT) + 16, p, narrow ? 12 : 14);
    }

    // turning points: dashed down to the r axis, named r_p and r_a
    const tps: [number, string][] = isCircle ? [] : [[tr.rp, 'p'], ...(Number.isFinite(tr.ra) ? ([[tr.ra, 'a']] as [number, string][]) : [])];
    for (const [r, sub] of tps) {
      const X = plot.px(r / AU);
      if (X > box.x + box.w) continue;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X, plot.py(uE));
      ctx.lineTo(X, box.y + box.h);
      ctx.stroke();
      ctx.restore();
      subText(ctx, p, 'r', sub, X + (sub === 'p' ? -6 : 6), box.y + box.h - 12, fs + 1, p.ink2, sub === 'p' ? 'right' : 'left');
    }

    // the body on the ε line, with ½ṙ² as the gap down to the curve
    {
      const X = plot.px(st.r / AU);
      const Y = plot.py(uE);
      if (X <= box.x + box.w + 1) {
        ctx.save();
        ctx.strokeStyle = p.energyK;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(X, clamp(plot.py(ueff(st.r / AU)), box.y, box.y + box.h));
        ctx.lineTo(X, Y);
        ctx.stroke();
        ctx.restore();
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
    }

    /* ---------------- the plane of the motion */
    const { cx, cy, half, ppa } = L;
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - half, cy - half, 2 * half, 2 * half);
    ctx.restore();
    ctx.save();
    clipTo(cx - half, cy - half, 2 * half, 2 * half);
    // distance rings every AU, labelled along the +x axis
    for (let k = 1; k <= R_VIEW; k++) {
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink3, 0.6);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, k * ppa, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // the outermost ring named in the panel's lower-right corner, away from the orbits
    haloText(ctx, p, `${R_VIEW} AU`, cx + R_VIEW * ppa * 0.74, cy + R_VIEW * ppa * 0.74, { font: `${fs - 1}px ${p.fontUi}`, color: p.ink2, align: 'left' });
    // the ring the turning points allow
    if (!isCircle) {
      const rIn = tr.rp / AU;
      const rOut = Number.isFinite(tr.ra) ? tr.ra / AU : 3 * R_VIEW;
      ctx.save();
      ctx.fillStyle = withAlpha(p.energyK, 0.13);
      ctx.beginPath();
      ctx.arc(cx, cy, rOut * ppa, 0, Math.PI * 2);
      ctx.arc(cx, cy, rIn * ppa, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 3]);
      for (const r of [rIn, ...(Number.isFinite(tr.ra) ? [rOut] : [])]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * ppa, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    // the orbit: all of it faint, the stretch already covered solid
    const toXY = (r: number, th: number): [number, number] => [cx + (r / AU) * ppa * Math.cos(th), cy - (r / AU) * ppa * Math.sin(th)];
    const path = (upTo: number) => {
      const s = tr.samples;
      const stride = Math.max(1, Math.floor(s.length / 1500));
      ctx.beginPath();
      let first = true;
      for (let i = 0; i < s.length; i += stride) {
        if (s[i].t > upTo) break;
        const [X, Y] = toXY(s[i].r, s[i].theta);
        if (first) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
        first = false;
      }
      const [X, Y] = toXY(st.r, st.theta);
      if (upTo < Infinity) ctx.lineTo(X, Y);
      ctx.stroke();
    };
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = withAlpha(p.accent, 0.3);
    ctx.lineWidth = 1.6;
    path(Infinity);
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.4;
    path(now);
    ctx.restore();
    // the Sun
    ctx.save();
    ctx.fillStyle = setup.preset === 'free' ? p.paper : p.energyP;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (setup.preset === 'free') haloText(ctx, p, 'O', cx - 9, cy + 11, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink, align: 'right' });
    // the body: the radius to it, its velocity, and the dot
    {
      const [X, Y] = toXY(st.r, st.theta);
      if (Math.abs(X - cx) < half && Math.abs(Y - cy) < half) {
        ctx.save();
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(X, Y);
        ctx.stroke();
        ctx.restore();
        // velocity: ṙ r̂ + (h/r) θ̂, 60 km/s ↦ 30 % of the panel
        const vt = h / st.r;
        const vx = st.rdot * Math.cos(st.theta) - vt * Math.sin(st.theta);
        const vy = st.rdot * Math.sin(st.theta) + vt * Math.cos(st.theta);
        const k = (0.3 * 2 * half) / 60e3;
        const len = Math.max(16, Math.hypot(vx, vy) * k);
        const sp = Math.hypot(vx, vy);
        arrow(ctx, X, Y, X + (vx / sp) * len, Y - (vy / sp) * len, { color: p.velocity, width: 2.4, head: 8 });
        haloText(ctx, p, 'v', X + (vx / sp) * (len + 9), Y - (vy / sp) * (len + 9), { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.velocity });
        ctx.save();
        ctx.fillStyle = p.accent;
        ctx.strokeStyle = p.paper;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(X, Y, narrow ? 5.5 : 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        handNote(ctx, 'הגוף מחוץ לתמונה', cx, cy + half - 14, p, narrow ? 12 : 13);
      }
    }
    ctx.restore();
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1.9, worldHeight: 1, animate: flying !== null });
  useEffect(invalidate, [setup, parts, time, flying, trace]);

  // side by side on a wide screen, stacked on a narrow one
  const [aspect, setAspect] = useState(1.9);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 560 ? 0.62 : 1.9));
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
  /** ε from the learner: at (or within a hair of) the minimum it pins to the circle */
  const setE = (E: number, snap = 0.004 * UNIT) =>
    change((s) => {
      const l = limitsOf(s.preset, s.h);
      if (s.preset !== 'free' && E <= l.lo + snap) return { ...s, E: l.lo, circ: true };
      return { ...s, E: clamp(Number(E.toPrecision(4)), l.lo, l.hi), circ: false };
    });
  const setH = (h: number) =>
    change((s) => {
      const hh = clamp(h, H_MIN, H_MAX);
      const l = limitsOf(s.preset, hh);
      if (s.circ) return { ...s, h: hh, E: l.lo };
      return { ...s, h: hh, E: clamp(s.E, l.lo, l.hi), circ: s.preset !== 'free' && s.E <= l.lo };
    });
  const setPreset = (preset: PresetId) =>
    change((s) => {
      const l = limitsOf(preset, s.h);
      if (preset === 'free') return { ...s, preset, E: clamp(s.E > 0 ? s.E : 2 * UNIT, l.lo, l.hi), circ: false };
      if (s.circ) return { ...s, preset, E: l.lo, circ: true };
      const E = clamp(s.E, l.lo, l.hi);
      return { ...s, preset, E, circ: E <= l.lo };
    });
  const scrub = (tYear: number) => {
    setFlying(null);
    const tt = clamp(tYear * YEAR, tStart, tEnd);
    setTime(tt);
    const s = sampleOrbit(trace, tt);
    if (!isCircle && trace.bound && Number.isFinite(trace.ra) && Math.abs(s.rdot) < 0.03 * rdotMax && s.r > 0.5 * (trace.rp + trace.ra)) done('turning-speed');
  };

  const onPointerDown = (e: PointerEvent) => {
    const view = viewRef.current;
    if (!view) return;
    const { plot } = layoutOf(view);
    const { box } = plot;
    if (e.offsetX < box.x - 10 || e.offsetX > box.x + box.w + 10 || e.offsetY < box.y - 10 || e.offsetY > box.y + box.h + 6) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    grabbing.current = true;
    onPointerMove(e);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!grabbing.current) return;
    const view = viewRef.current;
    if (!view) return;
    const { plot } = layoutOf(view);
    const { box } = plot;
    const u = U_LO + ((box.y + box.h - e.offsetY) / box.h) * (U_HI - U_LO);
    // within 8 px of the bottom of the well, the line snaps onto it
    setE(u * UNIT, (8 / box.h) * (U_HI - U_LO) * UNIT);
  };
  const onPointerUp = () => {
    grabbing.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') fire();
    else if (e.key === 'ArrowUp') setE(eps + 0.1 * UNIT, 0);
    else if (e.key === 'ArrowDown') setE(eps - 0.1 * UNIT);
    else return;
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const shown = clamp(time, tStart, tEnd);
  const s = sampleOrbit(trace, shown);
  const vt = setup.h / s.r;
  const ue = effective(pot, setup.h, s.r);
  const kr = 0.5 * s.rdot * s.rdot;
  const tinyU = 1e-5 * UNIT;
  const kind = kindOf(setup, trace);
  const kindHe = kind === 'circle' ? 'מעגל' : kind === 'bound' ? (setup.preset === 'yukawa' ? 'קשור, לא נסגר' : 'קשור, אליפסה') : kind === 'free' ? 'קו ישר' : 'לא קשור';
  const label = `איור חי: הפוטנציאל האפקטיבי ליחידת מסה ליד המסלול שהוא קובע. ${PRESET_LABEL[setup.preset]}, h שווה ${sci(setup.h)} מטר רבוע לשנייה, אנרגיה ליחידת מסה ${sci(eps)} ג'אול לקילוגרם: ${kindHe}. במקלדת: חץ למעלה ולמטה משנה את האנרגיה, Enter משחרר.`;

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
        setParts(props.parts ?? true);
        setFlying(null);
        setTime(0);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        flying ? (
          <span>הגוף נע…</span>
        ) : (
          <>
            <span class="q" data-readout="kind">
              <b>{kindHe}</b>
            </span>
            <span class="q" data-readout="t">
              t = <b>{signed(shown / YEAR, 1e-6)} yr</b>
            </span>
            <span class="q" data-readout="r">
              r = <b>{signed(s.r / AU)} AU</b>
            </span>
            <span class="q" data-readout="rdot">
              ṙ = <b>{signed(s.rdot / 1e3, 2e-3 * rdotMax / 1e3)} km/s</b>
            </span>
            <span class="q" data-readout="vt">
              h/r = <b>{signed(vt / 1e3)} km/s</b>
            </span>
            <span class="q" data-readout="v">
              v = <b>{signed(Math.hypot(s.rdot, vt) / 1e3)} km/s</b>
            </span>
            <span class="q" data-readout="eps">
              ε = <b>{signed(eps, tinyU)} J/kg</b>
            </span>
            <span class="q" data-readout="ueff">
              u<sub>eff</sub>(r) = <b>{signed(ue, tinyU)} J/kg</b>
            </span>
            <span class="q" data-readout="kr">
              ½ṙ² = ε − u<sub>eff</sub> = <b>{signed(kr, tinyU)} J/kg</b>
            </span>
            <span class="q" data-readout="rp">
              r<sub>p</sub> = <b>{signed(trace.rp / AU)} AU</b>
            </span>
            <span class="q" data-readout="ra">
              r<sub>a</sub> = <b>{Number.isFinite(trace.ra) ? `${signed(trace.ra / AU)} AU` : '∞'}</b>
            </span>
          </>
        )
      }
      controls={
        <>
          {offered.length > 1 && (
            <div class="group" role="group" aria-label="איזה כוח">
              {offered.map((id) => (
                <Toggle key={id} label={PRESET_LABEL[id]} on={setup.preset === id} onChange={() => setPreset(id)} />
              ))}
            </div>
          )}
          <Slider
            label="התנע הזוויתי ליחידת מסה h"
            value={setup.h / 1e15}
            min={H_MIN / 1e15}
            max={H_MAX / 1e15}
            step={0.1}
            format={(x) => `${sci(x)}·10¹⁵ m²/s`}
            onChange={(v) => setH(v * 1e15)}
          />
          <Slider
            label="האנרגיה ליחידת מסה ε"
            value={eps / UNIT}
            min={Math.floor((lim.lo / UNIT) * 100) / 100}
            max={lim.hi / UNIT}
            step={0.01}
            format={(x) => `${signed(x, 1e-9)}·10⁸ J/kg`}
            onChange={(v) => setE(v * UNIT)}
          />
          <Slider
            label="זמן מהמעבר בנקודת הקרבה"
            value={Number((shown / YEAR).toPrecision(3))}
            min={Number((tStart / YEAR).toPrecision(3))}
            max={Number((tEnd / YEAR).toPrecision(3))}
            step={0.01}
            format={(x) => `${signed(x, 1e-9)} yr`}
            onChange={scrub}
          />
          <div class="group" role="group" aria-label="שחרור">
            <button type="button" class="btn primary" onClick={fire}>
              שחררו
            </button>
          </div>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="שני האיברים" on={parts} swatch="var(--energy-k)" onChange={setParts} />
          </div>
        </>
      }
    />
  );
}
