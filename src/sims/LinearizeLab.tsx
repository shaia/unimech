/**
 * Linearization lab: a table of lab measurements plotted as a graph. The student chooses what goes
 * on the horizontal axis (x, x², √x, 1/x, 1/x²) until the points fall on a straight line, then lays
 * a ruler line through them and reads its slope from two points on the line. Built for lesson 0.4;
 * the same move recurs in every lab question of the Bagrut.
 *
 * The data come from src/physics/lab.ts (seeded scatter, so the table is the same on every load),
 * and the best line is its least-squares fit. Neither the fit nor the ruler proves the law: the
 * law comes from the physics, the graph tests it.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { DATASETS, fitLine, TRANSFORMS, type DatasetId, type Transform } from '~/physics/lab';
import { relativeError } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { handNote, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Toggle, type TaskDef } from './core/SimShell';

const ASPECT = 1.45;
const HANDLE_PX = 9;
const ALL: Transform[] = ['x', 'x2', 'sqrt', 'inv', 'inv2'];

interface Axis {
  sym: string;
  unit: string;
}

const SETS: Record<DatasetId, { title: string; x: Axis; y: Axis }> = {
  spring: { title: 'קפיץ: אורך מול הכוח שמותח אותו', x: { sym: 'F', unit: 'N' }, y: { sym: 'L', unit: 'm' } },
  fall: { title: 'נפילה חופשית: גובה מול זמן', x: { sym: 't', unit: 's' }, y: { sym: 'd', unit: 'm' } },
};

const xSym = (a: Axis, t: Transform) => ({ x: a.sym, x2: `${a.sym}²`, sqrt: `√${a.sym}`, inv: `1/${a.sym}`, inv2: `1/${a.sym}²` })[t];
const xUnit = (a: Axis, t: Transform) => ({ x: a.unit, x2: `${a.unit}²`, sqrt: `√${a.unit}`, inv: `1/${a.unit}`, inv2: `1/${a.unit}²` })[t];
/** units of Δy/Δx */
const slopeUnit = (y: Axis, a: Axis, t: Transform) => {
  const u = y.unit || '1';
  return ({ x: `${u}/${a.unit}`, x2: `${u}/${a.unit}²`, sqrt: `${u}/√${a.unit}`, inv: y.unit ? `${u}·${a.unit}` : a.unit, inv2: y.unit ? `${u}·${a.unit}²` : `${a.unit}²` })[t];
};
/** an axis title, "V (V)", or just the symbol for a quantity without a unit */
const axisTitle = (sym: string, unit: string) => (unit ? `${sym} (${unit})` : sym);

const TASK_LABEL: Record<string, string> = {
  'ruler-slope': 'הניחו את הסרגל (הקו הכחול) כך שיעבור קרוב ככל האפשר לכל הנקודות: גררו את שתי הנקודות שעליו.',
  'linearize-fall': 'בנפילה החופשית: מצאו מה לשים על הציר האופקי כדי שהנקודות יסתדרו על קו ישר.',
};

interface State {
  set: DatasetId;
  t: Transform;
  showFit: boolean;
  showRuler: boolean;
  /** ruler handles in plot fractions [0,1]², so they survive a change of axes */
  h: [[number, number], [number, number]];
  selected: 0 | 1 | null;
}

export interface LinearizeLabProps {
  id: string;
  dataset?: DatasetId;
  /** datasets offered as chips (default: only `dataset`) */
  datasets?: DatasetId[];
  transform?: Transform;
  /** offer the axis choice (off for a plain "read the slope" figure) */
  choose?: boolean;
  showFit?: boolean;
  showRuler?: boolean;
  /** also read where the ruler meets the vertical axis (a line whose intercept is the answer) */
  rulerIntercept?: boolean;
  tasks?: string[];
}

function initial(p: LinearizeLabProps): State {
  return {
    set: p.dataset ?? 'spring',
    t: p.transform ?? 'x',
    showFit: p.showFit ?? false,
    showRuler: p.showRuler ?? false,
    h: [
      [0.12, 0.3],
      [0.88, 0.62],
    ],
    selected: null,
  };
}

