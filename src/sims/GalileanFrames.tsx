/**
 * GalileanFrames: one motion described from two frames of reference (lesson 1.5).
 *
 * mode 'toss' (default): a cart rolls along the ground. A ball is thrown from a hand on the cart, with
 *   velocity u' = (ux, uy) relative to the cart. Two panels, one above the other, show the same flight:
 *   the top one from the ground (frame S), the bottom one from the cart (frame S', moving at +V along x).
 *   On the ground the ball's velocity is v = u' + V; in the cart it is v' = v − V. The acceleration arrow
 *   is drawn in both panels; with the cart at constant velocity it is the same arrow, g down. If the cart
 *   accelerates (A ≠ 0, along x), the cart frame sees a' = a − A, and the ball no longer lands in the hand.
 * mode 'river': a river of width 60 m flows at c along +x. A boat moves at u relative to the water, heading
 *   θ from straight across (θ > 0 upstream). The ground frame shows its velocity v = u + c (the triangle
 *   of velocities) and its slanted path; the water frame (moving with the current) shows the boat going
 *   straight along its heading while the banks slide back at −c.
 *
 * Physics: src/physics/galilean.ts (toMovingFrame, velocityInFrame, accelerationInFrame,
 * positionConstAccel, crossing). Gravity G from constants.ts. Canvas world coordinates are y-up.
 *
 * Props (Astro wrapper: <Spread fig="fig-1-5a" figure={GalileanFrames} figureProps={{ mode: 'toss', … }}>)
 *   id          figure id (Spread passes it); steps address the figure by it, tasks are `${id}:${task}`
 *   mode        'toss' | 'river'                                                        (default 'toss')
 *   toss:  V (cart velocity, 0…4 m/s, default 3), ux (−4…4, default 0), uy (2…5, default 5) [m/s],
 *          A (cart acceleration along x, −3…3 m/s², default 0), showSum (draw v = v' + V, default false)
 *   river: u (1…3 m/s, default 2), c (0…2 m/s, default 1.5), theta (heading [deg], −30…80, default 0),
 *          frame ('ground' | 'water', default 'ground')
 *   tasks       task ids to show (below)
 *
 * Step `set` keys: toss: V, ux, uy, A, prog (fraction of the flight shown, 0…1), showSum, playing.
 *   river: u, c, theta, prog (fraction of the crossing, 0…1), frame, playing. Numbers are clamped.
 *
 * Tasks, ticked only by the learner's own actions (a step clears what counts as "own", so a state a step
 * produced never ticks a task):
 *   toss-moving         the learner plays a toss to its landing while the cart moves (V ≠ 0) at constant velocity
 *   straight-up-ground  the learner sets ux = −V with V ≠ 0, A = 0: on the ground the ball goes straight up
 *   brake               the learner sets A ≠ 0 and plays the toss to its landing: it misses the hand
 *   fastest             with a current (c > 0) and the heading straight across (θ = 0), the learner changes c:
 *                       the crossing time does not change
 *   opposite            the learner finds a heading that lands within 1.5 m of the point opposite the start
 *   water-frame         the learner switches to the water frame while there is a current
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import {
  accelerationInFrame,
  boatGroundVelocity,
  crossing,
  positionConstAccel,
  velocityInFrame,
} from '~/physics/galilean';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type GalileanMode = 'toss' | 'river';
type RiverFrame = 'ground' | 'water';

const TASK_LABEL: Record<string, string> = {
  'toss-moving': 'הפעילו זריקה כשהעגלה נוסעת, וצפו בה עד הנחיתה. השוו את המסלול בשני החלונות.',
  'straight-up-ground': 'קבעו את המהירות האופקית של הזריקה ביחס לעגלה כך שעל הקרקע הכדור יעלה וירד אנכית.',
  brake: 'תנו לעגלה תאוצה (בלימה או האצה), והפעילו זריקה. איפה הכדור נוחת ביחס ליד?',
  fastest: 'כוונו את הסירה ישר לרוחב הנהר, ושנו את מהירות הזרם. מה קורה לזמן החצייה?',
  opposite: 'מצאו כיוון שבו הסירה מגיעה לנקודה שמול נקודת היציאה, B.',
  'water-frame': 'עברו למערכת של המים. לאן נעה הסירה במערכת הזו?',
};

export interface GalileanFramesProps {
  id: string;
  mode?: GalileanMode;
  V?: number;
  ux?: number;
  uy?: number;
  A?: number;
  showSum?: boolean;
  u?: number;
  c?: number;
  theta?: number;
  frame?: RiverFrame;
  tasks?: string[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const deg = Math.PI / 180;
/** a readout number: 3 significant figures, a true minus sign, and no "−0" */
const num = (x: number) => (Math.abs(x) < 0.005 ? '0' : sci(x, 3).replace('-', '−'));
const vec = (v: Vec2) => `(${num(v[0])}, ${num(v[1])})`;

