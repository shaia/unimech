/**
 * Vector lab: vectors on a grid, for the toolbox lesson 0.2. Four modes:
 * - 'one':   one vector with its components and a multiple kA;
 * - 'two':   two vectors, their sum drawn head to tail and their difference A − B (from B's tip to A's);
 * - 'dot':   two vectors, the angle between them, the projection of A on B's direction and A·B;
 * - 'cross': two vectors in the page, the parallelogram they span, the turn from the first factor to the
 *            second and the product A×B, which stands out of the page (⊙) or into it (⊗).
 *
 * The tips snap to the grid, so components are whole numbers a student can read off, and 3-4-5
 * triangles come out exact. The names and units of the two vectors are props: the lesson draws forces
 * (A, B in newtons), a force and a displacement (F·d, in joules) and a position and a force (r×F, in N·m).
 * The products come from src/physics/vectors.ts.
 *
 * Tasks are checked against the reader's own moves: a state a text step produced never ticks one
 * (the step's state object is remembered and skipped, and every task also needs the reader's own drag,
 * key press or toggle since the last step).
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { add, dot, len, scale, sub, type Vec2 } from '~/physics/vec';
import { angleBetween, crossZ, depthOf, scalarProjection, signedTurn } from '~/physics/vectors';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, depthGlyph, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 13;
const WORLD_H = 9.5;
const LIM_X = 6;
const LIM_Y = 4;
const TIP_PX = 11;

export type VectorMode = 'one' | 'two' | 'dot' | 'cross';

/** k choices for kA; zero is left out so kA always has a direction to compare */
const K_STEPS = [-3, -2, -1, -0.5, 0.5, 1, 2, 3];

type Names = readonly [string, string];
type ColorKey = 'force' | 'equip' | 'velocity' | 'momentum';

/** an LTR isolate for a formula inside a Hebrew sentence (×, + and · otherwise reorder around the letters) */
const ltr = (t: string) => `\u2066${t}\u2069`;

const TASK_LABEL: Record<string, (n: Names) => string> = {
  'make-3-4': ([a]) => `גררו את קצה הווקטור ${a} כך שהרכיב האופקי שלו יהיה 3 והרכיב האנכי 4. מה הגודל שלו?`,
  'negative-k': () => 'הכפילו את הווקטור במספר שלילי. לאן מצביע הווקטור החדש?',
  'same-line': ([a, b]) => `גררו את קצה ${b} כך שיצביע בדיוק לכיוון של ${a}. כמה שווה גודל הסכום?`,
  perpendicular: ([a, b]) => `גררו את קצה ${b} כך שיהיה ניצב ל-${a}. איך מחשבים עכשיו את גודל הסכום?`,
  cancel: ([a, b]) => `סדרו את ${b} כך שהסכום ${ltr(`${a} + ${b}`)} יתאפס.`,
  'dot-obtuse': ([a, b]) => `גררו את ${b} כך שהמכפלה הסקלרית ${ltr(`${a}·${b}`)} תהיה שלילית. מה הזווית בין הווקטורים עכשיו?`,
  'dot-zero-tilted': ([a, b]) =>
    `הטו את ${a} כך שאף אחד מהרכיבים שלו לא יהיה אפס, ומצאו ${b} שונה מאפס שהמכפלה הסקלרית שלו עם ${a} אפס.`,
  'cross-into': ([a, b]) => `גררו את ${b} כך שהמכפלה ${ltr(`${a}×${b}`)} תצביע לתוך הדף.`,
  'cross-parallel': ([a, b]) => `מצאו ${b} שונה מאפס שהמכפלה ${ltr(`${a}×${b}`)} אפס. מה משותף לכל התשובות?`,
  'cross-swap': ([a, b]) => `הפכו את סדר הגורמים, ${ltr(`${b}×${a}`)} במקום ${ltr(`${a}×${b}`)}. מה קרה לגודל, ומה לכיוון?`,
};

