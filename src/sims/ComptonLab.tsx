/**
 * ComptonLab (lesson 10.4): photons and the mass defect, in two modes.
 *
 * mode 'compton' (fig-10-4a): a photon of energy E moving along +x scatters off a free electron at rest. Top left
 * (on a phone: top), the scattering seen from above: the incoming photon as a wave along +x, the scattered photon
 * leaving at the scattering angle θ, drawn with its wavelength to scale relative to the incoming one (λ′/λ = E/E′),
 * and the recoil electron's direction at φ below the axis. Top right (on a phone: middle), the momentum triangle
 * p = p′ + pₑ (as pc, in MeV), to scale, with the dashed curve on which the tip of p′ lies at this E for every θ
 * (an ellipse with a focus where the p and p′ arrows start). Bottom: λ and λ′ on one ruler (the ruler's end is λ + 2λ_C, the most
 * λ′ can be at this E), and the split E = E′ + K. Controls: θ (0°–180°), E (eight values, 0.010–2.00 MeV), the
 * curve on or off.
 *
 * mode 'binding' (fig-10-4b): two energy bars on one axis: the free parts at rest (top) and the bound system
 * (bottom), for a deuteron, a helium-4 nucleus, the fusion d + d → ⁴He (before and after) or a hydrogen atom. The
 * missing piece of the bottom bar is the binding energy B = Δm·c² (for the reaction, the energy released Q). By
 * default the axis is cut ("zoom", break marks at its left) so that B is a quarter of what is shown; "קנה מידה מלא"
 * draws the bars from zero, where B is far less than a pixel.
 *
 * Physics: src/physics/photon.ts (compton, scatteredEnergy, comptonWavelength, bindingEnergy, REST_MEV). Rest
 * energies are the data the lesson states; λ is drawn from λ = λ_C·mₑc²/E, so Δλ = λ_C(1 − cos θ) holds exactly.
 *
 * Props (Astro wrapper: <Spread fig="fig-10-4a" figure={ComptonLab} figureProps={{ … }}>)
 *   id       figure id (Spread passes it); tasks are `${id}:${task}`
 *   mode     'compton' (default) | 'binding'
 *   E        photon energy [MeV], snapped to the nearest of ENERGIES (default 0.511)
 *   theta    scattering angle [°], 0–180 in steps of 5 (default 90)
 *   locus    draw the curve of the tip of p′ (default true)
 *   sys      'deuteron' (default) | 'helium' | 'fusion' | 'atom'
 *   full     full scale instead of the zoomed axis (default false)
 *   tasks    task ids to show (below)
 *
 * Step `set` keys: E, theta, locus (compton); sys, full (binding). A step never ticks a task.
 *
 * Tasks, ticked only inside the learner's own handlers:
 *   forward     the learner sets θ = 0°
 *   back        the learner sets θ = 180°
 *   soft        with E ≤ 0.020 MeV, θ ≥ 90° (set by the learner in either order)
 *   same-shift  the learner changes E while θ ≥ 30°: Δλ stays the same
 *   full        the learner switches to full scale
 *   atom        the learner picks the hydrogen atom
 *   fusion      the learner picks the fusion reaction
 */

import { useEffect, useState } from 'preact/hooks';
import { REST_MEV, bindingEnergy, compton, comptonWavelength, scatteredEnergy, type ComptonEvent } from '~/physics/photon';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import { niceTicks } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type ComptonLabMode = 'compton' | 'binding';
export type BindingSystem = 'deuteron' | 'helium' | 'fusion' | 'atom';

export interface ComptonLabProps {
  id: string;
  mode?: ComptonLabMode;
  E?: number;
  theta?: number;
  locus?: boolean;
  sys?: BindingSystem;
  full?: boolean;
  tasks?: string[];
}

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside, so it reads left to right in Hebrew. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  forward: `הזיזו את זווית הפיזור ל-${ltr('θ = 0°')}. מה האלקטרון מקבל?`,
  back: `מצאו את הזווית שבה האלקטרון מקבל את האנרגיה הקינטית הגדולה ביותר. מה ${ltr('Δλ')} שם?`,
  soft: `בחרו פוטון רך, ${ltr('E ≤ 0.020 MeV')}, וזווית של ${ltr('90°')} או יותר. בכמה אחוזים השתנה אורך הגל?`,
  'same-shift': `בזווית קבועה (לפחות ${ltr('30°')}), שנו את אנרגיית הפוטון. מה קורה ל-${ltr('Δλ')}, ומה ליחס ${ltr('λ′/λ')}?`,
  full: 'עברו לקנה מידה מלא. האם רואים עכשיו את המסה החסרה?',
  atom: 'בחרו באטום המימן. איזה חלק ממסת האטום חסר?',
  fusion: `בחרו בהיתוך ${ltr('d + d → ⁴He')}. מאיפה באה האנרגיה שמשתחררת?`,
};

