/**
 * MinkowskiLab: the Minkowski diagram of a frame S, with the axes of a moving frame S′ drawn in (lesson 9.5).
 *
 * An (x, ct) diagram of S, x to the right and ct up in ONE unit (light-seconds), so light runs at 45°. It always
 * stays square in world units: the canvas keeps one scale for both axes. Two events, A and B, are dragged with the
 * pointer (or moved with the arrow keys; Space switches between them), snapping to half a unit. A β slider sets the
 * velocity of S′ along x and draws its axes (ct′: x = β·ct, x′: ct = β·x) with ticks at the calibrated places;
 * toggles add the grid of S′, the calibration hyperbolae (ct)² − x² = ±n², the lines of simultaneity of S′ through
 * A and B (with the place each meets the ct′ axis), and the shaded light cone of A. The readout gives A and B in
 * both frames, the separation in both, s² computed from each frame's numbers (the same), its class, where B lies
 * relative to A's light cone, and the time order in both frames.
 *
 * Physics: src/physics/relativity.ts (toPrimedDiagram, gammaOf, classifyInterval) and src/physics/minkowski.ts
 * (coneRegion, orderInFrame, axisTilt, readByParallels). Drawing: src/sims/core/spacetime.ts.
 *
 * Props (Astro wrapper: <Spread fig="fig-9-5a" figure={MinkowskiLab} figureProps={{ … }}>)
 *   id      figure id (Spread passes it); steps address the figure by it; tasks are `${id}:${task}`
 *   beta    velocity of S′ / c, −0.9…0.9 (default 0)
 *   a, b    the events [x, ct] in light-seconds (defaults [0, 0] and [2, 5])
 *   grid, hyper, simul, cone   the toggles (defaults false, false, false, true)
 *   tasks   task ids to show (below)
 *
 * Step `set` keys: beta, ax, act, bx, bct, grid, hyper, simul, cone. Numbers are clamped and snapped.
 *
 * Tasks, ticked only inside the learner's own handlers (a drag, a key, the slider, a toggle), never by a step:
 *   classes        B is dragged into each of the three classes relative to A: timelike, spacelike, lightlike
 *   invariant      the learner changes β (to |β| ≥ 0.3) while A and B are distinct: s² stays the same
 *   reverse        for a pair whose order in S is not zero, the learner finds a state where S′ has the opposite order
 *   calibrate      with the hyperbolae on, the learner changes β: the unit ticks slide along the hyperbolae
 *   simultaneous   the learner makes two events that are not simultaneous in S simultaneous in S′ (β ≠ 0)
 *   same-place     the learner makes two events that are at different places in S happen at one place in S′
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { classifyInterval, gammaOf, toPrimedDiagram, type IntervalKind } from '~/physics/relativity';
import { axisTilt, coneRegion, orderInFrame, readByParallels, type DiagramPoint } from '~/physics/minkowski';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { withAlpha } from './core/ink';
import { sci } from './core/format';
import {
  drawEvent,
  drawHyperbola,
  drawLightLines,
  drawPrimedAxes,
  drawRestAxes,
  drawSimultaneityLine,
  shadeLightCone,
  worldBounds,
} from './core/spacetime';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const TASK_LABEL: Record<string, string> = {
  classes: 'גררו את B כך שהאינטרוול בינו לבין A יהיה פעם זמני, פעם מרחבי ופעם אורי.',
  invariant: 'כשיש מרחק בין A ל-B, הזיזו את פס המהירות של S′ (לפחות עד 0.3). מה קורה ל-s²?',
  reverse: 'מצאו זוג מאורעות ומהירות של S′ שבהם הסדר בזמן ב-S′ הפוך לסדר ב-S.',
  calibrate: 'הפעילו את היפרבולות הכיול ושנו את מהירות S′. איפה נמצאות השנתות של הצירים הנוטים?',
  simultaneous: 'גררו את B (או שנו את המהירות) כך ש-A ו-B יהיו בו-זמניים ב-S′, אבל לא ב-S.',
  'same-place': 'גררו את B (או שנו את המהירות) כך ש-A ו-B יקרו באותו מקום ב-S′, אבל לא ב-S.',
};

export interface MinkowskiLabProps {
  id: string;
  beta?: number;
  a?: [number, number];
  b?: [number, number];
  grid?: boolean;
  hyper?: boolean;
  simul?: boolean;
  cone?: boolean;
  tasks?: string[];
}

type Which = 'a' | 'b';

interface LabState {
  beta: number;
  a: DiagramPoint;
  b: DiagramPoint;
  grid: boolean;
  hyper: boolean;
  simul: boolean;
  cone: boolean;
  sel: Which;
}

/**
 * The world shown: x from −4.5 to 7.5, ct from −2.5 to 8.5 (light-seconds); one scale for both axes. Events stay in
 * x ≤ 6.5, ct ≤ 7.5: the top and right margins keep them and the primed-axis labels clear of the corner buttons.
 */
