/**
 * CoupledModes: two bodies on a frictionless track between two walls, an outer spring on each and a coupling spring
 * between them (lesson 5.5).
 *
 * The top strip is the track: wall, spring k, body 1 (mass m₁ = 1.0 kg), the coupling spring k_c (in dark ink), body 2
 * (mass m₂), spring k, wall; everything of body 2 on the plots (x₂, E₂/E) is in the accent colour; k = 10 N/m on both sides. A dashed tick under each body marks its
 * equilibrium position. Below it three plots share one time axis: x₁(t), x₂(t) and the energy shares E₁/E and E₂/E
 * (E_i = ½m_i v_i² + ½k x_i², each body with its own outer spring; the coupling spring holds the small rest). The
 * part of each curve already travelled is drawn strong, the rest faint; the dashed curves around x₁ and x₂ are the
 * envelopes. Every motion starts at rest, in one of three states:
 *   'mode1'  the lower normal mode (for equal masses the bodies move together, (1, 1));
 *   'mode2'  the higher normal mode (for equal masses opposite, (1, −1));
 *   'one'    body 1 displaced by a = 0.10 m, body 2 at its equilibrium: both modes, hence beats.
 * Physics: src/physics/coupled.ts (normalModes, motion, energies, beats); the curves are the closed-form
 * superposition of the two modes, not a numerical integration.
 *
 * Props (Astro wrapper: <Spread fig="fig-5-5a" figure={CoupledModes} figureProps={{ … }}>)
 *   id      figure id (Spread passes it); tasks are `${id}:${task}`
 *   kc      coupling spring [N/m], 0.2…4 in steps of 0.1 (default 1.0)
 *   m2      mass of body 2 [kg], 0.5…2 in steps of 0.1 (default 1.0)
 *   start   'mode1' | 'mode2' | 'one' (default 'one')
 *   tasks   task ids to show (below)
 *
 * Step `set` keys: kc, m2, start, t (seconds on the clock). A step never starts the clock.
 *
 * Tasks are ticked only inside the learner's own handlers (the play loop the learner started, the time slider), and
 * a state a step produced is never counted (WeakSet of step states; a step also clears what counts as "own"):
 *   mode1     the learner chooses mode 1 and runs it for a full period
 *   mode2     the learner chooses mode 2 and runs it for a full period
 *   transfer  equal masses, start 'one': the learner runs the clock to T_s = π/Δω, when body 2 holds the energy
 *   detune    the learner makes m₂ ≠ m₁, starts 'one' and runs a full beat period 2π/Δω
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { beats, energies, motion, normalModes, type Coupled, type Mode, type State2 } from '~/physics/coupled';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Start = 'mode1' | 'mode2' | 'one';

const TASK_LABEL: Record<string, string> = {
  mode1: 'בחרו "אופן 1" והפעילו לפחות זמן מחזור אחד. האם קפיץ הצימוד משנה את אורכו?',
  mode2: 'בחרו "אופן 2" והפעילו לפחות זמן מחזור אחד. מה עושים הגופים, ובאיזו תדירות?',
  transfer: 'במסות שוות, התחילו מ"רק גוף 1" והריצו את השעון עד שכל האנרגיה בגוף 2.',
  detune: 'שנו את המסה של גוף 2, התחילו מ"רק גוף 1" והריצו פעימה שלמה. האם גוף 1 נעצר?',
};

const START_LABEL: Record<Start, string> = { mode1: 'אופן 1', mode2: 'אופן 2', one: 'רק גוף 1' };

export interface CoupledModesProps {
  id: string;
  kc?: number;
  m2?: number;
  start?: Start;
  tasks?: string[];
}

interface State {
  kc: number;
  m2: number;
  start: Start;
  /** the clock [s] */
  t: number;
  playing: boolean;
  fast: boolean;
}

