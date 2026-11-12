/**
 * VelocityDoppler: relativistic velocity addition and the longitudinal Doppler effect (lesson 9.4).
 *
 * mode 'add' (default): a ship passes the Earth at t = 0 moving at v along +x (frame S′ rides with it) and, at that
 *   moment, launches a probe forward at u′ relative to the ship; at the same moment the Earth sends a light flash
 *   along +x. Three panels:
 *   - the strip: positions in S at time t (c = 1, the strip is one light-unit long, t runs 0…1): the Earth, the
 *     Earth's light flash, the ship (x = vt), the probe (x = ut) and, dashed, where the probe would be by Galilean
 *     addition (x = (u′ + v)t), which can pass the light flash;
 *   - the bars: the speeds v, u′ + v (Galilean) and u = (u′ + v)/(1 + u′v/c²) on one axis from −c to 2c, the
 *     region beyond c shaded;
 *   - the graph: u/c against u′/c for the current v: the Galilean line u = u′ + v and the relativistic curve, which
 *     rises from (−1, −1) to (1, 1) and never leaves the band |u| < c.
 *   "light" replaces the probe by a light pulse from the ship (u′ = c): u = c, and it rides with the Earth's flash.
 * mode 'doppler': a light source with proper period T₀ and an observer approach each other at βc (β > 0
 *   approaching, β < 0 receding), drawn in one of two frames:
 *   - 'observer': the observer rests at the right; the source moves; crests (circles, in --accent) are emitted every
 *     γT₀ of S time from the source's position then, and spread at c from their emission points;
 *   - 'source': the source rests; the crests are concentric, λ₀ apart; the observer moves into them.
 *   Below, three rows of ticks on one time axis (units T₀): in the observer frame, the source's own ticks (T₀), its
 *   emissions in S (γT₀) and the receptions (γ(1 − β)T₀); in the source frame, its emissions (T₀), the receptions in
 *   its time (T₀/(1 + β)) and on the observer's clock (T₀/(γ(1 + β))). Both last rows are T₀/D.
 *
 * Physics: src/physics/relativity.ts (addVelocities, gammaOf, dopplerFactor, classical sound formulas) and
 * src/physics/doppler.ts (additionSlope is not drawn, the curve is; arrivalTime for the received crests). Units:
 * c = 1, time in T₀ (doppler) or in the strip's light-unit (add). Canvas world coordinates are y-up.
 *
 * Props (Astro wrapper: <Spread fig="fig-9-4a" figure={VelocityDoppler} figureProps={{ mode: 'add', … }}>)
 *   id      figure id (Spread passes it); steps address the figure by it, tasks are `${id}:${task}`
 *   mode    'add' | 'doppler'                                                          (default 'add')
 *   add:     v (ship speed, 0…0.95 c, default 0.5), up (probe speed relative to the ship, −0.95…0.95 c, default 0.3),
 *            light (u′ = c, default false)
 *   doppler: beta (−0.9…0.9, default 0.5), frame ('observer' | 'source', default 'observer')
 *   tasks   task ids to show (below)
 *
 * Step `set` keys: add: v, up, light, t (0…1), playing. doppler: beta, frame, tau (0…10), playing.
 *
 * Tasks, ticked only inside the learner's own handlers (sliders, buttons), never by a step:
 *   beyond   the learner sets the speeds so that u′ + v passes c (while the relativistic u stays below it)
 *   light    the learner turns the probe into a light pulse
 *   slow     the learner sets both speeds to at most 0.1c (both nonzero): the two sums agree to about 1%
 *   still    the learner sets β = 0: the observer receives the source's own period
 *   recede   the learner sets β < 0: the received frequency drops below f₀
 *   frames   the learner switches frame while β ≠ 0: the received f/f₀ does not change
 */

import { useEffect, useState } from 'preact/hooks';
import {
  addVelocities,
  classicalDopplerMovingObserver,
  classicalDopplerMovingSource,
  dopplerFactor,
  gammaOf,
} from '~/physics/relativity';
import { arrivalTime } from '~/physics/doppler';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type VelocityDopplerMode = 'add' | 'doppler';
export type DopplerFrame = 'observer' | 'source';