/* ================================================================== text on the canvas */

/** Latin/math label, LTR, italic by default, centred on (x, y). */
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
  // a paper halo keeps labels readable over lines and arrows
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Hebrew label, RTL, its right edge at x. Returns its width. */
function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; weight?: number } = {}) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
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

/* ================================================================== the component */

export default function GalileanFrames(props: GalileanFramesProps) {
  return props.mode === 'river' ? <River {...props} /> : <Toss {...props} />;
}

/* ------------------------------------------------------------------ toss */

interface TossState {
  V: number;
  ux: number;
  uy: number;
  A: number;
  t: number;
  playing: boolean;
  showSum: boolean;
}

const TOSS_W = 14; // world width [m]
const GAP = 0.25; // world gap between the two panels [m]
/** stage width / height: a taller stage on a phone, so each panel keeps room for its labels */
const tossAspect = (cssWidth: number) => (cssWidth < 520 ? 1.05 : 1.45);
/** world height of one panel [m] for a given stage aspect */
const panelHeight = (aspect: number) => (TOSS_W / aspect - GAP) / 2;
const HAND = 1.6; // launch height above the ground [m]: the cart top is at 0.75 m, the hand well above it
const X0 = -3; // where the hand is at t = 0, in the ground frame [m]
/** arrow scales in CSS px per m/s and per m/s², never below a readable length on a phone */
const vScalePx = (ppm: number) => Math.max(0.17 * ppm, 8);
const aScalePx = (ppm: number) => Math.max(0.075 * ppm, 2.2);
const PLAY_RATE = 0.5; // the flight plays at half speed

const flightTime = (uy: number) => (2 * uy) / G;

function tossInitial(p: GalileanFramesProps): TossState {
  return {
    V: clamp(p.V ?? 3, 0, 4),
    ux: clamp(p.ux ?? 0, -4, 4),
    uy: clamp(p.uy ?? 5, 2, 5),
    A: clamp(p.A ?? 0, -3, 3),
    t: 0,
    playing: false,
    showSum: p.showSum ?? false,
  };
}

/** Everything the toss panels and the readout need at time t. */
function tossKinematics(s: TossState, t: number) {
  const g: Vec2 = [0, -G];
  const frameA: Vec2 = [s.A, 0];
  const uPrime: Vec2 = [s.ux, s.uy];
  const v0: Vec2 = [s.ux + s.V, s.uy]; // v = u' + V at launch
  const ball = positionConstAccel([X0, HAND], v0, g, t);
  const handX = X0 + s.V * t + 0.5 * s.A * t * t;
  const frameV: Vec2 = [s.V + s.A * t, 0];
  const v: Vec2 = [v0[0], v0[1] - G * t];
  const vPrime = velocityInFrame(v, frameV);
  const aPrime = accelerationInFrame(g, frameA);
  // in the cart frame the hand stays at x' = 0
  const ballPrime = positionConstAccel([0, HAND], uPrime, aPrime, t);
  return { g, ball, handX, frameV, v, vPrime, aPrime, ballPrime };
}

