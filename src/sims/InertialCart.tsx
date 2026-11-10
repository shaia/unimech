/**
 * InertialCart: inertial frames and the second law as a vector equation (lesson 2.1).
 *
 * mode 'cart' (default): a car on a straight road, and a puck on its frictionless floor, 2.0 m from either
 *   wall, at rest relative to the car at t = 0. The car starts at V0 and accelerates at A (A < 0 brakes it to
 *   a stop). Two panels, one above the other: the top from the ground (frame S), the bottom from the car
 *   (frame S'). Free, nothing pushes the puck horizontally: on the ground it keeps V0 (ΣF = 0, a = 0), in the
 *   car it accelerates at −A with no force on it, so ΣF = m a′ fails there. Tied, a string pulls the puck
 *   toward the wall the car accelerates to: on the ground ΣF = m A = m a, in the car the puck stays at rest
 *   while the string pulls it. Each panel says whether ΣF = m a holds in its frame. No fictitious force is
 *   ever drawn (chapter 7).
 * mode 'forces': a puck on a horizontal air table seen from above (x east, y north), with up to three
 *   horizontal forces. The forces are drawn from the puck; "ראש לזנב" chains them head to tail and the net
 *   force ΣF closes the chain. An inset shows a = ΣF/m. The puck can start with a velocity v0 east, and
 *   "הפעלה" runs 2 s of the motion r = r0 + v0 t + ½ a t², so the path bends toward ΣF, not along v.
 *
 * Physics: src/physics/secondlaw.ts (puckState, wallContactTime, carPosition, netForce, sumOfMagnitudes,
 * accelerationFromForces, headToTail, constantForceMotion). Canvas world coordinates are y-up.
 *
 * Props (Astro wrapper: <Spread fig="fig-2-1a" figure={InertialCart} figureProps={{ mode: 'cart', … }}>)
 *   id      figure id (Spread passes it); steps address the figure by it, tasks are `${id}:${task}`
 *   mode    'cart' | 'forces'                                                             (default 'cart')
 *   cart:   V0 (0…2 m/s, default 0), A (−3…3 m/s², default 2), m (0.5…2 kg, default 1), tied (default false)
 *   forces: F1, F2, F3 (0…5 N; defaults 4, 3, 0), th1, th2, th3 (direction, degrees counter-clockwise from
 *           east; defaults 0, 90, 180), m (1…4 kg, default 2), v0 (0…3 m/s east, default 0), chain (false)
 *   tasks   task ids to show (below)
 *
 * Step `set` keys: cart: V0, A, m, tied, prog (fraction of the run shown, 0…1), playing.
 *   forces: F1, F2, F3, th1, th2, th3, m, v0, chain, sel (0, 1, 2), prog (fraction of the 2 s, 0…1), playing.
 *
 * Tasks, ticked only by the learner's own actions (a step clears what counts as "own"):
 *   steady      the learner plays the car at constant velocity (V0 ≠ 0, A = 0) to the end: the free puck stays put
 *   accelerate  the learner sets A ≠ 0 and plays a free puck to the end of its run
 *   tied        the learner ties the puck, with A ≠ 0, and plays the run to its end
 *   chain       the learner turns on the head-to-tail chain with at least two forces
 *   balance     the learner changes the forces until |ΣF| < 0.2 N with at least two forces acting
 *   mass        the learner changes the mass while ΣF ≠ 0: the same forces, a different acceleration
 *   curve       the learner runs the motion with v0 ≠ 0 and a net force with a component across v0
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  accelerationFromForces,
  carAcceleration,
  carPosition,
  carVelocity,
  constantForceMotion,
  forceFromPolar,
  headToTail,
  netForce,
  puckState,
  sumOfMagnitudes,
  wallContactTime,
} from '~/physics/secondlaw';
import { len, type Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type InertialCartMode = 'cart' | 'forces';

const TASK_LABEL: Record<string, string> = {
  steady: 'תנו לקרון מהירות התחלתית בלי תאוצה, והפעילו. מה עושה הדסקית בכל אחת מהמערכות?',
  accelerate: 'תנו לקרון תאוצה, והפעילו עד הסוף. האם יש כוח על הדסקית? האם יש לה תאוצה, ובאיזו מערכת?',
  tied: 'קשרו את הדסקית בחוט, תנו לקרון תאוצה והפעילו. באיזו מערכת החוק השני מתקיים עכשיו?',
  chain: 'הדליקו את התצוגה "ראש לזנב" כשפועלים לפחות שני כוחות. איפה נגמרת השרשרת?',
  balance: 'שנו את הכוחות עד שהכוח השקול כמעט אפס, כשפועלים לפחות שני כוחות.',
  mass: 'שנו את המסה בלי לשנות את הכוחות. מה קורה לתאוצה?',
  curve: 'תנו לדסקית מהירות התחלתית מזרחה וכוח שקול בכיוון אחר, והפעילו. לאן המסלול מתעקם?',
};

export interface InertialCartProps {
  id: string;
  mode?: InertialCartMode;
  V0?: number;
  A?: number;
  m?: number;
  tied?: boolean;
  F1?: number;
  F2?: number;
  F3?: number;
  th1?: number;
  th2?: number;
  th3?: number;
  v0?: number;
  chain?: boolean;
  tasks?: string[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const deg = Math.PI / 180;
/** a readout number: 3 significant figures, a true minus sign, and no "−0" */
const num = (x: number) => (Math.abs(x) < 0.005 ? '0' : sci(x, 3).replace('-', '−'));
const vec = (v: Vec2) => `(${num(v[0])}, ${num(v[1])})`;

