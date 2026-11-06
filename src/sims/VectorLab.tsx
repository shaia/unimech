/**
 * Vector lab: vectors on a grid, for the toolbox lesson 0.2. One vector with its components and a
 * multiple kA (mode 'one'), or two vectors and their sum drawn head to tail (mode 'two').
 *
 * The vectors are forces in newtons, one grid square per newton, and their tips snap to the grid,
 * so components are whole numbers a student can read off, and 3-4-5 triangles come out exact.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { add, angle, dot, len, scale, type Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 13;
const WORLD_H = 9.5;
const LIM_X = 6;
const LIM_Y = 4;
const TIP_PX = 11;

export type VectorMode = 'one' | 'two';

/** k choices for kA; zero is left out so kA always has a direction to compare */
const K_STEPS = [-3, -2, -1, -0.5, 0.5, 1, 2, 3];

const TASK_LABEL: Record<string, string> = {
  'make-3-4': 'גררו את קצה הווקטור כך שהרכיב האופקי שלו יהיה 3 והרכיב האנכי 4. מה הגודל שלו?',
  'negative-k': 'הכפילו את הווקטור במספר שלילי. לאן מצביע הווקטור החדש?',
  'same-line': 'גררו את קצה B כך שיצביע בדיוק לכיוון של A. כמה שווה גודל הסכום?',
  perpendicular: 'גררו את קצה B כך שיהיה ניצב ל-A. איך מחשבים עכשיו את גודל הסכום?',
  cancel: 'סדרו את B כך שהסכום A + B יתאפס.',
};

interface State {
  a: Vec2;
  b: Vec2;
  k: number;
  showComponents: boolean;
  showSum: boolean;
  showScaled: boolean;
  selected: 'a' | 'b' | null;
}

export interface VectorLabProps {
  id: string;
  mode?: VectorMode;
  a?: [number, number];
  b?: [number, number];
  showComponents?: boolean;
  showSum?: boolean;
  showScaled?: boolean;
  tasks?: string[];
}

function initial(p: VectorLabProps): State {
  return {
    a: p.a ?? [2, 3],
    b: p.b ?? [2, -1],
    k: 1,
    showComponents: p.showComponents ?? false,
    showSum: p.showSum ?? (p.mode === 'two'),
    showScaled: p.showScaled ?? false,
    selected: null,
  };
}

const deg = (v: Vec2) => {
  const d = Math.round((angle(v) * 180) / Math.PI);
  return d < 0 ? d + 360 : d;
};
const num = (x: number) => (Math.abs(x) < 1e-9 ? '0' : sci(x, 3).replace('-', '−'));
const vecText = (v: Vec2) => `(${num(v[0])}, ${num(v[1])})`;
const kLabel = (k: number) => (k === -0.5 ? '−½' : k === 0.5 ? '½' : `${k < 0 ? '−' : ''}${Math.abs(k)}`);
/** the multiple as a vector's name: −A, not −1A */
const kName = (k: number) => (k === 1 ? '' : k === -1 ? '−' : kLabel(k));

