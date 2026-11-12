/**
 * ShellTheorem (lesson 6.1): the gravity of a thin spherical shell, summed ring by ring, and of a uniform solid
 * sphere, summed shell by shell.
 *
 * Above: a cross-section of the body through its centre O and a probe P on the axis at
 * distance r. The shell is cut by planes perpendicular to the axis into n rings of equal thickness, which have
 * equal mass (hat-box theorem, src/physics/shell.ts); each ring is seen edge-on as a chord. A ring that pulls P
 * toward the centre is drawn in one colour, a ring that pulls it away from the centre in another, each ring's
 * opacity following the size of its pull. At P: the summed pull of the rings of each kind (thin, dashed) and their
 * sum, the net field g (thick, in the force colour). The button adds the rings one at a time, from the side far
 * from P; the lines from P to the newest ring show the distance s from P to every point of it.
 *
 * The solid sphere is drawn as concentric layers: those inside radius r (shaded) pull P like a point mass M(r) at
 * O; those outside r do not pull at all. The field is their sum (2000 layers, each by the shell theorem).
 *
 * Below: g(r) or U(r)/m from the shell theorem as curves, with the analytic value at P (a full dot) and
 * the ring sum (an open ring). Units: G = M = R = 1, so g is in GM/R² and U/m in GM/R.
 *
 * Tasks tick only in the learner's own handlers (sliders, chips, the button, dragging P), never from a text step.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { enclosedMass, shellField, shellPotential, shellSum, sphereField, sphereLayers, spherePotential, type ShellSum } from '~/physics/shell';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import { drawAxes, insetBox, makePlot, type Box, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Body = 'shell' | 'solid';
type PlotKind = 'g' | 'U';

const R_MAX = 3;
const N_MIN = 4;
const N_MAX = 200;
/** layers of the solid sphere in its sum (each by the shell theorem) */
const LAYERS = 2000;
const SPHERE_LAYERS = sphereLayers(1, 1, LAYERS);
/** a full ring-by-ring sum plays in this many seconds */
const PLAY_SECONDS = 5;

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  outside: `הזיזו את P אל מחוץ לקליפה, רחוק מ-${ltr('1.2 R')}, והשוו את סכום הטבעות ל-${ltr('GM/r²')}.`,
  inside: 'הכניסו את P אל תוך הקליפה, לא למרכז: בין 0.2 ל-0.9 של הרדיוס. כמה שווה הסכום?',
  play: 'כש-P בתוך הקליפה, לחצו "סכמו טבעת אחר טבעת" והסתכלו על שני החצים הדקים.',
  rings: 'כש-P בתוך הקליפה, העלו את מספר הטבעות ל-100 או יותר. מה קורה לשארית?',
  'solid-inside': 'בכדור המלא: הזיזו את P אל תוך הכדור, ובדקו ש-g פרופורציוני ל-r.',
  potential: 'בכדור המלא: עברו לגרף של U, והשוו את השיפוע שלו בתוך הכדור ומחוצה לו.',
};

export interface ShellTheoremProps {
  id: string;
  /** the body shown first, and the chips offered */
  body?: Body;
  bodies?: Body[];
  /** probe distance from the centre, in units of R */
  r?: number;
  /** number of rings */
  n?: number;
  plot?: PlotKind;
  tasks?: string[];
}

interface State {
  body: Body;
  r: number;
  n: number;
  plot: PlotKind;
  /** rings summed so far while the sum plays; null = all of them */
  k: number | null;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const round2 = (x: number) => Math.round(x * 100) / 100;
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 1e-9) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));

/** The field and the potential at P: the analytic law and the numerical sum. */
interface Reading {
  gTheory: number;
  uTheory: number;
  gSum: number;
  uSum: number;
  /** the shell's rings (shell only), and the partial sums of the inward and outward pulls over the rings summed */
  sum: ShellSum | null;
  inward: number;
  outward: number;
  /** rings summed (shell), out of n */
  k: number;
}

