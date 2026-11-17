/**
 * DecayLab: a two-body decay seen from the parent's rest frame and from the lab, and the threshold energy of a
 * reaction on a fixed target and in a head-on collider (lesson 10.3).
 *
 * Mode 'decay'. A parent of mass M decays into two products, M → m₁ + m₂ (presets: π⁺ → μ⁺ν, Λ⁰ → pπ⁻,
 * K⁰ → π⁺π⁻). Left panel: the parent's rest frame; the products leave back to back with equal momenta p*, product 1
 * at the angle θ* from +x (a slider). Right panel: the lab, where the parent moved at β along +x before it decayed;
 * the products' momenta are boosted, the parent's momentum γβM is drawn dashed, and a dashed copy of p₂ from the tip
 * of p₁ closes the triangle on it: p₁ + p₂ = P. Each panel has its own scale (the magnitudes are written at the
 * arrow tips). Bottom: the bar of Q = M − m₁ − m₂ split into the two kinetic energies in the rest frame, with ticks
 * at the half and, when both products have mass, at Newton's split Q·m₂/(m₁ + m₂).
 *
 * Mode 'threshold'. A reaction that creates mass (presets: p + p → p + p + p + p̄, p + p → p + p + π⁰). A toggle
 * picks the setup: a beam on a proton at rest (fixed target) or two identical beams head on (collider); a slider
 * sets the kinetic energy K of each beam particle. Top: the collision before, and the products at threshold (at
 * rest in the CM frame: moving together at β_cm in the lab on a fixed target, at rest head on). Bottom: √s against
 * K for both setups, the line √s = Σm_f, the two thresholds, and the present state.
 *
 * Physics: src/physics/reldecay.ts (natural units, MeV, c = 1). Every number comes from there.
 *
 * Props (Astro wrapper: <Spread fig="fig-10-3a" figure={DecayLab} figureProps={{ … }}>)
 *   id        figure id (Spread passes it); tasks are `${id}:${task}`
 *   mode      'decay' | 'threshold' (default 'decay')
 *   preset    'pi' | 'lambda' | 'k0' (decay; default 'pi')
 *   beta      the parent's speed in the lab, 0…0.95 (decay; default 0)
 *   theta     θ* of product 1 in the rest frame, degrees 0…180 (decay; default 60)
 *   reaction  'pbar' | 'pi0' (threshold; default 'pbar')
 *   setup     'fixed' | 'collider' (threshold; default 'fixed')
 *   k         the kinetic energy of each beam particle, MeV (threshold; default 3000)
 *   tasks     task ids to show (below)
 *
 * Step `set` keys: preset, beta, theta, reaction, setup, k.
 *
 * Tasks, ticked only inside the learner's own handlers (a slider, a button), never by a step:
 *   equal      the learner picks the decay whose products share Q equally (K⁰ → π⁺π⁻)
 *   boost      the learner sets the parent's speed to at least 0.5c
 *   forward    the learner makes a state where the products' momenta in the lab are less than 90° apart
 *   cross      on a fixed target, p + p → p + p + p + p̄: the learner raises K to the threshold or above
 *   collider   head on: the learner finds the threshold, K above it by at most 10% (just switching setups is not it)
 *   pion       p + p → p + p + π⁰ on a fixed target: the learner reaches the threshold
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  classicalDecay,
  cmBetaFixedTarget,
  decayAtRest,
  decayKinetic,
  decayMomentum,
  decayQ,
  fromPrimed,
  invariantMass,
  movingAt,
  openingAngle,
  sqrtSCollider,
  sqrtSFixedTarget,
  thresholdKineticCollider,
  thresholdKineticFixedTarget,
  total,
  type FourMomentum,
} from '~/physics/reldecay';
import { gammaOf } from '~/physics/relativity';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const TASK_LABEL: Record<string, string> = {
  equal: 'מצאו דעיכה שבה שני התוצרים מקבלים בדיוק חצי מ-Q כל אחד. מה מיוחד בה?',
  boost: 'הזיזו את מהירות החלקיק הדועך במעבדה ל-0.5c לפחות, ובדקו את סכום האנרגיות ואת סכום התנעים.',
  forward: 'מצאו מצב שבו במעבדה הזווית בין שני התוצרים קטנה מ-90°, אף שבמערכת המנוחה היא תמיד 180°.',
  cross: 'במטרה נייחת, ביצירת זוג פרוטון ואנטי-פרוטון: הגדילו את האנרגיה של הקרן עד שהתגובה אפשרית.',
  collider: 'עברו להתנגשות חזיתית ומצאו את האנרגיה המזערית של כל קרן, עד 10% מעליה. כמה היא קטנה מזו של מטרה נייחת?',
  pion: 'בחרו את יצירת הפיון הניטרלי, ומצאו את הסף שלה במטרה נייחת.',
};

type Preset = 'pi' | 'lambda' | 'k0';
type Reaction = 'pbar' | 'pi0';
type Setup = 'fixed' | 'collider';

interface DecayDef {
  M: number;
  m1: number;
  m2: number;
  parent: string;
  n1: string;
  n2: string;
}

/** Rest energies [MeV], as the lesson states them. */
const DECAYS: Record<Preset, DecayDef> = {
  pi: { M: 140, m1: 106, m2: 0, parent: 'π⁺', n1: 'μ⁺', n2: 'ν' },
  lambda: { M: 1116, m1: 938, m2: 140, parent: 'Λ⁰', n1: 'p', n2: 'π⁻' },
  k0: { M: 498, m1: 140, m2: 140, parent: 'K⁰', n1: 'π⁺', n2: 'π⁻' },
};

