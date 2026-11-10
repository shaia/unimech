/**
 * CMFrameCollision: one head-on collision of two blocks, seen from the laboratory and from the centre-of-mass
 * frame (lesson 4.2).
 *
 * Two stacked panels show the same collision. The top one is the laboratory frame: the ground stands still, the
 * centre of mass (the quartered circle on the track) moves at V, drawn as a dashed arrow in the lighter velocity
 * tint. The bottom one is the centre-of-mass frame, the frame of lesson 1.5 that moves at +V: the centre of mass
 * stands still in the middle, the ground ticks slide at −V (the dashed arrow at its top left), and the blocks carry
 * their velocities u = v − V and their momenta, equal and opposite (±p before, ∓e p after).
 * Below the panels a strip shows either
 *   'velocity': two velocity axes, v (laboratory) above and u (centre-of-mass frame) below, the u axis shifted so
 *     that u = 0 sits under v = V. A filled marker is a velocity before the collision, a hollow one after it; the
 *     arcs on the u axis are the collision in the centre-of-mass frame, u′ = −e u. The recipe button walks the four
 *     stages (lab → centre of mass → collide → back to the lab), drawing the strip one stage at a time.
 *   'energy': bars of kinetic energy, laboratory and centre-of-mass frame, before and after: K = ½MV² + ½μv_rel²,
 *     the hatched part (thermal colour) is the energy the collision turned into other forms.
 *
 * Physics: src/physics/cmframe.ts (collide, energySplit, inCMFrame). World units are metres along the track; the
 * time axis is scaled so every block stays in view in both panels (the clock is not to scale).
 *
 * Props (Astro wrapper: <Spread fig="fig-4-2a" figure={CMFrameCollision} figureProps={{ … }}>)
 *   id        figure id (Spread passes it); steps address the figure by it, tasks are `${id}:${task}`
 *   m1, m2    masses [kg], 0.5…5 in steps of 0.5 (defaults 1.0 and 1.5)
 *   v1, v2    laboratory velocities along +x [m/s], −6…6 in steps of 0.5 (defaults +4.0 and −1.0)
 *   e         coefficient of restitution, 0…1 in steps of 0.05 (default 1)
 *   strip     'velocity' | 'energy' (default 'velocity')
 *   tasks     task ids to show (below)
 *
 * Step `set` keys: m1, v1, m2, v2, e, strip, tau (the clock, −1 = start, 0 = contact, 1 = end), recipe (0 = off,
 *   1…4 = the stage shown), playing. Numbers are clamped and snapped to the sliders' steps.
 *
 * Tasks, ticked only by the learner's own actions (a step clears what counts as "own"):
 *   reverse        the learner plays an elastic collision (e = 1) to its end
 *   plastic        the learner sets e = 0 and plays the collision to its end
 *   recipe         the learner walks the recipe with its button to stage 4
 *   same-krel      the learner changes both velocities, keeps the masses and v₁ − v₂, and moves V
 *   zero-momentum  with e = 0, the learner finds velocities or masses with zero total momentum (all of K is lost)
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { collide, energySplit, inCMFrame, type Pair } from '~/physics/cmframe';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Strip = 'velocity' | 'energy';

const TASK_LABEL: Record<string, string> = {
  reverse: 'הפעילו התנגשות אלסטית, e = 1, עד הסוף. מה עושה כל גוף בחלון התחתון?',
  plastic: 'קבעו e = 0 והפעילו. מה קורה לגופים בכל אחד מהחלונות?',
  recipe: 'עברו עם כפתור המתכון על ארבעת השלבים, עד שלב 4.',
  'same-krel': 'שנו את שתי המהירויות באותו סכום, בלי לשנות את המסות. מה משתנה בפסים, ומה לא?',
  'zero-momentum': 'עם e = 0, מצאו מסות ומהירויות שבהן כל האנרגיה הקינטית במערכת המעבדה אובדת.',
};

export interface CMFrameCollisionProps {
  id: string;
  m1?: number;
  v1?: number;
  m2?: number;
  v2?: number;
  e?: number;
  strip?: Strip;
  tasks?: string[];
}

interface State {
  m1: number;
  v1: number;
  m2: number;
  v2: number;
  e: number;
  /** the clock: −1 start, 0 contact, 1 end */
  tau: number;
  playing: boolean;
  strip: Strip;
  /** 0: everything shown; 1…4: the recipe stage */
  recipe: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const snap = (x: number, step: number) => Math.round(x / step) * step;
const mass = (x: unknown, d: number) => clamp(snap(typeof x === 'number' ? x : d, 0.5), 0.5, 5);
const vel = (x: unknown, d: number) => clamp(snap(typeof x === 'number' ? x : d, 0.5), -6, 6);
const rest = (x: unknown, d: number) => clamp(Math.round((typeof x === 'number' ? x : d) * 20) / 20, 0, 1);
/** a readout number: 3 significant figures, a true minus sign, and no "−0" */
const num = (x: number) => (Math.abs(x) < 0.005 ? '0' : sci(x, 3).replace('-', '−'));
const fmtE = (e: number) => e.toFixed(2);