function read(s: State): Reading {
  if (s.body === 'solid') {
    // the layers summed, each a thin shell at its mid-radius, by the shell theorem
    let g = 0;
    let u = 0;
    for (const l of SPHERE_LAYERS) {
      g += shellField(1, l.m, l.mid, s.r);
      u += shellPotential(1, l.m, l.mid, s.r);
    }
    return { gTheory: sphereField(1, 1, 1, s.r), uTheory: spherePotential(1, 1, 1, s.r), gSum: g, uSum: u, sum: null, inward: 0, outward: 0, k: s.n };
  }
  const sum = shellSum(1, 1, 1, s.r, s.n);
  const k = s.k === null ? s.n : clamp(Math.floor(s.k), 0, s.n);
  // the rings are summed from the side far from P (x = −R) toward P
  let g = 0;
  let u = 0;
  let inward = 0;
  let outward = 0;
  for (let i = 0; i < k; i++) {
    const q = sum.pulls[i];
    g += q.g;
    u += q.u;
    if (q.g >= 0) inward += q.g;
    else outward -= q.g;
  }
  return { gTheory: shellField(1, 1, 1, s.r), uTheory: shellPotential(1, 1, 1, s.r), gSum: g, uSum: u, sum, inward, outward, k };
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

interface Layout {
  narrow: boolean;
  geo: Box;
  /** world → screen in the geometry panel */
  sx: (x: number) => number;
  sy: (y: number) => number;
  scale: number;
  plot: Plot;
}

function layoutOf(w: number, h: number, kind: PlotKind, r: number): Layout {
  const narrow = w < 520;
  // geometry above, the plot below, at every width (the probe runs to 3R, so the geometry is wide and short)
  const split = narrow ? 0.54 : 0.5;
  const geo: Box = { x: 0, y: 0, w, h: h * split };
  const plotOuter: Box = { x: 0, y: h * split, w, h: h * (1 - split) };
  // world: x from −1.3 (left of the body) to just beyond the probe (at least 2.3, so the body is drawn large
  // while P is near it; the view widens continuously as P moves past 2R), y within ±1.3
  const x0 = -1.3;
  const x1 = Math.max(2.3, r + 0.3);
  const yHalf = 1.3;
  const pad = 10;
  // at least 1 px per R: a canvas that is not laid out yet is 0 px tall, and a negative radius throws in arc()
  const scale = Math.max(1, Math.min((geo.w - 2 * pad) / (x1 - x0), (geo.h - 2 * pad) / (2 * yHalf)));
  const left = geo.x + (geo.w - scale * (x1 - x0)) / 2;
  const cy = geo.y + geo.h / 2 + 4;
  const sx = (x: number) => left + (x - x0) * scale;
  const sy = (y: number) => cy - y * scale;
  const box = insetBox(plotOuter, { l: 56, r: narrow ? 14 : 22, t: 14, b: 46 });
  const plot = makePlot(
    box,
    { min: 0, max: R_MAX, label: 'המרחק מהמרכז r/R', format: (v) => sci(v, 2) },
    kind === 'g'
      ? { min: 0, max: 1.15, label: 'g (GM/R²)', ticks: [0, 0.25, 0.5, 0.75, 1], format: (v) => sci(v, 2) }
      : { min: -1.6, max: 0, label: 'U/m (GM/R)', ticks: [-1.5, -1, -0.5, 0], format: (v) => sci(v, 2).replace('-', '−') },
  );
  return { narrow, geo, sx, sy, scale, plot };
}

export default function ShellTheorem(props: ShellTheoremProps) {
  const offered: Body[] = props.bodies ?? [props.body ?? 'shell'];
  const initial = (): State => ({
    body: props.body ?? offered[0],
    r: clamp(props.r ?? 1.6, 0, R_MAX),
    n: clamp(Math.round(props.n ?? 12), N_MIN, N_MAX),
    plot: props.plot ?? 'g',
    k: null,
  });
  const [s, setS] = useState<State>(initial);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState('');
  const dragging = useRef(false);

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  const z = read(s);

  // text steps set the body, the probe, the rings and the plot; they never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setPlaying(false);
        setS((prev) => ({
          body: st.body === 'shell' || st.body === 'solid' ? st.body : prev.body,
          r: clamp(num(st.r) ?? prev.r, 0, R_MAX),
          n: clamp(Math.round(num(st.n) ?? prev.n), N_MIN, N_MAX),
          plot: st.plot === 'g' || st.plot === 'U' ? st.plot : prev.plot,
          k: num(st.k),
        }));
      }),
    [props.id],
  );

  // the ring-by-ring sum, played; frozen (jumps to the end) in still mode. The count lives in the effect, not in
  // a state updater (Preact runs updaters at render time, too late to decide whether to schedule the next frame).
  const nRef = useRef(s.n);
  nRef.current = s.n;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let k = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const n = nRef.current;
      k += (n * dt) / PLAY_SECONDS;
      if (!motionAllowed() || k >= n) {
        setS((prev) => ({ ...prev, k: null }));
        setPlaying(false);
        return;
      }
      const kk = k;
      setS((prev) => ({ ...prev, k: kk }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    if (playing) return;
    const h = setTimeout(() => {
      const where = s.r < 1 ? 'בתוך' : s.r > 1 ? 'מחוץ ל' : 'על';
      const body = s.body === 'shell' ? 'קליפה' : 'כדור';
      setLive(`P ${where}${body}, במרחק ${sci(s.r)} רדיוסים מהמרכז. סכום הטבעות נותן g שווה ${signed(z.gSum, 1e-12)}, ומשפט הקליפה נותן ${signed(z.gTheory, 1e-12)}, ביחידות GM חלקי R בריבוע.`);
    }, 700);
    return () => clearTimeout(h);
  }, [s.body, s.r, s.n, playing]);

  /* ---------------------------------------------------------------- drawing */

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const L = layoutOf(view.w, view.h, s.plot, s.r);
    const { sx, sy, scale, narrow } = L;
    const fs = narrow ? 11 : 13;
    const O = { x: sx(0), y: sy(0) };
    const R = scale; // the body's radius on screen

    // the axis through O and P
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(-1.25), O.y);
    ctx.lineTo(sx(R_MAX + 0.15), O.y);
    ctx.stroke();
    ctx.restore();

    if (s.body === 'shell' && z.sum) {
      // the shell outline, faint, then each ring edge-on as a chord
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink2, 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(O.x, O.y, R, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
      const top = Math.max(1e-12, ...z.sum.pulls.map((q) => Math.abs(q.g)));
      const width = Math.max(1, Math.min(6, (0.7 * 2 * R) / s.n));
      z.sum.pulls.forEach((q, i) => {
        const summed = i < z.k;
        const X = sx(q.ring.x);
        const half = q.ring.rho * scale;
        ctx.save();
        ctx.lineWidth = width;
        ctx.lineCap = 'butt';
        const col = q.g >= 0 ? p.pos : p.neg;
        ctx.strokeStyle = summed ? withAlpha(col, 0.25 + 0.75 * Math.sqrt(Math.abs(q.g) / top)) : withAlpha(p.ink3, 0.35);
        ctx.beginPath();
        ctx.moveTo(X, O.y - Math.max(1.5, half));
        ctx.lineTo(X, O.y + Math.max(1.5, half));
        ctx.stroke();
        ctx.restore();
      });
      // the newest ring while the sum plays: the distance s from P to every point of it
      if (z.k > 0 && z.k < s.n) {
        const q = z.sum.pulls[z.k - 1];
        ctx.save();
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 4]);
        for (const sgn of [1, -1]) {
          ctx.beginPath();
          ctx.moveTo(sx(s.r), O.y);
          ctx.lineTo(sx(q.ring.x), sy(sgn * q.ring.rho));
          ctx.stroke();
        }
        ctx.restore();
        haloText(ctx, p, 's', (sx(s.r) + sx(q.ring.x)) / 2, (O.y + sy(q.ring.rho)) / 2 - 8, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink2 });
      }
    } else {
      // the solid sphere: the layers inside r pull (shaded), the layers outside r do not
      const rIn = Math.min(s.r, 1);
      ctx.save();
      ctx.fillStyle = withAlpha(p.ink3, 0.12);
      ctx.beginPath();
      ctx.arc(O.x, O.y, R, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = withAlpha(p.pos, 0.28);
      ctx.beginPath();
      ctx.arc(O.x, O.y, rIn * R, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.ink2, 0.3);
      ctx.lineWidth = 1;
      for (let k = 1; k <= 8; k++) {
        ctx.beginPath();
        ctx.arc(O.x, O.y, (k / 8) * R, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(O.x, O.y, R, 0, 2 * Math.PI);
      ctx.stroke();
      if (s.r < 1) {
        // the sphere of radius r, whose mass M(r) pulls
        ctx.strokeStyle = p.pos;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(O.x, O.y, s.r * R, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();
      if (s.r < 0.85 && s.r > 0.12) handNote(ctx, 'לא מושך', O.x, sy(-(1 + s.r) / 2) + 2, p, narrow ? 12 : 14);
      // M(r) under the axis, inside the shaded sphere (clear of the arrow, O and P on the axis)
      if (s.r > 0.3) haloText(ctx, p, s.r < 1 ? 'M(r)' : 'M', O.x + 0.25 * Math.min(s.r, 1) * R, sy(-Math.min(s.r, 1) * 0.55), { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink });
    }

    // labels: O, R
    haloText(ctx, p, 'O', O.x - 9, O.y + 11, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink });
    {
      const a = (-3 * Math.PI) / 4;
      const ex = O.x + R * Math.cos(a);
      const ey = O.y + R * Math.sin(a);
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(O.x, O.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
      haloText(ctx, p, 'R', (O.x + ex) / 2 - 8, (O.y + ey) / 2 + 2, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink2 });
    }

    // the probe P and the pulls on it, along the axis (toward O = to the left)
    const P = { x: sx(s.r), y: O.y };
    {
      const unit = 0.9 * R; // 1 GM/R² on screen
      const cap = 1.5 * R;
      const len = (g: number) => Math.sign(g) * Math.min(cap, Math.abs(g) * unit);
      const minLen = 14;
      const vis = (g: number) => (Math.abs(g) < 1e-3 ? 0 : Math.sign(g) * Math.max(minLen, Math.abs(len(g))));
      if (s.body === 'shell') {
        const lin = vis(z.inward);
        const lout = vis(z.outward);
        if (lin !== 0) arrow(ctx, P.x, P.y - 14, P.x - lin, P.y - 14, { color: p.pos, width: 1.8, head: 7, alpha: 0.9 });
        if (lout !== 0) arrow(ctx, P.x, P.y + 14, P.x + lout, P.y + 14, { color: p.neg, width: 1.8, head: 7, alpha: 0.9 });
      }
      const lg = vis(z.gSum);
      if (lg !== 0) {
        arrow(ctx, P.x, P.y, P.x - lg, P.y, { color: p.force, width: 3, head: 10 });
        // above the middle of the arrow, clear of O and of the arrow's tip
        // shell: beyond the tip (the thin arrows sit above and below); sphere: above the arrow's middle, clear of O
        const gx = s.body === 'shell' ? P.x - lg - Math.sign(lg) * 9 : P.x - lg / 2;
        haloText(ctx, p, 'g', gx, P.y - (s.body === 'shell' ? 1 : 12), { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.force });
      }
      ctx.save();
      ctx.fillStyle = p.accent;
      ctx.strokeStyle = p.paper;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(P.x, P.y, narrow ? 5 : 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      haloText(ctx, p, 'P', P.x + 2, P.y - (s.body === 'shell' ? 30 : 16), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.accent });
    }

    /* ---------------- the plot of g(r) or U(r)/m */
    const { plot } = L;
    drawAxes(ctx, plot, p);
    const box = plot.box;
    const fG = s.body === 'shell' ? (r: number) => shellField(1, 1, 1, r) : (r: number) => sphereField(1, 1, 1, r);
    const fU = s.body === 'shell' ? (r: number) => shellPotential(1, 1, 1, r) : (r: number) => spherePotential(1, 1, 1, r);
    const f = s.plot === 'g' ? fG : fU;
    const curve = (a: number, b: number, color: string) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y - 2, box.w, box.h + 4);
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const n = 200;
      for (let i = 0; i <= n; i++) {
        const r = a + ((b - a) * i) / n;
        const v = f(r === 1 && s.plot === 'g' && s.body === 'shell' ? (a < 1 ? 1 - 1e-9 : 1 + 1e-9) : r);
        const X = plot.px(r);
        const Y = plot.py(v);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      ctx.restore();
    };
    const col = s.plot === 'g' ? p.force : p.energyP;
    // the surface r = R
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.px(1), box.y);
    ctx.lineTo(plot.px(1), box.y + box.h);
    ctx.stroke();
    ctx.restore();
    curve(0, 1, col);
    curve(1, R_MAX, col);
    // the point-mass law GM/r² (or −GM/r) continued inside, dashed, for comparison
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y - 2, box.w, box.h + 4);
    ctx.clip();
    ctx.strokeStyle = withAlpha(p.ink2, 0.6);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 100; i++) {
      const r = 0.3 + (0.7 * i) / 100;
      const v = s.plot === 'g' ? 1 / (r * r) : -1 / r;
      const X = plot.px(r);
      const Y = plot.py(v);
      if (!started) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
      started = true;
    }
    ctx.stroke();
    ctx.restore();
    {
      const label = s.plot === 'g' ? (s.body === 'shell' ? 'g(r)' : 'g(r)') : 'U(r)/m';
      const xr = 2.1;
      haloText(ctx, p, label, plot.px(xr), plot.py(f(xr)) + (s.plot === 'g' ? -14 : 14), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: col });
    }
    // P on the plot: the analytic value (full dot) and the ring sum (open ring)
    {
      const vT = s.plot === 'g' ? z.gTheory : z.uTheory;
      const vS = s.plot === 'g' ? z.gSum : z.uSum;
      const X = plot.px(s.r);
      const yS = clamp(plot.py(vS), box.y, box.y + box.h);
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X, box.y + box.h);
      ctx.lineTo(X, box.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(X, plot.py(vT), 4.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X, yS, 8, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
    }
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  // a taller stage on a narrow screen
  const [aspect, setAspect] = useState(1.0);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 520 ? 0.66 : 1.0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [aspect]);

  /* ---------------------------------------------------------------- input (the only place tasks tick) */

  const checkTasks = (next: State, how: 'r' | 'n' | 'body' | 'plot' | 'play') => {
    const inShell = next.body === 'shell' && next.r < 0.95;
    if (next.body === 'shell' && next.r >= 1.2 && how === 'r') done('outside');
    if (next.body === 'shell' && next.r >= 0.2 && next.r <= 0.9 && how === 'r') done('inside');
    if (inShell && how === 'n' && next.n >= 100) done('rings');
    if (inShell && how === 'play') done('play');
    if (next.body === 'solid' && next.r >= 0.1 && next.r <= 0.9 && (how === 'r' || how === 'body')) done('solid-inside');
    if (next.body === 'solid' && next.plot === 'U' && (how === 'plot' || how === 'body')) done('potential');
  };

  const change = (patch: Partial<State>, how: 'r' | 'n' | 'body' | 'plot') => {
    setPlaying(false);
    const next: State = { ...s, ...patch, k: null };
    setS(next);
    checkTasks(next, how);
  };

  const setR = (r: number) => change({ r: clamp(round2(r), 0, R_MAX) }, 'r');
  const play = () => {
    const next: State = { ...s, k: 0 };
    setS(next);
    checkTasks(next, 'play');
    if (!motionAllowed()) {
      setS({ ...next, k: null });
      setLive('הטבעות נסכמו.');
      return;
    }
    setPlaying(true);
  };

  const pointerR = (e: PointerEvent): number | null => {
    const view = viewRef.current;
    if (!view) return null;
    const L = layoutOf(view.w, view.h, s.plot, s.r);
    const { box } = L.plot;
    if (e.offsetX >= box.x - 6 && e.offsetX <= box.x + box.w + 6 && e.offsetY >= box.y - 6 && e.offsetY <= box.y + box.h + 6) {
      return ((e.offsetX - box.x) / box.w) * R_MAX;
    }
    const g = L.geo;
    if (e.offsetX >= g.x && e.offsetX <= g.x + g.w && e.offsetY >= g.y && e.offsetY <= g.y + g.h) return (e.offsetX - L.sx(0)) / L.scale;
    return null;
  };
  const onPointerDown = (e: PointerEvent) => {
    const r = pointerR(e);
    if (r === null) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    setR(r);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const r = pointerR(e);
    if (r !== null) setR(r);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setR(s.r + 0.05);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setR(s.r - 0.05);
    else if (e.key === 'Enter' || e.key === ' ') play();
    else return;
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const name = s.body === 'shell' ? 'קליפה כדורית דקה' : 'כדור מלא ואחיד';
  const label = `איור חי: ${name} במסה M וברדיוס R, ונקודה P במרחק ${sci(s.r)} R מהמרכז. ${
    s.body === 'shell' ? `הקליפה חתוכה ל-${s.n} טבעות שוות מסה.` : 'הכדור בנוי משכבות.'
  } במקלדת: חצים מזיזים את P, Enter סוכם טבעת אחר טבעת.`;

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
      cursor="ew-resize"
      onReset={() => {
        setPlaying(false);
        setS(initial());
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        <>
          <span class="q" data-readout="r">
            r = <b>{signed(s.r)} R</b>
          </span>
          {s.body === 'shell' && (
            <span>
              טבעות{' '}
              <span class="q" data-readout="k">
                <b>{z.k === s.n ? String(s.n) : `${z.k}/${s.n}`}</b>
              </span>
            </span>
          )}
          {s.body === 'solid' && (
            <span class="q" data-readout="Mr">
              M(r)/M = <b>{signed(enclosedMass(1, 1, s.r))}</b>
            </span>
          )}
          <span>
            {s.body === 'shell' ? 'סכום הטבעות' : 'סכום השכבות'}{' '}
            <span class="q" data-readout="gsum">
              g = <b>{signed(z.gSum, 5e-7)} GM/R²</b>
            </span>
          </span>
          <span>
            משפט הקליפה{' '}
            <span class="q" data-readout="g">
              g = <b>{signed(z.gTheory)} GM/R²</b>
            </span>
          </span>
          {s.body === 'shell' && (
            <>
              <span>
                משיכה אל המרכז{' '}
                <span class="q" data-readout="in">
                  <b>{signed(z.inward)}</b>
                </span>
              </span>
              <span>
                משיכה מהמרכז{' '}
                <span class="q" data-readout="out">
                  <b>{signed(z.outward)}</b>
                </span>
              </span>
            </>
          )}
          <span class="q" data-readout="U">
            U/m = <b>{signed(z.uTheory)} GM/R</b>
          </span>
        </>
      }
      controls={
        <>
          {offered.length > 1 && (
            <div class="group" role="group" aria-label="איזה גוף">
              <Toggle label="קליפה דקה" on={s.body === 'shell'} onChange={() => change({ body: 'shell' }, 'body')} />
              <Toggle label="כדור מלא" on={s.body === 'solid'} onChange={() => change({ body: 'solid' }, 'body')} />
            </div>
          )}
          <Slider label="המרחק של P מהמרכז, r/R" value={s.r} min={0} max={R_MAX} step={0.01} format={(x) => `${sci(x)} R`} onChange={setR} />
          {s.body === 'shell' && (
            <Slider label="מספר הטבעות n" value={s.n} min={N_MIN} max={N_MAX} step={1} format={(x) => String(x)} onChange={(v) => change({ n: clamp(Math.round(v), N_MIN, N_MAX) }, 'n')} />
          )}
          {s.body === 'shell' && (
            <div class="group" role="group" aria-label="סכימה">
              <button type="button" class="btn primary" onClick={play}>
                סכמו טבעת אחר טבעת
              </button>
            </div>
          )}
          <div class="group" role="group" aria-label="איזה גרף">
            <Toggle label="גרף של g" on={s.plot === 'g'} swatch="var(--force)" onChange={() => change({ plot: 'g' }, 'plot')} />
            <Toggle label="גרף של U" on={s.plot === 'U'} swatch="var(--energy-p)" onChange={() => change({ plot: 'U' }, 'plot')} />
          </div>
        </>
      }
    />
  );
}