const X_MIN = -4.5;
const X_MAX = 7.5;
const CT_MIN = -2.5;
const CT_MAX = 8.5;
const EV_X_MAX = 6.5;
const EV_CT_MAX = 7.5;
const WORLD_W = X_MAX - X_MIN;
const WORLD_H = CT_MAX - CT_MIN;
const OX = (X_MIN + X_MAX) / 2;
const OY = (CT_MIN + CT_MAX) / 2;
const SNAP = 0.5;
const BETA_MAX = 0.9;
const HYPERBOLAE = [1, 4, 9, 16, 25, 36, 49];

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const snap = (x: number) => Math.round(x / SNAP) * SNAP;
const roundBeta = (x: number) => Math.round(clamp(x, -BETA_MAX, BETA_MAX) * 100) / 100;
/** 3 significant figures, a true minus sign, and no "−0" */
const num = (x: number) => {
  // drop floating-point noise first, so 15.75 from S′ (15.749999…) rounds like 15.75 from S
  const r = Number(x.toPrecision(10));
  return Math.abs(r) < 5e-4 ? '0' : sci(r, 3).replace('-', '−');
};
const pair = (p: readonly [number, number]) => `(${num(p[0])}, ${num(p[1])})`;
const clampPoint = (x: number, ct: number): DiagramPoint => [clamp(snap(x), X_MIN + 0.5, EV_X_MAX), clamp(snap(ct), CT_MIN + 0.5, EV_CT_MAX)];

/** First-strong isolate and pop-directional isolate: keep a Latin symbol inside a plain Hebrew string in place. */
const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);

const KIND_HE: Record<IntervalKind, string> = { timelike: 'זמני', spacelike: 'מרחבי', lightlike: 'אורי' };

function initial(p: MinkowskiLabProps): LabState {
  const a = p.a ?? [0, 0];
  const b = p.b ?? [2, 5];
  return {
    beta: roundBeta(p.beta ?? 0),
    a: clampPoint(a[0], a[1]),
    b: clampPoint(b[0], b[1]),
    grid: p.grid ?? false,
    hyper: p.hyper ?? false,
    simul: p.simul ?? false,
    cone: p.cone ?? true,
    sel: 'b',
  };
}

/** Everything the readout and the tasks need. */
function analyse(s: LabState) {
  const dx = s.b[0] - s.a[0];
  const dct = s.b[1] - s.a[1];
  const same = dx === 0 && dct === 0;
  const kind: IntervalKind | null = same ? null : classifyInterval(dct, dx, 1);
  const ap = toPrimedDiagram(s.a[0], s.a[1], s.beta);
  const bp = toPrimedDiagram(s.b[0], s.b[1], s.beta);
  const dxp = bp[0] - ap[0];
  const dctp = bp[1] - ap[1];
  const s2 = dct * dct - dx * dx;
  const s2p = dctp * dctp - dxp * dxp;
  const orderS = Math.abs(dct) < 1e-12 ? 0 : Math.sign(dct);
  const orderP = same ? 0 : orderInFrame(dct, dx, s.beta);
  const samePlaceP = !same && Math.abs(dxp) <= 1e-9 * (Math.abs(dx) + Math.abs(dct));
  return { dx, dct, same, kind, ap, bp, dxp, dctp, s2, s2p, orderS, orderP, samePlaceP, region: coneRegion(s.a, s.b) };
}

const REGION_HE: Record<ReturnType<typeof coneRegion>, string> = {
  same: 'A ו-B הם אותו מאורע',
  future: 'B בתוך חרוט האור של A, בעתיד שלו',
  past: 'B בתוך חרוט האור של A, בעבר שלו',
  'future-light': 'B על חרוט האור של A, בעתיד שלו',
  'past-light': 'B על חרוט האור של A, בעבר שלו',
  elsewhere: 'B מחוץ לחרוט האור של A: אין ביניהם קשר סיבתי',
};

