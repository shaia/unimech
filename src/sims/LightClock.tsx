/**
 * LightClock (lesson 9.2): time dilation and length contraction from a light clock and from muons.
 *
 * mode 'clock' (figure 9.2א): a light clock, two mirrors a proper distance L₀ = 1.8 m apart with a light pulse
 *   bouncing between them, rides a cart. The cart's frame S′ moves at v = βc along +x relative to the ground frame
 *   S. Two windows, one above the other: on top the clock in its own frame S′ (at rest; the pulse goes straight
 *   between the mirrors, one tick T₀ = 2L₀/c = 12 ns); below, the same clock seen from S (the cart moves; the pulse
 *   runs a zigzag at c). One tick in S: the pulse leaves the base mirror at x = 0, t = 0 and comes back to it at
 *   x = vT, t = T = γT₀. Two clocks of S, synchronised in S, stand on the track at those two places. The moving
 *   clock's own reading τ is shown on the cart. Orientation 'transverse' (mirrors across the motion) or
 *   'longitudinal' (along it: the mirrors are L₀/γ apart in S, the legs take L/(c − v) and L/(c + v), and the tick
 *   is again γT₀). Everything that belongs to the cart (its body, the mirrors' widths, the longitudinal clock) is
 *   drawn contracted along x in S; heights are not. The top window runs on the moving clock's own reading τ = t/γ
 *   (each window shows its own frame's "now"; they agree at the tick's two events, which happen at one place).
 * mode 'muon' (figure 9.2ב): 40 muons (mean lifetime τ_μ = 2.2 μs in their rest frame) are created at the top of an
 *   atmosphere of proper thickness H = 15 km and fall straight down at v = βc. Right: the Earth's frame S (the air is
 *   15 km thick, the muons' clocks run slow: mean lifetime γτ_μ). Left: the muons' frame (they stand; the air, H/γ
 *   thick, and the ground rise at v). Both on one vertical scale, both driven by the muons' own clock, so the same
 *   muons decay at the same moments of that clock. A "without relativity" switch shows the classical prediction.
 *   The muons' lifetimes are the quantiles of the exponential law (swarmLifetimes), so the count tracks e^{−Δτ/τ_μ} (Δτ the muons' own clock, drawn as "Δτ = …").
 *
 * Physics: src/physics/dilation.ts (clockSnapshot, longitudinalLegs, properTick, crossing, swarmLifetimes,
 * MUON_LIFETIME) on src/physics/relativity.ts (gammaOf). Canvas world coordinates are y-up.
 *
 * Step `set` keys: clock: beta (0…0.9), orient ('transverse' | 'longitudinal'), prog (fraction of the tick, 0…1).
 *   muon: beta (0.9…0.999), prog (fraction of the flight, 0…1), classical (boolean). A step never plays.
 *
 * Tasks tick only inside the learner's own handlers (sliders, switches, the play button reaching its end):
 *   diagonal   clock, across: the learner plays a whole tick with β ≥ 0.5
 *   gamma-two  clock: the learner sets β so that γ is within 0.05 of 2 (the moving clock ticks once per two of S's)
 *   along      clock, along: the learner plays a whole tick with β ≥ 0.5
 *   land       muon: the learner plays the fall to the ground, with relativity
 *   classical  muon: the learner switches relativity off
 *   speed      muon: the learner raises β to 0.999
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { C_LIGHT } from '~/physics/constants';
import { clockSnapshot, crossing, longitudinalLegs, MUON_LIFETIME, properTick, swarmLifetimes, type ClockOrientation } from '~/physics/dilation';
import { gammaOf } from '~/physics/relativity';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { sci } from './core/format';
import { arrow, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type LightClockMode = 'clock' | 'muon';

export interface LightClockProps {
  id: string;
  mode?: LightClockMode;
  /** β = v/c */
  beta?: number;
  orient?: ClockOrientation;
  /** fraction of the tick (clock) or of the flight (muon) shown, 0…1 */
  prog?: number;
  classical?: boolean;
  tasks?: string[];
}

const TASK_LABEL: Record<string, string> = {
  diagonal: 'קבעו מהירות של 0.5c לפחות, והפעילו תקתוק שלם. כמה מראים שני השעונים של S, וכמה השעון של הקרון?',
  'gamma-two': 'מצאו מהירות שבה תקתוק אחד של השעון של הקרון נמשך, לפי שעוני S, פי 2 מ-12 ns.',
  along: 'סובבו את השעון כך שיעמוד לאורך התנועה, והפעילו תקתוק שלם במהירות של 0.5c לפחות. השוו את התקתוק לשעון הניצב.',
  land: 'הפעילו את הנפילה עד הקרקע. כמה מיואונים מגיעים, בכל אחת משתי המערכות?',
  classical: 'כבו את היחסות. כמה מיואונים היו מגיעים לקרקע לפי הפיזיקה של ניוטון?',
  speed: 'האיצו את המיואונים ל-0.999c. מה קרה לעובי האטמוספרה במערכת שלהם?',
};

const c = C_LIGHT;
const NS = 1e-9;
const US = 1e-6;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/** a readout number: 3 significant figures and a true minus sign */
const num = (x: number) => sci(x, 3).replace('-', '−');

/* ================================================================== text on the canvas */

/** Latin/math label, LTR, centred on (x, y) unless `align` says otherwise. */
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
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Hebrew label, RTL; `edge` says which of its edges sits at x. Returns its width. */
function heText(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  s: string,
  x: number,
  y: number,
  o: { color?: string; size?: number; weight?: number; edge?: 'left' | 'right' } = {},
) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = o.edge ?? 'right';
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

