/**
 * ParadoxLab: the two paradoxes of special relativity on Minkowski diagrams (lesson 9.6).
 *
 * scene 'twins' (default): the (x, ct) diagram of Earth's frame S, x in light-years and ct in years (c = 1). Earth's
 *   worldline is the ct axis; the traveller's worldline goes out at +v to a star at x = L and back at −v. Both carry a
 *   tick at every year of their own clock (proper time), so the ages at the meeting are counted on the diagram. At the
 *   turnaround, the lines of simultaneity of the outbound frame S′ (slope β) and of the inbound frame S″ (slope −β)
 *   meet Earth's worldline at L/v − βL and L/v + βL: the jump of what the traveller calls "now on Earth". A slider
 *   moves the traveller along her worldline (her clock τ) and draws her current "now" line to Earth. Optional light
 *   signals, one per year of the sender's clock, from Earth to the traveller or from her to Earth.
 * scene 'barn': a pole of proper length 6.0 m moves at β through a barn of proper length 5.0 m whose doors act (close
 *   and reopen at once) at t = 0 in the barn frame, when the pole is centred in the barn. A toggle shows the diagram of
 *   the barn frame S or of the pole frame S′ (events transformed with relativity.ts's `lorentz`): the doors' and the
 *   pole ends' worldlines, the two door events, and lines of constant time of the shown frame through each. A "now"
 *   slider sets a moment of the shown frame; the strip above the diagram is a picture of the barn and the pole at that
 *   moment, aligned with the diagram's x axis.
 *
 * Physics: src/physics/paradoxes.ts (twinScene, homeNow, homeSignals, travellerSignals, properTimeTicks,
 * poleBarnScene, doorInPoleFrame), src/physics/relativity.ts (lorentz). Drawing: src/sims/core/spacetime.ts.
 *
 * Props (<Spread fig="fig-9-6a" figure={ParadoxLab} figureProps={{ scene: 'twins', … }}>)
 *   id       figure id; tasks are `${id}:${task}`
 *   scene    'twins' | 'barn'                                                    (default 'twins')
 *   twins:   L (star distance [ly], 1…6 step 0.5, default 3; the lesson's Steps use 3 and 6), beta (0.2…0.9 step 0.05, default 0.6),
 *            tau (the traveller's clock [years], default 0), signals ('none' | 'home' | 'traveller', default 'none')
 *   barn:    beta (0.3…0.95 step 0.01, default 0.8), frame ('barn' | 'pole', default 'barn'), now (ct of the shown
 *            frame [m], default 0), axes (draw the other frame's axes, default false)
 *   tasks    task ids to show (below)
 *
 * Step `set` keys: the props above except id, scene and tasks. Numbers are clamped.
 *
 * Tasks, ticked only inside the learner's own handlers (a slider, a button), never by a Step:
 *   scrub       twins: the learner moves the traveller's clock across the turnaround
 *   longer      twins: the learner changes the distance to the star
 *   signals     twins: the learner turns on Earth's yearly signals
 *   pole-frame  barn: the learner switches to the pole frame
 *   exit-first  barn: in the pole frame, the learner sets "now" to the moment the exit door acts
 *   no-fit      barn: the learner lowers the speed until the pole no longer fits in the barn frame
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { C_LIGHT } from '~/physics/constants';
import {
  doorInPoleFrame,
  homeNow,
  homeSignals,
  poleBarnScene,
  properTimeTicks,
  travellerSignals,
  twinScene,
  type PoleBarnScene,
  type Signal,
  type TwinScene,
} from '~/physics/paradoxes';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawEvent, drawPrimedAxes, drawRestAxes, drawSimultaneityLine, drawWorldline } from './core/spacetime';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type ParadoxScene = 'twins' | 'barn';
type SignalMode = 'none' | 'home' | 'traveller';
type BarnFrame = 'barn' | 'pole';

const TASK_LABEL: Record<string, string> = {
  scrub: 'הזיזו את השעון של הנוסעת מלפני הסיבוב לאחריו. מה קורה לקריאה של שעון כדור הארץ שהיא מכנה "עכשיו"?',
  longer: 'שנו את המרחק לכוכב בלי לשנות את המהירות. מה קורה להפרש הגילים, ומה לסיבוב עצמו?',
  signals: 'הפעילו את האותות שכדור הארץ שולח בכל שנה. כמה מהם מקבלת הנוסעת בדרך ההליכה, וכמה בדרך החזרה?',
  'pole-frame': 'עברו למערכת של המוט. כמה זמן עובר בה בין פעולת שתי הדלתות, ואיזו פועלת קודם?',
  'exit-first': 'במערכת של המוט, הזיזו את הרגע עד שדלת היציאה פועלת. איפה החזית של המוט באותו רגע?',
  'no-fit': 'הקטינו את המהירות עד שבמערכת של האסם המוט כבר לא נכנס לאסם. מה קורה עכשיו לדלתות בשתי המערכות?',
};

export interface ParadoxLabProps {
  id: string;
  scene?: ParadoxScene;
  L?: number;
  beta?: number;
  tau?: number;
  signals?: SignalMode;
  frame?: BarnFrame;
  now?: number;
  axes?: boolean;
  tasks?: string[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const snap = (x: number, step: number) => Math.round(x / step) * step;
/** a readout number: 3 significant figures, a true minus sign, and no "−0" */
const num = (x: number) => (Math.abs(x) < 0.005 ? '0' : sci(x, 3).replace('-', '−'));

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
  ctx.font = `${o.italic ? 'italic ' : ''}${o.weight ?? 600} ${o.size ?? 12}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Hebrew label, RTL; `align` 'right' puts its right edge at x, 'left' its left edge. Returns its width. */
function heText(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  s: string,
  x: number,
  y: number,
  o: { color?: string; size?: number; weight?: number; align?: 'left' | 'right' | 'center' } = {},
) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = o.align ?? 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `${o.weight ?? 600} ${o.size ?? 12}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink2;
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/** A view that fits the world box [x0, x1] × [y0, y1] into a w × h area, square in world units. */
function fitView(base: View, w: number, h: number, x0: number, x1: number, y0: number, y1: number): View {
  const ppm = Math.min(w / (x1 - x0), h / (y1 - y0));
  return { ...base, w, h, ppm, ox: (x0 + x1) / 2, oy: (y0 + y1) / 2 };
}

