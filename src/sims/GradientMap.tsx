/**
 * GradientMap (lesson 0.7): a contour map of a scalar field f(x, y) of the plane, shaded by value, and
 * a point P the reader drags. At P: the gradient ∇f (its direction, and its length to scale), the level
 * curve through P, a direction ŝ the reader turns with the rate df/ds = ∇f·ŝ, and on request the
 * direction to the top and the path of steepest ascent from P.
 *
 * Fields (src/physics/coords.ts, FIELDS): 'ramp' a uniform slope h = 0.2x + 0.1y (m); 'bowl' the energy
 * U = ½k(x² + y²) of a particle between springs, k = 2.0 N/m (J); 'hill' an elongated hill
 * h = H exp(−x²/a² − y²/b²), H = 1.0 m, a = 2.0 m, b = 1.0 m. x and y in metres, the map is 6 m × 6 m.
 *
 * Props: id (required), preset, presets, P, alphaDeg, dir, tangent, summit, path, tasks.
 * Step `set` keys: preset, P, alphaDeg, dir, tangent, summit, path.
 *
 * Tasks (ticked only by the reader's own drags, buttons and sliders, never by a text step):
 *   perp        the reader dragged P at least 1 m in all with the level curve shown
 *   max-dir     the reader turned ŝ to within 3° of ∇f
 *   level-dir   the reader turned ŝ until |df/ds| ≤ 3% of |∇f|
 *   not-summit  on the hill, the reader dragged P to where ∇h is 25° or more off the direction to the top
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  FIELDS,
  angleBetween,
  directionalDerivative,
  gradientPath,
  levelTangent,
  unitAt,
  type FieldName,
  type Vec2,
} from '~/physics/coords';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { contourLines } from './core/contour';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const HALF = 3;
const DEG = Math.PI / 180;
const BUTTONS_W = 96;
const BUTTONS_H = 52;
/** drawn length of the gradient arrow per unit of |∇f| [m per (unit of f)/m] */
const GRAD_SCALE: Record<FieldName, number> = { ramp: 4, bowl: 0.22, hill: 1.4 };
const S_LEN = 0.8;

const PRESET_LABEL: Record<FieldName, string> = {
  ramp: 'מדרון אחיד',
  bowl: 'קערה (שני קפיצים)',
  hill: 'גבעה מוארכת',
};

const TASK_LABEL: Record<string, string> = {
  perp: 'גררו את P לכמה מקומות, כשקו הגובה דלוק. מה הזווית בין ∇f לבין קו הגובה בכל מקום?',
  'max-dir': 'סובבו את ŝ עד ש-df/ds הכי גדול. מה הקשר בין הערך הזה לבין |∇f|?',
  'level-dir': 'סובבו את ŝ עד ש-df/ds = 0. לאורך מה ŝ מצביע עכשיו?',
  'not-summit': 'בגבעה המוארכת, גררו את P למקום שבו ∇h סוטה ב-25° לפחות מהכיוון אל הפסגה.',
};

interface State {
  preset: FieldName;
  P: Vec2;
  alpha: number;
  dir: boolean;
  tangent: boolean;
  summit: boolean;
  path: boolean;
}

export interface GradientMapProps {
  id: string;
  preset?: FieldName;
  /** fields offered as buttons (default: only the starting one, no buttons) */
  presets?: FieldName[];
  P?: [number, number];
  alphaDeg?: number;
  dir?: boolean;
  tangent?: boolean;
  summit?: boolean;
  path?: boolean;
  tasks?: string[];
}

function initial(p: GradientMapProps): State {
  return {
    preset: p.preset ?? 'hill',
    P: p.P ?? [1.5, 0.6],
    alpha: (p.alphaDeg ?? 90) * DEG,
    dir: p.dir ?? false,
    tangent: p.tangent ?? true,
    summit: p.summit ?? false,
    path: p.path ?? false,
  };
}

const num = (x: number, sig = 3) => (Math.abs(x) < 5e-4 ? '0' : sci(x, sig).replace('-', '−'));
const clampP = (w: Vec2): Vec2 => [Math.max(-HALF + 0.1, Math.min(HALF - 0.1, w[0])), Math.max(-HALF + 0.1, Math.min(HALF - 0.1, w[1]))];