/** A panel title: "S′" then a Hebrew name, its left edge at x. */
function panelTitle(ctx: CanvasRenderingContext2D, p: Palette, frame: string, name: string, x: number, y: number, size = 13) {
  ctx.save();
  ctx.font = `italic 700 ${size + 1}px ${p.fontUi}`;
  const wf = ctx.measureText(frame).width;
  ctx.restore();
  mathText(ctx, p, frame, x, y, { align: 'left', size: size + 1 });
  heText(ctx, p, name, x + wf + 6, y, { edge: 'left', size, weight: 700, color: p.ink });
}

/**
 * A small digital clock face: a rounded box with "sym = value unit" in it, centred on (x, y), or with its left edge
 * at x when `left`; `bounds` [x1, x2] keeps the whole box between two screen x's.
 */
function clockFace(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  x0: number,
  y: number,
  text: string,
  color: string,
  size = 12,
  o: { left?: boolean; bounds?: [number, number] } = {},
) {
  ctx.save();
  ctx.font = `700 ${size}px ${p.fontUi}`;
  ctx.direction = 'ltr';
  const w = ctx.measureText(text).width + 12;
  let x = o.left ? x0 + w / 2 : x0;
  if (o.bounds) x = clamp(x, o.bounds[0] + w / 2 + 2, o.bounds[1] - w / 2 - 2);
  const h = size + 9;
  ctx.fillStyle = withAlpha(p.paper, 0.95);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
  return w;
}

/* ================================================================== the component */

export default function LightClock(props: LightClockProps) {
  return props.mode === 'muon' ? <Muons {...props} /> : <Clock {...props} />;
}

/** Watch the canvas width (phones get a taller stage). */
function useNarrow(canvasRef: { current: HTMLCanvasElement | null }, setNarrow: (n: boolean) => void) {
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.getBoundingClientRect().width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
}

/** Playback of a 0…1 progress at `rate` per second, frozen in still mode; `onEnd` runs once at 1. */
function usePlayback(playing: boolean, rate: number, step: (dp: number) => void) {
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!motionAllowed() || document.hidden) return;
      stepRef.current(dt * rate);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate]);
}

/* ------------------------------------------------------------------ clock */

const L0 = 1.8; // the mirrors' proper separation [m]
const CART_HALF = 1.1; // half the cart's proper length, transverse clock [m]
const MIRROR_HALF = 0.35; // half a transverse mirror's proper width [m]
const LONG_Y = 0.6; // height of the longitudinal clock's axis above the deck [m]
const LONG_SPLIT = 0.09; // the out and back legs are drawn this far above / below the axis [m]
const BETA_MAX = 0.9;
const TICK_RATE_NS = 8; // ns of S time per second of playback

interface ClockState {
  beta: number;
  orient: ClockOrientation;
  prog: number;
  playing: boolean;
}

function clockInitial(p: LightClockProps): ClockState {
  return {
    beta: clamp(p.beta ?? 0.8, 0, BETA_MAX),
    orient: p.orient ?? 'transverse',
    prog: clamp(p.prog ?? 1, 0, 1),
    playing: false,
  };
}

/**
 * World layout of the clock stage [m]: the S′ window above the S window. `band` is the room for a window's title
 * line and formula line above its drawing (wider in metres on a phone, where a metre is fewer pixels).
 */
interface ClockLayout {
  W: number;
  topH: number;
  gap: number;
  botH: number;
  band: number;
}
const BELOW_DECK = 1.75; // the S window: the cart, the track and S's clocks below the deck [m]
const ABOVE_CLOCK = 0.5; // the S window: the velocity arrow above the clock [m]
function clockLayout(narrow: boolean): ClockLayout {
  const band = narrow ? 1.35 : 0.95;
  return { W: narrow ? 10.2 : 10.6, topH: narrow ? 3.9 : 2.95, gap: 0.15, botH: band + ABOVE_CLOCK + L0 + BELOW_DECK, band };
}
const X_LEFT = 1.2; // world x = 0 sits this far from the window's left edge [m]