/** 1, 2 or 5 times a power of ten, at least `raw` */
function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** the data on the chosen axes, and axis ranges rounded up to whole ticks */
function ranges(s: State) {
  const d = DATASETS[s.set];
  const X = d.x.map(TRANSFORMS[s.t]);
  const xStep = niceStep((Math.max(...X) * 1.05) / 5);
  const yStep = niceStep((Math.max(...d.y) * 1.05) / 5);
  return {
    X,
    Y: d.y,
    xStep,
    yStep,
    xmax: Math.ceil((Math.max(...X) * 1.05) / xStep) * xStep,
    ymax: Math.ceil((Math.max(...d.y) * 1.05) / yStep) * yStep,
  };
}

function plotFrame(v: View, s: State) {
  const r = ranges(s);
  const narrow = v.w < 480;
  const left = narrow ? 50 : 62;
  const right = 16;
  const top = 30;
  const bottom = narrow ? 40 : 44;
  const pw = v.w - left - right;
  const ph = v.h - top - bottom;
  return {
    ...r,
    left,
    top,
    pw,
    ph,
    narrow,
    sx: (x: number) => left + (x / r.xmax) * pw,
    sy: (y: number) => top + ph - (y / r.ymax) * ph,
  };
}

/** a tick label without floating-point noise: 0.15000000000000002 → "0.15" */
const tickText = (v: number) => (v === 0 ? '0' : sci(Number(v.toPrecision(6)), 3));