const M1 = 1.0;
const K = 10;
const A0 = 0.1; // initial displacement scale [m]
const X_EQ: [number, number] = [0.4, 0.8]; // equilibrium positions from the left wall [m]
const TRACK = 1.2; // wall to wall [m]

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const snap = (x: number, step: number) => Math.round(x / step) * step;
const kcOf = (x: unknown, d: number) => Number(clamp(snap(typeof x === 'number' ? x : d, 0.1), 0.2, 4).toFixed(1));
const m2Of = (x: unknown, d: number) => Number(clamp(snap(typeof x === 'number' ? x : d, 0.1), 0.5, 2).toFixed(1));
const startOf = (x: unknown, d: Start): Start => (x === 'mode1' || x === 'mode2' || x === 'one' ? x : d);
/** a readout number: 3 significant figures, a true minus sign, and no "−0" */
const num = (x: number) => (Math.abs(x) < 5e-4 ? '0' : sci(x, 3).replace('-', '−'));

function initial(p: CoupledModesProps): State {
  return { kc: kcOf(p.kc, 1), m2: m2Of(p.m2, 1), start: startOf(p.start, 'one'), t: 0, playing: false, fast: false };
}

/** Everything the drawing and the readout need, for one parameter set. */
function solve(s: State) {
  const sys: Coupled = { m1: M1, m2: s.m2, k1: K, k2: K, kc: s.kc };
  const modes = normalModes(sys);
  const b = beats(sys);
  const s0 = startState(s.start, modes);
  // the coefficients of each mode in x₁ and x₂ (all starts are at rest: x = Σ cₙ aⁿ cos ωₙt)
  const c = coeffs(sys, s0, modes);
  const E = energies(sys, s0).E;
  const window = clamp(1.05 * b.beatPeriod, 12, 60);
  const equal = Math.abs(s.m2 - M1) < 1e-9;
  return { sys, modes, b, s0, c, E, window, equal };
}
type Solved = ReturnType<typeof solve>;

function startState(start: Start, modes: [Mode, Mode]): State2 {
  if (start === 'one') return { x1: A0, x2: 0, v1: 0, v2: 0 };
  const [a1, a2] = modes[start === 'mode1' ? 0 : 1].shape; // the larger component is 1
  return { x1: A0 * a1, x2: A0 * a2, v1: 0, v2: 0 };
}

/** x_i(t) = A_i cos ω₁t + B_i cos ω₂t (from rest). */
function coeffs(sys: Coupled, s0: State2, modes: [Mode, Mode]) {
  // project with M-orthogonality, as coupled.ts does
  const out = modes.map(({ shape: [a1, a2] }) => {
    const n = sys.m1 * a1 * a1 + sys.m2 * a2 * a2;
    return (sys.m1 * a1 * s0.x1 + sys.m2 * a2 * s0.x2) / n;
  });
  return {
    A1: out[0] * modes[0].shape[0],
    B1: out[1] * modes[1].shape[0],
    A2: out[0] * modes[0].shape[1],
    B2: out[1] * modes[1].shape[1],
  };
}