const TASK_LABEL: Record<string, string> = {
  beyond: 'קבעו את שתי המהירויות כך שהסכום של גליליי, u′ + v, יעבור את c. איפה נמצאת המהירות היחסותית u?',
  light: 'הפכו את הגשושית לפולס אור (u′ = c). מה המהירות שלו ביחס לכדור הארץ?',
  slow: 'קבעו את שתי המהירויות ל-0.1c או פחות (לא אפס). בכמה שונים שני הסכומים?',
  still: 'עצרו את התנועה היחסית (β = 0). כל כמה זמן מגיע שיא לצופה?',
  recede: 'תנו למקור ולצופה להתרחק זה מזה. מה קורה לתדירות הנקלטת?',
  frames: 'בתנועה יחסית, עברו מהמערכת של הצופה למערכת של המקור. האם f/f₀ משתנה?',
};

export interface VelocityDopplerProps {
  id: string;
  mode?: VelocityDopplerMode;
  v?: number;
  up?: number;
  light?: boolean;
  beta?: number;
  frame?: DopplerFrame;
  tasks?: string[];
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
/** snap a slider value to its 0.05 grid, so 0.1 is exactly 0.1 */
const snap = (x: number): number => Math.round(x * 20) / 20;
/** a readout number: 3 significant figures, a true minus sign, and no "−0" */
const num = (x: number): string => (Math.abs(x) < 0.0005 ? '0' : sci(x, 3).replace('-', '−'));

/* ================================================================== text on the canvas */

interface TextOpts {
  color?: string;
  size?: number;
  italic?: boolean;
  align?: CanvasTextAlign;
  weight?: number;
}

/** Latin/math label, LTR, italic by default, centred on (x, y) unless aligned. */
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

/** Hebrew label, RTL. Its right edge at x (or its left edge, with align 'left'). Returns its width. */
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

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function panel(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, alpha: number) {
  ctx.save();
  ctx.fillStyle = withAlpha(p.paper2, alpha);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

/** keep the canvas aspect in step with its width: taller on a phone (the width does not depend on it: no loop) */
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

export default function VelocityDoppler(props: VelocityDopplerProps) {
  return props.mode === 'doppler' ? <Doppler {...props} /> : <Addition {...props} />;
}

/* ------------------------------------------------------------------ velocity addition */

interface AddState {
  v: number;
  up: number;
  light: boolean;
  t: number;
  playing: boolean;
}

const ADD_T_DEFAULT = 0.8;
const ADD_SECONDS = 3; // wall-clock seconds for t to run 0 → 1

function addInitial(p: VelocityDopplerProps): AddState {
  return {
    v: clamp(snap(p.v ?? 0.5), 0, 0.95),
    up: clamp(snap(p.up ?? 0.3), -0.95, 0.95),
    light: p.light ?? false,
    t: ADD_T_DEFAULT,
    playing: false,
  };
}

/** the probe's speed relative to the ship (c = 1 when it is a light pulse), the two sums */
function addSpeeds(s: AddState) {
  const up = s.light ? 1 : s.up;
  const gal = up + s.v;
  const u = addVelocities(up, s.v, 1);
  const den = 1 + up * s.v;
  return { up, gal, u, den };
}

function Addition(props: VelocityDopplerProps) {
  const [s, setS] = useState<AddState>(() => addInitial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string): boolean => props.tasks?.includes(t) ?? false;
  const done = (t: string) => markTask(`${props.id}:${t}`);

  /** a change the learner made: apply it, then judge the tasks it may complete (never from an effect) */
  const change = (patch: Partial<AddState>) => {
    const next: AddState = { ...s, ...patch };
    setS(next);
    const k = addSpeeds(next);
    if (has('beyond') && !next.light && k.gal > 1) done('beyond');
    if (has('slow') && !next.light && next.v > 0 && next.v <= 0.1 + 1e-9 && next.up !== 0 && Math.abs(next.up) <= 0.1 + 1e-9) done('slow');
    if (has('light') && patch.light === true) done('light');
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.v === 'number') next.v = clamp(snap(st.v), 0, 0.95);
          if (typeof st.up === 'number') next.up = clamp(snap(st.up), -0.95, 0.95);
          if (typeof st.light === 'boolean') next.light = st.light;
          next.t = typeof st.t === 'number' ? clamp(st.t, 0, 1) : ADD_T_DEFAULT;
          next.playing = typeof st.playing === 'boolean' ? st.playing : false;
          return next;
        });
      }),
    [props.id],
  );

  // playback, frozen in still mode
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000) / ADD_SECONDS;
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => {
        const t = prev.t + dt;
        return t >= 1 ? { ...prev, t: 1, playing: false } : { ...prev, t };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  useEffect(() => {
    const h = setTimeout(() => setLive(addDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.v, s.up, s.light]);

  const [aspect, setAspect] = useState(1.35);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintAdd(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1 / aspect, animate: false });
  useAspect(canvasRef, 1.35, 0.66, setAspect);
  useEffect(invalidate, [s, aspect]);

  const reset = () => {
    setS(addInitial(props));
    setLive('האיור אופס.');
  };

  const k = addSpeeds(s);

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: חללית משגרת גשושית. ${addDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="v">
            חללית: <b class="q">
              <i>v</i> = {num(s.v)}c
            </b>
          </span>
          <span data-readout="up">
            גשושית ביחס לחללית: <b class="q">{s.light ? <><i>u′</i> = c</> : <><i>u′</i> = {num(s.up)}c</>}</b>
          </span>
          <span data-readout="gal">
            גליליי: <b class="q">{num(k.gal)}c</b>
          </span>
          <span data-readout="u">
            יחסותי: <b class="q">{Math.abs(k.u - 1) < 1e-12 ? 'c' : `${num(k.u)}c`}</b>
          </span>
          <span data-readout="den">
            מכנה: <b class="q">{num(k.den)}</b>
          </span>
        </>
      }
      controls={
        <>
          <Slider
            label="מהירות החללית ביחס לכדור הארץ"
            min={0}
            max={0.95}
            step={0.05}
            value={s.v}
            format={(x) => `${num(x)}c`}
            onChange={(x) => change({ v: snap(x) })}
          />
          <Slider
            label="מהירות הגשושית ביחס לחללית"
            min={-0.95}
            max={0.95}
            step={0.05}
            value={s.up}
            format={(x) => `${num(x)}c`}
            onChange={(x) => change({ up: snap(x), light: false })}
          />
          <div class="group" role="group" aria-label="גשושית או אור, וזמן">
            <Toggle label="פולס אור במקום גשושית" on={s.light} onChange={(on) => change({ light: on })} />
            <Toggle
              label={s.playing ? 'עצירה' : 'הפעלה'}
              on={s.playing}
              onChange={(on) => setS((prev) => (on && prev.t >= 1 - 1e-9 ? { ...prev, t: 0, playing: true } : { ...prev, playing: on }))}
            />
          </div>
        </>
      }
    />
  );
}