interface ReactionDef {
  m: number;
  products: number[];
  label: string;
  /** the slider's range [MeV] on a fixed target and head on, and its step */
  kMax: Record<Setup, number>;
  kStep: number;
}

const M_P = 938;
const REACTIONS: Record<Reaction, ReactionDef> = {
  pbar: { m: M_P, products: [M_P, M_P, M_P, M_P], label: 'p + p → p + p + p + p̄', kMax: { fixed: 8000, collider: 2000 }, kStep: 2 },
  pi0: { m: M_P, products: [M_P, M_P, 135], label: 'p + p → p + p + π⁰', kMax: { fixed: 600, collider: 150 }, kStep: 0.5 },
};
const sumOf = (r: ReactionDef) => r.products.reduce((a, b) => a + b, 0);

const PRESET_IDS: Preset[] = ['pi', 'lambda', 'k0'];
const PRESET_LABEL = (d: DecayDef) => `${d.parent} → ${d.n1} + ${d.n2}`;
const BETA_MAX = 0.95;

export interface DecayLabProps {
  id: string;
  mode?: 'decay' | 'threshold';
  preset?: Preset;
  beta?: number;
  theta?: number;
  reaction?: Reaction;
  setup?: Setup;
  k?: number;
  tasks?: string[];
}

interface LabState {
  preset: Preset;
  beta: number;
  theta: number;
  reaction: Reaction;
  setup: Setup;
  k: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const roundBeta = (b: number) => Math.round(clamp(b, 0, BETA_MAX) * 100) / 100;
const roundTheta = (t: number) => Math.round(clamp(t, 0, 180) / 5) * 5;
const roundK = (k: number, r: ReactionDef, setup: Setup) => Math.round(clamp(k, 0, r.kMax[setup]) / r.kStep) * r.kStep;
const isPreset = (x: unknown): x is Preset => x === 'pi' || x === 'lambda' || x === 'k0';
const isReaction = (x: unknown): x is Reaction => x === 'pbar' || x === 'pi0';
const isSetup = (x: unknown): x is Setup => x === 'fixed' || x === 'collider';

/** 3 significant figures below 1000, 4 above (5628, not 5630); a true minus sign; no "−0". */
function mev(x: number): string {
  const r = Number(x.toPrecision(10));
  if (Math.abs(r) < 5e-4) return '0';
  return sci(r, Math.abs(r) >= 1000 ? 4 : 3).replace('-', '−');
}

/** First-strong isolate and pop-directional isolate: keep Latin symbols inside a plain Hebrew string in place. */
const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);
const iso = (s: string) => `${FSI}${s}${PDI}`;

/** Hebrew text with Latin and Greek symbols isolated, so the bidi algorithm keeps the Hebrew word order. */
function he(text: string) {
  return text
    .split(/([A-Za-zα-ωΑ-Ω√](?:[A-Za-zα-ωΑ-Ω⁰⁺⁻₁₂*′²√()+→ ]*[A-Za-zα-ωΑ-Ω⁰⁺⁻₁₂*′²)])?)/)
    .map((part, i) => (i % 2 === 1 ? <bdi key={i}>{part}</bdi> : part));
}