/** The envelope of A cos ω₁t + B cos ω₂t: √(A² + B² + 2AB cos Δωt). */
const envelope = (A: number, B: number, dw: number, t: number) => Math.sqrt(Math.max(0, A * A + B * B + 2 * A * B * Math.cos(dw * t)));

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
  ctx.font = `${o.italic === false ? '' : 'italic '}${o.weight ?? 700} ${o.size ?? 13}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/** "k" with a lowered "c", centred on (x, y). */
function kcLabel(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, color: string) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const big = `italic 700 12px ${p.fontUi}`;
  const small = `italic 700 9px ${p.fontUi}`;
  ctx.font = big;
  const wk = ctx.measureText('k').width;
  ctx.font = small;
  const wc = ctx.measureText('c').width;
  const x0 = x - (wk + wc + 1) / 2;
  const put = (t: string, font: string, xx: number, yy: number) => {
    ctx.font = font;
    ctx.lineWidth = 3;
    ctx.strokeStyle = withAlpha(p.paper, 0.85);
    ctx.strokeText(t, xx, yy);
    ctx.fillStyle = color;
    ctx.fillText(t, xx, yy);
  };
  put('k', big, x0, y);
  put('c', small, x0 + wk + 1, y + 4);
  ctx.restore();
}

/* ================================================================== the component */

export default function CoupledModes(props: CoupledModesProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const touched = useRef(new Set<string>());
  const stepStates = useRef(new WeakSet<State>());
  const sRef = useRef<State>(s);
  sRef.current = s;
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const z = solve(s);

  /** Tick what the learner's own action reached. Called only from the learner's handlers and the play loop they started. */
  const checkTasks = (st: State) => {
    if (stepStates.current.has(st)) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const own = (k: string) => touched.current.has(k);
    if (!own('clock')) return;
    const zz = solve(st);
    if (st.start === 'mode1' && own('start') && st.t >= (2 * Math.PI) / zz.modes[0].omega && has('mode1')) done('mode1');
    if (st.start === 'mode2' && own('start') && st.t >= (2 * Math.PI) / zz.modes[1].omega && has('mode2')) done('mode2');
    if (st.start === 'one' && zz.equal && st.t >= zz.b.transferTime && has('transfer')) done('transfer');
    if (st.start === 'one' && !zz.equal && own('m2') && st.t >= zz.b.beatPeriod && has('detune')) done('detune');
  };

  const change = (patch: Partial<State>) => {
    for (const k of Object.keys(patch)) touched.current.add(k);
    // a new system or a new start restarts the clock
    setS((prev) => ({ ...prev, ...patch, t: 0, playing: false }));
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        touched.current.clear();
        setS((prev) => {
          const next: State = {
            ...prev,
            kc: typeof st.kc === 'number' ? kcOf(st.kc, prev.kc) : prev.kc,
            m2: typeof st.m2 === 'number' ? m2Of(st.m2, prev.m2) : prev.m2,
            start: startOf(st.start, prev.start),
            t: 0,
            playing: false,
          };
          if (typeof st.t === 'number') next.t = clamp(st.t, 0, solve(next).window);
          stepStates.current.add(next);
          return next;
        });
      }),
    [props.id],
  );

  // the clock, frozen in still mode; tasks are checked here because the learner started it
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!motionAllowed() || document.hidden) return;
      const prev = sRef.current;
      if (!prev.playing) return;
      const win = solve(prev).window;
      const t = prev.t + dt * (prev.fast ? 4 : 1);
      const next: State = t >= win ? { ...prev, t: win, playing: false } : { ...prev, t };
      sRef.current = next;
      setS(next);
      checkTasks(next);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s, z)), 700);
    return () => clearTimeout(h);
  }, [s.kc, s.m2, s.start]);

  const [aspect, setAspect] = useState(0.95);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, s, z);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: TRACK, worldHeight: TRACK / aspect, animate: false });
  useEffect(invalidate, [s, aspect]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 520 ? 0.62 : 0.95));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reset = () => {
    touched.current.clear();
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const play = (on: boolean) => {
    touched.current.add('clock');
    setS((prev) => {
      const restart = on && prev.t >= solve(prev).window - 1e-9;
      return { ...prev, playing: on, t: restart ? 0 : prev.t };
    });
  };

  const scrub = (v: number) => {
    touched.current.add('clock');
    const next: State = { ...sRef.current, t: clamp(v, 0, z.window), playing: false };
    sRef.current = next;
    setS(next);
    checkTasks(next);
  };

  const now = motion(z.sys, z.s0, s.t, z.modes);
  const e = energies(z.sys, now);
  const [w1, w2] = z.modes;
  const ratio = (m: Mode) => num(m.shape[1] / m.shape[0]);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: שני גופים על מסילה בין שני קירות, קפיץ חיצוני לכל גוף וקפיץ צימוד ביניהם, ומתחתיהם הגרפים של ההעתקים ושל האנרגיות לאורך הזמן. ${describe(s, z)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="w1">
            אופן 1:{' '}
            <b class="q">
              <i>ω</i>₁ = {num(w1.omega)} rad/s, <i>a</i>₂/<i>a</i>₁ = {ratio(w1)}
            </b>
          </span>
          <span data-readout="w2">
            אופן 2:{' '}
            <b class="q">
              <i>ω</i>₂ = {num(w2.omega)} rad/s, <i>a</i>₂/<i>a</i>₁ = {ratio(w2)}
            </b>
          </span>
          <span data-readout="ts">
            <b class="q">
              Δ<i>ω</i> = {num(z.b.dOmega)} rad/s, π/Δ<i>ω</i> = {num(z.b.transferTime)} s
            </b>
          </span>
          <span data-readout="energy">
            עכשיו:{' '}
            <b class="q">
              <i>E</i>₁/<i>E</i> = {Math.round((100 * e.E1) / e.E)}%, <i>E</i>₂/<i>E</i> = {Math.round((100 * e.E2) / e.E)}%
            </b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מצב ההתחלה">
            {(['mode1', 'mode2', 'one'] as const).map((st) => (
              <Toggle key={st} label={START_LABEL[st]} on={s.start === st} onChange={() => change({ start: st })} />
            ))}
          </div>
          <Slider label="קפיץ הצימוד" min={0.2} max={4} step={0.1} value={s.kc} format={(v) => `k_c = ${num(v)} N/m`} onChange={(v) => change({ kc: kcOf(v, s.kc) })} />
          <Slider label="מסה 2" min={0.5} max={2} step={0.1} value={s.m2} format={(v) => `m₂ = ${num(v)} kg`} onChange={(v) => change({ m2: m2Of(v, s.m2) })} />
          <div class="group" role="group" aria-label="השעון">
            <Toggle label={s.playing ? 'עצירה' : 'הפעלה'} on={s.playing} onChange={play} />
            <Toggle label="מהיר ×4" on={s.fast} onChange={(v) => setS((prev) => ({ ...prev, fast: v }))} />
          </div>
          <Slider label="זמן" min={0} max={Number(z.window.toFixed(2))} step={0.05} value={Math.round(s.t * 20) / 20} format={(v) => `t = ${num(v)} s`} onChange={scrub} />
        </>
      }
    />
  );
}

function describe(s: State, z: Solved): string {
  const [a, b] = z.modes;
  const head = `גוף 1 במסה ${num(M1)} קילוגרם, גוף 2 במסה ${num(s.m2)} קילוגרם, קפיצים חיצוניים של ${K} ניוטון למטר וקפיץ צימוד של ${num(s.kc)} ניוטון למטר. אופן 1 בתדירות זוויתית ${num(a.omega)} ואופן 2 ב-${num(b.omega)} רדיאנים לשנייה.`;
  if (s.start !== 'one') return `${head} התנועה מתחילה ב${START_LABEL[s.start]} בלבד, ונשארת בו: שני הגופים מתנודדים באותה תדירות.`;
  return `${head} רק גוף 1 מוזז בהתחלה, ולכן התנועה היא סכום של שני האופנים, עם פעימות. ${z.equal ? `כל האנרגיה עוברת לגוף 2 אחרי ${num(z.b.transferTime)} שניות.` : 'המסות שונות, וההעברה לא מלאה.'}`;
}

/* ================================================================== painting */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function layout(view: View) {
  const { w, h } = view;
  const trackH = Math.max(96, Math.min(150, 0.26 * h));
  const axisH = 26;
  const gap = 8;
  const plotH = (h - trackH - axisH - 3 * gap) / 3;
  const left = 34;
  const right = 12;
  const plot = (k: number): Rect => ({ x: left, y: trackH + gap + k * (plotH + gap), w: w - left - right, h: plotH });
  return { w, h, track: { x: 0, y: 0, w, h: trackH } as Rect, x1: plot(0), x2: plot(1), en: plot(2) };
}

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, z: Solved) {
  const L = layout(view);
  const now = motion(z.sys, z.s0, s.t, z.modes);
  paintTrack(ctx, p, L.track, s, now);
  const amp = Math.max(Math.abs(z.c.A1) + Math.abs(z.c.B1), Math.abs(z.c.A2) + Math.abs(z.c.B2), 1e-6);
  paintTrace(ctx, p, L.x1, s, z, 1, amp);
  paintTrace(ctx, p, L.x2, s, z, 2, amp);
  paintEnergy(ctx, p, L.en, s, z);
  // the time axis under the last plot
  const px = (t: number) => L.en.x + (t / z.window) * L.en.w;
  const step = [1, 2, 5, 10, 20].find((st) => (st / z.window) * L.en.w >= 34) ?? 20;
  ctx.save();
  ctx.fillStyle = p.ink3;
  ctx.font = `500 10px ${p.fontUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.direction = 'ltr';
  for (let t = 0; t <= z.window + 1e-9; t += step) ctx.fillText(String(t), px(t), L.en.y + L.en.h + 4);
  ctx.restore();
  mathText(ctx, p, 't (s)', 17, L.en.y + L.en.h + 10, { size: 11, color: p.ink2 });
}