function addDescribe(s: AddState): string {
  const k = addSpeeds(s);
  const probe = s.light ? 'פולס אור' : `גשושית במהירות ${num(s.up)} c ביחס לחללית`;
  return `החללית נעה במהירות ${num(s.v)} c ביחס לכדור הארץ ומשגרת ${probe}. החיבור של גליליי נותן ${num(k.gal)} c, והחיבור היחסותי ${num(k.u)} c.`;
}

function paintAdd(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: AddState) {
  const { w, h } = view;
  const narrow = w < 520;
  const strip: Rect = narrow ? { x: 0, y: 0, w, h: h * 0.3 } : { x: 0, y: 0, w: w * 0.57, h: h * 0.44 };
  const bars: Rect = narrow ? { x: 0, y: h * 0.3, w, h: h * 0.26 } : { x: 0, y: h * 0.44, w: w * 0.57, h: h * 0.56 };
  const graph: Rect = narrow ? { x: 0, y: h * 0.54, w, h: h * 0.46 } : { x: w * 0.57, y: 0, w: w * 0.43, h };
  const k = addSpeeds(s);
  paintStrip(ctx, p, strip, s, k, true);
  paintBars(ctx, p, bars, s, k);
  paintGraph(ctx, p, graph, s, k, !narrow);
}

type Speeds = ReturnType<typeof addSpeeds>;