interface State {
  a: Vec2;
  b: Vec2;
  k: number;
  showComponents: boolean;
  showSum: boolean;
  showDiff: boolean;
  showScaled: boolean;
  showProj: boolean;
  showArea: boolean;
  swap: boolean;
  selected: 'a' | 'b' | null;
}

export interface VectorLabProps {
  id: string;
  mode?: VectorMode;
  a?: [number, number];
  b?: [number, number];
  /** the names of the two vectors on the canvas and in the readout (default A, B) */
  names?: [string, string];
  /** their units (default N, N) */
  units?: [string, string];
  /** palette colours of the two vectors (default force green, equipment purple): a force is always green */
  colors?: [ColorKey, ColorKey];
  /** the unit of the product in 'dot' and 'cross' (default "<unit A>·<unit B>") */
  productUnit?: string;
  showComponents?: boolean;
  showSum?: boolean;
  showDiff?: boolean;
  showScaled?: boolean;
  showProj?: boolean;
  showArea?: boolean;
  swap?: boolean;
  tasks?: string[];
}

function initial(p: VectorLabProps): State {
  return {
    a: p.a ?? [2, 3],
    b: p.b ?? [2, -1],
    k: 1,
    showComponents: p.showComponents ?? false,
    showSum: p.showSum ?? p.mode === 'two',
    showDiff: p.showDiff ?? false,
    showScaled: p.showScaled ?? false,
    showProj: p.showProj ?? p.mode === 'dot',
    showArea: p.showArea ?? p.mode === 'cross',
    swap: p.swap ?? false,
    selected: null,
  };
}

const deg = (v: Vec2) => {
  const d = Math.round((Math.atan2(v[1], v[0]) * 180) / Math.PI);
  return d < 0 ? d + 360 : d;
};
const num = (x: number) => (Math.abs(x) < 1e-9 ? '0' : sci(x, 3).replace('-', '−'));
/** a component inside a sum: negatives in brackets, as a student writes them */
const term = (x: number) => (x < 0 ? `(${num(x)})` : num(x));
const vecText = (v: Vec2) => `(${num(v[0])}, ${num(v[1])})`;
const kLabel = (k: number) => (k === -0.5 ? '−½' : k === 0.5 ? '½' : `${k < 0 ? '−' : ''}${Math.abs(k)}`);
/** the multiple as a vector's name: −A, not −1A */
const kName = (k: number) => (k === 1 ? '' : k === -1 ? '−' : kLabel(k));
const thetaDeg = (a: Vec2, b: Vec2) => {
  const t = angleBetween(a, b);
  return Number.isNaN(t) ? '—' : `${num(Math.round((t * 180) / Math.PI))}°`;
};
const DEPTH_HE = { out: 'החוצה מהדף ⊙', in: 'לתוך הדף ⊗', none: 'אפס: אין כיוון' } as const;