function zigzag(ctx: CanvasRenderingContext2D, xa: number, xb: number, y: number, amp: number, color: string, width: number) {
  const n = 9;
  const lead = Math.min(8, Math.abs(xb - xa) * 0.12);
  const dir = xb > xa ? 1 : -1;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(xa, y);
  const x0 = xa + dir * lead;
  const x1 = xb - dir * lead;
  ctx.lineTo(x0, y);
  for (let i = 1; i <= 2 * n; i++) {
    const x = x0 + ((x1 - x0) * i) / (2 * n + 1);
    ctx.lineTo(x, y + (i % 2 ? -amp : amp));
  }
  ctx.lineTo(x1, y);
  ctx.lineTo(xb, y);
  ctx.stroke();
  ctx.restore();
}

function paintTrack(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, s: State, now: State2) {
  const margin = 14;
  const ppm = (r.w - 2 * margin) / TRACK;
  const sx = (x: number) => margin + x * ppm;
  const floorY = r.y + r.h * 0.74;
  const blockH = Math.min(r.h * 0.34, 42);
  const springY = floorY - blockH / 2;
  ctx.save();
  // floor and walls
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sx(0), floorY);
  ctx.lineTo(sx(TRACK), floorY);
  ctx.stroke();
  for (const xw of [0, TRACK]) {
    ctx.fillStyle = withAlpha(p.ink3, 0.35);
    const wx = sx(xw) + (xw === 0 ? -8 : 0);
    ctx.fillRect(wx, floorY - blockH * 1.6, 8, blockH * 1.6);
    ctx.strokeRect(wx, floorY - blockH * 1.6, 8, blockH * 1.6);
  }
  ctx.restore();
  // block widths grow with the mass
  const half = (m: number) => 0.045 * Math.sqrt(m) * ppm;
  const h1 = half(M1);
  const h2 = half(s.m2);
  const c1 = sx(X_EQ[0] + now.x1);
  const c2 = sx(X_EQ[1] + now.x2);
  // equilibrium ticks
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  for (const xe of X_EQ) {
    ctx.beginPath();
    ctx.moveTo(sx(xe), floorY + 2);
    ctx.lineTo(sx(xe), floorY + 12);
    ctx.stroke();
  }
  ctx.restore();
  const zz = Math.max(4, blockH * 0.17);
  zigzag(ctx, sx(0), c1 - h1, springY, zz, p.equip, 1.6);
  zigzag(ctx, c1 + h1, c2 - h2, springY, zz, p.ink2, 2.2);
  zigzag(ctx, c2 + h2, sx(TRACK), springY, zz, p.equip, 1.6);
  for (const [c, hw, name] of [
    [c1, h1, 'm₁'],
    [c2, h2, 'm₂'],
  ] as [number, number, string][]) {
    ctx.save();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = p.ink;
    ctx.fillStyle = withAlpha(p.equip, 0.25);
    ctx.beginPath();
    ctx.roundRect(c - hw, floorY - blockH, 2 * hw, blockH, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    mathText(ctx, p, name, c, floorY - blockH / 2, { size: 12 });
  }
  // spring labels above the springs
  mathText(ctx, p, 'k', (sx(0) + c1 - h1) / 2, springY - zz - 10, { size: 12, color: p.ink2 });
  kcLabel(ctx, p, (c1 + h1 + c2 - h2) / 2, springY - zz - 10, p.ink);
  mathText(ctx, p, 'k', (c2 + h2 + sx(TRACK)) / 2, springY - zz - 10, { size: 12, color: p.ink2 });
  // +x arrow, bottom left
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.fillStyle = p.ink2;
  ctx.lineWidth = 1.2;
  const ay = floorY + 18;
  ctx.beginPath();
  ctx.moveTo(sx(0) + 4, ay);
  ctx.lineTo(sx(0) + 34, ay);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx(0) + 38, ay);
  ctx.lineTo(sx(0) + 31, ay - 4);
  ctx.lineTo(sx(0) + 31, ay + 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  mathText(ctx, p, '+x', sx(0) + 52, ay, { size: 11, color: p.ink2 });
  mathText(ctx, p, `t = ${num(s.t)} s`, r.w / 2, r.y + 14, { size: 12, italic: false, color: p.ink2 });
}

