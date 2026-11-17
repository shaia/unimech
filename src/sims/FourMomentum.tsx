/**
 * FourMomentum: the energy-momentum diagram of one particle or of a system of two (lesson 10.2).
 *
 * The plane of (p_x c, E), both in MeV and on ONE scale, so the massless line E = |pc| runs at 45° (dashed, in
 * --accent, like the light lines of chapter 9). A particle of rest energy mc² lives on its mass hyperbola
 * E² − (pc)² = (mc²)², drawn faintly; its four-momentum (E, pc) is an arrow from the origin in --momentum. The β
 * slider describes everything from a frame S′ moving at β along +x relative to the lab: the arrows are the boosted
 * four-momenta (E′, p′c) = (γ(E − β·pc), γ(pc − β·E)), and a hollow ring marks where each tip was in the lab, so
 * a boost visibly slides the tip ALONG its hyperbola. With "שני חלקיקים" on, a second particle B (in --ink-2) is
 * added; B is also drawn from the tip of A (dashed), and the total four-momentum A + B is the thick ink arrow, on
 * the dashed hyperbola of the system's invariant mass M. The readout gives E, pc and v/c in both frames, the
 * invariant √(E² − (pc)²) computed from each frame's numbers (the same), and for the system E_tot, p_tot c, Mc²
 * from each frame, and the sum of the rest energies (which is not Mc²).
 *
 * Physics: src/physics/fourvector.ts (fourMomentum, boostX, add4, massOf, velocityOf); γ from relativity.ts.
 * Drawing: src/sims/core/spacetime.ts (axes, the massless lines), canvas.ts, ink.ts.
 *
 * Props (Astro wrapper: <Spread fig="fig-10-2a" figure={FourMomentum} figureProps={{ … }}>)
 *   id      figure id (Spread passes it); steps address the figure by it; tasks are `${id}:${task}`
 *   beta    velocity of S′ relative to the lab, / c, −0.9…0.9 (default 0)
 *   ma, pa  rest energy mc² of A (0…300 MeV) and its momentum pc along x in the lab (−600…600 MeV)
 *   mb, pb  the same for B
 *   two     show B and the system (default false)
 *   tasks   task ids to show (below)
 *
 * Step `set` keys: beta, ma, pa, mb, pb, two. Numbers are clamped and snapped (β to 0.01, energies to 5 MeV).
 *
 * Tasks, ticked only inside the learner's own handlers (a slider, the toggle), never by a step:
 *   boost       with mc² of A > 0, the learner moves β to |β| ≥ 0.3: the tip slides along the hyperbola
 *   rest-frame  with A massive and moving in the lab, the learner finds a β where |p′c| ≤ 1% of mc²: its rest frame
 *   photon      with mc² of A = 0 and pc ≠ 0, the learner moves β to |β| ≥ 0.3: the tip stays on the 45° line
 *   system      with B shown and M > 0, the learner moves β to |β| ≥ 0.3: Mc² stays the same
 *   cm-frame    with B shown and a nonzero total momentum in the lab, the learner finds a β where
 *               |p′_tot c| ≤ 1% of Mc²: the centre-of-mass frame
 */

import { useEffect, useState } from 'preact/hooks';
import { add4, boostX, fourMomentum, massOf, type FourVector } from '~/physics/fourvector';
import { gammaOf } from '~/physics/relativity';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawLightLines, drawRestAxes, worldBounds } from './core/spacetime';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const TASK_LABEL: Record<string, string> = {
  boost: 'הזיזו את פס המהירות של S′ (לפחות עד 0.3). לאן זז קצה החץ, ומה קורה ל-√(E² − (pc)²)?',
  'rest-frame': 'כש-A נע במעבדה, מצאו מהירות של S′ שבה A נח. מה האנרגיה שלו שם?',
  photon: 'הפכו את A לחלקיק חסר מסה (אנרגיית מנוחה 0) והזיזו את פס המהירות. האם הוא עוזב את הקו המקווקו?',
  system: 'כששני החלקיקים מוצגים, הזיזו את פס המהירות (לפחות עד 0.3). מה קורה למסה האינווריאנטית של המערכת?',
  'cm-frame': 'מצאו מהירות של S′ שבה התנע הכולל של המערכת אפס: מערכת מרכז המסה. מה האנרגיה הכוללת שם?',
};

