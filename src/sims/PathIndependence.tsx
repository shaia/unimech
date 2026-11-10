/**
 * PathIndependence: is a force field conservative? (lesson 3.2)
 *
 * A force field in the plane drawn as a grid of arrows. Two paths run from A to B: path 1 is the straight segment,
 * path 2 is an arc (a quadratic Bézier) or an S (a cubic Bézier symmetric about the chord's midpoint) whose
 * sideways offset the learner sets. Together, path 1 out and path 2 back, they make a closed loop. The readouts are
 * the work along each path, the work around the loop W₁ − W₂, and (∇×F)_z at a probe point P that the learner drags.
 * For a conservative field the level curves of its potential energy U can be drawn, with F = −∇U perpendicular to
 * them, and the level curve through A dashed; for the two fields of uniform curl the readout also shows (∇×F)_z × (the signed area of the loop).
 *
 * Fields (src/physics/conservative.ts, MODEL SPECIFICATION there), positions in metres, forces in newtons:
 *   gravity  uniform gravity on 0.50 kg: F = (0, −4.9) N, U = mgy
 *   spring   isotropic spring anchored at the origin, k = 4.0 N/m: F = −k(x, y), U = ½k(x² + y²)
 *   inverse  attraction to the origin, F = −K r̂/r² with K = 2.0 N·m², U = −K/r
 *   vortex   F = k(−y, x), k = 1.5 N/m: (∇×F)_z = 2k = 3.0 N/m, no potential
 *   shear    F = k(y, 0), k = 2.0 N/m: (∇×F)_z = −k = −2.0 N/m, no potential
 *
 * Physics space: LTR, x to the right, y up; colours: force --force, potential-energy level curves --energy-p.
 *
 * Props: id (required), preset, A, B, bulge, shape, P, contours, tasks.
 * Step `set` keys: preset, A, B, bulge, shape, P, contours.
 *
 * Tasks are checked against the figure's own state, never a state a text step produced:
 *   gravity-bulge  gravity; the learner changes path 2 (offset or shape): W₂ stays equal to W₁
 *   vortex-loop    k(−y, x); the learner makes a loop with |W₁ − W₂| ≥ 3.0 J
 *   s-curve        k(−y, x); the learner picks the S with |offset| ≥ 0.80 m: W₁ = W₂ although the curl is 3.0 N/m
 *   shear-probe    k(y, 0); the learner drags P over at least 1.0 m: the curl reads −2.0 N/m everywhere
 *   contour-perp   a conservative field with the level curves shown; the learner drags P: F ⟂ the level curve
 *   same-contour   the spring with the level curves shown; the learner drags B onto A's level curve (|ΔU| ≤ 0.15 J,
 *                  2% of U(A): a pixel of dragging), at least 0.50 m from A: W₁ = W₂ ≈ 0
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import {
  arcPath,
  curlZ,
  gradient,
  inverseSquare,
  lineIntegral,
  minDistance,
  reversed,
  samplePath,
  segment,
  shear,
  signedArea,
  sPath,
  springField,
  uniformGravity,
  vortex,
  type FieldModel,
  type Path2,
} from '~/physics/conservative';
import { G } from '~/physics/constants';
import type { Vec2 } from '~/physics/vec';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { contourLines, type ContourLine } from './core/contour';
import { arrow, chevron, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type FieldPreset = 'gravity' | 'spring' | 'inverse' | 'vortex' | 'shear';
export type PathShape = 'arc' | 's';

const PRESETS: FieldPreset[] = ['gravity', 'spring', 'inverse', 'vortex', 'shear'];

/** The preset fields; the numbers are the ones the lesson text quotes. */
const MASS = 0.5;
const K_SPRING = 4;
const K_INV = 2;
const K_VORTEX = 1.5;
const K_SHEAR = 2;