/** the photon energies offered [MeV] */
const ENERGIES = [0.01, 0.02, 0.05, 0.1, 0.2, 0.511, 1.0, 2.0];
const ME = REST_MEV.electron;
/** λ_C [pm]; λ = λ_C·mₑc²/E keeps Δλ = λ_C(1 − cos θ) exact in the figure */
const LC_PM = comptonWavelength() * 1e12;
const DEG = Math.PI / 180;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const nearestIndex = (E: number) => ENERGIES.reduce((best, e, i) => (Math.abs(Math.log(e / E)) < Math.abs(Math.log(ENERGIES[best] / E)) ? i : best), 0);
const snapTheta = (t: number) => clamp(Math.round(t / 5) * 5, 0, 180);
/** 3 significant figures, a true minus sign, no "−0" */
const num = (x: number, sig = 3) => (Math.abs(x) < 1e-12 ? '0' : sci(x, sig).replace('-', '−'));
const lambdaPm = (E: number) => (LC_PM * ME) / E;

/* ================================================================== drawing helpers */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TextOpts {
  color?: string;
  size?: number;
  italic?: boolean;
  align?: CanvasTextAlign;
  weight?: number;
}

function mathText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: TextOpts = {}): number {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${o.italic === false ? '' : 'italic '}${o.weight ?? 700} ${o.size ?? 14}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: TextOpts = {}): number {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = o.align ?? 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `${o.weight ?? 600} ${o.size ?? 13}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink2;
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

function panel(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, alpha: number) {
  ctx.save();
  ctx.fillStyle = withAlpha(p.paper2, alpha);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

/** A photon: a sine wave of wavelength `wl` px from (x, y) along the unit direction (ux, uy) for L px, with a head. */
function photon(ctx: CanvasRenderingContext2D, x: number, y: number, ux: number, uy: number, L: number, wl: number, color: string, alpha = 1) {
  const amp = 5;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const end = L - 9;
  for (let s = 0; s <= end; s += 1) {
    const taper = Math.min(1, s / 10, (end - s) / 10);
    const off = amp * taper * Math.sin((2 * Math.PI * s) / wl);
    const px = x + ux * s - uy * off;
    const py = y + uy * s + ux * off;
    if (s === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
  arrow(ctx, x + ux * (end - 4), y + uy * (end - 4), x + ux * L, y + uy * L, { color, width: 2, head: 9, alpha });
}

function angleArc(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number, a0: number, a1: number, color: string) {
  // angles in physics convention (counter-clockwise from +x, y up); the canvas y is down
  if (Math.abs(a1 - a0) < 1e-6) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, r, -a0, -a1, a1 > a0);
  ctx.stroke();
  ctx.restore();
}

/** keep the canvas aspect in step with its width: taller on a phone */
function useAspect(canvasRef: { current: HTMLCanvasElement | null }, wide: number, narrow: number, set: (a: number) => void) {
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => set(el.getBoundingClientRect().width < 520 ? narrow : wide));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
}

/* ================================================================== the component */

export default function ComptonLab(props: ComptonLabProps) {
  return props.mode === 'binding' ? <Binding {...props} /> : <Compton {...props} />;
}

/* ------------------------------------------------------------------ Compton scattering */

interface CState {
  ei: number;
  theta: number;
  locus: boolean;
}

function cInitial(p: ComptonLabProps): CState {
  return { ei: nearestIndex(p.E ?? ME), theta: snapTheta(p.theta ?? 90), locus: p.locus ?? true };
}

function cDescribe(s: CState): string {
  const E = ENERGIES[s.ei];
  const ev = compton(E, s.theta * DEG);
  return `פוטון באנרגיה ${num(E)} MeV נפזר מאלקטרון חופשי ונייח בזווית ${s.theta} מעלות. הפוטון המפוזר: ${num(ev.Ep)} MeV, אורך הגל גדל ב-${num(LC_PM * (1 - Math.cos(s.theta * DEG)))} פיקומטר. האלקטרון מקבל אנרגיה קינטית ${num(ev.K)} MeV ונע בזווית ${num(ev.phi / DEG)} מעלות מתחת לכיוון המקורי.`;
}

function Compton(props: ComptonLabProps) {
  const [s, setS] = useState<CState>(() => cInitial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t) ?? false;
  const done = (t: string) => markTask(`${props.id}:${t}`);

  /** a change the learner made: apply it, then judge the tasks it may complete (never from an effect or a step) */
  const change = (patch: Partial<CState>, cause: 'theta' | 'energy' | 'toggle') => {
    const next = { ...s, ...patch };
    setS(next);
    if (has('forward') && cause === 'theta' && next.theta === 0) done('forward');
    if (has('back') && cause === 'theta' && next.theta === 180) done('back');
    if (has('soft') && cause !== 'toggle' && ENERGIES[next.ei] <= 0.02 + 1e-12 && next.theta >= 90) done('soft');
    if (has('same-shift') && cause === 'energy' && next.ei !== s.ei && next.theta >= 30) done('same-shift');
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.E === 'number') next.ei = nearestIndex(st.E);
          if (typeof st.theta === 'number') next.theta = snapTheta(st.theta);
          if (typeof st.locus === 'boolean') next.locus = st.locus;
          return next;
        });
      }),
    [props.id],
  );

  useEffect(() => {
    const h = setTimeout(() => setLive(cDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.ei, s.theta]);

  const [aspect, setAspect] = useState(1.5);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintCompton(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1 / aspect, animate: false });
  useAspect(canvasRef, 1.5, 0.6, setAspect);
  useEffect(invalidate, [s, aspect]);

  const reset = () => {
    setS(cInitial(props));
    setLive('האיור אופס.');
  };

  const E = ENERGIES[s.ei];
  const ev = compton(E, s.theta * DEG);
  const dl = LC_PM * (1 - Math.cos(s.theta * DEG));
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: פיזור קומפטון. ${cDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="E">
            פוטון פוגע: <b class="q" dir="ltr">E = {num(E)} MeV, λ = {num(lambdaPm(E))} pm</b>
          </span>
          <span data-readout="Ep">
            פוטון מפוזר: <b class="q" dir="ltr">E′ = {num(ev.Ep)} MeV, λ′ = {num(lambdaPm(ev.Ep))} pm</b>
          </span>
          <span data-readout="dl">
            השינוי באורך הגל: <b class="q" dir="ltr">Δλ = {num(dl)} pm</b>
          </span>
          <span data-readout="K">
            אלקטרון: <b class="q" dir="ltr">K = {num(ev.K)} MeV, φ = {ev.K === 0 ? '—' : `${num(ev.phi / DEG)}°`}</b>
          </span>
          <span data-readout="ratio">
            יחס אורכי הגל: <b class="q" dir="ltr">λ′/λ = {num(E / ev.Ep)}</b>
          </span>
        </>
      }
      controls={
        <>
          <Slider
            label="זווית הפיזור של הפוטון"
            min={0}
            max={180}
            step={5}
            value={s.theta}
            format={(x) => `${Math.round(x)}°`}
            onChange={(x) => change({ theta: snapTheta(x) }, 'theta')}
          />
          <Slider
            label="אנרגיית הפוטון הפוגע"
            min={0}
            max={ENERGIES.length - 1}
            step={1}
            value={s.ei}
            format={(i) => `${num(ENERGIES[Math.round(i)])} MeV`}
            onChange={(i) => change({ ei: clamp(Math.round(i), 0, ENERGIES.length - 1) }, 'energy')}
          />
          <div class="group" role="group" aria-label="מה לצייר">
            <Toggle label="העקומה של קצה התנע של הפוטון המפוזר" on={s.locus} onChange={(on) => change({ locus: on }, 'toggle')} />
          </div>
        </>
      }
    />
  );
}

function paintCompton(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: CState) {
  const { w, h } = view;
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, w, h);
  const narrow = w < 520;
  const stripH = narrow ? 92 : 84;
  const top = h - stripH;
  const scene: Rect = narrow ? { x: 0, y: 0, w, h: top * 0.5 } : { x: 0, y: 0, w: w * 0.5, h: top };
  const tri: Rect = narrow ? { x: 0, y: top * 0.5, w, h: top * 0.5 } : { x: w * 0.5, y: 0, w: w * 0.5, h: top };
  const strip: Rect = { x: 0, y: top, w, h: stripH };
  const E = ENERGIES[s.ei];
  const ev = compton(E, s.theta * DEG);
  paintScene(ctx, p, scene, ev, !narrow);
  paintTriangle(ctx, p, tri, ev, s.locus, narrow);
  paintStrip(ctx, p, strip, ev);
}

function paintScene(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, ev: ComptonEvent, wide: boolean) {
  panel(ctx, p, r, 0.35);
  heText(ctx, p, 'הפיזור', r.x + r.w - (wide ? 10 : 90), r.y + 14, { size: 13, weight: 700, color: p.ink });
  const ex = r.x + r.w * 0.46;
  const ey = r.y + r.h * 0.55;
  const L = Math.min(r.w * 0.42, r.h * 0.42);
  const wl0 = 14; // the incoming wavelength, in px
  // the reference line: the incoming direction, continued
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex + L, ey);
  ctx.stroke();
  ctx.restore();
  // incoming photon along +x
  const inLen = ex - 12 - (r.x + 12);
  photon(ctx, r.x + 12, ey, 1, 0, inLen, wl0, p.accent, ev.theta > 170 * DEG ? 0.45 : 1);
  mathText(ctx, p, 'γ', r.x + 22, ey - 16, { color: p.accent });
  // scattered photon at θ above the axis (canvas y down)
  const ux = Math.cos(ev.theta);
  const uy = -Math.sin(ev.theta);
  const wl1 = (wl0 * ev.E) / ev.Ep;
  photon(ctx, ex + ux * 10, ey + uy * 10, ux, uy, L, wl1, p.accent);
  mathText(ctx, p, 'γ′', ex + ux * (L + 16), ey + uy * (L + 16) - (Math.abs(uy) < 0.2 ? 12 : 0), { color: p.accent });
  angleArc(ctx, p, ex, ey, 28, 0, ev.theta, p.accent);
  if (ev.theta > 8 * DEG) {
    const a = ev.theta / 2;
    mathText(ctx, p, 'θ', ex + 42 * Math.cos(a), ey - 42 * Math.sin(a), { size: 13, color: p.accent });
  }
  // recoil electron at φ below the axis
  if (ev.K > 1e-12 * ev.E) {
    const vx = Math.cos(ev.phi);
    const vy = Math.sin(ev.phi);
    arrow(ctx, ex, ey, ex + vx * L * 0.8, ey + vy * L * 0.8, { color: p.momentum, width: 2.5, head: 10 });
    mathText(ctx, p, 'e⁻', ex + vx * (L * 0.8 + 14), ey + vy * (L * 0.8 + 12), { color: p.momentum, size: 13 });
    angleArc(ctx, p, ex, ey, 40, -ev.phi, 0, p.momentum);
    const a = -ev.phi / 2;
    if (ev.phi > 6 * DEG) mathText(ctx, p, 'φ', ex + 54 * Math.cos(a), ey - 54 * Math.sin(a), { size: 13, color: p.momentum });
  } else {
    heText(ctx, p, 'האלקטרון נשאר במקומו', ex, ey + 34, { align: 'center', size: 12, color: p.ink2 });
  }
  // the electron (at rest before the collision)
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(ex, ey, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintTriangle(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, ev: ComptonEvent, locus: boolean, narrow: boolean) {
  panel(ctx, p, r, 0.6);
  heText(ctx, p, 'משולש התנע', r.x + r.w - (narrow ? 10 : 90), r.y + 14, { size: 13, weight: 700, color: p.ink });
  // the extent of the locus of p′ (the tip of p′ for θ in [0, π]) fixes the scale, so θ does not rescale the drawing
  const E = ev.E;
  let xmin = 0;
  let ymax = 0;
  const pts: [number, number][] = [];
  for (let k = 0; k <= 90; k++) {
    const t = (k / 90) * Math.PI;
    const Ep = scatteredEnergy(E, t);
    const pt: [number, number] = [Ep * Math.cos(t), Ep * Math.sin(t)];
    pts.push(pt);
    xmin = Math.min(xmin, pt[0]);
    ymax = Math.max(ymax, pt[1]);
  }
  const padL = 26;
  const padR = 34;
  const padT = 34;
  const padB = 30;
  const sc = Math.min((r.w - padL - padR) / (E - xmin), (r.h - padT - padB) / ymax);
  const ox = r.x + padL + (-xmin * sc) + ((r.w - padL - padR) - (E - xmin) * sc) / 2;
  const oy = r.y + r.h - padB;
  const X = (x: number) => ox + x * sc;
  const Y = (y: number) => oy - y * sc;
  // axis line
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X(xmin) - 10, oy);
  ctx.lineTo(X(E) + 14, oy);
  ctx.stroke();
  ctx.restore();
  if (locus) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(X(x), Y(y)) : ctx.lineTo(X(x), Y(y))));
    ctx.stroke();
    ctx.restore();
  }
  // p along +x, p′ at θ, pₑ from the tip of p′ to the tip of p
  arrow(ctx, X(0), Y(0), X(E), Y(0), { color: p.accent, width: 2.5, head: 10 });
  arrow(ctx, X(0), Y(0), X(ev.pp[0]), Y(ev.pp[1]), { color: p.accent, width: 2.5, head: 10, alpha: 0.75 });
  if (ev.K > 1e-12 * E) arrow(ctx, X(ev.pp[0]), Y(ev.pp[1]), X(E), Y(0), { color: p.momentum, width: 2.5, head: 10 });
  mathText(ctx, p, 'p', X(E / 2), oy + 13, { color: p.accent, size: 13 });
  // p′ is labelled at its middle, 14 px out on the side away from pₑ (the normal (−sin θ, cos θ), y up)
  if (ev.pp[1] > 1e-9 || ev.theta > 90 * DEG)
    mathText(ctx, p, 'p′', X(ev.pp[0] / 2) - 14 * Math.sin(ev.theta), Y(ev.pp[1] / 2) - 14 * Math.cos(ev.theta), { color: p.accent, size: 13 });
  if (ev.K > 1e-12 * E) mathText(ctx, p, 'pₑ', X((ev.pp[0] + E) / 2) + 12, Y(ev.pp[1] / 2) - 4, { color: p.momentum, size: 13 });
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(X(0), Y(0), 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  mathText(ctx, p, `|p|c = ${num(E)} MeV`, r.x + 10, r.y + 14, { align: 'left', size: 11, italic: false, weight: 600, color: p.ink2 });
}

function paintStrip(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, ev: ComptonEvent) {
  panel(ctx, p, r, 0.9);
  const x0 = r.x + 34;
  const x1 = r.x + r.w - 16;
  const span = x1 - x0;
  const lam = lambdaPm(ev.E);
  const lamP = lambdaPm(ev.Ep);
  const lamMax = lam + 2 * LC_PM;
  const sx = span / lamMax;
  const y1 = r.y + 16;
  const y2 = r.y + 34;
  const y3 = r.y + r.h - 18;
  // wavelength ruler: λ, and λ′ = λ + Δλ; the ruler ends at λ + 2λ_C
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y2 + 9);
  ctx.lineTo(x1, y2 + 9);
  ctx.moveTo(x1, y1 - 7);
  ctx.lineTo(x1, y2 + 9);
  ctx.stroke();
  ctx.fillStyle = withAlpha(p.accent, 0.45);
  ctx.fillRect(x0, y1 - 4, lam * sx, 8);
  ctx.fillRect(x0, y2 - 4, lam * sx, 8);
  ctx.fillStyle = p.accent;
  ctx.fillRect(x0 + lam * sx, y2 - 4, (lamP - lam) * sx, 8);
  ctx.restore();
  mathText(ctx, p, 'λ', r.x + 18, y1, { size: 13, color: p.accent });
  mathText(ctx, p, 'λ′', r.x + 18, y2, { size: 13, color: p.accent });
  mathText(ctx, p, 'λ′(180°)', x1 - 4, y1, { align: 'right', size: 11, italic: false, weight: 600, color: p.ink3 });
  // energy split E = E′ + K
  const ex = (ev.Ep / ev.E) * span;
  ctx.save();
  ctx.fillStyle = withAlpha(p.accent, 0.8);
  ctx.fillRect(x0, y3 - 6, ex, 12);
  ctx.fillStyle = p.energyK;
  ctx.fillRect(x0 + ex, y3 - 6, span - ex, 12);
  ctx.restore();
  mathText(ctx, p, 'E', r.x + 18, y3, { size: 13 });
  if (ex > 30) mathText(ctx, p, 'E′', x0 + ex / 2, y3, { size: 12, color: p.paper });
  if (span - ex > 24) mathText(ctx, p, 'K', x0 + ex + (span - ex) / 2, y3, { size: 12, color: p.paper });
}

/* ------------------------------------------------------------------ binding energy */

interface SysDef {
  /** the parts' rest energies [MeV] and their symbols */
  parts: number[];
  partLabel: string;
  bound: number;
  boundLabel: string;
  topHe: string;
  bottomHe: string;
  /** 'B' for a bound system, 'Q' for a reaction */
  gap: 'B' | 'Q';
  /** nucleons, for B per nucleon (0: not a nucleus) */
  nucleons: number;
  /** show energies in eV */
  ev: boolean;
}

const { proton: MP, neutron: MN, deuteron: MD, alpha: MA } = REST_MEV;
/** the hydrogen atom's binding energy [MeV] (13.6 eV), stated in the lesson */
const B_HYDROGEN = 13.6e-6;

const SYSTEMS: Record<BindingSystem, SysDef> = {
  deuteron: { parts: [MP, MN], partLabel: 'p + n', bound: MD, boundLabel: 'd', topHe: 'פרוטון ונייטרון, חופשיים ונחים', bottomHe: 'דאוטרון', gap: 'B', nucleons: 2, ev: false },
  helium: { parts: [MP, MP, MN, MN], partLabel: '2p + 2n', bound: MA, boundLabel: '⁴He', topHe: 'שני פרוטונים ושני נייטרונים, חופשיים', bottomHe: 'גרעין הליום-4', gap: 'B', nucleons: 4, ev: false },
  fusion: { parts: [MD, MD], partLabel: 'd + d', bound: MA, boundLabel: '⁴He', topHe: 'לפני ההיתוך: שני דאוטרונים', bottomHe: 'אחרי ההיתוך: גרעין הליום-4', gap: 'Q', nucleons: 0, ev: false },
  atom: { parts: [MP, ME], partLabel: 'p + e⁻', bound: MP + ME - B_HYDROGEN, boundLabel: 'H', topHe: 'פרוטון ואלקטרון, חופשיים ונחים', bottomHe: 'אטום מימן', gap: 'B', nucleons: 0, ev: true },
};

const SYS_HE: Record<BindingSystem, string> = { deuteron: 'דאוטרון', helium: 'הליום-4', fusion: 'היתוך', atom: 'אטום מימן' };

interface BState {
  sys: BindingSystem;
  full: boolean;
}

const bInitial = (p: ComptonLabProps): BState => ({ sys: p.sys ?? 'deuteron', full: p.full ?? false });

function analyseSys(sys: BindingSystem) {
  const d = SYSTEMS[sys];
  const sum = d.parts.reduce((a, b) => a + b, 0);
  const B = sys === 'atom' ? B_HYDROGEN : bindingEnergy(d.parts, d.bound);
  return { d, sum, B, frac: B / sum, per: d.nucleons ? B / d.nucleons : 0 };
}

const fmtB = (B: number, ev: boolean) => (ev ? `${num(B * 1e6)} eV` : `${num(B, 4)} MeV`);

function bDescribe(s: BState): string {
  const k = analyseSys(s.sys);
  const what = k.d.gap === 'Q' ? 'האנרגיה שמשתחררת' : 'אנרגיית הקשר';
  return `${SYS_HE[s.sys]}: סכום אנרגיות המנוחה ${k.sum.toFixed(3)} MeV, אחרי הקשירה ${k.d.bound.toFixed(3)} MeV. ${what} ${fmtB(k.B, k.d.ev)}, חלק ${num(k.frac)} מהסכום. ${s.full ? 'קנה מידה מלא.' : 'הציר חתוך כדי שההפרש ייראה.'}`;
}

function Binding(props: ComptonLabProps) {
  const [s, setS] = useState<BState>(() => bInitial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t) ?? false;
  const done = (t: string) => markTask(`${props.id}:${t}`);

  const change = (patch: Partial<BState>) => {
    const next = { ...s, ...patch };
    setS(next);
    if (has('full') && patch.full === true) done('full');
    if (has('atom') && patch.sys === 'atom') done('atom');
    if (has('fusion') && patch.sys === 'fusion') done('fusion');
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.sys === 'string' && st.sys in SYSTEMS) next.sys = st.sys as BindingSystem;
          if (typeof st.full === 'boolean') next.full = st.full;
          return next;
        });
      }),
    [props.id],
  );

  useEffect(() => {
    const h = setTimeout(() => setLive(bDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.sys, s.full]);

  const [aspect, setAspect] = useState(1.9);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintBinding(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1 / aspect, animate: false });
  useAspect(canvasRef, 1.9, 1.05, setAspect);
  useEffect(invalidate, [s, aspect]);

  const reset = () => {
    setS(bInitial(props));
    setLive('האיור אופס.');
  };

  const k = analyseSys(s.sys);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: המסה החסרה. ${bDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="parts">
            {k.d.gap === 'Q' ? 'לפני:' : 'החלקים:'} <b class="q" dir="ltr">Σmc² = {k.sum.toFixed(3)} MeV</b>
          </span>
          <span data-readout="bound">
            {k.d.gap === 'Q' ? 'אחרי:' : 'המערכת הקשורה:'} <b class="q" dir="ltr">Mc² = {k.d.bound.toFixed(3)} MeV</b>
          </span>
          <span data-readout="B">
            {k.d.gap === 'Q' ? 'האנרגיה שמשתחררת:' : 'אנרגיית הקשר:'} <b class="q" dir="ltr">{k.d.gap} = Δm·c² = {fmtB(k.B, k.d.ev)}</b>
          </span>
          <span data-readout="frac">
            החלק החסר: <b class="q" dir="ltr">{k.d.gap}/Σmc² = {num(k.frac)}</b>
          </span>
          {k.per > 0 && (
            <span data-readout="per">
              לכל נוקלאון: <b class="q" dir="ltr">B/A = {num(k.per)} MeV</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="המערכת">
            {(Object.keys(SYSTEMS) as BindingSystem[]).map((key) => (
              <Toggle key={key} label={SYS_HE[key]} on={s.sys === key} onChange={() => change({ sys: key })} />
            ))}
          </div>
          <div class="group" role="group" aria-label="קנה מידה">
            <Toggle label="קנה מידה מלא" on={s.full} onChange={(on) => change({ full: on })} />
          </div>
        </>
      }
    />
  );
}

function paintBinding(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: BState) {
  const { w, h } = view;
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, w, h);
  const k = analyseSys(s.sys);
  const { d, sum, B } = k;
  const x0 = 28;
  const x1 = w - 28;
  const span = x1 - x0;
  // the window of energies shown: from zero (full scale) or around the gap (zoom: B is about a quarter of it)
  const v0 = s.full ? 0 : d.bound - 3 * B;
  const v1 = s.full ? sum * 1.03 : sum + 0.6 * B;
  const X = (v: number) => x0 + ((v - v0) / (v1 - v0)) * span;
  const barH = Math.max(22, Math.min(40, h * 0.13));
  const yTop = h * 0.3;
  const yBot = h * 0.6;
  const yAxis = yBot + barH / 2 + 22;
  const rows: { y: number; he: string; label: string; segs: number[]; color: string }[] = [
    { y: yTop, he: d.topHe, label: d.partLabel, segs: d.parts, color: withAlpha(p.ink, 0.18) },
    { y: yBot, he: d.bottomHe, label: d.boundLabel, segs: [d.bound], color: withAlpha(p.ink, 0.3) },
  ];
  for (const row of rows) {
    heText(ctx, p, row.he, x1, row.y - barH / 2 - 11, { size: 13, weight: 700, color: p.ink });
    let acc = 0;
    for (let i = 0; i < row.segs.length; i++) {
      const a = Math.max(v0, acc);
      const b = acc + row.segs[i];
      acc = b;
      if (b <= v0) continue;
      const xa = X(a);
      const xb = X(b);
      ctx.save();
      ctx.fillStyle = row.color;
      ctx.fillRect(xa, row.y - barH / 2, xb - xa, barH);
      ctx.strokeStyle = p.paper;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(xa, row.y - barH / 2, xb - xa, barH);
      ctx.restore();
    }
    mathText(ctx, p, row.label, x0 + 20, row.y, { align: 'left', size: 14, color: p.ink });
    if (!s.full) breakMarks(ctx, p, x0 + 3, row.y, barH);
  }
  // the gap: what the bound system lacks
  const xg0 = X(d.bound);
  const xg1 = X(sum);
  const gapPx = xg1 - xg0;
  ctx.save();
  if (gapPx > 2) {
    ctx.fillStyle = withAlpha(p.accent, 0.12);
    ctx.fillRect(xg0, yBot - barH / 2, gapPx, barH);
  }
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.5;
  if (gapPx > 2) ctx.strokeRect(xg0, yBot - barH / 2, gapPx, barH);
  ctx.beginPath();
  ctx.moveTo(xg1, yTop + barH / 2);
  ctx.lineTo(xg1, yBot + barH / 2);
  ctx.stroke();
  ctx.restore();
  const gapText = `${d.gap} = ${fmtB(B, d.ev)}`;
  if (gapPx > 2) {
    mathText(ctx, p, d.gap, (xg0 + xg1) / 2, yBot, { size: 15, color: p.accent });
    mathText(ctx, p, gapText, xg1, yBot + barH / 2 + 10, { align: 'right', size: 12, italic: false, weight: 600, color: p.ink2 });
  } else {
    heText(ctx, p, `ההפרש, ${d.gap}, צר מפיקסל אחד`, x1, yBot + barH / 2 + 12, { size: 12, color: p.ink2 });
  }
  // the axis
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, yAxis);
  ctx.lineTo(x1, yAxis);
  ctx.stroke();
  ctx.restore();
  if (!s.full) breakMarks(ctx, p, x0 + 3, yAxis, 10);
  // ticks: in zoom, measured from the bound system's rest energy (in MeV, or eV for the atom)
  const unit = d.ev && !s.full ? 1e6 : 1;
  const ref = s.full ? 0 : d.bound;
  const lo = (v0 - ref) * unit;
  const hi = (v1 - ref) * unit;
  const ticks = niceTicks(lo, hi, w < 520 ? 3 : 5);
  ctx.save();
  ctx.font = `11px ${p.fontUi}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = p.ink2;
  ctx.strokeStyle = p.ink3;
  for (const t of ticks) {
    const x = X(ref + t / unit);
    if (x < x0 + 14 || x > x1) continue;
    ctx.beginPath();
    ctx.moveTo(x, yAxis);
    ctx.lineTo(x, yAxis + 4);
    ctx.stroke();
    ctx.fillText(num(t, 4), x, yAxis + 6);
  }
  ctx.restore();
  const axisTitle = s.full ? 'E [MeV]' : `E − Mc² [${d.ev ? 'eV' : 'MeV'}]`;
  mathText(ctx, p, axisTitle, x1, yAxis + 30, { align: 'right', size: 12, italic: false, weight: 600, color: p.ink2 });
}

/** Two short slanted strokes across a bar or an axis: the scale is cut here. */
function breakMarks(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, hgt: number) {
  ctx.save();
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 4;
  for (const dx of [0, 6]) {
    ctx.beginPath();
    ctx.moveTo(x + dx - 3, y + hgt / 2 + 3);
    ctx.lineTo(x + dx + 3, y - hgt / 2 - 3);
    ctx.stroke();
  }
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.2;
  for (const dx of [-2, 8]) {
    ctx.beginPath();
    ctx.moveTo(x + dx - 3, y + hgt / 2 + 3);
    ctx.lineTo(x + dx + 3, y - hgt / 2 - 3);
    ctx.stroke();
  }
  ctx.restore();
}