function Clock(props: LightClockProps) {
  const [s, setS] = useState<ClockState>(() => clockInitial(props));
  const [live, setLive] = useState('');
  const [narrow, setNarrow] = useState(false);
  const ownPlay = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        ownPlay.current = false;
        setS((prev) => {
          const next = { ...prev, playing: false };
          if (typeof st.beta === 'number') next.beta = clamp(st.beta, 0, BETA_MAX);
          if (st.orient === 'transverse' || st.orient === 'longitudinal') next.orient = st.orient;
          if (typeof st.prog === 'number') next.prog = clamp(st.prog, 0, 1);
          return next;
        });
      }),
    [props.id],
  );

  const g = gammaOf(s.beta);
  const T = g * properTick(L0);
  usePlayback(s.playing, (TICK_RATE_NS * NS) / T, (dp) => {
    setS((prev) => {
      const prog = prev.prog + dp;
      if (prog < 1) return { ...prev, prog };
      if (ownPlay.current && prev.beta >= 0.5 - 1e-9) done(prev.orient === 'transverse' ? 'diagonal' : 'along');
      ownPlay.current = false;
      return { ...prev, prog: 1, playing: false };
    });
  });

  useEffect(() => {
    const h = setTimeout(() => setLive(clockDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.beta, s.orient]);

  const L = clockLayout(narrow);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintClock(ctx, view, p, s, L);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: L.W, worldHeight: L.topH + L.gap + L.botH, animate: false });
  useNarrow(canvasRef, setNarrow);
  useEffect(invalidate, [s, narrow]);

  const reset = () => {
    ownPlay.current = false;
    setS(clockInitial(props));
    setLive('האיור אופס.');
  };

  const t = s.prog * T;
  const [out, back] = longitudinalLegs(L0, s.beta * c);
  const sep = s.orient === 'transverse' ? L0 : L0 / g;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: שעון אור על קרון. למעלה השעון במערכת שלו, למטה במערכת הקרקע, שבה הקרון נע. ${clockDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={L.W / (L.topH + L.gap + L.botH)}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="beta">
            <bdi dir="ltr">
              <i>β</i> = <b class="q">{num(s.beta)}</b>
            </bdi>
          </span>
          <span data-readout="gamma">
            <bdi dir="ltr">
              <i>γ</i> = <b class="q">{num(g)}</b>
            </bdi>
          </span>
          <span data-readout="T0">
            תקתוק ב-<bdi dir="ltr">S′</bdi>: <b class="q"><bdi dir="ltr">{num(properTick(L0) / NS)} ns</bdi></b>
          </span>
          <span data-readout="T">
            תקתוק ב-<bdi dir="ltr">S</bdi>: <b class="q"><bdi dir="ltr">{num(T / NS)} ns</bdi></b>
          </span>
          {s.orient === 'longitudinal' && (
            <span data-readout="legs">
              הלוך וחזור ב-<bdi dir="ltr">S</bdi>:{' '}
              <b class="q">
                <bdi dir="ltr">
                  {num(out / NS)} + {num(back / NS)} ns
                </bdi>
              </b>
            </span>
          )}
          <span data-readout="sep">
            המרחק בין המראות ב-<bdi dir="ltr">S</bdi>: <b class="q"><bdi dir="ltr">{num(sep)} m</bdi></b>
          </span>
          <span data-readout="clocks">
            עכשיו:{' '}
            <b class="q">
              <bdi dir="ltr">
                t = {num(t / NS)} ns, τ = {num(t / g / NS)} ns
              </bdi>
            </b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="כיוון השעון">
            <Toggle
              label="שעון ניצב לתנועה"
              on={s.orient === 'transverse'}
              onChange={() => {
                ownPlay.current = false;
                setS((prev) => ({ ...prev, orient: 'transverse', playing: false }));
              }}
            />
            <Toggle
              label="שעון לאורך התנועה"
              on={s.orient === 'longitudinal'}
              onChange={() => {
                ownPlay.current = false;
                setS((prev) => ({ ...prev, orient: 'longitudinal', playing: false }));
              }}
            />
          </div>
          <Slider
            label="מהירות הקרון, β = v/c"
            min={0}
            max={BETA_MAX}
            step={0.01}
            value={s.beta}
            format={(v) => `${num(v)}c`}
            onChange={(v) => {
              ownPlay.current = false;
              setS((prev) => ({ ...prev, beta: v, playing: false }));
              if (Math.abs(gammaOf(v) - 2) <= 0.05) done('gamma-two');
            }}
          />
          <div class="group" role="group" aria-label="זמן">
            <Toggle
              label={s.playing ? 'עצירה' : 'תקתוק'}
              on={s.playing}
              onChange={(on) => {
                ownPlay.current = on;
                if (on && s.prog >= 1 - 1e-9) setS((prev) => ({ ...prev, prog: 0, playing: true }));
                else setS((prev) => ({ ...prev, playing: on }));
              }}
            />
          </div>
          <Slider
            label="זמן בתוך התקתוק"
            min={0}
            max={1}
            step={0.01}
            value={Math.round(s.prog * 100) / 100}
            format={(v) => `${num(v * T / NS)} ns`}
            onChange={(v) => {
              ownPlay.current = false;
              setS((prev) => ({ ...prev, prog: v, playing: false }));
            }}
          />
        </>
      }
    />
  );
}

function clockDescribe(s: ClockState): string {
  const g = gammaOf(s.beta);
  const T = g * properTick(L0);
  const along = s.orient === 'longitudinal';
  return `השעון ${along ? 'לאורך התנועה' : 'ניצב לתנועה'}, והקרון נע במהירות ${num(s.beta)} ממהירות האור. במערכת של הקרון תקתוק נמשך ${num(properTick(L0) / NS)} ננו-שניות; במערכת הקרקע ${num(T / NS)} ננו-שניות, פי ${num(g)}.`;
}