/* ================================================================== text on the canvas */

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

export default function InertialCart(props: InertialCartProps) {
  return props.mode === 'forces' ? <Forces {...props} /> : <Cart {...props} />;
}

/* ================================================================== cart */

interface CartState {
  V0: number;
  A: number;
  m: number;
  tied: boolean;
  t: number;
  playing: boolean;
}

const D_WALL = 2; // from the puck's centre to the wall it would touch [m]
const PUCK_R = 0.25; // [m]
const HALF_IN = D_WALL + PUCK_R; // inside half-length of the car [m]
const T_MAX = 3; // the longest run [s]
const CART_W = 16; // world width of a panel [m]
const GAP = 0.25; // world gap between the panels [m]
const X_START = -5; // the car's centre at t = 0, ground frame [m]
const cartAspect = (cssWidth: number) => (cssWidth < 520 ? 1.05 : 1.45);
const panelHeight = (aspect: number) => (CART_W / aspect - GAP) / 2;
const vScalePx = (ppm: number) => Math.max(0.45 * ppm, 12); // px per m/s
const aScalePx = (ppm: number) => Math.max(0.45 * ppm, 12); // px per m/s²
const fScalePx = (ppm: number) => Math.max(0.45 * ppm, 12); // px per N

/** How long the run lasts: until a free puck meets a wall, or T_MAX. A tied run lasts as long as its free twin. */
const runEnd = (s: Pick<CartState, 'V0' | 'A'>) => Math.min(T_MAX, s.A !== 0 ? wallContactTime(s.V0, s.A, D_WALL) : Infinity);

function cartInitial(p: InertialCartProps): CartState {
  return {
    V0: clamp(p.V0 ?? 0, 0, 2),
    A: clamp(p.A ?? 2, -3, 3),
    m: clamp(p.m ?? 1, 0.5, 2),
    tied: p.tied ?? false,
    t: 0,
    playing: false,
  };
}

function lawHolds(F: number, m: number, a: number) {
  return Math.abs(F - m * a) < 1e-9;
}