export interface FourMomentumProps {
  id: string;
  beta?: number;
  ma?: number;
  pa?: number;
  mb?: number;
  pb?: number;
  two?: boolean;
  tasks?: string[];
}

interface FigState {
  beta: number;
  ma: number;
  pa: number;
  mb: number;
  pb: number;
  two: boolean;
}

/** The world shown: pc from −800 to 800 MeV, E from −100 to 1100 MeV, one scale for both axes. */
const P_MIN = -800;
const P_MAX = 800;
const E_MIN = -100;
const E_MAX = 1100;
const WORLD_W = P_MAX - P_MIN;
const WORLD_H = E_MAX - E_MIN;
const OX = (P_MIN + P_MAX) / 2;
const OY = (E_MIN + E_MAX) / 2;
const BETA_MAX = 0.9;
const M_MAX = 300;
const P_RANGE = 600;
const SNAP = 5;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const roundBeta = (x: number) => Math.round(clamp(x, -BETA_MAX, BETA_MAX) * 100) / 100;
const snapE = (x: number, lo: number, hi: number) => clamp(Math.round(x / SNAP) * SNAP, lo, hi);
/** 3 significant figures, a true minus sign, and no "−0" */
const num = (x: number) => {
  const r = Number(x.toPrecision(10));
  return Math.abs(r) < 5e-4 ? '0' : sci(r, 3).replace('-', '−');
};

/** First-strong isolate and pop-directional isolate: keep a Latin symbol inside a plain Hebrew string in place. */
const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);

/** Hebrew text with Latin symbols (A, B, S′) isolated, so the bidi algorithm keeps the Hebrew word order. */
function he(text: string) {
  return text.split(/([A-Za-z][A-Za-z′²]*)/).map((part, i) => (i % 2 === 1 ? <bdi key={i}>{part}</bdi> : part));
}

function initial(p: FourMomentumProps): FigState {
  return {
    beta: roundBeta(p.beta ?? 0),
    ma: snapE(p.ma ?? 140, 0, M_MAX),
    pa: snapE(p.pa ?? 0, -P_RANGE, P_RANGE),
    mb: snapE(p.mb ?? 140, 0, M_MAX),
    pb: snapE(p.pb ?? 0, -P_RANGE, P_RANGE),
    two: p.two ?? false,
  };
}

/** v/c = pc/E, or null when there is no particle (E = 0). */
const speed = (P: FourVector): number | null => (P[0] > 0 ? P[1] / P[0] : null);

/** Everything the readout, the drawing and the tasks need. */
function analyse(s: FigState) {
  const A = fourMomentum(s.ma, s.pa);
  const B = fourMomentum(s.mb, s.pb);
  const Ap = boostX(A, s.beta);
  const Bp = boostX(B, s.beta);
  const T = add4(A, B);
  const Tp = add4(Ap, Bp);
  return {
    A,
    B,
    Ap,
    Bp,
    T,
    Tp,
    g: gammaOf(s.beta),
    mA: massOf(A),
    mAp: massOf(Ap),
    M: massOf(T),
    Mp: massOf(Tp),
  };
}

