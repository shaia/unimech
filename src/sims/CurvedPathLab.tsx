/**
 * CurvedPathLab: a point moving on a curved path, with its velocity, its acceleration split into the
 * tangential part (along v, changes the speed) and the normal part (across v, toward the centre of
 * curvature, turns the velocity), the osculating circle of radius ρ, and the construction Δv = v₂ − v₁
 * that defines the acceleration (lesson 1.3).
 *
 * Model: src/physics/curvilinear.ts (prescribed paths with exact derivatives; MODEL SPECIFICATION there).
 * Physics space: x to the right, y up, metres. Velocity arrows are drawn to a stated scale (metres of
 * drawing per m/s) and acceleration arrows to another (per m/s²), per preset; the scales are printed under
 * the figure. Colours: velocity --velocity, acceleration --accel, osculating circle --accent. This is
 * kinematics: no force is drawn. An acceleration arrow shorter than MIN_ARROW px on screen is drawn at that length
 * (direction kept) so its head and label stay readable; the readouts always give the true values. When one part
 * of the split is (nearly) zero the other coincides with a, so neither part is drawn over it.
 *
 * Presets (all in a 13 m × 9 m window around the origin):
 *   uniform   circle R = 3 m, ω = 0.5 rad/s: v = 1.5 m/s, a⊥ = 0.75 m/s², a_t = 0
 *   speeding  circle R = 3 m from rest, α = 0.12 rad/s²: a_t = 0.36 m/s², a⊥ = ω²R grows
 *   slowing   circle R = 3 m, ω₀ = 1 rad/s, α = −0.15 rad/s²: a_t = −0.45 m/s²
 *   ellipse   r = (5 cos ωt, 3 sin ωt), ω = 0.5 rad/s: ρ from 1.8 m to 8.33 m, a points at the centre
 *   throw     projectile from (−3.7, −1.5) m (the g arrow, ≈ 2 m long, stays on the canvas) at (4.5, 8) m/s, g = 9.8 m/s²: ρ = 17.5 m at launch, 2.07 m at the
 *             top (y ≈ 0.97 m)
 *
 * Props (Astro wrapper: <Spread figure={CurvedPathLab} figureProps={{ preset: 'uniform', tasks: [...] }}>)
 *   id (required), preset (default 'uniform'), t, dt, showV (default true), showA, showSplit, showCircle,
 *   showDv, tasks.
 * Step `set` keys: preset, t, dt, playing, showV, showA, showSplit, showCircle, showDv.
 *
 * Tasks, ticked only by the learner's own actions (a step's `set` clears what counts as "own"):
 *   uniform-inward  on the uniform circle, the learner shows the acceleration (or picks the preset or moves
 *                   the body with it shown): a points at the centre
 *   shrink-dt       with the Δv construction on, the learner slides Δt down until Δv/Δt is within 2° of a,
 *                   at an instant where the largest Δt is more than 5° off
 *   slowing-split   with the split shown, the learner moves or plays the body to an instant where the
 *                   tangential part points against v (a_t/|a| < −0.2, |v| > 0.1 m/s)
 *   top-curvature   on the throw, with the osculating circle shown, the learner moves the body to within
 *                   0.03 s of the top, where ρ is smallest
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import {
  angleBetween,
  averageAcceleration,
  circlePath,
  deltaV,
  ellipsePath,
  projectilePath,
  tangentNormal,
  type CurvePath,
} from '~/physics/curvilinear';
import { len, type Vec2 } from '~/physics/vec';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 13;
const WORLD_H = 9;
const MINUS = '−';
/** shortest acceleration arrow drawn on screen [px] */
const MIN_ARROW = 18;

export type CurvedPreset = 'uniform' | 'speeding' | 'slowing' | 'ellipse' | 'throw';
const PRESETS: CurvedPreset[] = ['uniform', 'speeding', 'slowing', 'ellipse', 'throw'];
const PRESET_NAME: Record<CurvedPreset, string> = {
  uniform: 'מעגל, גודל מהירות קבוע',
  speeding: 'מעגל, מאיץ',
  slowing: 'מעגל, מאט',
  ellipse: 'אליפסה',
  throw: 'זריקה',
};
/** circle presets: radius and centre, for the ω readout and the centre mark */
const CIRCLE_R = 3;
const isCircle = (p: CurvedPreset) => p === 'uniform' || p === 'speeding' || p === 'slowing';
/** periodic paths loop over their whole duration; the others stop Δt short of the end */
const isPeriodic = (p: CurvedPreset) => p === 'uniform' || p === 'ellipse';