function initial(p: DecayLabProps): LabState {
  const reaction = isReaction(p.reaction) ? p.reaction : 'pbar';
  const setup = isSetup(p.setup) ? p.setup : 'fixed';
  return {
    preset: isPreset(p.preset) ? p.preset : 'pi',
    beta: roundBeta(p.beta ?? 0),
    theta: roundTheta(p.theta ?? 60),
    reaction,
    setup,
    k: roundK(p.k ?? 3000, REACTIONS[reaction], setup),
  };
}

/** Everything the decay drawing, the readout and the tasks need. */
function decayState(s: LabState) {
  const d = DECAYS[s.preset];
  const th = (s.theta * Math.PI) / 180;
  const rest = decayAtRest(d.M, d.m1, d.m2, th);
  const lab = rest.map((q) => fromPrimed(q, s.beta)) as [FourMomentum, FourMomentum];
  const parent = movingAt(d.M, s.beta);
  const [K1, K2] = decayKinetic(d.M, d.m1, d.m2);
  const newton = d.m1 > 0 && d.m2 > 0 ? classicalDecay(d.M, d.m1, d.m2) : null;
  return {
    d,
    rest,
    lab,
    parent,
    pStar: decayMomentum(d.M, d.m1, d.m2),
    Q: decayQ(d.M, d.m1, d.m2),
    K1,
    K2,
    newton,
    sum: total(lab),
    mass: invariantMass(lab),
    open: (openingAngle(lab[0], lab[1]) * 180) / Math.PI,
    gamma: gammaOf(s.beta),
  };
}

/** Everything the threshold drawing, the readout and the tasks need. */
function thresholdState(s: LabState) {
  const r = REACTIONS[s.reaction];
  const sum = sumOf(r);
  const kFixed = thresholdKineticFixedTarget(r.m, r.m, sum);
  const kCollider = thresholdKineticCollider(r.m, sum);
  const rootS = s.setup === 'fixed' ? sqrtSFixedTarget(s.k, r.m, r.m) : sqrtSCollider(s.k, r.m);
  // above the threshold to the slider's resolution: the step that crosses Σm_f counts
  const above = rootS >= sum - 1e-6;
  const bcmTh = s.setup === 'fixed' ? cmBetaFixedTarget(kFixed, r.m, r.m) : 0;
  const bcm = s.setup === 'fixed' ? cmBetaFixedTarget(s.k, r.m, r.m) : 0;
  return { r, sum, kFixed, kCollider, rootS, above, bcmTh, bcm, kTh: s.setup === 'fixed' ? kFixed : kCollider };
}

