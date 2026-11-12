/**
 * AcceleratedFrame (lesson 7.1): one scene seen from two frames. A box, a cart on rails (mode 'cart', horizontal
 * acceleration A) or an elevator cabin (mode 'elevator', vertical A), holds a bob of mass m = 0.40 kg hanging on a
 * string of length 0.90 m from its ceiling, and a ball held 1.8 m above its floor. The learner sets A, switches between
 * the ground's view (S, inertial: the camera stays on the ground, the box moves) and the box's view (S′: the camera
 * rides with the box, the ground slides by), and releases the ball.
 *
 * In S the bob carries only real forces, its tension T and its weight mg; their sum is mA and the bob accelerates
 * with the box (the acceleration arrow a = A). The released ball falls with a = g. In S′ the bob is at rest; the
 * fictitious force −mA, drawn dashed, balances T + mg. The ball moves on a straight line along g_eff = g − A, the
 * direction of the string, with a′ = g_eff. A corner compass shows g (in S) or g_eff = g + (−A), head to tail (in S′).
 * Mode 'elevator' may offer the box in space (g = 0): accelerating at A = g "up", it shows in S′ exactly what a box
 * at rest on the Earth shows (the equivalence principle).
 *
 * Physics: src/physics/rotating.ts (effectiveGravity, linearFictitiousForce, plumbAngleLinear) and
 * src/physics/accelframe.ts (dropInFrame, hangingTension, constantAcceleration). G from constants.ts. World
 * coordinates are y-up, x forward (to the right).
 *
 * Props (Astro wrapper: <Spread fig="fig-7-1a" figure={AcceleratedFrame} figureProps={{ mode: 'cart', … }}>)
 *   id           figure id; tasks are stored as `${id}:${task}`
 *   mode         'cart' | 'elevator'                                   (default 'cart')
 *   A            the box's acceleration [m/s²], + forward / + up, −9.8…9.8 (space: 0…9.8)   (default 3.5 / 2.5)
 *   view         'ground' | 'frame'                                    (default 'ground')
 *   space        start in space (g = 0), elevator only                 (default false)
 *   spaceToggle  offer the Earth / space choice, elevator only         (default false)
 *   tasks        task ids to show (below)
 *
 * Step `set` keys: A, view, space, t (fraction of the drop shown, 0…1; 0 = the ball still held). Numbers are clamped.
 *
 * Tasks tick only inside the learner's own handlers (the A slider, the view and gravity buttons, the release button);
 * a text step sets the state and never ticks a task.
 *   frame-view  cart: the learner looks from the box (S′) while A ≠ 0
 *   drop        cart: the learner releases the ball while A ≠ 0
 *   brake       cart: the learner sets A < 0 (braking)
 *   up          elevator: the learner releases the ball on the Earth while A > 0
 *   freefall    elevator: the learner sets A = −9.8 m/s² on the Earth (free fall)
 *   space       elevator: the learner puts the box in space with A = +9.8 m/s²
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { constantAcceleration, dropInFrame, hangingTension } from '~/physics/accelframe';
import { G } from '~/physics/constants';
import { effectiveGravity, linearFictitiousForce, plumbAngleLinear } from '~/physics/rotating';
import { len3, scale3, type Vec3 } from '~/physics/vec';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { sci } from './core/format';
import { arrow, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type FrameMode = 'cart' | 'elevator';
export type FrameView = 'ground' | 'frame';

const TASK_LABEL: Record<string, string> = {
  'frame-view': 'תנו לקרון תאוצה, ועברו למבט מהקרון. האם המשקולת מאיצה במערכת הזו? אילו כוחות מאזנים אותה?',
  drop: 'תנו לקרון תאוצה ושחררו את הכדור. איפה הוא נוחת ביחס לנקודה שמתחת לנקודת השחרור, ובאיזה מסלול?',
  brake: 'תנו לקרון לבלום, תאוצה שלילית. לאן נוטה המשקולת עכשיו?',
  up: 'תנו למעלית תאוצה כלפי מעלה ושחררו את הכדור. האם זמן הנפילה ארוך או קצר מזמן הנפילה במעלית שעומדת?',
  freefall: 'קבעו למעלית תאוצה של 9.8 מטר לשנייה בריבוע כלפי מטה. מה קורה למתיחות בחוט ולכדור?',
  space: 'העבירו את התא לחלל, וקבעו לו תאוצה של 9.8 מטר לשנייה בריבוע כלפי מעלה. השוו את הקריאות לתא שעומד על כדור הארץ.',
};

export interface AcceleratedFrameProps {
  id: string;
  mode?: FrameMode;
  A?: number;
  view?: FrameView;
  space?: boolean;
  spaceToggle?: boolean;
  tasks?: string[];
}

interface FrameState {
  A: number;
  view: FrameView;
  space: boolean;
  /** seconds since the release; 0 = the ball still held */
  t: number;
  playing: boolean;
}

/* ------------------------------------------------------------------ the scene's dimensions [m] */