const W_WORLD = 12; // track length shown [m]
const PLAY_SECONDS = 3.4; // wall-clock seconds from tau = −1 to tau = 1
const RECIPE_TEXT: Record<number, [string, string]> = {
  1: ['שלב 1: במעבדה', 'V = P/M'],
  2: ['שלב 2: עוברים למרכז המסה', 'u = v − V'],
  3: ['שלב 3: מתנגשים', 'u′ = −e u'],
  4: ['שלב 4: חוזרים למעבדה', 'v′ = u′ + V'],
};

function initial(p: CMFrameCollisionProps): State {
  return {
    m1: mass(p.m1, 1),
    v1: vel(p.v1, 4),
    m2: mass(p.m2, 1.5),
    v2: vel(p.v2, -1),
    e: rest(p.e, 1),
    tau: -1,
    playing: false,
    strip: p.strip ?? 'velocity',
    recipe: 0,
  };
}

/** Half-width of a block [m]: grows with the mass, so the eye reads which body is heavier. */
const halfWidth = (m: number) => 0.3 + 0.17 * Math.sqrt(m);

/** Everything the panels, the strip and the readout need. */
function solve(s: State) {
  const pair: Pair = { m1: s.m1, v1: s.v1, m2: s.m2, v2: s.v2 };
  const out = collide(pair, s.e);
  const cm = inCMFrame(pair);
  const k = energySplit(pair);
  const h1 = halfWidth(s.m1);
  const h2 = halfWidth(s.m2);
  // the time scale: every block stays inside the track in both frames over −T…T
  const speeds = [s.v1, s.v2, out.v1, out.v2, cm.u1, cm.u2, out.u1After, out.u2After].map(Math.abs);
  const vmax = Math.max(...speeds, 0.5);
  const reach = W_WORLD / 2 - 2 * Math.max(h1, h2) - 0.3;
  // without a collision the bodies start in contact and move apart for 2T, so they get half the time scale
  const T = (out.collides ? 1 : 0.5) * (reach / vmax);
  return { pair, out, cm, k, h1, h2, T, vmax };
}
type Solved = ReturnType<typeof solve>;

/** Block centres and the centre of mass in the laboratory at the clock tau. */
function positions(s: State, z: Solved, tau: number) {
  const t = tau * z.T;
  let x1: number;
  let x2: number;
  if (z.out.collides) {
    const a = t > 0;
    x1 = -z.h1 + (a ? z.out.v1 : s.v1) * t;
    x2 = z.h2 + (a ? z.out.v2 : s.v2) * t;
  } else {
    // in contact at the start, moving apart
    x1 = -z.h1 + s.v1 * (t + z.T);
    x2 = z.h2 + s.v2 * (t + z.T);
  }
  const xcm = (s.m1 * x1 + s.m2 * x2) / (s.m1 + s.m2);
  // where the centre of mass is at tau: x_cm(0) + V t (also true without a collision)
  return { x1, x2, xcm, t };
}

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
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
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

/** "½μv" with a lowered "rel" and a raised "2", centred on (x, y): the energy of the relative motion. */
function relEnergyLabel(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const big = `italic 700 ${size}px ${p.fontUi}`;
  const small = `italic 700 ${Math.round(size * 0.68)}px ${p.fontUi}`;
  ctx.font = big;
  const wBase = ctx.measureText('½μv').width;
  ctx.font = small;
  const wSub = ctx.measureText('rel').width;
  const wSup = ctx.measureText('2').width;
  const total = wBase + Math.max(wSub, wSup) + 1;
  const x0 = x - total / 2;
  const draw = (s: string, font: string, xx: number, yy: number) => {
    ctx.font = font;
    ctx.lineWidth = 3;
    ctx.strokeStyle = withAlpha(p.paper, 0.85);
    ctx.strokeText(s, xx, yy);
    ctx.fillStyle = color;
    ctx.fillText(s, xx, yy);
  };
  draw('½μv', big, x0, y);
  draw('2', small, x0 + wBase + 1, y - size * 0.32);
  draw('rel', small, x0 + wBase + 1, y + size * 0.3);
  ctx.restore();
  return total;
}

/* ================================================================== the component */

