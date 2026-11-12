/**
 * MichelsonMorley: the 1887 interferometer seen from above, in the ether model (lesson 9.1).
 *
 * The lab moves through the ether, so in the lab an "ether wind" of speed v blows past (drawn to the right, +x). A
 * pulse of light leaves the beam splitter along each arm, reflects from the mirror at the arm's end and comes back.
 * In the ether model light moves at c relative to the ether, and velocities add as in Galileo: along the wind the
 * pulse goes downstream at c + v and back upstream at c − v; across the wind it must be aimed a little upstream
 * (by arcsin β) to stay on the arm, and moves along it at √(c² − v²). At each pulse three arrows form the
 * triangle c n̂ + w = u û: the light's velocity relative to the ether (dashed, length c), the wind (dashed) and
 * the light's velocity in the lab (solid). The arms are drawn equal; the apparatus can be turned (the arms swap
 * roles at 90°). The inset compares the fringe pattern predicted for the real apparatus (11 m arms, 550 nm light)
 * after the turn with the one observed: no shift.
 *
 * Physics: src/physics/ether.ts (legSpeed, aimAngle, armRoundTrip, pulseOnArm, fringeShiftBetween). Drawn with
 * c = 1 and the arm length 1, time in units of 2L/c. Canvas world coordinates are y-up.
 *
 * Props (Astro wrapper: <Spread fig="fig-9-1a" figure={MichelsonMorley} figureProps={{ beta: 0, tasks: [...] }}>)
 *   id      figure id (Spread passes it); tasks are stored as `${id}:${task}`
 *   beta    starting ether wind as a fraction of c, snapped to the slider's stops (default 0)
 *   angle   starting angle of arm 1 to the wind [deg], 0…90 in steps of 15 (default 0)
 *   tasks   task ids to show (below)
 *
 * Step `set` keys: beta (snapped to the stops 0, 1e-4 = 30 km/s, 0.15, 0.3, 0.45, 0.6), angle [deg],
 *   prog (fraction of the slower round trip shown, 0…1), playing.
 *
 * Tasks, ticked only inside the learner's own handlers (a step never ticks one):
 *   race        the learner plays the pulses to the end with a wind of at least 0.15c
 *   rotate      the learner turns the apparatus with the button while a wind blows
 *   real-shift  the learner sets the wind to 30 km/s and the arms at 90° to their starting place
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { C_LIGHT } from '~/physics/constants';
import { aimAngle, armRoundTrip, fringeShiftBetween, legSpeed, pulseOnArm } from '~/physics/ether';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const TASK_LABEL: Record<string, string> = {
  race: 'קבעו רוח אתר מוגזמת, לחצו "הפעלה" וצפו עד ששני הפולסים חוזרים. איזה פולס חוזר אחרון?',
  rotate: 'סובבו את המכשיר ב-90° בכפתור, כשנושבת רוח. מה קרה לזמנים של שתי הזרועות?',
  'real-shift': 'קבעו את רוח האתר ל-30 km/s וסובבו את המכשיר ב-90°. בכמה פסים הייתה התבנית אמורה לזוז?',
};

/** the slider's stops: no wind, Earth's orbital speed, then exaggerated winds (fractions of c) */
const STOPS = [0, 1e-4, 0.15, 0.3, 0.45, 0.6];
const STOP_LABEL = ['0', '30 km/s', '0.15c', '0.3c', '0.45c', '0.6c'];
/** the 1887 apparatus, for the fringe readout */
const L_REAL = 11;
const LAMBDA = 550e-9;
const PLAY_RATE = 0.4; // units of 2L/c per second of wall clock
const deg = Math.PI / 180;

export interface MichelsonMorleyProps {
  id: string;
  beta?: number;
  angle?: number;
  tasks?: string[];
}

