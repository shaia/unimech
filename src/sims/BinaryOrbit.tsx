/**
 * BinaryOrbit: two bodies that attract only each other (lesson 6.2), seen two ways.
 *
 * 'cm' view: the centre-of-mass frame. The centre of mass (the quartered circle of lesson 4.2) stands still at the
 *   origin; body 1 (m₁, the lighter) and body 2 (m₂) move on two ellipses with the same eccentricity, the centre of
 *   mass at a focus of each, sizes in the ratio m₂ : m₁, always on opposite sides of it. Velocity arrows in the
 *   velocity colour; a thin ink arrow r from body 2 to body 1.
 * 'rel' view: the relative position r = r₁ − r₂ drawn from a fixed point. Body 2 is pinned at the origin and the
 *   moving disc, labelled μ, follows the relative orbit (the larger ellipse) with the relative velocity v = v₁ − v₂.
 *   The centre of mass rides on r at (m₁/M) r from body 2. This is a plot of r(t), not an inertial frame.
 * Both views share one world scale (the relative semi-major axis a = 1), so switching keeps body 2 / the centre
 * of mass on the same spot and shows body 1's orbit grow from (m₂/M) a to a.
 * The Earth–Moon preset (q = M_moon/M_earth, e = 0) adds a magnified panel around the centre of mass with the
 * Earth to scale: the centre of mass lies inside the Earth.
 *
 * Physics: src/physics/twobody.ts (binaryAt: Kepler's equation for the relative orbit, then r₁ = (m₂/M) r,
 * r₂ = −(m₁/M) r). Units: a = 1, G(m₁ + m₂) scaled so that one period lasts PERIOD_SECONDS on the clock.
 *
 * Props (Astro wrapper: <Spread fig="fig-6-2a" figure={BinaryOrbit} figureProps={{ … }}>)
 *   id        figure id (Spread passes it); tasks are `${id}:${task}`
 *   q         mass ratio m₁/m₂, 0.01…1 (default 0.5)
 *   e         eccentricity of the orbits, 0…0.8 (default 0)
 *   view      'cm' | 'rel' (default 'cm')
 *   tasks     task ids to show (below)
 *
 * Step `set` keys: q, e, view, preset ('binary' | 'earth-moon'), phase (t/T, 0…1), playing.
 *
 * Tasks, ticked only inside the learner's own event handlers (a step never ticks one):
 *   equal             the learner drags the mass ratio to m₁ = m₂
 *   relative          the learner switches to the relative view
 *   earth-moon        the learner picks the Earth–Moon preset
 *   ellipse           the learner sets e ≥ 0.5 in the centre-of-mass view
 *   relative-ellipse  with e ≥ 0.5, the learner switches to the relative view
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { D_EARTH_MOON, M_EARTH, M_MOON, R_EARTH } from '~/physics/constants';
import { barycentre, binaryAt } from '~/physics/twobody';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type ViewKind = 'cm' | 'rel';
type Preset = 'none' | 'binary' | 'earth-moon';

const TASK_LABEL: Record<string, string> = {
  equal: 'הזיזו את יחס המסות עד m₁ = m₂. היכן מרכז המסה, ואיך נראים שני המסלולים?',
  relative: 'עברו לתצוגת התנועה היחסית. מה קרה למסלול של גוף 1?',
  'earth-moon': 'בחרו "כדור הארץ והירח". היכן נמצא מרכז המסה של שניהם?',
  ellipse: 'קבעו e = 0.5 או יותר. מתי כל כוכב הכי קרוב למרכז המסה?',
  'relative-ellipse': 'עם e = 0.5 או יותר, עברו לתצוגת התנועה היחסית. האם צורת המסלול השתנתה?',
};

export interface BinaryOrbitProps {
  id: string;
  q?: number;
  e?: number;
  view?: ViewKind;
  tasks?: string[];
}

interface State {
  q: number;
  e: number;
  view: ViewKind;
  preset: Preset;
  /** t/T in [0, 1) */
  phase: number;
  playing: boolean;
}

const Q_EM = M_MOON / M_EARTH;
const PERIOD_SECONDS = 7;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const ratio = (x: unknown, d: number) => clamp(typeof x === 'number' ? x : d, 0.01, 1);
const ecc = (x: unknown, d: number) => clamp(Math.round((typeof x === 'number' ? x : d) * 20) / 20, 0, 0.8);
const wrap = (x: number) => ((x % 1) + 1) % 1;
/** a readout number: 3 significant figures and a true minus sign */
const num = (x: number) => sci(x, 3).replace('-', '−');