function paintClock(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: ClockState, L: ClockLayout) {
  const { w, h, ppm } = view;
  const totalH = L.topH + L.gap + L.botH;
  const left = w / 2 - (L.W / 2) * ppm;
  const top = h / 2 - (totalH / 2) * ppm;
  const g = gammaOf(s.beta);
  const v = s.beta * c;
  const T0 = properTick(L0);
  const T = g * T0;
  const t = s.prog * T;
  const tau = t / g;
  const along = s.orient === 'longitudinal';
  const light = p.accent;
  const small = w < 520;
  const fs = small ? 11 : 12;

  /* ---------------- the S′ window: the clock at rest */
  {
    const y0 = top;
    const ph = L.topH * ppm;
    const cx = left + (L.W * 0.5 - (along ? L0 / 2 : 0)) * ppm; // the base (rear) mirror's x
    const baseY = y0 + ph - (small ? 0.75 : 0.55) * ppm; // the deck
    const sx = (x: number) => cx + x * ppm;
    const sy = (y: number) => baseY - y * ppm;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, y0, L.W * ppm, ph);
    ctx.clip();
    ctx.fillStyle = withAlpha(p.paper2, 0.9);
    ctx.fillRect(left, y0, L.W * ppm, ph);
    drawCart(ctx, p, sx, sy, along ? -0.2 : -CART_HALF, along ? L0 + 0.2 : CART_HALF, ppm);
    drawMirrors(ctx, p, sx, sy, along, along ? L0 : L0, MIRROR_HALF);
    // the pulse in S′: straight between the mirrors, at the moving clock's own reading τ
    const f = clamp(tau / T0, 0, 1);
    if (!along) {
      const y = f <= 0.5 ? 2 * f * L0 : 2 * (1 - f) * L0;
      ctx.save();
      ctx.strokeStyle = withAlpha(light, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx(0.04), sy(0));
      ctx.lineTo(sx(0.04), sy(f <= 0.5 ? y : L0));
      if (f > 0.5) {
        ctx.moveTo(sx(-0.04), sy(L0));
        ctx.lineTo(sx(-0.04), sy(y));
      }
      ctx.stroke();
      ctx.restore();
      pulseDot(ctx, light, sx(0), sy(y));
      mathText(ctx, p, 'L₀', sx(MIRROR_HALF + 0.35), sy(L0 / 2), { size: fs + 1 });
      dimLine(ctx, p, sx(MIRROR_HALF + 0.12), sy(0), sx(MIRROR_HALF + 0.12), sy(L0));
    } else {
      const x = f <= 0.5 ? 2 * f * L0 : 2 * (1 - f) * L0;
      legsPath(ctx, light, sx, sy, [[0, L0]], f <= 0.5 ? x : L0, f > 0.5 ? x : null);
      pulseDot(ctx, light, sx(x), sy(LONG_Y + (f <= 0.5 ? LONG_SPLIT : -LONG_SPLIT)));
      mathText(ctx, p, 'L₀', sx(L0 / 2), sy(LONG_Y + 0.42), { size: fs + 1 });
      dimLine(ctx, p, sx(0), sy(LONG_Y + 0.27), sx(L0), sy(LONG_Y + 0.27));
    }
    // the cart's own clock: τ
    clockFace(ctx, p, sx(along ? -1.25 : -CART_HALF - 0.55), sy(0.35), `τ = ${num(tau / NS)} ns`, p.ink, fs);
    ctx.restore();
    panelTitle(ctx, p, 'S′', 'מערכת הקרון: השעון נח', left + 8, y0 + 13, fs + 1);
    mathText(ctx, p, `T₀ = 2L₀/c = ${num(T0 / NS)} ns`, left + 8, y0 + 32, { align: 'left', size: fs, italic: false, color: p.ink2 });
  }

  /* ---------------- the S window: the cart moves */
  {
    const y0 = top + (L.topH + L.gap) * ppm;
    const ph = L.botH * ppm;
    const ox = left + X_LEFT * ppm; // world x = 0
    const deck = y0 + (L.band + ABOVE_CLOCK + L0) * ppm; // the deck's screen y
    const sx = (x: number) => ox + x * ppm;
    const sy = (y: number) => deck - y * ppm;
    const snap = clockSnapshot(L0, v, t, s.orient);
    const base = snap.base;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, y0, L.W * ppm, ph);
    ctx.clip();
    ctx.fillStyle = withAlpha(p.paper2, 0.5);
    ctx.fillRect(left, y0, L.W * ppm, ph);

    // the track, with a mark every metre (S's ruler)
    const yTrack = -0.5;
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(left, sy(yTrack));
    ctx.lineTo(left + L.W * ppm, sy(yTrack));
    ctx.stroke();
    for (let m = -1; m <= 9; m++) {
      ctx.beginPath();
      ctx.moveTo(sx(m), sy(yTrack));
      ctx.lineTo(sx(m), sy(yTrack - 0.12));
      ctx.stroke();
    }

    // where the cart and the clock were when the pulse left: a faint ghost
    const contract = (x: number) => x / g;
    const cartA = along ? -0.2 : -CART_HALF;
    const cartB = along ? L0 + 0.2 : CART_HALF;
    ctx.save();
    ctx.globalAlpha = 0.28;
    drawCart(ctx, p, (x) => sx(contract(x)), sy, cartA, cartB, ppm / g, ppm);
    drawMirrors(ctx, p, (x) => sx(contract(x)), sy, along, L0, MIRROR_HALF);
    ctx.restore();

    // the whole tick's light path, faint and dashed; the part already run, solid
    if (!along) {
      const full: [number, number][] = [
        [0, 0],
        [(v * T) / 2, L0],
        [v * T, 0],
      ];
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = withAlpha(light, 0.35);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      full.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(sx(x), sy(y)) : ctx.lineTo(sx(x), sy(y))));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = light;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(sx(0), sy(0));
      if (snap.leg === 'back') ctx.lineTo(sx((v * T) / 2), sy(L0));
      ctx.lineTo(sx(snap.pulse[0]), sy(snap.pulse[1]));
      ctx.stroke();
      ctx.restore();
      // the right triangle of the first half tick, once the pulse has reached the far mirror
      if (s.prog >= 0.5 && ((v * T) / 2) * ppm > 70) {
        const xm = (v * T) / 2;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx(0), sy(0));
        ctx.lineTo(sx(xm), sy(0));
        ctx.lineTo(sx(xm), sy(L0));
        ctx.stroke();
        ctx.restore();
        mathText(ctx, p, 'vT/2', sx(xm / 2), sy(-0.2), { size: fs, color: p.ink2 });
        mathText(ctx, p, 'L₀', sx(xm) + 16, sy(L0 / 2), { size: fs, color: p.ink2 });
        const ang = Math.atan2(L0, xm);
        mathText(ctx, p, 'cT/2', sx(xm / 2) - 22 * Math.sin(ang), sy(L0 / 2) - 22 * Math.cos(ang), { size: fs, color: light });
      }
    } else {
      const [t1] = longitudinalLegs(L0, v);
      const xr = c * t1; // the reflection, at the front mirror
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([5, 4]);
      legsPath(ctx, light, sx, sy, [[0, xr]], xr, v * T, 1.4);
      ctx.restore();
      legsPath(ctx, light, sx, sy, [[0, xr]], snap.leg === 'out' ? snap.pulse[0] : xr, snap.leg === 'back' ? snap.pulse[0] : null);
      if (xr * ppm > 110 && !small) {
        mathText(ctx, p, 'L/(c−v)', sx(xr / 2), sy(LONG_Y + LONG_SPLIT + 0.25), { size: fs, color: light });
        mathText(ctx, p, 'L/(c+v)', sx((xr + v * T) / 2), sy(LONG_Y - LONG_SPLIT - 0.27), { size: fs, color: light });
      }
    }

    // the cart and its clock now
    const cx = (x: number) => sx(base + contract(x));
    drawCart(ctx, p, cx, sy, cartA, cartB, ppm / g, ppm);
    drawMirrors(ctx, p, cx, sy, along, L0, MIRROR_HALF);
    pulseDot(ctx, light, sx(snap.pulse[0]), sy(along ? LONG_Y + (snap.leg === 'out' ? LONG_SPLIT : -LONG_SPLIT) : snap.pulse[1]));
    // the cart's velocity
    const vy = along ? LONG_Y + 1.0 : L0 + 0.32;
    if (along) mathText(ctx, p, 'L = L₀/γ', cx(L0 / 2), sy(vy) - 18, { size: fs });
    if (s.beta > 0.005) {
      const ax = cx(along ? L0 / 2 : 0);
      arrow(ctx, ax - 0.6 * s.beta * ppm, sy(vy), ax + 0.6 * s.beta * ppm, sy(vy), { color: p.velocity, width: 2.4, head: 9 });
      mathText(ctx, p, 'v', ax + 0.6 * s.beta * ppm + 10, sy(vy), { color: p.velocity, size: fs + 1 });
    }
    // the moving clock's own reading
    clockFace(ctx, p, cx(along ? L0 / 2 : 0), sy(-0.25), `τ = ${num(tau / NS)} ns`, p.ink, fs);

    // two clocks of S on the track, at the places where the tick starts and ends; synchronised in S, they read t
    // (B drops a line lower when the two faces would touch)
    const faceW = (fs + 1) * 8;
    const crowded = v * T * ppm < faceW + 6;
    for (const [xc, name] of [
      [0, 'A'],
      [v * T, 'B'],
    ] as [number, string][]) {
      if (name === 'B' && s.beta < 0.02) continue;
      const yc = sy(yTrack - 0.55) + (name === 'B' && crowded ? fs + 12 : 0);
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(sx(xc), sy(yTrack));
      ctx.lineTo(sx(xc), yc - 10);
      ctx.stroke();
      ctx.restore();
      clockFace(ctx, p, sx(xc), yc, `${name}: t = ${num(t / NS)} ns`, p.ink2, fs, { bounds: [left, left + L.W * ppm] });
    }
    ctx.restore();
    panelTitle(ctx, p, 'S', 'מערכת הקרקע: הקרון נע', left + 8, y0 + 13, fs + 1);
    if (s.prog >= 1 - 1e-9)
      mathText(ctx, p, `T = γT₀ = ${num(T / NS)} ns`, left + 8, y0 + 32, { align: 'left', size: fs, italic: false, color: p.ink2 });
  }
}