/** metres of drawing per m/s of velocity, and per m/s² of acceleration */
const SCALE: Record<CurvedPreset, { v: number; a: number }> = {
  uniform: { v: 1, a: 2.5 },
  speeding: { v: 0.7, a: 0.8 },
  slowing: { v: 0.7, a: 0.8 },
  ellipse: { v: 1, a: 2 },
  throw: { v: 0.35, a: 0.2 },
};

function pathOf(p: CurvedPreset): CurvePath {
  switch (p) {
    case 'uniform':
      return circlePath(CIRCLE_R, 0.5, 0, -Math.PI / 2, [0, 0], 4 * Math.PI);
    case 'speeding':
      return circlePath(CIRCLE_R, 0, 0.12, -Math.PI / 2, [0, 0], 8);
    case 'slowing':
      return circlePath(CIRCLE_R, 1, -0.15, -Math.PI / 2, [0, 0], 6);
    case 'ellipse':
      return ellipsePath(5, 3, 0.5);
    case 'throw':
      return projectilePath([-3.7, -1.5], [4.5, 8]);
  }
}
/** the omega of a circle preset at time t (rad/s), for the readout */
const omegaOf = (p: CurvedPreset, t: number) => (p === 'uniform' ? 0.5 : p === 'speeding' ? 0.12 * t : p === 'slowing' ? 1 - 0.15 * t : NaN);

const TASK_LABEL: Record<string, string> = {
  'uniform-inward': 'במעגל שבו גודל המהירות קבוע, הציגו את התאוצה. לאן היא מצביעה?',
  'shrink-dt': 'הציגו את בניית Δv והקטינו את Δt. לאן מתקרב הכיוון של Δv/Δt?',
  'slowing-split': 'הציגו את פירוק התאוצה, ומצאו רגע שבו הרכיב המשיקי מצביע נגד המהירות.',
  'top-curvature': 'בזריקה, הציגו את מעגל העקמומיות והזיזו את הגוף לנקודה שבה הוא הכי קטן.',
};

export interface CurvedPathLabProps {
  id: string;
  preset?: CurvedPreset;
  t?: number;
  dt?: number;
  showV?: boolean;
  showA?: boolean;
  showSplit?: boolean;
  showCircle?: boolean;
  showDv?: boolean;
  tasks?: string[];
}

interface State {
  preset: CurvedPreset;
  t: number;
  dt: number;
  playing: boolean;
  showV: boolean;
  showA: boolean;
  showSplit: boolean;
  showCircle: boolean;
  showDv: boolean;
}

const BOOLS = ['showV', 'showA', 'showSplit', 'showCircle', 'showDv'] as const;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const dtMaxOf = (path: CurvePath) => Math.min(2, path.duration / 6);
const dtMinOf = (path: CurvePath) => dtMaxOf(path) / 100;
const tMaxOf = (p: CurvedPreset, path: CurvePath) => (isPeriodic(p) ? path.duration : path.duration - dtMaxOf(path));

const plain = (x: number, sig = 3) => (Math.abs(x) < 1e-9 ? '0' : sci(x, sig).replace('-', MINUS));
const signed = (x: number, sig = 3) => (Math.abs(x) < 1e-9 ? '0' : `${x > 0 ? '+' : MINUS}${sci(Math.abs(x), sig)}`);
const degOf = (rad: number) => (rad * 180) / Math.PI;

function initial(p: CurvedPathLabProps): State {
  const preset = p.preset ?? 'uniform';
  const path = pathOf(preset);
  return {
    preset,
    t: clamp(p.t ?? 0, 0, tMaxOf(preset, path)),
    dt: clamp(p.dt ?? dtMaxOf(path), dtMinOf(path), dtMaxOf(path)),
    playing: false,
    showV: p.showV ?? true,
    showA: p.showA ?? false,
    showSplit: p.showSplit ?? false,
    showCircle: p.showCircle ?? false,
    showDv: p.showDv ?? false,
  };
}