function Toss(props: GalileanFramesProps) {
  const [s, setS] = useState<TossState>(() => tossInitial(props));
  const [live, setLive] = useState('');
  const touched = useRef(new Set<string>());
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const T = flightTime(s.uy);

  const change = (patch: Partial<TossState>) => {
    for (const k of Object.keys(patch)) touched.current.add(k);
    setS((prev) => {
      const next = { ...prev, ...patch };
      next.t = clamp(next.t, 0, flightTime(next.uy));
      return next;
    });
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        touched.current.clear();
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.V === 'number') next.V = clamp(st.V, 0, 4);
          if (typeof st.ux === 'number') next.ux = clamp(st.ux, -4, 4);
          if (typeof st.uy === 'number') next.uy = clamp(st.uy, 2, 5);
          if (typeof st.A === 'number') next.A = clamp(st.A, -3, 3);
          if (typeof st.showSum === 'boolean') next.showSum = st.showSum;
          if (typeof st.prog === 'number') next.t = clamp(st.prog, 0, 1) * flightTime(next.uy);
          next.t = clamp(next.t, 0, flightTime(next.uy));
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
      const dt = Math.min(0.05, (now - last) / 1000) * PLAY_RATE;
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => {
        const end = flightTime(prev.uy);
        const t = prev.t + dt;
        return t >= end ? { ...prev, t: end, playing: false } : { ...prev, t };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  // tasks
  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const own = (...keys: string[]) => keys.some((k) => touched.current.has(k));
    const landed = s.t >= T - 1e-9;
    if (has('toss-moving') && own('playing') && landed && s.V !== 0 && s.A === 0) done('toss-moving');
    if (has('straight-up-ground') && own('ux', 'V') && s.V !== 0 && s.ux === -s.V && s.A === 0) done('straight-up-ground');
    if (has('brake') && own('A') && own('playing') && landed && s.A !== 0) done('brake');
  }, [s, T, props.id, props.tasks]);

  useEffect(() => {
    const h = setTimeout(() => setLive(tossDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.V, s.ux, s.uy, s.A]);

  // the stage is taller on a narrow screen; the canvas width does not depend on the aspect, so no feedback loop
  const [aspect, setAspect] = useState(1.45);
  const PH = panelHeight(aspect);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintToss(ctx, view, p, s, PH);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: TOSS_W, worldHeight: 2 * PH + GAP, animate: false });
  useEffect(invalidate, [s, aspect]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(tossAspect(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reset = () => {
    touched.current.clear();
    setS(tossInitial(props));
    setLive('האיור אופס.');
  };

  const k = tossKinematics(s, s.t);
  const landed = s.t >= T - 1e-9;
  const offset = k.ballPrime[0]; // where the ball is relative to the hand, along the cart
  let landText = '';
  if (landed) {
    if (Math.abs(offset) < 0.01) landText = 'הכדור נוחת ביד';
    else landText = `הכדור נוחת ${num(Math.abs(offset))} m ${offset > 0 ? 'לפני' : 'מאחורי'} היד`;
  }

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: כדור נזרק מעגלה נוסעת. למעלה המסלול במערכת הקרקע, למטה במערכת העגלה. ${tossDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span class="q" data-readout="V">
            <i>V</i> = {num(k.frameV[0])} m/s
          </span>
          <span data-readout="v">
            קרקע: <b class="q"><i>v</i> = {vec(k.v)} m/s</b>
          </span>
          <span data-readout="vp">
            עגלה: <b class="q"><i>v′</i> = {vec(k.vPrime)} m/s</b>
          </span>
          <span class="q" data-readout="a">
            <i>a</i> = {vec(k.g)} m/s²
          </span>
          <span class="q" data-readout="ap">
            <i>a′</i> = {vec(k.aPrime)} m/s²
          </span>
          {landText && <span data-readout="land">{landText}</span>}
        </>
      }
      controls={
        <>
          <Slider label="מהירות העגלה" min={0} max={4} step={1} value={s.V} format={(v) => `${num(v)} m/s`} onChange={(v) => change({ V: v })} />
          <Slider
            label="זריקה ביחס לעגלה, אופקית"
            min={-4}
            max={4}
            step={1}
            value={s.ux}
            format={(v) => `${num(v)} m/s`}
            onChange={(v) => change({ ux: v })}
          />
          <Slider label="זריקה ביחס לעגלה, אנכית" min={2} max={5} step={1} value={s.uy} format={(v) => `${num(v)} m/s`} onChange={(v) => change({ uy: v })} />
          <Slider label="תאוצת העגלה" min={-3} max={3} step={1} value={s.A} format={(v) => `${num(v)} m/s²`} onChange={(v) => change({ A: v })} />
          <div class="group" role="group" aria-label="זמן ותצוגה">
            <Toggle
              label={s.playing ? 'עצירה' : 'זריקה'}
              on={s.playing}
              onChange={(on) => {
                touched.current.add('playing');
                if (on && s.t >= T - 1e-9) setS((prev) => ({ ...prev, t: 0, playing: true }));
                else setS((prev) => ({ ...prev, playing: on }));
              }}
            />
            <Toggle label={<bdi dir="ltr">v = v′ + V</bdi>} on={s.showSum} onChange={(on) => change({ showSum: on })} />
          </div>
          <Slider
            label="זמן"
            min={0}
            max={Math.round(T * 100) / 100}
            step={0.01}
            value={Math.round(s.t * 100) / 100}
            format={(v) => `${num(v)} s`}
            // the slider's end is T rounded to 0.01 s: reaching it means the landing
            onChange={(v) => setS((prev) => ({ ...prev, t: v >= Math.round(T * 100) / 100 ? T : clamp(v, 0, T), playing: false }))}
          />
        </>
      }
    />
  );
}

function tossDescribe(s: TossState): string {
  const vx = s.ux + s.V;
  const cart =
    s.A === 0
      ? `העגלה נוסעת במהירות קבועה של ${num(s.V)} מטר לשנייה ימינה.`
      : `העגלה מתחילה ב-${num(s.V)} מטר לשנייה ותאוצתה ${num(s.A)} מטר לשנייה בריבוע.`;
  const shape =
    s.A !== 0
      ? 'במערכת העגלה לכדור יש גם תאוצה אופקית, והוא לא חוזר ליד.'
      : s.ux === 0
        ? 'במערכת העגלה הכדור עולה ויורד אנכית; במערכת הקרקע הוא נע על פרבולה.'
        : vx === 0
          ? 'במערכת הקרקע הכדור עולה ויורד אנכית; במערכת העגלה הוא נע על פרבולה אחורה.'
          : 'בשתי המערכות הכדור נע על פרבולה, ברוחב אחר.';
  return `${cart} ${shape} התאוצה של הכדור במערכת הקרקע היא g כלפי מטה.`;
}

function paintToss(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: TossState, PH: number) {
  const { w, ppm } = view;
  const T = flightTime(s.uy);
  const k = tossKinematics(s, s.t);
  const vs = vScalePx(ppm);
  const as = aScalePx(ppm);
  const top = (view.h - (2 * PH + GAP) * ppm) / 2;
  const panels: { y0: number; frame: 'ground' | 'cart' }[] = [
    { y0: top, frame: 'ground' },
    { y0: top + (PH + GAP) * ppm, frame: 'cart' },
  ];
  // a panel's world: x from −7 to 7 m, y from −0.6 m (the ruler) to PH − 0.6 m
  const Y_FLOOR = 0.6;
  // the frame velocity V belongs to the velocity colour family: a lighter, dashed tint of --velocity
  const frameColor = withAlpha(p.velocity, 0.6);

  for (const panel of panels) {
    const sx = (x: number) => w / 2 + x * ppm;
    const sy = (y: number) => panel.y0 + (PH - Y_FLOOR - y) * ppm;
    const ground = panel.frame === 'ground';
    // the camera: fixed on the ground in S, riding with the hand in S'
    const camX = ground ? 0 : k.handX;
    const toX = (xGround: number) => sx(xGround - camX);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, panel.y0, w, PH * ppm);
    ctx.clip();
    ctx.fillStyle = withAlpha(p.paper2, ground ? 0.55 : 0.9);
    ctx.fillRect(0, panel.y0, w, PH * ppm);

    // the ground line with a tick every metre; the ticks slide in the cart frame
    const yG = sy(0);
    ctx.strokeStyle = p.ink3;
    ctx.fillStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, yG);
    ctx.lineTo(w, yG);
    ctx.stroke();
    for (let g = Math.ceil(camX - 8); g <= camX + 8; g++) {
      const x = toX(g);
      ctx.beginPath();
      ctx.moveTo(x, yG);
      ctx.lineTo(x, yG + (g % 2 === 0 ? 7 : 4));
      ctx.stroke();
    }

    // where the throw started, marked on the ground
    const xs = toX(X0);
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink2, 0.7);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xs, yG);
    ctx.lineTo(xs, sy(HAND));
    ctx.stroke();
    ctx.restore();

    // the cart and the hand
    const cx = toX(k.handX);
    drawCart(ctx, p, cx, sy, ppm);

    // the cart's own velocity V, in the ground frame: above the cart body, right of the hand's post
    if (ground && Math.abs(k.frameV[0]) > 0.05) {
      const ay = sy(1.05);
      const x1 = cx + 5;
      const x2 = x1 + k.frameV[0] * vs;
      ctx.save();
      ctx.setLineDash([5, 3]);
      arrow(ctx, x1, ay, x2, ay, { color: frameColor, width: 2.5, head: 9 });
      ctx.restore();
      mathText(ctx, p, 'V', x2 + 9, ay, { color: p.velocity, size: 13 });
    }

    // the ball's trace so far, in this panel's frame
    const N = 48;
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const ti = (s.t * i) / N;
      const ki = tossKinematics(s, ti);
      const [tx, ty] = ground ? [toX(ki.ball[0]), sy(ki.ball[1])] : [sx(ki.ballPrime[0]), sy(ki.ballPrime[1])];
      if (i === 0) ctx.moveTo(tx, ty);
      else ctx.lineTo(tx, ty);
    }
    ctx.stroke();
    ctx.restore();

    // the ball
    const bx = ground ? toX(k.ball[0]) : sx(k.ballPrime[0]);
    const by = ground ? sy(k.ball[1]) : sy(k.ballPrime[1]);
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(4, 0.11 * ppm), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // arrows, in CSS px per unit
    const tip = (from: [number, number], v: Vec2, scale: number): [number, number] => [from[0] + v[0] * scale, from[1] - v[1] * scale];

    // acceleration, drawn from the ball, labelled beside its tip (left of it, away from V and v)
    const aa = ground ? k.g : k.aPrime;
    const at = tip([bx, by], aa, as);
    arrow(ctx, bx, by, at[0], at[1], { color: p.accel, width: 2.5, head: 10 });
    mathText(ctx, p, ground ? 'a' : 'a′', at[0] - 11, at[1] - 3, { color: p.accel });

    // velocity in this frame; in S, optionally the sum v = V + v′ head to tail
    const vv = ground ? k.v : k.vPrime;
    if (ground && s.showSum) {
      const t1 = tip([bx, by], k.frameV, vs);
      const t2 = tip(t1, k.vPrime, vs);
      ctx.save();
      ctx.setLineDash([5, 3]);
      arrow(ctx, bx, by, t1[0], t1[1], { color: frameColor, width: 2, head: 9 });
      ctx.restore();
      arrow(ctx, t1[0], t1[1], t2[0], t2[1], { color: withAlpha(p.velocity, 0.6), width: 2, head: 9 });
      if (Math.abs(k.frameV[0]) > 0.3) mathText(ctx, p, 'V', (bx + t1[0]) / 2, (by + t1[1]) / 2 + 11, { color: p.velocity, size: 13 });
      mathText(ctx, p, 'v′', (t1[0] + t2[0]) / 2 + 12, (t1[1] + t2[1]) / 2, { color: p.velocity, size: 13 });
    }
    const vt = tip([bx, by], vv, vs);
    arrow(ctx, bx, by, vt[0], vt[1], { color: p.velocity, width: 3, head: 11 });
    mathText(ctx, p, ground ? 'v' : 'v′', vt[0] + 10, vt[1] - 6, { color: p.velocity });

    // the landing, read in the cart frame
    if (s.t >= T - 1e-9 && !ground) {
      const off = k.ballPrime[0];
      const txt = Math.abs(off) < 0.01 ? 'ביד' : `${num(Math.abs(off))} m ${off > 0 ? 'לפני' : 'מאחורי'} היד`;
      heText(ctx, p, txt, clamp(bx + 40, 120, w - 8), sy(HAND) - 22, { color: p.ink, size: 13 });
    }

    // panel title: frame name and its symbol, left of the reset and fullscreen buttons (top right, ~90 px)
    const right = w - 90;
    const tw = heText(ctx, p, ground ? 'מערכת הקרקע' : 'מערכת העגלה', right, panel.y0 + 14, { size: 13, weight: 700, color: p.ink });
    mathText(ctx, p, ground ? 'S' : 'S′', right - tw - 8, panel.y0 + 14, { align: 'right', size: 14, color: p.ink });
    ctx.restore();
  }
}

