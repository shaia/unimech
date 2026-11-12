/**
 * LightningTrain: Einstein's train and the two lightning strikes, told in the platform frame and in the train frame
 * (lesson 9.1).
 *
 * Two lightning bolts strike the two ends of a moving train. They are simultaneous in the platform frame S: an
 * observer standing on the platform midway between the scorch marks they leave on the track receives both flashes
 * together. A passenger sits at the middle of the train. Light moves at c in each frame (the second postulate), so
 * each panel draws the flashes spreading at c from the place and time of each strike *in that frame*. The figure
 * places every event with the Lorentz transformation (relativity.ts, c = 1); the lesson does not use the formula yet,
 * only the order of the events: in S the strikes are simultaneous and the front flash reaches the passenger first
 * (she moves toward it); in the train frame S′ she sits at rest at the middle, both flashes cross half the train at
 * c, and the front strike happened first.
 *
 * Lengths are in units of the train's length in its own rest frame, times in units of that length over c. The train
 * is drawn shorter in S than in S′, and the track marks closer together in S′ than in S: lesson 9.2 explains why
 * (length contraction); here only the order of events matters.
 *
 * Props (Astro wrapper: <Spread fig="fig-9-1b" figure={LightningTrain} figureProps={{ beta: 0.4, tasks: [...] }}>)
 *   id      figure id; tasks are stored as `${id}:${task}`
 *   beta    the train's speed as a fraction of c, snapped to 0, 0.2, 0.4, 0.6, 0.8 (default 0.4)
 *   frame   'platform' | 'train' (default 'platform')
 *   tasks   task ids to show (below)
 *
 * Step `set` keys: beta, frame, prog (0…1 of the frame's time window), at ('start' | 'front' | 'rear' | 'F' | 'R' |
 *   'O' | 'end': just after that event in the shown frame), playing.
 *
 * Tasks, ticked only inside the learner's own handlers (a step never ticks one):
 *   platform-play  in the platform frame, with the train moving, the learner plays or drags the time past the moment
 *                  the rear flash reaches the passenger
 *   train-play     the same in the train frame
 *   at-rest        the learner stops the train (speed 0): both frames agree that the strikes were simultaneous
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { gammaOf, lorentz, type Event } from '~/physics/relativity';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Frame = 'platform' | 'train';
type Key = 'rear' | 'front' | 'F' | 'R' | 'O';

const TASK_LABEL: Record<string, string> = {
  'platform-play': 'במערכת הרציף, כשהרכבת נוסעת: הפעילו (או גררו את הזמן) עד ששני ההבזקים מגיעים לנוסעת. איזה הבזק מגיע אליה ראשון?',
  'train-play': 'עברו למערכת הרכבת והפעילו שוב. איזה ברק פוגע ראשון במערכת הזו?',
  'at-rest': 'עצרו את הרכבת (מהירות 0). האם שתי המערכות מסכימות עכשיו על הסדר?',
};

const STOPS = [0, 0.2, 0.4, 0.6, 0.8];
const PLAY_RATE = 0.45; // units of (train length)/c per wall-clock second
const PAD = 0.15;
const WORLD_W = 1.8;

export interface LightningTrainProps {
  id: string;
  beta?: number;
  frame?: Frame;
  tasks?: string[];
}

interface LTState {
  beta: number;
  frame: Frame;
  T: number; // time in the shown frame
  playing: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const snap = (b: number) => STOPS.reduce((best, x) => (Math.abs(x - b) < Math.abs(best - b) ? x : best), STOPS[0]);

/** The five events in S (c = 1, the train's rest length 1): the two strikes, the two flashes reaching the
 * passenger (F front, R rear), and both flashes reaching the platform observer (O). */
function eventsS(b: number): Record<Key, Event> {
  const L = 1 / gammaOf(b); // the train's length in S
  return {
    rear: { t: 0, x: -L / 2 },
    front: { t: 0, x: L / 2 },
    F: { t: L / (2 * (1 + b)), x: (b * L) / (2 * (1 + b)) },
    R: { t: L / (2 * (1 - b)), x: (b * L) / (2 * (1 - b)) },
    O: { t: L / 2, x: 0 },
  };
}