interface PresetSpec {
  model: FieldModel;
  name: string;
  /** the formula, for the readout (LTR) */
  formula: string;
  /** the force at which a grid arrow reaches its full length [N] */
  Fref: number;
  /** spacing of the drawn level curves of U [J] */
  Ustep?: number;
  /** the lowest level curve drawn [J]: near a singular centre the curves crowd without end */
  Umin?: number;
  conservative: boolean;
}

const SPEC: Record<FieldPreset, PresetSpec> = {
  gravity: { model: uniformGravity(MASS, G), name: 'כובד אחיד', formula: `F = (0, −${(MASS * G).toFixed(1)}) N`, Fref: MASS * G, Ustep: 2, conservative: true },
  spring: { model: springField(K_SPRING), name: 'קפיץ', formula: 'F = −(4.0 N/m)·(x, y)', Fref: K_SPRING * 2, Ustep: 2, conservative: true },
  inverse: { model: inverseSquare(K_INV), name: 'משיכה 1/r²', formula: 'F = −(2.0 N·m²)·r̂/r²', Fref: K_INV / 0.8, Ustep: 0.5, Umin: -4.3, conservative: true },
  vortex: { model: vortex(K_VORTEX), name: 'k(−y, x)', formula: 'F = (1.5 N/m)·(−y, x)', Fref: K_VORTEX * 2, conservative: false },
  shear: { model: shear(K_SHEAR), name: 'k(y, 0)', formula: 'F = (2.0 N/m)·(y, 0)', Fref: K_SHEAR * 2, conservative: false },
};

/** Half the side of the drawn square of the plane [m]. */
const HALF = 2.2;
/** Points stay inside this half-width [m]. */
const LIMIT = 2.05;
/** In the inverse-square field, points stay this far from the centre [m]. */
const R_MIN_POINT = 0.3;
/** A path closer than this to the centre of the inverse-square field gets no work readout [m]. */
const R_MIN_PATH = 0.12;
const BULGE_MAX = 2.4;

const DEFAULT_A: Vec2 = [-1.5, -1.2];
const DEFAULT_B: Vec2 = [1.4, -0.2];
const DEFAULT_P: Vec2 = [0.9, 1.2];

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside, so it reads left to right in Hebrew. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  'gravity-bulge': 'בכובד האחיד, שנו את ההסטה או את הצורה של מסלול 2. האם העבודה לאורכו משתנה?',
  'vortex-loop': `בשדה ${ltr('k(−y, x)')}, בנו לולאה שהעבודה סביבה לפחות ${ltr('3.0 J')} בגודלה.`,
  's-curve': `בשדה ${ltr('k(−y, x)')}, בחרו מסלול S עם הסטה של לפחות ${ltr('0.80 m')}. השוו את שתי העבודות.`,
  'shear-probe': `בשדה ${ltr('k(y, 0)')}, גררו את הנקודה P למקומות שונים (לפחות ${ltr('1.0 m')} בסך הכול). מה קורה לרוטור?`,
  'contour-perp': 'בשדה משמר עם קווי הגובה, גררו את P. מה הזווית בין הכוח לקו הגובה?',
  'same-contour': `בקפיץ עם קווי הגובה, גררו את B אל קו הגובה של A, המעגל המקווקו, במרחק ${ltr('0.50 m')} לפחות מ-A. כמה עבודה עושה הכוח?`,
};

export interface PathIndependenceProps {
  id: string;
  preset?: FieldPreset;
  A?: Vec2;
  B?: Vec2;
  bulge?: number;
  shape?: PathShape;
  P?: Vec2;
  contours?: boolean;
  tasks?: string[];
}