/* ================================================================== the component */

export default function ParadoxLab(props: ParadoxLabProps) {
  return props.scene === 'barn' ? <Barn {...props} /> : <Twins {...props} />;
}

/** a taller stage on a phone */
function useAspect(wide: number, narrow: number) {
  const [aspect, setAspect] = useState(wide);
  const watch = (el: HTMLCanvasElement | null) => {
    if (!el) return () => {};
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 520 ? narrow : wide));
    ro.observe(el);
    return () => ro.disconnect();
  };
  return { aspect, watch };
}

/* ------------------------------------------------------------------ twins */

interface TwinState {
  L: number;
  beta: number;
  tau: number;
  signals: SignalMode;
}

const L_MIN = 1;
const L_MAX = 6;
const B_MIN = 0.2;
const B_MAX = 0.9;

function twinInitial(p: ParadoxLabProps): TwinState {
  const L = clamp(p.L ?? 3, L_MIN, L_MAX);
  const beta = clamp(p.beta ?? 0.6, B_MIN, B_MAX);
  const total = twinScene(L, beta, 1).trip.traveller;
  return { L, beta, tau: clamp(p.tau ?? 0, 0, total), signals: p.signals ?? 'none' };
}

function Twins(props: ParadoxLabProps) {
  const [s, setS] = useState<TwinState>(() => twinInitial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t) ?? false;
  const done = (t: string) => {
    if (has(t)) markTask(`${props.id}:${t}`);
  };
  // the side of the turnaround the learner's own slider last left the traveller on
  const ownSide = useRef<'before' | 'after' | null>(null);

  const scene = twinScene(s.L, s.beta, 1);
  const total = scene.trip.traveller;

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        ownSide.current = null;
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.L === 'number') next.L = clamp(st.L, L_MIN, L_MAX);
          if (typeof st.beta === 'number') next.beta = clamp(st.beta, B_MIN, B_MAX);
          if (st.signals === 'none' || st.signals === 'home' || st.signals === 'traveller') next.signals = st.signals;
          const tot = twinScene(next.L, next.beta, 1).trip.traveller;
          next.tau = clamp(typeof st.tau === 'number' ? st.tau : next.tau, 0, tot);
          return next;
        });
      }),
    [props.id],
  );

  useEffect(() => {
    const h = setTimeout(() => setLive(twinDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.L, s.beta, s.tau, s.signals]);

  const { aspect, watch } = useAspect(0.86, 0.74);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintTwins(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [s, aspect]);
  useEffect(() => watch(canvasRef.current), []);

  const reset = () => {
    ownSide.current = null;
    setS(twinInitial(props));
    setLive('האיור אופס.');
  };

  const setTau = (tau: number) => {
    const side = tau > scene.tauTurn + 1e-9 ? 'after' : tau < scene.tauTurn - 1e-9 ? 'before' : null;
    if (side && ownSide.current && side !== ownSide.current) done('scrub');
    if (side) ownSide.current = side;
    setS((prev) => ({ ...prev, tau }));
  };

  const now = homeNow(scene, s.tau);
  const received =
    s.signals === 'home'
      ? homeSignals(scene, 1).filter((g) => g.tauReceive <= s.tau + 1e-9).length
      : s.signals === 'traveller'
        ? travellerSignals(scene, 1).filter((g) => g.tauEmit <= s.tau + 1e-9).length
        : 0;
  const tauStep = 0.05;
  const tauMax = Math.floor(total / tauStep + 1e-6) * tauStep;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: פרדוקס התאומים בדיאגרמת מינקובסקי של מערכת כדור הארץ. ${twinDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="gamma">
            <bdi class="q" dir="ltr">γ</bdi> = <b class="q">{num(scene.gamma)}</b>
          </span>
          <span data-readout="home">
            כדור הארץ בפגישה: <b class="q">{num(scene.trip.home)} שנים</b>
          </span>
          <span data-readout="trav">
            הנוסעת בפגישה: <b class="q">{num(total)} שנים</b>
          </span>
          <span data-readout="now">
            &quot;עכשיו&quot; על כדור הארץ, לפי הנוסעת: <b class="q">{num(now.home)} שנים</b>
          </span>
          <span data-readout="jump">
            הקפיצה בסיבוב: <b class="q">{num(scene.jump)} שנים</b>
          </span>
          {s.signals !== 'none' && (
            <span data-readout="sig">
              {s.signals === 'home' ? 'אותות שהנוסעת קיבלה עד עכשיו: ' : 'אותות שהנוסעת שלחה עד עכשיו: '}
              <b class="q">{received}</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <Slider
            label="המרחק לכוכב"
            min={L_MIN}
            max={L_MAX}
            step={0.5}
            value={s.L}
            format={(v) => `${num(v)} ly`}
            onChange={(v) => {
              const L = clamp(snap(v, 0.5), L_MIN, L_MAX);
              if (L !== s.L) done('longer');
              ownSide.current = null;
              setS((prev) => ({ ...prev, L, tau: clamp(prev.tau, 0, twinScene(L, prev.beta, 1).trip.traveller) }));
            }}
          />
          <Slider
            label="מהירות הנוסעת"
            min={B_MIN}
            max={B_MAX}
            step={0.05}
            value={s.beta}
            format={(v) => `${num(v)}c`}
            onChange={(v) => {
              const beta = clamp(snap(v, 0.05), B_MIN, B_MAX);
              ownSide.current = null;
              setS((prev) => ({ ...prev, beta, tau: clamp(prev.tau, 0, twinScene(prev.L, beta, 1).trip.traveller) }));
            }}
          />
          <Slider
            label="השעון של הנוסעת"
            min={0}
            max={tauMax}
            step={tauStep}
            value={Math.round(s.tau / tauStep) * tauStep}
            format={(v) => `${num(v)} שנים`}
            onChange={(v) => setTau(clamp(v >= tauMax - 1e-9 ? total : v, 0, total))}
          />
          <div class="group" role="group" aria-label="אותות">
            <span class="hint">אותות בכל שנה:</span>
            <Toggle label="בלי" on={s.signals === 'none'} onChange={() => setS((prev) => ({ ...prev, signals: 'none' }))} />
            <Toggle
              label="מכדור הארץ"
              on={s.signals === 'home'}
              onChange={() => {
                done('signals');
                setS((prev) => ({ ...prev, signals: 'home' }));
              }}
            />
            <Toggle label="מהנוסעת" on={s.signals === 'traveller'} onChange={() => setS((prev) => ({ ...prev, signals: 'traveller' }))} />
          </div>
        </>
      }
    />
  );
}

function twinDescribe(s: TwinState): string {
  const sc = twinScene(s.L, s.beta, 1);
  const n = homeNow(sc, s.tau);
  return (
    `כוכב במרחק ${num(s.L)} שנות אור, מהירות ${num(s.beta)} ממהירות האור. ` +
    `במערכת של כדור הארץ המסע נמשך ${num(sc.trip.home)} שנים, ובשעון של הנוסעת ${num(sc.trip.traveller)} שנים. ` +
    `בסיבוב, מה שהנוסעת מכנה "עכשיו" על כדור הארץ קופץ מ-${num(sc.trip.homeAtTurnOutbound)} ל-${num(sc.trip.homeAtTurnInbound)} שנים. ` +
    `כשהשעון שלה מראה ${num(s.tau)} שנים, "עכשיו" על כדור הארץ, לפי המערכת שלה, הוא ${num(n.home)} שנים.`
  );
}

const TOP = 26; // px above the diagram for the title

function paintTwins(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: TwinState) {
  const sc: TwinScene = twinScene(s.L, s.beta, 1);
  const T = sc.trip.home;
  const narrow = view.w < 520;
  const v = fitView(view, view.w, view.h - TOP, -1.25, s.L + 1.0, -0.7, T + 0.7);
  ctx.save();
  ctx.translate(0, TOP);

  drawRestAxes(ctx, v, p, { tick: 1, grid: true });
  for (let x = 1; x <= s.L + 1e-9; x++) {
    const [sx, sy] = toScreen(v, x, 0);
    mathText(ctx, p, String(x), sx, sy + 13, { size: 10, color: p.ink2 });
  }

  // the star at rest in S, faint
  const [sx0] = toScreen(v, s.L, 0);
  const [, syTop] = toScreen(v, 0, T + 0.6);
  const [, syBot] = toScreen(v, 0, 0);
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink2, 0.5);
  ctx.lineWidth = 1.2;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(sx0, syBot);
  ctx.lineTo(sx0, syTop);
  ctx.stroke();
  ctx.restore();
  heText(ctx, p, 'כוכב', sx0 + 4, syTop + 2, { size: 11, align: 'center', color: p.ink2 });

  // signals under the worldlines
  const sigs: Signal[] = s.signals === 'home' ? homeSignals(sc, 1) : s.signals === 'traveller' ? travellerSignals(sc, 1) : [];
  for (const g of sigs) {
    const reached = s.signals === 'home' ? g.tauReceive <= s.tau + 1e-9 : g.tauEmit <= s.tau + 1e-9;
    ctx.save();
    ctx.setLineDash([4, 3]);
    drawWorldline(
      ctx,
      v,
      [
        [g.emit.x, g.emit.t],
        [g.receive.x, g.receive.t],
      ],
      withAlpha(p.accent, reached ? 0.9 : 0.35),
      1.3,
    );
    ctx.restore();
  }

  // the turnaround's lines of simultaneity and the jump on Earth's worldline
  const turn: [number, number] = [sc.turn.x, sc.turn.t];
  drawSimultaneityLine(ctx, v, p, s.beta, turn);
  drawSimultaneityLine(ctx, v, p, -s.beta, turn);
  const [jx, j0] = toScreen(v, 0, sc.trip.homeAtTurnOutbound);
  const [, j1] = toScreen(v, 0, sc.trip.homeAtTurnInbound);
  ctx.save();
  ctx.strokeStyle = withAlpha(p.velocity, 0.35);
  ctx.lineWidth = 9;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(jx, j0);
  ctx.lineTo(jx, j1);
  ctx.stroke();
  ctx.restore();

  // worldlines
  drawWorldline(
    ctx,
    v,
    sc.home.map((e) => [e.x, e.t] as const),
    p.ink,
    3,
  );
  drawWorldline(
    ctx,
    v,
    sc.traveller.map((e) => [e.x, e.t] as const),
    p.equip,
    3,
  );

  // proper-time ticks: every year of each twin's own clock
  const labelEvery = v.ppm < 22 ? 2 : 1;
  for (const { tau, e } of properTimeTicks(sc.home, 1, 1)) {
    const [x, y] = toScreen(v, e.x, e.t);
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x + 6, y);
    ctx.stroke();
    ctx.restore();
    if (tau > 0 && Math.round(tau) % labelEvery === 0) mathText(ctx, p, num(tau), x - 10, y, { align: 'right', size: 11, color: p.ink });
  }
  for (const { tau, e } of properTimeTicks(sc.traveller, 1, 1)) {
    const [x, y] = toScreen(v, e.x, e.t);
    ctx.save();
    ctx.strokeStyle = p.equip;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x + 6, y);
    ctx.stroke();
    ctx.restore();
    // the turn's own label would sit on the traveller's dot and the frame names: put it below the turn instead
    const atTurn = Math.abs(tau - sc.tauTurn) < 1e-6;
    if (tau > 0 && Math.round(tau) % labelEvery === 0)
      mathText(ctx, p, num(tau), atTurn ? x : x + 10, atTurn ? y + 16 : y, { align: atTurn ? 'center' : 'left', size: 11, color: p.equip });
  }

  // the turn readings and the jump label, right of Earth's worldline between the two lines
  mathText(ctx, p, num(sc.trip.homeAtTurnOutbound), jx + 9, j0 + 9, { align: 'left', size: 11, color: p.velocity });
  mathText(ctx, p, num(sc.trip.homeAtTurnInbound), jx + 9, j1 - 9, { align: 'left', size: 11, color: p.velocity });
  if (Math.abs(j1 - j0) > 46) {
    heText(ctx, p, 'קפיצה', jx + 9, (j0 + j1) / 2 - 7, { align: 'left', size: 11, color: p.velocity });
    mathText(ctx, p, num(sc.jump), jx + 9, (j0 + j1) / 2 + 8, { align: 'left', size: 11, color: p.velocity });
  }
  // the frames' names on their lines, beyond the turn
  const lab = (dir: 1 | -1, name: string) => {
    const x = s.L + 0.55;
    const t = sc.turn.t + dir * s.beta * 0.55;
    const [lx, ly] = toScreen(v, x, t);
    mathText(ctx, p, name, lx + 4, ly + (dir > 0 ? -9 : 9), { size: 12, color: p.velocity, italic: true });
  };
  lab(1, 'S′');
  lab(-1, 'S″');

  // the traveller now: her event and the line of her frame's "now" back to Earth
  const n = homeNow(sc, s.tau);
  const [ex, ey] = toScreen(v, n.e.x, n.e.t);
  const [hx, hy] = toScreen(v, 0, n.home);
  ctx.save();
  ctx.strokeStyle = p.velocity;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.restore();
  drawEvent(ctx, v, p, 0, n.home, undefined, p.velocity, 4.5);
  drawEvent(ctx, v, p, n.e.x, n.e.t, undefined, p.equip, 6);

  // events: departure, turnaround, meeting
  drawEvent(ctx, v, p, 0, 0, undefined, p.ink, 4.5);
  drawEvent(ctx, v, p, 0, T, undefined, p.ink, 4.5);

  // names of the worldlines
  // the traveller's name left of her outbound leg, a quarter of the way out (clear of the turn's labels)
  const [tx, ty] = toScreen(v, sc.turn.x * 0.3, sc.turn.t * 0.3);
  heText(ctx, p, 'הנוסעת', tx - (narrow ? 6 : 10), ty - 4, { align: 'right', size: 12, color: p.equip, weight: 700 });
  const [mx, my] = toScreen(v, 0, T);
  heText(ctx, p, 'כדור הארץ', mx + 8, my - 2, { align: 'left', size: 12, color: p.ink, weight: 700 });
  ctx.restore();

  // title, left of the reset and fullscreen buttons
  const tw = heText(ctx, p, 'מערכת כדור הארץ', view.w - 90, 14, { size: 13, weight: 700, color: p.ink });
  mathText(ctx, p, 'S', view.w - 90 - tw - 8, 14, { align: 'right', size: 14, italic: true });
}