interface MMState {
  vi: number; // index into STOPS
  angle: number; // deg, arm 1 from the wind
  t: number; // time since the pulses left the splitter, units of 2L/c
  playing: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const snap = (b: number) => {
  let best = 0;
  for (let i = 1; i < STOPS.length; i++) if (Math.abs(STOPS[i] - b) < Math.abs(STOPS[best] - b)) best = i;
  return best;
};
/** arm 1's angle to the wind: 0…90° covers every case (the pattern repeats every 180° and is symmetric about 90°) */
const normAngle = (a: number) => Math.max(0, Math.min(90, Math.round(a / 15) * 15));

/** round trips of the two arms in units of 2L/c (c = 1, L = 1, so 2L/c = 2) */
function times(s: MMState) {
  const b = STOPS[s.vi];
  const th = s.angle * deg;
  return { t1: armRoundTrip(1, th, b, 1) / 2, t2: armRoundTrip(1, th + Math.PI / 2, b, 1) / 2 };
}
const endTime = (s: MMState) => {
  const { t1, t2 } = times(s);
  return Math.max(t1, t2);
};

/** fringes the real apparatus' pattern would move by, turned from 0° to the current angle (ether model) */
const predictedShift = (s: MMState) => fringeShiftBetween(L_REAL, L_REAL, 0, s.angle * deg, STOPS[s.vi] * C_LIGHT, LAMBDA);

function initial(p: MichelsonMorleyProps): MMState {
  return { vi: snap(p.beta ?? 0), angle: normAngle(p.angle ?? 0), t: 0, playing: false };
}

const num4 = (x: number) => x.toPrecision(4);
const fringeText = (N: number) => {
  const a = Math.abs(N);
  if (a < 0.005) return '0';
  return a < 1000 ? Number(a.toPrecision(2)).toString() : sci(a, 2);
};

/* ------------------------------------------------------------------ text on canvas */

function mathText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; align?: CanvasTextAlign; italic?: boolean } = {}) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${o.italic === false ? '' : 'italic '}700 ${o.size ?? 13}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; weight?: number; align?: CanvasTextAlign } = {}) {
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

/* ------------------------------------------------------------------ the component */

const WORLD_W = 2.9;
const aspectFor = (w: number) => (w < 520 ? 1.1 : 1.45);

export default function MichelsonMorley(props: MichelsonMorleyProps) {
  const [s, setS] = useState<MMState>(() => initial(props));
  const [live, setLive] = useState('');
  const sRef = useRef(s);
  sRef.current = s;
  const learnerPlay = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t) ?? false;
  const done = (t: string) => {
    if (has(t)) markTask(`${props.id}:${t}`);
  };

  /** a learner's own change: apply it and judge the tasks that a state can complete */
  const learn = (patch: Partial<MMState>) => {
    const next: MMState = { ...sRef.current, ...patch };
    next.t = clamp(next.t, 0, endTime(next));
    if (next.vi === 1 && next.angle === 90) done('real-shift');
    setS(next);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        learnerPlay.current = false;
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.beta === 'number') next.vi = snap(st.beta);
          if (typeof st.angle === 'number') next.angle = normAngle(st.angle);
          if (typeof st.prog === 'number') next.t = clamp(st.prog, 0, 1) * endTime(next);
          next.t = clamp(next.t, 0, endTime(next));
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
      const prev = sRef.current;
      const end = endTime(prev);
      const t = prev.t + dt;
      if (t >= end) {
        if (learnerPlay.current && STOPS[prev.vi] >= 0.15) done('race');
        learnerPlay.current = false;
        setS({ ...prev, t: end, playing: false });
      } else setS({ ...prev, t });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s)), 700);
    return () => clearTimeout(h);
  }, [s.vi, s.angle]);

  const [aspect, setAspect] = useState(1.45);
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

  const { t1, t2 } = times(s);
  const N = predictedShift(s);
  const end = endTime(s);

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: אינטרפרומטר של מייקלסון ומורלי במבט מלמעלה, ברוח אתר. ${describe(s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="t1">
            זרוע 1: <b class="q"><bdi dir="ltr">{num4(t1)}</bdi></b>
          </span>
          <span data-readout="t2">
            זרוע 2: <b class="q"><bdi dir="ltr">{num4(t2)}</bdi></b>
          </span>
          <span data-readout="dt">
            הפרש: <b class="q"><bdi dir="ltr">{Math.abs(t1 - t2) < 1e-15 ? '0' : sci(t1 - t2, 3).replace('-', '−')}</bdi></b>
          </span>
          <span class="hint">
            זמני הלוך-חזור ביחידות של <bdi dir="ltr">2L/c</bdi>
          </span>
          <span data-readout="shift">
            ניבוי האתר להזזת הפסים: <b class="q"><bdi dir="ltr">{fringeText(N)}</bdi></b>
          </span>
          <span data-readout="observed">
            נמדד ב-1887: <b class="q">0</b> (פחות מ-0.02)
          </span>
        </>
      }
      controls={
        <>
          <Slider
            label="רוח האתר"
            min={0}
            max={STOPS.length - 1}
            step={1}
            value={s.vi}
            format={(i) => STOP_LABEL[i] ?? ''}
            onChange={(i) => learn({ vi: i, t: 0, playing: false })}
          />
          <Slider
            label="זווית זרוע 1 לרוח"
            min={0}
            max={90}
            step={15}
            value={s.angle}
            format={(a) => `${a}°`}
            onChange={(a) => learn({ angle: a, t: 0, playing: false })}
          />
          <div class="group" role="group" aria-label="סיבוב והפעלה">
            <button
              type="button"
              class="toggle"
              onClick={() => {
                if (STOPS[sRef.current.vi] > 0) done('rotate');
                learn({ angle: sRef.current.angle >= 90 ? sRef.current.angle - 90 : sRef.current.angle + 90, t: 0, playing: false });
              }}
            >
              סיבוב ב-90°
            </button>
            <Toggle
              label={s.playing ? 'עצירה' : 'הפעלה'}
              on={s.playing}
              onChange={(on) => {
                learnerPlay.current = on;
                if (on && s.t >= end - 1e-12) setS({ ...s, t: 0, playing: true });
                else setS({ ...s, playing: on });
              }}
            />
          </div>
          <Slider
            label="זמן"
            min={0}
            max={1}
            step={0.01}
            value={Math.round((s.t / end) * 100) / 100}
            format={(x) => (x * end).toPrecision(3)}
            onChange={(x) => {
              learnerPlay.current = false;
              const next = { ...sRef.current, t: x * end, playing: false };
              if (x >= 1 && STOPS[next.vi] >= 0.15) done('race');
              setS(next);
            }}
          />
        </>
      }
    />
  );
}