export default function CMFrameCollision(props: CMFrameCollisionProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const touched = useRef(new Set<string>());
  // the state the last step or reset left, for the "same v_rel" task
  const base = useRef<State>(initial(props));
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const z = solve(s);

  const change = (patch: Partial<State>) => {
    for (const k of Object.keys(patch)) touched.current.add(k);
    setS((prev) => ({ ...prev, ...patch, recipe: 'recipe' in patch ? (patch.recipe ?? 0) : 0 }));
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        touched.current.clear();
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.m1 === 'number') next.m1 = mass(st.m1, prev.m1);
          if (typeof st.m2 === 'number') next.m2 = mass(st.m2, prev.m2);
          if (typeof st.v1 === 'number') next.v1 = vel(st.v1, prev.v1);
          if (typeof st.v2 === 'number') next.v2 = vel(st.v2, prev.v2);
          if (typeof st.e === 'number') next.e = rest(st.e, prev.e);
          if (st.strip === 'velocity' || st.strip === 'energy') next.strip = st.strip;
          next.recipe = typeof st.recipe === 'number' ? clamp(Math.round(st.recipe), 0, 4) : 0;
          if (typeof st.tau === 'number') next.tau = clamp(st.tau, -1, 1);
          else if (next.recipe) next.tau = next.recipe <= 2 ? -0.5 : 0.5;
          next.playing = typeof st.playing === 'boolean' ? st.playing : false;
          base.current = next;
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
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => {
        const tau = prev.tau + (2 * dt) / PLAY_SECONDS;
        return tau >= 1 ? { ...prev, tau: 1, playing: false } : { ...prev, tau };
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
    const ended = s.tau >= 1 && own('playing');
    if (has('reverse') && ended && s.e === 1 && z.out.collides) done('reverse');
    if (has('plastic') && ended && own('e') && s.e === 0 && z.out.collides) done('plastic');
    if (has('recipe') && own('recipe') && s.recipe === 4) done('recipe');
    const b = base.current;
    const vrelSame = Math.abs(s.v1 - s.v2 - (b.v1 - b.v2)) < 1e-9;
    if (has('same-krel') && own('v1') && own('v2') && s.m1 === b.m1 && s.m2 === b.m2 && vrelSame && Math.abs(z.k.V - solve(b).k.V) > 1e-9)
      done('same-krel');
    if (has('zero-momentum') && own('m1', 'v1', 'm2', 'v2') && s.e === 0 && z.out.collides && Math.abs(z.k.V) < 1e-9) done('zero-momentum');
  }, [s, props.id, props.tasks]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s, z)), 700);
    return () => clearTimeout(h);
  }, [s.m1, s.v1, s.m2, s.v2, s.e, s.strip]);

  // a taller stage on a narrow screen; the canvas width does not depend on the aspect, so no feedback loop
  const [aspect, setAspect] = useState(1.12);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, s, z);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: W_WORLD, worldHeight: W_WORLD / aspect, animate: false });
  useEffect(invalidate, [s, aspect]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 520 ? 0.78 : 1.12));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reset = () => {
    touched.current.clear();
    const next = initial(props);
    base.current = next;
    setS(next);
    setLive('האיור אופס.');
  };

  const play = (on: boolean) => {
    touched.current.add('playing');
    if (on && s.tau >= 1) setS((prev) => ({ ...prev, tau: -1, playing: true, recipe: 0 }));
    else setS((prev) => ({ ...prev, playing: on, recipe: on ? 0 : prev.recipe }));
  };

  const nextStage = () => {
    touched.current.add('recipe');
    setS((prev) => {
      const recipe = prev.recipe >= 4 ? 1 : prev.recipe + 1;
      return { ...prev, recipe, tau: recipe <= 2 ? -0.5 : 0.5, playing: false };
    });
  };

  const { out, cm, k } = z;
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: התנגשות חזיתית של שני גופים, למעלה במערכת המעבדה ולמטה במערכת מרכז המסה. ${describe(s, z)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span class="q" data-readout="V">
            <i>V</i> = {num(cm.V)} m/s
          </span>
          <span class="q" data-readout="mu">
            <i>μ</i> = {num(k.mu)} kg
          </span>
          <span data-readout="u">
            מרכז המסה, לפני:{' '}
            <b class="q">
              <i>u</i>₁ = {num(cm.u1)}, <i>u</i>₂ = {num(cm.u2)} m/s
            </b>
          </span>
          <span data-readout="after">
            {out.collides ? 'מעבדה, אחרי: ' : 'אין התנגשות: '}
            <b class="q">
              <i>v</i>₁′ = {num(out.v1)}, <i>v</i>₂′ = {num(out.v2)} m/s
            </b>
          </span>
          <span data-readout="K">
            לפני:{' '}
            <b class="q">
              <i>K</i> = {num(k.K)} J = {num(k.Kcm)} J + {num(k.Krel)} J
            </b>
          </span>
          <span data-readout="lost">
            אבדה: <b class="q">{num(out.lost)} J</b>
          </span>
        </>
      }
      controls={
        <>
          <Slider label="מסה 1" min={0.5} max={5} step={0.5} value={s.m1} format={(v) => `${num(v)} kg`} onChange={(v) => change({ m1: v })} />
          <Slider label="מהירות 1" min={-6} max={6} step={0.5} value={s.v1} format={(v) => `${num(v)} m/s`} onChange={(v) => change({ v1: v })} />
          <Slider label="מסה 2" min={0.5} max={5} step={0.5} value={s.m2} format={(v) => `${num(v)} kg`} onChange={(v) => change({ m2: v })} />
          <Slider label="מהירות 2" min={-6} max={6} step={0.5} value={s.v2} format={(v) => `${num(v)} m/s`} onChange={(v) => change({ v2: v })} />
          <Slider label="מקדם תקומה" min={0} max={1} step={0.05} value={s.e} format={(v) => `e = ${fmtE(v)}`} onChange={(v) => change({ e: Math.round(v * 20) / 20 })} />
          <div class="group" role="group" aria-label="זמן ותצוגה">
            <Toggle label={s.playing ? 'עצירה' : 'הפעלה'} on={s.playing} onChange={play} />
            <Toggle label="המתכון: השלב הבא" on={s.recipe > 0} onChange={nextStage} />
          </div>
          <div class="group" role="group" aria-label="מה מוצג בפס התחתון">
            <Toggle label="ציר המהירויות" on={s.strip === 'velocity'} onChange={() => change({ strip: 'velocity' })} />
            <Toggle label="אנרגיה" on={s.strip === 'energy'} onChange={() => change({ strip: 'energy' })} />
          </div>
          <Slider
            label="זמן"
            min={-1}
            max={1}
            step={0.01}
            value={Math.round(s.tau * 100) / 100}
            format={(v) => (v < -0.005 ? 'לפני ההתנגשות' : v > 0.005 ? 'אחרי ההתנגשות' : 'רגע המגע')}
            onChange={(v) => setS((prev) => ({ ...prev, tau: clamp(v, -1, 1), playing: false, recipe: 0 }))}
          />
        </>
      }
    />
  );
}