export default function VectorLab(props: VectorLabProps) {
  const mode: VectorMode = props.mode ?? 'one';
  const pair = mode !== 'one';
  const [nA, nB] = props.names ?? ['A', 'B'];
  const [uA, uB] = props.units ?? ['N', 'N'];
  const uP = props.productUnit ?? (uA === uB ? `${uA}²` : `${uA}·${uB}`);
  const [s, setS] = useState<State>(() => initial(props));
  const drag = useRef<'a' | 'b' | null>(null);
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  /** the reader moved a vector, toggled the order, or used the k slider since the last step or reset */
  const userMoved = useRef(false);
  const userSwap = useRef(false);
  const userK = useRef(false);
  const [live, setLive] = useState('');
  const names: Names = [nA, nB];
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id]?.(names) ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev, selected: null };
          for (const k of ['showComponents', 'showSum', 'showDiff', 'showScaled', 'showProj', 'showArea', 'swap'] as const) {
            if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          }
          if (Array.isArray(st.a) && st.a.length === 2) next.a = [Number(st.a[0]), Number(st.a[1])];
          if (Array.isArray(st.b) && st.b.length === 2) next.b = [Number(st.b[0]), Number(st.b[1])];
          if (typeof st.k === 'number' && K_STEPS.includes(st.k)) next.k = st.k;
          stepState.current = next;
          userMoved.current = false;
          userSwap.current = false;
          userK.current = false;
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
    const [ax, ay] = s.a;
    const cz = crossZ(s.a, s.b);
    const d = dot(s.a, s.b);
    const nonzero = len(s.a) > 0 && len(s.b) > 0;
    const moved = userMoved.current;
    if (has('make-3-4') && moved && ax === 3 && ay === 4) done('make-3-4');
    if (has('negative-k') && userK.current && s.showScaled && s.k < 0) done('negative-k');
    if (has('same-line') && moved && nonzero && cz === 0 && d > 0) done('same-line');
    if (has('perpendicular') && moved && nonzero && d === 0) done('perpendicular');
    if (has('cancel') && moved && len(s.a) > 0 && len(add(s.a, s.b)) === 0) done('cancel');
    if (has('dot-obtuse') && moved && nonzero && d < 0) done('dot-obtuse');
    if (has('dot-zero-tilted') && moved && nonzero && ax !== 0 && ay !== 0 && d === 0) done('dot-zero-tilted');
    if (has('cross-into') && moved && !s.swap && cz < 0) done('cross-into');
    if (has('cross-parallel') && moved && nonzero && cz === 0) done('cross-parallel');
    if (has('cross-swap') && userSwap.current && s.swap && cz !== 0) done('cross-swap');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    grid(ctx, view, p);
    const O = toScreen(view, 0, 0);
    const at = (v: Vec2) => toScreen(view, v[0], v[1]);
    const [kA, kB] = props.colors ?? ['force', 'equip'];
    const colA = p[kA];
    const colB = p[kB];
    const colR = p.accent;

    if (mode === 'cross' && s.showArea) parallelogram(ctx, view, s.a, s.b, colR);
    if (mode === 'dot' && s.showProj) projection(ctx, view, s.a, s.b, colR, p, nA);
    if (mode === 'dot') angleArc(ctx, view, s.a, s.b, p.ink2, false, p);
    if (mode === 'cross') {
      const [f, g] = s.swap ? [s.b, s.a] : [s.a, s.b];
      angleArc(ctx, view, f, g, colR, true, p);
    }

    if (s.showComponents) {
      components(ctx, view, [0, 0], s.a, colA, p, nA);
      if (mode === 'two' && s.showSum) components(ctx, view, s.a, s.b, colB, p, nB);
    }

    if (mode === 'one' && s.showScaled) {
      const ka = scale(s.a, s.k);
      const [x, y] = at(ka);
      arrow(ctx, O[0], O[1], x, y, { color: colR, width: 7, head: 17, alpha: 0.45 });
      tag(ctx, `${kName(s.k)}${nA}`, x, y, ka, colR, p);
    }

    if (mode === 'two' && s.showSum) {
      // B again, from A's tip: the head-to-tail picture of the sum
      const [ax, ay] = at(s.a);
      const [tx, ty] = at(add(s.a, s.b));
      arrow(ctx, ax, ay, tx, ty, { color: withAlpha(colB, 0.55), width: 2.2, head: 11 });
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = withAlpha(colB, 0.35);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(...at(s.b));
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();
      const r = add(s.a, s.b);
      if (len(r) > 0) {
        arrow(ctx, O[0], O[1], tx, ty, { color: colR, width: 4, head: 15 });
        tag(ctx, `${nA}+${nB}`, tx, ty, r, colR, p);
      } else {
        ctx.save();
        ctx.strokeStyle = colR;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(O[0], O[1], 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        tagAt(ctx, `${nA}+${nB} = 0`, O[0], O[1] - 22, colR, p);
      }
    }

    if (mode === 'two' && s.showDiff) {
      // A − B: the arrow from B's tip to A's tip, because B + (A − B) = A
      const diff = sub(s.a, s.b);
      if (len(diff) > 0) {
        const [bx, by] = at(s.b);
        const [ax, ay] = at(s.a);
        arrow(ctx, bx, by, ax, ay, { color: p.hand, width: 3, head: 13 });
        const [mx, my] = [(bx + ax) / 2, (by + ay) / 2];
        const L = len(diff);
        // label beside the middle of the arrow: the screen normal of the world vector (dx, dy) is (dy, dx)
        tagAt(ctx, `${nA}−${nB}`, mx + (diff[1] / L) * 18, my + (diff[0] / L) * 18, p.hand, p);
      }
    }

    if (pair) {
      const [bx, by] = at(s.b);
      arrow(ctx, O[0], O[1], bx, by, { color: colB, width: 3, head: 13 });
      tag(ctx, nB, bx, by, s.b, colB, p);
      handle(ctx, bx, by, colB, s.selected === 'b', p);
    }

    const [ax, ay] = at(s.a);
    arrow(ctx, O[0], O[1], ax, ay, { color: colA, width: 3, head: 13 });
    tag(ctx, nA, ax, ay, s.a, colA, p);
    handle(ctx, ax, ay, colA, s.selected === 'a', p);

    if (mode === 'cross') productGlyph(ctx, view, s, colR, p, s.swap ? `${nB}×${nA}` : `${nA}×${nB}`);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, {
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    animate: false,
  });
  useEffect(invalidate, [s]);

  const snap = (x: number, y: number): Vec2 => [
    Math.max(-LIM_X, Math.min(LIM_X, Math.round(x))),
    Math.max(-LIM_Y, Math.min(LIM_Y, Math.round(y))),
  ];

  const hit = (v: View, sx: number, sy: number): 'a' | 'b' | null => {
    const near = (w: Vec2) => {
      const [x, y] = toScreen(v, w[0], w[1]);
      return Math.hypot(sx - x, sy - y) < TIP_PX + 12;
    };
    if (near(s.a)) return 'a';
    if (pair && near(s.b)) return 'b';
    return null;
  };

  const describe = (st: State) => {
    const parts = [`הווקטור ${nA} הוא ${vecText(st.a)}, בגודל ${num(len(st.a))} ${uA}.`];
    if (pair) parts.push(`${nB} הוא ${vecText(st.b)}, בגודל ${num(len(st.b))} ${uB}.`);
    if (mode === 'two') parts.push(`הסכום הוא ${vecText(add(st.a, st.b))}, בגודל ${num(len(add(st.a, st.b)))}.`);
    if (mode === 'two' && st.showDiff) parts.push(`ההפרש ${nA} פחות ${nB} הוא ${vecText(sub(st.a, st.b))}.`);
    if (mode === 'one' && st.showScaled) parts.push(`${kLabel(st.k)} כפול ${nA} הוא ${vecText(scale(st.a, st.k))}.`);
    if (mode === 'dot') parts.push(`המכפלה הסקלרית היא ${num(dot(st.a, st.b))} ${uP}, והזווית ביניהם ${thetaDeg(st.a, st.b)}.`);
    if (mode === 'cross') {
      const z = st.swap ? -crossZ(st.a, st.b) : crossZ(st.a, st.b);
      parts.push(`רכיב z של המכפלה הווקטורית הוא ${num(z)} ${uP}, ${DEPTH_HE[depthOf(z)]}.`);
    }
    return parts.join(' ');
  };

  const move = (which: 'a' | 'b', w: Vec2) => {
    userMoved.current = true;
    setS((prev) => ({ ...prev, [which]: w }));
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const h = hit(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, selected: h }));
    if (!h) return;
    drag.current = h;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [x, y] = toWorld(v, e.offsetX, e.offsetY);
    const w = snap(x, y);
    if (w[0] !== s[d][0] || w[1] !== s[d][1]) move(d, w);
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const order: ('a' | 'b')[] = pair ? ['a', 'b'] : ['a'];
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const i = order.indexOf(s.selected ?? order[order.length - 1]);
      const next = order[(i + 1) % order.length];
      setS((prev) => ({ ...prev, selected: next }));
      setLive(`נבחר הווקטור ${next === 'a' ? nA : nB}.`);
      return;
    }
    const dirs: Record<string, Vec2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const sel = s.selected ?? 'a';
    userMoved.current = true;
    setS((prev) => {
      const next = { ...prev, selected: sel, [sel]: snap(prev[sel][0] + d[0], prev[sel][1] + d[1]) };
      setLive(describe(next));
      return next;
    });
  };

  const reset = () => {
    stepState.current = null;
    userMoved.current = false;
    userSwap.current = false;
    userK.current = false;
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const r = add(s.a, s.b);
  const diff = sub(s.a, s.b);
  const ka = scale(s.a, s.k);
  const d = dot(s.a, s.b);
  const cz = s.swap ? -crossZ(s.a, s.b) : crossZ(s.a, s.b);
  const [f, g] = s.swap ? [s.b, s.a] : [s.a, s.b];
  const [nf, ng] = s.swap ? [nB, nA] : [nA, nB];
  const theta = angleBetween(s.a, s.b);
  const sinT = Number.isNaN(theta) ? 0 : Math.sin(theta);
  const cosT = Number.isNaN(theta) ? 0 : Math.cos(theta);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: וקטורים על רשת, כל משבצת יחידה אחת. ${describe(s)} גררו את קצה החץ; במקלדת: רווח בוחר וקטור, חיצים מזיזים.`}
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
          <b class="q" data-readout="a">
            {nA} = {vecText(s.a)} {uA}
          </b>
          <span class="q" data-readout="a-mag">
            |{nA}| = {num(len(s.a))} {uA}
          </span>
          {mode !== 'dot' && mode !== 'cross' && (
            <span>
              זווית מציר x: <span class="q">{len(s.a) > 0 ? `${deg(s.a)}°` : '—'}</span>
            </span>
          )}
          {pair && (
            <b class="q" data-readout="b">
              {nB} = {vecText(s.b)} {uB}
            </b>
          )}
          {pair && (
            <span class="q" data-readout="b-mag">
              |{nB}| = {num(len(s.b))} {uB}
            </span>
          )}
          {mode === 'two' && s.showSum && (
            <span>
              סכום:{' '}
              <b class="q" data-readout="sum">
                {nA}+{nB} = {vecText(r)} {uA}
              </b>
            </span>
          )}
          {mode === 'two' && s.showSum && (
            <span class="q" data-readout="sum-mag">
              |{nA}+{nB}| = {num(len(r))} {uA}
            </span>
          )}
          {mode === 'two' && s.showDiff && (
            <span>
              הפרש:{' '}
              <b class="q" data-readout="diff">
                {nA}−{nB} = {vecText(diff)} {uA}
              </b>
            </span>
          )}
          {mode === 'one' && s.showScaled && (
            <b class="q">
              {kName(s.k)}
              {nA} = {vecText(ka)} {uA}
            </b>
          )}
          {mode === 'one' && s.showScaled && (
            <span class="q">
              |{kName(s.k)}
              {nA}| = {num(len(ka))} {uA}
            </span>
          )}
          {pair && (
            <span>
              הזווית ביניהם:{' '}
              <span class="q" data-readout="theta">
                θ = {thetaDeg(s.a, s.b)}
              </span>
            </span>
          )}
          {mode === 'dot' && (
            <b class="q" data-readout="dot">
              {nA}·{nB} = {term(s.a[0])}·{term(s.b[0])} + {term(s.a[1])}·{term(s.b[1])} = {num(d)} {uP}
            </b>
          )}
          {mode === 'dot' && (
            <span class="q" data-readout="dot-cos">
              |{nA}||{nB}|cos θ = {num(len(s.a) * len(s.b) * cosT)} {uP}
            </span>
          )}
          {mode === 'dot' && len(s.b) > 0 && (
            <span>
              ההיטל של {nA} על הכיוון של {nB}:{' '}
              <span class="q" data-readout="proj">
                {nA}∥ = {num(scalarProjection(s.a, s.b))} {uA}
              </span>
            </span>
          )}
          {mode === 'cross' && (
            <b class="q" data-readout="cross">
              ({nf}×{ng})z = {term(f[0])}·{term(g[1])} − {term(f[1])}·{term(g[0])} = {num(cz)} {uP}
            </b>
          )}
          {mode === 'cross' && (
            <span class="q" data-readout="cross-sin">
              |{nA}||{nB}|sin θ = {num(len(s.a) * len(s.b) * sinT)} {uP}
            </span>
          )}
          {mode === 'cross' && (
            <span>
              כיוון:{' '}
              <span data-readout="cross-dir">{DEPTH_HE[depthOf(cz)]}</span>
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מה להציג">
            {(mode === 'one' || mode === 'two') && (
              <Toggle label="רכיבים" on={s.showComponents} swatch={`var(--${(props.colors ?? ['force'])[0]})`} onChange={(v) => setS({ ...s, showComponents: v })} />
            )}
            {mode === 'two' && <Toggle label={<bdi dir="ltr">{`${nA}+${nB}`}</bdi>} on={s.showSum} swatch="var(--accent)" onChange={(v) => setS({ ...s, showSum: v })} />}
            {mode === 'two' && <Toggle label={<bdi dir="ltr">{`${nA}−${nB}`}</bdi>} on={s.showDiff} swatch="var(--hand)" onChange={(v) => setS({ ...s, showDiff: v })} />}
            {mode === 'one' && <Toggle label="כפל במספר" on={s.showScaled} swatch="var(--accent)" onChange={(v) => setS({ ...s, showScaled: v })} />}
            {mode === 'dot' && <Toggle label="היטל" on={s.showProj} swatch="var(--accent)" onChange={(v) => setS({ ...s, showProj: v })} />}
            {mode === 'cross' && <Toggle label="מקבילית" on={s.showArea} swatch="var(--accent)" onChange={(v) => setS({ ...s, showArea: v })} />}
            {mode === 'cross' && (
              <Toggle
                label={
                  <>
                    סדר הפוך: <bdi dir="ltr">{`${nB}×${nA}`}</bdi>
                  </>
                }
                on={s.swap}
                onChange={(v) => {
                  userSwap.current = true;
                  setS({ ...s, swap: v });
                }}
              />
            )}
          </div>
          {mode === 'one' && s.showScaled && (
            <Slider
              label="המספר k"
              min={0}
              max={K_STEPS.length - 1}
              step={1}
              value={Math.max(0, K_STEPS.indexOf(s.k))}
              format={(i) => kLabel(K_STEPS[i])}
              onChange={(i) => {
                userK.current = true;
                setS({ ...s, k: K_STEPS[i] });
              }}
            />
          )}
          <p class="hint hand">גררו את העיגול שבקצה החץ.</p>
        </>
      }
    />
  );
}

/** Grid squares of one unit, with the x and y axes through the origin. */
function grid(ctx: CanvasRenderingContext2D, v: View, p: Palette) {
  const [ox, oy] = toScreen(v, 0, 0);
  const halfW = v.w / 2 / v.ppm;
  const halfH = v.h / 2 / v.ppm;
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  for (let i = -Math.floor(halfW); i <= halfW; i++) {
    const [x] = toScreen(v, i, 0);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, v.h);
    ctx.stroke();
  }
  for (let j = -Math.floor(halfH); j <= halfH; j++) {
    const [, y] = toScreen(v, 0, j);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(v.w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.4;
  arrow(ctx, 6, oy, v.w - 6, oy, { color: p.ink3, width: 1.4, head: 9 });
  arrow(ctx, ox, v.h - 6, ox, 6, { color: p.ink3, width: 1.4, head: 9 });
  ctx.font = `italic 600 14px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('x', v.w - 8, oy + 6);
  ctx.textAlign = 'left';
  ctx.fillText('y', ox + 8, 6);
  ctx.restore();
}