function describe(s: MMState): string {
  const b = STOPS[s.vi];
  const { t1, t2 } = times(s);
  const wind = b === 0 ? 'אין רוח אתר.' : `רוח האתר ${STOP_LABEL[s.vi]}, ימינה.`;
  const arms = `זרוע 1 בזווית ${s.angle} מעלות לרוח. זמן ההלוך-חזור בזרוע 1 ${num4(t1)} ובזרוע 2 ${num4(t2)}, ביחידות של 2L/c.`;
  return `${wind} ${arms} לפי תאוריית האתר, סיבוב מהזווית 0 לזווית הזו מזיז את תבנית הפסים של המכשיר האמיתי ב-${fringeText(predictedShift(s))} פסים. במדידה לא נמצאה הזזה.`;
}

/* ------------------------------------------------------------------ drawing */

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: MMState) {
  const { w, h, ppm } = view;
  const b = STOPS[s.vi];
  // the splitter sits a little right of and above the centre: room for the source (left) and detector (below)
  const ox = w / 2;
  const oy = h / 2 + 0.3 * ppm;
  const sx = (x: number) => ox + x * ppm;
  const sy = (y: number) => oy - y * ppm;
  const th1 = s.angle * deg;
  const th2 = th1 + Math.PI / 2;
  const u1: [number, number] = [Math.cos(th1), Math.sin(th1)];
  const u2: [number, number] = [Math.cos(th2), Math.sin(th2)];

  // the ether wind: faint streaming arrows to the right, length ∝ the wind (a minimum length when it is tiny)
  if (b > 0) {
    const len = Math.max(0.12, b * 0.7) * ppm;
    const col = withAlpha(p.accent, 0.28);
    for (let gy = -3; gy <= 3; gy++) {
      for (let gx = -4; gx <= 4; gx++) {
        const x = w / 2 + gx * 0.42 * ppm + (gy % 2 === 0 ? 0 : 0.21 * ppm);
        const y = h / 2 + gy * 0.4 * ppm;
        if (x < 6 || x + len > w - 6 || y < 30 || y > h - 8) continue;
        arrow(ctx, x, y, x + len, y, { color: col, width: 1.4, head: 6 });
      }
    }
  }

  // the apparatus: arms, mirrors, splitter, source and detector
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.6;
  for (const u of [u1, u2]) {
    ctx.beginPath();
    ctx.moveTo(sx(0), sy(0));
    ctx.lineTo(sx(u[0]), sy(u[1]));
    ctx.stroke();
  }
  // the source on the far side of arm 1, the detector on the far side of arm 2
  const src: [number, number] = [-0.45 * u1[0], -0.45 * u1[1]];
  const det: [number, number] = [-0.45 * u2[0], -0.45 * u2[1]];
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(sx(src[0]), sy(src[1]));
  ctx.lineTo(sx(0), sy(0));
  ctx.lineTo(sx(det[0]), sy(det[1]));
  ctx.stroke();
  ctx.setLineDash([]);
  // mirrors: short bars across each arm's end
  ctx.strokeStyle = p.equip;
  ctx.lineWidth = 4;
  const mh = 0.11;
  for (const [u, n] of [
    [u1, u2],
    [u2, u1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(sx(u[0] - mh * n[0]), sy(u[1] - mh * n[1]));
    ctx.lineTo(sx(u[0] + mh * n[0]), sy(u[1] + mh * n[1]));
    ctx.stroke();
  }
  // the half-silvered splitter at 45° between the arms
  const d: [number, number] = [(u1[0] - u2[0]) / Math.SQRT2, (u1[1] - u2[1]) / Math.SQRT2];
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.equip, 0.8);
  ctx.beginPath();
  ctx.moveTo(sx(-0.1 * d[0]), sy(-0.1 * d[1]));
  ctx.lineTo(sx(0.1 * d[0]), sy(0.1 * d[1]));
  ctx.stroke();
  // source (a lamp) and detector (an eye / screen)
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.arc(sx(src[0]), sy(src[1]), 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.ink2;
  ctx.fillRect(sx(det[0]) - 7, sy(det[1]) - 7, 14, 14);
  ctx.restore();

  mathText(ctx, p, 'M₁', sx(1.16 * u1[0] + 0.16 * u2[0]), sy(1.16 * u1[1] + 0.16 * u2[1]), { italic: false });
  mathText(ctx, p, 'M₂', sx(1.16 * u2[0] + 0.16 * u1[0]), sy(1.16 * u2[1] + 0.16 * u1[1]), { italic: false });
  mathText(ctx, p, '1', sx(0.55 * u1[0] + 0.1 * u2[0]), sy(0.55 * u1[1] + 0.1 * u2[1]), { italic: false, color: p.ink2, size: 12 });
  mathText(ctx, p, '2', sx(0.55 * u2[0] + 0.1 * u1[0]), sy(0.55 * u2[1] + 0.1 * u1[1]), { italic: false, color: p.ink2, size: 12 });

  // the two pulses and their velocity triangles (scale: c ↦ 0.32 world units)
  const k = 0.32 * ppm;
  const arms: { th: number; u: [number, number] }[] = [
    { th: th1, u: u1 },
    { th: th2, u: u2 },
  ];
  for (const a of arms) {
    const pos = pulseOnArm(1, a.th, b, s.t * 2, 1);
    const px = sx(pos.s * a.u[0]);
    const py = sy(pos.s * a.u[1]);
    if (!pos.done) {
      const dir = pos.back ? a.th + Math.PI : a.th;
      const speed = legSpeed(dir, b, 1);
      const aim = aimAngle(dir, b, 1);
      const lab: [number, number] = [px + speed * Math.cos(dir) * k, py - speed * Math.sin(dir) * k];
      const rel: [number, number] = [px + Math.cos(aim) * k, py - Math.sin(aim) * k];
      if (b >= 0.15) {
        ctx.save();
        ctx.setLineDash([4, 3]);
        arrow(ctx, px, py, rel[0], rel[1], { color: withAlpha(p.velocity, 0.55), width: 1.8, head: 8 });
        arrow(ctx, rel[0], rel[1], lab[0], lab[1], { color: withAlpha(p.accent, 0.8), width: 1.8, head: 7 });
        ctx.restore();
      }
      arrow(ctx, px, py, lab[0], lab[1], { color: p.velocity, width: 2.6, head: 10 });
      // the lab speed beside the arrow's tip, pushed off the arm sideways
      const nx = -Math.sin(dir);
      const ny = Math.cos(dir);
      mathText(ctx, p, `${speed.toFixed(2)}c`, clamp(lab[0] + 16 * Math.cos(dir) + 14 * nx, 22, w - 22), clamp(lab[1] - 16 * Math.sin(dir) - 14 * ny, 28, h - 10), { color: p.velocity, size: 12, italic: false });
    }
    ctx.save();
    ctx.fillStyle = p.accent;
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(px, py, pos.done ? 4 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // title and the wind label, left of the reset/fullscreen buttons
  const right = w - 90;
  const tw = heText(ctx, p, b === 0 ? 'אין רוח אתר' : 'רוח אתר', right, 14, { size: 13, weight: 700, color: p.ink });
  if (b > 0) mathText(ctx, p, `v = ${STOP_LABEL[s.vi]}`, right - tw - 8, 14, { align: 'right', size: 13, italic: false });

  // the time since the pulses left, in units of 2L/c
  mathText(ctx, p, `t = ${s.t.toFixed(3)} · 2L/c`, 10, h - 14, { align: 'left', size: 12, italic: false, color: p.ink2 });

  paintFringes(ctx, p, w, h, predictedShift(s));
}

/** The inset: the fringe pattern predicted after the turn (shifted) above the observed one (not shifted). */
function paintFringes(ctx: CanvasRenderingContext2D, p: Palette, w: number, h: number, N: number) {
  const bw = Math.min(150, w * 0.34);
  const bh = 16;
  const x0 = w - bw - 10;
  const rows: { label: string; shift: number; y: number }[] = [
    { label: 'ניבוי', shift: N, y: h - 2 * bh - 22 },
    { label: 'נמדד', shift: 0, y: h - bh - 12 },
  ];
  const period = bw / 3.2;
  for (const r of rows) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, r.y, bw, bh);
    ctx.clip();
    for (let i = 0; i < bw; i += 1) {
      const phase = ((i / period - r.shift) % 1 + 1) % 1;
      const I = Math.cos(Math.PI * phase) ** 2;
      ctx.fillStyle = withAlpha(p.ink, 0.08 + 0.75 * I);
      ctx.fillRect(x0 + i, r.y, 1.2, bh);
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.strokeRect(x0, r.y, bw, bh);
    ctx.restore();
    heText(ctx, p, r.label, x0 - 6, r.y + bh / 2, { size: 12 });
  }
  // the zero mark: where the central bright fringe sat before the turn
  ctx.save();
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, rows[0].y - 3);
  ctx.lineTo(x0, rows[1].y + bh + 3);
  ctx.stroke();
  ctx.restore();
}