function Cart(props: InertialCartProps) {
  const [s, setS] = useState<CartState>(() => cartInitial(props));
  const [live, setLive] = useState('');
  const touched = useRef(new Set<string>());
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const T = runEnd(s);

  const change = (patch: Partial<CartState>) => {
    for (const k of Object.keys(patch)) touched.current.add(k);
    setS((prev) => {
      const next = { ...prev, ...patch, playing: false };
      next.t = clamp(next.t, 0, runEnd(next));
      return next;
    });
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        touched.current.clear();
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.V0 === 'number') next.V0 = clamp(st.V0, 0, 2);
          if (typeof st.A === 'number') next.A = clamp(st.A, -3, 3);
          if (typeof st.m === 'number') next.m = clamp(st.m, 0.5, 2);
          if (typeof st.tied === 'boolean') next.tied = st.tied;
          if (typeof st.prog === 'number') next.t = clamp(st.prog, 0, 1) * runEnd(next);
          next.t = clamp(next.t, 0, runEnd(next));
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
        const end = runEnd(prev);
        const t = prev.t + dt;
        return t >= end ? { ...prev, t: end, playing: false } : { ...prev, t };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const own = (...keys: string[]) => keys.some((k) => touched.current.has(k));
    const ended = s.t >= T - 1e-9;
    if (!ended || !own('playing')) return;
    if (has('steady') && own('V0', 'A') && s.V0 !== 0 && s.A === 0 && !s.tied) done('steady');
    if (has('accelerate') && own('A') && s.A !== 0 && !s.tied) done('accelerate');
    if (has('tied') && own('tied') && s.tied && s.A !== 0) done('tied');
  }, [s, T, props.id, props.tasks]);

  useEffect(() => {
    const h = setTimeout(() => setLive(cartDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.V0, s.A, s.tied, s.m]);

  const [aspect, setAspect] = useState(1.45);
  const PH = panelHeight(aspect);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintCart(ctx, view, p, s, PH);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: CART_W, worldHeight: 2 * PH + GAP, animate: false });
  useEffect(invalidate, [s, aspect]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(cartAspect(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reset = () => {
    touched.current.clear();
    setS(cartInitial(props));
    setLive('האיור אופס.');
  };

  const k = puckState(s.V0, s.A, s.m, s.tied, s.t);
  const Ac = carAcceleration(s.V0, s.A, s.t);
  const ended = s.t >= T - 1e-9;
  const hitsWall = !s.tied && s.A !== 0 && wallContactTime(s.V0, s.A, D_WALL) <= T_MAX;
  let endText = '';
  if (ended && s.t > 0) {
    if (hitsWall) endText = `הדסקית פוגעת בדופן ${k.xr < 0 ? 'האחורית' : 'הקדמית'} של הקרון אחרי ${num(s.t)} s`;
    else if (!s.tied && Math.abs(k.xr) < 0.005) endText = 'הדסקית נשארה במקומה בקרון';
  }

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: קרון ודסקית על רצפה חלקה. למעלה התנועה במערכת הקרקע, למטה במערכת הקרון. ${cartDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span class="q" data-readout="t">
            <i>t</i> = {num(s.t)} s
          </span>
          <span data-readout="F">
            הכוח השקול על הדסקית: <b class="q">Σ<i>F</i> = {num(k.F)} N</b>
          </span>
          <span data-readout="a">
            קרקע: <b class="q"><i>a</i> = {num(k.a)} m/s²</b> {lawHolds(k.F, s.m, k.a) ? '· החוק השני מתקיים' : '· החוק השני לא מתקיים'}
          </span>
          <span data-readout="ap">
            קרון: <b class="q"><i>a′</i> = {num(k.ar)} m/s²</b> {lawHolds(k.F, s.m, k.ar) ? '· החוק השני מתקיים' : '· החוק השני לא מתקיים'}
          </span>
          <span class="q" data-readout="A">
            <i>A</i> = {num(Ac)} m/s²
          </span>
          {endText && <span data-readout="end">{endText}</span>}
        </>
      }
      controls={
        <>
          <Slider label="מהירות התחלתית של הקרון" min={0} max={2} step={0.5} value={s.V0} format={(v) => `${num(v)} m/s`} onChange={(v) => change({ V0: v })} />
          <Slider label="תאוצת הקרון" min={-3} max={3} step={0.5} value={s.A} format={(v) => `${num(v)} m/s²`} onChange={(v) => change({ A: v })} />
          <Slider label="מסת הדסקית" min={0.5} max={2} step={0.5} value={s.m} format={(v) => `${num(v)} kg`} onChange={(v) => change({ m: v })} />
          <div class="group" role="group" aria-label="חוט והפעלה">
            <Toggle label="חוט קושר את הדסקית לדופן" on={s.tied} onChange={(on) => change({ tied: on })} />
            <Toggle
              label={s.playing ? 'עצירה' : 'הפעלה'}
              on={s.playing}
              onChange={(on) => {
                touched.current.add('playing');
                if (on && s.t >= T - 1e-9) setS((prev) => ({ ...prev, t: 0, playing: true }));
                else setS((prev) => ({ ...prev, playing: on }));
              }}
            />
          </div>
          <Slider
            label="זמן"
            min={0}
            max={Math.round(T * 100) / 100}
            step={0.01}
            value={Math.round(s.t * 100) / 100}
            format={(v) => `${num(v)} s`}
            onChange={(v) => setS((prev) => ({ ...prev, t: v >= Math.round(T * 100) / 100 ? T : clamp(v, 0, T), playing: false }))}
          />
        </>
      }
    />
  );
}

/**
 * The figure's spoken description. It follows the physics of puckState: a car at rest cannot brake (A < 0 with
 * V0 = 0 leaves it standing, and carAcceleration is 0), and a car that never accelerates gives a tied puck no pull,
 * since F = m·0 = 0; in both cases the law holds in both frames.
 */
function cartDescribe(s: CartState): string {
  const accelerates = s.A > 0 || (s.A < 0 && s.V0 > 0);
  const car = !accelerates
    ? s.V0 === 0
      ? s.A < 0
        ? 'הקרון עומד במקום: אין לו מהירות לבלום ממנה, ולכן הוא לא מאיץ.'
        : 'הקרון עומד במקום.'
      : `הקרון נוסע במהירות קבועה של ${num(s.V0)} מטר לשנייה.`
    : s.A > 0
      ? `הקרון מתחיל ב-${num(s.V0)} מטר לשנייה, ומאיץ ב-${num(s.A)} מטר לשנייה בריבוע.`
      : `הקרון מתחיל ב-${num(s.V0)} מטר לשנייה, ובולם ב-${num(-s.A)} מטר לשנייה בריבוע עד שהוא עוצר.`;
  const while_ = s.A < 0 ? ' כל עוד הקרון בולם' : '';
  const puck = !accelerates
    ? s.tied
      ? 'החוט קושר את הדסקית אבל לא צריך למשוך אותה: אין עליה כוח אופקי ואין לה תאוצה, והחוק השני מתקיים בשתי המערכות.'
      : 'אין כוח אופקי על הדסקית, והיא נשארת במקומה בקרון: החוק השני מתקיים בשתי המערכות.'
    : s.tied
      ? `חוט מושך את הדסקית, והיא נעה יחד עם הקרון: במערכת הקרקע הכוח שווה למסה כפול התאוצה; במערכת הקרון${while_} יש כוח בלי תאוצה.`
      : `אין כוח אופקי על הדסקית. במערכת הקרקע היא שומרת על מהירותה; במערכת הקרון${while_} היא מאיצה בלי כוח, והחוק השני לא מתקיים שם.`;
  return `${car} ${puck}`;
}

function paintCart(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: CartState, PH: number) {
  const { w, ppm } = view;
  const k = puckState(s.V0, s.A, s.m, s.tied, s.t);
  const X = X_START + carPosition(s.V0, s.A, s.t);
  const Vc = carVelocity(s.V0, s.A, s.t);
  const Ac = carAcceleration(s.V0, s.A, s.t);
  const vs = vScalePx(ppm);
  const as = aScalePx(ppm);
  const fs = fScalePx(ppm);
  const top = (view.h - (2 * PH + GAP) * ppm) / 2;
  const Y_FLOOR = 0.55; // the road sits this far above the panel's bottom [m]
  const FLOOR = 0.45; // the car's floor above the road [m]
  const frameColor = withAlpha(p.velocity, 0.6);

  for (const ground of [true, false]) {
    const y0 = top + (ground ? 0 : (PH + GAP) * ppm);
    const sx = (x: number) => w / 2 + x * ppm;
    const sy = (y: number) => y0 + (PH - Y_FLOOR - y) * ppm;
    const camX = ground ? 0 : X;
    const toX = (xGround: number) => sx(xGround - camX);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, w, PH * ppm);
    ctx.clip();
    ctx.fillStyle = withAlpha(p.paper2, ground ? 0.55 : 0.9);
    ctx.fillRect(0, y0, w, PH * ppm);

    // the road, with a tick every metre that slides in the car frame
    const yR = sy(0);
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, yR);
    ctx.lineTo(w, yR);
    ctx.stroke();
    for (let g = Math.ceil(camX - 9); g <= camX + 9; g++) {
      const x = toX(g);
      ctx.beginPath();
      ctx.moveTo(x, yR);
      ctx.lineTo(x, yR + (g % 2 === 0 ? 7 : 4));
      ctx.stroke();
    }
    // the puck's starting place, marked on the road
    const xs = toX(X_START);
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink2, 0.7);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xs, yR);
    ctx.lineTo(xs, sy(FLOOR + 1.3));
    ctx.stroke();
    ctx.restore();

    // the car: floor, two walls, wheels
    const cx = toX(X);
    const L = sx(-HALF_IN) - sx(0);
    const yF = sy(FLOOR);
    const yTop = sy(FLOOR + 1.5);
    ctx.save();
    ctx.strokeStyle = p.equip;
    ctx.fillStyle = withAlpha(p.equip, 0.12);
    ctx.lineWidth = 2;
    ctx.fillRect(cx + L, yTop, -2 * L, yF - yTop);
    ctx.beginPath();
    ctx.moveTo(cx + L, yTop);
    ctx.lineTo(cx + L, yF);
    ctx.lineTo(cx - L, yF);
    ctx.lineTo(cx - L, yTop);
    ctx.stroke();
    ctx.fillStyle = p.equip;
    for (const dx of [-1.5, 1.5]) {
      ctx.beginPath();
      ctx.arc(cx + dx * ppm, sy(0.2), Math.max(3, 0.2 * ppm), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // the puck
    const px = toX(X_START + k.x);
    const py = sy(FLOOR + PUCK_R);
    // the string, from the puck to the wall the car accelerates toward
    if (s.tied && s.A !== 0) {
      // L < 0: cx − L is the front (right) wall, cx + L the back one
      const wallX = s.A > 0 ? cx - L : cx + L;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(wallX, py);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(px, py, PUCK_R * ppm, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // arrows on the puck: velocity and acceleration in this frame, and the net force (frame-independent)
    const v = ground ? k.v : k.vr;
    const a = ground ? k.a : k.ar;
    const yV = py - PUCK_R * ppm - 0.55 * ppm;
    if (Math.abs(v) > 0.01) {
      arrow(ctx, px, yV, px + v * vs, yV, { color: p.velocity, width: 3, head: 10 });
      mathText(ctx, p, ground ? 'v' : 'v′', px + v * vs + (v > 0 ? 10 : -10), yV - 9, { color: p.velocity });
    }
    const yA = yV - 0.5 * ppm;
    if (Math.abs(a) > 0.01) {
      arrow(ctx, px, yA, px + a * as, yA, { color: p.accel, width: 3, head: 10 });
      mathText(ctx, p, ground ? 'a' : 'a′', px + a * as + (a > 0 ? 10 : -10), yA - 9, { color: p.accel });
    }
    if (Math.abs(k.F) > 0.01) {
      const yFo = py + 0.05 * ppm;
      arrow(ctx, px, yFo, px + k.F * fs, yFo, { color: p.force, width: 3.5, head: 11 });
      mathText(ctx, p, 'T', px + k.F * fs / 2, yFo + 12, { color: p.force, size: 13 });
    }

    // the car's own velocity and acceleration, on the ground panel only, above the roof
    if (ground) {
      const yv = yTop - 0.35 * ppm;
      if (Math.abs(Vc) > 0.01) {
        ctx.save();
        ctx.setLineDash([5, 3]);
        arrow(ctx, cx, yv, cx + Vc * vs, yv, { color: frameColor, width: 2.5, head: 9 });
        ctx.restore();
        mathText(ctx, p, 'V', cx + Vc * vs + (Vc > 0 ? 10 : -10), yv, { color: p.velocity, size: 13 });
      }
      if (Math.abs(Ac) > 0.01) {
        const ya = yv - 0.42 * ppm;
        ctx.save();
        ctx.setLineDash([5, 3]);
        arrow(ctx, cx, ya, cx + Ac * as, ya, { color: withAlpha(p.accel, 0.65), width: 2.5, head: 9 });
        ctx.restore();
        mathText(ctx, p, 'A', cx + Ac * as + (Ac > 0 ? 10 : -10), ya, { color: p.accel, size: 13 });
      }
    }

    // the verdict of this frame, on the left: ΣF against m·a
    const holds = lawHolds(k.F, s.m, a);
    const y1 = y0 + 16;
    mathText(ctx, p, `ΣF = ${num(k.F)} N`, 10, y1, { align: 'left', size: 13, color: p.force });
    mathText(ctx, p, `m${ground ? 'a' : 'a′'} = ${num(s.m * a)} N`, 10, y1 + 18, { align: 'left', size: 13, color: p.accel });
    const verdict = holds ? 'החוק השני מתקיים' : 'החוק השני לא מתקיים';
    // a Hebrew verdict, right-aligned at the end of the left column
    ctx.save();
    ctx.font = `700 13px ${p.fontUi}`;
    const vw = ctx.measureText(verdict).width;
    ctx.restore();
    heText(ctx, p, verdict, 10 + vw, y1 + 37, { size: 13, weight: 700, color: holds ? p.ink : p.neg });

    // panel title, left of the reset and fullscreen buttons (top right, ~90 px)
    const right = w - 90;
    const tw = heText(ctx, p, ground ? 'מערכת הקרקע' : 'מערכת הקרון', right, y0 + 14, { size: 13, weight: 700, color: p.ink });
    mathText(ctx, p, ground ? 'S' : 'S′', right - tw - 8, y0 + 14, { align: 'right', size: 14, color: p.ink });
    ctx.restore();
  }
}

/* ================================================================== forces */

interface ForcesState {
  F: [number, number, number];
  th: [number, number, number]; // degrees
  sel: number;
  m: number;
  v0: number;
  chain: boolean;
  t: number;
  playing: boolean;
}

const T_PLAY = 2; // seconds of motion shown
const TABLE_W = 12; // world [m]
const TABLE_H = 8;
const R0: Vec2 = [-3, -1.5]; // the puck's start
const F_SCALE = 0.4; // world metres per newton
const V_SCALE = 0.5; // world metres per m/s
const INSET_R = 1.3; // inset radius [m]

function forcesInitial(p: InertialCartProps): ForcesState {
  return {
    F: [clamp(p.F1 ?? 4, 0, 5), clamp(p.F2 ?? 3, 0, 5), clamp(p.F3 ?? 0, 0, 5)],
    th: [p.th1 ?? 0, p.th2 ?? 90, p.th3 ?? 180].map((x) => ((Math.round(x) % 360) + 360) % 360) as [number, number, number],
    sel: 0,
    m: clamp(p.m ?? 2, 1, 4),
    v0: clamp(p.v0 ?? 0, 0, 3),
    chain: p.chain ?? false,
    t: 0,
    playing: false,
  };
}

const forceList = (s: ForcesState): Vec2[] => s.F.map((F, i) => forceFromPolar(F, s.th[i] * deg));

function Forces(props: InertialCartProps) {
  const [s, setS] = useState<ForcesState>(() => forcesInitial(props));
  const [live, setLive] = useState('');
  const touched = useRef(new Set<string>());
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const change = (patch: Partial<ForcesState>) => {
    for (const k of Object.keys(patch)) touched.current.add(k);
    setS((prev) => ({ ...prev, ...patch, t: 0, playing: false }));
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        touched.current.clear();
        setS((prev) => {
          const next = { ...prev, F: [...prev.F] as ForcesState['F'], th: [...prev.th] as ForcesState['th'] };
          (['F1', 'F2', 'F3'] as const).forEach((key, i) => {
            if (typeof st[key] === 'number') next.F[i] = clamp(st[key] as number, 0, 5);
          });
          (['th1', 'th2', 'th3'] as const).forEach((key, i) => {
            if (typeof st[key] === 'number') next.th[i] = (((st[key] as number) % 360) + 360) % 360;
          });
          if (typeof st.m === 'number') next.m = clamp(st.m, 1, 4);
          if (typeof st.v0 === 'number') next.v0 = clamp(st.v0, 0, 3);
          if (typeof st.chain === 'boolean') next.chain = st.chain;
          if (typeof st.sel === 'number') next.sel = clamp(Math.round(st.sel), 0, 2);
          next.t = typeof st.prog === 'number' ? clamp(st.prog, 0, 1) * T_PLAY : 0;
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
        const t = prev.t + dt;
        return t >= T_PLAY ? { ...prev, t: T_PLAY, playing: false } : { ...prev, t };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  const forces = forceList(s);
  const Fnet = netForce(forces);
  const a = accelerationFromForces(forces, s.m);
  const acting = s.F.filter((F) => F > 0).length;

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const own = (...keys: string[]) => keys.some((k) => touched.current.has(k));
    if (has('chain') && own('chain') && s.chain && acting >= 2) done('chain');
    if (has('balance') && own('F', 'th') && acting >= 2 && len(Fnet) < 0.2) done('balance');
    if (has('mass') && own('m') && len(Fnet) >= 0.2) done('mass');
    if (has('curve') && own('playing') && s.t >= T_PLAY - 1e-9 && s.v0 > 0 && Math.abs(Fnet[1]) >= 0.2) done('curve');
  }, [s, acting, Fnet[0], Fnet[1], props.id, props.tasks]);

  useEffect(() => {
    const h = setTimeout(() => setLive(forcesDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.F, s.th, s.m, s.v0]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintForces(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: TABLE_W, worldHeight: TABLE_H, animate: false });
  useEffect(invalidate, [s]);

  const reset = () => {
    touched.current.clear();
    setS(forcesInitial(props));
    setLive('האיור אופס.');
  };

  const setSel = (i: number) => setS((prev) => ({ ...prev, sel: i }));
  const setForce = (patch: { F?: number; th?: number }) => {
    if (patch.F !== undefined) touched.current.add('F');
    if (patch.th !== undefined) touched.current.add('th');
    setS((prev) => {
      const F = [...prev.F] as ForcesState['F'];
      const th = [...prev.th] as ForcesState['th'];
      if (patch.F !== undefined) F[prev.sel] = patch.F;
      if (patch.th !== undefined) th[prev.sel] = patch.th;
      return { ...prev, F, th, t: 0, playing: false };
    });
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: דסקית על שולחן אוויר במבט מלמעלה, ועליה עד שלושה כוחות אופקיים. ${forcesDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={TABLE_W / TABLE_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="sum">
            <b class="q">Σ<i>F</i> = {vec(Fnet)} N</b>
          </span>
          <span class="q" data-readout="Fmag">
            |Σ<i>F</i>| = {num(len(Fnet))} N
          </span>
          <span data-readout="mags">
            סכום הגדלים: <b class="q">{num(sumOfMagnitudes(forces))} N</b>
          </span>
          <span data-readout="a">
            <b class="q"><i>a</i> = Σ<i>F</i>/<i>m</i> = {vec(a)} m/s²</b>
          </span>
          <span class="q" data-readout="amag">
            |<i>a</i>| = {num(len(a))} m/s²
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="בחירת כוח">
            <span class="hint">כוח:</span>
            {[0, 1, 2].map((i) => (
              <Toggle key={i} label={<bdi dir="ltr">{`F${'₁₂₃'[i]}`}</bdi>} on={s.sel === i} onChange={() => setSel(i)} />
            ))}
          </div>
          <Slider label="גודל הכוח הנבחר" min={0} max={5} step={0.5} value={s.F[s.sel]} format={(v) => `${num(v)} N`} onChange={(v) => setForce({ F: v })} />
          <Slider
            label="כיוון הכוח הנבחר (ממזרח, נגד כיוון השעון)"
            min={0}
            max={355}
            step={5}
            value={s.th[s.sel]}
            format={(v) => `${num(v)}°`}
            onChange={(v) => setForce({ th: v })}
          />
          <Slider label="מסת הדסקית" min={1} max={4} step={0.5} value={s.m} format={(v) => `${num(v)} kg`} onChange={(v) => change({ m: v })} />
          <Slider label="מהירות התחלתית מזרחה" min={0} max={3} step={0.5} value={s.v0} format={(v) => `${num(v)} m/s`} onChange={(v) => change({ v0: v })} />
          <div class="group" role="group" aria-label="תצוגה והפעלה">
            <Toggle label="ראש לזנב" on={s.chain} onChange={(on) => change({ chain: on })} />
            <Toggle
              label={s.playing ? 'עצירה' : 'הפעלה'}
              on={s.playing}
              onChange={(on) => {
                touched.current.add('playing');
                if (on && s.t >= T_PLAY - 1e-9) setS((prev) => ({ ...prev, t: 0, playing: true }));
                else setS((prev) => ({ ...prev, playing: on }));
              }}
            />
          </div>
        </>
      }
    />
  );
}

function forcesDescribe(s: ForcesState): string {
  const forces = forceList(s);
  const Fn = netForce(forces);
  const a = accelerationFromForces(forces, s.m);
  const parts = s.F.map((F, i) => (F > 0 ? `כוח ${i + 1}: ${num(F)} ניוטון בכיוון ${num(s.th[i])} מעלות ממזרח` : '')).filter(Boolean);
  return `${parts.join('; ')}. הכוח השקול ${num(len(Fn))} ניוטון, סכום הגדלים ${num(sumOfMagnitudes(forces))} ניוטון. המסה ${num(s.m)} קילוגרם, והתאוצה ${num(len(a))} מטר לשנייה בריבוע, בכיוון הכוח השקול.`;
}

function paintForces(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: ForcesState) {
  const { w, h, ppm } = view;
  const sx = (x: number) => w / 2 + x * ppm;
  const sy = (y: number) => h / 2 - y * ppm;
  const forces = forceList(s);
  const Fn = netForce(forces);
  const a = accelerationFromForces(forces, s.m);
  const v0: Vec2 = [s.v0, 0];

  // the table and a one-metre grid
  ctx.save();
  ctx.fillStyle = withAlpha(p.paper2, 0.6);
  ctx.fillRect(sx(-TABLE_W / 2), sy(TABLE_H / 2), TABLE_W * ppm, TABLE_H * ppm);
  ctx.strokeStyle = withAlpha(p.rule, 0.6);
  ctx.lineWidth = 1;
  for (let x = -TABLE_W / 2 + 1; x < TABLE_W / 2; x++) {
    ctx.beginPath();
    ctx.moveTo(sx(x), sy(TABLE_H / 2));
    ctx.lineTo(sx(x), sy(-TABLE_H / 2));
    ctx.stroke();
  }
  for (let y = -TABLE_H / 2 + 1; y < TABLE_H / 2; y++) {
    ctx.beginPath();
    ctx.moveTo(sx(-TABLE_W / 2), sy(y));
    ctx.lineTo(sx(TABLE_W / 2), sy(y));
    ctx.stroke();
  }
  ctx.restore();

  // the axes: x east, y north, bottom left
  const ox = sx(-TABLE_W / 2 + 0.6);
  const oy = sy(-TABLE_H / 2 + 0.6);
  arrow(ctx, ox, oy, ox + 0.9 * ppm, oy, { color: p.ink2, width: 1.5, head: 7 });
  arrow(ctx, ox, oy, ox, oy - 0.9 * ppm, { color: p.ink2, width: 1.5, head: 7 });
  mathText(ctx, p, 'x', ox + 0.9 * ppm + 9, oy, { color: p.ink2, size: 12 });
  mathText(ctx, p, 'y', ox, oy - 0.9 * ppm - 9, { color: p.ink2, size: 12 });

  // the path so far
  const N = 48;
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink, 0.7);
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const r = constantForceMotion(R0, v0, Fn, s.m, (s.t * i) / N).r;
    if (i === 0) ctx.moveTo(sx(r[0]), sy(r[1]));
    else ctx.lineTo(sx(r[0]), sy(r[1]));
  }
  ctx.stroke();
  ctx.restore();

  const now = constantForceMotion(R0, v0, Fn, s.m, s.t);
  const px = sx(now.r[0]);
  const py = sy(now.r[1]);

  // forces from the puck; the selected one drawn a little heavier
  const fpx = F_SCALE * ppm;
  forces.forEach((F, i) => {
    if (len(F) < 1e-9) return;
    const tx = px + F[0] * fpx;
    const ty = py - F[1] * fpx;
    arrow(ctx, px, py, tx, ty, { color: withAlpha(p.force, s.sel === i ? 0.95 : 0.6), width: s.sel === i ? 2.6 : 2, head: 9 });
    const u = [F[0] / len(F), -F[1] / len(F)];
    mathText(ctx, p, `F${'₁₂₃'[i]}`, tx + u[0] * 13, ty + u[1] * 13, { color: p.force, size: 13 });
  });

  // head to tail: faded copies, each starting where the previous ended
  if (s.chain) {
    const pts = headToTail(forces, [0, 0]);
    ctx.save();
    ctx.setLineDash([5, 3]);
    for (let i = 0; i < forces.length; i++) {
      if (len(forces[i]) < 1e-9) continue;
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      arrow(ctx, px + x1 * fpx, py - y1 * fpx, px + x2 * fpx, py - y2 * fpx, { color: withAlpha(p.force, 0.45), width: 2, head: 8 });
    }
    ctx.restore();
  }

  // the net force, emphasised
  if (len(Fn) > 1e-9) {
    const tx = px + Fn[0] * fpx;
    const ty = py - Fn[1] * fpx;
    arrow(ctx, px, py, tx, ty, { color: p.force, width: 4, head: 13 });
    const u = [Fn[0] / len(Fn), -Fn[1] / len(Fn)];
    mathText(ctx, p, 'ΣF', tx + u[0] * 16 - u[1] * 10, ty + u[1] * 16 + u[0] * 10, { color: p.force, size: 14 });
  }

  // the velocity
  const v = now.v;
  if (len(v) > 0.01) {
    const tx = px + v[0] * V_SCALE * ppm;
    const ty = py - v[1] * V_SCALE * ppm;
    arrow(ctx, px, py, tx, ty, { color: p.velocity, width: 3, head: 11 });
    mathText(ctx, p, 'v', tx + 8, ty + 12, { color: p.velocity });
  }

  // the puck
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(px, py, Math.max(5, 0.22 * ppm), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // the inset: a = ΣF/m, drawn from a dot; long arrows are shortened to fit, the number says the size
  const ix = sx(TABLE_W / 2 - INSET_R - 0.35);
  const iy = sy(-TABLE_H / 2 + INSET_R + 0.5);
  ctx.save();
  ctx.fillStyle = withAlpha(p.paper, 0.9);
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ix, iy, (INSET_R + 0.2) * ppm, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(ix, iy, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const am = len(a);
  if (am > 1e-9) {
    const k = Math.min(0.35, INSET_R / am) * ppm;
    arrow(ctx, ix, iy, ix + a[0] * k, iy - a[1] * k, { color: p.accel, width: 3, head: 10 });
  }
  // below the circle when it fits; on a short canvas (a phone) above it, where it is not cut by the edge
  const ir = (INSET_R + 0.2) * ppm;
  const below = iy + ir + 11;
  mathText(ctx, p, `a = ${num(am)} m/s²`, ix, below + 8 <= h ? below : iy - ir - 10, { color: p.accel, size: 12 });

  // title, left of the reset and fullscreen buttons
  heText(ctx, p, 'שולחן אוויר, מבט מלמעלה', w - 90, 14, { size: 13, weight: 700, color: p.ink });
}