/** Dashed projections of v (drawn from `from`) onto the axes, with their values. */
function components(ctx: CanvasRenderingContext2D, view: View, from: Vec2, v: Vec2, color: string, p: Palette, name: string) {
  const [x0, y0] = toScreen(view, from[0], from[1]);
  const [xe, ye] = toScreen(view, from[0] + v[0], from[1] + v[1]);
  if (v[0] !== 0) arrow(ctx, x0, y0, xe, y0, { color: withAlpha(color, 0.75), width: 2.4, head: 10 });
  if (v[1] !== 0) arrow(ctx, xe, y0, xe, ye, { color: withAlpha(color, 0.75), width: 2.4, head: 10 });
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = withAlpha(color, 0.5);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x0, ye);
  ctx.lineTo(xe, ye);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.font = `600 13px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  if (v[0] !== 0) {
    ctx.textBaseline = v[1] >= 0 ? 'top' : 'bottom';
    ctx.fillText(`${name}x = ${num(v[0])}`, (x0 + xe) / 2, y0 + (v[1] >= 0 ? 6 : -6));
  }
  if (v[1] !== 0) {
    ctx.textBaseline = 'middle';
    ctx.textAlign = v[0] >= 0 ? 'left' : 'right';
    ctx.fillText(`${name}y = ${num(v[1])}`, xe + (v[0] >= 0 ? 8 : -8), (y0 + ye) / 2);
  }
  ctx.restore();
}

/**
 * The projection of A on the direction of B: the line through O along B (dashed), the drop from A's tip
 * perpendicular to it with a right-angle mark, and the projection itself, (A·B̂)B̂, as a thick arrow.
 */
function projection(ctx: CanvasRenderingContext2D, view: View, a: Vec2, b: Vec2, color: string, p: Palette, nA: string) {
  const L = len(b);
  if (L === 0 || len(a) === 0) return;
  const u: Vec2 = [b[0] / L, b[1] / L];
  const c = dot(a, u);
  const foot: Vec2 = [u[0] * c, u[1] * c];
  const far = 20;
  ctx.save();
  ctx.setLineDash([3, 6]);
  ctx.strokeStyle = withAlpha(p.ink2, 0.55);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(...toScreen(view, -u[0] * far, -u[1] * far));
  ctx.lineTo(...toScreen(view, u[0] * far, u[1] * far));
  ctx.stroke();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = withAlpha(color, 0.8);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(...toScreen(view, a[0], a[1]));
  ctx.lineTo(...toScreen(view, foot[0], foot[1]));
  ctx.stroke();
  ctx.restore();
  const [fx, fy] = toScreen(view, foot[0], foot[1]);
  // the right angle at the foot, when the drop is long enough to show one
  const perp = sub(a, foot);
  const pl = len(perp);
  if (pl > 0.3 && Math.abs(c) > 0.3) {
    const m = 0.28;
    const w: Vec2 = [perp[0] / pl, perp[1] / pl];
    const back: Vec2 = [-Math.sign(c) * u[0], -Math.sign(c) * u[1]];
    const p1 = toScreen(view, foot[0] + back[0] * m, foot[1] + back[1] * m);
    const p2 = toScreen(view, foot[0] + (back[0] + w[0]) * m, foot[1] + (back[1] + w[1]) * m);
    const p3 = toScreen(view, foot[0] + w[0] * m, foot[1] + w[1] * m);
    ctx.save();
    ctx.strokeStyle = withAlpha(color, 0.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(...p1);
    ctx.lineTo(...p2);
    ctx.lineTo(...p3);
    ctx.stroke();
    ctx.restore();
  }
  if (Math.abs(c) > 1e-9) {
    const [ox, oy] = toScreen(view, 0, 0);
    arrow(ctx, ox, oy, fx, fy, { color, width: 6, head: 14, alpha: 0.55 });
    // the label on the far side of the line from A's tip
    const side = pl > 1e-9 ? [-perp[0] / pl, -perp[1] / pl] : [-u[1], u[0]];
    const mid = toScreen(view, foot[0] / 2 + side[0] * 0.45, foot[1] / 2 + side[1] * 0.45);
    tagAt(ctx, `${nA}∥`, mid[0], mid[1], color, p);
  }
}

/**
 * The angle from f to g at the origin. Unsigned (the dot product): the short arc, marked θ. Signed (the
 * cross product): the turn from the first factor to the second, with an arrowhead showing its sense.
 */
function angleArc(ctx: CanvasRenderingContext2D, view: View, f: Vec2, g: Vec2, color: string, signed: boolean, p: Palette) {
  if (len(f) === 0 || len(g) === 0) return;
  const turn = signedTurn(f, g);
  if (Math.abs(turn) < 1e-9) return;
  const [ox, oy] = toScreen(view, 0, 0);
  const R = signed ? 30 : 24;
  const t1 = Math.atan2(f[1], f[0]);
  const t2 = t1 + turn;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = signed ? 2.2 : 1.4;
  ctx.beginPath();
  // screen y points down: a counter-clockwise turn in the world is anticlockwise on screen too, with negated angles
  ctx.arc(ox, oy, R, -t1, -t2, turn > 0);
  ctx.stroke();
  if (signed) {
    // arrowhead at the end of the arc, along its tangent
    const ex = ox + R * Math.cos(t2);
    const ey = oy - R * Math.sin(t2);
    const sgn = Math.sign(turn);
    const tx = -Math.sin(t2) * sgn;
    const ty = -Math.cos(t2) * sgn;
    const h = 9;
    ctx.beginPath();
    ctx.moveTo(ex + tx * h * 0.4, ey + ty * h * 0.4);
    ctx.lineTo(ex - tx * h * 0.7 - ty * h * 0.5, ey - ty * h * 0.7 + tx * h * 0.5);
    ctx.lineTo(ex - tx * h * 0.7 + ty * h * 0.5, ey - ty * h * 0.7 - tx * h * 0.5);
    ctx.closePath();
    ctx.fill();
  } else {
    const mid = t1 + turn / 2;
    ctx.font = `italic 600 14px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('θ', ox + (R + 12) * Math.cos(mid), oy - (R + 12) * Math.sin(mid));
  }
  ctx.restore();
}