function paintStrip(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, s: AddState, k: Speeds, underTools: boolean) {
  panel(ctx, p, r, 0.55);
  const tw = heText(ctx, p, 'מערכת כדור הארץ', r.x + r.w - (underTools ? 90 : 8), r.y + 14, { size: 13, weight: 700, color: p.ink });
  mathText(ctx, p, 'S', r.x + r.w - (underTools ? 90 : 8) - tw - 8, r.y + 14, { align: 'right', size: 14 });
  const x0 = r.x + 26;
  const x1 = r.x + r.w - 22;
  const L = x1 - x0; // px per light-unit: the light flash covers the strip as t goes 0 → 1
  const y = r.y + r.h * 0.62;
  const X = (x: number) => x0 + x * L;

  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  // the x axis with a tick every tenth of the light-unit
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1 + 8, y);
  ctx.stroke();
  for (let i = 0; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(X(i / 10), y);
    ctx.lineTo(X(i / 10), y + (i % 5 === 0 ? 7 : 4));
    ctx.stroke();
  }
  mathText(ctx, p, 'x', x1 + 12, y - 9, { size: 12, color: p.ink2 });

  // the Earth, at x = 0
  ctx.fillStyle = withAlpha(p.equip, 0.35);
  ctx.strokeStyle = p.equip;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x0, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const t = s.t;
  const rowUp1 = y - 17;
  const rowUp2 = y - 33;
  const rowDn1 = y + 20;
  const rowDn2 = y + 36;

  // the Earth's light flash, x = ct
  const xl = X(t);
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(xl, y - 9);
  ctx.lineTo(xl, y + 9);
  ctx.stroke();
  heText(ctx, p, 'אור', xl + 4, rowUp2, { align: 'left', color: p.accent, size: 12, weight: 700 });

  // Galilean prediction for the probe, dashed: it can pass the flash
  const xg = k.gal * t;
  if (xg <= 1.03) {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(X(xg), y, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    heText(ctx, p, 'לפי גליליי', X(xg) + 4, rowDn2, { align: 'left', size: 11, color: p.ink2 });
  } else {
    // off the strip: a marker at the edge
    arrow(ctx, x1 - 2, rowDn2, x1 + 14, rowDn2, { color: p.ink2, width: 1.5, head: 7 });
    heText(ctx, p, 'לפי גליליי: כבר עבר את האור', x1 - 6, rowDn2, { size: 11, color: p.ink2 });
  }

  // the ship, x = vt
  const xs = X(s.v * t);
  ctx.fillStyle = withAlpha(p.equip, 0.3);
  ctx.strokeStyle = p.equip;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(xs + 9, y);
  ctx.lineTo(xs - 7, y - 6);
  ctx.lineTo(xs - 7, y + 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  heText(ctx, p, 'חללית', xs, rowUp1, { align: 'center', size: 11, color: p.ink });

  // the probe, x = ut (a light pulse when u′ = c)
  const xp = X(k.u * t);
  if (s.light) {
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(xp, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    heText(ctx, p, 'פולס מהחללית', xp - 4, rowDn1, { size: 11, color: p.accent });
  } else {
    ctx.fillStyle = p.velocity;
    ctx.beginPath();
    ctx.arc(xp, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    heText(ctx, p, 'גשושית', xp, rowDn1, { align: 'center', size: 11, color: p.velocity });
  }
  ctx.restore();
}

function paintBars(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, s: AddState, k: Speeds) {
  panel(ctx, p, r, 0.9);
  heText(ctx, p, 'המהירויות ביחס לכדור הארץ', r.x + r.w - 8, r.y + 13, { size: 12, weight: 700, color: p.ink });
  const labelW = 62; // a column of row labels on the right
  const a0 = r.x + 16;
  const a1 = r.x + r.w - labelW - 6;
  const S = (u: number) => a0 + ((u + 1) / 3) * (a1 - a0); // the axis runs from −c to 2c
  const top = r.y + 30;
  const bottom = r.y + r.h - 22;
  const rowH = (bottom - top) / 3;

  // beyond ±c: shaded
  ctx.save();
  ctx.fillStyle = withAlpha(p.neg, 0.08);
  ctx.fillRect(S(1), top - 4, S(2) - S(1) + 4, bottom - top + 8);
  ctx.fillRect(a0 - 4, top - 4, 4, bottom - top + 8);
  ctx.restore();
  // the axis with c marked
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(a0, bottom);
  ctx.lineTo(a1, bottom);
  ctx.stroke();
  const ticks: [number, string][] = [
    [-1, '−c'],
    [0, '0'],
    [1, 'c'],
    [2, '2c'],
  ];
  for (const [u, lab] of ticks) {
    ctx.beginPath();
    ctx.moveTo(S(u), bottom);
    ctx.lineTo(S(u), bottom + 5);
    ctx.stroke();
    mathText(ctx, p, lab, S(u), bottom + 13, { size: 12, color: p.ink2, italic: lab !== '0' });
  }
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.6;
  for (const u of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(S(u), top - 6);
    ctx.lineTo(S(u), bottom);
    ctx.stroke();
  }
  ctx.restore();

  const bar = (row: number, from: number, to: number, color: string, thick: number, dashed = false) => {
    const yy = top + rowH * (row + 0.5);
    ctx.save();
    if (dashed) ctx.setLineDash([5, 3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = thick;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(S(from), yy);
    ctx.lineTo(S(Math.min(to, 2.02)), yy);
    ctx.stroke();
    ctx.restore();
    return yy;
  };
  const shipColor = withAlpha(p.velocity, 0.45);
  const thick = Math.max(7, Math.min(12, rowH * 0.42));
  // row 0: the ship
  const y0 = bar(0, 0, s.v, shipColor, thick);
  if (s.v > 0.04) mathText(ctx, p, 'v', S(s.v) + 9, y0, { color: p.velocity, size: 13 });
  heText(ctx, p, 'חללית', r.x + r.w - 8, y0, { size: 12 });
  // row 1: Galilean, v then u′ head to tail
  const y1 = bar(1, 0, s.v, shipColor, thick);
  bar(1, s.v, k.gal, withAlpha(p.ink2, 0.7), thick * 0.7, true);
  // beside the bar's end while there is room before 2c, above it otherwise
  if (k.gal >= 0 && k.gal < 1.5) mathText(ctx, p, 'u′ + v', S(k.gal) + 8, y1, { color: p.ink2, size: 12, align: 'left' });
  else
    mathText(ctx, p, 'u′ + v', clamp(S(k.gal), a0 + 26, a1 - 4) + (k.gal >= 0 ? 4 : -4), y1 - thick - 2, {
      color: p.ink2,
      size: 12,
      align: k.gal >= 0 ? 'right' : 'left',
    });
  heText(ctx, p, 'גליליי', r.x + r.w - 8, y1, { size: 12 });
  // row 2: relativistic
  const y2 = bar(2, 0, k.u, p.velocity, thick);
  mathText(ctx, p, 'u', S(k.u) + (k.u >= 0 ? 9 : -9), y2, { color: p.velocity, size: 13 });
  heText(ctx, p, 'יחסותי', r.x + r.w - 8, y2, { size: 12 });
}

function paintGraph(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, s: AddState, k: Speeds, underTools: boolean) {
  panel(ctx, p, r, 0.55);
  const m = { l: 34, r: 14, t: underTools ? 46 : 26, b: 30 };
  const gx0 = r.x + m.l;
  const gx1 = r.x + r.w - m.r;
  const gy0 = r.y + r.h - m.b; // bottom, u = −1
  const gy1 = r.y + m.t; // top, u = 2
  const X = (up: number) => gx0 + ((up + 1) / 2) * (gx1 - gx0);
  const Y = (u: number) => gy0 - ((u + 1) / 3) * (gy0 - gy1);
  // title: the probe's speed in S as a function of its speed in S′ (math only: no mixed-direction text)
  mathText(ctx, p, 'u(u′)', r.x + m.l, r.y + 14, { align: 'left', size: 13, color: p.ink });

  // grid and axes
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink3, 0.35);
  ctx.lineWidth = 1;
  for (const u of [-1, 0, 1, 2]) {
    ctx.beginPath();
    ctx.moveTo(gx0, Y(u));
    ctx.lineTo(gx1, Y(u));
    ctx.stroke();
  }
  for (const up of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.moveTo(X(up), gy0);
    ctx.lineTo(X(up), gy1);
    ctx.stroke();
  }
  ctx.restore();
  // beyond c
  ctx.save();
  ctx.fillStyle = withAlpha(p.neg, 0.07);
  ctx.fillRect(gx0, gy1, gx1 - gx0, Y(1) - gy1);
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.6;
  for (const u of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(gx0, Y(u));
    ctx.lineTo(gx1, Y(u));
    ctx.stroke();
  }
  ctx.restore();
  for (const [u, lab] of [
    [-1, '−1'],
    [0, '0'],
    [1, '1'],
    [2, '2'],
  ] as [number, string][])
    mathText(ctx, p, lab, gx0 - 6, Y(u), { size: 11, color: p.ink2, italic: false, align: 'right' });
  for (const [up, lab] of [
    [-1, '−1'],
    [0, '0'],
    [1, '1'],
  ] as [number, string][])
    mathText(ctx, p, lab, X(up), gy0 + 11, { size: 11, color: p.ink2, italic: false });
  mathText(ctx, p, 'u′/c', gx1 - 14, gy0 - 10, { size: 12, color: p.ink2 });
  mathText(ctx, p, 'u/c', gx0 + 18, gy1 + 10, { size: 12, color: p.ink2 });

  // Galilean line u = u′ + v
  ctx.save();
  ctx.beginPath();
  ctx.rect(gx0, gy1, gx1 - gx0, gy0 - gy1);
  ctx.clip();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(X(-1), Y(-1 + s.v));
  ctx.lineTo(X(1), Y(1 + s.v));
  ctx.stroke();
  ctx.setLineDash([]);
  // the relativistic curve
  ctx.strokeStyle = p.velocity;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const up = -1 + (2 * i) / 80;
    const u = addVelocities(up, s.v, 1);
    if (i === 0) ctx.moveTo(X(up), Y(u));
    else ctx.lineTo(X(up), Y(u));
  }
  ctx.stroke();
  ctx.restore();
  heText(ctx, p, 'גליליי', X(-0.15), Y(-0.15 + s.v) - 12, { size: 11, color: p.ink2, align: 'center' });
  heText(ctx, p, 'יחסותי', X(0.55), Y(addVelocities(0.55, s.v, 1)) + 14, { size: 11, color: p.velocity, align: 'center' });

  // the current probe: both predictions at its u′
  const px = X(k.up);
  ctx.save();
  ctx.setLineDash([2, 3]);
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(px, Y(Math.min(k.gal, 2)));
  ctx.lineTo(px, Y(k.u));
  ctx.stroke();
  ctx.restore();
  if (k.gal <= 2.0) {
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(px, Y(k.gal), 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = s.light ? p.accent : p.velocity;
  ctx.beginPath();
  ctx.arc(px, Y(k.u), 5.5, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------------------------------------------------ Doppler */

interface DopState {
  beta: number;
  frame: DopplerFrame;
  tau: number;
  playing: boolean;
}

const TLOOP = 10; // scene time of one loop [T₀]
const TAU_DEFAULT = 5;
const DOP_RATE = 1.2; // scene T₀ per wall-clock second
const WORLD_HALF = 9; // the scene spans x from −9 to 9 [cT₀]
const SRC_X = -3.5; // the source's x at τ = 5 (observer frame) or always (source frame)
const OBS_X = 7; // the observer's x (observer frame)
const OBS_X_MID = 3.5; // the observer's x at τ = 5 (source frame)

function dopInitial(p: VelocityDopplerProps): DopState {
  return {
    beta: clamp(snap(p.beta ?? 0.5), -0.9, 0.9),
    frame: p.frame ?? 'observer',
    tau: TAU_DEFAULT,
    playing: false,
  };
}

/** Where everything is at scene time τ, in the chosen frame (c = 1, T₀ = 1). */
function dopScene(s: DopState) {
  const b = s.beta;
  const g = gammaOf(b);
  const obsFrame = s.frame === 'observer';
  // emission period in this frame, the source's and the observer's motion (x = x(τ=0) + v·τ)
  const period = obsFrame ? g : 1;
  const srcV = obsFrame ? b : 0;
  const srcX0 = obsFrame ? SRC_X - 5 * b : SRC_X;
  const obsV = obsFrame ? 0 : -b;
  const obsX0 = obsFrame ? OBS_X : OBS_X_MID + 5 * b;
  return { b, g, obsFrame, period, srcV, srcX0, obsV, obsX0 };
}

function Doppler(props: VelocityDopplerProps) {
  const [s, setS] = useState<DopState>(() => dopInitial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string): boolean => props.tasks?.includes(t) ?? false;
  const done = (t: string) => markTask(`${props.id}:${t}`);

  const change = (patch: Partial<DopState>) => {
    const next: DopState = { ...s, ...patch };
    setS(next);
    if (has('still') && patch.beta !== undefined && next.beta === 0) done('still');
    if (has('recede') && patch.beta !== undefined && next.beta < 0) done('recede');
    if (has('frames') && patch.frame !== undefined && patch.frame !== s.frame && next.beta !== 0) done('frames');
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.beta === 'number') next.beta = clamp(snap(st.beta), -0.9, 0.9);
          if (st.frame === 'observer' || st.frame === 'source') next.frame = st.frame;
          next.tau = typeof st.tau === 'number' ? clamp(st.tau, 0, TLOOP) : TAU_DEFAULT;
          next.playing = typeof st.playing === 'boolean' ? st.playing : false;
          return next;
        });
      }),
    [props.id],
  );

  // playback loops over one scene; frozen in still mode
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000) * DOP_RATE;
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => ({ ...prev, tau: (prev.tau + dt) % TLOOP }));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  useEffect(() => {
    const h = setTimeout(() => setLive(dopDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.beta, s.frame]);

  const [aspect, setAspect] = useState(1.5);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintDoppler(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1 / aspect, animate: false });
  useAspect(canvasRef, 1.5, 0.9, setAspect);
  useEffect(invalidate, [s, aspect]);

  const reset = () => {
    setS(dopInitial(props));
    setLive('האיור אופס.');
  };

  const D = dopplerFactor(s.beta);
  const g = gammaOf(s.beta);
  const motion = s.beta > 0 ? 'מתקרבים' : s.beta < 0 ? 'מתרחקים' : 'במנוחה זה ביחס לזה';

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: מקור אור וצופה לאורך קו אחד. ${dopDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="beta">
            <b class="q">
              <i>β</i> = {num(s.beta)}
            </b>{' '}
            ({motion})
          </span>
          <span data-readout="gamma">
            <b class="q">
              <i>γ</i> = {num(g)}
            </b>
          </span>
          <span data-readout="ratio">
            נקלט: <b class="q">
              <i>f</i>/<i>f</i>₀ = {num(D)}
            </b>
          </span>
          <span data-readout="sound-src">
            קול, מקור נע: <b class="q">{num(classicalDopplerMovingSource(1, s.beta))}</b>
          </span>
          <span data-readout="sound-obs">
            קול, צופה נע: <b class="q">{num(classicalDopplerMovingObserver(1, s.beta))}</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מערכת ייחוס">
            <span class="hint">מבט מ:</span>
            <Toggle label="מערכת הצופה" on={s.frame === 'observer'} onChange={() => change({ frame: 'observer' })} />
            <Toggle label="מערכת המקור" on={s.frame === 'source'} onChange={() => change({ frame: 'source' })} />
          </div>
          <Slider
            label="מהירות ההתקרבות (שלילית: התרחקות)"
            min={-0.9}
            max={0.9}
            step={0.05}
            value={s.beta}
            format={(x) => `β = ${num(x)}`}
            onChange={(x) => change({ beta: snap(x) })}
          />
          <div class="group" role="group" aria-label="זמן">
            <Toggle label={s.playing ? 'עצירה' : 'הפעלה'} on={s.playing} onChange={(on) => setS((prev) => ({ ...prev, playing: on }))} />
          </div>
        </>
      }
    />
  );
}

