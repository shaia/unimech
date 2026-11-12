/**
 * PhasorLab (lesson 5.4): the complex exponential as a rotating arrow, and the complex method of the driven
 * oscillator read as geometry.
 *
 * Mode "euler": the complex plane (Re to the right, Im up) with the unit circle and the arrow z = e^(iθ). Its
 * shadows on the axes are cos θ and sin θ (Euler's formula). Playing turns θ = ωt with ω = 1 rad/s; on the right,
 * Re z = cos θ is drawn against θ as the arrow turns. With "נגזרות" on, the derivative ż = iωz (velocity colour,
 * a quarter turn ahead of z, tangent to the circle) and the second derivative z̈ = −ω²z (acceleration colour,
 * toward the centre) are drawn from the tip.
 *
 * Mode "driven": two arrows turning together at ω, the force (F₀/m)e^(iωt) and the displacement X̃e^(iωt), drawn
 * with fixed lengths (only the angle between them, δ, is meant); their shadows on the Re axis are F(t) and x(t).
 * On the right, the denominator ω₀² − ω² + iγω of X̃ as a right triangle whose angle at the origin is δ.
 *
 * Physics: src/physics/resonance.ts (denominator, complexAmplitude, amplitudeAndLag, cis).
 * Tasks tick only inside the learner's handlers, for a control the learner changed since the last text step.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { amplitudeAndLag, denominator } from '~/physics/resonance';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, withAlpha } from './core/ink';
import { drawAxes, drawCurve, insetBox, makePlot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  'euler-pi': `במצב אוילר: סובבו את החץ עד ${ltr('θ = 180°')}. איזה מספר הוא e בחזקת ${ltr('iπ')}?`,
  derivative: 'הדליקו "נגזרות" ולחצו "הפעלה". לאן מצביעה הנגזרת ביחס לחץ עצמו?',
  flip: `במצב המתנד: הזיזו את ${ltr('ω')} אל מעל ${ltr('ω₀')}. מה קורה למשולש ולזווית ${ltr('δ')}?`,
};

export interface PhasorLabProps {
  id: string;
  mode?: 'euler' | 'driven';
  /** euler: the angle shown [rad] */
  theta?: number;
  deriv?: boolean;
  /** driven: ω₀ [rad/s], ω and Q */
  omega0?: number;
  omega?: number;
  Q?: number;
  tasks?: string[];
}

interface Setup {
  mode: 'euler' | 'driven';
  theta: number;
  deriv: boolean;
  omega: number;
  Q: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
const signed = (x: number, tiny = 0) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));
const deg = (r: number) => (r * 180) / Math.PI;
const TAU = 2 * Math.PI;

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

/** A base with a raised exponent ("e" + "iθ"), with a paper halo, kept inside [xMin, xMax]; returns nothing. */
function supText(ctx: CanvasRenderingContext2D, p: Palette, base: string, sup: string, x: number, y: number, size: number, color: string, align: 'left' | 'right', xMin: number, xMax: number) {
  const fb = `italic 700 ${size}px ${p.fontUi}`;
  const fs = `italic 700 ${Math.round(size * 0.72)}px ${p.fontUi}`;
  ctx.save();
  ctx.font = fb;
  const wb = ctx.measureText(base).width;
  ctx.font = fs;
  const ws = ctx.measureText(sup).width;
  ctx.restore();
  const w = wb + ws + 1;
  let x0 = align === 'left' ? x : x - w;
  x0 = Math.max(xMin, Math.min(xMax - w, x0));
  haloText(ctx, p, base, x0, y, { font: fb, color, align: 'left' });
  haloText(ctx, p, sup, x0 + wb + 1, y - size * 0.38, { font: fs, color, align: 'left' });
}