export default function GradientMap(props: GradientMapProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const stepState = useRef<State | null>(null);
  const user = useRef({ travel: 0, movedP: false, turned: false });
  const drag = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const spec = FIELDS[s.preset];
  const g = spec.grad(s.P[0], s.P[1]);
  const gLen = Math.hypot(g[0], g[1]);
  const sHat = unitAt(s.alpha);
  const dfds = directionalDerivative(g, sHat);
  const toTop: Vec2 | null = spec.summit ? [spec.summit[0] - s.P[0], spec.summit[1] - s.P[1]] : null;
  const offTop = toTop && gLen > 1e-9 ? angleBetween(g, toTop) / DEG : NaN;

  const levels = useMemo(
    () =>
      contourLines(spec.f, { xmin: -HALF, xmax: HALF, ymin: -HALF, ymax: HALF }, { nx: 90, ny: 90, step: spec.step, offset: 0.5, maxLevelsPerCell: 4 }),
    [s.preset],
  );
  const shade = useMemo(() => {
    const n = 40;
    const vals: number[] = [];
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const v = spec.f(-HALF + ((i + 0.5) * 2 * HALF) / n, -HALF + ((j + 0.5) * 2 * HALF) / n);
        vals.push(v);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    return { n, vals, lo, hi };
  }, [s.preset]);
  const path = useMemo(() => (s.path ? gradientPath(spec, s.P, 0.03, 400, 1, HALF) : []), [s.preset, s.path, s.P[0], s.P[1]]);

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev };
          if (typeof step.preset === 'string' && step.preset in PRESET_LABEL) next.preset = step.preset as FieldName;
          if (Array.isArray(step.P) && step.P.length === 2) next.P = [Number(step.P[0]), Number(step.P[1])];
          if (typeof step.alphaDeg === 'number') next.alpha = step.alphaDeg * DEG;
          for (const k of ['dir', 'tangent', 'summit', 'path'] as const) {
            if (typeof step[k] === 'boolean') next[k] = step[k] as boolean;
          }
          stepState.current = next;
          user.current = { travel: 0, movedP: false, turned: false };
          return next;
        });
      }),
    [props.id],
  );

  // tasks: checked against the figure's own state, never against a state a text step produced
  useEffect(() => {
    if (s === stepState.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const u = user.current;
    if (has('perp') && s.tangent && u.travel >= 1) done('perp');
    if (gLen > 1e-9 && u.turned && s.dir) {
      if (has('max-dir') && angleBetween(sHat, g) <= 3 * DEG) done('max-dir');
      if (has('level-dir') && Math.abs(dfds) <= 0.03 * gLen) done('level-dir');
    }
    if (has('not-summit') && u.movedP && s.preset === 'hill' && offTop >= 25) done('not-summit');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const at = (x: number, y: number) => toScreen(view, x, y);
    const L = (text: string, x: number, y: number, color: string) => label(ctx, text, x, y, color, p, view);
    // shading: darker where f is larger
    // cells snapped to whole pixels, edge to edge, so translucent fills neither overlap nor leave seams
    const edge = (k: number) => -HALF + (k * 2 * HALF) / shade.n;
    for (let j = 0; j < shade.n; j++) {
      const y0 = Math.round(at(0, edge(j + 1))[1]);
      const y1 = Math.round(at(0, edge(j))[1]);
      for (let i = 0; i < shade.n; i++) {
        const x0 = Math.round(at(edge(i), 0)[0]);
        const x1 = Math.round(at(edge(i + 1), 0)[0]);
        const t = (shade.vals[j * shade.n + i] - shade.lo) / (shade.hi - shade.lo || 1);
        ctx.fillStyle = withAlpha(p.accent, 0.04 + 0.2 * t);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    // level curves
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink2, 0.7);
    ctx.lineWidth = 1.1;
    for (const c of levels) {
      ctx.beginPath();
      c.points.forEach((q, i) => {
        const S = at(q[0], q[1]);
        if (i === 0) ctx.moveTo(S[0], S[1]);
        else ctx.lineTo(S[0], S[1]);
      });
      if (c.closed) ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    // axes through O, faint, with names
    const O = at(0, 0);
    arrow(ctx, 6, O[1], view.w - 8, O[1], { color: withAlpha(p.ink3, 0.8), width: 1.1, head: 7 });
    arrow(ctx, O[0], view.h - 6, O[0], 8, { color: withAlpha(p.ink3, 0.8), width: 1.1, head: 7 });
    L('x', view.w - 14, O[1] + 13, p.ink2);
    L('y', O[0] - 13, 16, p.ink2);
    for (const k of [-2, -1, 1, 2]) {
      const t = at(k, 0);
      L(`${k}`, t[0], t[1] + 12, p.ink3);
    }
    // the top
    if (spec.summit) {
      const T = at(spec.summit[0], spec.summit[1]);
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.moveTo(T[0], T[1] - 7);
      ctx.lineTo(T[0] - 6, T[1] + 5);
      ctx.lineTo(T[0] + 6, T[1] + 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const P = at(s.P[0], s.P[1]);
    // the direction to the top
    if (s.summit && spec.summit) {
      const T = at(spec.summit[0], spec.summit[1]);
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(P[0], P[1]);
      ctx.lineTo(T[0], T[1]);
      ctx.stroke();
      ctx.restore();
    }
    // the path of steepest ascent
    if (s.path && path.length > 1) {
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2.2;
      ctx.setLineDash([2, 5]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      path.forEach((q, i) => {
        const S = at(q[0], q[1]);
        if (i === 0) ctx.moveTo(S[0], S[1]);
        else ctx.lineTo(S[0], S[1]);
      });
      ctx.stroke();
      ctx.restore();
    }
    // the level curve through P: its tangent, and the right angle with ∇f
    const t = levelTangent(g);
    if (s.tangent && gLen > 1e-9) {
      const a = at(s.P[0] - 1.1 * t[0], s.P[1] - 1.1 * t[1]);
      const b = at(s.P[0] + 1.1 * t[0], s.P[1] + 1.1 * t[1]);
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.setLineDash([]);
      // the right-angle mark
      const k = 11;
      const gu: Vec2 = [g[0] / gLen, g[1] / gLen];
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(P[0] + k * t[0], P[1] - k * t[1]);
      ctx.lineTo(P[0] + k * t[0] + k * gu[0], P[1] - k * t[1] - k * gu[1]);
      ctx.lineTo(P[0] + k * gu[0], P[1] - k * gu[1]);
      ctx.stroke();
      ctx.restore();
    }
    // ŝ
    if (s.dir) {
      const E = at(s.P[0] + S_LEN * sHat[0], s.P[1] + S_LEN * sHat[1]);
      arrow(ctx, P[0], P[1], E[0], E[1], { color: p.ink, width: 2.2, head: 10 });
      L('ŝ', E[0] + 13 * sHat[0], E[1] - 13 * sHat[1], p.ink);
    }
    // ∇f at P
    if (gLen > 1e-9) {
      const k = Math.max(0.25, Math.min(1.8, gLen * GRAD_SCALE[s.preset])) / gLen;
      const E = at(s.P[0] + k * g[0], s.P[1] + k * g[1]);
      arrow(ctx, P[0], P[1], E[0], E[1], { color: p.accent, width: 3.2, head: 13 });
      L('∇f', E[0] + (14 * g[0]) / gLen, E[1] - (14 * g[1]) / gLen, p.accent);
    }
    // P
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(P[0], P[1], 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(p.ink, 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(P[0], P[1], 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    L('P', P[0] - 14, P[1] + 15, p.ink);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 2 * HALF, worldHeight: 2 * HALF, animate: false });
  useEffect(invalidate, [s, levels, shade, path]);

  const movePTo = (w: Vec2) => {
    const q = clampP(w);
    user.current.travel += Math.hypot(q[0] - s.P[0], q[1] - s.P[1]);
    user.current.movedP = true;
    setS((prev) => ({ ...prev, P: q }));
  };
  const worldOf = (e: PointerEvent): Vec2 | null => {
    const v = viewRef.current;
    const c = canvasRef.current;
    if (!v || !c) return null;
    const r = c.getBoundingClientRect();
    return toWorld(v, e.clientX - r.left, e.clientY - r.top);
  };
  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    const w = worldOf(e);
    if (!v || !w) return;
    if (Math.hypot(w[0] - s.P[0], w[1] - s.P[1]) * v.ppm > 28) return;
    drag.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const w = worldOf(e);
    if (w) movePTo(w);
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe());
    drag.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const d = 0.1;
    const m: Record<string, Vec2> = { ArrowRight: [d, 0], ArrowLeft: [-d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
    const dv = m[e.key];
    if (!dv) return;
    e.preventDefault();
    movePTo([s.P[0] + dv[0], s.P[1] + dv[1]]);
    setLive(describe());
  };
  const reset = () => {
    stepState.current = null;
    user.current = { travel: 0, movedP: false, turned: false };
    setS(initial(props));
    setLive('האיור אופס.');
  };
  const choosePreset = (preset: FieldName) => {
    user.current = { travel: 0, movedP: false, turned: false };
    setS((prev) => ({ ...prev, preset }));
    setLive(`נבחרה המפה: ${PRESET_LABEL[preset]}.`);
  };

  function describe(): string {
    return (
      `${PRESET_LABEL[s.preset]}. P = (${num(s.P[0])}, ${num(s.P[1])}) m, f = ${num(spec.f(s.P[0], s.P[1]))} ${spec.unit}. ` +
      `הגרדיאנט (${num(g[0])}, ${num(g[1])}) ${spec.gradUnit}, בגודל ${num(gLen)}, ניצב לקו הגובה.` +
      (s.dir ? ` בכיוון ŝ, df/ds = ${num(dfds)} ${spec.gradUnit}.` : '')
    );
  }

  const presets = props.presets ?? [];
  const gDeg = Math.round(((Math.atan2(g[1], g[0]) / DEG) % 360 + 360) % 360);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: מפת קווי גובה של פונקציה במישור, והגרדיאנט שלה בנקודה P. ${describe()} גררו את P, או הזיזו אותו בחצים במקלדת.`}
      canvasRef={canvasRef}
      aspect={1}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor="grab"
      readout={
        <>
          <span class="q" data-readout="P">
            P = ({num(s.P[0])}, {num(s.P[1])}) m, f = {num(spec.f(s.P[0], s.P[1]))} {spec.unit}
          </span>
          <b class="q" data-readout="grad">
            ∇f = ({num(g[0])}, {num(g[1])}) {spec.gradUnit}
          </b>
          <span class="q" data-readout="gradlen">
            |∇f| = {num(gLen)} {spec.gradUnit}, בכיוון {gDeg}°
          </span>
          {s.tangent && gLen > 1e-9 && (
            <span class="q" data-readout="perp">
              הזווית בין ∇f לקו הגובה: 90°
            </span>
          )}
          {s.dir && (
            <b class="q" data-readout="dfds">
              ŝ בכיוון {Math.round(s.alpha / DEG)}°: df/ds = {num(dfds)} {spec.gradUnit}
            </b>
          )}
          {s.summit && toTop && Number.isFinite(offTop) && (
            <span class="q" data-readout="offtop">
              הזווית בין ∇f לכיוון אל הפסגה: {Math.round(offTop)}°
            </span>
          )}
        </>
      }
      controls={
        <>
          {presets.length > 1 && (
            <div class="group" role="group" aria-label="בחירת מפה">
              {presets.map((name) => (
                <Toggle key={name} label={PRESET_LABEL[name]} on={s.preset === name} onChange={() => choosePreset(name)} />
              ))}
            </div>
          )}
          {s.dir && (
            <Slider
              label="הכיוון של ŝ"
              min={0}
              max={359}
              step={1}
              value={Math.round(s.alpha / DEG)}
              format={(v) => `${v}°`}
              onChange={(v) => {
                user.current.turned = true;
                setS((prev) => ({ ...prev, alpha: v * DEG }));
              }}
            />
          )}
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label={<><bdi dir="ltr">ŝ</bdi> ו-<bdi dir="ltr">df/ds</bdi></>} on={s.dir} swatch="var(--ink)" onChange={(on) => setS((prev) => ({ ...prev, dir: on }))} />
            <Toggle label="קו הגובה ב-P" on={s.tangent} swatch="var(--ink)" onChange={(on) => setS((prev) => ({ ...prev, tangent: on }))} />
            {spec.summit && <Toggle label="הכיוון אל הפסגה" on={s.summit} swatch="var(--ink)" onChange={(on) => setS((prev) => ({ ...prev, summit: on }))} />}
            <Toggle label="מסלול הטיפוס התלול" on={s.path} swatch="var(--accent)" onChange={(on) => setS((prev) => ({ ...prev, path: on }))} />
          </div>
        </>
      }
    />
  );
}

/** A canvas label with a paper-coloured halo, kept inside the stage and out of the buttons' corner. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, p: Palette, v: View) {
  ctx.save();
  ctx.font = `600 13px ${p.fontUi}`;
  const half = ctx.measureText(text).width / 2;
  const pad = 4;
  let cx = Math.min(Math.max(x, half + pad), v.w - half - pad);
  let cy = Math.min(Math.max(y, 9 + pad), v.h - 9 - pad);
  if (cx + half > v.w - BUTTONS_W && cy < BUTTONS_H + 9) {
    if (y < BUTTONS_H / 2 + 9) cy = BUTTONS_H + 9;
    else cx = v.w - BUTTONS_W - half - pad;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = p.paper;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
  ctx.restore();
}