export default function DecayLab(props: DecayLabProps) {
  const mode = props.mode ?? 'decay';
  const [s, setS] = useState<LabState>(() => initial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const sRef = useRef(s);
  sRef.current = s;

  // text steps set the state; they never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next = { ...prev };
          if (isPreset(st.preset)) next.preset = st.preset;
          if (typeof st.beta === 'number') next.beta = roundBeta(st.beta);
          if (typeof st.theta === 'number') next.theta = roundTheta(st.theta);
          if (isReaction(st.reaction)) next.reaction = st.reaction;
          if (isSetup(st.setup)) next.setup = st.setup;
          next.k = roundK(typeof st.k === 'number' ? st.k : next.k, REACTIONS[next.reaction], next.setup);
          return next;
        });
      }),
    [props.id],
  );

  /** Judge the tasks for a state the learner produced (called only from the learner's handlers). */
  const judge = (next: LabState, cause: 'preset' | 'beta' | 'theta' | 'reaction' | 'setup' | 'k') => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (mode === 'decay') {
      const k = decayState(next);
      if (has('equal') && cause === 'preset' && next.preset === 'k0') done('equal');
      if (has('boost') && cause === 'beta' && next.beta >= 0.5 - 1e-9) done('boost');
      if (has('forward') && next.beta > 0 && k.open < 90 - 1e-9) done('forward');
    } else {
      const t = thresholdState(next);
      if (has('cross') && next.reaction === 'pbar' && next.setup === 'fixed' && t.above) done('cross');
      // the minimum, found to within 10%: switching to head on with a large K is not finding it
      if (has('collider') && next.setup === 'collider' && t.above && next.k <= 1.1 * t.kCollider) done('collider');
      if (has('pion') && next.reaction === 'pi0' && next.setup === 'fixed' && t.above) done('pion');
    }
  };

  const learnerSet = (patch: Partial<LabState>, cause: Parameters<typeof judge>[1]) => {
    const next = { ...sRef.current, ...patch };
    next.k = roundK(next.k, REACTIONS[next.reaction], next.setup);
    setS(next);
    judge(next, cause);
  };

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(mode, s)), 700);
    return () => clearTimeout(h);
  }, [mode, s.preset, s.beta, s.theta, s.reaction, s.setup, s.k]);

  const aspect = mode === 'decay' ? 1.3 : 1.1;
  const draw = ({ ctx, view, palette: p }: FrameInfo) => (mode === 'decay' ? paintDecay(ctx, view, p, s) : paintThreshold(ctx, view, p, s));
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: aspect * 10, worldHeight: 10, animate: false });
  useEffect(invalidate, [s]);

  const reset = () => {
    setS(initial(props));
    setLive('האיור חזר למצב ההתחלה.');
  };

  if (mode === 'decay') {
    const k = decayState(s);
    const d = k.d;
    return (
      <SimShell
        fig={props.id}
        label={`איור חי: דעיכה של חלקיק לשני חלקיקים, במערכת המנוחה שלו ובמערכת המעבדה. ${describe(mode, s)}`}
        canvasRef={canvasRef}
        aspect={aspect}
        live={live}
        tasks={tasks}
        onReset={reset}
        readout={
          <>
            <span data-readout="q">
              {he(`${PRESET_LABEL(d)}:`)} <b class="q" dir="ltr">Q = {mev(k.Q)} MeV</b>
            </span>
            <span data-readout="pstar">
              {he('גודל התנע של כל תוצר, במערכת המנוחה:')} <b class="q" dir="ltr">p* = {mev(k.pStar)} MeV/c</b>
            </span>
            <span data-readout="k1">
              {he(`האנרגיה הקינטית של ${d.n1}:`)} <b class="q" dir="ltr">{mev(k.K1)} MeV</b>
            </span>
            <span data-readout="k2">
              {he(`האנרגיה הקינטית של ${d.n2}:`)} <b class="q" dir="ltr">{mev(k.K2)} MeV</b>
            </span>
            {k.newton && (
              <span data-readout="newton">
                {he('החלוקה של ניוטון:')}{' '}
                <b class="q" dir="ltr">
                  {mev(k.newton.K1)} + {mev(k.newton.K2)} MeV
                </b>
              </span>
            )}
            <span data-readout="lab-e">
              {he('במעבדה, סכום האנרגיות:')}{' '}
              <b class="q" dir="ltr">
                {mev(k.lab[0].E)} + {mev(k.lab[1].E)} = {mev(k.sum.E)} MeV = γMc²
              </b>
            </span>
            <span data-readout="lab-p">
              {he('במעבדה, התנע הכולל:')}{' '}
              <b class="q" dir="ltr">
                p(x) = {mev(k.sum.px)}, p(y) = {mev(k.sum.py)} MeV/c; γβMc = {mev(k.parent.px)}
              </b>
            </span>
            <span data-readout="mass">
              {he('המסה האינווריאנטית של התוצרים, מהמספרים של המעבדה:')} <b class="q" dir="ltr">{mev(k.mass)} MeV/c²</b>
            </span>
            <span data-readout="angle">
              {he('הזווית בין התוצרים במעבדה:')} <b class="q" dir="ltr">{mev(k.open)}°</b>
            </span>
          </>
        }
        controls={
          <>
            <div class="group" role="group" aria-label="איזו דעיכה">
              {PRESET_IDS.map((id) => (
                <Toggle key={id} label={<bdi dir="ltr">{PRESET_LABEL(DECAYS[id])}</bdi>} on={s.preset === id} onChange={() => learnerSet({ preset: id }, 'preset')} />
              ))}
            </div>
            <Slider
              label={`מהירות ${iso(d.parent)} במעבדה`}
              min={0}
              max={BETA_MAX}
              step={0.01}
              value={s.beta}
              format={(v) => `${mev(v)}c`}
              onChange={(v) => learnerSet({ beta: roundBeta(v) }, 'beta')}
            />
            <Slider
              label={`הכיוון של ${iso(d.n1)} במערכת המנוחה`}
              min={0}
              max={180}
              step={5}
              value={s.theta}
              format={(v) => `${Math.round(v)}°`}
              onChange={(v) => learnerSet({ theta: roundTheta(v) }, 'theta')}
            />
          </>
        }
      />
    );
  }

  const t = thresholdState(s);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: אנרגיית סף של תגובה שיוצרת חלקיקים, במטרה נייחת ובהתנגשות חזיתית. ${describe(mode, s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="reaction">
            {he('התגובה:')} <b class="q" dir="ltr">{t.r.label}</b>
          </span>
          <span data-readout="sqrt-s">
            {he('האנרגיה במערכת מרכז המסה:')} <b class="q" dir="ltr">√s = {mev(t.rootS)} MeV</b>
          </span>
          <span data-readout="need">
            {he('סכום אנרגיות המנוחה של התוצרים:')} <b class="q" dir="ltr">{mev(t.sum)} MeV</b>
          </span>
          <span data-readout="status">
            <b>{t.above ? 'מעל הסף: התגובה אפשרית' : 'מתחת לסף: התגובה לא יכולה לקרות'}</b>
          </span>
          <span data-readout="kth-fixed">
            {he('אנרגיית הסף, מטרה נייחת:')} <b class="q" dir="ltr">{mev(t.kFixed)} MeV</b>
          </span>
          <span data-readout="kth-collider">
            {he('אנרגיית הסף, התנגשות חזיתית (לכל קרן):')} <b class="q" dir="ltr">{mev(t.kCollider)} MeV</b>
          </span>
          <span data-readout="beta-cm">
            {he('מהירות מרכז המסה במעבדה:')} <b class="q" dir="ltr">{mev(t.bcm)}c</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="איזו תגובה">
            {(['pbar', 'pi0'] as const).map((id) => (
              <Toggle key={id} label={<bdi dir="ltr">{REACTIONS[id].label}</bdi>} on={s.reaction === id} onChange={() => learnerSet({ reaction: id }, 'reaction')} />
            ))}
          </div>
          <div class="group" role="group" aria-label="סוג המאיץ">
            <Toggle label="מטרה נייחת" on={s.setup === 'fixed'} onChange={() => learnerSet({ setup: 'fixed' }, 'setup')} />
            <Toggle label="התנגשות חזיתית" on={s.setup === 'collider'} onChange={() => learnerSet({ setup: 'collider' }, 'setup')} />
          </div>
          <Slider
            label={s.setup === 'fixed' ? 'האנרגיה הקינטית של פרוטון הקרן' : 'האנרגיה הקינטית של כל פרוטון'}
            min={0}
            max={t.r.kMax[s.setup]}
            step={t.r.kStep}
            value={s.k}
            format={(v) => `${mev(v)} MeV`}
            onChange={(v) => learnerSet({ k: roundK(v, t.r, s.setup) }, 'k')}
          />
        </>
      }
    />
  );
}