/** The cart: a body below the deck (y < 0) from x = a to b (in the cart's own metres, mapped by `sx`), with wheels. */
function drawCart(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  sx: (x: number) => number,
  sy: (y: number) => number,
  a: number,
  b: number,
  ppmX: number,
  ppmY = ppmX,
) {
  ctx.save();
  ctx.fillStyle = withAlpha(p.equip, 0.14);
  ctx.strokeStyle = p.equip;
  ctx.lineWidth = 1.6;
  const x1 = sx(a);
  const x2 = sx(b);
  ctx.beginPath();
  ctx.rect(x1, sy(0), x2 - x1, 0.32 * ppmY);
  ctx.fill();
  ctx.stroke();
  // wheels: ellipses, contracted along x with the cart
  const r = 0.07 * ppmY;
  for (const f of [0.2, 0.8]) {
    const xw = sx(a + f * (b - a));
    ctx.beginPath();
    ctx.ellipse(xw, sy(-0.32) + r, Math.max(1.5, r * (ppmX / ppmY)), r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** The mirrors: across (a base at y = 0 and a far mirror at y = sep) or along (rear at x = 0, front at x = sep). */
function drawMirrors(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  sx: (x: number) => number,
  sy: (y: number) => number,
  along: boolean,
  sep: number,
  half: number,
) {
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.2;
  if (!along) {
    for (const y of [0, sep]) {
      ctx.beginPath();
      ctx.moveTo(sx(-half), sy(y));
      ctx.lineTo(sx(half), sy(y));
      ctx.stroke();
    }
    // the rods that hold the far mirror
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(p.ink3, 0.8);
    for (const x of [-half, half]) {
      ctx.beginPath();
      ctx.moveTo(sx(x), sy(0));
      ctx.lineTo(sx(x), sy(sep));
      ctx.stroke();
    }
  } else {
    for (const x of [0, sep]) {
      ctx.beginPath();
      ctx.moveTo(sx(x), sy(LONG_Y - 0.3));
      ctx.lineTo(sx(x), sy(LONG_Y + 0.3));
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(p.ink3, 0.8);
    ctx.beginPath();
    ctx.moveTo(sx(0), sy(LONG_Y - 0.3));
    ctx.lineTo(sx(sep), sy(LONG_Y - 0.3));
    ctx.stroke();
    // a post from the deck to the clock's frame
    ctx.beginPath();
    ctx.moveTo(sx(sep / 2), sy(0));
    ctx.lineTo(sx(sep / 2), sy(LONG_Y - 0.3));
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The legs of a clock along the motion, out at y = LONG_Y + split and back at LONG_Y − split: `segs` gives the out
 * leg's span [x0, xr]; the out leg is drawn to `outTo`, and the back leg from xr to `backTo` (null: not yet).
 */
function legsPath(
  ctx: CanvasRenderingContext2D,
  color: string,
  sx: (x: number) => number,
  sy: (y: number) => number,
  segs: [number, number][],
  outTo: number,
  backTo: number | null,
  width = 2.2,
) {
  const [x0, xr] = segs[0];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(sx(x0), sy(LONG_Y + LONG_SPLIT));
  ctx.lineTo(sx(outTo), sy(LONG_Y + LONG_SPLIT));
  if (backTo !== null) {
    ctx.lineTo(sx(xr), sy(LONG_Y - LONG_SPLIT));
    ctx.lineTo(sx(backTo), sy(LONG_Y - LONG_SPLIT));
  }
  ctx.stroke();
  ctx.restore();
}

function pulseDot(ctx: CanvasRenderingContext2D, color: string, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A dimension line with end bars. */
function dimLine(ctx: CanvasRenderingContext2D, p: Palette, x1: number, y1: number, x2: number, y2: number) {
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  const L = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / L) * 4;
  const ny = ((x2 - x1) / L) * 4;
  for (const [x, y] of [
    [x1, y1],
    [x2, y2],
  ]) {
    ctx.moveTo(x - nx, y - ny);
    ctx.lineTo(x + nx, y + ny);
  }
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ muons */

const H = 15e3; // the atmosphere's proper thickness [m]
const N_MUONS = 40;
const LIFETIMES = swarmLifetimes(N_MUONS, MUON_LIFETIME);
/** a fixed shuffle, so the long-lived muons are spread over the swarm */
const ORDER = Array.from({ length: N_MUONS }, (_, i) => (i * 17) % N_MUONS);
const MU_BETA_MIN = 0.9;
const MU_BETA_MAX = 0.999;
const FLIGHT_SECONDS = 6; // a whole fall plays in this many seconds

interface MuonState {
  beta: number;
  prog: number;
  classical: boolean;
  playing: boolean;
}

function muonInitial(p: LightClockProps): MuonState {
  return {
    beta: clamp(p.beta ?? 0.998, MU_BETA_MIN, MU_BETA_MAX),
    prog: clamp(p.prog ?? 0, 0, 1),
    classical: p.classical ?? false,
    playing: false,
  };
}

/** The muons' own clock now [s], and how many of them are still alive. */
function muonNow(s: MuonState) {
  const v = s.beta * c;
  const x = crossing(H, v, MUON_LIFETIME);
  const tEarth = s.prog * x.timeInLayerFrame;
  const own = s.classical ? tEarth : tEarth / x.gamma;
  const alive = LIFETIMES.filter((L) => L > own).length;
  return { v, x, tEarth, own, alive };
}

function Muons(props: LightClockProps) {
  const [s, setS] = useState<MuonState>(() => muonInitial(props));
  const [live, setLive] = useState('');
  const [narrow, setNarrow] = useState(false);
  const ownPlay = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        ownPlay.current = false;
        setS((prev) => {
          const next = { ...prev, playing: false };
          if (typeof st.beta === 'number') next.beta = clamp(st.beta, MU_BETA_MIN, MU_BETA_MAX);
          if (typeof st.prog === 'number') next.prog = clamp(st.prog, 0, 1);
          if (typeof st.classical === 'boolean') next.classical = st.classical;
          return next;
        });
      }),
    [props.id],
  );

  usePlayback(s.playing, 1 / FLIGHT_SECONDS, (dp) => {
    setS((prev) => {
      const prog = prev.prog + dp;
      if (prog < 1) return { ...prev, prog };
      if (ownPlay.current && !prev.classical) done('land');
      ownPlay.current = false;
      return { ...prev, prog: 1, playing: false };
    });
  });

  useEffect(() => {
    const h = setTimeout(() => setLive(muonDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.beta, s.classical]);

  const PW = 9e3;
  const GAPW = 0.5e3;
  const PH = narrow ? 21e3 : 19.5e3;
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintMuons(ctx, view, p, s, PW, GAPW, PH);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 2 * PW + GAPW, worldHeight: PH, animate: false });
  useNarrow(canvasRef, setNarrow);
  useEffect(invalidate, [s, narrow]);

  const reset = () => {
    ownPlay.current = false;
    setS(muonInitial(props));
    setLive('האיור אופס.');
  };

  const m = muonNow(s);
  const survival = s.classical ? m.x.survivalClassical : m.x.survivalLayerFrame;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: מיואונים נופלים דרך האטמוספרה. מימין במערכת של כדור הארץ, משמאל במערכת של המיואונים. ${muonDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={(2 * PW + GAPW) / PH}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="gamma">
            <bdi dir="ltr">
              <i>γ</i> = <b class="q">{num(s.classical ? 1 : m.x.gamma)}</b>
            </bdi>
          </span>
          <span data-readout="tEarth">
            הנפילה ב-<bdi dir="ltr">S</bdi>: <b class="q"><bdi dir="ltr">{num(m.x.timeInLayerFrame / US)} μs</bdi></b>
          </span>
          <span data-readout="life">
            זמן חיים ממוצע ב-<bdi dir="ltr">S</bdi>:{' '}
            <b class="q">
              <bdi dir="ltr">{num((s.classical ? MUON_LIFETIME : m.x.lifetimeInLayerFrame) / US)} μs</bdi>
            </b>
          </span>
          <span data-readout="thick">
            עובי האטמוספרה במערכת המיואון:{' '}
            <b class="q">
              <bdi dir="ltr">{num(s.classical ? H : m.x.thicknessInParticleFrame)} m</bdi>
            </b>
          </span>
          <span data-readout="proper">
            בשעון המיואון: <b class="q"><bdi dir="ltr">{num((s.classical ? m.x.timeInLayerFrame : m.x.properTime) / US)} μs</bdi></b>
          </span>
          <span data-readout="surv">
            החלק שמגיע לקרקע: <b class="q">{num(survival)}</b>
          </span>
          <span data-readout="count">
            עכשיו: <b class="q">{m.alive}</b> מתוך {N_MUONS}
          </span>
        </>
      }
      controls={
        <>
          <Slider
            label="מהירות המיואונים, β = v/c"
            min={MU_BETA_MIN}
            max={MU_BETA_MAX}
            step={0.001}
            value={s.beta}
            format={(v) => `${v.toFixed(3)}c`}
            onChange={(v) => {
              ownPlay.current = false;
              setS((prev) => ({ ...prev, beta: v, playing: false }));
              if (v >= MU_BETA_MAX - 1e-9) done('speed');
            }}
          />
          <div class="group" role="group" aria-label="זמן ותצוגה">
            <Toggle
              label={s.playing ? 'עצירה' : 'נפילה'}
              on={s.playing}
              onChange={(on) => {
                ownPlay.current = on;
                if (on && s.prog >= 1 - 1e-9) setS((prev) => ({ ...prev, prog: 0, playing: true }));
                else setS((prev) => ({ ...prev, playing: on }));
              }}
            />
            <Toggle
              label="בלי יחסות"
              on={s.classical}
              onChange={(on) => {
                ownPlay.current = false;
                setS((prev) => ({ ...prev, classical: on, playing: false }));
                if (on) done('classical');
              }}
            />
          </div>
          <Slider
            label="התקדמות הנפילה"
            min={0}
            max={1}
            step={0.01}
            value={Math.round(s.prog * 100) / 100}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => {
              ownPlay.current = false;
              setS((prev) => ({ ...prev, prog: v, playing: false }));
            }}
          />
        </>
      }
    />
  );
}

function muonDescribe(s: MuonState): string {
  const x = crossing(H, s.beta * c, MUON_LIFETIME);
  if (s.classical)
    return `בלי יחסות: הנפילה נמשכת ${num(x.timeInLayerFrame / US)} מיקרו-שניות, פי ${num(x.timeInLayerFrame / MUON_LIFETIME)} מזמן החיים הממוצע, ורק חלק ${num(x.survivalClassical)} מגיע לקרקע.`;
  return `המיואונים נעים במהירות ${s.beta.toFixed(3)} ממהירות האור. במערכת של כדור הארץ הם נופלים ${num(x.timeInLayerFrame / US)} מיקרו-שניות וחיים בממוצע ${num(x.lifetimeInLayerFrame / US)}; במערכת שלהם האטמוספרה בעובי ${num(x.thicknessInParticleFrame)} מטר. בשתי המערכות מגיע לקרקע חלק ${num(x.survivalLayerFrame)}.`;
}

function paintMuons(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: MuonState, PW: number, GAPW: number, PH: number) {
  const { w, h, ppm } = view;
  const left = w / 2 - ((2 * PW + GAPW) / 2) * ppm;
  const top = h / 2 - (PH / 2) * ppm;
  const m = muonNow(s);
  const g = s.classical ? 1 : m.x.gamma;
  const thick = H / g;
  const small = w < 520;
  const fs = small ? 10.5 : 12;
  const groundBase = 1.2e3; // the Earth panel's ground sits this far above the panel's bottom [m]
  // two panels: the Earth's frame S on the right, the muons' frame on the left
  const panels = [
    { earth: true, x0: left + (PW + GAPW) * ppm },
    { earth: false, x0: left },
  ];
  const yTopMuons = groundBase + H; // the muons' starting height, the same on both panels [world m above the bottom]
  for (const pn of panels) {
    const sx = (x: number) => pn.x0 + x * ppm;
    const sy = (y: number) => top + PH * ppm - y * ppm;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pn.x0, top, PW * ppm, PH * ppm);
    ctx.clip();
    ctx.fillStyle = withAlpha(p.paper2, pn.earth ? 0.5 : 0.9);
    ctx.fillRect(pn.x0, top, PW * ppm, PH * ppm);

    // the ground and the air: fixed in S; in the muons' frame they rise at v, the air H/γ thick
    // (each frame's own contraction factor: 1 in S, where the air rests; γ in the muons' frame)
    const gp = pn.earth ? 1 : g;
    const yGround = pn.earth ? groundBase : yTopMuons - thick + m.v * m.own;
    const yAirTop = yGround + H / gp;
    const air = ctx.createLinearGradient(0, sy(yGround), 0, sy(yAirTop));
    air.addColorStop(0, withAlpha(p.velocity, 0.2));
    air.addColorStop(1, withAlpha(p.velocity, 0.04));
    ctx.fillStyle = air;
    ctx.fillRect(pn.x0, sy(yAirTop), PW * ppm, (yAirTop - yGround) * ppm);
    ctx.fillStyle = withAlpha(p.ink3, 0.35);
    ctx.fillRect(pn.x0, sy(yGround), PW * ppm, Math.max(0, yGround) * ppm + 2);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(pn.x0, sy(yGround));
    ctx.lineTo(pn.x0 + PW * ppm, sy(yGround));
    ctx.stroke();
    // altitude marks every kilometre of the air, at their spacing in this frame
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    for (let k = 0; k <= 15; k++) {
      const y = yGround + (k * 1e3) / gp;
      ctx.beginPath();
      ctx.moveTo(sx(0), sy(y));
      ctx.lineTo(sx(k % 5 === 0 ? 450 : 250), sy(y));
      ctx.stroke();
      if (k % 5 === 0 && gp < 4)
        mathText(ctx, p, `${k} km`, sx(520), sy(y), { align: 'left', size: fs - 1, italic: false, color: p.ink3 });
    }
    // the muons: alive (dots) and decayed (×)
    const yNowEarth = yTopMuons - m.v * m.tEarth;
    for (let j = 0; j < N_MUONS; j++) {
      const i = ORDER[j];
      const col = j % 20;
      const row = Math.floor(j / 20);
      const x = 2.0e3 + col * 0.27e3;
      const dy = (row === 0 ? 1 : -1) * 0.12e3;
      const life = LIFETIMES[i];
      const alive = life > m.own;
      // where it is (alive) or where it decayed (in S it was left behind; in its own frame it stays put)
      const lifeS = s.classical ? life : life * m.x.gamma;
      const y = pn.earth ? (alive ? yNowEarth : yTopMuons - m.v * lifeS) : yTopMuons;
      if (alive) {
        ctx.fillStyle = p.ink;
        ctx.beginPath();
        ctx.arc(sx(x), sy(y + dy), small ? 2.6 : 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const r = small ? 2.2 : 2.8;
        ctx.strokeStyle = withAlpha(p.ink3, 0.75);
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(sx(x) - r, sy(y + dy) - r);
        ctx.lineTo(sx(x) + r, sy(y + dy) + r);
        ctx.moveTo(sx(x) + r, sy(y + dy) - r);
        ctx.lineTo(sx(x) - r, sy(y + dy) + r);
        ctx.stroke();
      }
    }
    // the velocity: the muons fall in S; the Earth rises in the muons' frame
    const vx = sx(8.2e3);
    if (pn.earth) {
      const y = sy(yNowEarth);
      arrow(ctx, vx, y - 4, vx, y + 34, { color: p.velocity, width: 2.4, head: 9 });
      mathText(ctx, p, 'v', vx - 10, y + 22, { color: p.velocity, size: fs + 1 });
    } else {
      const y = sy(yGround);
      arrow(ctx, vx, y + 32, vx, y - 4, { color: p.velocity, width: 2.4, head: 9 });
      mathText(ctx, p, 'v', vx - 10, y + 16, { color: p.velocity, size: fs + 1 });
    }
    // the thickness of the air in this frame
    const bx = sx(1.3e3);
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx, sy(yGround));
    ctx.lineTo(bx, sy(yAirTop));
    ctx.moveTo(bx - 4, sy(yGround));
    ctx.lineTo(bx + 4, sy(yGround));
    ctx.moveTo(bx - 4, sy(yAirTop));
    ctx.lineTo(bx + 4, sy(yAirTop));
    ctx.stroke();
    ctx.restore();
    const label = s.classical || pn.earth ? `H = ${num(H / 1e3)} km` : `H/γ = ${num(thick)} m`;
    // below the ground line, where the muons never pass
    const ly = sy(yGround) + 16;
    mathText(ctx, p, label, bx + 6, ly, { align: 'left', size: fs, color: p.ink2 });
    ctx.restore();

    // titles and clocks
    const tx = pn.x0 + 6;
    if (pn.earth) {
      panelTitle(ctx, p, 'S', 'כדור הארץ', tx, top + 13, fs + 1);
      clockFace(ctx, p, pn.x0 + 6, top + 36, `t = ${num(m.tEarth / US)} μs`, p.ink2, fs, { left: true });
    } else {
      panelTitle(ctx, p, 'S′', 'המיואונים', tx, top + 13, fs + 1);
    }
    clockFace(ctx, p, pn.x0 + 6, top + (pn.earth ? 60 : 36), `Δτ = ${num(m.own / US)} μs`, p.ink, fs, { left: true });
    heText(ctx, p, `${m.alive} מתוך ${N_MUONS}`, pn.x0 + PW * ppm - 6, sy(groundBase * 0.45), { size: fs, color: p.ink, weight: 700 });
  }
}