function drawCart(ctx: CanvasRenderingContext2D, p: Palette, cx: number, sy: (y: number) => number, ppm: number) {
  const bw = 1.4 * ppm;
  const yTop = sy(0.75);
  const yBot = sy(0.2);
  ctx.save();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = p.equip;
  ctx.fillStyle = withAlpha(p.equip, 0.2);
  ctx.beginPath();
  ctx.roundRect(cx - bw / 2, yTop, bw, yBot - yTop, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.equip;
  const r = 0.12 * ppm;
  for (const dx of [-0.42, 0.42]) {
    ctx.beginPath();
    ctx.arc(cx + dx * ppm, sy(0.12), Math.max(3, r), 0, Math.PI * 2);
    ctx.fill();
  }
  // the hand: a post up to the launch height and a small cup
  ctx.beginPath();
  ctx.moveTo(cx, yTop);
  ctx.lineTo(cx, sy(HAND - 0.08));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 0.16 * ppm, sy(HAND + 0.02));
  ctx.lineTo(cx - 0.1 * ppm, sy(HAND - 0.08));
  ctx.lineTo(cx + 0.1 * ppm, sy(HAND - 0.08));
  ctx.lineTo(cx + 0.16 * ppm, sy(HAND + 0.02));
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ river */

interface RiverState {
  u: number;
  c: number;
  theta: number; // degrees, + upstream
  prog: number;
  playing: boolean;
  frame: RiverFrame;
}

const RIVER_D = 60; // width [m]
const RIVER_W = 150; // world width [m]
const RIVER_H = 84; // world height [m]
const START_X = -25; // the start point A on the near bank [m]
const R_SCALE = 8; // metres of arrow per m/s
const CROSS_SECONDS = 4; // wall-clock seconds for one crossing

function riverInitial(p: GalileanFramesProps): RiverState {
  return {
    u: clamp(p.u ?? 2, 1, 3),
    c: clamp(p.c ?? 1.5, 0, 2),
    theta: clamp(p.theta ?? 0, -30, 80),
    prog: 0,
    playing: false,
    frame: p.frame ?? 'ground',
  };
}

function River(props: GalileanFramesProps) {
  const [s, setS] = useState<RiverState>(() => riverInitial(props));
  const [live, setLive] = useState('');
  const touched = useRef(new Set<string>());
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const change = (patch: Partial<RiverState>) => {
    for (const k of Object.keys(patch)) touched.current.add(k);
    setS((prev) => ({ ...prev, ...patch }));
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        touched.current.clear();
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.u === 'number') next.u = clamp(st.u, 1, 3);
          if (typeof st.c === 'number') next.c = clamp(st.c, 0, 2);
          if (typeof st.theta === 'number') next.theta = clamp(st.theta, -30, 80);
          if (typeof st.prog === 'number') next.prog = clamp(st.prog, 0, 1);
          if (st.frame === 'ground' || st.frame === 'water') next.frame = st.frame;
          next.playing = typeof st.playing === 'boolean' ? st.playing : false;
          return next;
        });
      }),
    [props.id],
  );

  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => {
        const prog = prev.prog + dt / CROSS_SECONDS;
        return prog >= 1 ? { ...prev, prog: 1, playing: false } : { ...prev, prog };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  const cr = crossing(s.u, s.c, s.theta * deg, RIVER_D);

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const own = (...keys: string[]) => keys.some((k) => touched.current.has(k));
    if (has('fastest') && own('c') && s.theta === 0 && s.c > 0) done('fastest');
    if (has('opposite') && own('theta', 'u', 'c') && s.c > 0 && Math.abs(cr.drift) < 1.5) done('opposite');
    if (has('water-frame') && own('frame') && s.frame === 'water' && s.c > 0) done('water-frame');
  }, [s, cr.drift, props.id, props.tasks]);

  useEffect(() => {
    const h = setTimeout(() => setLive(riverDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.u, s.c, s.theta, s.frame]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintRiver(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: RIVER_W, worldHeight: RIVER_H, animate: false });
  useEffect(invalidate, [s]);

  const reset = () => {
    touched.current.clear();
    setS(riverInitial(props));
    setLive('האיור אופס.');
  };

  const v = boatGroundVelocity(s.u, s.c, s.theta * deg);
  const driftText =
    Math.abs(cr.drift) < 0.5 ? 'מול נקודת היציאה' : `${num(Math.abs(cr.drift))} m ${cr.drift > 0 ? 'במורד הזרם' : 'במעלה הזרם'}`;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: סירה חוצה נהר ברוחב 60 מטר. ${riverDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={RIVER_W / RIVER_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="frame">
            {s.frame === 'ground' ? 'מבט מהקרקע' : 'מבט מהמים'}
          </span>
          <span data-readout="time">
            זמן החצייה: <b class="q">{num(cr.time)} s</b>
          </span>
          <span data-readout="drift">
            הגעה: <b>{driftText}</b>
          </span>
          <span data-readout="speed">
            מהירות ביחס לקרקע: <b class="q">{num(Math.hypot(v[0], v[1]))} m/s</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מערכת ייחוס">
            <span class="hint">מבט מ:</span>
            <Toggle label="הקרקע" on={s.frame === 'ground'} onChange={() => change({ frame: 'ground' })} />
            <Toggle label="המים" on={s.frame === 'water'} onChange={() => change({ frame: 'water' })} />
          </div>
          <Slider label="מהירות הסירה ביחס למים" min={1} max={3} step={0.5} value={s.u} format={(x) => `${num(x)} m/s`} onChange={(x) => change({ u: x })} />
          <Slider label="מהירות הזרם" min={0} max={2} step={0.5} value={s.c} format={(x) => `${num(x)} m/s`} onChange={(x) => change({ c: x })} />
          <Slider
            label="כיוון הסירה (מעלה הזרם חיובי)"
            min={-30}
            max={80}
            step={1}
            value={s.theta}
            format={(x) => `${num(x)}°`}
            onChange={(x) => change({ theta: x })}
          />
          <div class="group" role="group" aria-label="זמן">
            <Toggle
              label={s.playing ? 'עצירה' : 'הפעלה'}
              on={s.playing}
              onChange={(on) => {
                if (on && s.prog >= 1) setS((prev) => ({ ...prev, prog: 0, playing: true }));
                else setS((prev) => ({ ...prev, playing: on }));
              }}
            />
          </div>
          <Slider
            label="התקדמות"
            min={0}
            max={1}
            step={0.01}
            value={s.prog}
            format={(x) => `${Math.round(x * 100)}%`}
            onChange={(x) => setS((prev) => ({ ...prev, prog: x, playing: false }))}
          />
        </>
      }
    />
  );
}

function riverDescribe(s: RiverState): string {
  const cr = crossing(s.u, s.c, s.theta * deg, RIVER_D);
  const head = s.theta === 0 ? 'הסירה מכוונת ישר לרוחב הנהר' : `הסירה מכוונת ${num(Math.abs(s.theta))} מעלות ${s.theta > 0 ? 'נגד הזרם' : 'עם הזרם'}`;
  const where = Math.abs(cr.drift) < 0.5 ? 'ומגיעה מול נקודת היציאה' : `ומגיעה ${num(Math.abs(cr.drift))} מטר ${cr.drift > 0 ? 'במורד הזרם' : 'במעלה הזרם'}`;
  const frame = s.frame === 'water' ? 'במבט מהמים הסירה נעה בדיוק לכיוון שאליו היא מכוונת, והגדות נעות אחורה.' : '';
  return `${head}, חוצה ב-${num(cr.time)} שניות ${where}. ${frame}`;
}

function paintRiver(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: RiverState) {
  const { w, h, ppm } = view;
  const th = s.theta * deg;
  const cr = crossing(s.u, s.c, th, RIVER_D);
  const t = s.prog * cr.time;
  const water = s.frame === 'water';
  // world → screen; the river's middle sits a little below the canvas centre (room for the title)
  const sx = (x: number) => w / 2 + x * ppm;
  const sy = (y: number) => h / 2 - (y - RIVER_D / 2 + 3) * ppm;
  // in the water frame everything fixed to the ground slides by −c t
  const shift = water ? -s.c * t : 0;

  // banks and water
  ctx.save();
  ctx.fillStyle = withAlpha(p.accent, 0.08);
  ctx.fillRect(0, sy(RIVER_D), w, sy(0) - sy(RIVER_D));
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 2;
  for (const y of [0, RIVER_D]) {
    ctx.beginPath();
    ctx.moveTo(0, sy(y));
    ctx.lineTo(w, sy(y));
    ctx.stroke();
  }
  // bank posts every 10 m: they slide in the water frame
  ctx.lineWidth = 1.2;
  const x0 = Math.floor((-RIVER_W / 2 - shift) / 10) * 10;
  for (let g = x0; g <= RIVER_W / 2 - shift + 10; g += 10) {
    const x = sx(g + shift);
    ctx.beginPath();
    ctx.moveTo(x, sy(0));
    ctx.lineTo(x, sy(0) + 6);
    ctx.moveTo(x, sy(RIVER_D));
    ctx.lineTo(x, sy(RIVER_D) - 6);
    ctx.stroke();
  }
  ctx.restore();

  // current arrows in the ground frame (the water is at rest in its own frame)
  if (!water && s.c > 0) {
    // only near the sides, away from the boat's usual path and its velocity triangle
    for (const yy of [10, 50]) {
      for (const xx of [-68, 45]) {
        arrow(ctx, sx(xx), sy(yy), sx(xx + s.c * R_SCALE), sy(yy), { color: withAlpha(p.accent, 0.55), width: 1.6, head: 7 });
      }
    }
  }
  if (water && s.c > 0) {
    // the banks move at −c in this frame: a velocity, in the lighter dashed velocity tint
    ctx.save();
    ctx.setLineDash([5, 3]);
    arrow(ctx, sx(55), sy(-5), sx(55 - s.c * R_SCALE), sy(-5), { color: withAlpha(p.velocity, 0.6), width: 2, head: 8 });
    ctx.restore();
    mathText(ctx, p, '−c', sx(55 - s.c * R_SCALE) - 14, sy(-5), { color: p.velocity, size: 13 });
  }

  // A, the start, and B, the point opposite it
  const ax = sx(START_X + shift);
  const bxs = sx(START_X + shift);
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(ax, sy(0), 4, 0, Math.PI * 2);
  ctx.arc(bxs, sy(RIVER_D), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  mathText(ctx, p, 'A', ax - 12, sy(0) + 12, { size: 14 });
  // B inside the river, just below the far bank: above it the label is clipped on a phone
  mathText(ctx, p, 'B', bxs - 12, sy(RIVER_D) + 12, { size: 14 });

  // the boat's velocity in this frame and its position
  const vg = boatGroundVelocity(s.u, s.c, th);
  const vf: Vec2 = water ? velocityInFrame(vg, [s.c, 0]) : vg;
  const start: Vec2 = [START_X, 0];
  const pos: Vec2 = [start[0] + vf[0] * t, start[1] + vf[1] * t];

  // path so far
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, sy(RIVER_D) - 1, w, sy(0) - sy(RIVER_D) + 2);
  ctx.clip();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(sx(start[0]), sy(start[1]));
  ctx.lineTo(sx(pos[0]), sy(pos[1]));
  ctx.stroke();
  ctx.restore();

  const bx = sx(pos[0]);
  const by = sy(pos[1]);
  const onScreen = bx > -10 && bx < w + 10;
  if (onScreen) {
    drawBoat(ctx, p, bx, by, th, ppm);
    // the velocity triangle: u along the heading, c from its tip, v = u + c
    const uVec: Vec2 = [-s.u * Math.sin(th), s.u * Math.cos(th)];
    const tipU: [number, number] = [bx + uVec[0] * R_SCALE * ppm, by - uVec[1] * R_SCALE * ppm];
    if (water) {
      arrow(ctx, bx, by, tipU[0], tipU[1], { color: p.velocity, width: 3, head: 11 });
      mathText(ctx, p, 'u', tipU[0] + 12, tipU[1], { color: p.velocity });
    } else {
      arrow(ctx, bx, by, tipU[0], tipU[1], { color: withAlpha(p.velocity, 0.55), width: 2, head: 9 });
      mathText(ctx, p, 'u', tipU[0] - 12, tipU[1] - 4, { color: p.velocity, size: 13 });
      if (s.c > 0) {
        const tipC: [number, number] = [tipU[0] + s.c * R_SCALE * ppm, tipU[1]];
        // the current is a velocity: the lighter, dashed velocity tint (the boat's v keeps full --velocity)
        ctx.save();
        ctx.setLineDash([5, 3]);
        arrow(ctx, tipU[0], tipU[1], tipC[0], tipC[1], { color: withAlpha(p.velocity, 0.6), width: 2, head: 9 });
        ctx.restore();
        mathText(ctx, p, 'c', (tipU[0] + tipC[0]) / 2, tipU[1] - 11, { color: p.velocity, size: 13 });
      }
      const tipV: [number, number] = [bx + vg[0] * R_SCALE * ppm, by - vg[1] * R_SCALE * ppm];
      arrow(ctx, bx, by, tipV[0], tipV[1], { color: p.velocity, width: 3, head: 11 });
      // the label sits past the tip and off to the downstream side, clear of the arrow and of c
      const L = Math.hypot(tipV[0] - bx, tipV[1] - by) || 1;
      const ux = (tipV[0] - bx) / L;
      const uy = (tipV[1] - by) / L;
      const nx = -uy >= 0 ? -uy : uy;
      const ny = -uy >= 0 ? ux : -ux;
      mathText(ctx, p, 'v', tipV[0] + ux * 8 + nx * 10, tipV[1] + uy * 8 + ny * 10, { color: p.velocity });
    }
  } else {
    // off the visible stretch: an edge marker
    const ex = bx < 0 ? 12 : w - 12;
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.moveTo(ex + (bx < 0 ? -8 : 8), by);
    ctx.lineTo(ex + (bx < 0 ? 5 : -5), by - 8);
    ctx.lineTo(ex + (bx < 0 ? 5 : -5), by + 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // title
  // left of the reset and fullscreen buttons, which take the top-right ~90 px
  heText(ctx, p, water ? 'מערכת המים: נעה עם הזרם' : 'מערכת הקרקע', w - 90, 14, { size: 13, weight: 700, color: p.ink });
}

function drawBoat(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, theta: number, ppm: number) {
  // the hull points along the heading, which is not the direction it moves in the ground frame
  const L = Math.max(16, 5 * ppm);
  const W = L * 0.36;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-theta); // θ > 0 turns the bow upstream, to the left on screen
  ctx.fillStyle = withAlpha(p.equip, 0.3);
  ctx.strokeStyle = p.equip;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, -L / 2);
  ctx.quadraticCurveTo(W / 2, -L / 6, W / 2, L / 2);
  ctx.lineTo(-W / 2, L / 2);
  ctx.quadraticCurveTo(-W / 2, -L / 6, 0, -L / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