function dopDescribe(s: DopState): string {
  const D = dopplerFactor(s.beta);
  const who = s.frame === 'observer' ? 'במערכת של הצופה המקור נע' : 'במערכת של המקור הצופה נע';
  const motion = s.beta > 0 ? 'הם מתקרבים' : s.beta < 0 ? 'הם מתרחקים' : 'אין תנועה יחסית';
  return `${who}; ${motion} במהירות ${num(Math.abs(s.beta))} c. הצופה קולט תדירות גדולה פי ${num(D)} מהתדירות של המקור.`;
}

function paintDoppler(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: DopState) {
  const { w, h } = view;
  const narrow = w < 520;
  const scene: Rect = { x: 0, y: 0, w, h: h * (narrow ? 0.56 : 0.6) };
  const rows: Rect = { x: 0, y: scene.h, w, h: h - scene.h };
  paintWaves(ctx, p, scene, s);
  paintTicks(ctx, p, rows, s);
}

function paintWaves(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, s: DopState) {
  panel(ctx, p, r, 0.5);
  const k = dopScene(s);
  const ppm = r.w / (2 * WORLD_HALF);
  const cy = r.y + r.h * 0.56;
  const X = (x: number) => r.x + r.w / 2 + x * ppm;
  const tau = s.tau;
  const srcX = k.srcX0 + k.srcV * tau;
  const obsX = k.obsX0 + k.obsV * tau;

  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  // the line of sight
  ctx.strokeStyle = withAlpha(p.ink3, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r.x, cy);
  ctx.lineTo(r.x + r.w, cy);
  ctx.stroke();

  // crests: one per emission, a circle around the place it was emitted, radius c·(τ − t_k)
  const maxR = 2.2 * WORLD_HALF;
  const kHi = Math.floor(tau / k.period + 1e-9);
  const kLo = Math.ceil((tau - maxR) / k.period);
  let lastArrival = -Infinity;
  for (let i = kLo; i <= kHi; i++) {
    const te = i * k.period;
    const xe = k.srcX0 + k.srcV * te;
    const rad = tau - te;
    const a = 0.85 * (1 - rad / maxR);
    ctx.strokeStyle = withAlpha(p.accent, Math.max(0.12, a));
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(X(xe), cy, Math.max(0.5, rad * ppm), 0, Math.PI * 2);
    ctx.stroke();
    const ta = arrivalTime({ t: te, x: xe }, k.obsX0, k.obsV, 1);
    if (ta <= tau) lastArrival = Math.max(lastArrival, ta);
  }

  // the source: a lamp, with its velocity in this frame
  const sx = X(srcX);
  ctx.fillStyle = withAlpha(p.equip, 0.35);
  ctx.strokeStyle = p.equip;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(sx, cy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  heText(ctx, p, 'מקור', sx, cy - 22, { align: 'center', size: 12, color: p.ink });
  if (k.srcV !== 0) arrow(ctx, sx, cy + 18, sx + k.srcV * 2.2 * ppm, cy + 18, { color: p.velocity, width: 2.5, head: 9 });

  // the observer: a detector that lights up for a moment when a crest arrives
  const ox = X(obsX);
  const flash = tau - lastArrival < 0.15;
  ctx.fillStyle = flash ? p.accent : withAlpha(p.paper, 0.9);
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.rect(ox - 6, cy - 9, 12, 18);
  ctx.fill();
  ctx.stroke();
  heText(ctx, p, 'צופה', ox, cy - 22, { align: 'center', size: 12, color: p.ink });
  if (k.obsV !== 0) arrow(ctx, ox, cy + 18, ox + k.obsV * 2.2 * ppm, cy + 18, { color: p.velocity, width: 2.5, head: 9 });
  ctx.restore();

  // title, left of the reset and fullscreen buttons
  heText(ctx, p, k.obsFrame ? 'מערכת הצופה: המקור נע' : 'מערכת המקור: הצופה נע', r.x + r.w - 90, r.y + 14, {
    size: 13,
    weight: 700,
    color: p.ink,
  });
}

function paintTicks(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, s: DopState) {
  panel(ctx, p, r, 0.9);
  const b = s.beta;
  const g = gammaOf(b);
  const obsFrame = s.frame === 'observer';
  const rowsDef: { label: string; dt: number; note: string; color: string }[] = obsFrame
    ? [
        { label: 'תקתוקי המקור, בשעון שלו', dt: 1, note: 'T₀', color: p.ink2 },
        { label: 'פליטות, בזמן של מערכת הצופה', dt: g, note: `γT₀ = ${num(g)}T₀`, color: p.ink2 },
        { label: 'קליטות, בשעון הצופה', dt: g * (1 - b), note: `γ(1 − β)T₀ = ${num(g * (1 - b))}T₀`, color: p.accent },
      ]
    : [
        { label: 'פליטות, בשעון המקור', dt: 1, note: 'T₀', color: p.ink2 },
        { label: 'קליטות, בזמן של מערכת המקור', dt: 1 / (1 + b), note: `T₀/(1 + β) = ${num(1 / (1 + b))}T₀`, color: p.ink2 },
        { label: 'קליטות, בשעון הצופה', dt: 1 / (g * (1 + b)), note: `T₀/γ(1 + β) = ${num(1 / (g * (1 + b)))}T₀`, color: p.accent },
      ];
  const W = 6; // T₀ shown
  const short = r.w < 520; // on a phone the formula would run into the row label: the value only
  const a0 = r.x + 14;
  const a1 = r.x + r.w - 14;
  const T = (t: number) => a0 + (t / W) * (a1 - a0);
  const rowH = (r.h - 8) / 3;
  rowsDef.forEach((row, i) => {
    const yl = r.y + 6 + rowH * i + rowH * 0.34; // label line
    const ya = r.y + 6 + rowH * i + rowH * 0.78; // tick line
    heText(ctx, p, row.label, r.x + r.w - 10, yl, { size: 12, color: row.color === p.accent ? p.ink : p.ink2, weight: 600 });
    ctx.strokeStyle = withAlpha(p.ink3, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a0, ya);
    ctx.lineTo(a1, ya);
    ctx.stroke();
    ctx.strokeStyle = row.color;
    ctx.lineWidth = 2.2;
    for (let t = 0; t <= W + 1e-9; t += row.dt) {
      ctx.beginPath();
      ctx.moveTo(T(t), ya - 7);
      ctx.lineTo(T(t), ya + 4);
      ctx.stroke();
    }
    // the first interval, bracketed and labelled
    const xa = T(0);
    const xb = T(row.dt);
    ctx.strokeStyle = withAlpha(row.color, 0.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(xa, ya - 10);
    ctx.lineTo(xb, ya - 10);
    ctx.stroke();
    const note = short && row.note.includes('=') ? `${row.note.split('= ')[1]}` : row.note;
    mathText(ctx, p, note, Math.max(xb, xa + 8) + 4, yl, { align: 'left', size: 12, color: row.color === p.accent ? p.accent : p.ink2 });
  });
}
