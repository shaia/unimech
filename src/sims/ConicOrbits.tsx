/**
 * ConicOrbits (lesson 6.4): Newton's cannon, worked out. A body is launched from a fixed point at r₀ = 1.0·10⁷ m from
 * the centre of the Earth, sideways (or tilted by an angle the learner may set), at a speed the learner sets. The
 * figure draws the conic r = p/(1 + e cos θ) that the orbit equation gives — circle, ellipse, parabola or hyperbola —
 * with the Earth's centre at its focus. Solid: the path the body travels from the launch (until it returns, leaves the
 * drawing or meets the Earth's surface); dashed: the rest of the same conic. Marked: the periapsis r_p, the apoapsis
 * r_a, the semi-latus rectum p (the radius at θ = 90° from the periapsis), and, with "geometry" on, the conic's centre,
 * its second focus and major axis, or a hyperbola's asymptotes. A dashed ring is the circular orbit through the launch
 * point. The readouts give β = v₀/v_circ, ε, h, e (from ε and h), the kind, p, r_p, r_a and a.
 *
 * The second view is a double cone (half-angle α = 55°) cut by a plane at the angle ψ to the axis that gives the same
 * e: cos ψ = e cos α (src/physics/conics.ts).
 *
 * Tasks tick only in the learner's own handlers (the launch button, a speed change in the cone view); a text step sets the state and
 * never launches, so scrolling through the text never completes a task.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G_NEWTON, M_EARTH, R_EARTH } from '~/physics/constants';
import { coneCutAngle, coneSection, integrateTrajectory, launch, positionAt, sampleConic, type Launch } from '~/physics/conics';
import { circularSpeed, escapeSpeed, orbitalPeriod } from '~/physics/orbit';
import type { Vec2, Vec3 } from '~/physics/vec';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const GM = G_NEWTON * M_EARTH;
const R0 = 1.0e7;
const V_C = circularSpeed(GM, R0);
const V_ESC = escapeSpeed(GM, R0);
const V_MIN = 3000;
const V_MAX = 10400;
/** the cone of the second view: half-angle 55°, so every e up to 1/cos 55° = 1.74 has a cutting plane */
const ALPHA = (55 * Math.PI) / 180;

const TASK_LABEL: Record<string, string> = {
  circle: 'שגרו את הגוף כך שהמסלול יהיה מעגל. באיזו מהירות?',
  periapsis: 'שגרו מעט מהר יותר מהמהירות המעגלית. איפה במסלול נמצאת נקודת השיגור?',
  apoapsis: 'שגרו מעט לאט יותר מהמהירות המעגלית, בלי לפגוע בכדור הארץ. איפה עכשיו נקודת השיגור?',
  escape: 'שגרו גוף שלא חוזר, באקסצנטריות 1 או יותר. מה האנרגיה שלו?',
  tilt: 'שגרו באותה מהירות, אבל בזווית לכיוון הצידי. מה השתנה ב-a, ומה ב-e?',
  cone: 'עברו לתצוגת החרוט ושנו את מהירות השיגור. איך נוטה המישור החותך כשהמסלול פרבולה?',
};

const KIND_HE: Record<Launch['el']['kind'], string> = { circle: 'מעגל', ellipse: 'אליפסה', parabola: 'פרבולה', hyperbola: 'היפרבולה' };