export default function VectorLab(props: VectorLabProps) {
  const two = props.mode === 'two';
  const [s, setS] = useState<State>(() => initial(props));
  const drag = useRef<'a' | 'b' | null>(null);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          for (const k of ['showComponents', 'showSum', 'showScaled'] as const) {
            if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          }
          if (Array.isArray(st.a) && st.a.length === 2) next.a = [Number(st.a[0]), Number(st.a[1])];
          if (Array.isArray(st.b) && st.b.length === 2) next.b = [Number(st.b[0]), Number(st.b[1])];
          if (typeof st.k === 'number' && K_STEPS.includes(st.k)) next.k = st.k;
          return next;
        });
      }),
    [props.id],
  );

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const [ax, ay] = s.a;
    const cross = s.a[0] * s.b[1] - s.a[1] * s.b[0];
    const nonzero = len(s.a) > 0 && len(s.b) > 0;
    if (has('make-3-4') && ax === 3 && ay === 4) done('make-3-4');
    if (has('negative-k') && s.showScaled && s.k < 0) done('negative-k');
    if (has('same-line') && nonzero && cross === 0 && dot(s.a, s.b) > 0) done('same-line');
    if (has('perpendicular') && nonzero && dot(s.a, s.b) === 0) done('perpendicular');
    if (has('cancel') && len(s.a) > 0 && len(add(s.a, s.b)) === 0) done('cancel');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    grid(ctx, view, p);
    const O = toScreen(view, 0, 0);
    const at = (v: Vec2) => toScreen(view, v[0], v[1]);
    const colA = p.force;
    const colB = p.equip;
    const colR = p.accent;

    if (s.showComponents) components(ctx, view, [0, 0], s.a, colA, p, 'A');

    if (!two && s.showScaled) {
      const ka = scale(s.a, s.k);
      const [x, y] = at(ka);
      arrow(ctx, O[0], O[1], x, y, { color: colR, width: 7, head: 17, alpha: 0.45 });
      tag(ctx, `${kName(s.k)}A`, x, y, ka, colR, p);
    }

    if (two) {
      if (s.showSum) {
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
          tag(ctx, 'A+B', tx, ty, r, colR, p);
        } else {
          ctx.save();
          ctx.strokeStyle = colR;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(O[0], O[1], 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          tagAt(ctx, 'A+B = 0', O[0], O[1] - 22, colR, p);
        }
      }
      const [bx, by] = at(s.b);
      arrow(ctx, O[0], O[1], bx, by, { color: colB, width: 3, head: 13 });
      tag(ctx, 'B', bx, by, s.b, colB, p);
      handle(ctx, bx, by, colB, s.selected === 'b', p);
    }

    const [ax, ay] = at(s.a);
    arrow(ctx, O[0], O[1], ax, ay, { color: colA, width: 3, head: 13 });
    tag(ctx, 'A', ax, ay, s.a, colA, p);
    handle(ctx, ax, ay, colA, s.selected === 'a', p);
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
    if (two && near(s.b)) return 'b';
    return null;
  };

  const describe = (st: State) => {
    const parts = [`הווקטור A הוא ${vecText(st.a)}, בגודל ${num(len(st.a))} ניוטון.`];
    if (two) parts.push(`B הוא ${vecText(st.b)}. הסכום A ועוד B הוא ${vecText(add(st.a, st.b))}, בגודל ${num(len(add(st.a, st.b)))}.`);
    else if (st.showScaled) parts.push(`${kLabel(st.k)} כפול A הוא ${vecText(scale(st.a, st.k))}.`);
    return parts.join(' ');
  };

  const move = (which: 'a' | 'b', w: Vec2) => setS((prev) => ({ ...prev, [which]: w }));

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
    const order: ('a' | 'b')[] = two ? ['a', 'b'] : ['a'];
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const i = order.indexOf(s.selected ?? order[order.length - 1]);
      const next = order[(i + 1) % order.length];
      setS((prev) => ({ ...prev, selected: next }));
      setLive(`נבחר הווקטור ${next === 'a' ? 'A' : 'B'}.`);
      return;
    }
    const dirs: Record<string, Vec2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const sel = s.selected ?? 'a';
    setS((prev) => {
      const next = { ...prev, selected: sel, [sel]: snap(prev[sel][0] + d[0], prev[sel][1] + d[1]) };
      setLive(describe(next));
      return next;
    });
  };

  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const r = add(s.a, s.b);
  const ka = scale(s.a, s.k);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: וקטורים על רשת, כל משבצת ניוטון אחד. ${describe(s)} גררו את קצה החץ; במקלדת: רווח בוחר וקטור, חיצים מזיזים.`}
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
          <b class="q">A = {vecText(s.a)} N</b>
          <span class="q">|A| = {num(len(s.a))} N</span>
          <span>
            זווית מציר x: <span class="q">{len(s.a) > 0 ? `${deg(s.a)}°` : '—'}</span>
          </span>
          {two && <b class="q">B = {vecText(s.b)} N</b>}
          {two && <span class="q">|B| = {num(len(s.b))} N</span>}
          {two && s.showSum && (
            <span>
              סכום: <b class="q">A+B = {vecText(r)} N</b>
            </span>
          )}
          {two && s.showSum && <span class="q">|A+B| = {num(len(r))} N</span>}
          {!two && s.showScaled && (
            <b class="q">
              {kName(s.k)}A = {vecText(ka)} N
            </b>
          )}
          {!two && s.showScaled && (
            <span class="q">
              |{kName(s.k)}A| = {num(len(ka))} N
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="רכיבים של A" on={s.showComponents} swatch="var(--force)" onChange={(v) => setS({ ...s, showComponents: v })} />
            {two && <Toggle label="הסכום A+B" on={s.showSum} swatch="var(--accent)" onChange={(v) => setS({ ...s, showSum: v })} />}
            {!two && <Toggle label="כפל במספר" on={s.showScaled} swatch="var(--accent)" onChange={(v) => setS({ ...s, showScaled: v })} />}
          </div>
          {!two && s.showScaled && (
            <Slider
              label="המספר k"
              min={0}
              max={K_STEPS.length - 1}
              step={1}
              value={Math.max(0, K_STEPS.indexOf(s.k))}
              format={(i) => kLabel(K_STEPS[i])}
              onChange={(i) => setS({ ...s, k: K_STEPS[i] })}
            />
          )}
          <p class="hint hand">גררו את העיגול שבקצה החץ.</p>
        </>
      }
    />
  );
}

/** Grid squares of 1 N, with the x and y axes through the origin. */
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