const M_BOB = 0.4; // bob mass [kg]
const L_STRING = 0.9; // string length [m]
const H_RELEASE = 1.8; // release height above the floor [m]
const BOX_H = 2.1; // inner height [m]
const CART_LEN = 3.2;
const CART_WHEELS = 0.35; // floor height above the rails
const CAB_W = 2.4;
const PIVOT_X = 0.6; // |x′| of the bob's pivot, on the side opposite the release point
const RELEASE_X = 0.8;
const ELEV_TRAVEL = 1.85; // largest elevator travel shown in S [m]
const MAX_DROP_TIME = 1.0; // the drop is shown for at most this long [s]
const PLAY_RATE = 0.4; // slow motion
const A_MAX = 9.8;

/** world size [m] per mode */
const WORLD: Record<FrameMode, { w: number; h: number }> = {
  cart: { w: 6.6, h: 3.4 },
  elevator: { w: 5.9, h: BOX_H + ELEV_TRAVEL + 0.9 },
};
/** the world height drawn at the centre of the cart's scene: it spans −0.45 m (below the rails) to 2.95 m */
const CART_CAM_Y = 1.25;
/** the elevator shaft's rails, |x| [m] */
const RAIL_X = CAB_W / 2 + 0.45;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** a readout number: 3 significant figures, a true minus sign, and no "−0" */
const num = (x: number) => (Math.abs(x) < 0.005 ? '0' : sci(x, 3).replace('-', '−'));
/** round a slider value to its 0.1 step without floating noise */
const step01 = (x: number) => Math.round(x * 10) / 10;
/** a quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

/* ------------------------------------------------------------------ physics of the scene */

interface Scene {
  g: Vec3;
  Avec: Vec3;
  geff: Vec3;
  /** time to the floor in S′, or null: the ball never lands */
  tFall: number | null;
  /** the drop shown, [0, tEnd] */
  tEnd: number;
  /** the box's displacement in S at tEnd (along x for the cart, y for the elevator) */
  travel: number;
}

function sceneOf(mode: FrameMode, A: number, space: boolean): Scene {
  const g: Vec3 = [0, space ? 0 : -G, 0];
  const Avec: Vec3 = mode === 'cart' ? [A, 0, 0] : [0, A, 0];
  const geff = effectiveGravity(g, Avec);
  const d = dropInFrame(H_RELEASE, g, Avec);
  const tFall = d ? d.t : null;
  let tEnd = Math.min(tFall ?? MAX_DROP_TIME, MAX_DROP_TIME);
  if (mode === 'elevator' && A !== 0) tEnd = Math.min(tEnd, Math.sqrt((2 * ELEV_TRAVEL) / Math.abs(A)));
  return { g, Avec, geff, tFall, tEnd, travel: 0.5 * A * tEnd * tEnd };
}

/** The point under the release inside the box, its sign follows A so the ball lands inside the cart. */
const sideOf = (mode: FrameMode, A: number) => (mode === 'cart' && A < 0 ? -1 : 1);

/* ------------------------------------------------------------------ canvas text */

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
  ctx.font = `${o.italic === false ? '' : 'italic '}${o.weight ?? 700} ${o.size ?? 13}px ${p.fontUi}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** A symbol with a roman subscript and an optional tail ("g", "eff", " = 0"), LTR, centred on (x, y). */
function subText(ctx: CanvasRenderingContext2D, p: Palette, base: string, sub: string, tail: string, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.fillStyle = color;
  const fBase = `italic 700 ${size}px ${p.fontUi}`;
  const fSub = `600 ${Math.round(size * 0.72)}px ${p.fontUi}`;
  const fTail = `700 ${size}px ${p.fontUi}`;
  ctx.font = fBase;
  const wb = ctx.measureText(base).width;
  ctx.font = fSub;
  const ws = ctx.measureText(sub).width;
  ctx.font = fTail;
  const wt = ctx.measureText(tail).width;
  let cx = x - (wb + ws + wt) / 2;
  ctx.textAlign = 'left';
  const parts: [string, string, number][] = [
    [base, fBase, 0],
    [sub, fSub, size * 0.3],
    [tail, fTail, 0],
  ];
  for (const [txt, font, dy] of parts) {
    if (!txt) continue;
    ctx.font = font;
    ctx.strokeText(txt, cx, y + dy);
    ctx.fillText(txt, cx, y + dy);
    cx += ctx.measureText(txt).width;
  }
  ctx.restore();
}

/** Hebrew label, RTL, its right edge at x. Returns its width. */
function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; weight?: number } = {}) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `${o.weight ?? 600} ${o.size ?? 13}px ${p.fontUi}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink2;
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/* ------------------------------------------------------------------ the component */