function describe(mode: 'decay' | 'threshold', s: LabState): string {
  if (mode === 'decay') {
    const k = decayState(s);
    const d = k.d;
    return `${PRESET_LABEL(d)}. במערכת המנוחה התוצרים יוצאים גב אל גב, עם תנע ${mev(k.pStar)} MeV/c כל אחד; ${d.n1} מקבל ${mev(k.K1)} MeV ו-${d.n2} מקבל ${mev(k.K2)} MeV מתוך ${mev(k.Q)}. במעבדה החלקיק הדועך נע במהירות ${mev(s.beta)}c, והזווית בין התוצרים ${mev(k.open)} מעלות.`;
  }
  const t = thresholdState(s);
  const where = s.setup === 'fixed' ? 'מטרה נייחת' : 'התנגשות חזיתית';
  return `${t.r.label}, ${where}. אנרגיה קינטית ${mev(s.k)} MeV, שורש s שווה ${mev(t.rootS)} MeV, והתוצרים צריכים ${mev(t.sum)} MeV: ${t.above ? 'מעל הסף' : 'מתחת לסף'}.`;
}

// ---------------------------------------------------------------- drawing: the decay

function label(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, o: { color?: string; align?: CanvasTextAlign; size?: number; weight?: number; rtl?: boolean; base?: CanvasTextBaseline } = {}) {
  ctx.save();
  ctx.font = `${o.weight ?? 500} ${o.size ?? 11}px ${p.fontUi}`;
  ctx.direction = o.rtl ? 'rtl' : 'ltr';
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.base ?? 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function dashedLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 1.5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** An arrow for a momentum (px, py) from (ox, oy), at `scale` px per MeV, y up; its magnitude written past its tip. */
function momentumArrow(ctx: CanvasRenderingContext2D, p: Palette, ox: number, oy: number, q: FourMomentum, scale: number, name: string, color: string) {
  const x2 = ox + q.px * scale;
  const y2 = oy - q.py * scale;
  arrow(ctx, ox, oy, x2, y2, { color, width: 2.4, head: 10 });
  const L = Math.hypot(x2 - ox, y2 - oy);
  const ux = L > 1 ? (x2 - ox) / L : 1;
  const uy = L > 1 ? (y2 - oy) / L : 0;
  label(ctx, p, `${name}  ${mev(Math.hypot(q.px, q.py))}`, x2 + ux * 16, y2 + uy * 14, { color: p.ink, size: 11, weight: 600 });
}

function paintDecay(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: LabState) {
  const k = decayState(s);
  const d = k.d;
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, v.w, v.h);

  const barH = Math.max(84, v.h * 0.28);
  const top = 8;
  const panelH = v.h - barH - top;
  const gap = 10;
  const pw = (v.w - 3 * gap) / 2;
  const panels = [
    { x: gap, title: `מערכת המנוחה של ${d.parent}` },
    { x: 2 * gap + pw, title: 'מערכת המעבדה' },
  ];
  for (const pan of panels) {
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(pan.x, top, pw, panelH);
    ctx.restore();
    // under the panel: the top-right corner of the canvas holds the reset and fullscreen buttons
    label(ctx, p, pan.title, pan.x + pw / 2, top + panelH + 12, { rtl: true, weight: 700, size: 12 });
  }

  // rest frame: the parent at the centre, the products back to back with equal |p*|
  {
    const cx = panels[0].x + pw / 2;
    const cy = top + panelH / 2;
    // leave room past each tip for the written magnitude (~46 px), or on a phone the labels of the two panels meet
    const scale = k.pStar > 0 ? Math.max(12, Math.min(Math.min(pw, panelH) * 0.32, pw * 0.5 - 46)) / k.pStar : 0;
    // the x axis of both frames
    dashedLine(ctx, panels[0].x + 8, cy, panels[0].x + pw - 8, cy, withAlpha(p.ink3, 0.6), 1);
    momentumArrow(ctx, p, cx, cy, k.rest[0], scale, d.n1, p.momentum);
    momentumArrow(ctx, p, cx, cy, k.rest[1], scale, d.n2, withAlpha(p.momentum, 0.7));
    dot(ctx, cx, cy, 6, p.paper, p.ink);
    label(ctx, p, `${d.parent} (v = 0)`, cx, top + panelH - 14, { color: p.ink2 });
  }

  // lab: the parent's momentum dashed; p₁ and p₂ from the decay point; p₂ again from the tip of p₁
  {
    const x0 = panels[1].x;
    const cy = top + panelH / 2;
    const ox = x0 + pw * 0.4;
    const mags = [Math.hypot(k.lab[0].px, k.lab[0].py), Math.hypot(k.lab[1].px, k.lab[1].py), k.parent.px, 1e-9];
    const big = Math.max(...mags);
    // keep every arrow and its magnitude inside the panel: forward room 0.6·pw − 40 px, backward 0.4·pw − 40 px
    const scale = Math.min((pw * 0.6 - 46) / big, (pw * 0.4 - 30) / big, (panelH * 0.42) / big);
    dashedLine(ctx, x0 + 8, cy, x0 + pw - 8, cy, withAlpha(p.ink3, 0.6), 1);
    if (k.parent.px > 0) {
      const tx = ox + k.parent.px * scale;
      dashedLine(ctx, ox, cy, tx, cy, p.ink, 2);
      // just the name: its value is in the readout, and a long label here collides with the products' labels
      label(ctx, p, 'P', tx - 6, cy + 13, { color: p.ink, size: 12, weight: 700 });
      // the triangle: p₂ drawn again from the tip of p₁ ends at the tip of P
      const ax = ox + k.lab[0].px * scale;
      const ay = cy - k.lab[0].py * scale;
      dashedLine(ctx, ax, ay, ax + k.lab[1].px * scale, ay - k.lab[1].py * scale, withAlpha(p.momentum, 0.55), 1.4);
    }
    momentumArrow(ctx, p, ox, cy, k.lab[0], scale, d.n1, p.momentum);
    momentumArrow(ctx, p, ox, cy, k.lab[1], scale, d.n2, withAlpha(p.momentum, 0.7));
    dot(ctx, ox, cy, 6, p.paper, p.ink);
    const vy = top + panelH - 14;
    if (s.beta > 0) {
      const vlen = s.beta * pw * 0.3;
      arrow(ctx, x0 + 12, vy, x0 + 12 + vlen, vy, { color: p.velocity, width: 2, head: 8 });
      label(ctx, p, `v = ${mev(s.beta)}c`, x0 + 20 + vlen, vy, { align: 'left', color: p.velocity });
    } else label(ctx, p, `${d.parent} (v = 0)`, x0 + pw / 2, vy, { color: p.ink2 });
  }

  // the bar of Q split into the two kinetic energies (rest frame)
  {
    const bx = gap + 6;
    const bw = v.w - 2 * gap - 12;
    const by = v.h - barH + 46;
    const bh = 14;
    const f1 = k.Q > 0 ? k.K1 / k.Q : 0.5;
    ctx.save();
    ctx.fillStyle = p.energyK;
    ctx.fillRect(bx, by, bw * f1, bh);
    ctx.fillStyle = withAlpha(p.energyK, 0.35);
    ctx.fillRect(bx + bw * f1, by, bw * (1 - f1), bh);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.restore();
    const tick = (fx: number, text: string, color: string) => {
      const x = bx + bw * fx;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, by - 6);
      ctx.lineTo(x, by + bh + 2);
      ctx.stroke();
      ctx.restore();
      label(ctx, p, text, x, by - 13, { color, size: 10, rtl: true });
    };
    tick(0.5, 'חצי', p.ink2);
    if (k.newton) tick(k.newton.K1 / k.Q, 'ניוטון', p.accent);
    label(ctx, p, `K(${d.n1}) = ${mev(k.K1)}`, bx, by + bh + 12, { align: 'left', size: 11, weight: 600 });
    label(ctx, p, `K(${d.n2}) = ${mev(k.K2)}`, bx + bw, by + bh + 12, { align: 'right', size: 11, weight: 600 });
    label(ctx, p, `Q = ${mev(k.Q)} MeV`, bx + bw / 2, by + bh + 12, { size: 11, color: p.ink2 });
  }
}