export default function FourMomentum(props: FourMomentumProps) {
  const [s, setS] = useState<FigState>(() => initial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  // text steps set the state; they never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.beta === 'number') next.beta = roundBeta(st.beta);
          if (typeof st.ma === 'number') next.ma = snapE(st.ma, 0, M_MAX);
          if (typeof st.pa === 'number') next.pa = snapE(st.pa, -P_RANGE, P_RANGE);
          if (typeof st.mb === 'number') next.mb = snapE(st.mb, 0, M_MAX);
          if (typeof st.pb === 'number') next.pb = snapE(st.pb, -P_RANGE, P_RANGE);
          if (typeof st.two === 'boolean') next.two = st.two;
          return next;
        });
      }),
    [props.id],
  );

  /** Judge the tasks for a state the learner produced (called only from the learner's handlers). */
  const judge = (next: FigState, cause: 'beta' | 'particle' | 'toggle') => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const k = analyse(next);
    const bigBoost = cause === 'beta' && Math.abs(next.beta) >= 0.3 - 1e-9;
    if (has('boost') && bigBoost && next.ma > 0) done('boost');
    if (has('rest-frame') && next.ma > 0 && next.pa !== 0 && next.beta !== 0 && Math.abs(k.Ap[1]) <= 0.01 * next.ma) done('rest-frame');
    if (has('photon') && bigBoost && next.ma === 0 && next.pa !== 0) done('photon');
    if (has('system') && bigBoost && next.two && k.M > 0) done('system');
    if (has('cm-frame') && next.two && k.M > 0 && k.T[1] !== 0 && next.beta !== 0 && Math.abs(k.Tp[1]) <= 0.01 * k.M) done('cm-frame');
  };

  const learnerSet = (patch: Partial<FigState>, cause: 'beta' | 'particle' | 'toggle') => {
    const next = { ...s, ...patch };
    setS(next);
    judge(next, cause);
  };

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s)), 700);
    return () => clearTimeout(h);
  }, [s.beta, s.ma, s.pa, s.mb, s.pb, s.two]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, shifted(view), p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  const reset = () => {
    setS(initial(props));
    setLive('האיור חזר למצב ההתחלה.');
  };

  const k = analyse(s);
  const vA = speed(k.A);
  const vAp = speed(k.Ap);
  const mev = (x: number) => `${num(x)} MeV`;
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: דיאגרמת אנרגיה-תנע, pc לרוחב ו-E לגובה. כל חץ הוא ארבעה-וקטור האנרגיה-תנע של חלקיק, וקצהו על היפרבולת המסה שלו. פס המהירות מעביר את כל החצים למערכת S′. ${describe(s)}`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="beta">
            {he('מערכת S′:')} <b class="q" dir="ltr">β = {num(s.beta)}, γ = {num(k.g)}</b>
          </span>
          <span data-readout="a-lab">
            {he('A במעבדה:')} <b class="q" dir="ltr">E = {mev(k.A[0])}, pc = {mev(k.A[1])}, v/c = {vA === null ? '—' : num(vA)}</b>
          </span>
          <span data-readout="a-frame">
            {he('A ב-S′:')} <b class="q" dir="ltr">E′ = {mev(k.Ap[0])}, p′c = {mev(k.Ap[1])}, v′/c = {vAp === null ? '—' : num(vAp)}</b>
          </span>
          <span data-readout="a-mass">
            <bdi dir="ltr">√(E² − (pc)²)</bdi>{he(' של A מהמספרים של המעבדה:')} <b class="q" dir="ltr">{mev(k.mA)}</b>
          </span>
          <span data-readout="a-mass-p">
            <bdi dir="ltr">√(E′² − (p′c)²)</bdi>{he(' של A מהמספרים של S′:')} <b class="q" dir="ltr">{mev(k.mAp)}</b>
          </span>
          {s.two && (
            <>
              <span data-readout="b-lab">
                {he('B במעבדה:')} <b class="q" dir="ltr">E = {mev(k.B[0])}, pc = {mev(k.B[1])}</b>
              </span>
              <span data-readout="b-frame">
                {he('B ב-S′:')} <b class="q" dir="ltr">E′ = {mev(k.Bp[0])}, p′c = {mev(k.Bp[1])}</b>
              </span>
              <span data-readout="sys-lab">
                {he('המערכת במעבדה:')} <b class="q" dir="ltr">E<sub>tot</sub> = {mev(k.T[0])}, p<sub>tot</sub>c = {mev(k.T[1])}</b>
              </span>
              <span data-readout="sys-frame">
                {he('המערכת ב-S′:')} <b class="q" dir="ltr">E′<sub>tot</sub> = {mev(k.Tp[0])}, p′<sub>tot</sub>c = {mev(k.Tp[1])}</b>
              </span>
              <span data-readout="sys-mass">
                {he('Mc² מהמספרים של המעבדה:')} <b class="q" dir="ltr">{mev(k.M)}</b>
              </span>
              <span data-readout="sys-mass-p">
                {he('Mc² מהמספרים של S′:')} <b class="q" dir="ltr">{mev(k.Mp)}</b>
              </span>
              <span data-readout="sum-masses">
                {he('סכום אנרגיות המנוחה של A ו-B:')} <b class="q" dir="ltr">{mev(s.ma + s.mb)}</b>
              </span>
            </>
          )}
        </>
      }
      controls={
        <>
          <Slider
            label={`המהירות של ${FSI}S′${PDI} ביחס למעבדה`}
            min={-BETA_MAX}
            max={BETA_MAX}
            step={0.01}
            value={s.beta}
            format={(v) => `${num(v)}c`}
            onChange={(v) => learnerSet({ beta: roundBeta(v) }, 'beta')}
          />
          <Slider
            label={`אנרגיית המנוחה של ${FSI}A${PDI}`}
            min={0}
            max={M_MAX}
            step={SNAP}
            value={s.ma}
            format={(v) => `${num(v)} MeV`}
            onChange={(v) => learnerSet({ ma: snapE(v, 0, M_MAX) }, 'particle')}
          />
          <Slider
            label={`התנע של ${FSI}A${PDI} במעבדה, ${FSI}pc${PDI}`}
            min={-P_RANGE}
            max={P_RANGE}
            step={SNAP}
            value={s.pa}
            format={(v) => `${num(v)} MeV`}
            onChange={(v) => learnerSet({ pa: snapE(v, -P_RANGE, P_RANGE) }, 'particle')}
          />
          {s.two && (
            <>
              <Slider
                label={`אנרגיית המנוחה של ${FSI}B${PDI}`}
                min={0}
                max={M_MAX}
                step={SNAP}
                value={s.mb}
                format={(v) => `${num(v)} MeV`}
                onChange={(v) => learnerSet({ mb: snapE(v, 0, M_MAX) }, 'particle')}
              />
              <Slider
                label={`התנע של ${FSI}B${PDI} במעבדה, ${FSI}pc${PDI}`}
                min={-P_RANGE}
                max={P_RANGE}
                step={SNAP}
                value={s.pb}
                format={(v) => `${num(v)} MeV`}
                onChange={(v) => learnerSet({ pb: snapE(v, -P_RANGE, P_RANGE) }, 'particle')}
              />
            </>
          )}
          <div class="group" role="group" aria-label="מה לצייר">
            <Toggle label="שני חלקיקים" on={s.two} onChange={(on) => learnerSet({ two: on }, 'toggle')} />
          </div>
        </>
      }
    />
  );
}

/** The view centred on the shown world (the canvas hook centres it on the origin). */
const shifted = (v: View): View => ({ ...v, ox: OX, oy: OY });

function describe(s: FigState): string {
  const k = analyse(s);
  let t = `מערכת S′ נעה במהירות ${num(s.beta)} c ביחס למעבדה. לחלקיק A אנרגיית מנוחה ${num(s.ma)} MeV; ב-S′ האנרגיה שלו ${num(k.Ap[0])} MeV והתנע שלו כפול c ${num(k.Ap[1])} MeV.`;
  if (s.two) t += ` למערכת A ו-B ב-S′ אנרגיה כוללת ${num(k.Tp[0])} MeV ותנע כולל כפול c ${num(k.Tp[1])} MeV; המסה האינווריאנטית שלה כפול c בריבוע ${num(k.M)} MeV.`;
  return t;
}

function text(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center', size = 13) {
  ctx.save();
  ctx.font = `600 ${size}px ${p.fontUi}`;
  ctx.direction = 'ltr';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

function axisNumbers(ctx: CanvasRenderingContext2D, v: View, p: Palette) {
  const [xa, xb, ya, yb] = worldBounds(v);
  ctx.save();
  ctx.font = `500 ${v.ppm * 200 < 60 ? 10 : 11}px ${p.fontUi}`;
  ctx.direction = 'ltr';
  ctx.fillStyle = p.ink3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const [ox, oy] = toScreen(v, 0, 0);
  // keep clear of the left edge, and of the "pc" label at the right end of the axis
  for (let x = Math.ceil((xa + 100) / 200) * 200; x <= xb - 120; x += 200) {
    if (x === 0) continue;
    const [sx] = toScreen(v, x, 0);
    ctx.fillText(String(x).replace('-', '−'), sx, oy + 6);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let y = Math.ceil(ya / 200) * 200; y <= yb - 120; y += 200) {
    if (y <= 0) continue;
    const [, sy] = toScreen(v, 0, y);
    ctx.fillText(String(y), ox - 7, sy);
  }
  ctx.restore();
}

/** The upper branch of the mass hyperbola E = √((pc)² + m²) across the view; for m = 0, nothing (the 45° lines). */
function massHyperbola(ctx: CanvasRenderingContext2D, v: View, m: number, color: string, alpha: number, dash: number[] = []) {
  if (m <= 0) return;
  const [xa, xb] = worldBounds(v);
  ctx.save();
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = 1.6;
  ctx.setLineDash(dash);
  ctx.beginPath();
  const n = 160;
  for (let i = 0; i <= n; i++) {
    const pc = xa + ((xb - xa) * i) / n;
    const [sx, sy] = toScreen(v, pc, Math.sqrt(pc * pc + m * m));
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.restore();
}

/** A four-momentum arrow from (E0, p0c) to (E0 + E, p0c + pc) in screen space. */
function fourArrow(ctx: CanvasRenderingContext2D, v: View, from: FourVector, P: FourVector, color: string, width: number, dash: number[] = []) {
  const [x1, y1] = toScreen(v, from[1], from[0]);
  const [x2, y2] = toScreen(v, from[1] + P[1], from[0] + P[0]);
  ctx.save();
  ctx.setLineDash(dash);
  arrow(ctx, x1, y1, x2, y2, { color, width, head: 10 });
  ctx.restore();
}

function ring(ctx: CanvasRenderingContext2D, v: View, P: FourVector, color: string) {
  const [sx, sy] = toScreen(v, P[1], P[0]);
  ctx.save();
  ctx.strokeStyle = withAlpha(color, 0.7);
  ctx.fillStyle = withAlpha(color, 0.08);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(sx, sy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** A label beside a tip, pushed inside the canvas and off the top-right corner buttons. */
function tipLabel(ctx: CanvasRenderingContext2D, v: View, p: Palette, P: FourVector, s: string, color: string) {
  let [sx, sy] = toScreen(v, P[1], P[0]);
  sx += P[1] >= 0 ? 16 : -16;
  sy -= 10;
  sx = clamp(sx, 18, v.w - 18);
  sy = clamp(sy, 12, v.h - 12);
  if (sy < 44 && sx > v.w - 96) sy = 48;
  text(ctx, p, s, sx, sy, color);
}

const ZERO: FourVector = [0, 0, 0, 0];

function paint(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: FigState) {
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, v.w, v.h);
  const k = analyse(s);
  drawRestAxes(ctx, v, p, { tick: 100, xLabel: 'pc', ctLabel: 'E', grid: true });
  axisNumbers(ctx, v, p);
  drawLightLines(ctx, v, p);
  // hyperbolae: A (and B), then the system
  massHyperbola(ctx, v, s.ma, p.momentum, 0.45);
  if (s.two) {
    massHyperbola(ctx, v, s.mb, p.ink2, 0.35);
    massHyperbola(ctx, v, k.M, p.ink, 0.55, [6, 5]);
  }
  const boosted = Math.abs(s.beta) > 1e-9;
  // where the tips were in the lab
  if (boosted) {
    if (k.A[0] > 0) ring(ctx, v, k.A, p.momentum);
    if (s.two) {
      if (k.B[0] > 0) ring(ctx, v, k.B, p.ink2);
      if (k.T[0] > 0) ring(ctx, v, k.T, p.ink);
    }
  }
  if (s.two) {
    // B from the origin, and again from the tip of A (tip to tail), then the total
    if (k.Bp[0] > 0) {
      fourArrow(ctx, v, ZERO, k.Bp, p.ink2, 2.2);
      fourArrow(ctx, v, k.Ap, k.Bp, withAlpha(p.ink2, 0.6), 1.6, [5, 4]);
    }
    if (k.Tp[0] > 0) fourArrow(ctx, v, ZERO, k.Tp, p.ink, 3.2);
  }
  if (k.Ap[0] > 0) fourArrow(ctx, v, ZERO, k.Ap, p.momentum, 2.6);
  if (k.Ap[0] > 0) tipLabel(ctx, v, p, k.Ap, 'A', p.momentum);
  if (s.two) {
    if (k.Bp[0] > 0) tipLabel(ctx, v, p, k.Bp, 'B', p.ink2);
    if (k.Tp[0] > 0) tipLabel(ctx, v, p, k.Tp, 'A + B', p.ink);
  }
}