/* ------------------------------------------------------------------ pole and barn */

interface BarnState {
  beta: number;
  frame: BarnFrame;
  now: number;
  axes: boolean;
}

const LPOLE = 6.0;
const LBARN = 5.0;
const BB_MIN = 0.3;
const BB_MAX = 0.95;
const STRIP = 72; // px above the diagram: the title and the picture at "now"
const DOOR_WINDOW = 0.25; // a door shows as closed within ±0.25 m of ct around its event

/** The world box of the shown frame: x and ct ranges that hold the door events and the pole. */
function barnBox(sc: PoleBarnScene, frame: BarnFrame): [number, number, number, number] {
  if (frame === 'barn') {
    const xs = [0, LBARN, sc.rear0, sc.front0];
    return [Math.min(...xs) - 2.2, Math.max(...xs) + 2.2, -6, 6];
  }
  const ts = [sc.doorsPole[0].t, sc.doorsPole[1].t];
  const xs = [sc.doorsPole[0].x, sc.doorsPole[1].x, sc.rearPole, sc.frontPole];
  return [Math.min(...xs) - 2.2, Math.max(...xs) + 2.2, Math.min(...ts) - 4.5, Math.max(...ts) + 4.5];
}

function barnInitial(p: ParadoxLabProps): BarnState {
  const beta = clamp(p.beta ?? 0.8, BB_MIN, BB_MAX);
  const frame = p.frame ?? 'barn';
  const box = barnBox(poleBarnScene(LPOLE, LBARN, beta, 1), frame);
  return { beta, frame, now: clamp(p.now ?? 0, box[2], box[3]), axes: p.axes ?? false };
}