export default function CurvedPathLab(props: CurvedPathLabProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const touched = useRef(new Set<string>());
  const drag = useRef(false);
  const path = useMemo(() => pathOf(s.preset), [s.preset]);
  const tMax = tMaxOf(s.preset, path);
  const dtMax = dtMaxOf(path);
  const dtMin = dtMinOf(path);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const change = (patch: Partial<State>) => {
    for (const k of Object.keys(patch)) touched.current.add(k);
    setS((prev) => ({ ...prev, ...patch }));
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        // a step's state is never the learner's own action
        touched.current.clear();
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.preset === 'string' && (PRESETS as string[]).includes(st.preset)) {
            next.preset = st.preset as CurvedPreset;
            next.t = 0;
            next.dt = dtMaxOf(pathOf(next.preset));
          }
          const pth = pathOf(next.preset);
          if (typeof st.t === 'number') next.t = clamp(st.t, 0, tMaxOf(next.preset, pth));
          if (typeof st.dt === 'number') next.dt = clamp(st.dt, dtMinOf(pth), dtMaxOf(pth));
          if (typeof st.playing === 'boolean') next.playing = st.playing;
          for (const k of BOOLS) if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          return next;
        });
      }),
    [props.id],
  );

  // playback loops over the playable range; frozen in still mode
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const d = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => {
        const t = prev.t + d;
        return { ...prev, t: t > tMax ? t - tMax : t };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, tMax]);

  // tasks
  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const own = (...keys: string[]) => keys.some((k) => touched.current.has(k));
    const v = path.v(s.t);
    const a = path.a(s.t);
    if (has('uniform-inward') && s.preset === 'uniform' && s.showA && own('showA', 'preset', 't', 'playing')) done('uniform-inward');
    if (has('shrink-dt') && s.showDv && own('dt')) {
      const atMax = degOf(angleBetween(averageAcceleration(path, s.t, dtMax), a));
      const now = degOf(angleBetween(averageAcceleration(path, s.t, s.dt), a));
      if (atMax > 5 && now < 2) done('shrink-dt');
    }
    if (has('slowing-split') && s.showSplit && own('t', 'playing', 'preset') && len(v) > 0.1) {
      if (tangentNormal(v, a).aT / len(a) < -0.2) done('slowing-split');
    }
    if (has('top-curvature') && s.preset === 'throw' && s.showCircle && own('t', 'playing')) {
      const tTop = path.v(0)[1] / -path.a(0)[1];
      if (Math.abs(s.t - tTop) < 0.03) done('top-curvature');
    }
  }, [s, props.id, props.tasks, path, dtMax]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(path, s)), 700);
    return () => clearTimeout(h);
  }, [s.preset, s.showA, s.showSplit, s.showCircle, Math.round(s.t * 4)]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, path, s);
  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  /** move the body to the point of the playable path nearest the pointer */
  const grab = (e: PointerEvent) => {
    const view = viewRef.current;
    if (!view) return;
    const [wx, wy] = toWorld(view, e.offsetX, e.offsetY);
    let best = 0;
    let bd = Infinity;
    const N = 300;
    for (let i = 0; i <= N; i++) {
      const t = (tMax * i) / N;
      const r = path.r(t);
      const d = Math.hypot(r[0] - wx, r[1] - wy);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    change({ t: best, playing: false });
  };
  const onPointerDown = (e: PointerEvent) => {
    drag.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    grab(e);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (drag.current) grab(e);
  };
  const onPointerUp = () => {
    drag.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = tMax / 60;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') change({ t: clamp(s.t + step, 0, tMax), playing: false });
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') change({ t: clamp(s.t - step, 0, tMax), playing: false });
    else return;
    e.preventDefault();
  };

  const reset = () => {
    touched.current.clear();
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const v = path.v(s.t);
  const a = path.a(s.t);
  const split = tangentNormal(v, a);
  const moving = split.speed > 1e-6;
  const aAvg = averageAcceleration(path, s.t, s.dt);
  const sc = SCALE[s.preset];
  const w = omegaOf(s.preset, s.t);
  const uOf = (dt: number) => Math.log(dt / dtMin) / Math.log(dtMax / dtMin);
  const dtOf = (u: number) => dtMin * (dtMax / dtMin) ** u;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: גוף נע במישור על מסלול עקום. ${describe(path, s)} גררו את הגוף לאורך המסלול או השתמשו בחצים במקלדת.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current ? 'grabbing' : 'grab'}
      readout={
        // one span per quantity: commas between LTR quantities reorder in an RTL line
        <>
          <span class="q" data-readout="t">t = {plain(s.t, 3)} s</span>
          <span class="q" data-readout="speed">|v| = {plain(split.speed, 3)} m/s</span>
          {isCircle(s.preset) && (
            <span class="q" data-readout="omega">
              ω = {plain(w, 3)} rad/s
            </span>
          )}
          {(s.showA || s.showSplit) && <span class="q" data-readout="accel">|a| = {plain(len(a), 3)} m/s²</span>}
          {s.showSplit && (
            <>
              <span>
                רכיב משיקי{' '}
                <b class="q" data-readout="at">
                  a<sub>t</sub> = {signed(split.aT, 3)} m/s²
                </b>
              </span>
              <span>
                רכיב ניצב{' '}
                <b class="q" data-readout="an">
                  a<sub>⊥</sub> = {plain(split.aN, 3)} m/s²
                </b>
              </span>
              <span>
                זווית בין a ל-v: <span class="q" data-readout="angle">{moving ? `${plain(degOf(angleBetween(a, v)), 3)}°` : '—'}</span>
              </span>
            </>
          )}
          {s.showCircle && (
            <span>
              רדיוס עקמומיות:{' '}
              <b class="q" data-readout="rho">
                ρ = {moving && Number.isFinite(split.rho) ? `${plain(split.rho, 3)} m` : '—'}
              </b>
            </span>
          )}
          {s.showDv && (
            <>
              <span class="q" data-readout="dv">
                |Δv|/Δt = {plain(len(aAvg), 3)} m/s²
              </span>
              <span>
                זווית בין Δv/Δt ל-a: <span class="q" data-readout="dv-angle">{plain(degOf(angleBetween(aAvg, a)), 2)}°</span>
              </span>
            </>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מסלול">
            {PRESETS.map((id) => (
              <Toggle
                key={id}
                label={PRESET_NAME[id]}
                on={s.preset === id}
                onChange={() => {
                  change({ preset: id, t: 0, playing: false, dt: dtMaxOf(pathOf(id)) });
                  // a new path restarts t and Δt; that is not the learner moving the body or the Δt slider
                  for (const k of ['t', 'playing', 'dt']) touched.current.delete(k);
                }}
              />
            ))}
          </div>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="מהירות" on={s.showV} swatch="var(--velocity)" onChange={(on) => change({ showV: on })} />
            <Toggle label="תאוצה" on={s.showA} swatch="var(--accel)" onChange={(on) => change({ showA: on })} />
            <Toggle label="פירוק התאוצה" on={s.showSplit} swatch="var(--accel)" onChange={(on) => change({ showSplit: on })} />
            <Toggle label="מעגל העקמומיות" on={s.showCircle} swatch="var(--accent)" onChange={(on) => change({ showCircle: on })} />
            <Toggle label="בניית Δv" on={s.showDv} swatch="var(--accel)" onChange={(on) => change({ showDv: on })} />
          </div>
          <div class="group" role="group" aria-label="זמן">
            <Toggle label={s.playing ? 'עצירה' : 'הפעלה'} on={s.playing} onChange={(on) => change({ playing: on })} />
          </div>
          <Slider label="זמן" min={0} max={tMax} step={tMax / 240} value={s.t} format={(x) => `${plain(x, 3)} s`} onChange={(x) => change({ t: x, playing: false })} />
          {s.showDv && (
            <Slider label="הפרש הזמנים Δt" min={0} max={1} step={0.01} value={uOf(s.dt)} format={(u) => `${plain(dtOf(u), 2)} s`} onChange={(u) => change({ dt: dtOf(u) })} />
          )}
          <p class="hint">
            קנה מידה: מטר אחד באיור הוא <span class="q">{plain(1 / sc.v, 2)} m/s</span> של מהירות או{' '}
            <span class="q">{plain(1 / sc.a, 2)} m/s²</span> של תאוצה. גררו את הגוף לאורך המסלול.
          </p>
        </>
      }
    />
  );
}

function describe(path: CurvePath, s: State): string {
  const sp = tangentNormal(path.v(s.t), path.a(s.t));
  const kind = Math.abs(sp.aT) < 1e-6 * Math.max(1, len(path.a(s.t))) ? 'גודל המהירות קבוע' : sp.aT > 0 ? 'גודל המהירות גדל' : 'גודל המהירות קטן';
  const rho = sp.speed > 1e-6 && Number.isFinite(sp.rho) ? ` רדיוס העקמומיות ${plain(sp.rho, 3)} מטר.` : '';
  return `מסלול: ${PRESET_NAME[s.preset]}. ברגע t = ${plain(s.t, 2)} שניות גודל המהירות ${plain(sp.speed, 3)} מטר לשנייה ו${kind}.${rho}`;
}

function label(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color: string, size = 14) {
  ctx.save();
  ctx.font = `italic 700 ${size}px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, path: CurvePath, s: State) {
  const at = (w: Vec2) => toScreen(view, w[0], w[1]);
  const sc = SCALE[s.preset];

  // 1 m grid
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  for (let i = -Math.floor(WORLD_W / 2); i <= WORLD_W / 2; i++) {
    const [x] = at([i, 0]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, view.h);
    ctx.stroke();
  }
  for (let j = -Math.floor(WORLD_H / 2); j <= WORLD_H / 2; j++) {
    const [, y] = at([0, j]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.w, y);
    ctx.stroke();
  }
  ctx.restore();

  // the path
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const [x, y] = at(path.r((path.duration * i) / N));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // centre of the circle (circle presets) or of the ellipse
  if (isCircle(s.preset) || s.preset === 'ellipse') {
    const O = at([0, 0]);
    ctx.save();
    ctx.fillStyle = p.ink2;
    ctx.beginPath();
    ctx.arc(O[0], O[1], 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    label(ctx, p, 'O', O[0] - 11, O[1] + 12, p.ink2);
  }

  const r = path.r(s.t);
  const v = path.v(s.t);
  const a = path.a(s.t);
  const B = at(r);
  const sp = tangentNormal(v, a);
  const tip = (vec: Vec2, k: number, from: Vec2 = r): [number, number] => at([from[0] + vec[0] * k, from[1] + vec[1] * k]);
  const tag = (text: string, to: [number, number], color: string, from: [number, number] = B) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const L = Math.hypot(dx, dy) || 1;
    // a short arrow puts its label further out, clear of the body and of the arrowhead
    const out = 13 + Math.max(0, 24 - L);
    label(ctx, p, text, to[0] + (dx / L) * out - (dy / L) * 6, to[1] + (dy / L) * out + (dx / L) * 6, color);
  };
  /** the screen tip of an acceleration arrow, stretched to MIN_ARROW px when shorter (direction kept) */
  const accelTip = (vec: Vec2): [number, number] => {
    const t = tip(vec, sc.a);
    const L = Math.hypot(t[0] - B[0], t[1] - B[1]);
    if (L === 0 || L >= MIN_ARROW) return t;
    return [B[0] + ((t[0] - B[0]) / L) * MIN_ARROW, B[1] + ((t[1] - B[1]) / L) * MIN_ARROW];
  };

  // the osculating circle and its radius
  // the radius is drawn toward the centre even when the centre is off the canvas (the canvas clips it)
  if (s.showCircle && sp.speed > 1e-6 && Number.isFinite(sp.rho)) {
    const C: Vec2 = [r[0] + sp.N[0] * sp.rho, r[1] + sp.N[1] * sp.rho];
    const Cs = at(C);
    const Rpx = sp.rho * view.ppm;
    ctx.save();
    ctx.strokeStyle = withAlpha(p.accent, 0.85);
    ctx.lineWidth = 1.8;
    if (Rpx < 1e5) {
      ctx.beginPath();
      ctx.arc(Cs[0], Cs[1], Rpx, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(B[0], B[1]);
    ctx.lineTo(Cs[0], Cs[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(Cs[0], Cs[1], 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // the ρ label sits on the radius, near the body when the centre is far away
    const d = Math.min(Rpx / 2, 46);
    const lx = B[0] + ((Cs[0] - B[0]) / Rpx) * d;
    const ly = B[1] + ((Cs[1] - B[1]) / Rpx) * d;
    label(ctx, p, 'ρ', lx + ((Cs[1] - B[1]) / Rpx) * 11, ly - ((Cs[0] - B[0]) / Rpx) * 11, p.accent, 15);
  }

  // Δv construction: v₁ and v₂ tail to tail at the body, Δv between the tips, Δv/Δt drawn at the acceleration scale
  if (s.showDv) {
    const v2 = path.v(s.t + s.dt);
    const t1 = tip(v, sc.v);
    const t2 = tip(v2, sc.v);
    arrow(ctx, B[0], B[1], t1[0], t1[1], { color: p.velocity, width: 3, head: 12 });
    arrow(ctx, B[0], B[1], t2[0], t2[1], { color: withAlpha(p.velocity, 0.6), width: 2.4, head: 11 });
    arrow(ctx, t1[0], t1[1], t2[0], t2[1], { color: p.accel, width: 2.6, head: 10 });
    tag('v₁', t1, p.velocity);
    tag('v₂', t2, withAlpha(p.velocity, 0.9));
    const mid: [number, number] = [(t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2];
    tag('Δv', mid, p.accel, [(B[0] + mid[0]) / 2, (B[1] + mid[1]) / 2]);
    const dv = deltaV(path, s.t, s.dt);
    const ta = tip([dv[0] / s.dt, dv[1] / s.dt], sc.a);
    arrow(ctx, B[0], B[1], ta[0], ta[1], { color: withAlpha(p.accel, 0.45), width: 5, head: 14 });
    tag('Δv/Δt', ta, withAlpha(p.accel, 0.9));
  }

  // instantaneous velocity
  if (s.showV && !s.showDv && sp.speed > 1e-6) {
    const t1 = tip(v, sc.v);
    arrow(ctx, B[0], B[1], t1[0], t1[1], { color: p.velocity, width: 3.2, head: 13 });
    tag('v', t1, p.velocity);
  }

  // acceleration and its parts
  if (s.showA || s.showSplit) {
    const ta = accelTip(a);
    const px = (w: Vec2) => len(w) * sc.a * view.ppm;
    // both parts only when both are visible: if one is (nearly) zero the other is a itself
    if (s.showSplit && px(sp.tangential) > 3 && px(sp.normal) > 3) {
      const tt = accelTip(sp.tangential);
      const tn = accelTip(sp.normal);
      // the dashed rectangle closes the parts onto a only when no arrow was stretched
      if (px(sp.tangential) >= MIN_ARROW && px(sp.normal) >= MIN_ARROW) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = withAlpha(p.accel, 0.5);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(tt[0], tt[1]);
        ctx.lineTo(ta[0], ta[1]);
        ctx.lineTo(tn[0], tn[1]);
        ctx.stroke();
        ctx.restore();
      }
      arrow(ctx, B[0], B[1], tt[0], tt[1], { color: withAlpha(p.accel, 0.8), width: 2.4, head: 10 });
      tag('aₜ', tt, p.accel);
      arrow(ctx, B[0], B[1], tn[0], tn[1], { color: withAlpha(p.accel, 0.8), width: 2.4, head: 10 });
      tag('a⊥', tn, p.accel);
    }
    arrow(ctx, B[0], B[1], ta[0], ta[1], { color: p.accel, width: 4, head: 14 });
    tag('a', ta, p.accel);
  }

  // the body, on top
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(B[0], B[1], 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