export default function AcceleratedFrame(props: AcceleratedFrameProps) {
  const mode: FrameMode = props.mode === 'elevator' ? 'elevator' : 'cart';
  const canSpace = mode === 'elevator' && (props.spaceToggle ?? false);
  const aMin = (space: boolean) => (space ? 0 : -A_MAX);

  const initial = (): FrameState => {
    const space = mode === 'elevator' && (props.space ?? false);
    return {
      A: clamp(props.A ?? (mode === 'cart' ? 3.5 : 2.5), aMin(space), A_MAX),
      view: props.view ?? 'ground',
      space,
      t: 0,
      playing: false,
    };
  };

  const [s, setS] = useState<FrameState>(initial);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };
  const sc = sceneOf(mode, s.A, s.space);

  // text steps set A, the view, the gravity and the instant shown; they never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const space = mode === 'elevator' && typeof st.space === 'boolean' ? st.space : prev.space;
          const A = clamp(isNum(st.A) ? st.A : prev.A, aMin(space), A_MAX);
          const view: FrameView = st.view === 'ground' || st.view === 'frame' ? st.view : prev.view;
          const end = sceneOf(mode, A, space).tEnd;
          const t = isNum(st.t) ? clamp(st.t, 0, 1) * end : 0;
          return { A, view, space, t, playing: false };
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
        const end = sceneOf(mode, prev.A, prev.space).tEnd;
        const t = prev.t + dt;
        return t >= end ? { ...prev, t: end, playing: false } : { ...prev, t };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(mode, s)), 700);
    return () => clearTimeout(h);
  }, [s.A, s.view, s.space]);

  // the stage is taller on a narrow screen
  const wideAspect = mode === 'cart' ? 1.3 : WORLD.elevator.w / WORLD.elevator.h;
  const narrowAspect = mode === 'cart' ? 0.8 : 0.85;
  const [aspect, setAspect] = useState(wideAspect);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, mode, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD[mode].w, worldHeight: WORLD[mode].h, animate: false });
  useEffect(invalidate, [s, aspect]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 520 ? narrowAspect : wideAspect));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------------------------------------------------------------- the learner's handlers (tasks tick only here) */

  const setA = (v: number) => {
    const A = clamp(step01(v), aMin(s.space), A_MAX);
    setS((prev) => ({ ...prev, A, t: 0, playing: false }));
    if (mode === 'cart') {
      if (A !== 0 && s.view === 'frame') done('frame-view');
      if (A < 0) done('brake');
    } else {
      if (!s.space && A <= -A_MAX) done('freefall');
      if (s.space && A >= A_MAX) done('space');
    }
  };
  const setView = (view: FrameView) => {
    setS((prev) => ({ ...prev, view }));
    if (mode === 'cart' && view === 'frame' && s.A !== 0) done('frame-view');
  };
  const setSpace = (space: boolean) => {
    const A = clamp(s.A, aMin(space), A_MAX);
    setS((prev) => ({ ...prev, space, A, t: 0, playing: false }));
    if (space && A >= A_MAX) done('space');
  };
  const release = () => {
    if (mode === 'cart' && s.A !== 0) done('drop');
    if (mode === 'elevator' && !s.space && s.A > 0) done('up');
    if (!motionAllowed()) {
      setS((prev) => ({ ...prev, t: sceneOf(mode, prev.A, prev.space).tEnd, playing: false }));
      setLive('הכדור שוחרר. התנועה מוצגת כולה: מצב סטטי.');
      return;
    }
    setS((prev) => ({ ...prev, t: 0, playing: true }));
    setLive('הכדור שוחרר.');
  };
  // the slider's end is tEnd rounded to 1 ms: reaching it means the end of the drop
  const scrub = (v: number) =>
    setS((prev) => {
      const end = sceneOf(mode, prev.A, prev.space).tEnd;
      return { ...prev, t: v >= Number(end.toFixed(3)) ? end : clamp(v, 0, end), playing: false };
    });
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') setA(s.A + 0.1);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setA(s.A - 0.1);
    else if (e.key === 'Enter' || e.key === ' ') release();
    else return;
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const geffMag = len3(sc.geff);
  const tension = hangingTension(M_BOB, sc.g, sc.Avec);
  const theta = mode === 'cart' && !s.space ? (plumbAngleLinear(G, Math.abs(s.A)) * 180) / Math.PI : 0;
  const box = mode === 'cart' ? 'הקרון' : s.space ? 'התא' : 'המעלית';
  const aDir = mode === 'cart' ? (s.A > 0 ? 'קדימה' : s.A < 0 ? 'אחורה' : '') : s.A > 0 ? 'כלפי מעלה' : s.A < 0 ? 'כלפי מטה' : '';
  const landed = sc.tFall !== null && s.t >= sc.tFall - 1e-9;
  const d = dropInFrame(H_RELEASE, sc.g, sc.Avec);
  let landText = '';
  if (mode === 'cart' && d) {
    const off = d.offset[0];
    landText = Math.abs(off) < 0.005 ? 'מתחת לנקודת השחרור' : `${num(Math.abs(off))} m ${off < 0 ? 'מאחורי' : 'לפני'} הנקודה שמתחת לשחרור`;
  }

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${mode === 'cart' ? 'קרון' : 'מעלית'} עם משקולת תלויה וכדור שמשתחרר, ${s.view === 'ground' ? 'במבט מהקרקע' : `במבט מ${box}`}. ${describe(mode, s)} במקלדת: חיצים משנים את התאוצה, Enter משחרר את הכדור.`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onReset={() => {
        setS(initial());
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        <>
          <span data-readout="view">{s.view === 'ground' ? (s.space ? 'מבט ממערכת אינרציאלית' : 'מבט מהקרקע') : `מבט מ${box}`}</span>
          <span data-readout="A">
            <i>A</i> = <b class="q">{num(Math.abs(s.A))} m/s²</b> {aDir}
          </span>
          <span data-readout="geff">
            |<i>g</i>
            <sub>eff</sub>| = <b class="q">{num(geffMag)} m/s²</b>
          </span>
          {mode === 'cart' && (
            <span data-readout="theta">
              <i>θ</i> = <b class="q">{num(theta)}°</b>
            </span>
          )}
          <span data-readout="tension">
            <i>T</i> = <b class="q">{num(tension)} N</b>
          </span>
          <span data-readout="fall">
            זמן הנפילה: <b class="q">{d ? `${num(d.t)} s` : '∞'}</b>
          </span>
          {landText && (
            <span data-readout="land">
              נחיתה: <b>{landText}</b>
            </span>
          )}
          {s.t > 0 && !landed && !s.playing && sc.tFall !== null && sc.tFall > sc.tEnd + 1e-9 && (
            <span data-readout="cut">הסרטון נעצר לפני שהכדור הגיע לרצפה.</span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מערכת ייחוס">
            <span class="hint">מבט מ:</span>
            <Toggle label={s.space ? 'מערכת אינרציאלית S' : 'הקרקע S'} on={s.view === 'ground'} onChange={() => setView('ground')} />
            <Toggle label={`${box} S′`} on={s.view === 'frame'} onChange={() => setView('frame')} />
          </div>
          {canSpace && (
            <div class="group" role="group" aria-label="כובד">
              <Toggle label="על כדור הארץ" on={!s.space} onChange={() => setSpace(false)} />
              <Toggle label="בחלל, רחוק מכל כוכב" on={s.space} onChange={() => setSpace(true)} />
            </div>
          )}
          <Slider
            label={mode === 'cart' ? 'תאוצת הקרון A (קדימה חיובית)' : `תאוצת ${box} A (כלפי מעלה חיובית)`}
            min={aMin(s.space)}
            max={A_MAX}
            step={0.1}
            value={s.A}
            format={(v) => `${num(v)} m/s²`}
            onChange={setA}
          />
          <div class="group" role="group" aria-label="הכדור">
            <button type="button" class="btn primary" onClick={release}>
              שחררו את הכדור
            </button>
          </div>
          <Slider
            label="זמן מהשחרור"
            min={0}
            max={Number(sc.tEnd.toFixed(3))}
            step={0.001}
            value={Number(s.t.toFixed(3))}
            format={(v) => `${num(v)} s`}
            onChange={scrub}
          />
        </>
      }
    />
  );
}

function describe(mode: FrameMode, s: FrameState): string {
  const sc = sceneOf(mode, s.A, s.space);
  const geff = len3(sc.geff);
  if (mode === 'cart') {
    if (s.A === 0) return 'הקרון לא מאיץ: המשקולת תלויה אנכית, והכדור נופל ישר למטה.';
    const th = (plumbAngleLinear(G, Math.abs(s.A)) * 180) / Math.PI;
    const back = s.A > 0 ? 'אחורה' : 'קדימה';
    return `הקרון מאיץ ב-${num(Math.abs(s.A))} מטר לשנייה בריבוע ${s.A > 0 ? 'קדימה' : 'אחורה (בולם)'}. החוט נוטה ${num(th)} מעלות ${back}, ותאוצת הנפילה האפקטיבית ${num(geff)} מטר לשנייה בריבוע. ${
      s.view === 'ground'
        ? 'במערכת הקרקע פועלים על המשקולת רק המתיחות והכובד, והיא מאיצה עם הקרון.'
        : 'במערכת הקרון המשקולת במנוחה, והכוח המדומה מאזן את המתיחות והכובד. הכדור נע בקו ישר במקביל לחוט.'
    }`;
  }
  const where = s.space ? 'בחלל' : 'על כדור הארץ';
  if (geff === 0) return `${where}, תאוצת הנפילה האפקטיבית אפס: החוט רפוי והכדור לא נופל.`;
  return `${where}, ${s.A === 0 ? 'התא לא מאיץ' : `התא מאיץ ב-${num(Math.abs(s.A))} מטר לשנייה בריבוע ${s.A > 0 ? 'כלפי מעלה' : 'כלפי מטה'}`}. תאוצת הנפילה האפקטיבית ${num(geff)} מטר לשנייה בריבוע, והמתיחות בחוט ${num(hangingTension(M_BOB, sc.g, sc.Avec))} ניוטון.`;
}

/* ------------------------------------------------------------------ painting */

interface Panel {
  /** centre of the drawing and its half-size [px] */
  cx: number;
  cy: number;
  r: number;
  /** the box's bottom-left corner [px] */
  x: number;
  bottom: number;
}

/** A light rounded box behind an inset, with a heading at its top right (Hebrew) or a symbol. */
function panelBox(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, w: number, h: number, heading: string, fs: number) {
  ctx.save();
  ctx.fillStyle = withAlpha(p.paper2, 0.85);
  ctx.strokeStyle = withAlpha(p.ink3, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (heading) heText(ctx, p, heading, x + w - 6, y + 12, { size: fs - 1, weight: 700, color: p.ink2 });
}

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, mode: FrameMode, s: FrameState) {
  const { w, h } = view;
  const narrow = w < 520;
  const fs = narrow ? 12 : 13;
  const sc = sceneOf(mode, s.A, s.space);
  const ground = s.view === 'ground';
  const side = sideOf(mode, s.A);
  const t = clamp(s.t, 0, sc.tEnd);
  const cart = mode === 'cart';

  /* ---- layout: the cart gets a band of insets on top; the elevator a column on each side */
  const bandH = cart ? Math.round((narrow ? 0.42 : 0.36) * h) : 0;
  const W = WORLD[mode];
  const ppm = Math.min(w / W.w, (h - bandH) / W.h);
  const cx = w / 2;
  const cy = cart ? bandH + (h - bandH) / 2 : h / 2 + 0.2 * ppm; // the elevator: room for the title above

  // where the box is in S at time t (its floor's centre)
  const startOffset = -sc.travel / 2; // centre the box's whole motion in the ground view
  const boxAt = (tt: number): Vec3 => {
    const disp = 0.5 * s.A * tt * tt;
    return cart ? [startOffset + disp, CART_WHEELS, 0] : [0, startOffset + disp - BOX_H / 2, 0];
  };
  const box = boxAt(t);
  // the world point drawn at the scene's centre: fixed on the ground in S, riding with the box in S′
  const camWorld: [number, number] = cart ? [ground ? 0 : box[0], CART_CAM_Y] : [0, ground ? 0 : box[1] + BOX_H / 2];
  const sx = (x: number) => cx + (x - camWorld[0]) * ppm;
  const sy = (y: number) => cy - (y - camWorld[1]) * ppm;

  // acceleration arrows in the scene [px per m/s²], never below a readable size
  const aPx = Math.max(0.05 * ppm, 4.5);
  const minLen = 12;
  const vecTip = (x: number, y: number, v: Vec3, k: number): [number, number] => {
    let dx = v[0] * k;
    let dy = -v[1] * k;
    const L = Math.hypot(dx, dy);
    if (L > 0 && L < minLen) {
      dx *= minLen / L;
      dy *= minLen / L;
    }
    return [x + dx, y + dy];
  };
  const tipLabel = (tip: [number, number], from: [number, number], label: string, color: string, gap = 13) => {
    const dx = tip[0] - from[0];
    const dy = tip[1] - from[1];
    const L = Math.hypot(dx, dy) || 1;
    mathText(ctx, p, label, tip[0] + (dx / L) * gap, tip[1] + (dy / L) * (gap - 2), { size: fs, color });
  };

  /* ---- the surroundings fixed in S: ground ticks or shaft rails (they slide in S′) */
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bandH, w, h - bandH);
  ctx.clip();
  ctx.strokeStyle = p.ink3;
  ctx.fillStyle = p.ink3;
  ctx.lineWidth = 1.2;
  if (cart) {
    const yG = sy(0);
    ctx.beginPath();
    ctx.moveTo(0, yG);
    ctx.lineTo(w, yG);
    ctx.stroke();
    const x0 = Math.floor((camWorld[0] - W.w) * 2) / 2;
    for (let k = 0; x0 + k * 0.5 <= camWorld[0] + W.w; k++) {
      const gx = x0 + k * 0.5;
      const X = sx(gx);
      ctx.beginPath();
      ctx.moveTo(X, yG);
      ctx.lineTo(X, yG + (Math.round(gx * 2) % 2 === 0 ? 8 : 4));
      ctx.stroke();
    }
  } else {
    const y0 = Math.floor((camWorld[1] - W.h) * 2) / 2;
    for (const rx of [-RAIL_X, RAIL_X]) {
      const X = sx(rx);
      if (!s.space) {
        ctx.beginPath();
        ctx.moveTo(X, 0);
        ctx.lineTo(X, h);
        ctx.stroke();
      }
      for (let k = 0; y0 + k * 0.5 <= camWorld[1] + W.h; k++) {
        const gy = y0 + k * 0.5;
        const Y = sy(gy);
        const big = Math.round(gy * 2) % 2 === 0;
        if (s.space) {
          ctx.beginPath();
          ctx.arc(X, Y, big ? 2.2 : 1.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(X, Y);
          ctx.lineTo(X + (rx < 0 ? 1 : -1) * (big ? 8 : 4), Y);
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();

  /* ---- the box */
  const bx = (xp: number) => sx(box[0] + xp);
  const by = (yp: number) => sy(box[1] + yp);
  const half = cart ? CART_LEN / 2 : CAB_W / 2;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = p.equip;
  ctx.fillStyle = withAlpha(p.equip, 0.08);
  ctx.beginPath();
  ctx.rect(bx(-half), by(BOX_H), 2 * half * ppm, BOX_H * ppm);
  ctx.fill();
  ctx.stroke();
  if (cart) {
    ctx.fillStyle = p.equip;
    for (const dx of [-0.95, 0.95]) {
      ctx.beginPath();
      ctx.arc(bx(dx), sy(0.16), Math.max(4, 0.16 * ppm), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (!s.space) {
    // the cable
    ctx.beginPath();
    ctx.moveTo(bx(0), by(BOX_H));
    ctx.lineTo(bx(0), 0);
    ctx.stroke();
  } else {
    // an engine under the box pushes it
    ctx.fillStyle = withAlpha(p.equip, 0.5);
    ctx.beginPath();
    ctx.moveTo(bx(-0.3), by(0));
    ctx.lineTo(bx(0.3), by(0));
    ctx.lineTo(bx(0.4), by(-0.22));
    ctx.lineTo(bx(-0.4), by(-0.22));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  /* ---- the bob: at rest in S′ along g_eff (slack in free fall) */
  const pivot: [number, number] = [-side * PIVOT_X, BOX_H];
  const gm = len3(sc.geff);
  const slack = gm < 1e-9;
  const bobRel: [number, number] = slack ? [pivot[0] + 0.15, pivot[1] - 0.7 * L_STRING] : [pivot[0] + (L_STRING * sc.geff[0]) / gm, pivot[1] + (L_STRING * sc.geff[1]) / gm];
  const PX = bx(pivot[0]);
  const PY = by(pivot[1]);
  const BX = bx(bobRel[0]);
  const BY = by(bobRel[1]);
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PX, PY);
  if (slack) ctx.quadraticCurveTo(PX + 0.35 * ppm, (PY + BY) / 2, BX, BY);
  else ctx.lineTo(BX, BY);
  ctx.stroke();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(PX, PY, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // the vertical through the pivot, for the angle θ
  if (cart && Math.abs(s.A) > 0.05) {
    ctx.strokeStyle = withAlpha(p.ink3, 0.9);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(PX, PY);
    ctx.lineTo(PX, PY + L_STRING * ppm);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = p.accent;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(BX, BY, Math.max(5, 0.09 * ppm), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (cart && Math.abs(s.A) > 0.05) {
    // θ on the far side of the dashed vertical from the string
    const away = BX < PX ? 1 : -1;
    mathText(ctx, p, 'θ', PX + away * 9, PY + 0.62 * L_STRING * ppm, { size: fs, color: p.ink2 });
  }

  /* ---- the ball: held, then released at rest in S′ (in S too: the box starts at rest) */
  const rel: [number, number] = [side * RELEASE_X, H_RELEASE];
  ctx.save();
  ctx.strokeStyle = p.equip;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx(rel[0]), by(BOX_H));
  ctx.lineTo(bx(rel[0]), by(rel[1] + 0.1));
  ctx.moveTo(bx(rel[0] - 0.09), by(rel[1] + 0.1));
  ctx.lineTo(bx(rel[0] + 0.09), by(rel[1] + 0.1));
  ctx.stroke();
  // the mark on the floor under the release
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(bx(rel[0]), by(0) - 5);
  ctx.lineTo(bx(rel[0]), by(0) + 5);
  ctx.stroke();
  ctx.restore();

  // the ball in S′, relative to the box floor's centre: r′ = rel + ½ g_eff t², stopped at the floor
  const ballRelAt = (tt: number): [number, number] => {
    const r = constantAcceleration({ r: [rel[0], rel[1], 0], v: [0, 0, 0] }, sc.geff, tt).r;
    return [r[0], Math.max(0, r[1])];
  };
  const brNow = ballRelAt(t);
  const landed = sc.tFall !== null && t >= sc.tFall - 1e-9;
  if (t > 0) {
    // the trace so far, in this view's frame: in S′ relative to the box; in S the box moved under it
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink, 0.75);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const ti = (t * i) / N;
      const r = ballRelAt(ti);
      const b = ground ? boxAt(ti) : box;
      const X = sx(b[0] + r[0]);
      const Y = sy(b[1] + r[1]);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    ctx.restore();
  }
  const ballR = Math.max(4, 0.07 * ppm);
  const ballX = bx(brNow[0]);
  const ballY = by(brNow[1]) - (landed ? ballR : 0);
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (t > 0 && !landed) {
    const aBall = ground ? sc.g : sc.geff;
    if (len3(aBall) > 0) {
      const off = side * 12;
      const ta = vecTip(ballX + off, ballY, aBall, aPx);
      arrow(ctx, ballX + off, ballY, ta[0], ta[1], { color: p.accel, width: 2.2, head: 9 });
      tipLabel(ta, [ballX + off, ballY], ground ? 'a = g' : 'a′', p.accel, 16);
    }
  }

  /* ---- the frame's acceleration: A on the box in S; the ground's −A in S′ */
  if (Math.abs(s.A) > 0.05) {
    const vec = ground ? sc.Avec : scale3(sc.Avec, -1);
    const gapX = (sx(-RAIL_X) + bx(-half)) / 2;
    const ox = cart ? bx(0) : gapX;
    const oy = cart ? (ground ? by(BOX_H) - 16 : sy(0) + 24) : by(BOX_H / 2) + (vec[1] > 0 ? 30 : -30);
    const ta = vecTip(ox, oy, vec, aPx);
    ctx.save();
    ctx.setLineDash([6, 4]);
    arrow(ctx, ox, oy, ta[0], ta[1], { color: p.accel, width: 2.2, head: 9 });
    ctx.restore();
    if (cart) tipLabel(ta, [ox, oy], ground ? 'A' : '−A', p.accel, 14);
    else mathText(ctx, p, ground ? 'A' : '−A', ox, oy + (vec[1] > 0 ? 12 : -12), { size: fs, color: p.accel });
  }

  /* ---- insets: the forces on the bob (with ma in S), and the compass g or g_eff */
  let fbd: Panel;
  let comp: Panel;
  if (cart) {
    // on a phone the two insets take the whole width, below the reset and fullscreen buttons
    const top = narrow ? 44 : 6;
    const ph = bandH - top - 4;
    const pw = narrow ? (w - 20) / 2 : Math.min(ph * 1.25, (w - 110) / 2);
    const r = Math.min(ph / 2 - 20, pw / 2 - 30);
    panelBox(ctx, p, 6, top, pw, ph, 'המשקולת', fs);
    fbd = { cx: 6 + pw / 2, cy: top + 14 + ph / 2, r, x: 6, bottom: top + ph };
    const x2 = 6 + pw + 8;
    panelBox(ctx, p, x2, top, pw, ph, '', fs);
    comp = { cx: x2 + pw / 2, cy: top + 6 + ph / 2, r, x: x2, bottom: top + ph };
  } else {
    const top = 52;
    const ph = h - top - 8;
    const cwL = Math.max(56, sx(-RAIL_X) - 14);
    const cwR = Math.max(56, w - sx(RAIL_X) - 14);
    panelBox(ctx, p, 6, top, cwL, ph, '', fs);
    panelBox(ctx, p, w - 6 - cwR, top, cwR, ph, 'משקולת', fs);
    comp = { cx: 6 + cwL / 2, cy: top + ph / 2, r: ph / 2 - 26, x: 6, bottom: top + ph };
    fbd = { cx: w - 6 - cwR / 2, cy: top + 10 + ph / 2, r: ph / 2 - 30, x: w - 6 - cwR, bottom: top + ph };
  }

  // the forces on the bob; the scale fits the largest force the slider allows (cart: each component ≤ mg;
  // elevator: T ≤ 2mg). In S the bob's ma is drawn at the same scale, in the acceleration colour.
  {
    const k = fbd.r / (cart ? M_BOB * G : 2 * M_BOB * G);
    const ox = fbd.cx;
    // elevator: the bob sits where both the upward T and the downward forces fit
    const oy = cart ? fbd.cy : fbd.cy + 0.1 * fbd.r;
    ctx.save();
    ctx.fillStyle = p.accent;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(ox, oy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    const drawF = (dx: number, v: Vec3, label: string, dashed: boolean, color: string, at: 'tip' | 'left' | 'right' = 'tip') => {
      if (len3(v) < 1e-9) return;
      const from: [number, number] = [ox + dx, oy];
      const tip = vecTip(from[0], from[1], v, k);
      ctx.save();
      if (dashed) ctx.setLineDash([5, 4]);
      arrow(ctx, from[0], from[1], tip[0], tip[1], { color, width: 2.6, head: 10 });
      ctx.restore();
      if (at === 'tip') tipLabel(tip, from, label, color, label.length > 1 ? 15 : 10);
      else mathText(ctx, p, label, from[0] + (at === 'left' ? -6 : 6), (from[1] + tip[1]) / 2, { size: fs, color, align: at === 'left' ? 'right' : 'left' });
    };
    const Tvec: Vec3 = scale3(sc.geff, -M_BOB);
    const mgVec: Vec3 = scale3(sc.g, M_BOB);
    const fict = linearFictitiousForce(M_BOB, sc.Avec);
    const ma = scale3(sc.Avec, M_BOB);
    const moving = Math.abs(s.A) > 0.05;
    if (!slack) drawF(0, Tvec, 'T', false, p.force, cart ? 'tip' : 'left');
    if (cart) {
      drawF(0, mgVec, 'mg', false, p.force);
      if (!ground) drawF(0, fict, '−mA', true, p.force);
      else if (moving) drawF(0, ma, 'ma', false, p.accel);
    } else {
      // vertical vectors side by side, so a downward fictitious force does not hide the weight
      drawF(-10, mgVec, 'mg', false, p.force, 'left');
      if (!ground) drawF(10, fict, '−mA', true, p.force, 'tip');
      else if (moving) drawF(12, ma, 'ma', false, p.accel, 'tip');
    }
    const note = ground ? (moving ? '' : 'a = 0') : 'a′ = 0';
    if (note) mathText(ctx, p, note, fbd.x + 8, fbd.bottom - 10, { size: fs - 1, color: p.accel, align: 'left' });
  }

  // the compass: g in S; in S′ g_eff = g + (−A), head to tail (cart), or g beside g_eff (elevator)
  {
    const minusA = scale3(sc.Avec, -1);
    if (cart) {
      const kc = (1.2 * comp.r) / G;
      const ox = comp.cx + (s.A >= 0 ? 0.55 : -0.55) * comp.r;
      const oy = comp.cy - comp.r * 0.6;
      const gtip = vecTip(ox, oy, sc.g, kc);
      const lab = s.A >= 0 ? 10 : -10;
      if (ground) {
        arrow(ctx, ox, oy, gtip[0], gtip[1], { color: p.accel, width: 2.8, head: 11 });
        mathText(ctx, p, 'g', ox + lab, (oy + gtip[1]) / 2, { size: fs, color: p.accel });
      } else {
        const etip = vecTip(gtip[0], gtip[1], minusA, kc);
        arrow(ctx, ox, oy, gtip[0], gtip[1], { color: withAlpha(p.accel, 0.45), width: 1.8, head: 8 });
        mathText(ctx, p, 'g', ox + lab, (oy + gtip[1]) / 2, { size: fs - 1, color: withAlpha(p.accel, 0.85) });
        if (len3(minusA) > 0) {
          ctx.save();
          ctx.setLineDash([4, 3]);
          arrow(ctx, gtip[0], gtip[1], etip[0], etip[1], { color: withAlpha(p.accel, 0.6), width: 1.8, head: 8 });
          ctx.restore();
          mathText(ctx, p, '−A', (gtip[0] + etip[0]) / 2, gtip[1] + 12, { size: fs - 1, color: withAlpha(p.accel, 0.85) });
        }
        arrow(ctx, ox, oy, etip[0], etip[1], { color: p.accel, width: 2.8, head: 11 });
        // the label on the far side of g_eff from the triangle
        const ex = etip[0] - ox;
        const ey = etip[1] - oy;
        const L = Math.hypot(ex, ey) || 1;
        const sgn = s.A >= 0 ? 1 : -1;
        subText(ctx, p, 'g', 'eff', '', (ox + etip[0]) / 2 - sgn * (ey / L) * 20, (oy + etip[1]) / 2 + sgn * (ex / L) * 14, fs, p.accel);
      }
    } else {
      // elevator: everything vertical; a scale that fits 2g, the arrows start near the top (or the bottom when g_eff points up)
      const kc = (2 * comp.r) / (2 * G);
      const oy = comp.cy - comp.r;
      const gx = comp.cx - 11;
      const ex = comp.cx + 11;
      if (len3(sc.g) > 0) {
        const gt = vecTip(gx, oy, sc.g, kc);
        arrow(ctx, gx, oy, gt[0], gt[1], { color: ground ? p.accel : withAlpha(p.accel, 0.45), width: ground ? 2.8 : 1.8, head: 9 });
        mathText(ctx, p, 'g', gx, gt[1] + 12, { size: fs, color: p.accel });
      } else mathText(ctx, p, 'g = 0', comp.cx, comp.cy + comp.r + 12, { size: fs - 1, color: p.accel });
      if (!ground) {
        if (gm > 0) {
          const et = vecTip(ex, oy, sc.geff, kc);
          arrow(ctx, ex, oy, et[0], et[1], { color: p.accel, width: 2.8, head: 11 });
          subText(ctx, p, 'g', 'eff', '', ex, et[1] + 13, fs, p.accel);
        } else subText(ctx, p, 'g', 'eff', ' = 0', comp.cx, oy - 12, fs - 1, p.accel);
      }
    }
  }

  /* ---- title: the frame, at the top right (in the elevator left of the reset and fullscreen buttons) */
  const boxName = cart ? 'הקרון' : s.space ? 'התא' : 'המעלית';
  const title = ground ? (s.space ? 'מערכת אינרציאלית' : 'מערכת הקרקע') : `מערכת ${boxName}`;
  const ty = cart ? bandH + 16 : 16;
  const tx = cart ? w - 10 : w - 90;
  const tw = heText(ctx, p, title, tx, ty, { size: fs, weight: 700, color: p.ink });
  mathText(ctx, p, ground ? 'S' : 'S′', tx - tw - 8, ty, { align: 'right', size: fs + 1, color: p.ink });
  // what a view adds
  const note = ground ? 'רק כוחות אמיתיים' : `כוח מדומה ${ltr('−mA')} מקווקו`;
  heText(ctx, p, note, tx, ty + 18, { size: fs - 1, color: p.ink2 });
}