export interface ConicOrbitsProps {
  id: string;
  /** launch speed [km/s] at the start */
  v?: number;
  /** launch angle from the sideways direction [deg], positive outward */
  phi?: number;
  /** offer the angle slider */
  angle?: boolean;
  /** start in the cone view */
  view?: 'orbit' | 'cone';
  /** draw the centre, second focus, axes and asymptotes */
  geometry?: boolean;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

interface Setup {
  /** launch speed [m/s] */
  v: number;
  /** launch angle [rad] */
  phi: number;
}

interface Run {
  n: number;
  samples: { t: number; x: number; y: number }[];
  end: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const deg = (r: number) => (r * 180) / Math.PI;
/** A readout number: 3 significant figures and a true minus sign. */
const signed = (x: number) => (Number.isFinite(x) ? sci(x, 3).replace('-', '−') : '∞');

/** A speed from a step: a number [km/s], or 'circular' / 'escape' for the exact speeds. */
function speedOf(x: unknown): number | null {
  if (x === 'circular') return V_C;
  if (x === 'escape') return V_ESC;
  const n = num(x);
  return n === null ? null : clamp(n * 1000, V_MIN, V_MAX);
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

/** A symbol with a true subscript, centred at x, with a paper halo. */
function subText(ctx: CanvasRenderingContext2D, p: Palette, base: string, sub: string, x: number, y: number, size: number, color: string) {
  const fBase = `italic 700 ${size}px ${p.fontUi}`;
  const fSub = `italic 700 ${Math.round(size * 0.72)}px ${p.fontUi}`;
  ctx.save();
  ctx.font = fBase;
  const wb = ctx.measureText(base).width;
  ctx.font = fSub;
  const ws = ctx.measureText(sub).width;
  ctx.restore();
  const x0 = x - (wb + ws + 1) / 2;
  haloText(ctx, p, base, x0, y, { font: fBase, color, align: 'left' });
  haloText(ctx, p, sub, x0 + wb + 1, y + size * 0.3, { font: fSub, color, align: 'left' });
}

/** Rotate a perifocal point by the periapsis angle into the figure's frame. */
const rot = (q: Vec2, a: number): Vec2 => [q[0] * Math.cos(a) - q[1] * Math.sin(a), q[0] * Math.sin(a) + q[1] * Math.cos(a)];

export default function ConicOrbits(props: ConicOrbitsProps) {
  const initialSetup = (): Setup => ({ v: speedOf(props.v) ?? V_C, phi: ((props.phi ?? 0) * Math.PI) / 180 });
  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [view, setView] = useState<'orbit' | 'cone'>(props.view ?? 'orbit');
  const [geometry, setGeometry] = useState(props.geometry ?? true);
  const [flying, setFlying] = useState<Run | null>(null);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  const count = useRef(0);
  const landed = useRef(0);

  const L = useMemo(() => launch(GM, R0, setup.v, setup.phi), [setup.v, setup.phi]);
  const bound = L.el.e < 1 && L.el.kind !== 'parabola';
  const path = useMemo(() => {
    const T = bound ? orbitalPeriod(GM, L.el.a) : 4e5;
    return integrateTrajectory(GM, L.state, { tMax: T, rMax: 9 * R0, rMin: R_EARTH, eta: 0.01 });
  }, [L]);
  const hits = path.hit === 'surface';

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the speed, the angle, the view and the marks; they never launch and never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setFlying(null);
        setSetup((prev) => ({
          v: speedOf(st.v) ?? prev.v,
          phi: num(st.phi) !== null ? clamp(((st.phi as number) * Math.PI) / 180, -Math.PI / 3, Math.PI / 3) : prev.phi,
        }));
        if (st.view === 'orbit' || st.view === 'cone') setView(st.view);
        const g = bool(st.geometry);
        if (g !== null) setGeometry(g);
      }),
    [props.id],
  );

  const describe = (): string => {
    const kind = KIND_HE[L.el.kind];
    if (hits) return `הגוף שוגר במהירות ${sci(setup.v / 1000)} קילומטר לשנייה. המסלול ${kind}, והגוף פגע בכדור הארץ.`;
    if (!bound) return `הגוף שוגר במהירות ${sci(setup.v / 1000)} קילומטר לשנייה, נע ב${kind} ולא חוזר.`;
    return `הגוף שוגר במהירות ${sci(setup.v / 1000)} קילומטר לשנייה, הקיף את כדור הארץ ב${kind} עם אקסצנטריות ${sci(L.el.e)} וחזר לנקודת השיגור.`;
  };

  const land = (r: Run) => {
    if (landed.current === r.n) return;
    landed.current = r.n;
    setFlying(null);
    setLive(describe());
  };

  const fire = () => {
    const n = ++count.current;
    t0.current = null;
    const r: Run = { n, samples: path.samples, end: path.samples[path.samples.length - 1].t };
    const sideways = Math.abs(setup.phi) < 1e-9;
    if (L.el.e < 0.01 && sideways) done('circle');
    if (sideways && bound && !hits && L.el.e >= 0.03 && setup.v > V_C) done('periapsis');
    if (sideways && bound && !hits && L.el.e >= 0.03 && setup.v < V_C) done('apoapsis');
    if (L.el.e >= 0.995) done('escape');
    if (!sideways && Math.abs(setup.phi) >= (5 * Math.PI) / 180) done('tilt');
    if (!motionAllowed()) {
      land(r);
      return;
    }
    setFlying(r);
    setLive('הגוף נע.');
  };

  /* ---------------------------------------------------------------- drawing */

