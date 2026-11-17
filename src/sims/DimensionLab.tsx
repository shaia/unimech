/**
 * DimensionLab (lesson 0.1): dimensional analysis and orders of magnitude as arrows on a number line.
 *
 * Mode 'dims': a quantity (the period T) is written as C·x₁^p₁·x₂^p₂·…, and the learner sets the
 * exponents with sliders. There is one row per base dimension (mass, length, time). In each row,
 * every variable adds pᵢ times its own exponent of that dimension, drawn as an arrow head to tail, so
 * the chain ends at the exponent of the whole product; the dashed line is the exponent the target
 * needs. When the three chains end on their lines, the product has the dimension of a time.
 *
 * Mode 'estimate': a quantity is a product of factors, and each factor is an arrow of length log₁₀ of
 * its value on a logarithmic axis (multiplying is adding logs). The chain ends at the estimate, and
 * the band around the measured value spans one order of magnitude (a factor √10 either way).
 *
 * Physics and data come from src/physics/dimensions.ts. Nothing moves, so there is no animation.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  DIMENSION_PRESETS,
  ESTIMATE_PRESETS,
  dimEqual,
  dimProduct,
  estimateValues,
  fraction,
  logLadder,
  sameOrder,
  solveExponents,
  type Dim,
  type DimensionPresetName,
  type EstimatePresetName,
} from '~/physics/dimensions';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci, superscript } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/** width / height of the stage: the dimension rows need more height than the log ladder */
const ASPECT = { dims: 1.0, estimate: 1.2 } as const;
/** the reset and fullscreen buttons cover the top-right corner of the stage, this many CSS px tall */
const BUTTONS_H = 52;
/** exponent sliders run over [−EXP_MAX, EXP_MAX] in steps of ½ */
const EXP_MAX = 2;
const ROW_NAMES = ['מסה', 'אורך', 'זמן'];

const PRESET_LABEL: Record<DimensionPresetName, string> = {
  pendulum: 'מטוטלת',
  spring: 'מסה על קפיץ',
  orbit: 'מסלול מעגלי',
  amplitude: 'מטוטלת עם אמפליטודה',
};

const ESTIMATE_LABEL: Record<EstimatePresetName, string> = {
  'earth-mass': 'המסה של כדור הארץ',
  'moon-g': 'תאוצת הנפילה על הירח',
};

const TASK_LABEL: Record<string, string> = {
  'pendulum-balance': 'במטוטלת, הזיזו את החזקות עד ששלוש השורות מאוזנות. מה יצאה החזקה של m?',
  'spring-balance': 'בחרו "מסה על קפיץ" ואזנו את שלוש השורות. האם זמן המחזור תלוי באמפליטודה A?',
  'orbit-balance': 'בחרו "מסלול מעגלי" ואזנו את השורות. באיזו חזקה של r תלוי זמן המחזור?',
  'amplitude-two': 'בחרו "מטוטלת עם אמפליטודה", אזנו את השורות, ואז שנו רק את החזקה של θ₀. האם האיזון נשבר?',
  'earth-order': 'במסה של כדור הארץ, בחרו צפיפות שנותנת הערכה מאותו סדר גודל כמו המסה הנמדדת.',
  'moon-order': 'בחרו "תאוצת הנפילה על הירח" ומצאו צפיפות שנותנת הערכה מאותו סדר גודל כמו הערך הנמדד.',
};

interface State {
  mode: 'dims' | 'estimate';
  preset: DimensionPresetName;
  exps: number[];
  estimate: EstimatePresetName;
  /** index of the chosen density; −1 before the learner chooses */
  choice: number;
}

export interface DimensionLabProps {
  id: string;
  mode?: 'dims' | 'estimate';
  preset?: DimensionPresetName;
  /** problems offered as buttons (default: only the starting one, no buttons) */
  presets?: DimensionPresetName[];
  /** starting exponents, one per variable of the preset (default: all 0) */
  exps?: number[];
  estimate?: EstimatePresetName;
  estimates?: EstimatePresetName[];
  choice?: number;
  tasks?: string[];
}

const nVars = (preset: DimensionPresetName) => DIMENSION_PRESETS[preset].vars.length;
const fitExps = (preset: DimensionPresetName, exps: readonly number[] | undefined) =>
  Array.from({ length: nVars(preset) }, (_, i) => Math.max(-EXP_MAX, Math.min(EXP_MAX, Math.round((exps?.[i] ?? 0) * 2) / 2)));