function initial(p: BinaryOrbitProps): State {
  return { q: ratio(p.q, 0.5), e: ecc(p.e, 0), view: p.view ?? 'cm', preset: 'none', phase: 0, playing: true };
}

/** Both bodies and the relative state at the current phase, in units a = 1, G(m₁ + m₂) = 1 + q. */
function solve(s: State) {
  const m1 = s.q;
  const m2 = 1;
  const T = 2 * Math.PI * Math.sqrt(1 / (m1 + m2));
  const at = binaryAt(1, m1, m2, 1, s.e, s.phase * T);
  const f1 = m2 / (m1 + m2);
  const f2 = m1 / (m1 + m2);
  // the largest relative speed (at the periapsis), for the arrow scale
  const vmax = Math.sqrt(((m1 + m2) * (1 + s.e)) / (1 - s.e));
  return { at, f1, f2, vmax, mu1: 1 / (1 + s.q) };
}
type Solved = ReturnType<typeof solve>;

export default function BinaryOrbit(props: BinaryOrbitProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const has = (t: string) => props.tasks?.includes(t) ?? false;
  const tick = (t: string) => {
    if (has(t)) markTask(`${props.id}:${t}`);
  };
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const z = solve(s);

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next: State = { ...prev, preset: 'none' };
          if (st.preset === 'binary') Object.assign(next, { q: 0.5, e: 0 });
          if (st.preset === 'earth-moon') Object.assign(next, { q: Q_EM, e: 0, view: 'cm' as ViewKind, preset: 'earth-moon' as Preset });
          if (typeof st.q === 'number') next.q = ratio(st.q, prev.q);
          if (typeof st.e === 'number') next.e = ecc(st.e, prev.e);
          if (st.view === 'cm' || st.view === 'rel') next.view = st.view;
          next.phase = typeof st.phase === 'number' ? wrap(st.phase) : prev.phase;
          next.playing = typeof st.playing === 'boolean' ? st.playing : typeof st.phase !== 'number';
          return next;
        });
      }),
    [props.id],
  );

  // the clock, frozen in still mode
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => ({ ...prev, phase: wrap(prev.phase + dt / PERIOD_SECONDS) }));
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s, z)), 700);
    return () => clearTimeout(h);
  }, [s.q, s.e, s.view, s.preset]);

  const [narrow, setNarrow] = useState(false);
  const aspect = narrow ? (s.preset === 'earth-moon' ? 0.72 : 0.92) : s.preset === 'earth-moon' ? 1.45 : 1.3;
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, s, z, narrow);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 4, worldHeight: 3, animate: false });
  useEffect(invalidate, [s, narrow]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.getBoundingClientRect().width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  // the learner's own actions: every task is ticked here, never from an effect watching the state
  const setQ = (v: number) => {
    const q = ratio(v, s.q);
    setS((prev) => ({ ...prev, q, preset: 'none' }));
    if (q >= 0.995) tick('equal');
  };
  const setE = (v: number) => {
    const e = ecc(v, s.e);
    setS((prev) => ({ ...prev, e, preset: prev.preset === 'earth-moon' ? 'none' : prev.preset }));
    if (e >= 0.5 && s.view === 'cm') tick('ellipse');
  };
  const setView = (view: ViewKind) => {
    setS((prev) => ({ ...prev, view }));
    if (view === 'rel') {
      tick('relative');
      if (s.e >= 0.5) tick('relative-ellipse');
    }
  };
  const pickPreset = (preset: 'binary' | 'earth-moon') => {
    setS((prev) => (preset === 'binary' ? { ...prev, q: 0.5, e: 0, preset: 'binary' } : { ...prev, q: Q_EM, e: 0, view: 'cm', preset: 'earth-moon' }));
    if (preset === 'earth-moon') tick('earth-moon');
  };

  const em = barycentre(M_MOON, M_EARTH, D_EARTH_MOON);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: שני גופים שמושכים רק זה את זה. ${describe(s, z)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span class="q" data-readout="q">
            <i>m</i>₁/<i>m</i>₂ = {num(s.q)}
          </span>
          <span class="q" data-readout="mu">
            <i>μ</i> = {num(z.mu1)} <i>m</i>₁
          </span>
          <span data-readout="d">
            מרחק ממרכז המסה:{' '}
            <b class="q">
              <i>d</i>₁ = {num(z.f1)} <i>r</i>, <i>d</i>₂ = {num(z.f2)} <i>r</i>
            </b>
          </span>
          <span class="q" data-readout="speeds">
            <i>v</i>₁/<i>v</i>₂ = {num(1 / s.q)}
          </span>
          {s.preset === 'earth-moon' && (
            <span data-readout="earth">
              מרכז המסה ממרכז כדור הארץ:{' '}
              <b class="q">
                {num(em.d2 / 1e3)} km &lt; <i>R</i> = {num(R_EARTH / 1e3)} km
              </b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <Slider label="יחס המסות m₁/m₂" min={0.01} max={1} step={0.01} value={s.q} format={(v) => num(v)} onChange={setQ} />
          <Slider label="אקסצנטריות" min={0} max={0.8} step={0.05} value={s.e} format={(v) => `e = ${v.toFixed(2)}`} onChange={setE} />
          <div class="group" role="group" aria-label="תצוגה">
            <Toggle label="מערכת מרכז המסה" on={s.view === 'cm'} onChange={() => setView('cm')} />
            <Toggle label="התנועה היחסית" on={s.view === 'rel'} onChange={() => setView('rel')} />
          </div>
          <div class="group" role="group" aria-label="דוגמאות">
            <Toggle label="כוכב כפול" on={s.preset === 'binary'} onChange={() => pickPreset('binary')} />
            <Toggle label="כדור הארץ והירח" on={s.preset === 'earth-moon'} onChange={() => pickPreset('earth-moon')} />
            <Toggle label={s.playing ? 'עצירה' : 'הפעלה'} on={s.playing} onChange={(on) => setS((prev) => ({ ...prev, playing: on }))} />
          </div>
          <Slider
            label="זמן"
            min={0}
            max={1}
            step={0.01}
            value={Math.round(s.phase * 100) / 100}
            format={(v) => `t/T = ${v.toFixed(2)}`}
            onChange={(v) => setS((prev) => ({ ...prev, phase: wrap(v), playing: false }))}
          />
        </>
      }
    />
  );
}

function describe(s: State, z: Solved): string {
  const head =
    s.preset === 'earth-moon'
      ? 'כדור הארץ והירח: יחס המסות 0.0123, מרכז המסה בתוך כדור הארץ, כ-4670 קילומטר ממרכזו.'
      : `יחס המסות m₁ חלקי m₂ הוא ${num(s.q)}, והאקסצנטריות ${s.e.toFixed(2)}.`;
  const body =
    s.view === 'cm'
      ? `במערכת מרכז המסה שני הגופים מקיפים את מרכז המסה, תמיד משני צדדיו, באותו זמן מחזור. גוף 1 רחוק ממנו פי ${num(1 / s.q)} מגוף 2.`
      : 'בתצוגת התנועה היחסית גוף 2 מצויר במקום קבוע, והנקודה μ נעה במסלול היחסי, הגדול משני המסלולים.';
  return `${head} ${body} המסה המצומצמת ${num(z.mu1)} כפול m₁.`;
}

/* ================================================================== painting */

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
  ctx.font = `${o.italic === false ? '' : 'italic '}${o.weight ?? 700} ${o.size ?? 14}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Hebrew label, RTL, its right edge at x. */
function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; weight?: number; align?: CanvasTextAlign } = {}) {
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
  ctx.restore();
}

/** The centre-of-mass symbol of lesson 4.2: a circle with two opposite quarters filled. */
function cmSymbol(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r = 6) {
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.ink;
  for (const a0 of [0, Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, a0 - Math.PI / 2, a0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function disc(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number) {
  ctx.save();
  ctx.fillStyle = withAlpha(p.equip, 0.35);
  ctx.strokeStyle = p.equip;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** An ellipse with a focus at (fx, fy), periapsis direction +x, semi-major axis A (px), eccentricity e; k = ±1 mirrors it through the focus. */
function focalEllipse(ctx: CanvasRenderingContext2D, fx: number, fy: number, A: number, e: number, k: 1 | -1) {
  const pp = A * (1 - e * e);
  ctx.beginPath();
  for (let i = 0; i <= 180; i++) {
    const th = (i / 180) * 2 * Math.PI;
    const r = pp / (1 + e * Math.cos(th));
    const x = fx + k * r * Math.cos(th);
    const y = fy - k * r * Math.sin(th);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, z: Solved, narrow: boolean) {
  const { w, h } = view;
  ctx.fillStyle = withAlpha(p.paper2, 0.5);
  ctx.fillRect(0, 0, w, h);
  const withInset = s.preset === 'earth-moon' && s.view === 'cm';
  // the main panel, and the magnified panel of the Earth–Moon preset (left on a wide stage, below on a narrow one)
  let main: Box = { x: 0, y: 0, w, h };
  let inset: Box | null = null;
  if (withInset) {
    if (narrow) {
      const ih = Math.round(h * 0.36);
      main = { x: 0, y: 0, w, h: h - ih };
      inset = { x: 0, y: h - ih, w, h: ih };
    } else {
      const iw = Math.round(w * 0.32);
      main = { x: iw, y: 0, w: w - iw, h };
      inset = { x: 0, y: 0, w: iw, h };
    }
  }
  paintMain(ctx, p, s, z, main);
  if (inset) paintInset(ctx, p, z, inset, narrow);
}

function paintMain(ctx: CanvasRenderingContext2D, p: Palette, s: State, z: Solved, B: Box) {
  const { at, f1, f2 } = z;
  const e = s.e;
  const b = Math.sqrt(1 - e * e);
  // one scale for both views: the relative orbit and body 2's orbit must fit
  const xmin = -(1 + e);
  const xmax = Math.max(1 - e, 0.5 * (1 + e));
  const padTop = 48;
  const padBot = 22;
  const padX = 22;
  const scale = Math.min((B.w - 2 * padX) / (xmax - xmin), (B.h - padTop - padBot) / (2 * b));
  const cx = B.x + B.w / 2 - scale * ((xmin + xmax) / 2);
  const cy = B.y + padTop + (B.h - padTop - padBot) / 2;
  const X = (x: number) => cx + scale * x;
  const Y = (y: number) => cy - scale * y;
  const rel = s.view === 'rel';

  ctx.save();
  ctx.beginPath();
  ctx.rect(B.x, B.y, B.w, B.h);
  ctx.clip();

  // positions on screen
  const r1 = rel ? at.r : at.b1.r;
  const r2: readonly [number, number] = rel ? [0, 0] : at.b2.r;
  const [x1, y1] = [X(r1[0]), Y(r1[1])];
  const [x2, y2] = [X(r2[0]), Y(r2[1])];
  const rad2 = clamp(0.075 * scale, 6, 12);
  const rad1 = Math.max(5, rad2 * Math.cbrt(s.q));

  // the orbits
  ctx.save();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = withAlpha(p.ink2, 0.8);
  if (rel) {
    focalEllipse(ctx, X(0), Y(0), scale, e, 1);
    ctx.stroke();
  } else {
    ctx.setLineDash([6, 4]);
    focalEllipse(ctx, X(0), Y(0), scale * f1, e, 1);
    ctx.stroke();
    ctx.setLineDash([]);
    if (scale * f2 > 1.5) {
      focalEllipse(ctx, X(0), Y(0), scale * f2, e, -1);
      ctx.stroke();
    }
  }
  ctx.restore();

  // the line between the bodies, through the centre of mass
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink3, 0.7);
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();

  // r: from body 2 to body 1, a thin ink arrow ending at body 1's rim
  const dx = x1 - x2;
  const dy = y1 - y2;
  const L = Math.hypot(dx, dy);
  if (L > rad1 + rad2 + 14) {
    const ux = dx / L;
    const uy = dy / L;
    arrow(ctx, x2 + ux * rad2, y2 + uy * rad2, x1 - ux * (rad1 + 2), y1 - uy * (rad1 + 2), { color: p.ink, width: 1.4, head: 8 });
    // the label beside the arrow, 70 % of the way to body 1 (clear of the centre of mass, which is at most half way)
    const mx = x2 + 0.7 * dx - uy * 12;
    const my = y2 + 0.7 * dy + ux * 12;
    mathText(ctx, p, 'r', mx, my, { size: 14 });
  }

  // the bodies
  if (rel) {
    // body 2 pinned: a disc with a cross
    disc(ctx, p, x2, y2, rad2);
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x2 - rad2 - 5, y2);
    ctx.lineTo(x2 + rad2 + 5, y2);
    ctx.moveTo(x2, y2 - rad2 - 5);
    ctx.lineTo(x2, y2 + rad2 + 5);
    ctx.stroke();
    ctx.restore();
  } else {
    disc(ctx, p, x2, y2, rad2);
  }
  disc(ctx, p, x1, y1, rad1);

  // the centre of mass: at the origin in the CM view, on r at (m₁/M) r from body 2 in the relative view
  const cmx = rel ? X(f2 * at.r[0]) : X(0);
  const cmy = rel ? Y(f2 * at.r[1]) : Y(0);
  cmSymbol(ctx, p, cmx, cmy, 5);

  // velocities: each body in the CM view, the relative velocity in the relative view
  const vs = (0.2 * Math.min(B.w, B.h)) / z.vmax;
  const vArrow = (x: number, y: number, v: readonly [number, number], name: string, rad: number) => {
    const sp = Math.hypot(v[0], v[1]);
    if (sp < 1e-9) return;
    // an arrow starts at the body's centre and always reaches well past its rim
    const len = Math.max(sp * vs, rad + 16);
    const ux = v[0] / sp;
    const uy = -v[1] / sp;
    arrow(ctx, x, y, x + ux * len, y + uy * len, { color: p.velocity, width: 2.4, head: 9 });
    mathText(ctx, p, name, x + ux * (len + 12), y + uy * (len + 12), { color: p.velocity, size: 13 });
  };
  if (rel) vArrow(x1, y1, at.v, 'v', rad1);
  else {
    vArrow(x1, y1, at.b1.v, 'v₁', rad1);
    // below about 2 % of the relative speed the arrow of body 2 would be all minimum length: the inset shows its motion
    if (f2 >= 0.02) vArrow(x2, y2, at.b2.v, 'v₂', rad2);
  }

  // body labels, outward from the centre of mass
  const label = (x: number, y: number, rad: number, text: string) => {
    const ox = x - cmx;
    const oy = y - cmy;
    const d = Math.hypot(ox, oy);
    const ux = d > 1 ? ox / d : 0;
    const uy = d > 1 ? oy / d : -1;
    mathText(ctx, p, text, x + ux * (rad + 13) - uy * 4, y + uy * (rad + 13) + ux * 4, { size: 14 });
  };
  if (rel) {
    label(x1, y1, rad1, 'μ');
    mathText(ctx, p, 'm₂', x2 - rad2 - 16, y2 - rad2 - 4, { size: 14 });
  } else {
    label(x1, y1, rad1, 'm₁');
    if (scale * f2 > 4) label(x2, y2, rad2, 'm₂');
    else mathText(ctx, p, 'm₂', x2 + rad2 + 14, y2 - rad2 - 2, { size: 14 });
  }

  // the title, left of the reset and fullscreen buttons (top right, ~90 px)
  heText(ctx, p, rel ? 'התנועה היחסית: גוף 2 מצויר במקום קבוע' : 'מערכת מרכז המסה', B.x + B.w - 90, B.y + 16, { size: 13, weight: 700, color: p.ink });
  ctx.restore();
}

function paintInset(ctx: CanvasRenderingContext2D, p: Palette, z: Solved, B: Box, narrow: boolean) {
  const { at, f2 } = z;
  ctx.save();
  ctx.beginPath();
  ctx.rect(B.x, B.y, B.w, B.h);
  ctx.clip();
  ctx.fillStyle = withAlpha(p.paper, 0.92);
  ctx.fillRect(B.x, B.y, B.w, B.h);
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (narrow) {
    ctx.moveTo(B.x, B.y + 0.5);
    ctx.lineTo(B.x + B.w, B.y + 0.5);
  } else {
    ctx.moveTo(B.x + B.w - 0.5, B.y);
    ctx.lineTo(B.x + B.w - 0.5, B.y + B.h);
  }
  ctx.stroke();

  // world unit = the Earth–Moon distance; the Earth to scale
  const rE = R_EARTH / D_EARTH_MOON;
  const headH = 34;
  const cx = B.x + B.w / 2;
  const cy = B.y + headH + (B.h - headH - 22) / 2;
  const room = Math.min(B.w, B.h - headH - 22) / 2;
  const k = (0.62 * room) / rE; // px per world unit
  const ex = cx + k * at.b2.r[0];
  const ey = cy - k * at.b2.r[1];

  // the Earth's disc, the path of its centre, the centre and the centre of mass
  disc(ctx, p, ex, ey, k * rE);
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink2, 0.8);
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, k * f2 * Math.hypot(at.r[0], at.r[1]), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(ex, ey, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  cmSymbol(ctx, p, cx, cy, 5);
  // towards the Moon: along r, from the centre of mass
  const L = Math.hypot(at.r[0], at.r[1]);
  const ux = at.r[0] / L;
  const uy = -at.r[1] / L;
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink3, 0.8);
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(cx + ux * room * 0.95, cy + uy * room * 0.95);
  ctx.stroke();
  ctx.restore();

  heText(ctx, p, 'סביב מרכז המסה, מוגדל', B.x + B.w - 10, B.y + 14, { size: 12, weight: 700, color: p.ink });
  heText(ctx, p, 'כדור הארץ בקנה מידה', B.x + B.w - 10, B.y + 29, { size: 11, color: p.ink2 });
  heText(ctx, p, 'הנקודה: מרכז כדור הארץ', B.x + B.w - 10, B.y + B.h - 12, { size: 11, color: p.ink2 });
  ctx.restore();
}