/** Hebrew text with Latin symbols (A, B, S′, s²) isolated, so the bidi algorithm keeps the Hebrew word order. */
function he(text: string) {
  return text.split(/([A-Za-z][A-Za-z′²]*)/).map((part, i) => (i % 2 === 1 ? <bdi key={i}>{part}</bdi> : part));
}

const orderHe = (o: number) => (o > 0 ? 'B אחרי A' : o < 0 ? 'B לפני A' : 'בו-זמניים');

export default function MinkowskiLab(props: MinkowskiLabProps) {
  const [s, setS] = useState<LabState>(() => initial(props));
  const [live, setLive] = useState('');
  const dragging = useRef<Which | null>(null);
  const classesSeen = useRef(new Set<IntervalKind>());
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  // text steps set the state; they never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.beta === 'number') next.beta = roundBeta(st.beta);
          if (typeof st.ax === 'number' || typeof st.act === 'number')
            next.a = clampPoint(typeof st.ax === 'number' ? st.ax : prev.a[0], typeof st.act === 'number' ? st.act : prev.a[1]);
          if (typeof st.bx === 'number' || typeof st.bct === 'number')
            next.b = clampPoint(typeof st.bx === 'number' ? st.bx : prev.b[0], typeof st.bct === 'number' ? st.bct : prev.b[1]);
          for (const k of ['grid', 'hyper', 'simul', 'cone'] as const) if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          return next;
        });
      }),
    [props.id],
  );

  /** Judge the tasks for a state the learner produced (called only from the learner's handlers). */
  const judge = (next: LabState, cause: 'drag' | 'beta' | 'toggle') => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const k = analyse(next);
    if (has('classes') && cause === 'drag' && k.kind) {
      classesSeen.current.add(k.kind);
      if (classesSeen.current.size === 3) done('classes');
    }
    if (has('invariant') && cause === 'beta' && !k.same && Math.abs(next.beta) >= 0.3 - 1e-9) done('invariant');
    if (has('reverse') && k.orderS !== 0 && k.orderP !== 0 && k.orderP !== k.orderS) done('reverse');
    if (has('calibrate') && cause === 'beta' && next.hyper && Math.abs(next.beta) > 1e-9) done('calibrate');
    if (has('simultaneous') && Math.abs(next.beta) > 1e-9 && k.orderS !== 0 && k.orderP === 0) done('simultaneous');
    if (has('same-place') && Math.abs(next.beta) > 1e-9 && k.dx !== 0 && k.samePlaceP) done('same-place');
  };

  const learnerSet = (patch: Partial<LabState>, cause: 'drag' | 'beta' | 'toggle') => {
    const next = { ...s, ...patch };
    setS(next);
    judge(next, cause);
  };

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s)), 700);
    return () => clearTimeout(h);
  }, [s.beta, s.a[0], s.a[1], s.b[0], s.b[1]]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, shifted(view), p, s);
  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  const pick = (sx: number, sy: number): Which | null => {
    const v0 = viewRef.current;
    if (!v0) return null;
    const v = shifted(v0);
    let best: Which | null = null;
    let bd = 24;
    for (const w of ['b', 'a'] as const) {
      const [ex, ey] = toScreen(v, s[w][0], s[w][1]);
      const d = Math.hypot(ex - sx, ey - sy);
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    return best;
  };
  const onPointerDown = (e: PointerEvent) => {
    const w = pick(e.offsetX, e.offsetY);
    if (!w) return;
    dragging.current = w;
    setS((prev) => ({ ...prev, sel: w }));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const w = dragging.current;
    const v0 = viewRef.current;
    if (!w || !v0) return;
    const [x, ct] = toWorld(shifted(v0), e.offsetX, e.offsetY);
    const pt = clampPoint(x, ct);
    if (pt[0] === s[w][0] && pt[1] === s[w][1]) return;
    learnerSet({ [w]: pt, sel: w } as Partial<LabState>, 'drag');
  };
  const onPointerUp = () => {
    dragging.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setS((prev) => ({ ...prev, sel: prev.sel === 'a' ? 'b' : 'a' }));
      return;
    }
    const d: Record<string, [number, number]> = { ArrowLeft: [-SNAP, 0], ArrowRight: [SNAP, 0], ArrowUp: [0, SNAP], ArrowDown: [0, -SNAP] };
    const step = d[e.key];
    if (!step) return;
    e.preventDefault();
    const w = s.sel;
    learnerSet({ [w]: clampPoint(s[w][0] + step[0], s[w][1] + step[1]) } as Partial<LabState>, 'drag');
  };

  const reset = () => {
    classesSeen.current = new Set();
    setS(initial(props));
    setLive('האיור חזר למצב ההתחלה.');
  };

  const k = analyse(s);
  const g = gammaOf(s.beta);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: דיאגרמת מינקובסקי של מערכת S, עם הצירים של מערכת S′. גררו את המאורעות A ו-B, או הזיזו את הנבחר בחצים; רווח מחליף ביניהם. ${describe(s)}`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={dragging.current ? 'grabbing' : 'grab'}
      readout={
        <>
          <span data-readout="beta">
            {he('מערכת S′:')} <b class="q" dir="ltr">β = {num(s.beta)}, γ = {num(g)}, α = {num((axisTilt(s.beta) * 180) / Math.PI)}°</b>
          </span>
          <span data-readout="a">
            {he('מאורע A:')} <b class="q" dir="ltr">(x, ct) = {pair(s.a)}; (x′, ct′) = {pair(k.ap)}</b>
          </span>
          <span data-readout="b">
            {he('מאורע B:')} <b class="q" dir="ltr">(x, ct) = {pair(s.b)}; (x′, ct′) = {pair(k.bp)}</b>
          </span>
          <span data-readout="sep-s">
            {he('ההפרשים ב-S:')} <b class="q" dir="ltr">Δx = {num(k.dx)}, cΔt = {num(k.dct)}</b>
          </span>
          <span data-readout="sep-p">
            {he('ההפרשים ב-S′:')} <b class="q" dir="ltr">Δx′ = {num(k.dxp)}, cΔt′ = {num(k.dctp)}</b>
          </span>
          <span data-readout="s2">
            {he('s² מהמספרים של S:')} <b class="q" dir="ltr">{num(k.s2)}</b>
          </span>
          <span data-readout="s2p">
            {he('s² מהמספרים של S′:')} <b class="q" dir="ltr">{num(k.s2p)}</b>
          </span>
          <span data-readout="kind">
            האינטרוול: <b>{k.kind ? KIND_HE[k.kind] : '—'}</b>
          </span>
          <span data-readout="cone">
            <b>{he(REGION_HE[k.region])}</b>
          </span>
          <span data-readout="order">
            {he(`ב-S: ${orderHe(k.orderS)}; ב-S′:`)} <b>{he(orderHe(k.orderP))}</b>
          </span>
        </>
      }
      controls={
        <>
          <Slider
            label={`המהירות של ${FSI}S′${PDI} ביחס ל-${FSI}S${PDI}`}
            min={-BETA_MAX}
            max={BETA_MAX}
            step={0.05}
            value={s.beta}
            format={(v) => `${num(v)}c`}
            onChange={(v) => learnerSet({ beta: roundBeta(v) }, 'beta')}
          />
          <div class="group" role="group" aria-label="מה לצייר">
            <Toggle label={he('חרוט האור של A')} on={s.cone} onChange={(on) => learnerSet({ cone: on }, 'toggle')} />
            <Toggle label={he('רשת של S′')} on={s.grid} onChange={(on) => learnerSet({ grid: on }, 'toggle')} />
            <Toggle label="היפרבולות כיול" on={s.hyper} onChange={(on) => learnerSet({ hyper: on }, 'toggle')} />
            <Toggle label={he('קווי בו-זמניות של S′')} on={s.simul} onChange={(on) => learnerSet({ simul: on }, 'toggle')} />
          </div>
        </>
      }
    />
  );
}

/** The view centred on the shown world (the canvas hook centres it on the origin). */
const shifted = (v: View): View => ({ ...v, ox: OX, oy: OY });

function describe(s: LabState): string {
  const k = analyse(s);
  const kind = k.kind ? `האינטרוול ${KIND_HE[k.kind]}, s בריבוע שווה ${num(k.s2)}` : 'שני המאורעות באותה נקודה';
  return `מערכת S′ נעה במהירות ${num(s.beta)} c. המאורע A ב-x ${num(s.a[0])}, ct ${num(s.a[1])}; המאורע B ב-x ${num(s.b[0])}, ct ${num(s.b[1])}, בשניות אור. ${kind}. ב-S′: ${orderHe(k.orderP)}.`;
}

function axisNumbers(ctx: CanvasRenderingContext2D, v: View, p: Palette) {
  const [xa, xb, ya, yb] = worldBounds(v);
  const size = v.ppm < 34 ? 10 : 11;
  ctx.save();
  ctx.font = `500 ${size}px ${p.fontUi}`;
  ctx.direction = 'ltr';
  ctx.fillStyle = p.ink3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const [, oy] = toScreen(v, 0, 0);
  for (let x = Math.ceil(xa); x <= xb - 0.6; x++) {
    if (x === 0) continue;
    const [sx] = toScreen(v, x, 0);
    ctx.fillText(String(x).replace('-', '−'), sx, oy + 6);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const [ox] = toScreen(v, 0, 0);
  for (let y = Math.ceil(ya); y <= yb - 0.8; y++) {
    if (y === 0) continue;
    const [, sy] = toScreen(v, 0, y);
    ctx.fillText(String(y).replace('-', '−'), ox - 7, sy);
  }
  ctx.restore();
}

/**
 * Label a primed axis (direction (dx, dct) from the origin, into the upper half) inside the canvas: 46 px back from
 * where the axis leaves the view, 13 px to one side (side +1: to the right of the direction of travel), and never in
 * the top-right corner that holds the reset and fullscreen buttons.
 */
function primedLabel(ctx: CanvasRenderingContext2D, v: View, p: Palette, text: string, dx: number, dct: number, side: 1 | -1) {
  const [xa, xb, ya, yb] = worldBounds(v);
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (xb - 0) / dx);
  if (dx < 0) t = Math.min(t, (xa - 0) / dx);
  if (dct > 0) t = Math.min(t, (yb - 0) / dct);
  if (dct < 0) t = Math.min(t, (ya - 0) / dct);
  if (!Number.isFinite(t)) return;
  const [ex, ey] = toScreen(v, dx * t, dct * t);
  const [ox, oy] = toScreen(v, 0, 0);
  const L = Math.hypot(ex - ox, ey - oy);
  if (L < 60) return;
  const ux = (ex - ox) / L;
  const uy = (ey - oy) / L;
  let back = 46;
  const at = (b: number): [number, number] => [ex - ux * b - uy * 13 * side, ey - uy * b + ux * 13 * side];
  let [lx, ly] = at(back);
  while (ly < 44 && lx > v.w - 96 && back < L - 30) [lx, ly] = at((back += 12));
  ctx.save();
  ctx.font = `italic 700 14px ${p.fontUi}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(text, lx, ly);
  ctx.fillStyle = p.velocity;
  ctx.fillText(text, lx, ly);
  ctx.restore();
}