function initial(p: DimensionLabProps): State {
  const preset = p.preset ?? 'pendulum';
  return {
    mode: p.mode ?? 'dims',
    preset,
    exps: fitExps(preset, p.exps),
    estimate: p.estimate ?? 'earth-mass',
    choice: p.choice ?? -1,
  };
}

/** the half-open range of the exponent axis of a preset: the largest partial sum any slider setting reaches */
function axisRange(preset: DimensionPresetName): number {
  const vars = DIMENSION_PRESETS[preset].vars;
  let m = 1;
  for (let k = 0; k < 3; k++) {
    let s = 0;
    for (const x of vars) {
      s += EXP_MAX * Math.abs(x.dim[k]);
      m = Math.max(m, s);
    }
  }
  return Math.min(8, Math.ceil(m));
}

/** "½"-style exponent text for the canvas */
const expText = (x: number) => fraction(x);
const fmt = (x: number) => sci(x, 3).replace('-', '−');

export default function DimensionLab(props: DimensionLabProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const stepState = useRef<State | null>(null);
  /** the learner moved a slider or chose a density since the last step, reset or problem change */
  const userTouched = useRef(false);
  /** θ₀ exponents at which the learner had the amplitude problem balanced */
  const balancedTheta = useRef(new Set<number>());
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const problem = DIMENSION_PRESETS[s.preset];
  const rowSums: Dim = dimProduct(problem.vars.map((x, i) => ({ dim: x.dim, power: s.exps[i] })));
  const balanced = dimEqual(rowSums, problem.target.dim);
  const groups = solveExponents(problem.target.dim, problem.vars.map((x) => x.dim)).nullspace.length;

  const est = ESTIMATE_PRESETS[s.estimate];
  const chosen = s.choice >= 0;
  const values = estimateValues(est, Math.max(0, s.choice));
  const ladder = logLadder(values);
  const estimateOk = chosen && sameOrder(ladder.product, est.reference);

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev };
          if (step.mode === 'dims' || step.mode === 'estimate') next.mode = step.mode;
          if (typeof step.preset === 'string' && step.preset in PRESET_LABEL) next.preset = step.preset as DimensionPresetName;
          if (Array.isArray(step.exps) || next.preset !== prev.preset) next.exps = fitExps(next.preset, step.exps as number[] | undefined);
          if (typeof step.estimate === 'string' && step.estimate in ESTIMATE_LABEL) next.estimate = step.estimate as EstimatePresetName;
          if (typeof step.choice === 'number') next.choice = step.choice;
          stepState.current = next;
          userTouched.current = false;
          balancedTheta.current.clear();
          return next;
        });
      }),
    [props.id],
  );

  // tasks: checked against the figure's own state, never against a state a text step produced
  useEffect(() => {
    if (s === stepState.current || !userTouched.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (s.mode === 'dims' && balanced) {
      if (has('pendulum-balance') && s.preset === 'pendulum') done('pendulum-balance');
      if (has('spring-balance') && s.preset === 'spring') done('spring-balance');
      if (has('orbit-balance') && s.preset === 'orbit') done('orbit-balance');
      if (s.preset === 'amplitude') {
        balancedTheta.current.add(s.exps[3]);
        if (has('amplitude-two') && balancedTheta.current.size >= 2) done('amplitude-two');
      }
    }
    if (s.mode === 'estimate' && estimateOk) {
      if (has('earth-order') && s.estimate === 'earth-mass') done('earth-order');
      if (has('moon-order') && s.estimate === 'moon-g') done('moon-order');
    }
  }, [s, props.id, props.tasks, balanced, estimateOk]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    if (s.mode === 'dims') drawDims(ctx, view, p, s);
    else drawEstimate(ctx, view, p, s);
  };
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1 / ASPECT[s.mode], animate: false });
  useEffect(invalidate, [s]);

  const setExp = (i: number, x: number) => {
    userTouched.current = true;
    setS((prev) => {
      const exps = [...prev.exps];
      exps[i] = Math.round(x * 2) / 2;
      return { ...prev, exps };
    });
  };
  const choosePreset = (preset: DimensionPresetName) => {
    userTouched.current = false;
    balancedTheta.current.clear();
    setS((prev) => ({ ...prev, preset, exps: fitExps(preset, undefined) }));
    setLive(`נבחרה הבעיה: ${PRESET_LABEL[preset]}. כל החזקות אפס.`);
  };
  const chooseEstimate = (estimate: EstimatePresetName) => {
    userTouched.current = false;
    setS((prev) => ({ ...prev, estimate, choice: -1 }));
    setLive(`נבחרה ההערכה: ${ESTIMATE_LABEL[estimate]}.`);
  };
  const chooseDensity = (choice: number) => {
    userTouched.current = true;
    setS((prev) => ({ ...prev, choice }));
  };
  const reset = () => {
    stepState.current = null;
    userTouched.current = false;
    balancedTheta.current.clear();
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const sym = problem.target.sym;
  const dimsLabel = () => {
    const parts = problem.vars.map((x, i) => `${x.sym} בחזקת ${expText(s.exps[i])}`).join(', ');
    const rows = ROW_NAMES.map((n, k) => `${n}: ${expText(rowSums[k])} (צריך ${expText(problem.target.dim[k])})`).join(', ');
    return `${PRESET_LABEL[s.preset]}. ${parts}. ${rows}. ${balanced ? 'מאוזן.' : 'לא מאוזן.'}`;
  };
  const estimateLabel = () =>
    `${ESTIMATE_LABEL[s.estimate]}: ${chosen ? `הערכה ${fmt(ladder.product)} ${est.unit}, ` : 'עוד לא נבחרה צפיפות, '}הערך הנמדד ${fmt(est.reference)} ${est.unit}.`;

  const presets = props.presets ?? [];
  const estimates = props.estimates ?? [];
  const densityChoices = est.factors.find((f) => f.choices)?.choices ?? [];

  return (
    <SimShell
      fig={props.id}
      label={
        s.mode === 'dims'
          ? `איור חי: ניתוח ממדים כמאזן של חזקות, שורה לכל ממד. ${dimsLabel()}`
          : `איור חי: הערכת סדר גודל כחיבור חצים על ציר לוגריתמי. ${estimateLabel()}`
      }
      canvasRef={canvasRef}
      aspect={ASPECT[s.mode]}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        s.mode === 'dims' ? (
          <>
            <b class="q" data-readout="product">
              {sym} = C ·{' '}
              {problem.vars.map((x, i) => (
                <span key={x.sym}>
                  {x.sym}
                  <sup>{expText(s.exps[i])}</sup>{' '}
                </span>
              ))}
            </b>
            <span data-readout="dims">
              הממד של הביטוי:{' '}
              <bdi class="q" dir="ltr">
                M<sup>{expText(rowSums[0])}</sup> L<sup>{expText(rowSums[1])}</sup> T<sup>{expText(rowSums[2])}</sup>
              </bdi>
            </span>
            <span data-readout="status">{balanced ? 'מאוזן: הביטוי הוא זמן.' : 'לא מאוזן: הביטוי אינו זמן.'}</span>
            {balanced && groups > 0 && <span data-readout="free">θ₀ חסרת ממדים: כל חזקה שלה שומרת על האיזון.</span>}
          </>
        ) : (
          <>
            <b class="q" data-readout="estimate">
              {est.sym} ≈ {chosen ? `${fmt(ladder.product)} ${est.unit}` : '?'}
            </b>
            <span data-readout="reference">
              נמדד:{' '}
              <bdi class="q" dir="ltr">
                {fmt(est.reference)} {est.unit}
              </bdi>
            </span>
            {chosen && (
              <span data-readout="ratio">
                יחס לערך הנמדד:{' '}
                <bdi class="q" dir="ltr">
                  {fmt(ladder.product / est.reference)}
                </bdi>
              </span>
            )}
            {chosen && <span data-readout="order">{estimateOk ? 'אותו סדר גודל.' : 'סדר גודל אחר.'}</span>}
          </>
        )
      }
      controls={
        s.mode === 'dims' ? (
          <>
            {presets.length > 1 && (
              <div class="group" role="group" aria-label="בחירת בעיה">
                {presets.map((name) => (
                  <Toggle key={name} label={PRESET_LABEL[name]} on={s.preset === name} onChange={() => choosePreset(name)} />
                ))}
              </div>
            )}
            {problem.vars.map((x, i) => (
              <Slider
                key={`${s.preset}-${x.sym}`}
                label={`החזקה של ${x.sym} (${x.name})`}
                min={-EXP_MAX}
                max={EXP_MAX}
                step={0.5}
                value={s.exps[i]}
                format={expText}
                onChange={(val) => setExp(i, val)}
              />
            ))}
          </>
        ) : (
          <>
            {estimates.length > 1 && (
              <div class="group" role="group" aria-label="בחירת הערכה">
                {estimates.map((name) => (
                  <Toggle key={name} label={ESTIMATE_LABEL[name]} on={s.estimate === name} onChange={() => chooseEstimate(name)} />
                ))}
              </div>
            )}
            <div class="group" role="group" aria-label="ניחוש לצפיפות">
              {densityChoices.map((c, i) => (
                <Toggle
                  key={c.label}
                  label={
                    <>
                      {c.label} <bdi dir="ltr">{c.value} kg/m³</bdi>
                    </>
                  }
                  on={s.choice === i}
                  swatch="var(--accent)"
                  onChange={() => chooseDensity(i)}
                />
              ))}
            </div>
          </>
        )
      }
    />
  );
}

