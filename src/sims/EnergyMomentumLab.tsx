/**
 * EnergyMomentumLab: relativistic momentum and energy of one free particle (lesson 10.1).
 *
 * mode 'speed' (default): a β slider, and one graph against β = v/c from 0 to 1 of either the kinetic energy
 *   K/(mc²) = γ − 1 or the momentum p/(mc) = γβ (the toggle chooses), relativistic (solid, --energy-k or
 *   --momentum) against Newton's ½β² or β (dashed, ink). The line β = 1 is dashed in --accent: the relativistic
 *   curves rise without bound toward it, Newton's stay finite and cross it. A dotted level marks K = mc² or
 *   p = mc. Both curves carry a marker at the current β; a value above the graph's top is drawn as an arrow at the
 *   top edge. Everything is in units of mc and mc², so the picture is the same for every particle.
 * mode 'triangle': a particle (electron 0.511 MeV, muon 106 MeV, proton 938 MeV, or a massless photon) and its
 *   momentum pc (MeV, from a ladder of round values). Two panels:
 *   - the energy triangle, to scale: legs pc (--momentum, horizontal) and mc² (ink, vertical), hypotenuse E. Along
 *     the hypotenuse, the first mc² of its length (from the top) is ink and the rest is K = E − mc² (--energy-k).
 *     The angle θ between pc and E has cos θ = pc/E = β. For a photon the triangle flattens to E = pc.
 *   - the (pc, E) plane, both axes in MeV on one scale: the hyperbola E = √((pc)² + (mc²)²) of the particle, the
 *     light line E = pc (dashed --accent, the massless particle), Newton's E ≈ mc² + p²/(2m) (dashed ink), and the
 *     particle's point.
 * mode 'speed', show 'collision': the momentum thought experiment instead of a graph. Two identical balls: A thrown
 *   along +y at a small u in S, B along −y at u in S′ (moving at +v along x; the slider sets v). They meet in an
 *   elastic collision. Left (phone: top) in S, right (phone: bottom) in S′, the same picture turned half a turn with A
 *   and B swapped. Solid paths before, dashed after, labelled with the velocity (vₓ, v_y); the moving ball's y travel
 *   is shortened by 1/γ. The readout sums the changes of m·Δy/Δt (−2mu(1 − 1/γ), not zero) and of m·Δy/Δτ (zero).
 *
 * Physics: src/physics/relenergy.ts (pOverMc, kOverMc2, kineticRatio, collisionYMomentumChange, energyFromMomentumMev,
 * kineticFromMomentumMev, classicalKineticFromMomentumMev) and src/physics/relativity.ts (gammaOf). Units: c = 1;
 * energies and pc in MeV. Rest energies are the lesson's data (0.511, 106, 938 MeV). Nothing animates.
 *
 * Props (Astro wrapper: <Spread fig="fig-10-1a" figure={EnergyMomentumLab} figureProps={{ mode: 'speed', … }}>)
 *   id        figure id (Spread passes it); steps address the figure by it, tasks are `${id}:${task}`
 *   mode      'speed' | 'triangle'                                                         (default 'speed')
 *   speed:    beta (0…0.99, default 0.6), show ('K' | 'p' | 'collision', default 'K')
 *   triangle: particle ('electron' | 'muon' | 'proton' | 'photon', default 'electron'), pc (MeV, snapped to the
 *             ladder 0.1, 0.2, 0.5, 1, 2, 5, …, 5000; default 1)
 *   tasks     task ids to show (below)
 *
 * Step `set` keys: speed: beta, show. triangle: particle, pc.
 *
 * Tasks, ticked only inside the learner's own handlers (the slider, the toggles), never by a step, and never in the
 * 'collision' view:
 *   small     speed: the learner sets 0 < β ≤ 0.1: K and ½mv² agree to better than 1%
 *   double    speed: the learner reaches a β where K is at least twice ½mv² (β ≥ 0.79)
 *   beyond-mc speed: with the momentum graph shown, the learner reaches p > mc (β > 0.71) though v < c
 *   near-c    speed: the learner sets β ≥ 0.95
 *   massless  triangle: with the photon chosen, the learner changes pc: β stays exactly 1
 *   same-p    triangle: at one pc, the learner looks at three or more particles (the speeds are ranked by mass)
 *   newton    triangle: a massive particle with 0 < pc ≤ 0.1 mc²: K and p²/(2m) agree to better than 1%
 *   ultra     triangle: a massive particle with pc ≥ 10 mc²: E and pc agree to better than 1%
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { gammaOf } from '~/physics/relativity';
import {
  classicalKineticFromMomentumMev,
  collisionYMomentumChange,
  energyFromMomentumMev,
  kOverMc2,
  kineticFromMomentumMev,
  kineticRatio,
  pOverMc,
} from '~/physics/relenergy';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawCurve, drawMarker, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type EnergyMomentumMode = 'speed' | 'triangle';
export type Particle = 'electron' | 'muon' | 'proton' | 'photon';

const TASK_LABEL: Record<string, string> = {
  small: 'קבעו מהירות של 0.1c או פחות (לא אפס). בכמה שונות שתי האנרגיות הקינטיות?',
  double: 'מצאו מהירות שבה האנרגיה הקינטית האמיתית גדולה פי 2 לפחות מ-½mv².',
  'beyond-mc': 'הציגו את התנע, ומצאו מהירות שבה התנע גדול מ-mc, אף שהמהירות קטנה מ-c.',
  'near-c': 'קבעו מהירות של 0.95c או יותר. מה עושות העקומות היחסותיות ליד β = 1?',
  massless: 'בחרו פוטון ושנו את התנע שלו. מה קורה למהירות?',
  'same-p': 'קבעו תנע אחד, ועברו בין שלושה חלקיקים לפחות. מי מהיר יותר?',
  newton: 'בחרו חלקיק בעל מסה ותנע קטן, pc עד עשירית מ-mc². האם הקירוב p²/2m טוב?',
  ultra: 'בחרו חלקיק בעל מסה ותנע גדול, pc לפחות פי 10 מ-mc². מה היחס בין E ל-pc?',
};

/** Rest energies [MeV]: the lesson's data, stated in its text. */
const REST: Record<Particle, number> = { electron: 0.511, muon: 106, proton: 938, photon: 0 };
const NAME_HE: Record<Particle, string> = { electron: 'אלקטרון', muon: 'מיואון', proton: 'פרוטון', photon: 'פוטון' };
const PARTICLES: Particle[] = ['electron', 'muon', 'proton', 'photon'];
/** pc [MeV]: round values on a 1-2-5 ladder */
const PC_LADDER = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