function describe(s: State, z: Solved): string {
  const { out, cm, k } = z;
  const head = `גוף 1, ${num(s.m1)} קילוגרם, במהירות ${num(s.v1)} מטר לשנייה; גוף 2, ${num(s.m2)} קילוגרם, במהירות ${num(s.v2)} מטר לשנייה. מהירות מרכז המסה ${num(cm.V)} מטר לשנייה.`;
  if (!out.collides) return `${head} הגופים לא מתקרבים זה לזה, ואין התנגשות.`;
  const kind = s.e === 1 ? 'אלסטית' : s.e === 0 ? 'פלסטית' : `עם מקדם תקומה ${fmtE(s.e)}`;
  return `${head} ההתנגשות ${kind}. במערכת מרכז המסה המהירויות לפני ההתנגשות ${num(cm.u1)} ו-${num(cm.u2)}, ואחריה ${num(out.u1After)} ו-${num(out.u2After)} מטר לשנייה. במעבדה, אחרי ההתנגשות: ${num(out.v1)} ו-${num(out.v2)} מטר לשנייה. האנרגיה הקינטית ${num(k.K)} ג'אול, מהם ${num(k.Krel)} ג'אול של התנועה היחסית; אבדו ${num(out.lost)} ג'אול.`;
}

/* ================================================================== painting */

interface Layout {
  w: number;
  ppm: number;
  lab: { y0: number; h: number };
  cmp: { y0: number; h: number };
  strip: { y0: number; h: number };
}

function layout(view: View): Layout {
  const { w, h } = view;
  const gap = 6;
  const stripH = Math.max(132, Math.min(170, 0.32 * h));
  const panelH = (h - stripH - 2 * gap) / 2;
  return {
    w,
    ppm: w / W_WORLD,
    lab: { y0: 0, h: panelH },
    cmp: { y0: panelH + gap, h: panelH },
    strip: { y0: 2 * panelH + 2 * gap, h: stripH },
  };
}

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, z: Solved) {
  const L = layout(view);
  const pos = positions(s, z, s.tau);
  paintPanel(ctx, p, L, s, z, pos, 'lab');
  paintPanel(ctx, p, L, s, z, pos, 'cm');
  if (s.strip === 'energy') paintEnergy(ctx, p, L, s, z);
  else paintVelocities(ctx, p, L, s, z);
}