function paint(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: LabState) {
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, v.w, v.h);
  const primedOn = Math.abs(s.beta) > 1e-9;
  if (s.cone) shadeLightCone(ctx, v, p, [s.a[0], s.a[1]], 0.12);
  drawRestAxes(ctx, v, p, { grid: !(s.grid && primedOn) });
  axisNumbers(ctx, v, p);
  if (s.hyper) for (const n2 of HYPERBOLAE) for (const sign of [1, -1]) drawHyperbola(ctx, v, sign * n2, p.velocity, n2 === 1 ? 0.75 : 0.4);
  drawLightLines(ctx, v, p);
  if (s.cone && (s.a[0] !== 0 || s.a[1] !== 0)) drawLightLines(ctx, v, p, [s.a[0], s.a[1]]);
  if (primedOn) {
    // the shared drawer puts its labels just past the axis end, where the corner buttons sit: label here instead
    drawPrimedAxes(ctx, v, p, s.beta, { grid: s.grid, xLabel: '', ctLabel: '' });
    // each label on the side away from the light line
    primedLabel(ctx, v, p, 'ct′', s.beta, 1, s.beta >= 0 ? -1 : 1);
    primedLabel(ctx, v, p, 'x′', 1, s.beta, s.beta >= 0 ? 1 : -1);
  }
  if (s.simul) {
    for (const e of [s.a, s.b]) {
      drawSimultaneityLine(ctx, v, p, s.beta, [e[0], e[1]]);
      // where this "now" of S′ meets the ct′ axis: the reading ct′ of the event
      const r = readByParallels(e[0], e[1], s.beta);
      const [fx, fy] = toScreen(v, r.ctFoot[0], r.ctFoot[1]);
      ctx.save();
      ctx.strokeStyle = p.velocity;
      ctx.fillStyle = p.paper;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(fx, fy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  // the selected event gets a ring, so the keyboard user knows which one the arrows move
  const [sx, sy] = toScreen(v, s[s.sel][0], s[s.sel][1]);
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink, 0.45);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  drawEvent(ctx, v, p, s.a[0], s.a[1], 'A', p.ink, 5.5);
  drawEvent(ctx, v, p, s.b[0], s.b[1], 'B', p.ink, 5.5);
}