// ---------------------------------------------------------------- drawing: the threshold

function cluster(ctx: CanvasRenderingContext2D, p: Palette, cx: number, cy: number, masses: number[]) {
  const n = masses.length;
  masses.forEach((m, i) => {
    const r = m > 500 ? 8 : 5;
    const x = cx + (i - (n - 1) / 2) * 15;
    const y = cy + (i % 2 ? 7 : -7);
    dot(ctx, x, y, r, withAlpha(p.ink3, 0.25), p.ink);
  });
}

function paintThreshold(ctx: CanvasRenderingContext2D, v: View, p: Palette, s: LabState) {
  const t = thresholdState(s);
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, v.w, v.h);

  // top band: before, and the products at threshold
  const bandH = Math.max(96, v.h * 0.27);
  // below the corner buttons (8…42 px)
  const midY = Math.max(54, (bandH - 20) / 2);
  const half = v.w / 2;
  // the titles under the pictures: the top-right corner holds the reset and fullscreen buttons
  label(ctx, p, 'לפני ההתנגשות', half / 2, bandH - 12, { rtl: true, weight: 700, size: 12 });
  label(ctx, p, 'אחרי, בסף', half + half / 2, bandH - 12, { rtl: true, weight: 700, size: 12 });
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.beginPath();
  ctx.moveTo(half, 26);
  ctx.lineTo(half, bandH - 4);
  ctx.stroke();
  ctx.restore();
  {
    const cx = half / 2;
    const len = Math.min(half * 0.32, 70);
    if (s.setup === 'fixed') {
      dot(ctx, cx - len - 10, midY, 8, withAlpha(p.ink3, 0.25), p.ink);
      arrow(ctx, cx - len, midY, cx - 12, midY, { color: p.velocity, width: 2.4, head: 9 });
      dot(ctx, cx + 14, midY, 8, withAlpha(p.ink3, 0.25), p.ink);
      label(ctx, p, 'v = 0', cx + 14, midY + 20, { color: p.ink2, size: 10 });
    } else {
      dot(ctx, cx - len - 4, midY, 8, withAlpha(p.ink3, 0.25), p.ink);
      arrow(ctx, cx - len + 6, midY, cx - 14, midY, { color: p.velocity, width: 2.4, head: 9 });
      dot(ctx, cx + len + 4, midY, 8, withAlpha(p.ink3, 0.25), p.ink);
      arrow(ctx, cx + len - 6, midY, cx + 14, midY, { color: p.velocity, width: 2.4, head: 9 });
    }
  }
  {
    const cx = half + half / 2 - 20;
    cluster(ctx, p, cx, midY, t.r.products);
    if (s.setup === 'fixed') {
      const n = t.r.products.length;
      const x1 = cx + ((n - 1) / 2) * 15 + 14;
      // the arrow and its speed label must end inside the canvas: 46 px kept for the label
      const alen = Math.max(10, Math.min(t.bcmTh * half * 0.35, v.w - x1 - 54));
      arrow(ctx, x1, midY, x1 + alen, midY, { color: p.velocity, width: 2.4, head: 9 });
      label(ctx, p, `${mev(t.bcmTh)}c`, x1 + alen + 4, midY + 14, { align: 'left', color: p.velocity, size: 11 });
    } else {
      label(ctx, p, 'v = 0', cx, midY + 22, { color: p.ink2, size: 10 });
    }
  }

  // the graph: √s against K, both setups
  const outer = { x: 0, y: bandH, w: v.w, h: v.h - bandH };
  const box = insetBox(outer, { l: 62, r: 16, t: 14, b: 46 });
  const kMax = t.r.kMax[s.setup];
  const active = (K: number) => (s.setup === 'fixed' ? sqrtSFixedTarget(K, t.r.m, t.r.m) : sqrtSCollider(K, t.r.m));
  const yMin = 2 * t.r.m * 0.92;
  const yMax = 1.15 * Math.max(t.sum, active(kMax));
  const plot = makePlot(
    box,
    { min: 0, max: kMax, label: 'האנרגיה הקינטית של כל פרוטון בקרן (MeV)' },
    // GeV ticks: short numbers leave room for the rotated title
    { min: yMin, max: yMax, label: 'האנרגיה במרכז המסה (GeV)', format: (x: number) => sci(x / 1000, 2) },
  );
  drawAxes(ctx, plot, p);
  const fixedColor = p.velocity;
  const colColor = p.energyK;
  // the line √s = Σm_f
  const sy = plot.py(t.sum);
  ctx.save();
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(box.x, sy);
  ctx.lineTo(box.x + box.w, sy);
  ctx.stroke();
  ctx.restore();
  label(ctx, p, `Σmc² = ${mev(t.sum)}`, box.x + box.w - 4, sy + 11, { align: 'right', color: p.accent, size: 11, weight: 600 });
  drawCurve(ctx, plot, (K) => sqrtSFixedTarget(K, t.r.m, t.r.m), { color: fixedColor, width: s.setup === 'fixed' ? 2.6 : 1.6 });
  drawCurve(ctx, plot, (K) => sqrtSCollider(K, t.r.m), { color: colColor, width: s.setup === 'collider' ? 2.6 : 1.6 });
  // the curves' names, inside the box
  {
    // head on: where the line is at 80% of the height (or at the right end); fixed target: near the right end
    const yc = yMin + 0.8 * (yMax - yMin);
    const kc = Math.min(kMax * 0.7, Math.max(0, yc / 2 - t.r.m));
    label(ctx, p, 'התנגשות חזיתית', plot.px(kc) + 10, plot.py(sqrtSCollider(kc, t.r.m)), { rtl: true, color: colColor, size: 11, weight: 600, align: 'left' });
    const kf = kMax * 0.97;
    const yf = sqrtSFixedTarget(kf, t.r.m, t.r.m);
    if (yf < yMax) label(ctx, p, 'מטרה נייחת', plot.px(kf), plot.py(yf) + 14, { rtl: true, color: fixedColor, size: 11, weight: 600, align: 'right' });
  }
  // the two thresholds
  for (const [kth, color] of [
    [t.kFixed, fixedColor],
    [t.kCollider, colColor],
  ] as const) {
    if (kth > kMax) continue;
    const x = plot.px(kth);
    ctx.save();
    ctx.strokeStyle = withAlpha(color, 0.7);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, sy);
    ctx.lineTo(x, box.y + box.h);
    ctx.stroke();
    ctx.restore();
  }
  // the present state on both curves, the active one full
  const yFixed = sqrtSFixedTarget(s.k, t.r.m, t.r.m);
  const yCol = sqrtSCollider(s.k, t.r.m);
  const yOther = s.setup === 'fixed' ? yCol : yFixed;
  if (yOther <= yMax) drawMarker(ctx, plot, s.k, yOther, withAlpha(s.setup === 'fixed' ? colColor : fixedColor, 0.4), { radius: 4 });
  drawMarker(ctx, plot, s.k, t.rootS, s.setup === 'fixed' ? fixedColor : colColor, { radius: 6, guides: true });
}