/** The parallelogram O, A, A + B, B, shaded: its area is |A×B|. */
function parallelogram(ctx: CanvasRenderingContext2D, view: View, a: Vec2, b: Vec2, color: string) {
  if (crossZ(a, b) === 0) return;
  const pts = [[0, 0], a, add(a, b), b].map((v) => toScreen(view, v[0], v[1]));
  ctx.save();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = withAlpha(color, 0.13);
  ctx.fill();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.restore();
}

/** The product A×B (or B×A) as ⊙ / ⊗ in the middle of the parallelogram, its size growing with |A×B|. */
function productGlyph(ctx: CanvasRenderingContext2D, view: View, s: State, color: string, p: Palette, label: string) {
  const z = s.swap ? -crossZ(s.a, s.b) : crossZ(s.a, s.b);
  const dir = depthOf(z);
  if (dir === 'none') {
    const [ox, oy] = toScreen(view, 0, 0);
    tagAt(ctx, `${label} = 0`, ox - 46, oy + 22, color, p);
    return;
  }
  const c = scale(add(s.a, s.b), 0.5);
  const [x, y] = toScreen(view, c[0], c[1]);
  const r = Math.min(26, 8 + 3 * Math.sqrt(Math.abs(z)));
  depthGlyph(ctx, x, y, r, dir, color, { fill: p.paper, width: 2.4 });
  tagAt(ctx, label, x, y + r + 13, color, p);
}

function handle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, selected: boolean, p: Palette) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, TIP_PX * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(color, 0.18);
  ctx.fill();
  ctx.lineWidth = selected ? 2.6 : 1.4;
  ctx.strokeStyle = selected ? p.ink : color;
  ctx.stroke();
  ctx.restore();
}

/** Name beside an arrow tip, pushed outward along the arrow so it clears the head. */
function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dir: Vec2, color: string, p: Palette) {
  const L = len(dir) || 1;
  // screen y grows downward; the label sits beyond the tip and a little to its left
  const ux = dir[0] / L;
  const uy = -dir[1] / L;
  tagAt(ctx, text, x + ux * 16 - uy * 10, y + uy * 16 + ux * 10, color, p);
}

function tagAt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, p: Palette) {
  ctx.save();
  ctx.font = `italic 700 15px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}