/* ---------------------------------------------------------------- drawing */

function varColors(p: Palette): string[] {
  return [p.momentum, p.energyP, p.energyK, p.energyEl];
}

/** One row per base dimension: the variables' contributions head to tail, and the target line. */
function drawDims(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: State) {
  const problem = DIMENSION_PRESETS[s.preset];
  const R = axisRange(s.preset);
  const left = 58;
  const right = 16;
  const top = BUTTONS_H - 8;
  const rowH = (v.h - top - 6) / 3;
  const X = (e: number) => left + ((e + R) / (2 * R)) * (v.w - left - right);
  const colors = varColors(p);
  const n = problem.vars.length;

  for (let k = 0; k < 3; k++) {
    const y0 = top + k * rowH;
    const axisY = y0 + rowH - 20;
    // row band and name
    ctx.save();
    ctx.fillStyle = k % 2 === 0 ? withAlpha(p.ink3, 0.06) : 'transparent';
    ctx.fillRect(0, y0, v.w, rowH);
    ctx.restore();
    text(ctx, ROW_NAMES[k], 8, y0 + rowH / 2, p.ink, p, { align: 'left', size: 14, weight: 700 });

    // the axis: ticks at every half, numbers at the integers
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(-R), axisY);
    ctx.lineTo(X(R), axisY);
    ctx.stroke();
    for (let e = -R; e <= R + 1e-9; e += 0.5) {
      const major = Number.isInteger(e);
      ctx.beginPath();
      ctx.moveTo(X(e), axisY - (major ? 4 : 2));
      ctx.lineTo(X(e), axisY + (major ? 4 : 2));
      ctx.stroke();
      const stepLabel = R > 4 ? 2 : 1;
      if (major && e % stepLabel === 0) text(ctx, e < 0 ? `−${-e}` : String(e), X(e), axisY + 12, p.ink3, p, { size: 10 });
    }
    // zero line, faint
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(X(0), y0 + 4);
    ctx.lineTo(X(0), axisY);
    ctx.stroke();
    ctx.restore();

    // the target: the exponent a time needs in this row
    const want = problem.target.dim[k];
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(X(want), y0 + 4);
    ctx.lineTo(X(want), axisY + 4);
    ctx.stroke();
    ctx.restore();
    // its name just above the axis, beside the line, clear of the arrows at the top of the row
    if (k === 0) text(ctx, 'יעד', X(want) + 16, axisY - 12, p.accent, p, { size: 11, weight: 700 });

    // the chain of arrows
    const step = Math.min(24, (axisY - y0 - 18) / n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const x = problem.vars[i];
      const c = s.exps[i] * x.dim[k];
      const ya = y0 + 12 + i * step;
      const from = X(sum);
      const to = X(sum + c);
      if (Math.abs(c) > 1e-9) {
        arrow(ctx, from, ya, to, ya, { color: colors[i], width: 2.6, head: 8 });
        // the symbol on the arrow's own line, just behind its tail
        varLabel(ctx, x.sym, from - Math.sign(c) * 10, ya, colors[i], p);
      } else {
        // a variable that adds nothing to this row: a faint dot where it would start
        ctx.save();
        ctx.fillStyle = withAlpha(colors[i], 0.45);
        ctx.beginPath();
        ctx.arc(from, ya, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      sum += c;
    }
    // where the chain ends, on the axis
    const ok = Math.abs(sum - want) < 1e-9;
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.fillStyle = ok ? p.ink : p.paper;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(sum), axisY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    const gap = want - sum;
    // the status: a tick, or what is missing ("חסר" and the number drawn apart, so the canvas never reorders them)
    if (ok) text(ctx, '✓', v.w - right - 2, axisY - 12, p.ink, p, { align: 'right', size: 13, weight: 700 });
    else {
      const num = `${gap > 0 ? '+' : '−'}${expText(Math.abs(gap))}`;
      ctx.save();
      ctx.font = `700 12px ${p.fontUi}`;
      const w = ctx.measureText(num).width;
      ctx.restore();
      text(ctx, num, v.w - right - 2, axisY - 12, p.accent, p, { align: 'right', size: 12, weight: 700 });
      text(ctx, 'חסר', v.w - right - 6 - w, axisY - 12, p.accent, p, { align: 'right', size: 12, weight: 700 });
    }
  }
}

/** The log ladder: one row per factor, its arrow from the running log₁₀ to the next, then the result. */
function drawEstimate(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: State) {
  const est = ESTIMATE_PRESETS[s.estimate];
  const chosen = s.choice >= 0;
  const values = estimateValues(est, Math.max(0, s.choice));
  const { partial, product } = logLadder(values);
  // the axis spans every partial sum of every choice, the measured value, and zero
  const all = [0, Math.log10(est.reference)];
  const choices = est.factors.find((f) => f.choices)?.choices ?? [];
  for (let c = 0; c < Math.max(1, choices.length); c++) all.push(...logLadder(estimateValues(est, c)).partial);
  const lo = Math.floor(Math.min(...all)) - 1;
  const hi = Math.ceil(Math.max(...all)) + 1;
  const left = 16;
  const right = 16;
  const top = BUTTONS_H - 4;
  const axisY = v.h - 26;
  const X = (e: number) => left + ((e - lo) / (hi - lo)) * (v.w - left - right);
  const rows = est.factors.length + 1;
  const rowH = (axisY - top - 10) / rows;

  // decade grid
  const every = hi - lo > 16 ? 5 : hi - lo > 8 ? 2 : 1;
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  for (let e = lo; e <= hi; e++) {
    ctx.beginPath();
    ctx.moveTo(X(e), top);
    ctx.lineTo(X(e), axisY);
    ctx.stroke();
  }
  ctx.strokeStyle = p.ink3;
  ctx.beginPath();
  ctx.moveTo(X(lo), axisY);
  ctx.lineTo(X(hi), axisY);
  ctx.stroke();
  ctx.restore();
  for (let e = lo; e <= hi; e++) if (e % every === 0) text(ctx, `10${superscript(e)}`, X(e), axisY + 13, p.ink3, p, { size: 11 });

  // the band of one order of magnitude around the measured value, across the result row
  const ref = Math.log10(est.reference);
  const yRes = top + (rows - 1) * rowH + rowH / 2;
  ctx.save();
  ctx.fillStyle = withAlpha(p.accent, 0.13);
  ctx.fillRect(X(ref - 0.5), yRes - rowH / 2 + 3, X(ref + 0.5) - X(ref - 0.5), rowH - 6);
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X(ref), yRes - rowH / 2 + 3);
  ctx.lineTo(X(ref), yRes + rowH / 2 - 3);
  ctx.stroke();
  ctx.restore();
  text(ctx, 'נמדד', X(ref), yRes - rowH / 2 - 4, p.accent, p, { size: 11, weight: 700 });

  // the factors
  const colors = varColors(p);
  let prev = 0;
  est.factors.forEach((f, i) => {
    const y = top + i * rowH + rowH / 2;
    const known = f.value !== undefined || chosen;
    const end = partial[i];
    if (known) {
      arrow(ctx, X(prev), y, X(end), y, { color: colors[i % colors.length], width: 2.6, head: 9 });
      const label = `${f.sym} = ${fmt(values[i])}`;
      text(ctx, label, (X(prev) + X(end)) / 2, y - 10, colors[i % colors.length], p, { size: 12, weight: 700 });
      // a faint guide down from the arrow's start, so the head-to-tail chain reads
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink3, 0.6);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(X(end), y);
      ctx.lineTo(X(end), y + rowH);
      ctx.stroke();
      ctx.restore();
    } else {
      text(ctx, `${f.sym} = ?`, X(prev) + 24, y, p.ink3, p, { size: 12, weight: 700 });
    }
    prev = end;
  });

  // the result
  if (chosen) {
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(X(Math.log10(product)), yRes, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    text(ctx, 'הערכה', X(Math.log10(product)), yRes + 15, p.ink, p, { size: 11, weight: 700 });
  }
}

function text(
  ctx: CanvasRenderingContext2D,
  t: string,
  x: number,
  y: number,
  color: string,
  p: Palette,
  o: { align?: CanvasTextAlign; size?: number; weight?: number } = {},
) {
  ctx.save();
  ctx.font = `${o.weight ?? 600} ${o.size ?? 13}px ${p.fontUi}`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = p.paper;
  ctx.strokeText(t, x, y);
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
  ctx.restore();
}

/** A variable's symbol in italics, as in the text. */
function varLabel(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, color: string, p: Palette) {
  ctx.save();
  ctx.font = `italic 700 14px 'Frank Ruhl Libre', Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = p.paper;
  ctx.strokeText(t, x, y);
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
  ctx.restore();
}