function dashed(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** An angle arc at (cx, cy) from 0 to th (screen y down, so the arc runs counter-clockwise on screen). */
function angleArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, from: number, to: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -from, -to, to > from);
  ctx.stroke();
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, paper: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = paper;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export default function PhasorLab(props: PhasorLabProps) {
  const w0 = props.omega0 ?? 10;
  const W_MAX = roundTo(2 * w0, 0.5);
  const initial = (): Setup => ({
    mode: props.mode ?? 'euler',
    theta: ((props.theta ?? Math.PI / 4) % TAU + TAU) % TAU,
    deriv: props.deriv ?? false,
    omega: clamp(props.omega ?? 0.6 * w0, 0.5, W_MAX),
    Q: clamp(props.Q ?? 8, 0.5, 30),
  });
  const [setup, setSetup] = useState<Setup>(initial);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState('');
  const t0 = useRef<{ t: number; theta: number } | null>(null);
  const phase = useRef(0); // the turning angle ωt shown in driven mode
  const touched = useRef(new Set<string>());

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        touched.current.clear();
        setPlaying(false);
        setSetup((prev) => ({
          mode: st.mode === 'euler' || st.mode === 'driven' ? st.mode : prev.mode,
          theta: num(st.theta) !== null ? (((num(st.theta) as number) % TAU) + TAU) % TAU : prev.theta,
          deriv: bool(st.deriv) ?? prev.deriv,
          omega: clamp(num(st.omega) ?? prev.omega, 0.5, W_MAX),
          Q: clamp(num(st.Q) ?? prev.Q, 0.5, 30),
        }));
        phase.current = 0;
      }),
    [props.id],
  );

  const o = { omega0: w0, gamma: w0 / setup.Q };
  const D = denominator(o, setup.omega);
  const { delta } = amplitudeAndLag(o, 1, setup.omega);

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const narrow = view.w < 520;
    const fs = narrow ? 12 : 13;
    // the complex plane on the left (on top when narrow), the second panel beside (below) it
    // on a narrow stage the tool buttons sit over the plane's top edge: start the plane below them
    const planeBox = narrow ? { x: 0, y: 34, w: view.w, h: view.h * 0.56 - 34 } : { x: 0, y: 0, w: view.w * 0.5, h: view.h };
    const sideBox = narrow ? { x: 0, y: view.h * 0.56, w: view.w, h: view.h * 0.44 } : { x: view.w * 0.5, y: 0, w: view.w * 0.5, h: view.h };

    // the angle now
    let theta = setup.theta;
    if (playing) {
      if (t0.current === null) t0.current = { t, theta: setup.mode === 'euler' ? setup.theta : phase.current };
      const th = t0.current.theta + (setup.mode === 'euler' ? 1 : TAU / 4) * (t - t0.current.t);
      if (setup.mode === 'euler') {
        theta = th % TAU;
        if (th - t0.current.theta >= TAU) {
          setPlaying(false);
          setSetup((s) => ({ ...s, theta: t0.current ? t0.current.theta : s.theta }));
        }
      } else phase.current = th % TAU;
    }

    /* ---- the complex plane */
    const cx = planeBox.x + planeBox.w / 2;
    const cy = planeBox.y + planeBox.h / 2;
    const R = Math.max(1, Math.min(planeBox.w, planeBox.h) * 0.34);
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx - R * 1.35, cy);
    ctx.lineTo(cx + R * 1.35, cy);
    ctx.moveTo(cx, cy + R * 1.35);
    ctx.lineTo(cx, cy - R * 1.35);
    ctx.stroke();
    ctx.strokeStyle = p.rule;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    ctx.restore();
    arrow(ctx, cx + R * 1.3, cy, cx + R * 1.42, cy, { color: p.ink2, width: 1.3, head: 7 });
    arrow(ctx, cx, cy - R * 1.3, cx, cy - R * 1.42, { color: p.ink2, width: 1.3, head: 7 });
    haloText(ctx, p, 'Re', cx + R * 1.42, cy + 13, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });
    haloText(ctx, p, 'Im', cx + 8, cy - R * 1.42, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'left' });
    haloText(ctx, p, '1', cx + R + 7, cy + 11, { font: `${fs - 1}px ${p.fontUi}`, color: p.ink3 });
    haloText(ctx, p, 'i', cx - 9, cy - R - 7, { font: `italic ${fs - 1}px ${p.fontUi}`, color: p.ink3 });

    if (setup.mode === 'euler') {
      const zx = cx + R * Math.cos(theta);
      const zy = cy - R * Math.sin(theta);
      dashed(ctx, zx, zy, zx, cy, withAlpha(p.ink2, 0.9));
      dashed(ctx, zx, zy, cx, zy, withAlpha(p.ink2, 0.9));
      angleArc(ctx, cx, cy, R * 0.22, 0, theta, p.ink2);
      haloText(ctx, p, 'θ', cx + R * 0.33 * Math.cos(theta / 2), cy - R * 0.33 * Math.sin(theta / 2), { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink2 });
      // the shadows: cos θ on Re, sin θ on Im
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(zx, cy);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(p.ink2, 0.8);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, zy);
      ctx.stroke();
      ctx.restore();
      const below = Math.sin(theta) >= 0 ? 16 : -16;
      if (Math.abs(Math.cos(theta)) > 0.12) haloText(ctx, p, 'cos θ', (cx + zx) / 2, cy + below, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.accent });
      if (Math.abs(Math.sin(theta)) > 0.12) haloText(ctx, p, 'sin θ', cx + (Math.cos(theta) >= 0 ? -30 : 30), (cy + zy) / 2, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink2 });
      arrow(ctx, cx, cy, zx, zy, { color: p.ink, width: 2.6, head: 11 });
      if (setup.deriv) {
        // ż = iωz with ω = 1: a quarter turn ahead, the same length; z̈ = −z: toward the centre
        const L = R * 0.8;
        arrow(ctx, zx, zy, zx - L * Math.sin(theta), zy - L * Math.cos(theta), { color: p.velocity, width: 2.4, head: 10 });
        haloText(ctx, p, 'ż = iωz', zx - L * 1.12 * Math.sin(theta), zy - L * 1.12 * Math.cos(theta) - 10, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.velocity });
        arrow(ctx, zx, zy, zx - L * Math.cos(theta), zy + L * Math.sin(theta), { color: p.accel, width: 2.4, head: 10 });
        haloText(ctx, p, 'z̈ = −ω²z', zx - L * 0.55 * Math.cos(theta) + 4, zy + L * 0.55 * Math.sin(theta) + 14, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.accel });
      }
      dot(ctx, zx, zy, 5, p.ink, p.paper);
      supText(ctx, p, 'e', 'iθ', zx + (Math.cos(theta) >= 0 ? 10 : -10), zy + (Math.sin(theta) >= 0 ? -15 : 17), fs + 2, p.ink, Math.cos(theta) >= 0 ? 'left' : 'right', planeBox.x + 4, planeBox.x + planeBox.w - 4);

      /* ---- Re z = cos θ against θ */
      const plot = makePlot(
        insetBox(sideBox, { l: narrow ? 44 : 50, r: 14, t: 20, b: 44 }),
        { min: 0, max: 360, label: 'θ (°)' + String.fromCharCode(0x200e), ticks: [0, 90, 180, 270, 360], format: (v) => sci(v, 3) },
        { min: -1.2, max: 1.2, label: 'Re z', ticks: [-1, 0, 1], format: (v) => (v < 0 ? '−1' : sci(v, 2)) },
      );
      drawAxes(ctx, plot, p);
      drawCurve(ctx, plot, (d) => Math.cos((d * Math.PI) / 180), { color: withAlpha(p.accent, 0.35), width: 1.6, samples: 240 });
      drawCurve(ctx, plot, (d) => (d <= deg(theta) + 1e-9 ? Math.cos((d * Math.PI) / 180) : Number.NaN), { color: p.accent, width: 2.6, samples: 360 });
      dot(ctx, plot.px(deg(theta)), plot.py(Math.cos(theta)), 5, p.accent, p.paper);
    } else {
      const ph = phase.current;
      const fx = cx + R * Math.cos(ph);
      const fy = cy - R * Math.sin(ph);
      const r2 = R * 0.72;
      const xx = cx + r2 * Math.cos(ph - delta);
      const xy = cy - r2 * Math.sin(ph - delta);
      dashed(ctx, fx, fy, fx, cy, withAlpha(p.force, 0.8));
      dashed(ctx, xx, xy, xx, cy, withAlpha(p.ink, 0.7));
      angleArc(ctx, cx, cy, R * 0.26, ph - delta, ph, p.accent);
      // a small lag leaves no room between the arrows: put the name just outside the arc, on the force's side
      const lab = delta < 0.5 ? ph + 0.35 : ph - delta / 2;
      haloText(ctx, p, 'δ', cx + R * 0.38 * Math.cos(lab), cy - R * 0.38 * Math.sin(lab), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.accent });
      arrow(ctx, cx, cy, fx, fy, { color: p.force, width: 2.6, head: 11 });
      arrow(ctx, cx, cy, xx, xy, { color: p.ink, width: 2.6, head: 11 });
      dot(ctx, fx, cy, 4.5, p.force, p.paper);
      dot(ctx, xx, cy, 4.5, p.ink, p.paper);
      haloText(ctx, p, 'F', fx + 12 * Math.cos(ph), fy - 12 * Math.sin(ph), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.force });
      supText(ctx, p, 'X̃e', 'iωt', xx + 12 * Math.cos(ph - delta), xy - 16 * Math.sin(ph - delta) - (Math.sin(ph - delta) >= 0 ? 4 : -8), fs + 1, p.ink, Math.cos(ph - delta) >= 0 ? 'left' : 'right', planeBox.x + 4, planeBox.x + planeBox.w - 4);

      /* ---- the denominator ω₀² − ω² + iγω as a triangle */
      const box = insetBox(sideBox, { l: 18, r: 18, t: 26, b: 26 });
      const span = Math.max(Math.abs(D.re), D.im, 1e-9);
      const s = Math.min(box.w / 2.3, box.h / 1.35) / span;
      const ox = box.x + box.w / 2;
      const oy = box.y + box.h - 6;
      const ex = ox + D.re * s;
      const ey = oy - D.im * s;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(box.x, oy);
      ctx.lineTo(box.x + box.w, oy);
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox, box.y);
      ctx.stroke();
      ctx.restore();
      haloText(ctx, p, 'Re', box.x + box.w - 2, oy + 13, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });
      haloText(ctx, p, 'Im', ox + 8, box.y + 4, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'left' });
      // legs
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = p.ink;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, oy);
      ctx.stroke();
      ctx.strokeStyle = p.energyTh;
      ctx.beginPath();
      ctx.moveTo(ex, oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
      arrow(ctx, ox, oy, ex, ey, { color: p.accent, width: 2.6, head: 11 });
      const arcR = Math.min(34, 0.3 * Math.hypot(ex - ox, ey - oy));
      angleArc(ctx, ox, oy, arcR, 0, delta, p.accent);
      const lab2 = Math.max(delta / 2, 0.45);
      haloText(ctx, p, 'δ', ox + (arcR + 14) * Math.cos(lab2), oy - (arcR + 14) * Math.sin(lab2), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.accent });
      if (Math.abs(ex - ox) > 30) haloText(ctx, p, 'ω₀² − ω²', (ox + ex) / 2, oy + 14, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink });
      haloText(ctx, p, 'γω', ex + (D.re >= 0 ? 8 : -8), (oy + ey) / 2, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.energyTh, align: D.re >= 0 ? 'left' : 'right' });
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1, animate: playing });
  useEffect(invalidate, [setup, playing]);

  const [aspect, setAspect] = useState(1.6);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 520 ? 0.72 : 1.6));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [aspect]);

  const change = (key: keyof Setup, patch: Partial<Setup>) => {
    touched.current.add(key);
    setPlaying(false);
    const next = { ...setup, ...patch };
    setSetup(next);
    if (key === 'theta' && next.mode === 'euler' && Math.abs(next.theta - Math.PI) < 0.03) done('euler-pi');
    if (key === 'deriv' && next.deriv) done('derivative');
    if (key === 'omega' && next.mode === 'driven' && next.omega > w0) done('flip');
  };

  const play = () => {
    if (!motionAllowed()) {
      setLive('מצב שקט: התנועה לא מוצגת. הזיזו את הזווית בפס.');
      return;
    }
    t0.current = null;
    setPlaying(true);
  };

  const label =
    setup.mode === 'euler'
      ? `איור חי: המספר המרוכב e בחזקת i תטא, חץ באורך 1 במישור המרוכב בזווית ${sci(deg(setup.theta))} מעלות. הצל שלו על הציר הממשי הוא קוסינוס תטא, ${sci(Math.cos(setup.theta))}.`
      : `איור חי: שני חצים מסתובבים, הכוח וההעתק, וההעתק מפגר בזווית ${sci(deg(delta))} מעלות. המכנה ω₀² − ω² + iγω כמשולש ישר זווית.`;

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={() => {
        touched.current.clear();
        setSetup(initial());
        setPlaying(false);
        phase.current = 0;
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        setup.mode === 'euler' ? (
          <>
            <span class="q" data-readout="theta">
              θ = <b>{signed(roundTo(deg(setup.theta), 1))}°</b>
            </span>
            <span class="q" data-readout="z">
              e<sup>iθ</sup> = <b>{signed(Math.cos(setup.theta), 5e-4)} + {signed(Math.sin(setup.theta), 5e-4)}i</b>
            </span>
          </>
        ) : (
          <>
            <span class="q" data-readout="omega">
              ω = <b>{signed(setup.omega)} rad/s</b>, ω₀ = <b>{signed(w0)} rad/s</b>
            </span>
            <span class="q" data-readout="D">
              ω₀² − ω² + iγω = <b>{signed(D.re, 1e-9)} + {signed(D.im)}i s⁻²</b>
            </span>
            <span class="q" data-readout="delta">
              δ = <b>{signed(deg(delta))}°</b>
            </span>
          </>
        )
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מה מציג האיור">
            <Toggle label="אוילר" on={setup.mode === 'euler'} onChange={() => change('mode', { mode: 'euler' })} />
            <Toggle label="המתנד המאולץ" on={setup.mode === 'driven'} onChange={() => change('mode', { mode: 'driven' })} />
          </div>
          {setup.mode === 'euler' ? (
            <>
              <Slider label="הזווית θ" value={roundTo(deg(setup.theta), 1)} min={0} max={359} step={1} format={(x) => `${signed(x)}°`} onChange={(v) => change('theta', { theta: (v * Math.PI) / 180 })} />
              <div class="group" role="group" aria-label="מה להציג">
                <Toggle label="נגזרות" on={setup.deriv} swatch="var(--velocity)" onChange={(on) => change('deriv', { deriv: on })} />
              </div>
            </>
          ) : (
            <>
              <Slider label="התדירות המאלצת ω" value={setup.omega} min={0.5} max={W_MAX} step={0.1} format={(x) => `${signed(x)} rad/s`} onChange={(v) => change('omega', { omega: clamp(roundTo(v, 0.1), 0.5, W_MAX) })} />
              <Slider label="מקדם האיכות Q" value={setup.Q} min={0.5} max={30} step={0.5} format={(x) => signed(x)} onChange={(v) => change('Q', { Q: clamp(roundTo(v, 0.5), 0.5, 30) })} />
            </>
          )}
          <div class="group" role="group" aria-label="הפעלה">
            <button type="button" class="btn primary" onClick={play}>
              הפעלה
            </button>
            {playing && (
              <button type="button" class="btn" onClick={() => setPlaying(false)}>
                עצירה
              </button>
            )}
          </div>
        </>
      }
    />
  );
}