/** The same events in the shown frame. */
function eventsIn(b: number, frame: Frame): Record<Key, Event> {
  const e = eventsS(b);
  if (frame === 'platform') return e;
  const out = {} as Record<Key, Event>;
  for (const k of Object.keys(e) as Key[]) out[k] = lorentz(e[k], b, 1);
  return out;
}

function windowOf(b: number, frame: Frame) {
  const e = eventsIn(b, frame);
  const ts = Object.values(e).map((x) => x.t);
  return { t0: Math.min(...ts) - PAD, t1: Math.max(...ts) + PAD, e };
}

/** Position in the shown frame of a point fixed on the train (offset d from its middle, in its rest frame) or on the
 * platform (at X in S). */
function trainX(d: number, b: number, frame: Frame, T: number) {
  return frame === 'platform' ? b * T + d / gammaOf(b) : d;
}
function platformX(X: number, b: number, frame: Frame, T: number) {
  return frame === 'platform' ? X : X / gammaOf(b) - b * T;
}

function initial(p: LightningTrainProps): LTState {
  const beta = snap(p.beta ?? 0.4);
  const frame = p.frame ?? 'platform';
  return { beta, frame, T: windowOf(beta, frame).t0, playing: false };
}

/* ------------------------------------------------------------------ text */

function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; weight?: number; align?: CanvasTextAlign } = {}) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = o.align ?? 'center';
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

function latin(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; align?: CanvasTextAlign } = {}) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 700 ${o.size ?? 13}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/* ------------------------------------------------------------------ component */

const aspectFor = (w: number) => (w < 520 ? 1.05 : 1.9);