  /**
   * The drawing fits what matters: the circle through the launch point, the whole ellipse (up to 9 r₀), or an open
   * conic within 3.2 r₀ of the focus. The scale follows the orbit; the dashed ring at r₀ keeps it readable.
   */
  const fit = useMemo(() => {
    const pa = L.el.periapsisAngle;
    const pts = sampleConic(L.el.p, L.el.e, bound ? 9 * R0 : 3.2 * R0, 240).map((q) => rot(q, pa));
    pts.push([R0, 0], [-R0, 0], [0, R0], [0, -R0], [R0, 0.9 * R0]);
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }, [L]);

  const frameOf = (w: number, h: number) => {
    const pad = 0.1;
    const dx = (fit.x1 - fit.x0) * (1 + 2 * pad);
    const dy = (fit.y1 - fit.y0) * (1 + 2 * pad);
    const k = Math.max(1e-12, Math.min(w / dx, Math.max(1, h - 30) / dy));
    const cxw = (fit.x0 + fit.x1) / 2;
    const cyw = (fit.y0 + fit.y1) / 2;
    const S = (q: Vec2): [number, number] => [w / 2 + (q[0] - cxw) * k, h / 2 + 12 - (q[1] - cyw) * k];
    return { k, S };
  };

  const drawOrbit = ({ ctx, view: v, palette: p, t }: FrameInfo) => {
    const narrow = v.w < 520;
    const fs = narrow ? 11 : 13;
    const { k, S } = frameOf(v.w, v.h);
    const pa = L.el.periapsisAngle;
    const g = L.geo;
    const rMaxDraw = 12 * R0;

    // the circular orbit through the launch point, faint dashed
    {
      const [x, y] = S([0, 0]);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink3, 0.8);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(x, y, R0 * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // geometry: the major axis, the centre and the second focus of an ellipse; the asymptotes of a hyperbola
    if (geometry && L.el.kind !== 'circle') {
      const u = rot([1, 0], pa);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink2, 0.6);
      ctx.lineWidth = 1;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      const far = 20 * R0;
      const a1 = S([u[0] * far, u[1] * far]);
      const a2 = S([-u[0] * far, -u[1] * far]);
      ctx.moveTo(a1[0], a1[1]);
      ctx.lineTo(a2[0], a2[1]);
      ctx.stroke();
      if (L.el.kind === 'hyperbola' && g.thetaInf !== null) {
        ctx.strokeStyle = withAlpha(p.accent, 0.7);
        const c = rot([g.centreX, 0], pa);
        for (const s of [1, -1]) {
          const d = rot([Math.cos(s * g.thetaInf), Math.sin(s * g.thetaInf)], pa);
          const b1 = S([c[0] - d[0] * far, c[1] - d[1] * far]);
          const b2 = S([c[0] + d[0] * far, c[1] + d[1] * far]);
          ctx.beginPath();
          ctx.moveTo(b1[0], b1[1]);
          ctx.lineTo(b2[0], b2[1]);
          ctx.stroke();
        }
      }
      ctx.restore();
      if (L.el.kind === 'ellipse') {
        const c = S(rot([g.centreX, 0], pa));
        const f2 = S(rot([2 * g.centreX, 0], pa));
        ctx.save();
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(c[0] - 5, c[1]);
        ctx.lineTo(c[0] + 5, c[1]);
        ctx.moveTo(c[0], c[1] - 5);
        ctx.lineTo(c[0], c[1] + 5);
        ctx.stroke();
        ctx.fillStyle = p.paper;
        ctx.beginPath();
        ctx.arc(f2[0], f2[1], 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        // the focus is named below its dot; the centre and the second focus beside the major axis, on the side away
        // from the focus's name, each only when it stands clear of the names already drawn
        const o = S([0, 0]);
        const ax = rot([1, 0], pa);
        let nx = ax[1];
        let ny = ax[0];
        if (ny > 0) {
          nx = -nx;
          ny = -ny;
        }
        const off = narrow ? 15 : 17;
        const fsH = narrow ? 12 : 14;
        // a centred label pushed off the axis: clear of it by `off` vertically, by half its width sideways
        const beside = (label: string, x: number, y: number) => {
          ctx.save();
          ctx.font = `500 ${fsH}px ${p.fontHand}`;
          const half = ctx.measureText(label).width / 2;
          ctx.restore();
          handNote(ctx, label, x + nx * (half + 6), y + ny * off, p, fsH);
        };
        if (Math.hypot(c[0] - o[0], c[1] - o[1]) > 16) beside('מרכז', c[0], c[1]);
        if (Math.hypot(f2[0] - c[0], f2[1] - c[1]) > 44) beside('מוקד שני', f2[0], f2[1]);
      }
    }

    // the Earth, its centre the focus
    {
      const [x, y] = S([0, 0]);
      ctx.save();
      ctx.fillStyle = withAlpha(p.energyP, 0.18);
      ctx.strokeStyle = withAlpha(p.energyP, 0.75);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, R_EARTH * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      handNote(ctx, 'מוקד', x, y + 13, p, narrow ? 12 : 14);
    }

    // the conic: dashed whole, then the travelled path solid
    {
      const pts = sampleConic(L.el.p, L.el.e, rMaxDraw, 720).map((q) => S(rot(q, pa)));
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink, 0.45);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      pts.forEach((q, i) => (i === 0 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1])));
      if (bound) ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      path.samples.forEach((s, i) => {
        const q = S([s.x, s.y]);
        if (i === 0) ctx.moveTo(q[0], q[1]);
        else ctx.lineTo(q[0], q[1]);
      });
      ctx.stroke();
      ctx.restore();
    }

    // p: from the focus, perpendicular to the major axis, to the orbit (θ = 90° from the periapsis)
    if (L.el.kind !== 'circle') {
      const end = S(rot([0, L.el.p], pa));
      const o = S([0, 0]);
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(o[0], o[1]);
      ctx.lineTo(end[0], end[1]);
      ctx.stroke();
      ctx.restore();
      // the label beside the segment's middle, on the side away from the periapsis
      const len = Math.max(1, Math.hypot(end[0] - o[0], end[1] - o[1]));
      const nx = -(end[1] - o[1]) / len;
      const ny = (end[0] - o[0]) / len;
      const toward = S(rot([1, 0], pa));
      const side = (toward[0] - o[0]) * nx + (toward[1] - o[1]) * ny > 0 ? -1 : 1;
      const mid: [number, number] = [(o[0] + end[0]) / 2 + side * nx * 11, (o[1] + end[1]) / 2 + side * ny * 11];
      haloText(ctx, p, 'p', mid[0], mid[1], { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.accent });
    }

    // the apsides
    const apsis = (r: number, ang: number, sub: string) => {
      const q = S(rot([r, 0], ang));
      if (q[0] < -20 || q[0] > v.w + 20 || q[1] < -20 || q[1] > v.h + 20) return;
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(q[0], q[1], 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const out = rot([1, 0], ang);
      const lx = q[0] + out[0] * 16;
      const ly = q[1] - out[1] * 16 + (Math.abs(out[1]) < 0.3 ? 14 : 0);
      subText(ctx, p, 'r', sub, lx, ly, fs + 1, p.ink);
    };
    if (L.el.kind !== 'circle') {
      apsis(g.rp, pa, 'p');
      if (bound) apsis(g.ra, pa + Math.PI, 'a');
    }

    // the launch point and the launch velocity
    {
      const q = S([R0, 0]);
      const dir: Vec2 = [Math.sin(setup.phi), Math.cos(setup.phi)];
      const len = Math.max(18, (setup.v / V_MAX) * 0.16 * v.w);
      arrow(ctx, q[0], q[1], q[0] + dir[0] * len, q[1] - dir[1] * len, { color: p.velocity, width: 2.4, head: 9 });
      haloText(ctx, p, 'v₀', q[0] + dir[0] * len + 12, q[1] - dir[1] * len, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.velocity, align: 'left' });
    }

    // the body: at the launch point, or moving
    {
      let pos: Vec2 = [R0, 0];
      if (flying) {
        if (t0.current === null) t0.current = t;
        const rate = flying.end / 6; // a launch plays in 6 seconds
        const now = Math.min((t - t0.current) * rate, flying.end);
        pos = positionAt(flying.samples, now);
        if (now >= flying.end) land(flying);
      }
      const q = S(pos);
      ctx.save();
      ctx.fillStyle = p.accent;
      ctx.strokeStyle = p.paper;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(q[0], q[1], narrow ? 5.5 : 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // the kind, top left
    haloText(ctx, p, `e = ${signed(L.el.e)}`, 12, 16, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.ink, align: 'left' });
    handNote(ctx, hits ? `${KIND_HE[L.el.kind]}: פוגע בכדור הארץ` : KIND_HE[L.el.kind], narrow ? 95 : 130, 40, p, narrow ? 13 : 15);
  };

  /* ---------------- the cone view: an oblique projection of the double cone and the cutting plane */
  const drawCone = ({ ctx, view: v, palette: p }: FrameInfo) => {
    const narrow = v.w < 520;
    const fs = narrow ? 11 : 13;
    const H = 1;
    const tMax = H / Math.cos(ALPHA);
    const scale = Math.min(v.w / (2 * Math.tan(ALPHA) * H * 1.8), v.h / (2 * H * 1.3));
    // the viewer looks along +x (rotated by ζ about the axis) from slightly above: the cutting plane, tilted in the
    // xz-plane, shows its full width along y, so no cut is seen edge-on
    const zeta = (25 * Math.PI) / 180;
    const el = (16 * Math.PI) / 180;
    const P = (q: Vec3): [number, number] => {
      const sx = q[1] * Math.cos(zeta) - q[0] * Math.sin(zeta);
      const d = q[0] * Math.cos(zeta) + q[1] * Math.sin(zeta);
      const sy = q[2] * Math.cos(el) + d * Math.sin(el);
      return [v.w / 2 + sx * scale, v.h / 2 - sy * scale];
    };
    const psiCut = coneCutAngle(L.el.e, ALPHA);
    // the cone: rims and generators
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink2, 0.55);
    ctx.lineWidth = 1;
    for (const z of [H, -H]) {
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const f = (2 * Math.PI * i) / 96;
        const q = P([z * Math.tan(ALPHA) * Math.cos(f), z * Math.tan(ALPHA) * Math.sin(f), z]);
        if (i === 0) ctx.moveTo(q[0], q[1]);
        else ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha(p.ink3, 0.6);
    for (let i = 0; i < 16; i++) {
      const f = (2 * Math.PI * i) / 16;
      const a = P([H * Math.tan(ALPHA) * Math.cos(f), H * Math.tan(ALPHA) * Math.sin(f), H]);
      const b = P([-H * Math.tan(ALPHA) * Math.cos(f), -H * Math.tan(ALPHA) * Math.sin(f), -H]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.restore();
    if (psiCut === null) {
      handNote(ctx, 'אין מישור שחותך את החרוט הזה באקסצנטריות כזו', v.w / 2, 22, p, narrow ? 12 : 14);
      return;
    }
    const d = 0.55 * H;
    const n: Vec3 = [-Math.cos(psiCut), 0, Math.sin(psiCut)];
    const u1: Vec3 = [Math.sin(psiCut), 0, Math.cos(psiCut)];
    const c0: Vec3 = [n[0] * d, n[1] * d, n[2] * d];
    // the plane, cut to the height of the cone (s runs along the plane's tilted direction, z = c0z + s cos ψ)
    const S2 = 1.05 * H * Math.tan(ALPHA);
    const zc = Math.cos(psiCut);
    const sLo = zc > 1e-6 ? Math.max(-1.1 * tMax, (-1.08 * H - c0[2]) / zc) : -1.1 * tMax;
    const sHi = zc > 1e-6 ? Math.min(1.1 * tMax, (1.08 * H - c0[2]) / zc) : 1.1 * tMax;
    const corner = (s: number, w: number): [number, number] => P([c0[0] + s * u1[0], c0[1] + w, c0[2] + s * u1[2]]);
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.13);
    ctx.strokeStyle = withAlpha(p.accent, 0.6);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const cs = [corner(sLo, -S2), corner(sHi, -S2), corner(sHi, S2), corner(sLo, S2)];
    cs.forEach((q, i) => (i === 0 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1])));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // the cut
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    for (const br of coneSection(ALPHA, psiCut, d, tMax, 720)) {
      ctx.beginPath();
      br.forEach((q, i) => {
        const s = P(q);
        if (i === 0) ctx.moveTo(s[0], s[1]);
        else ctx.lineTo(s[0], s[1]);
      });
      ctx.stroke();
    }
    ctx.restore();
    haloText(ctx, p, `e = ${signed(L.el.e)}    ψ = ${deg(psiCut).toFixed(1)}°    α = 55°`, 12, 16, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink, align: 'left' });
    handNote(ctx, KIND_HE[L.el.kind], narrow ? 60 : 80, 40, p, narrow ? 13 : 15);
  };

  const draw = (f: FrameInfo) => {
    // before the stage has its size (a hidden or collapsed box) there is nothing to draw
    if (f.view.w < 60 || f.view.h < 60) return;
    if (view === 'orbit') drawOrbit(f);
    else drawCone(f);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1, animate: flying !== null });
  useEffect(invalidate, [setup, view, geometry, flying, L]);

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

  /** a change of speed or angle by the learner (never by a step): in the cone view it ticks the cone task */
  const change = (f: (s: Setup) => Setup) => {
    setFlying(null);
    setSetup((s) => f(s));
    if (view === 'cone') done('cone');
  };
  const setV = (vkm: number) => change((s) => ({ ...s, v: clamp(Math.round(vkm * 100) * 10, V_MIN, V_MAX) }));
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') fire();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setV(setup.v / 1000 + 0.05);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setV(setup.v / 1000 - 0.05);
    else return;
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const g = L.geo;
  const label = `איור חי: שיגור גוף מנקודה במרחק ${sci(R0)} מטר ממרכז כדור הארץ, במהירות ${sci(setup.v / 1000)} קילומטר לשנייה${
    setup.phi !== 0 ? ` ובזווית ${Math.round(deg(setup.phi))} מעלות מהכיוון הצידי` : ''
  }. המסלול ${KIND_HE[L.el.kind]} עם אקסצנטריות ${sci(L.el.e)}${hits ? ', והגוף פוגע בכדור הארץ' : ''}. במקלדת: חצים משנים את המהירות, Enter משגר.`;

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
        setView(props.view ?? 'orbit');
        setGeometry(props.geometry ?? true);
        setFlying(null);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        <>
          <span class="q" data-readout="v">
            v₀ = <b>{signed(setup.v / 1000)} km/s</b>
          </span>
          <span class="q" data-readout="beta">
            v₀/v<sub>c</sub> = <b>{signed(L.beta)}</b>
          </span>
          <span class="q" data-readout="eps">
            ε = <b>{signed(Math.abs(L.el.eps) < 1e-9 * V_C * V_C ? 0 : L.el.eps)} J/kg</b>
          </span>
          <span class="q" data-readout="h">
            h = <b>{signed(L.el.h)} m²/s</b>
          </span>
          <span class="q" data-readout="e">
            e = √(1 + 2εh²/(GM)²) = <b>{signed(L.el.e)}</b>
          </span>
          <span data-readout="kind">
            <b>{KIND_HE[L.el.kind]}</b>
            {hits ? ' (פוגע בכדור הארץ)' : ''}
          </span>
          <span class="q" data-readout="p">
            p = <b>{signed(L.el.p)} m</b>
          </span>
          <span class="q" data-readout="rp">
            r<sub>p</sub> = <b>{signed(g.rp)} m</b>
          </span>
          <span class="q" data-readout="ra">
            r<sub>a</sub> = <b>{signed(g.ra)} m</b>
          </span>
          <span class="q" data-readout="a">
            a = <b>{signed(g.a)} m</b>
          </span>
        </>
      }
      controls={
        <>
          <Slider label="מהירות השיגור" value={Math.round(setup.v / 10) / 100} min={V_MIN / 1000} max={V_MAX / 1000} step={0.01} format={(x) => `${sci(x)} km/s`} onChange={setV} />
          {props.angle && (
            <Slider
              label="זווית השיגור מהכיוון הצידי"
              value={Math.round(deg(setup.phi))}
              min={-60}
              max={60}
              step={1}
              format={(x) => `${x}°`}
              onChange={(x) => change((s) => ({ ...s, phi: (clamp(Math.round(x), -60, 60) * Math.PI) / 180 }))}
            />
          )}
          <div class="group" role="group" aria-label="מהירויות מיוחדות">
            <button type="button" class="btn" onClick={() => change((s) => ({ ...s, v: V_C }))}>
              מהירות מעגלית
            </button>
            <button type="button" class="btn" onClick={() => change((s) => ({ ...s, v: V_ESC }))}>
              מהירות מילוט
            </button>
            <button type="button" class="btn primary" onClick={fire}>
              שגרו
            </button>
          </div>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="מסלול" on={view === 'orbit'} onChange={() => setView('orbit')} />
            <Toggle
              label="חרוט"
              on={view === 'cone'}
              onChange={() => setView('cone')}
            />
            <Toggle label="מרכז, צירים ואסימפטוטות" on={geometry} onChange={(on) => setGeometry(on)} />
          </div>
        </>
      }
    />
  );
}