/** Where the barn's doors and the pole's ends are at ct of the shown frame. */
function barnAt(sc: PoleBarnScene, frame: BarnFrame, ct: number) {
  if (frame === 'barn') {
    return { entrance: 0, exit: LBARN, rear: sc.rear0 + sc.v * ct, front: sc.front0 + sc.v * ct };
  }
  return { entrance: doorInPoleFrame(sc, 0, ct), exit: doorInPoleFrame(sc, 1, ct), rear: sc.rearPole, front: sc.frontPole };
}

function doorTimes(sc: PoleBarnScene, frame: BarnFrame): [number, number] {
  return frame === 'barn' ? [0, 0] : [sc.doorsPole[0].t, sc.doorsPole[1].t];
}

function Barn(props: ParadoxLabProps) {
  const [s, setS] = useState<BarnState>(() => barnInitial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };
  const sc = poleBarnScene(LPOLE, LBARN, s.beta, 1);
  const box = barnBox(sc, s.frame);

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.beta === 'number') next.beta = clamp(st.beta, BB_MIN, BB_MAX);
          if (st.frame === 'barn' || st.frame === 'pole') next.frame = st.frame;
          if (typeof st.axes === 'boolean') next.axes = st.axes;
          const b = barnBox(poleBarnScene(LPOLE, LBARN, next.beta, 1), next.frame);
          next.now = clamp(typeof st.now === 'number' ? st.now : 0, b[2], b[3]);
          return next;
        });
      }),
    [props.id],
  );

  useEffect(() => {
    const h = setTimeout(() => setLive(barnDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.beta, s.frame, s.now]);

  const { aspect, watch } = useAspect(1.0, 0.8);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintBarn(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [s, aspect]);
  useEffect(() => watch(canvasRef.current), []);

  const reset = () => {
    setS(barnInitial(props));
    setLive('האיור אופס.');
  };

  const setFrame = (frame: BarnFrame) => {
    if (frame === 'pole') done('pole-frame');
    setS((prev) => ({ ...prev, frame, now: 0 }));
  };

  const [tEn, tEx] = doorTimes(sc, s.frame);
  const nsPerM = 1e9 / C_LIGHT;
  const poleLen = s.frame === 'barn' ? sc.poleInBarnFrame : LPOLE;
  const barnLen = s.frame === 'barn' ? LBARN : sc.barnInPoleFrame;
  const hit = sc.hitsBarnFrame[0] || sc.hitsBarnFrame[1];
  const nowStep = 0.05;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: פרדוקס המוט והאסם בדיאגרמת מינקובסקי. ${barnDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="gamma">
            <bdi class="q" dir="ltr">γ</bdi> = <b class="q">{num(sc.gamma)}</b>
          </span>
          <span data-readout="pole">
            אורך המוט: <b class="q">{num(poleLen)} m</b>
          </span>
          <span data-readout="barn">
            אורך האסם: <b class="q">{num(barnLen)} m</b>
          </span>
          <span data-readout="gap">
            בין פעולות הדלתות: <b class="q">{num(Math.abs(tEn - tEx) * nsPerM)} ns</b>
          </span>
          <span data-readout="hit">
            <b>{hit ? 'הדלתות פוגעות במוט' : 'אף דלת לא נוגעת במוט'}</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מערכת ייחוס">
            <span class="hint">דיאגרמה במערכת:</span>
            <Toggle label="של האסם" on={s.frame === 'barn'} onChange={() => setFrame('barn')} />
            <Toggle label="של המוט" on={s.frame === 'pole'} onChange={() => setFrame('pole')} />
            <Toggle label="צירי המערכת השנייה" on={s.axes} onChange={(on) => setS((prev) => ({ ...prev, axes: on }))} />
          </div>
          <Slider
            label="מהירות המוט"
            min={BB_MIN}
            max={BB_MAX}
            step={0.01}
            value={s.beta}
            format={(v) => `${num(v)}c`}
            onChange={(v) => {
              const beta = clamp(snap(v, 0.01), BB_MIN, BB_MAX);
              if (!poleBarnScene(LPOLE, LBARN, beta, 1).fitsInBarnFrame) done('no-fit');
              setS((prev) => {
                const b = barnBox(poleBarnScene(LPOLE, LBARN, beta, 1), prev.frame);
                return { ...prev, beta, now: clamp(prev.now, b[2], b[3]) };
              });
            }}
          />
          <Slider
            label={s.frame === 'barn' ? 'הרגע, במערכת של האסם (ct)' : 'הרגע, במערכת של המוט (ct′)'}
            min={Math.ceil(box[2] / nowStep) * nowStep}
            max={Math.floor(box[3] / nowStep) * nowStep}
            step={nowStep}
            value={Math.round(s.now / nowStep) * nowStep}
            format={(v) => `${num(v)} m`}
            onChange={(v) => {
              if (s.frame === 'pole' && Math.abs(v - tEx) <= DOOR_WINDOW) done('exit-first');
              setS((prev) => ({ ...prev, now: v }));
            }}
          />
        </>
      }
    />
  );
}