function paintPanel(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  L: Layout,
  s: State,
  z: Solved,
  pos: ReturnType<typeof positions>,
  frame: 'lab' | 'cm',
) {
  const { w, ppm } = L;
  const panel = frame === 'lab' ? L.lab : L.cmp;
  const lab = frame === 'lab';
  const { out, cm } = z;
  const afterNow = out.collides ? s.tau > 0 : true;
  // the camera: fixed in the lab, riding with the centre of mass in the other frame
  const cam = lab ? 0 : pos.xcm;
  const sx = (x: number) => w / 2 + (x - cam) * ppm;
  const groundY = panel.y0 + panel.h * 0.7;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, panel.y0, w, panel.h);
  ctx.clip();
  ctx.fillStyle = withAlpha(p.paper2, lab ? 0.55 : 0.9);
  ctx.fillRect(0, panel.y0, w, panel.h);

  // the track with a tick every metre; the ticks slide at −V in the centre-of-mass frame
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();
  for (let g = Math.floor(cam - W_WORLD / 2 - 1); g <= cam + W_WORLD / 2 + 1; g++) {
    const x = sx(g);
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, groundY + (g % 2 === 0 ? 7 : 4));
    ctx.stroke();
  }

  // the blocks
  const bh = (m: number) => Math.min(2 * halfWidth(m) * ppm * 0.9, panel.h * 0.26);
  const blocks = [
    { x: pos.x1, h: z.h1, m: s.m1, name: 'm₁' },
    { x: pos.x2, h: z.h2, m: s.m2, name: 'm₂' },
  ];
  for (const b of blocks) {
    const x = sx(b.x);
    const hw = b.h * ppm;
    const hh = bh(b.m);
    ctx.save();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = p.equip;
    ctx.fillStyle = withAlpha(p.equip, 0.22);
    ctx.beginPath();
    ctx.roundRect(x - hw, groundY - hh, 2 * hw, hh, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    mathText(ctx, p, b.name, x, groundY - hh / 2, { size: Math.max(11, Math.min(14, hw * 0.75)), color: p.ink });
  }
  const topY = groundY - Math.max(bh(s.m1), bh(s.m2));

  // the centre of mass: a quartered circle on the track
  const xc = sx(pos.xcm);
  const r = 6;
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(xc, groundY, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.ink;
  for (const a0 of [0, Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(xc, groundY);
    ctx.arc(xc, groundY, r, a0 - Math.PI / 2, a0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // arrow scales: velocities and momenta, with a minimum readable length
  const vs = (0.15 * w) / z.vmax;
  // an arrow never leaves the canvas: its tip is clamped to the panel, keeping at least the head visible
  const tipX = (x0: number, len: number) => clamp(x0 + len, 10, w - 10);
  const vlen = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.sign(v) * Math.max(Math.abs(v) * vs, 12));
  const frameTint = withAlpha(p.velocity, 0.6);
  const rowV1 = topY - 11;
  const rowV2 = topY - 25;

  // the velocity of each block in this frame
  const vel1 = lab ? (afterNow ? out.v1 : s.v1) : afterNow ? out.u1After : cm.u1;
  const vel2 = lab ? (afterNow ? out.v2 : s.v2) : afterNow ? out.u2After : cm.u2;
  const sym = lab ? 'v' : 'u';
  const prime = afterNow && out.collides ? '′' : '';
  const velRows: [number, number, number, string][] = [
    [sx(pos.x1), vel1, rowV1, `${sym}₁${prime}`],
    [sx(pos.x2), vel2, rowV2, `${sym}₂${prime}`],
  ];
  for (const [x, v, y, name] of velRows) {
    const len = vlen(v);
    const tx = tipX(x, len);
    if (len !== 0) arrow(ctx, x, y, tx, y, { color: p.velocity, width: 2.6, head: 9 });
    // the label goes past the tip, or before it when the tip is at the edge
    const past = tx + Math.sign(len) * 13;
    const lx = len === 0 ? x : past > 16 && past < w - 16 ? past : tx - Math.sign(len) * 26;
    const label = len === 0 ? `${name} = 0` : name;
    mathText(ctx, p, label, clamp(lx, 22, w - 22), y, { color: p.velocity, size: 13 });
  }

  const rowB = groundY + 20;
  if (lab) {
    // the centre of mass moves at V: a dashed arrow in the lighter velocity tint, under the track
    if (Math.abs(cm.V) > 1e-9) {
      ctx.save();
      ctx.setLineDash([5, 3]);
      arrow(ctx, xc, rowB, xc + vlen(cm.V), rowB, { color: frameTint, width: 2.4, head: 9 });
      ctx.restore();
      mathText(ctx, p, 'V', clamp(xc + vlen(cm.V) + Math.sign(cm.V) * 11, 14, w - 14), rowB, { color: p.velocity, size: 13 });
    } else {
      mathText(ctx, p, 'V = 0', xc, rowB, { color: p.velocity, size: 12 });
    }
  } else {
    // momenta in the centre-of-mass frame: equal and opposite, ±p before and ∓e p after
    const p1 = afterNow ? s.m1 * out.u1After : cm.p1;
    const p2 = afterNow ? s.m2 * out.u2After : cm.p2;
    const pRef = Math.max(Math.abs(cm.p1), 1e-9);
    const ps = (0.16 * w) / pRef;
    const plen = (q: number) => (Math.abs(q) < 1e-9 ? 0 : Math.sign(q) * Math.max(Math.abs(q) * ps, 10));
    const name = (q: number, body: 1 | 2) => {
      if (!out.collides || !afterNow) return body === 1 ? (cm.p1 >= 0 ? 'p' : '−p') : cm.p1 >= 0 ? '−p' : 'p';
      if (s.e === 0) return '0';
      const sign = q < 0 ? '−' : '';
      return s.e === 1 ? `${sign}p` : `${sign}ep`;
    };
    const rows: [number, number, number, string][] = [
      [sx(pos.x1), p1, rowB, name(p1, 1)],
      [sx(pos.x2), p2, rowB + 15, name(p2, 2)],
    ];
    for (const [x, q, y, label] of rows) {
      const len = plen(q);
      const tx = tipX(x, len);
      if (len !== 0) arrow(ctx, x, y, tx, y, { color: p.momentum, width: 2.6, head: 9 });
      const past = tx + Math.sign(len) * 12;
      const lx = len === 0 ? x + 12 : past > 16 && past < w - 16 ? past : tx - Math.sign(len) * 24;
      mathText(ctx, p, label, clamp(lx, 16, w - 16), y, { color: p.momentum, size: 13 });
    }
    // the ground moves at −V in this frame: a dashed arrow at the panel's top left
    if (Math.abs(cm.V) > 1e-9) {
      const cx = 0.17 * w;
      const len = vlen(-cm.V);
      ctx.save();
      ctx.setLineDash([5, 3]);
      arrow(ctx, cx - len / 2, panel.y0 + 15, cx + len / 2, panel.y0 + 15, { color: frameTint, width: 2.2, head: 8 });
      ctx.restore();
      mathText(ctx, p, '−V', cx + len / 2 + Math.sign(len) * 14, panel.y0 + 15, { color: p.velocity, size: 12 });
    }
  }

  // the recipe dims the panel that is not in use at this stage
  const active = s.recipe === 0 || (lab ? s.recipe === 1 || s.recipe === 4 : s.recipe === 2 || s.recipe === 3);
  if (!active) {
    ctx.fillStyle = withAlpha(p.paper, 0.6);
    ctx.fillRect(0, panel.y0, w, panel.h);
  }

  // panel title: in the top panel, left of the reset and fullscreen buttons (top right, ~90 px)
  const right = lab ? w - 90 : w - 8;
  heText(ctx, p, lab ? 'מערכת המעבדה' : 'מערכת מרכז המסה', right, panel.y0 + 15, { size: 13, weight: 700, color: p.ink });
  ctx.restore();
}

/** A marker on a velocity axis: circle for body 1, square for body 2; filled before the collision, hollow after. */
function marker(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, body: 1 | 2, filled: boolean) {
  const r = 7;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = p.velocity;
  ctx.fillStyle = filled ? p.velocity : p.paper;
  ctx.beginPath();
  if (body === 1) ctx.arc(x, y, r, 0, Math.PI * 2);
  else ctx.rect(x - r + 0.5, y - r + 0.5, 2 * r - 1, 2 * r - 1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = filled ? p.paper : p.velocity;
  ctx.font = `700 10px ${p.fontUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  ctx.fillText(String(body), x, y + 0.5);
  ctx.restore();
}

function paintVelocities(ctx: CanvasRenderingContext2D, p: Palette, L: Layout, s: State, z: Solved) {
  const { w } = L;
  const { y0, h } = L.strip;
  const { out, cm } = z;
  const stage = s.recipe; // 0 = everything
  const show = (k: number) => stage === 0 || stage >= k;

  ctx.save();
  ctx.fillStyle = withAlpha(p.paper2, 0.55);
  ctx.fillRect(0, y0, w, h);

  // title, or the recipe stage
  if (stage) {
    const [he, math] = RECIPE_TEXT[stage];
    const tw = heText(ctx, p, he, w - 8, y0 + 13, { size: 13, weight: 700, color: p.ink });
    mathText(ctx, p, math, w - 8 - tw - 10, y0 + 13, { align: 'right', size: 13, color: p.ink });
  } else {
    heText(ctx, p, out.collides ? 'ציר המהירויות' : 'ציר המהירויות: הגופים לא מתקרבים', w - 8, y0 + 13, { size: 13, weight: 700, color: p.ink });
  }

  // the axes: v (laboratory) above, u (centre-of-mass frame) below, u = 0 under v = V
  const R = Math.max(2, Math.ceil(Math.max(Math.abs(s.v1), Math.abs(s.v2), Math.abs(out.v1), Math.abs(out.v2)) + 0.5));
  const left = 26;
  const xv = (v: number) => left + 8 + ((v + R) / (2 * R)) * (w - left - 24);
  const yTop = y0 + h * 0.42;
  const yBot = y0 + h * 0.76;
  // tick numbers at least ~30 px apart
  const unitPx = (w - left - 24) / (2 * R);
  const tickStep = [1, 2, 5, 10].find((st) => st * unitPx >= 30) ?? 10;

  const axis = (y: number, zero: number, label: string, numbersAbove: boolean) => {
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(left + 4, y);
    ctx.lineTo(w - 10, y);
    ctx.stroke();
    ctx.restore();
    mathText(ctx, p, label, 12, y, { size: 14, color: p.ink2 });
    // ticks every metre per second of this axis' own scale
    for (let k = Math.ceil(-R - zero); k <= Math.floor(R - zero); k++) {
      const x = xv(zero + k);
      if (x < left + 4 || x > w - 10) continue;
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x, y + 3);
      ctx.stroke();
      ctx.restore();
      if (k % tickStep === 0) mathText(ctx, p, k < 0 ? `−${-k}` : String(k), x, numbersAbove ? y - 12 : y + 13, { size: 10, italic: false, weight: 500, color: p.ink3 });
    }
  };

  axis(yTop, 0, 'v', true);
  if (show(2)) axis(yBot, cm.V, 'u', false);

  // the shift: from v = 0 to v = V, above the v axis
  if (Math.abs(cm.V) > 1e-9) {
    const ys = yTop - 26;
    ctx.save();
    ctx.setLineDash([5, 3]);
    arrow(ctx, xv(0), ys, xv(cm.V), ys, { color: withAlpha(p.velocity, 0.6), width: 2.2, head: 8 });
    ctx.restore();
    mathText(ctx, p, 'V', clamp(xv(cm.V) + Math.sign(cm.V) * 11, 10, w - 10), ys, { color: p.velocity, size: 13 });
  }
  // V on the v axis, and u = 0 under it
  const diamond = (x: number, y: number) => {
    ctx.save();
    ctx.fillStyle = withAlpha(p.velocity, 0.6);
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x, y + 6);
    ctx.lineTo(x - 6, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  diamond(xv(cm.V), yTop);

  // vertical guides: the same velocity read on both axes
  const guide = (v: number) => {
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink3, 0.6);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(xv(v), yTop + 7);
    ctx.lineTo(xv(v), yBot - 7);
    ctx.stroke();
    ctx.restore();
  };
  if (show(2)) {
    guide(s.v1);
    guide(s.v2);
  }
  if (out.collides && show(4)) {
    guide(out.v1);
    guide(out.v2);
  }

  // the collision in the centre-of-mass frame: u → −e u, an arc above the u axis for body 1 and below it for body 2
  if (out.collides && show(3)) {
    const arc = (from: number, to: number, up: boolean) => {
      const x1 = xv(from);
      const x2 = xv(to);
      const hgt = Math.min(Math.abs(x2 - x1) * 0.35 + 6, (yBot - yTop) * 0.55);
      const yc = up ? yBot - hgt : yBot + hgt;
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink2, 0.75);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, yBot + (up ? -7 : 7));
      ctx.quadraticCurveTo((x1 + x2) / 2, yc, x2, yBot + (up ? -8 : 8));
      ctx.stroke();
      ctx.restore();
      // a small head at the end, along the last direction of the curve
      const dx = x2 - (x1 + x2) / 2;
      const dy = yBot + (up ? -8 : 8) - yc;
      const Ld = Math.hypot(dx, dy) || 1;
      arrow(ctx, x2 - (dx / Ld) * 8, yBot + (up ? -8 : 8) - (dy / Ld) * 8, x2, yBot + (up ? -8 : 8), { color: withAlpha(p.ink2, 0.85), width: 1.4, head: 7 });
    };
    if (Math.abs(cm.u1 - out.u1After) > 1e-9) arc(s.v1, out.v1, true);
    if (Math.abs(cm.u2 - out.u2After) > 1e-9) arc(s.v2, out.v2, false);
  }

  // the markers: before (filled) on the v axis from stage 1 and on the u axis from stage 2; after (hollow) on the
  // u axis from stage 3 and on the v axis at stage 4
  if (out.collides && show(3)) {
    marker(ctx, p, xv(out.v1), yBot, 1, false);
    marker(ctx, p, xv(out.v2), yBot, 2, false);
  }
  if (out.collides && show(4)) {
    marker(ctx, p, xv(out.v1), yTop, 1, false);
    marker(ctx, p, xv(out.v2), yTop, 2, false);
  }
  if (show(2)) {
    marker(ctx, p, xv(s.v1), yBot, 1, true);
    marker(ctx, p, xv(s.v2), yBot, 2, true);
  }
  marker(ctx, p, xv(s.v1), yTop, 1, true);
  marker(ctx, p, xv(s.v2), yTop, 2, true);
  ctx.restore();
}

function paintEnergy(ctx: CanvasRenderingContext2D, p: Palette, L: Layout, s: State, z: Solved) {
  const { w } = L;
  const { y0, h } = L.strip;
  const { k, out } = z;
  ctx.save();
  ctx.fillStyle = withAlpha(p.paper2, 0.55);
  ctx.fillRect(0, y0, w, h);
  heText(ctx, p, 'אנרגיה קינטית', w - 8, y0 + 13, { size: 13, weight: 700, color: p.ink });

  const rows = ['מעבדה, לפני', 'מעבדה, אחרי', 'מרכז המסה, לפני', 'מרכז המסה, אחרי'];
  ctx.font = `600 12px ${p.fontUi}`;
  const labelW = Math.max(...rows.map((r) => ctx.measureText(r).width)) + 12;
  const x0 = 10;
  const barW = w - labelW - x0 - 10;
  const scale = k.K > 1e-12 ? barW / k.K : 0;
  const top = y0 + 30;
  const rowH = Math.min(26, (h - 36) / 4);
  const bar = Math.min(16, rowH - 7);

  // three fills that differ by pattern, not by lightness (which inverts between the themes): the CM part solid,
  // the relative part in vertical stripes of the same colour, the lost part hatched diagonally in the thermal colour
  type Fill = 'solid' | 'stripes' | 'hatch';
  const seg = (x: number, wd: number, y: number, color: string, fill: Fill) => {
    if (wd < 0.5) return;
    ctx.save();
    ctx.fillStyle = fill === 'solid' ? color : withAlpha(color, fill === 'stripes' ? 0.2 : 0.25);
    ctx.fillRect(x, y, wd, bar);
    if (fill !== 'solid') {
      ctx.beginPath();
      ctx.rect(x, y, wd, bar);
      ctx.clip();
      ctx.strokeStyle = color;
      if (fill === 'stripes') {
        ctx.lineWidth = 2;
        for (let sx = x + 2; sx < x + wd; sx += 5) {
          ctx.beginPath();
          ctx.moveTo(sx, y);
          ctx.lineTo(sx, y + bar);
          ctx.stroke();
        }
      } else {
        ctx.lineWidth = 1.2;
        for (let hx = x - bar; hx < x + wd + bar; hx += 6) {
          ctx.beginPath();
          ctx.moveTo(hx, y + bar);
          ctx.lineTo(hx + bar, y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = fill === 'stripes' ? color : p.ink3;
    ctx.lineWidth = fill === 'stripes' ? 1.5 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, wd - 1, bar - 1);
    ctx.restore();
  };
  const KrelAfter = s.e * s.e * k.Krel;
  const lost = out.lost;
  // without a collision nothing is lost and the "after" rows equal the "before" rows
  const relAfter = out.collides ? KrelAfter : k.Krel;
  const data: { y: number; parts: [number, string, Fill, string][] }[] = [
    { y: top, parts: [[k.Kcm, p.energyK, 'solid', 'cm'], [k.Krel, p.energyK, 'stripes', 'rel']] },
    { y: top + rowH, parts: [[k.Kcm, p.energyK, 'solid', 'cm'], [relAfter, p.energyK, 'stripes', 'rel'], [lost, p.energyTh, 'hatch', 'lost']] },
    { y: top + 2 * rowH, parts: [[k.Krel, p.energyK, 'stripes', 'rel']] },
    { y: top + 3 * rowH, parts: [[relAfter, p.energyK, 'stripes', 'rel'], [lost, p.energyTh, 'hatch', 'lost']] },
  ];
  data.forEach((row, i) => {
    heText(ctx, p, rows[i], w - 8, row.y + bar / 2, { size: 12, color: p.ink2 });
    let x = x0;
    for (const [E, color, fill, kind] of row.parts) {
      const wd = E * scale;
      seg(x, wd, row.y, color, fill);
      // labels inside a segment wide enough for them
      if (kind === 'cm' && wd > 46) mathText(ctx, p, '½MV²', x + wd / 2, row.y + bar / 2, { size: 12, color: p.ink });
      if (kind === 'rel' && wd > 56) relEnergyLabel(ctx, p, x + wd / 2, row.y + bar / 2, 12, p.ink);
      if (kind === 'lost' && wd > 40) {
        ctx.save();
        ctx.font = `700 12px ${p.fontUi}`;
        const tw = ctx.measureText('אבדה').width;
        ctx.restore();
        heText(ctx, p, 'אבדה', x + wd / 2 + tw / 2, row.y + bar / 2, { size: 12, weight: 700, color: p.ink });
      }
      x += wd;
    }
  });
  // ½MV² is the same before and after: a dashed line at its end through the two laboratory rows
  if (k.Kcm * scale > 2) {
    const xe = x0 + k.Kcm * scale;
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xe, top - 4);
    ctx.lineTo(xe, top + rowH + bar + 4);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