export default function LinearizeLab(props: LinearizeLabProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const drag = useRef<0 | 1 | null>(null);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const offered = props.datasets ?? [s.set];

  useEffect(
    () =>
      subscribeSteps(props.id, (st) =>
        setS((prev) => {
          const next = { ...prev };
          // a new experiment starts on its raw axis, as the chip does: a step never solves the task for the student
          if (typeof st.dataset === 'string' && st.dataset in DATASETS && st.dataset !== prev.set) {
            next.set = st.dataset as DatasetId;
            next.t = 'x';
          }
          if (typeof st.transform === 'string' && ALL.includes(st.transform as Transform)) next.t = st.transform as Transform;
          if (typeof st.showFit === 'boolean') next.showFit = st.showFit;
          if (typeof st.showRuler === 'boolean') next.showRuler = st.showRuler;
          return next;
        }),
      ),
    [props.id],
  );

  const d = DATASETS[s.set];
  const meta = SETS[s.set];
  const usable = (t: Transform) => !(t === 'inv' || t === 'inv2') || d.x.every((x) => x !== 0);
  const X = d.x.map(TRANSFORMS[s.t]);
  const fit = fitLine(X, d.y);
  const straight = s.t === d.linear;

  // the ruler line in data units, from its two handles
  const ruler = (() => {
    const { xmax, ymax } = ranges(s);
    const p1: [number, number] = [s.h[0][0] * xmax, s.h[0][1] * ymax];
    const p2: [number, number] = [s.h[1][0] * xmax, s.h[1][1] * ymax];
    const slope = (p2[1] - p1[1]) / (p2[0] - p1[0]);
    return { p1, p2, slope, intercept: p1[1] - slope * p1[0], ymax };
  })();

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (has('linearize-fall') && s.set === 'fall' && s.t === 'x2') done('linearize-fall');
    if (
      has('ruler-slope') &&
      s.showRuler &&
      straight &&
      relativeError(ruler.slope, fit.slope) < 0.05 &&
      Math.abs(ruler.intercept - fit.intercept) < 0.04 * ruler.ymax
    ) {
      done('ruler-slope');
    }
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const f = plotFrame(view, s);
    axes(ctx, f, p, xSym(meta.x, s.t), xUnit(meta.x, s.t), meta.y);

    ctx.save();
    ctx.beginPath();
    ctx.rect(f.left, f.top, f.pw, f.ph);
    ctx.clip();
    if (s.showFit) {
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(f.sx(0), f.sy(fit.intercept));
      ctx.lineTo(f.sx(f.xmax), f.sy(fit.intercept + fit.slope * f.xmax));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (s.showRuler) {
      const { p1, p2, slope, intercept } = ruler;
      ctx.strokeStyle = p.hand;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(f.sx(0), f.sy(intercept));
      ctx.lineTo(f.sx(f.xmax), f.sy(intercept + slope * f.xmax));
      ctx.stroke();
      // the slope triangle between the two handles: Δy over Δx, read on the line
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = withAlpha(p.hand, 0.6);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(f.sx(p1[0]), f.sy(p1[1]));
      ctx.lineTo(f.sx(p2[0]), f.sy(p1[1]));
      ctx.lineTo(f.sx(p2[0]), f.sy(p2[1]));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // the measurements
    ctx.save();
    for (let i = 0; i < f.X.length; i++) {
      ctx.beginPath();
      ctx.arc(f.sx(f.X[i]), f.sy(f.Y[i]), 4.6, 0, Math.PI * 2);
      ctx.fillStyle = p.paper;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.ink;
      ctx.stroke();
    }
    ctx.restore();

    if (s.showRuler) {
      [ruler.p1, ruler.p2].forEach((q, i) => handle(ctx, f.sx(q[0]), f.sy(q[1]), p, s.selected === i));
      ctx.save();
      ctx.font = `600 13px ${p.fontUi}`;
      ctx.fillStyle = p.hand;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('Δx', f.sx((ruler.p1[0] + ruler.p2[0]) / 2), f.sy(ruler.p1[1]) + 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Δy', f.sx(ruler.p2[0]) + 6, f.sy((ruler.p1[1] + ruler.p2[1]) / 2));
      ctx.restore();
    }

    if (props.choose !== false) {
      // in the top margin, clear of the points (they fill any corner of the plot) and of the corner buttons
      handNote(ctx, straight ? 'הנקודות על קו ישר' : 'הנקודות מתעקמות', f.left + f.pw * 0.45, f.top - 14, p, f.narrow ? 13 : 15);
    }
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  const handleAt = (v: View, i: 0 | 1): [number, number] => {
    const f = plotFrame(v, s);
    return [f.left + s.h[i][0] * f.pw, f.top + f.ph - s.h[i][1] * f.ph];
  };

  const describe = (st: State) => {
    const ds = DATASETS[st.set];
    const ok = st.t === ds.linear;
    return `${SETS[st.set].title}. על הציר האופקי ${xSym(SETS[st.set].x, st.t)}. ${ok ? 'הנקודות על קו ישר.' : 'הנקודות על קו עקום.'}`;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v || !s.showRuler) return;
    const hit = ([0, 1] as const).find((i) => {
      const [x, y] = handleAt(v, i);
      return Math.hypot(e.offsetX - x, e.offsetY - y) < HANDLE_PX + 12;
    });
    setS((prev) => ({ ...prev, selected: hit ?? null }));
    if (hit === undefined) return;
    drag.current = hit;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const i = drag.current;
    if (!v || i === null) return;
    const f = plotFrame(v, s);
    const u = Math.max(0, Math.min(1, (e.offsetX - f.left) / f.pw));
    const w = Math.max(0, Math.min(1, (f.top + f.ph - e.offsetY) / f.ph));
    setS((prev) => {
      const h = [...prev.h] as State['h'];
      h[i] = [u, w];
      // the two points must stay apart, or the slope is undefined
      if (Math.abs(h[0][0] - h[1][0]) < 0.04) return prev;
      return { ...prev, h };
    });
  };
  const onPointerUp = () => {
    if (drag.current !== null) setLive(`השיפוע של הסרגל ${sci(ruler.slope)} ${slopeUnit(meta.y, meta.x, s.t)}.`);
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!s.showRuler) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const next = s.selected === 0 ? 1 : 0;
      setS({ ...s, selected: next });
      setLive(`נבחרה הנקודה ${next + 1} על הסרגל.`);
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const dd = dirs[e.key];
    if (!dd) return;
    e.preventDefault();
    const i = s.selected ?? 0;
    const step = e.shiftKey ? 0.05 : 0.01;
    const h = [...s.h] as State['h'];
    h[i] = [Math.max(0, Math.min(1, h[i][0] + dd[0] * step)), Math.max(0, Math.min(1, h[i][1] + dd[1] * step))];
    if (Math.abs(h[0][0] - h[1][0]) < 0.04) return;
    setS({ ...s, selected: i, h });
    setLive(`השיפוע של הסרגל ${sci(ruler.slope)} ${slopeUnit(meta.y, meta.x, s.t)}.`);
  };

  const su = slopeUnit(meta.y, meta.x, s.t);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: גרף של מדידות. ${describe(s)} ${s.showRuler ? 'גררו את שתי הנקודות של הסרגל; במקלדת: רווח בוחר נקודה, חיצים מזיזים.' : ''}`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onReset={() => setS(initial(props))}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={s.showRuler ? (drag.current !== null ? 'grabbing' : 'grab') : 'default'}
      readout={
        <>
          <span>{meta.title}</span>
          {s.showRuler && (
            <span>
              הסרגל: <b class="q">Δy/Δx = {sci(ruler.slope)} {su}</b>
            </span>
          )}
          {s.showRuler && props.rulerIntercept && (
            <span>
              הסרגל חותך את הציר האנכי בגובה <b class="q">{tickText(ruler.intercept)} {meta.y.unit}</b>
            </span>
          )}
          {/* Hebrew words stay outside the LTR quantities, and no commas between them */}
          {s.showFit && (
            <span>
              הקו המתאים ביותר: שיפוע <b class="q">{sci(fit.slope)} {su}</b>
            </span>
          )}
          {s.showFit && (
            <span>
              חיתוך <b class="q">{tickText(fit.intercept)} {meta.y.unit}</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          {offered.length > 1 && (
            <div class="group" role="group" aria-label="איזה ניסוי">
              {offered.map((k) => (
                <Toggle
                  key={k}
                  label={SETS[k].title.split(':')[0]}
                  on={s.set === k}
                  onChange={() => setS({ ...s, set: k, t: 'x', selected: null })}
                />
              ))}
            </div>
          )}
          {props.choose !== false && (
            <div class="group" role="group" aria-label="מה על הציר האופקי">
              <span class="hint">על הציר האופקי:</span>
              {ALL.filter(usable).map((t) => (
                <Toggle key={t} label={<bdi dir="ltr">{xSym(meta.x, t)}</bdi>} on={s.t === t} onChange={() => setS({ ...s, t })} />
              ))}
            </div>
          )}
          <div class="group" role="group" aria-label="קווים">
            <Toggle label="סרגל" on={s.showRuler} swatch="var(--hand)" onChange={(v) => setS({ ...s, showRuler: v })} />
            <Toggle label="הקו המתאים ביותר" on={s.showFit} swatch="var(--accent)" onChange={(v) => setS({ ...s, showFit: v })} />
          </div>
        </>
      }
    />
  );
}

function axes(
  ctx: CanvasRenderingContext2D,
  f: ReturnType<typeof plotFrame>,
  p: Palette,
  xs: string,
  xu: string,
  y: Axis,
) {
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.font = `${f.narrow ? 11 : 12}px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  for (let x = 0; x <= f.xmax + 1e-12 * f.xmax; x += f.xStep) {
    const X = f.sx(x);
    ctx.beginPath();
    ctx.moveTo(X, f.top);
    ctx.lineTo(X, f.top + f.ph);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(tickText(x), X, f.top + f.ph + 5);
  }
  for (let v = 0; v <= f.ymax + 1e-12 * f.ymax; v += f.yStep) {
    const Y = f.sy(v);
    ctx.beginPath();
    ctx.moveTo(f.left, Y);
    ctx.lineTo(f.left + f.pw, Y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(tickText(v), f.left - 6, Y);
  }
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(f.left, f.top - 8);
  ctx.lineTo(f.left, f.top + f.ph);
  ctx.lineTo(f.left + f.pw + 6, f.top + f.ph);
  ctx.stroke();
  ctx.font = `italic 600 ${f.narrow ? 12 : 14}px ${p.fontUi}`;
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(axisTitle(xs, xu), f.left + f.pw, f.top + f.ph + (f.narrow ? 36 : 40));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(axisTitle(y.sym, y.unit), f.left + 6, f.top - 10);
  ctx.restore();
}

function handle(ctx: CanvasRenderingContext2D, x: number, y: number, p: Palette, selected: boolean) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, HANDLE_PX, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(p.hand, 0.18);
  ctx.fill();
  ctx.lineWidth = selected ? 2.8 : 1.6;
  ctx.strokeStyle = selected ? p.ink : p.hand;
  ctx.stroke();
  ctx.restore();
}