export default function LightningTrain(props: LightningTrainProps) {
  const [s, setS] = useState<LTState>(() => initial(props));
  const [live, setLive] = useState('');
  const sRef = useRef(s);
  sRef.current = s;
  const learnerPlay = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };
  /** judge the "played past R" tasks for a state the learner produced */
  const judgePlayed = (st: LTState) => {
    if (st.beta === 0) return;
    const { e } = windowOf(st.beta, st.frame);
    if (st.T >= e.R.t) done(st.frame === 'platform' ? 'platform-play' : 'train-play');
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        learnerPlay.current = false;
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.beta === 'number') next.beta = snap(st.beta);
          if (st.frame === 'platform' || st.frame === 'train') next.frame = st.frame;
          const win = windowOf(next.beta, next.frame);
          if (typeof st.prog === 'number') next.T = win.t0 + clamp(st.prog, 0, 1) * (win.t1 - win.t0);
          if (typeof st.at === 'string') {
            const at = st.at;
            if (at === 'start') next.T = win.t0;
            else if (at === 'end') next.T = win.t1;
            else if (at in win.e) next.T = win.e[at as Key].t + 0.02;
          }
          next.T = clamp(next.T, win.t0, win.t1);
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
      const dt = Math.min(0.05, (now - last) / 1000) * PLAY_RATE;
      last = now;
      if (!motionAllowed() || document.hidden) return;
      const prev = sRef.current;
      const { t1 } = windowOf(prev.beta, prev.frame);
      const T = prev.T + dt;
      if (T >= t1) {
        const next = { ...prev, T: t1, playing: false };
        if (learnerPlay.current) judgePlayed(next);
        learnerPlay.current = false;
        setS(next);
      } else {
        const next = { ...prev, T };
        if (learnerPlay.current) judgePlayed(next);
        setS(next);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s)), 700);
    return () => clearTimeout(h);
  }, [s.beta, s.frame]);

  const [aspect, setAspect] = useState(1.9);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_W / aspect, animate: false });
  useEffect(invalidate, [s, aspect]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(aspectFor(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reset = () => {
    learnerPlay.current = false;
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const win = windowOf(s.beta, s.frame);
  const order = strikeOrder(s);

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: רכבת, שני ברקים בקצותיה, נוסעת באמצע וצופה על הרציף. ${describe(s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="frame">
            <b>{s.frame === 'platform' ? 'מערכת הרציף' : 'מערכת הרכבת'}</b>
          </span>
          <span data-readout="order">
            הברקים: <b>{order}</b>
          </span>
          <span data-readout="arrive">
            אצל הנוסעת: <b>{s.beta === 0 ? 'שני ההבזקים מגיעים יחד' : 'ההבזק הקדמי מגיע ראשון'}</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מערכת ייחוס">
            <span class="hint">מערכת:</span>
            <Toggle
              label="הרציף"
              on={s.frame === 'platform'}
              onChange={() => {
                learnerPlay.current = false;
                setS({ ...sRef.current, frame: 'platform', T: windowOf(sRef.current.beta, 'platform').t0, playing: false });
              }}
            />
            <Toggle
              label="הרכבת"
              on={s.frame === 'train'}
              onChange={() => {
                learnerPlay.current = false;
                setS({ ...sRef.current, frame: 'train', T: windowOf(sRef.current.beta, 'train').t0, playing: false });
              }}
            />
          </div>
          <Slider
            label="מהירות הרכבת"
            min={0}
            max={0.8}
            step={0.2}
            value={s.beta}
            format={(b) => `${Number(b.toFixed(1))}c`}
            onChange={(b) => {
              const beta = snap(b);
              learnerPlay.current = false;
              if (beta === 0) done('at-rest');
              setS({ ...sRef.current, beta, T: windowOf(beta, sRef.current.frame).t0, playing: false });
            }}
          />
          <div class="group" role="group" aria-label="זמן">
            <Toggle
              label={s.playing ? 'עצירה' : 'הפעלה'}
              on={s.playing}
              onChange={(on) => {
                learnerPlay.current = on;
                const cur = sRef.current;
                if (on && cur.T >= win.t1 - 1e-9) setS({ ...cur, T: win.t0, playing: true });
                else setS({ ...cur, playing: on });
              }}
            />
          </div>
          <Slider
            label="זמן במערכת הזו"
            min={0}
            max={1}
            step={0.01}
            value={Math.round(((s.T - win.t0) / (win.t1 - win.t0)) * 100) / 100}
            format={(x) => `${Math.round(x * 100)}%`}
            onChange={(x) => {
              learnerPlay.current = false;
              const next = { ...sRef.current, T: win.t0 + x * (win.t1 - win.t0), playing: false };
              judgePlayed(next);
              setS(next);
            }}
          />
        </>
      }
    />
  );
}

function strikeOrder(s: LTState): string {
  const { e } = windowOf(s.beta, s.frame);
  const d = e.front.t - e.rear.t;
  if (Math.abs(d) < 1e-9) return 'פגעו בו-זמנית';
  return d < 0 ? 'הקדמי פגע קודם' : 'האחורי פגע קודם';
}

function describe(s: LTState): string {
  const frame = s.frame === 'platform' ? 'במערכת הרציף' : 'במערכת הרכבת';
  const speed = s.beta === 0 ? 'הרכבת עומדת.' : `הרכבת נוסעת ימינה במהירות ${s.beta} ממהירות האור ביחס לרציף.`;
  const arrive = s.beta === 0 ? 'שני ההבזקים מגיעים לנוסעת יחד.' : 'ההבזק מהקצה הקדמי מגיע לנוסעת לפני ההבזק מהקצה האחורי.';
  return `${speed} ${frame} הברקים ${strikeOrder(s)}. ${arrive}`;
}

/* ------------------------------------------------------------------ drawing */

function bolt(ctx: CanvasRenderingContext2D, x: number, yTop: number, yBot: number, color: string) {
  const n = 5;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 4, yTop);
  for (let i = 1; i <= n; i++) {
    const y = yTop + ((yBot - yTop) * i) / n;
    ctx.lineTo(x + (i % 2 === 0 ? -5 : 5), y);
  }
  ctx.stroke();
  ctx.restore();
}

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: LTState) {
  const { w, h, ppm } = view;
  const b = s.beta;
  const win = windowOf(b, s.frame);
  const e = win.e;
  const T = s.T;
  const g = gammaOf(b);

  // camera: centre the span the scene covers during the window
  let lo: number;
  let hi: number;
  if (s.frame === 'platform') {
    lo = -0.5 / g - 0.05;
    hi = b * win.t1 + 0.5 / g + 0.05;
  } else {
    lo = Math.min(-0.55, -0.5 / (g * g) - b * win.t1 - 0.05);
    hi = 0.55;
  }
  const xc = (lo + hi) / 2;
  const sx = (x: number) => w / 2 + (x - xc) * ppm;

  const yTop = 0.2 * h;
  const yTrainTop = 0.3 * h;
  const yTrainBot = 0.42 * h;
  const yTrack = 0.46 * h;
  const yObs = 0.56 * h;
  const yAxis = 0.8 * h;

  // track and platform
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, yTrack);
  ctx.lineTo(w, yTrack);
  ctx.stroke();
  // sleepers every 0.1 (platform rest length): they slide in the train frame
  ctx.lineWidth = 1;
  for (let X = -3; X <= 3; X += 0.1) {
    const x = sx(platformX(X, b, s.frame, T));
    if (x < -2 || x > w + 2) continue;
    ctx.beginPath();
    ctx.moveTo(x, yTrack);
    ctx.lineTo(x, yTrack + 5);
    ctx.stroke();
  }
  ctx.fillStyle = withAlpha(p.paper2, 0.8);
  ctx.fillRect(0, yTrack + 8, w, 0.12 * h);
  ctx.restore();

  // the train
  const xr = sx(trainX(-0.5, b, s.frame, T));
  const xf = sx(trainX(0.5, b, s.frame, T));
  ctx.save();
  ctx.fillStyle = withAlpha(p.equip, 0.18);
  ctx.strokeStyle = p.equip;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(xr, yTrainTop, xf - xr, yTrainBot - yTrainTop, 5);
  ctx.fill();
  ctx.stroke();
  // the nose points the way the train moves (+x)
  ctx.beginPath();
  ctx.moveTo(xf, yTrainTop + 4);
  ctx.lineTo(xf + 8, (yTrainTop + yTrainBot) / 2);
  ctx.lineTo(xf, yTrainBot - 4);
  ctx.stroke();
  ctx.restore();

  // scorch marks after each strike, on the train ends and on the track
  for (const k of ['rear', 'front'] as const) {
    if (T < e[k].t) continue;
    const d = k === 'rear' ? -0.5 : 0.5;
    const Xs = (k === 'rear' ? -0.5 : 0.5) / g; // the mark's place on the track, in S
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(sx(trainX(d, b, s.frame, T)), yTrainBot - 4, 3.5, 0, Math.PI * 2);
    ctx.arc(sx(platformX(Xs, b, s.frame, T)), yTrack, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // the flashes: fronts spreading at c from each strike's place and time in this frame
  for (const k of ['rear', 'front'] as const) {
    const ev = e[k];
    if (T < ev.t) continue;
    const r = T - ev.t;
    if (r < 0.05) bolt(ctx, sx(ev.x), yTop, yTrainTop, p.accent);
    for (const dir of [-1, 1]) {
      const x = sx(ev.x + dir * r);
      if (x < -4 || x > w + 4) continue;
      const inward = (k === 'rear' && dir > 0) || (k === 'front' && dir < 0);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.accent, inward ? 0.95 : 0.35);
      ctx.lineWidth = inward ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(x, yTrainTop - 6);
      ctx.lineTo(x, yObs + 8);
      ctx.stroke();
      ctx.restore();
    }
    // the place of the strike in this frame: a faint vertical tick
    ctx.save();
    ctx.strokeStyle = withAlpha(p.accent, 0.4);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sx(ev.x), yTop);
    ctx.lineTo(sx(ev.x), yTrack);
    ctx.stroke();
    ctx.restore();
  }

  // the passenger (middle of the train) and the platform observer (midway between the track marks)
  const xp = sx(trainX(0, b, s.frame, T));
  const xo = sx(platformX(0, b, s.frame, T));
  const gotF = T >= e.F.t;
  const gotR = T >= e.R.t;
  const gotO = T >= e.O.t;
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(xp, (yTrainTop + yTrainBot) / 2, 6, 0, Math.PI * 2);
  ctx.arc(xo, yObs, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // a ring for each flash received
  const ring = (x: number, y: number, r: number) => {
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };
  if (gotF) ring(xp, (yTrainTop + yTrainBot) / 2, 10);
  if (gotR) ring(xp, (yTrainTop + yTrainBot) / 2, 14);
  if (gotO) ring(xo, yObs, 10);
  heText(ctx, p, 'נוסעת', xp, yTrainTop - 12, { color: p.ink, size: 12 });
  heText(ctx, p, 'צופה', xo, yObs + 16, { color: p.ink, size: 12 });

  // the timeline of this frame: strikes above the axis, arrivals at the passenger below
  const ax0 = 24;
  const ax1 = w - 24;
  const tx = (t: number) => ax0 + ((t - win.t0) / (win.t1 - win.t0)) * (ax1 - ax0);
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(ax0, yAxis);
  ctx.lineTo(ax1, yAxis);
  ctx.stroke();
  ctx.restore();
  const sameT = Math.abs(e.front.t - e.rear.t) < 1e-9;
  for (const k of ['rear', 'front'] as const) {
    const x = tx(e[k].t);
    bolt(ctx, x, yAxis - 22, yAxis - 2, p.accent);
    if (sameT) {
      if (k === 'front') heText(ctx, p, 'שני הברקים', x, yAxis - 32, { size: 11 });
    } else heText(ctx, p, k === 'front' ? 'קדמי' : 'אחורי', x, yAxis - 32, { size: 11 });
  }
  for (const k of ['F', 'R'] as const) {
    const x = tx(e[k].t);
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, yAxis + 10, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (Math.abs(e.F.t - e.R.t) < 1e-9) heText(ctx, p, 'שניהם אצל הנוסעת', tx(e.F.t), yAxis + 26, { size: 11 });
  else {
    heText(ctx, p, 'קדמי אצלה', tx(e.F.t), yAxis + 26, { size: 11 });
    heText(ctx, p, 'אחורי אצלה', tx(e.R.t), yAxis + 26, { size: 11 });
  }
  // now
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx(T), yAxis - 8);
  ctx.lineTo(tx(T), yAxis + 8);
  ctx.stroke();
  ctx.restore();
  latin(ctx, p, s.frame === 'platform' ? 't' : 't′', ax1 + 10, yAxis, { size: 13 });

  // title, left of the reset and fullscreen buttons
  const right = w - 90;
  const tw = heText(ctx, p, s.frame === 'platform' ? 'מערכת הרציף' : 'מערכת הרכבת', right, 14, { size: 13, weight: 700, color: p.ink, align: 'right' });
  latin(ctx, p, s.frame === 'platform' ? 'S' : 'S′', right - tw - 10, 14, { size: 14, align: 'right' });
  // the frame's motion arrow: in S the train moves right, in S′ the platform moves left
  if (b > 0) {
    const y = 0.12 * h + 14;
    const x0 = 14;
    const len = 26 + 40 * b;
    ctx.save();
    ctx.strokeStyle = p.velocity;
    ctx.fillStyle = p.velocity;
    ctx.lineWidth = 2.4;
    const dir = s.frame === 'platform' ? 1 : -1;
    const xa = dir > 0 ? x0 : x0 + len;
    const xb = dir > 0 ? x0 + len : x0;
    ctx.beginPath();
    ctx.moveTo(xa, y);
    ctx.lineTo(xb, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xb, y);
    ctx.lineTo(xb - dir * 9, y - 5);
    ctx.lineTo(xb - dir * 9, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    heText(ctx, p, s.frame === 'platform' ? 'הרכבת' : 'הרציף', x0 + len + 8, y, { size: 11, align: 'left' });
  }

}