function barnDescribe(s: BarnState): string {
  const sc = poleBarnScene(LPOLE, LBARN, s.beta, 1);
  const gapNs = (sc.doorGapPole * 1e9) / C_LIGHT;
  const fits = sc.fitsInBarnFrame
    ? `במערכת של האסם המוט באורך ${num(sc.poleInBarnFrame)} מטר, קצר מהאסם, ואף דלת לא נוגעת בו.`
    : `במערכת של האסם המוט באורך ${num(sc.poleInBarnFrame)} מטר, ארוך מהאסם, והדלתות פוגעות בו.`;
  const frame =
    s.frame === 'barn'
      ? 'הדיאגרמה במערכת של האסם: שתי הדלתות פועלות באותו רגע.'
      : `הדיאגרמה במערכת של המוט: האסם באורך ${num(sc.barnInPoleFrame)} מטר, ודלת היציאה פועלת ${num(gapNs)} ננו-שניות לפני דלת הכניסה.`;
  return `מוט באורך עצמי 6 מטר נע במהירות ${num(s.beta)} ממהירות האור דרך אסם באורך עצמי 5 מטר. ${fits} ${frame}`;
}

function paintBarn(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: BarnState) {
  const sc = poleBarnScene(LPOLE, LBARN, s.beta, 1);
  const pole = s.frame === 'pole';
  const [x0, x1, y0, y1] = barnBox(sc, s.frame);
  const v = fitView(view, view.w, view.h - STRIP, x0, x1, y0, y1);
  const [tEn, tEx] = doorTimes(sc, s.frame);
  const doorEv: [number, number][] = pole
    ? [
        [sc.doorsPole[0].x, sc.doorsPole[0].t],
        [sc.doorsPole[1].x, sc.doorsPole[1].t],
      ]
    : [
        [0, 0],
        [LBARN, 0],
      ];

  ctx.save();
  ctx.translate(0, STRIP);
  ctx.beginPath();
  ctx.rect(0, 0, v.w, v.h);
  ctx.clip();
  drawRestAxes(ctx, v, p, { tick: 1, grid: true, xLabel: pole ? 'x′' : 'x', ctLabel: pole ? 'ct′' : 'ct' });
  if (s.axes) {
    // the other frame's axes: the pole frame moves at +β in the barn frame, the barn frame at −β in the pole frame
    drawPrimedAxes(ctx, v, p, pole ? -s.beta : s.beta, { tick: 1, xLabel: pole ? 'x' : 'x′', ctLabel: pole ? 'ct' : 'ct′' });
  }

  // worldlines between the bottom and top of the view
  const at = (ct: number) => barnAt(sc, s.frame, ct);
  const lo = at(y0 - 1);
  const hi = at(y1 + 1);
  // the pole: a band between its ends
  const corners = [
    toScreen(v, lo.rear, y0 - 1),
    toScreen(v, lo.front, y0 - 1),
    toScreen(v, hi.front, y1 + 1),
    toScreen(v, hi.rear, y1 + 1),
  ];
  ctx.save();
  ctx.fillStyle = withAlpha(p.equip, 0.16);
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  drawWorldline(ctx, v, [[lo.rear, y0 - 1], [hi.rear, y1 + 1]], p.equip, 2.5);
  drawWorldline(ctx, v, [[lo.front, y0 - 1], [hi.front, y1 + 1]], p.equip, 2.5);
  drawWorldline(ctx, v, [[lo.entrance, y0 - 1], [hi.entrance, y1 + 1]], p.ink, 2.5);
  drawWorldline(ctx, v, [[lo.exit, y0 - 1], [hi.exit, y1 + 1]], p.ink, 2.5);

  // lines of constant time of the shown frame through each door event
  for (const [, t] of doorEv) drawSimultaneityLine(ctx, v, p, 0, [0, t], p.ink2);
  // the shown frame's "now"
  const [, ny] = toScreen(v, 0, s.now);
  ctx.save();
  ctx.strokeStyle = withAlpha(p.hand, 0.85);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, ny);
  ctx.lineTo(v.w, ny);
  ctx.stroke();
  ctx.restore();

  // the door events
  const names = ['כניסה', 'יציאה'];
  doorEv.forEach(([x, t], i) => {
    drawEvent(ctx, v, p, x, t, undefined, p.accent, 6);
    const [ex, ey] = toScreen(v, x, t);
    heText(ctx, p, names[i], ex + (i === 0 ? -10 : 10), ey - 14, { align: i === 0 ? 'right' : 'left', size: 12, color: p.accent, weight: 700 });
  });
  // the door times of the shown frame, at the left edge
  if (pole) {
    const [, y] = toScreen(v, 0, tEx);
    mathText(ctx, p, `ct′ = ${num(tEx)} m`, 6, y - 9, { align: 'left', size: 11, color: p.ink2 });
  }
  // worldline names, outside the band and the barn: the pole right of its front, the barn left of its entrance,
  // at the first height (top down) where the name stays inside the view
  const heights = [y1 - 0.7, y1 - 2, (y0 + y1) / 2 + 1.5, y0 + 1];
  const tFront = heights.find((t) => at(t).front > x0 + 0.3 && at(t).front < x1 - 1.4) ?? y1 - 0.7;
  const [fx, fy] = toScreen(v, at(tFront).front, tFront);
  heText(ctx, p, 'מוט', fx + 8, fy, { align: 'left', size: 12, color: p.equip, weight: 700 });
  const tEntr = heights.slice(1).find((t) => at(t).entrance > x0 + 1.4 && at(t).entrance < x1 - 0.3) ?? y1 - 0.7;
  const [bx, by] = toScreen(v, at(tEntr).entrance, tEntr);
  heText(ctx, p, 'אסם', bx - 8, by, { align: 'right', size: 12, color: p.ink, weight: 700 });
  ctx.restore();

  // the picture at "now", aligned with the diagram's x axis
  const now = at(s.now);
  const sxw = (x: number) => toScreen(v, x, 0)[0];
  const yMid = 52;
  const half = 11;
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.fillStyle = withAlpha(p.ink, 0.05);
  const xa = sxw(now.entrance);
  const xb = sxw(now.exit);
  ctx.fillRect(xa, yMid - half, xb - xa, 2 * half);
  ctx.beginPath();
  ctx.moveTo(xa, yMid - half);
  ctx.lineTo(xb, yMid - half);
  ctx.moveTo(xa, yMid + half);
  ctx.lineTo(xb, yMid + half);
  ctx.stroke();
  // doors: closed (a solid bar) only around their events
  [now.entrance, now.exit].forEach((x, i) => {
    const closed = Math.abs(s.now - [tEn, tEx][i]) <= DOOR_WINDOW;
    const sx = sxw(x);
    ctx.save();
    ctx.strokeStyle = closed ? p.accent : withAlpha(p.ink, 0.6);
    ctx.lineWidth = closed ? 4 : 1.5;
    if (!closed) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sx, yMid - half - 3);
    ctx.lineTo(sx, yMid + half + 3);
    ctx.stroke();
    ctx.restore();
  });
  ctx.fillStyle = p.equip;
  ctx.fillRect(sxw(now.rear), yMid - 4, sxw(now.front) - sxw(now.rear), 8);
  ctx.restore();
  mathText(ctx, p, `${pole ? 'ct′' : 'ct'} = ${num(s.now)} m`, 6, yMid, { align: 'left', size: 11, color: p.hand });

  const title = pole ? 'מערכת המוט' : 'מערכת האסם';
  const tw = heText(ctx, p, title, view.w - 90, 14, { size: 13, weight: 700, color: p.ink });
  mathText(ctx, p, pole ? 'S′' : 'S', view.w - 90 - tw - 8, 14, { align: 'right', size: 14, italic: true });
}