export interface EnergyMomentumLabProps {
  id: string;
  mode?: EnergyMomentumMode;
  beta?: number;
  show?: 'K' | 'p';
  particle?: Particle;
  pc?: number;
  tasks?: string[];
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const BETA_MAX = 0.99;
const snapBeta = (x: number): number => clamp(Math.round(x * 100) / 100, 0, BETA_MAX);
/** 3 significant figures, a true minus sign, no "−0" */
const num = (x: number): string => (Math.abs(x) < 1e-12 ? '0' : sci(x, 3).replace('-', '−'));
/** the index of the ladder value nearest to pc (log distance) */
const pcIndex = (pc: number): number => {
  let best = 0;
  for (let i = 1; i < PC_LADDER.length; i++) if (Math.abs(Math.log(PC_LADDER[i] / pc)) < Math.abs(Math.log(PC_LADDER[best] / pc))) best = i;
  return best;
};
/** β near 1 written as 1 − ε, so 0.999987 does not read as 1 */
const betaText = (b: number, oneMinus: number): string => (oneMinus === 0 ? '1' : b > 0.995 ? `1 − ${sci(oneMinus, 2)}` : num(b));

/* ================================================================== text on the canvas */

interface TextOpts {
  color?: string;
  size?: number;
  italic?: boolean;
  align?: CanvasTextAlign;
  weight?: number;
}

/** Latin/math label, LTR, italic by default, centred on (x, y) unless aligned. */
function mathText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: TextOpts = {}): number {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${o.italic === false ? '' : 'italic '}${o.weight ?? 700} ${o.size ?? 14}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/** Hebrew label, RTL; its right edge at x unless aligned. */
function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: TextOpts = {}): number {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = o.align ?? 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `${o.weight ?? 600} ${o.size ?? 13}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink2;
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function panel(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, alpha: number) {
  ctx.save();
  ctx.fillStyle = withAlpha(p.paper2, alpha);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

/** keep the canvas aspect in step with its width: taller on a phone */
function useAspect(canvasRef: { current: HTMLCanvasElement | null }, wide: number, narrow: number, set: (a: number) => void) {
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => set(el.getBoundingClientRect().width < 520 ? narrow : wide));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
}

/* ================================================================== the component */

export default function EnergyMomentumLab(props: EnergyMomentumLabProps) {
  return props.mode === 'triangle' ? <Triangle {...props} /> : <Speed {...props} />;
}

/* ------------------------------------------------------------------ mode 'speed' */

type Show = 'K' | 'p' | 'collision';

interface SpeedState {
  beta: number;
  show: Show;
}

const speedInitial = (p: EnergyMomentumLabProps): SpeedState => ({ beta: snapBeta(p.beta ?? 0.6), show: p.show ?? 'K' });

function speedNumbers(b: number) {
  const g = gammaOf(b);
  const p = pOverMc(b);
  const k = kOverMc2(b);
  const kN = 0.5 * b * b;
  return { g, p, k, kN, ratio: kineticRatio(b) };
}

function Speed(props: EnergyMomentumLabProps) {
  const [s, setS] = useState<SpeedState>(() => speedInitial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string): boolean => props.tasks?.includes(t) ?? false;
  const done = (t: string) => markTask(`${props.id}:${t}`);

  /** a change the learner made: apply it, then judge the tasks (never from an effect or a step) */
  const change = (patch: Partial<SpeedState>) => {
    const next = { ...s, ...patch };
    setS(next);
    const b = next.beta;
    // the graph tasks are judged on the graphs only, not on the thought-experiment view
    if (next.show === 'collision') return;
    if (has('small') && b > 0 && b <= 0.1 + 1e-9) done('small');
    if (has('double') && b > 0 && kineticRatio(b) >= 2) done('double');
    if (has('beyond-mc') && next.show === 'p' && pOverMc(b) > 1) done('beyond-mc');
    if (has('near-c') && b >= 0.95 - 1e-9) done('near-c');
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.beta === 'number') next.beta = snapBeta(st.beta);
          if (st.show === 'K' || st.show === 'p' || st.show === 'collision') next.show = st.show;
          return next;
        });
      }),
    [props.id],
  );

  useEffect(() => {
    const h = setTimeout(() => setLive(speedDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.beta, s.show]);

  const [aspect, setAspect] = useState(1.45);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintSpeed(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1 / aspect, animate: false });
  useAspect(canvasRef, 1.45, 0.9, setAspect);
  useEffect(invalidate, [s, aspect]);

  const reset = () => {
    setS(speedInitial(props));
    setLive('האיור חזר למצב ההתחלה.');
  };

  const k = speedNumbers(s.beta);
  const collision = s.show === 'collision';
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: התנע והאנרגיה הקינטית של גוף לפי המהירות שלו, יחסותי מול ניוטון, וניסוי מחשבתי של התנגשות בשתי מערכות ייחוס. ${speedDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        collision ? (
          <>
            <span data-readout="beta">
              המהירות של S′ ביחס ל-S: <b class="q" dir="ltr">β = {num(s.beta)}, γ = {num(k.g)}</b>
            </span>
            <span data-readout="newton-sum">
              ניוטון, סכום השינויים של <span dir="ltr">mΔy/Δt</span> במערכת S: <b class="q" dir="ltr">−2mu + 2mu/γ = {num(newtonImbalance(s.beta))} mu</b>
            </span>
            <span data-readout="proper-sum">
              עם הזמן העצמי, סכום השינויים של <span dir="ltr">mΔy/Δτ</span>: <b class="q" dir="ltr">−2mu + 2mu = 0</b>
            </span>
          </>
        ) : (
        <>
          <span data-readout="beta">
            מהירות: <b class="q" dir="ltr">β = {num(s.beta)}, γ = {num(k.g)}</b>
          </span>
          <span data-readout="p">
            תנע יחסותי: <b class="q" dir="ltr">p = {num(k.p)} mc</b>
          </span>
          <span data-readout="p-newton">
            ניוטון: <b class="q" dir="ltr">mv = {num(s.beta)} mc</b>
          </span>
          <span data-readout="k">
            אנרגיה קינטית: <b class="q" dir="ltr">K = {num(k.k)} mc²</b>
          </span>
          <span data-readout="k-newton">
            ניוטון: <b class="q" dir="ltr">½mv² = {num(k.kN)} mc²</b>
          </span>
          <span data-readout="ratio">
            היחס: <b class="q" dir="ltr">K/(½mv²) = {num(k.ratio)}</b>
          </span>
        </>
        )
      }
      controls={
        <>
          <Slider
            label={collision ? 'המהירות v של S′ ביחס ל-S' : 'המהירות של הגוף'}
            min={0}
            max={BETA_MAX}
            step={0.01}
            value={s.beta}
            format={(x) => `${num(x)}c`}
            onChange={(x) => change({ beta: snapBeta(x) })}
          />
          <div class="group" role="group" aria-label="מה מציגים באיור">
            <Toggle label="אנרגיה קינטית" on={s.show === 'K'} onChange={() => change({ show: 'K' })} />
            <Toggle label="תנע" on={s.show === 'p'} onChange={() => change({ show: 'p' })} />
            <Toggle label="ניסוי מחשבתי" on={collision} onChange={() => change({ show: 'collision' })} />
          </div>
        </>
      }
    />
  );
}

function speedDescribe(s: SpeedState): string {
  const k = speedNumbers(s.beta);
  if (s.show === 'collision') {
    return `ניסוי מחשבתי: המערכת S′ נעה ביחס ל-S במהירות ${num(s.beta)} c, גורם לורנץ ${num(k.g)}. במערכת S הכדור A עולה ויורד לאורך y במהירות u, והכדור B חולף לאורך x ומהירותו לאורך y רק u חלקי ${num(k.g)}. סכום השינויים של mv לאורך y הוא ${num(newtonImbalance(s.beta))} כפול mu, לא אפס.`;
  }
  return `המהירות ${num(s.beta)} c. התנע ${num(k.p)} כפול mc, לפי ניוטון ${num(s.beta)}. האנרגיה הקינטית ${num(k.k)} כפול mc בריבוע, לפי ניוטון ${num(k.kN)}.`;
}

/** Newton's total change of y momentum in the thought experiment, in units of mu: −2(1 − 1/γ) */
const newtonImbalance = (b: number): number => collisionYMomentumChange(b, 1e-3).newton / 1e-3;

const Y_MAX = 4;

function paintSpeed(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: SpeedState) {
  if (s.show === 'collision') {
    paintCollision(ctx, view, p, s.beta);
    return;
  }
  const { w, h } = view;
  const r: Rect = { x: 0, y: 0, w, h };
  panel(ctx, p, r, 0.5);
  const narrow = w < 520;
  const box = { x: 58, y: narrow ? 64 : 50, w: w - 58 - (narrow ? 18 : 30), h: h - (narrow ? 64 : 50) - 52 };
  const isK = s.show === 'K';
  const plot = makePlot(
    box,
    { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1], format: (v) => sci(v, 2), label: 'המהירות, β = v/c' },
    { min: 0, max: Y_MAX, ticks: [0, 1, 2, 3, 4], format: (v) => String(v), label: isK ? 'K / mc²' : 'p / mc' },
  );
  drawAxes(ctx, plot, p);

  // the asymptote β = 1, and the level K = mc² or p = mc
  dashedV(ctx, plot, 1, p.accent, [6, 4], 1.8);
  ctx.save();
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(plot.px(0), plot.py(1));
  ctx.lineTo(plot.px(1), plot.py(1));
  ctx.stroke();
  ctx.restore();
  mathText(ctx, p, isK ? 'K = mc²' : 'p = mc', plot.px(0) + 34, plot.py(1) - 10, { size: 12, color: p.ink3 });

  const color = isK ? p.energyK : p.momentum;
  const rel = (b: number) => (b >= 0.9995 ? NaN : isK ? kOverMc2(b) : pOverMc(b));
  const newton = (b: number) => (isK ? 0.5 * b * b : b);
  drawCurve(ctx, plot, newton, { color: p.ink2, dash: [6, 4], width: 2 });
  drawCurve(ctx, plot, rel, { color, width: 2.8, samples: 400 });

  // markers
  const b = s.beta;
  drawMarker(ctx, plot, b, newton(b), p.ink2, { radius: 4.5 });
  const y = rel(b);
  if (y <= Y_MAX) drawMarker(ctx, plot, b, y, color, { guides: true, radius: 6 });
  else {
    const sx = plot.px(b);
    arrow(ctx, sx, plot.py(Y_MAX) + 22, sx, plot.py(Y_MAX) - 2, { color, width: 2.2, head: 9 });
    mathText(ctx, p, num(y), sx - 8, plot.py(Y_MAX) + 14, { size: 12, color, align: 'right' });
  }

  // legend, top right inside the panel (below the corner buttons)
  const lx = w - (narrow ? 18 : 30);
  const ly = narrow ? 18 : 16;
  const legend = (row: number, text: string, c: string, dash: boolean) => {
    const yy = ly + row * 18 + (narrow ? 30 : 0);
    const tw = heText(ctx, p, text, lx - 34, yy, { size: 12, color: p.ink });
    ctx.save();
    ctx.strokeStyle = c;
    ctx.lineWidth = dash ? 2 : 2.8;
    ctx.setLineDash(dash ? [6, 4] : []);
    ctx.beginPath();
    ctx.moveTo(lx - 28, yy);
    ctx.lineTo(lx, yy);
    ctx.stroke();
    ctx.restore();
    return tw;
  };
  if (narrow) {
    legend(0, 'יחסותי', color, false);
    legend(1, 'ניוטון', p.ink2, true);
  } else {
    // the corner buttons sit at the top right: put the legend at the top left of the plot
    const x0 = box.x + 150;
    const draw2 = (row: number, word: string, formula: string, c: string, dash: boolean) => {
      const yy = ly + row * 18;
      ctx.save();
      ctx.strokeStyle = c;
      ctx.lineWidth = dash ? 2 : 2.8;
      ctx.setLineDash(dash ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(x0 + 6, yy);
      ctx.lineTo(x0 + 34, yy);
      ctx.stroke();
      ctx.restore();
      // Hebrew word and formula drawn apart: one mixed string in an RTL canvas reorders "½mv²" into "mv²½"
      const w = heText(ctx, p, `${word}:`, x0, yy, { size: 12, color: p.ink });
      mathText(ctx, p, formula, x0 - w - 5, yy, { size: 12, align: 'right', italic: false });
    };
    draw2(0, 'יחסותי', isK ? '(γ − 1)mc²' : 'γmv', color, false);
    draw2(1, 'ניוטון', isK ? '½mv²' : 'mv', p.ink2, true);
  }
}

/* ------------------------------------------------------------------ view 'collision' (the momentum thought experiment) */

/**
 * Two identical balls A and B. In S, A is thrown along +y at a small speed u; in S′ (moving at +v along x), B is
 * thrown along −y at u. They meet in an elastic collision and each one's y velocity reverses in its own frame. Left
 * (phone: top) the collision in S, right (phone: bottom) in S′: the same picture turned half a turn, with A and B
 * swapped. Solid paths before the collision, dashed after; labels are the velocity (vₓ, v_y). u is drawn enlarged;
 * the moving ball's vertical travel is shortened by 1/γ, so its V flattens as v grows.
 */
function paintCollision(ctx: CanvasRenderingContext2D, view: View, p: Palette, b: number) {
  const { w, h } = view;
  const narrow = w < 520;
  const g = gammaOf(b);
  const S: Rect = narrow ? { x: 0, y: 0, w, h: h / 2 } : { x: 0, y: 0, w: w / 2, h };
  const Sp: Rect = narrow ? { x: 0, y: h / 2, w, h: h / 2 } : { x: w / 2, y: 0, w: w / 2, h };
  collisionFrame(ctx, p, S, g, 1);
  collisionFrame(ctx, p, Sp, g, -1);
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (narrow) {
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
  } else {
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
  }
  ctx.stroke();
  ctx.restore();
}

/** one frame of the thought experiment; sgn = +1 for S, −1 for S′ (the picture turned half a turn) */
function collisionFrame(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, g: number, sgn: 1 | -1) {
  panel(ctx, p, r, sgn > 0 ? 0.5 : 0.3);
  const inS = sgn > 0;
  // title "במערכת S" (the Latin name left of the Hebrew word, so it reads right to left) and the other frame's motion
  const ty = r.y + 18;
  const wName = mathText(ctx, p, inS ? 'S' : 'S′', r.x + 14, ty, { size: 16, align: 'left' });
  const wHe = heText(ctx, p, 'במערכת', r.x + 14 + wName + 6, ty, { size: 13, weight: 700, color: p.ink, align: 'left' });
  const ax = r.x + 14 + wName + 6 + wHe + 18;
  if (inS) arrow(ctx, ax, ty, ax + 30, ty, { color: p.ink3, width: 1.6, head: 7 });
  else arrow(ctx, ax + 30, ty, ax, ty, { color: p.ink3, width: 1.6, head: 7 });
  mathText(ctx, p, inS ? 'S′: +v' : 'S: −v', ax + 38, ty, { size: 12, color: p.ink3, align: 'left' });

  const R = 9;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2 + 10;
  const H = Math.min(0.25 * r.h, 100);
  const W = Math.min(0.38 * r.w, 170);
  const dy = H / g; // the moving ball covers its y distance in a time longer by γ
  // a point of the S picture (screen coordinates about the contact point), turned half a turn in S′
  const P = (x: number, y: number): [number, number] => [cx + sgn * x, cy + sgn * y];

  const path = (a: [number, number], z: [number, number], dashed: boolean) => {
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 2;
    ctx.setLineDash(dashed ? [6, 4] : []);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(z[0], z[1]);
    ctx.stroke();
    ctx.restore();
    const L = Math.hypot(z[0] - a[0], z[1] - a[1]);
    const ux = (z[0] - a[0]) / L;
    const uy = (z[1] - a[1]) / L;
    const mx = (a[0] + z[0]) / 2;
    const my = (a[1] + z[1]) / 2;
    arrow(ctx, mx - ux * 8, my - uy * 8, mx + ux * 6, my + uy * 6, { color: p.ink2, width: 2, head: 9 });
  };
  // the vertical ball (A in S, B in S′): up to the contact point and back down (in S)
  path(P(-4, R + H), P(-4, R), false);
  path(P(4, R), P(4, R + H), true);
  // the moving ball (B in S, A in S′): in from the left, out to the right, its y travel shortened by γ
  path(P(-W, -R - dy), P(0, -R), false);
  path(P(0, -R), P(W, -R - dy), true);

  // velocity labels (vₓ, v_y), physics y up
  const vert = inS ? ['(0, +u)', '(0, −u)'] : ['(0, −u)', '(0, +u)'];
  const mov = inS ? ['(v, −u/γ)', '(v, +u/γ)'] : ['(−v, +u/γ)', '(−v, −u/γ)'];
  const [x1, y1] = P(-12, R + 0.55 * H);
  mathText(ctx, p, vert[0], x1, y1, { size: 12, color: p.velocity, align: inS ? 'right' : 'left' });
  const [x2, y2] = P(12, R + 0.55 * H);
  mathText(ctx, p, vert[1], x2, y2, { size: 12, color: p.velocity, align: inS ? 'left' : 'right' });
  const [x3, y3] = P(-0.6 * W, -R - 0.6 * dy - 16);
  mathText(ctx, p, mov[0], x3, y3, { size: 12, color: p.velocity });
  const [x4, y4] = P(0.6 * W, -R - 0.6 * dy - 16);
  mathText(ctx, p, mov[1], x4, y4, { size: 12, color: p.velocity });

  // the balls at the moment of contact
  const ball = (c: [number, number], name: string) => {
    ctx.save();
    ctx.fillStyle = p.paper;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c[0], c[1], R, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    mathText(ctx, p, name, c[0], c[1] + 1, { size: 12, italic: false });
  };
  ball(P(0, R), inS ? 'A' : 'B');
  ball(P(0, -R), inS ? 'B' : 'A');

  if (inS) {
    // axes (physics y up) and the legend, in the corners this picture leaves free
    const ox = r.x + 18;
    const oy = r.y + r.h - 14;
    arrow(ctx, ox, oy, ox + 28, oy, { color: p.ink3, width: 1.4, head: 6 });
    arrow(ctx, ox, oy, ox, oy - 28, { color: p.ink3, width: 1.4, head: 6 });
    mathText(ctx, p, 'x', ox + 36, oy, { size: 12, color: p.ink3 });
    mathText(ctx, p, 'y', ox, oy - 36, { size: 12, color: p.ink3 });
    const lx = r.x + r.w - 14;
    const legend = (row: number, text: string, dashed: boolean) => {
      const yy = r.y + r.h - 14 - row * 18;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 2;
      ctx.setLineDash(dashed ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(lx - 26, yy);
      ctx.lineTo(lx, yy);
      ctx.stroke();
      ctx.restore();
      heText(ctx, p, text, lx - 32, yy, { size: 12, color: p.ink });
    };
    legend(1, 'לפני ההתנגשות', false);
    legend(0, 'אחרי ההתנגשות', true);
  }
}

function dashedV(ctx: CanvasRenderingContext2D, plot: Plot, x: number, color: string, dash: number[], width: number) {
  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(plot.px(x), plot.box.y);
  ctx.lineTo(plot.px(x), plot.box.y + plot.box.h);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ mode 'triangle' */

interface TriState {
  particle: Particle;
  pci: number;
}

const triInitial = (p: EnergyMomentumLabProps): TriState => ({ particle: p.particle ?? 'electron', pci: pcIndex(p.pc ?? 1) });

function triNumbers(s: TriState) {
  const mc2 = REST[s.particle];
  const pc = PC_LADDER[s.pci];
  const E = energyFromMomentumMev(pc, mc2);
  const K = kineticFromMomentumMev(pc, mc2);
  const beta = pc / E;
  const oneMinus = (mc2 * mc2) / ((E + pc) * E); // 1 − β without cancellation
  const kN = mc2 > 0 ? classicalKineticFromMomentumMev(pc, mc2) : Infinity;
  return { mc2, pc, E, K, beta, oneMinus, kN };
}

function Triangle(props: EnergyMomentumLabProps) {
  const [s, setS] = useState<TriState>(() => triInitial(props));
  const [live, setLive] = useState('');
  const seenAtP = useRef<{ pci: number; set: Set<Particle> }>({ pci: -1, set: new Set() });
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string): boolean => props.tasks?.includes(t) ?? false;
  const done = (t: string) => markTask(`${props.id}:${t}`);

  const change = (patch: Partial<TriState>) => {
    const next = { ...s, ...patch };
    setS(next);
    const k = triNumbers(next);
    if (has('massless') && next.particle === 'photon' && patch.pci !== undefined && patch.pci !== s.pci) done('massless');
    if (has('same-p')) {
      const seen = seenAtP.current;
      if (seen.pci !== next.pci) seenAtP.current = { pci: next.pci, set: new Set([s.particle, next.particle]) };
      else seen.set.add(next.particle);
      if (seenAtP.current.set.size >= 3) done('same-p');
    }
    if (has('newton') && k.mc2 > 0 && k.pc <= 0.1 * k.mc2) done('newton');
    if (has('ultra') && k.mc2 > 0 && k.pc >= 10 * k.mc2) done('ultra');
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.particle === 'string' && st.particle in REST) next.particle = st.particle as Particle;
          if (typeof st.pc === 'number' && st.pc > 0) next.pci = pcIndex(st.pc);
          return next;
        });
      }),
    [props.id],
  );

  useEffect(() => {
    const h = setTimeout(() => setLive(triDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.particle, s.pci]);

  const [aspect, setAspect] = useState(1.75);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintTriangle(ctx, view, p, s);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1 / aspect, animate: false });
  useAspect(canvasRef, 1.75, 0.72, setAspect);
  useEffect(invalidate, [s, aspect]);

  const reset = () => {
    seenAtP.current = { pci: -1, set: new Set() };
    setS(triInitial(props));
    setLive('האיור חזר למצב ההתחלה.');
  };

  const k = triNumbers(s);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: משולש האנרגיה של חלקיק, והיפרבולה של האנרגיה לפי התנע. ${triDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="particle">
            {NAME_HE[s.particle]}: <b class="q" dir="ltr">mc² = {k.mc2 === 0 ? '0' : `${num(k.mc2)} MeV`}</b>
          </span>
          <span data-readout="pc">
            תנע: <b class="q" dir="ltr">pc = {num(k.pc)} MeV</b>
          </span>
          <span data-readout="e">
            אנרגיה יחסותית: <b class="q" dir="ltr">E = {num(k.E)} MeV</b>
          </span>
          <span data-readout="k">
            אנרגיה קינטית: <b class="q" dir="ltr">K = {num(k.K)} MeV</b>
          </span>
          <span data-readout="beta">
            מהירות: <b class="q" dir="ltr">β = pc/E = {betaText(k.beta, k.oneMinus)}</b>
          </span>
          <span data-readout="newton">
            ניוטון: <b class="q" dir="ltr">p²/2m = {Number.isFinite(k.kN) ? `${num(k.kN)} MeV` : '∞'}</b>
          </span>
        </>
      }
      controls={
        <>
          <Slider
            label="התנע, pc"
            min={0}
            max={PC_LADDER.length - 1}
            step={1}
            value={s.pci}
            format={(i) => `${num(PC_LADDER[Math.round(i)])} MeV`}
            onChange={(i) => change({ pci: clamp(Math.round(i), 0, PC_LADDER.length - 1) })}
          />
          <div class="group" role="group" aria-label="החלקיק">
            {PARTICLES.map((q) => (
              <Toggle key={q} label={NAME_HE[q]} on={s.particle === q} onChange={() => change({ particle: q })} />
            ))}
          </div>
        </>
      }
    />
  );
}

function triDescribe(s: TriState): string {
  const k = triNumbers(s);
  return `${NAME_HE[s.particle]}, אנרגיית מנוחה ${num(k.mc2)} MeV, תנע ${num(k.pc)} MeV חלקי c. האנרגיה היחסותית ${num(k.E)} MeV, האנרגיה הקינטית ${num(k.K)} MeV, והמהירות ${betaText(k.beta, k.oneMinus)} c.`;
}

function paintTriangle(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: TriState) {
  const { w, h } = view;
  const narrow = w < 520;
  const tri: Rect = narrow ? { x: 0, y: 0, w, h: h * 0.44 } : { x: 0, y: 0, w: w * 0.55, h };
  const plane: Rect = narrow ? { x: 0, y: h * 0.44, w, h: h * 0.56 } : { x: w * 0.55, y: 0, w: w * 0.45, h };
  const k = triNumbers(s);
  paintTri(ctx, p, tri, k, narrow);
  paintPlane(ctx, p, plane, k, !narrow);
}

type TriNumbers = ReturnType<typeof triNumbers>;

function paintTri(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, k: TriNumbers, narrow: boolean) {
  panel(ctx, p, r, 0.55);
  // full width (phone): the corner buttons sit over the top right, so the title starts left of them
  const titleRight = narrow ? r.x + r.w - 92 : r.x + r.w - 8;
  heText(ctx, p, 'משולש האנרגיה', titleRight, r.y + 16, { size: 13, weight: 700, color: p.ink });
  // the triangle: right angle A at bottom left, B = A + (pc, 0), C = A + (0, mc²); one scale for both legs
  const m = { l: 92, r: 40, t: 44, b: 44 };
  const availW = r.w - m.l - m.r;
  const availH = r.h - m.t - m.b;
  const scale = Math.min(availW / k.pc, k.mc2 > 0 ? availH / k.mc2 : Infinity);
  const Ax = r.x + m.l;
  const Ay = r.y + r.h - m.b;
  const Bx = Ax + k.pc * scale;
  const Cy = Ay - k.mc2 * scale;

  // legs
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = p.momentum;
  ctx.beginPath();
  ctx.moveTo(Ax, Ay);
  ctx.lineTo(Bx, Ay);
  ctx.stroke();
  if (k.mc2 > 0) {
    ctx.strokeStyle = p.ink2;
    ctx.beginPath();
    ctx.moveTo(Ax, Ay);
    ctx.lineTo(Ax, Cy);
    ctx.stroke();
    // right-angle mark
    const q = Math.min(10, (Bx - Ax) / 3, (Ay - Cy) / 3);
    if (q > 3) {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = p.ink3;
      ctx.beginPath();
      ctx.moveTo(Ax + q, Ay);
      ctx.lineTo(Ax + q, Ay - q);
      ctx.lineTo(Ax, Ay - q);
      ctx.stroke();
    }
  }
  // the hypotenuse C → B: its first mc² (ink) and then K (energy-k)
  const L = Math.hypot(Bx - Ax, Ay - Cy);
  const ux = (Bx - Ax) / L;
  const uy = (Ay - Cy) / L;
  const Dx = Ax + ux * k.mc2 * scale;
  const Dy = Cy + uy * k.mc2 * scale;
  const off = k.mc2 > 0 ? 0 : 7; // a photon's E lies on its pc: lift it so both show
  ctx.lineWidth = 3.2;
  if (k.mc2 > 0) {
    ctx.strokeStyle = withAlpha(p.ink, 0.75);
    ctx.beginPath();
    ctx.moveTo(Ax, Cy);
    ctx.lineTo(Dx, Dy);
    ctx.stroke();
  }
  ctx.strokeStyle = p.energyK;
  ctx.beginPath();
  ctx.moveTo(Dx, Dy - off);
  ctx.lineTo(Bx, Ay - off);
  ctx.stroke();
  ctx.restore();

  // labels
  mathText(ctx, p, `pc = ${num(k.pc)}`, (Ax + Bx) / 2, Ay + 18, { color: p.momentum, size: 13 });
  if (k.mc2 > 0) {
    mathText(ctx, p, 'mc²', Ax - 10, (Ay + Cy) / 2 - 9, { color: p.ink2, size: 13, align: 'right' });
    mathText(ctx, p, `= ${num(k.mc2)}`, Ax - 10, (Ay + Cy) / 2 + 9, { color: p.ink2, size: 12, align: 'right', italic: false });
  }
  // E above the hypotenuse's middle, K beside its lower part
  const nx = -uy; // normal pointing up-right of the line C → B (screen coordinates)
  const ny = -ux;
  const mx = (Ax + Bx) / 2;
  const my = (Cy + Ay) / 2;
  if (k.mc2 > 0) {
    mathText(ctx, p, `E = ${num(k.E)}`, clamp(mx + nx * -22, r.x + 60, r.x + r.w - 60), clamp(my + ny * -22, r.y + 36, Ay - 12), { size: 13 });
    if (k.K * scale > 18) mathText(ctx, p, 'K', (Dx + Bx) / 2 + 12, (Dy + Ay) / 2 + 12, { color: p.energyK, size: 13 });
  } else {
    mathText(ctx, p, `E = pc = ${num(k.E)}`, (Ax + Bx) / 2, Ay - off - 14, { size: 13, color: p.energyK });
  }
  mathText(ctx, p, 'MeV', r.x + r.w - 26, Ay + 18, { size: 11, color: p.ink3, italic: false });
  // the angle at B: cos θ = pc/E = β
  if (k.mc2 > 0 && Bx - Ax > 30) {
    const ang = Math.atan2(Ay - Cy, Bx - Ax);
    ctx.save();
    ctx.strokeStyle = p.velocity;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(Bx, Ay, 22, Math.PI, Math.PI + ang, false);
    ctx.stroke();
    ctx.restore();
    mathText(ctx, p, 'θ', Bx - 30 - 6, Ay - 8, { size: 13, color: p.velocity });
  }
  mathText(ctx, p, 'cos θ = pc/E = β', r.x + 10, r.y + 16, { size: 12, color: p.velocity, align: 'left' });
}

function paintPlane(ctx: CanvasRenderingContext2D, p: Palette, r: Rect, k: TriNumbers, underTools: boolean) {
  panel(ctx, p, r, 0.3);
  // a square plot, both axes in MeV on one scale, so the light line runs at 45°
  const R = niceMax(1.15 * Math.max(k.E, k.pc));
  const side = Math.min(r.w - 70, r.h - (underTools ? 92 : 70));
  const box = { x: r.x + 52 + Math.max(0, (r.w - 70 - side) / 2), y: r.y + (underTools ? 46 : 22), w: side, h: side };
  const plot = makePlot(box, { min: 0, max: R, label: 'pc (MeV)' }, { min: 0, max: R, label: 'E (MeV)' });
  drawAxes(ctx, plot, p);
  drawCurve(ctx, plot, (x) => x, { color: p.accent, dash: [6, 4], width: 1.8 });
  if (k.mc2 > 0) {
    drawCurve(ctx, plot, (x) => k.mc2 + (x * x) / (2 * k.mc2), { color: p.ink2, dash: [3, 4], width: 1.8 });
    drawCurve(ctx, plot, (x) => Math.hypot(x, k.mc2), { color: p.energyK, width: 2.6, samples: 240 });
  }
  drawMarker(ctx, plot, k.pc, k.E, p.energyK, { guides: true, radius: 5.5 });
  // labels for the light line, inside the box near its top-right
  mathText(ctx, p, 'E = pc', plot.px(R * 0.82) + 6, plot.py(R * 0.82) + 14, { size: 12, color: p.accent, align: 'left' });
}

/** a round axis maximum (1, 2, 2.5, 5 × 10ⁿ) at or above x */
function niceMax(x: number): number {
  const e = Math.floor(Math.log10(x));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * 10 ** e >= x) return m * 10 ** e;
  return 10 ** (e + 1);
}