function frame(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, zeroLine: number | null) {
  ctx.save();
  ctx.fillStyle = withAlpha(p.paper2, 0.5);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  if (zeroLine !== null) {
    ctx.strokeStyle = p.ink3;
    ctx.beginPath();
    ctx.moveTo(r.x, zeroLine);
    ctx.lineTo(r.x + r.w, zeroLine);
    ctx.stroke();
  }
  ctx.restore();
}

/** One curve sampled over [0, window]: strong up to the clock, faint after it. */
function curve(ctx: CanvasRenderingContext2D, r: Rect, win: number, tNow: number, f: (t: number) => number, py: (v: number) => number, color: string, o: { dash?: number[]; width?: number; faintAfter?: boolean } = {}) {
  const n = Math.max(200, Math.round(r.w * 3));
  const px = (t: number) => r.x + (t / win) * r.w;
  const pass = (from: number, to: number, alpha: number) => {
    if (to <= from) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.strokeStyle = withAlpha(color, alpha);
    ctx.lineWidth = o.width ?? 1.6;
    ctx.lineJoin = 'round';
    ctx.setLineDash(o.dash ?? []);
    ctx.beginPath();
    const i0 = Math.floor((from / win) * n);
    const i1 = Math.ceil((to / win) * n);
    for (let i = i0; i <= i1; i++) {
      const t = clamp((i / n) * win, from, to);
      const x = px(t);
      const y = py(f(t));
      if (i === i0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  };
  if (o.faintAfter === false) {
    pass(0, win, 1);
    return;
  }
  pass(0, tNow, 1);
  pass(tNow, win, 0.28);
}

function paintTrace(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, s: State, z: Solved, body: 1 | 2, amp: number) {
  const mid = r.y + r.h / 2;
  const py = (v: number) => mid - (v / amp) * (r.h / 2 - 4);
  frame(ctx, p, r, mid);
  const A = body === 1 ? z.c.A1 : z.c.A2;
  const B = body === 1 ? z.c.B1 : z.c.B2;
  const color = body === 1 ? p.ink : p.accent;
  // envelopes (only when both modes are present)
  if (Math.abs(A) > 1e-9 && Math.abs(B) > 1e-9) {
    const env = (t: number) => envelope(A, B, z.b.dOmega, t);
    curve(ctx, r, z.window, s.t, env, py, withAlpha(color, 0.75), { dash: [4, 4], width: 1.1, faintAfter: false });
    curve(ctx, r, z.window, s.t, (t) => -env(t), py, withAlpha(color, 0.75), { dash: [4, 4], width: 1.1, faintAfter: false });
  }
  const [w1, w2] = [z.modes[0].omega, z.modes[1].omega];
  const f = (t: number) => A * Math.cos(w1 * t) + B * Math.cos(w2 * t);
  curve(ctx, r, z.window, s.t, f, py, color, { width: 1.6 });
  // the clock
  const x = r.x + (s.t / z.window) * r.w;
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink2, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, r.y);
  ctx.lineTo(x, r.y + r.h);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, py(f(s.t)), 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  mathText(ctx, p, body === 1 ? 'x₁' : 'x₂', 15, mid, { size: 13, color });
}

function paintEnergy(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, s: State, z: Solved) {
  frame(ctx, p, r, null);
  const py = (v: number) => r.y + r.h - 3 - v * (r.h - 8);
  // a faint line at one half
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink3, 0.5);
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(r.x, py(0.5));
  ctx.lineTo(r.x + r.w, py(0.5));
  ctx.stroke();
  ctx.restore();
  const share = (t: number) => {
    const e = energies(z.sys, motion(z.sys, z.s0, t, z.modes));
    return [e.E1 / z.E, e.E2 / z.E];
  };
  curve(ctx, r, z.window, s.t, (t) => share(t)[0], py, p.energyK, { width: 1.8 });
  curve(ctx, r, z.window, s.t, (t) => share(t)[1], py, p.accent, { width: 1.8, dash: [6, 3] });
  const x = r.x + (s.t / z.window) * r.w;
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink2, 0.6);
  ctx.beginPath();
  ctx.moveTo(x, r.y);
  ctx.lineTo(x, r.y + r.h);
  ctx.stroke();
  ctx.restore();
  // transfer time marker (equal masses, start 'one')
  if (s.start === 'one' && z.equal && z.b.transferTime <= z.window) {
    const xt = r.x + (z.b.transferTime / z.window) * r.w;
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink2, 0.8);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xt, r.y);
    ctx.lineTo(xt, r.y + r.h);
    ctx.stroke();
    ctx.restore();
    mathText(ctx, p, 'π/Δω', clamp(xt, r.x + 22, r.x + r.w - 22), r.y + 9, { size: 11, color: p.ink2 });
  }
  mathText(ctx, p, 'E', 15, r.y + r.h / 2, { size: 13, color: p.ink2 });
  // legend, top-right inside the plot
  const lx = r.x + r.w - 8;
  const ly = r.y + 10;
  mathText(ctx, p, 'E₂/E', lx, ly, { align: 'right', size: 11, color: p.accent });
  ctx.save();
  ctx.font = `italic 700 11px ${p.fontUi}`;
  const w2 = ctx.measureText('E₂/E').width;
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = p.accent;
  ctx.setLineDash([6, 3]);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(lx - w2 - 22, ly);
  ctx.lineTo(lx - w2 - 4, ly);
  ctx.stroke();
  ctx.restore();
  const lx1 = lx - w2 - 30;
  mathText(ctx, p, 'E₁/E', lx1, ly, { align: 'right', size: 11, color: p.energyK });
  ctx.save();
  ctx.font = `italic 700 11px ${p.fontUi}`;
  const w1 = ctx.measureText('E₁/E').width;
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = p.energyK;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(lx1 - w1 - 22, ly);
  ctx.lineTo(lx1 - w1 - 4, ly);
  ctx.stroke();
  ctx.restore();
}