interface State {
  preset: FieldPreset;
  A: Vec2;
  B: Vec2;
  bulge: number;
  shape: PathShape;
  P: Vec2;
  contours: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/** Two decimals, a true minus sign, and never "−0.00". */
const fmt = (x: number, d = 2) => (Math.abs(x) < 0.5 * 10 ** -d ? (0).toFixed(d) : x.toFixed(d)).replace('-', '−');
const isVec = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number');

/** Keep a point inside the drawn square and, in the inverse-square field, away from the centre. */
function place(preset: FieldPreset, p: Vec2): Vec2 {
  let x = clamp(p[0], -LIMIT, LIMIT);
  let y = clamp(p[1], -LIMIT, LIMIT);
  if (preset === 'inverse') {
    const r = Math.hypot(x, y);
    if (r < R_MIN_POINT) {
      const ux = r > 1e-9 ? x / r : 1;
      const uy = r > 1e-9 ? y / r : 0;
      x = ux * R_MIN_POINT;
      y = uy * R_MIN_POINT;
    }
  }
  return [x, y];
}

function initial(p: PathIndependenceProps): State {
  const preset = p.preset && PRESETS.includes(p.preset) ? p.preset : 'gravity';
  return {
    preset,
    A: place(preset, p.A ?? DEFAULT_A),
    B: place(preset, p.B ?? DEFAULT_B),
    bulge: clamp(p.bulge ?? 1.6, -BULGE_MAX, BULGE_MAX),
    shape: p.shape ?? 'arc',
    P: place(preset, p.P ?? DEFAULT_P),
    contours: p.contours ?? false,
  };
}

/* ---------------------------------------------------------------- the numbers */

interface Numbers {
  path1: Path2;
  path2: Path2;
  /** the work along each path, or NaN when the path runs through the singular centre */
  W1: number;
  W2: number;
  loop: number;
  area: number;
  curlP: number;
  FP: Vec2;
  /** U(A) − U(B), for a conservative field */
  dropU?: number;
  /** the angle between F and the level curve of U at P [deg] */
  angleP?: number;
  /** U(B) − U(A) in units of the drawn level spacing, for the same-contour task */
  UA?: number;
  UB?: number;
}

function compute(s: State): Numbers {
  const { model } = SPEC[s.preset];
  const path1 = segment(s.A, s.B);
  const path2 = s.shape === 'arc' ? arcPath(s.A, s.B, s.bulge) : sPath(s.A, s.B, s.bulge);
  const ok = (p: Path2) => !model.singular || minDistance(p, model.singular, 600) >= R_MIN_PATH;
  const n = model.singular ? 2000 : 400;
  const W1 = ok(path1) ? lineIntegral(model.F, path1, n) : Number.NaN;
  const W2 = ok(path2) ? lineIntegral(model.F, path2, n) : Number.NaN;
  const loopPts = [...samplePath(path1, 60), ...samplePath(reversed(path2), 300)];
  const out: Numbers = {
    path1,
    path2,
    W1,
    W2,
    loop: W1 - W2,
    area: signedArea(loopPts),
    curlP: curlZ(model.F, s.P[0], s.P[1]),
    FP: model.F(s.P[0], s.P[1]),
  };
  if (model.U) {
    const U = model.U;
    out.UA = U(...s.A);
    out.UB = U(...s.B);
    out.dropU = out.UA - out.UB;
    const g = gradient(U, s.P[0], s.P[1]);
    const t: Vec2 = [-g[1], g[0]];
    const f = out.FP;
    const c = Math.abs(f[0] * t[0] + f[1] * t[1]) / (Math.hypot(...f) * Math.hypot(...t) || 1);
    out.angleP = (Math.acos(clamp(c, 0, 1)) * 180) / Math.PI;
  }
  return out;
}

/* ---------------------------------------------------------------- the component */

type Handle = 'A' | 'B' | 'P';

export default function PathIndependence(props: PathIndependenceProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  /** what the learner has changed since the last step, reset or field change */
  const user = useRef({ path2: false, probeTravel: 0, movedB: false, movedP: false });
  const drag = useRef<Handle | null>(null);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const spec = SPEC[s.preset];

  const resetUser = () => {
    user.current = { path2: false, probeTravel: 0, movedB: false, movedP: false };
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const preset = typeof step.preset === 'string' && (PRESETS as string[]).includes(step.preset) ? (step.preset as FieldPreset) : prev.preset;
          const next: State = {
            preset,
            A: place(preset, isVec(step.A) ? step.A : prev.A),
            B: place(preset, isVec(step.B) ? step.B : prev.B),
            bulge: typeof step.bulge === 'number' ? clamp(step.bulge, -BULGE_MAX, BULGE_MAX) : prev.bulge,
            shape: step.shape === 'arc' || step.shape === 's' ? step.shape : prev.shape,
            P: place(preset, isVec(step.P) ? step.P : prev.P),
            contours: typeof step.contours === 'boolean' ? step.contours : prev.contours,
          };
          stepState.current = next;
          resetUser();
          return next;
        });
      }),
    [props.id],
  );

  const num = useMemo(() => compute(s), [s]);

  const levels = useMemo<ContourLine[]>(() => {
    const sp = SPEC[s.preset];
    if (!sp.model.U || !sp.Ustep) return [];
    const U = sp.model.U;
    const Uf = (x: number, y: number) => {
      const u = U(x, y);
      return Number.isFinite(u) ? u : Number.NaN;
    };
    return contourLines(Uf, { xmin: -HALF, xmax: HALF, ymin: -HALF, ymax: HALF }, {
      nx: 110,
      ny: 110,
      step: sp.Ustep,
      offset: 0.5,
      mask: sp.model.singular ? (x, y) => Math.hypot(x - sp.model.singular![0], y - sp.model.singular![1]) < 0.16 : undefined,
      maxLevelsPerCell: 4,
    }).filter((c) => sp.Umin === undefined || (c.k + 0.5) * sp.Ustep! >= sp.Umin);
  }, [s.preset]);

  // tasks: checked against the figure's own state, never against a state a text step produced
  useEffect(() => {
    if (s === stepState.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const u = user.current;
    if (has('gravity-bulge') && s.preset === 'gravity' && u.path2) done('gravity-bulge');
    if (has('vortex-loop') && s.preset === 'vortex' && (u.path2 || u.movedB) && Math.abs(num.loop) >= 3) done('vortex-loop');
    if (has('s-curve') && s.preset === 'vortex' && u.path2 && s.shape === 's' && Math.abs(s.bulge) >= 0.8) done('s-curve');
    if (has('shear-probe') && s.preset === 'shear' && u.probeTravel >= 1) done('shear-probe');
    if (has('contour-perp') && spec.conservative && s.contours && u.movedP) done('contour-perp');
    if (
      has('same-contour') &&
      s.preset === 'spring' &&
      s.contours &&
      u.movedB &&
      num.UA !== undefined &&
      num.UB !== undefined &&
      Math.abs(num.UB - num.UA) <= 0.15 &&
      Math.hypot(s.B[0] - s.A[0], s.B[1] - s.A[1]) >= 0.5
    )
      done('same-contour');
  }, [s, num, props.id, props.tasks]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s, num)), 700);
    return () => clearTimeout(h);
  }, [s.preset, s.shape, s.contours, Math.round(s.bulge * 5), Math.round(num.W1 * 10), Math.round(num.W2 * 10), Math.round(num.curlP * 10)]);

  // the level curve through A, drawn dashed: B dragged onto it gets zero work
  const levelA = useMemo<ContourLine[]>(() => {
    const sp = SPEC[s.preset];
    if (!s.contours || !sp.model.U) return [];
    const U = sp.model.U;
    const uA = U(...s.A);
    const off = uA - Math.floor(uA);
    // a grid node on a singular centre gives U = −∞, which would send the contour loop over endless levels
    const Uf = (x: number, y: number) => {
      const u = U(x, y);
      return Number.isFinite(u) ? u : Number.NaN;
    };
    return contourLines(Uf, { xmin: -HALF, xmax: HALF, ymin: -HALF, ymax: HALF }, { nx: 110, ny: 110, step: 1, offset: off, maxLevelsPerCell: 4 }).filter(
      (c) => Math.abs(c.k + off - uA) < 1e-9,
    );
  }, [s.preset, s.contours, s.A[0], s.A[1]]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, s, num, levels, levelA);
  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 2 * HALF, worldHeight: 2 * HALF, animate: false });
  useEffect(invalidate, [s, num, levels, levelA]);

  /* --- interaction */

  const moveHandle = (h: Handle, w: Vec2) => {
    setS((prev) => {
      const pt = place(prev.preset, w);
      if (h === 'P') {
        user.current.probeTravel += Math.hypot(pt[0] - prev.P[0], pt[1] - prev.P[1]);
        user.current.movedP = true;
        return { ...prev, P: pt };
      }
      if (h === 'B') user.current.movedB = true;
      else user.current.path2 = true;
      return h === 'A' ? { ...prev, A: pt } : { ...prev, B: pt };
    });
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
    const hit = (pt: Vec2) => Math.hypot(pt[0] - w[0], pt[1] - w[1]) * v.ppm;
    const order: [Handle, number][] = [
      ['P', hit(s.P)],
      ['B', hit(s.B)],
      ['A', hit(s.A)],
    ];
    order.sort((a, b) => a[1] - b[1]);
    if (order[0][1] > 26) return;
    drag.current = order[0][0];
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const w = worldOf(e);
    if (w) moveHandle(drag.current, w);
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const d = 0.1;
    const m: Record<string, Vec2> = { ArrowRight: [d, 0], ArrowLeft: [-d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
    const dv = m[e.key];
    if (!dv) return;
    moveHandle('P', [s.P[0] + dv[0], s.P[1] + dv[1]]);
    e.preventDefault();
  };
  const reset = () => {
    stepState.current = null;
    resetUser();
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const W = (x: number) => (Number.isNaN(x) ? '—' : `${fmt(x)} J`);
  const nearCentre = Number.isNaN(num.W1) || Number.isNaN(num.W2);

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: שדה כוח במישור, שני מסלולים מ-A ל-B והלולאה שהם סוגרים, והרוטור בנקודה P. ${describe(s, num)} גררו את A, את B ואת P, או הזיזו את P בחצים במקלדת.`}
      canvasRef={canvasRef}
      aspect={1}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current ? 'grabbing' : 'grab'}
      readout={
        <>
          <span class="q" data-readout="formula">{spec.formula}</span>
          <span data-readout="W1">
            מסלול 1 (ישר): <b class="q">W₁ = {W(num.W1)}</b>
          </span>
          <span data-readout="W2">
            מסלול 2: <b class="q">W₂ = {W(num.W2)}</b>
          </span>
          <span data-readout="loop">
            הלולאה, 1 הלוך ו-2 חזרה: <b class="q">∮F·dr = W₁ − W₂ = {W(num.loop)}</b>
          </span>
          <span data-readout="curl">
            הרוטור ב-P: <b class="q">(∇×F)<sub>z</sub> = {fmt(num.curlP)} N/m</b>
          </span>
          {num.dropU !== undefined && (
            <span data-readout="dropU">
              ירידת האנרגיה הפוטנציאלית: <b class="q">U(A) − U(B) = {fmt(num.dropU)} J</b>
            </span>
          )}
          {!spec.conservative && (
            <>
              <span data-readout="area">
                שטח הלולאה, עם סימן: <b class="q">S = {fmt(num.area)} m²</b>
              </span>
              <span data-readout="stokes">
                הרוטור כפול השטח: <b class="q">(∇×F)<sub>z</sub>·S = {fmt(num.curlP * num.area)} J</b>
              </span>
            </>
          )}
          {s.contours && num.angleP !== undefined && (
            <span data-readout="angle">
              הזווית בין F לקו הגובה ב-P: <b class="q">{num.angleP.toFixed(1)}°</b>
            </span>
          )}
          {nearCentre && <span data-readout="singular">מסלול עובר קרוב מדי למרכז, שם הכוח אינסופי: אין לו ערך עבודה.</span>}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="השדה">
            {PRESETS.map((id) => (
              <Toggle
                key={id}
                label={id === 'vortex' || id === 'shear' ? <bdi dir="ltr">{SPEC[id].name}</bdi> : id === 'inverse' ? <>משיכה <bdi dir="ltr">1/r²</bdi></> : SPEC[id].name}
                on={s.preset === id}
                onChange={() => {
                  resetUser();
                  setS((prev) => ({ ...prev, preset: id, A: place(id, prev.A), B: place(id, prev.B), P: place(id, prev.P) }));
                }}
              />
            ))}
          </div>
          <div class="group" role="group" aria-label="הצורה של מסלול 2">
            <Toggle
              label="מסלול 2: קשת"
              on={s.shape === 'arc'}
              onChange={() => {
                user.current.path2 = true;
                setS((prev) => ({ ...prev, shape: 'arc' }));
              }}
            />
            <Toggle
              label="מסלול 2: S"
              on={s.shape === 's'}
              onChange={() => {
                user.current.path2 = true;
                setS((prev) => ({ ...prev, shape: 's' }));
              }}
            />
            {spec.conservative && (
              <Toggle label="קווי גובה של U" on={s.contours} swatch="var(--energy-p)" onChange={(on) => setS((prev) => ({ ...prev, contours: on }))} />
            )}
          </div>
          <Slider
            label="ההסטה של מסלול 2"
            min={-BULGE_MAX}
            max={BULGE_MAX}
            step={0.05}
            value={s.bulge}
            format={(v) => `${fmt(v)} m`}
            onChange={(v) => {
              user.current.path2 = true;
              setS((prev) => ({ ...prev, bulge: v }));
            }}
          />
          <p class="hint">
            גררו את הנקודות A ו-B, ואת הנקודה P שבה נמדד הרוטור. הסטה חיובית מעקמת את מסלול 2 שמאלה מהכיוון מ-A ל-B.
          </p>
        </>
      }
    />
  );
}

function describe(s: State, n: Numbers): string {
  const sp = SPEC[s.preset];
  const w = (x: number) => (Number.isNaN(x) ? 'לא מוגדרת' : `${fmt(x)} ג'אול`);
  const kind = sp.conservative ? 'שדה משמר' : 'שדה לא משמר';
  return `${sp.name}, ${kind}. העבודה במסלול הישר ${w(n.W1)}, במסלול ${s.shape === 'arc' ? 'הקשת' : 'S'} ${w(n.W2)}, וסביב הלולאה ${w(n.loop)}. הרוטור בנקודה P הוא ${fmt(n.curlP)} ניוטון למטר.`;
}

/* ---------------------------------------------------------------- drawing */

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, n: Numbers, levels: ContourLine[], levelA: ContourLine[]) {
  const sp = SPEC[s.preset];
  const S = (q: Vec2) => toScreen(view, q[0], q[1]);
  const narrow = view.w < 480;
  const fs = narrow ? 11 : 13;

  // axes through the origin, ticks every metre
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink3, 0.55);
  ctx.lineWidth = 1;
  const [x0, y0] = S([0, 0]);
  ctx.beginPath();
  ctx.moveTo(0, y0);
  ctx.lineTo(view.w, y0);
  ctx.moveTo(x0, 0);
  ctx.lineTo(x0, view.h);
  ctx.stroke();
  ctx.font = `${fs - 1}px ${p.fontUi}`;
  ctx.fillStyle = p.ink3;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const k of [-2, -1, 1, 2]) {
    const [tx] = S([k, 0]);
    ctx.beginPath();
    ctx.moveTo(tx, y0 - 3);
    ctx.lineTo(tx, y0 + 3);
    ctx.stroke();
    ctx.fillText(String(k).replace('-', '−'), tx, y0 + 4);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const k of [-2, -1, 1, 2]) {
    const [, ty] = S([0, k]);
    ctx.beginPath();
    ctx.moveTo(x0 - 3, ty);
    ctx.lineTo(x0 + 3, ty);
    ctx.stroke();
    ctx.fillText(String(k).replace('-', '−'), x0 - 5, ty);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('x (m)', 6, y0 - 4);
  ctx.textBaseline = 'top';
  ctx.fillText('y (m)', x0 + 6, 6);
  ctx.restore();

  // level curves of U
  if (s.contours && levels.length) {
    ctx.save();
    ctx.strokeStyle = withAlpha(p.energyP, 0.75);
    ctx.lineWidth = 1.3;
    for (const c of levels) {
      ctx.beginPath();
      c.points.forEach((q, i) => {
        const [sx, sy] = S(q);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      if (c.closed) ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
  if (s.contours && levelA.length) {
    ctx.save();
    ctx.strokeStyle = p.energyP;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([7, 5]);
    for (const c of levelA) {
      ctx.beginPath();
      c.points.forEach((q, i) => {
        const [sx, sy] = S(q);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      if (c.closed) ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  // the field: a grid of arrows, length growing with |F| up to a cap, never a stub
  const spacing = 0.44;
  const Lmax = spacing * view.ppm * 0.78;
  for (let i = -5; i <= 5; i++)
    for (let j = -5; j <= 5; j++) {
      const q: Vec2 = [i * spacing, j * spacing];
      if (sp.model.singular && Math.hypot(q[0], q[1]) < 0.2) continue;
      const f = sp.model.F(q[0], q[1]);
      const m = Math.hypot(f[0], f[1]);
      if (m < 1e-9) continue;
      const L = Lmax * clamp(m / sp.Fref, 0.3, 1);
      const [sx, sy] = S(q);
      const ux = f[0] / m;
      const uy = -f[1] / m;
      arrow(ctx, sx - (ux * L) / 2, sy - (uy * L) / 2, sx + (ux * L) / 2, sy + (uy * L) / 2, {
        color: p.force,
        width: 1.4,
        head: Math.max(5, Math.min(7, L * 0.35)),
        alpha: 0.42,
      });
    }

  // the singular centre
  if (sp.model.singular) {
    const [cx, cy] = S(sp.model.singular);
    ctx.save();
    ctx.fillStyle = p.ink2;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // the loop, lightly filled; then the two paths
  const pts1 = samplePath(n.path1, 2);
  const pts2 = samplePath(n.path2, 160);
  ctx.save();
  ctx.fillStyle = withAlpha(p.accent, 0.09);
  ctx.beginPath();
  [...pts1, ...pts2.slice().reverse()].forEach((q, i) => {
    const [sx, sy] = S(q);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const stroke = (pts: Vec2[], color: string, dash: number[] = []) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((q, i) => {
      const [sx, sy] = S(q);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();
    ctx.restore();
  };
  stroke(pts2, p.accent);
  stroke(pts1, p.ink);

  // direction chevrons (A → B on both paths) and the path numbers, set off to the side away from the other path
  const mark = (path: Path2, sAt: number, color: string, label: string, side: number) => {
    const a = path.r(sAt);
    const d = path.dr(sAt);
    const [sx, sy] = S(a);
    const L = Math.hypot(d[0], d[1]) || 1;
    const ux = d[0] / L;
    const uy = -d[1] / L;
    chevron(ctx, sx + ux * 6, sy + uy * 6, ux, uy, 7, color);
    ctx.save();
    ctx.font = `700 ${fs + 1}px ${p.fontUi}`;
    ctx.fillStyle = color;
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // the left normal on screen (y down) of (ux, uy) is (uy, −ux)
    const off = 15 * side;
    ctx.fillText(label, sx + uy * off, sy - ux * off);
    ctx.restore();
  };
  const side2 = s.bulge >= 0 ? 1 : -1;
  // on the S, the first lobe is on path 2's side: mark both paths there, path 1 on the other side of the chord
  mark(n.path1, s.shape === 'arc' ? 0.5 : 0.25, p.ink, '1', -side2);
  mark(n.path2, s.shape === 'arc' ? 0.5 : 0.25, p.accent, '2', side2);

  // A and B, each labelled beyond its end of the chord, where neither path runs
  const chord: Vec2 = [s.B[0] - s.A[0], s.B[1] - s.A[1]];
  const cl = Math.hypot(chord[0], chord[1]) || 1;
  const cu: Vec2 = [chord[0] / cl, -chord[1] / cl]; // on screen
  const point = (q: Vec2, label: string, color: string, dir: number) => {
    const [sx, sy] = S(q);
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = p.paper;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = `700 ${fs + 1}px ${p.fontUi}`;
    ctx.fillStyle = p.ink;
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lx = clamp(sx + dir * cu[0] * 18, 10, view.w - 10);
    const ly = clamp(sy + dir * cu[1] * 18, 10, view.h - 10);
    ctx.fillText(label, lx, ly);
    ctx.restore();
  };
  point(s.A, 'A', p.ink, -1);
  point(s.B, 'B', p.ink, 1);

  // the probe P: its force arrow, the level-curve tangent, and the sense of the curl
  const [px, py] = S(s.P);
  if (s.contours && sp.model.U) {
    const g = gradient(sp.model.U, s.P[0], s.P[1]);
    const gl = Math.hypot(g[0], g[1]) || 1;
    const tx = -g[1] / gl;
    const ty = -g[0] / gl; // screen y is down: the tangent (−g_y, g_x) becomes (−g_y, −g_x)
    ctx.save();
    ctx.strokeStyle = p.energyP;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(px - tx * 30, py - ty * 30);
    ctx.lineTo(px + tx * 30, py + ty * 30);
    ctx.stroke();
    ctx.restore();
  }
  const f = n.FP;
  const fm = Math.hypot(f[0], f[1]);
  if (fm > 1e-9) {
    const L = Math.max(42, 1.5 * Lmax * clamp(fm / sp.Fref, 0.3, 1.3));
    arrow(ctx, px, py, px + (f[0] / fm) * L, py - (f[1] / fm) * L, { color: p.force, width: 3, head: 10 });
  }
  const ref = 2 * Math.max(K_VORTEX, K_SHEAR);
  if (Math.abs(n.curlP) > 1e-4 * ref) {
    // a curved arrow around P: counterclockwise on the page for a positive curl
    const r = 17;
    const ccw = n.curlP > 0;
    const a0 = Math.PI * 0.15;
    const a1 = a0 + Math.PI * 1.45;
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    // canvas angles run clockwise on screen; a counterclockwise arc on the page runs to decreasing canvas angles
    ctx.arc(px, py, r, -a0, -a1, true);
    ctx.stroke();
    const end = ccw ? -a1 : -a0;
    const ex = px + r * Math.cos(end);
    const ey = py + r * Math.sin(end);
    // the tangent at the end, in the direction of travel
    const dir = ccw ? -1 : 1;
    const tx = -Math.sin(end) * dir;
    const ty = Math.cos(end) * dir;
    chevron(ctx, ex, ey, tx, ty, 6, p.ink2);
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = `700 ${fs + 1}px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // the label sits opposite the force arrow (and so off the level-curve tangent, which is perpendicular to it)
  const lu: Vec2 = fm > 1e-9 ? [-f[0] / fm, f[1] / fm] : [-0.7, -0.7];
  ctx.fillText('P', clamp(px + lu[0] * 30, 10, view.w - 10), clamp(py + lu[1] * 30, 10, view.h - 10));
  ctx.restore();
}
