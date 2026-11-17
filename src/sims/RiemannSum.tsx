/**
 * RiemannSum (lesson 0.4): a rate that changes, cut into N pieces. In each piece the rate is taken as
 * constant (at the piece's left end or its middle), so the piece contributes a rectangle of rate × width;
 * the sum of the rectangles, with their signs, approaches the definite integral as N grows.
 *
 * Two kinds of profile, from src/physics/accumulate.ts:
 * - motion (a velocity v(t) or an acceleration a(t)): rectangles above the axis count positive, below it
 *   negative. An upper limit (slider, or "play") sweeps the interval; an optional lower panel draws the
 *   accumulated integral against its upper limit, with the running sums as dots and a tangent whose slope
 *   is the rate at the limit (the fundamental theorem).
 * - rod (a linear density λ(x) along a thin rod): the same rectangles are the masses of the pieces; below
 *   the graph the rod itself, cut into the same pieces and shaded by density, with an optional centre of
 *   mass (the sum's, as a pivot; the exact one, as a dashed line).
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  PROFILES,
  exactAbsIntegral,
  exactIntegral,
  partialSums,
  rodExact,
  rodSum,
  signedSum,
  unsignedSum,
  type Profile,
  type ProfileKey,
} from '~/physics/accumulate';
import { riemannPieces } from '~/physics/calculus';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Rule = 'left' | 'mid';
const N_MAX = 64;
/** a sweep of the upper limit from start to end takes this many seconds */
const SWEEP_SECONDS = 6;
/** the reset and fullscreen buttons cover this corner of the stage (CSS px from the top-right) */
const BUTTONS_W = 96;
const BUTTONS_H = 48;

const PRESET_LABEL: Record<ProfileKey, string> = {
  reverse: 'קדימה ואחורה',
  swing: 'תנודה',
  accel: 'תאוצה שדועכת',
  uniform: 'מוט אחיד',
  tapered: 'מוט מתעבה',
  bulge: 'מוט עבה באמצע',
};

const TASK_LABEL: Record<string, string> = {
  refine: 'הגדילו את מספר החתיכות N ל-32 לפחות. כמה נשאר בין הסכום לאינטגרל?',
  'past-stop': 'בתנועה "קדימה ואחורה", הזיזו את הגבול העליון אל מעבר ל-t = 2 s. מה קורה לסכום כשהמלבנים יורדים מתחת לציר?',
  'mid-exact': 'בתנועה "קדימה ואחורה", בחרו "באמצע" ו-N = 1. למה המלבן היחיד נותן בדיוק את האינטגרל?',
  'swing-period': 'בחרו "תנודה" והזיזו את הגבול העליון עד הסוף, מחזור שלם. מה ההעתק, ומה הדרך?',
  'rod-mass': 'בחרו "מוט מתעבה" והגדילו את N ל-32 לפחות. לאיזו מסה הסכום מתקרב?',
  'rod-cm': 'הדליקו את מרכז המסה, ועברו בין "מוט מתעבה" ל"מוט עבה באמצע". לשניהם אותה מסה; באיזה מהם מרכז המסה לא באמצע?',
};

interface State {
  preset: ProfileKey;
  n: number;
  rule: Rule;
  upper: number;
  showAccum: boolean;
  showCm: boolean;
  playing: boolean;
}

export interface RiemannSumProps {
  id: string;
  preset?: ProfileKey;
  /** presets offered as buttons (default: only the starting one, no buttons) */
  presets?: ProfileKey[];
  n?: number;
  rule?: Rule;
  /** the upper limit of the interval; default its end */
  upper?: number;
  showAccum?: boolean;
  showCm?: boolean;
  tasks?: string[];
}

function initial(p: RiemannSumProps): State {
  const preset = p.preset ?? 'reverse';
  return {
    preset,
    n: p.n ?? 6,
    rule: p.rule ?? 'left',
    upper: p.upper ?? PROFILES[preset].b,
    showAccum: p.showAccum ?? false,
    showCm: p.showCm ?? false,
    playing: false,
  };
}

const num = (x: number) => (Math.abs(x) < 5e-4 ? '0' : sci(x, 3).replace('-', '−'));

/** Units and symbols of a profile: the rate, its variable, the accumulated quantity. */
function unitsOf(p: Profile) {
  if (p.kind === 'velocity') return { rate: 'v', rateU: 'm/s', s: 't', sU: 's', acc: 'm', accName: 'x − x₀', sumLabel: 'Σ vΔt' };
  if (p.kind === 'acceleration') return { rate: 'a', rateU: 'm/s²', s: 't', sU: 's', acc: 'm/s', accName: 'v − v₀', sumLabel: 'Σ aΔt' };
  return { rate: 'λ', rateU: 'kg/m', s: 'x', sU: 'm', acc: 'kg', accName: 'm', sumLabel: 'Σ λΔx' };
}

/** A data range [lo, hi] that holds 0 and every sampled value of g on [a, b], padded. */
function rangeOf(g: (s: number) => number, a: number, b: number, padFrac = 0.12): [number, number] {
  let lo = 0;
  let hi = 0;
  for (let i = 0; i <= 200; i++) {
    const y = g(a + ((b - a) * i) / 200);
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  const pad = (hi - lo) * padFrac || 1;
  return [lo < 0 ? lo - pad : 0, hi + pad];
}

export default function RiemannSum(props: RiemannSumProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  /** what the reader changed with the figure's own controls since the last step */
  const user = useRef({ n: false, upper: false, rule: false, cm: false });
  /** rods the reader looked at with the centre of mass shown, since the last step */
  const cmSeen = useRef(new Set<ProfileKey>());
  const visible = useRef(true);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const prof = PROFILES[s.preset];
  const isRod = prof.kind === 'rod';
  const u = unitsOf(prof);
  const upper = isRod ? prof.b : Math.max(prof.a, Math.min(prof.b, s.upper));
  const ranges = useMemo(
    () => ({ f: rangeOf(prof.f, prof.a, prof.b), F: rangeOf(prof.F, prof.a, prof.b, 0.15) }),
    [s.preset],
  );

  const sum = signedSum(prof, prof.a, upper, s.n, s.rule);
  const exact = exactIntegral(prof, prof.a, upper);
  const absSum = unsignedSum(prof, prof.a, upper, s.n, s.rule);
  const absExact = exactAbsIntegral(prof, prof.a, upper);
  const rodS = isRod ? rodSum(prof, s.n, s.rule) : null;
  const rodE = isRod ? rodExact(prof) : null;

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev, playing: false };
          if (typeof step.preset === 'string' && step.preset in PRESET_LABEL) {
            next.preset = step.preset as ProfileKey;
            if (step.preset !== prev.preset) next.upper = PROFILES[next.preset].b;
          }
          if (typeof step.n === 'number') next.n = Math.max(1, Math.min(N_MAX, Math.round(step.n)));
          if (step.rule === 'left' || step.rule === 'mid') next.rule = step.rule;
          if (typeof step.upper === 'number') next.upper = step.upper;
          if (typeof step.showAccum === 'boolean') next.showAccum = step.showAccum;
          if (typeof step.showCm === 'boolean') next.showCm = step.showCm;
          stepState.current = next;
          user.current = { n: false, upper: false, rule: false, cm: false };
          cmSeen.current = new Set();
          return next;
        });
      }),
    [props.id],
  );

  // playback: sweep the upper limit from the start of the interval to its end; still mode freezes it
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const rate = (prof.b - prof.a) / SWEEP_SECONDS;
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (motionAllowed() && visible.current && !document.hidden) {
        setS((prev) => {
          const up = prev.upper + dt * rate;
          return up >= prof.b ? { ...prev, upper: prof.b, playing: false } : { ...prev, upper: up };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, prof]);

  // tasks: checked against the figure's own state, never against a state a text step produced
  useEffect(() => {
    if (s === stepState.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const us = user.current;
    if (isRod && s.showCm && us.cm) cmSeen.current.add(s.preset);
    if (has('refine') && !isRod && us.n && s.n >= 32) done('refine');
    if (has('past-stop') && s.preset === 'reverse' && us.upper && upper > 2.2) done('past-stop');
    if (has('mid-exact') && s.preset === 'reverse' && (us.n || us.rule) && s.rule === 'mid' && s.n === 1) done('mid-exact');
    if (has('swing-period') && s.preset === 'swing' && us.upper && upper >= prof.b - 0.011) done('swing-period');
    if (has('rod-mass') && s.preset === 'tapered' && us.n && s.n >= 32) done('rod-mass');
    if (has('rod-cm') && cmSeen.current.has('tapered') && cmSeen.current.has('bulge')) done('rod-cm');
  }, [s, props.id, props.tasks, isRod, upper, prof]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    const two = isRod || s.showAccum;
    const split = two ? (isRod ? 0.68 : 0.56) : 1;
    const margins = { l: 50, r: 14, t: 34, b: 40 };
    const topBox = insetBox({ x: 0, y: 0, w: W, h: H * split }, margins);
    const xAxis = {
      min: prof.a,
      max: prof.b,
      label: isRod ? 'המקום x (m)' : 'הזמן t (s)',
      format: (v: number) => sci(v, 2),
    };
    const top = makePlot(topBox, xAxis, { min: ranges.f[0], max: ranges.f[1], label: `${u.rate} (${u.rateU})`, format: (v: number) => sci(v, 2) });
    drawAxes(ctx, top, p);
    zeroLine(ctx, top, p);

    // the rectangles: one per piece, signed, with the point where the rate was read
    const pieces = upper > prof.a ? riemannPieces(prof.f, prof.a, upper, s.n, s.rule) : [];
    const y0 = top.py(0);
    const ds = (upper - prof.a) / s.n;
    for (const [i, pc] of pieces.entries()) {
      const xa = top.px(pc.x0);
      const xb = top.px(pc.x1);
      const yh = top.py(pc.height);
      const color = pc.height >= 0 ? p.pos : p.neg;
      ctx.save();
      ctx.fillStyle = withAlpha(color, 0.22);
      ctx.strokeStyle = withAlpha(color, 0.85);
      ctx.lineWidth = 1.2;
      ctx.fillRect(xa, Math.min(y0, yh), xb - xa, Math.abs(yh - y0));
      ctx.strokeRect(xa, Math.min(y0, yh), xb - xa, Math.abs(yh - y0));
      ctx.restore();
      // the sign is never colour-only: a + or − inside a rectangle wide and tall enough to hold it
      if (!isRod && xb - xa > 16 && Math.abs(yh - y0) > 18) {
        glyph(ctx, pc.height >= 0 ? '+' : '−', (xa + xb) / 2, (y0 + yh) / 2, color, p);
      }
      const sx = prof.a + (i + (s.rule === 'left' ? 0 : 0.5)) * ds;
      dot(ctx, top.px(sx), top.py(prof.f(sx)), p.ink, 3);
    }
    // the rate itself, over the whole interval
    const rateColor = prof.kind === 'velocity' ? p.velocity : prof.kind === 'acceleration' ? p.accel : p.ink;
    curve(ctx, top, prof.f, prof.a, prof.b, rateColor, 2.4);
    if (!isRod) limitLine(ctx, top, upper, p);

    if (isRod && rodS && rodE) {
      drawRod(ctx, p, top, H, split, pieces, s.n, s.rule, prof, s.showCm ? { sum: rodS.xcm, exact: rodE.xcm } : null);
    } else if (s.showAccum) {
      const lowBox = insetBox({ x: 0, y: H * split, w: W, h: H * (1 - split) }, { ...margins, t: 12 });
      const low = makePlot(lowBox, xAxis, { min: ranges.F[0], max: ranges.F[1], label: `${u.accName} (${u.acc})`, format: (v: number) => sci(v, 2) });
      drawAxes(ctx, low, p);
      zeroLine(ctx, low, p);
      curve(ctx, low, prof.F, prof.a, prof.b, withAlpha(p.ink3, 0.8), 1.4, [5, 4]);
      if (upper > prof.a) curve(ctx, low, prof.F, prof.a, upper, p.ink, 2.2);
      // the running sums, one dot per piece end, joined by thin steps
      if (pieces.length) {
        const S = partialSums(prof, prof.a, upper, s.n, s.rule);
        ctx.save();
        ctx.strokeStyle = withAlpha(p.accent, 0.7);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        S.forEach((v, k) => {
          const X = low.px(prof.a + k * ds);
          const Y = low.py(v);
          if (k === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        });
        ctx.stroke();
        ctx.restore();
        S.forEach((v, k) => dot(ctx, low.px(prof.a + k * ds), low.py(v), p.accent, s.n > 24 ? 2 : 3));
      }
      // the tangent at the upper limit: its slope is the rate there
      const fu = prof.f(upper);
      const Fu = prof.F(upper);
      const d = (prof.b - prof.a) * 0.12;
      ctx.save();
      ctx.beginPath();
      ctx.rect(low.box.x, low.box.y, low.box.w, low.box.h);
      ctx.clip();
      ctx.strokeStyle = rateColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(low.px(upper - d), low.py(Fu - fu * d));
      ctx.lineTo(low.px(upper + d), low.py(Fu + fu * d));
      ctx.stroke();
      ctx.restore();
      dot(ctx, low.px(upper), low.py(Fu), p.ink, 4.5);
      limitLine(ctx, low, upper, p, false);
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  // keep playback off while the stage is off-screen
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const io = new IntersectionObserver((es) => {
      visible.current = es.some((e) => e.isIntersecting);
    });
    io.observe(c);
    return () => io.disconnect();
  }, []);

  const describe = () =>
    isRod && rodS && rodE
      ? `${PRESET_LABEL[s.preset]}, חתוך ל-${s.n} חתיכות: סכום המסות ${num(rodS.mass)} kg, המסה המדויקת ${num(rodE.mass)} kg.` +
        (s.showCm ? ` מרכז המסה לפי הסכום ${num(rodS.xcm)} m, המדויק ${num(rodE.xcm)} m.` : '')
      : `${PRESET_LABEL[s.preset]}, מ-${u.s} = ${num(prof.a)} עד ${num(upper)} ${u.sU}, ב-${s.n} חתיכות: הסכום ${num(sum)} ${u.acc}, האינטגרל ${num(exact)} ${u.acc}.`;

  const setN = (n: number) => {
    user.current.n = true;
    setS((prev) => ({ ...prev, n: Math.max(1, Math.min(N_MAX, Math.round(n))) }));
  };
  const setUpper = (x: number) => {
    user.current.upper = true;
    setS((prev) => ({ ...prev, upper: Math.max(prof.a, Math.min(prof.b, x)), playing: false }));
  };
  const setRule = (rule: Rule) => {
    user.current.rule = true;
    setS((prev) => ({ ...prev, rule }));
  };
  const togglePlay = () => {
    user.current.upper = true;
    if (!motionAllowed()) {
      // still mode: no sweep; jump to the end of the interval
      setS((prev) => ({ ...prev, upper: prof.b, playing: false }));
      return;
    }
    setS((prev) => ({ ...prev, playing: !prev.playing, upper: !prev.playing && prev.upper >= prof.b - 1e-9 ? prof.a : prev.upper }));
  };
  const choosePreset = (preset: ProfileKey) => {
    setS((prev) => ({ ...prev, preset, upper: PROFILES[preset].b, playing: false }));
    setLive(`נבחר: ${PRESET_LABEL[preset]}.`);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      setN(s.n + (e.key === 'ArrowUp' ? 1 : -1));
      setLive(describe());
    } else if (!isRod && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      setUpper(upper + (e.key === 'ArrowRight' ? 1 : -1) * ((prof.b - prof.a) / 40));
      setLive(describe());
    } else if (!isRod && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      togglePlay();
    }
  };
  const reset = () => {
    stepState.current = null;
    user.current = { n: false, upper: false, rule: false, cm: false };
    cmSeen.current = new Set();
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const diff = sum - exact;
  const pct = Math.abs(exact) > 1e-6 ? ` (${sci(Math.abs(diff / exact) * 100, 2)}%)` : '';
  const presets = props.presets ?? [];
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: גרף של קצב שמשתנה, חתוך לחתיכות, וסכום המלבנים מול האינטגרל. ${describe()} חצים למעלה ולמטה משנים את מספר החתיכות${isRod ? '' : ', חצים ימינה ושמאלה מזיזים את הגבול העליון'}.`}
      canvasRef={canvasRef}
      aspect={1.2}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      readout={
        isRod && rodS && rodE ? (
          <>
            <span class="q" data-readout="n">
              N = {s.n}, Δx = {num(pieceWidth(prof, prof.b, s.n))} m
            </span>
            <b class="q" data-readout="sum">
              Σ λΔx = {num(rodS.mass)} kg
            </b>
            <span class="q" data-readout="exact">
              M = ∫λ dx = {num(rodE.mass)} kg
            </span>
            {s.showCm && (
              <span class="q" data-readout="cm">
                x<sub>cm</sub>: {num(rodS.xcm)} m (סכום), {num(rodE.xcm)} m (אינטגרל)
              </span>
            )}
          </>
        ) : (
          <>
            <span class="q" data-readout="n">
              N = {s.n}, Δt = {num(pieceWidth(prof, upper, s.n))} s
            </span>
            <span class="q" data-readout="upper">
              {u.s} = {num(upper)} {u.sU}
            </span>
            <b class="q" data-readout="sum">
              {u.sumLabel} = {num(sum)} {u.acc}
            </b>
            <span class="q" data-readout="exact">
              ∫{u.rate} dt = {num(exact)} {u.acc}
            </span>
            <span class="q" data-readout="diff">
              ההפרש:{' '}
              <bdi dir="ltr">
                {num(diff)} {u.acc}
                {pct}
              </bdi>
            </span>
            {prof.kind === 'velocity' && (
              <span class="q" data-readout="distance">
                Σ|v|Δt = {num(absSum)} m, ∫|v| dt = {num(absExact)} m
              </span>
            )}
          </>
        )
      }
      controls={
        <>
          {presets.length > 1 && (
            <div class="group" role="group" aria-label="בחירת גרף">
              {presets.map((name) => (
                <Toggle key={name} label={PRESET_LABEL[name]} on={s.preset === name} onChange={() => choosePreset(name)} />
              ))}
            </div>
          )}
          <Slider label="מספר החתיכות N" min={1} max={N_MAX} step={1} value={s.n} format={(n) => String(n)} onChange={setN} />
          <div class="group" role="group" aria-label="גובה כל מלבן נלקח">
            <Toggle label="בקצה השמאלי" on={s.rule === 'left'} onChange={() => setRule('left')} />
            <Toggle label="באמצע" on={s.rule === 'mid'} onChange={() => setRule('mid')} />
          </div>
          {!isRod && (
            <>
              <Slider
                label="הגבול העליון t"
                min={prof.a}
                max={prof.b}
                step={0.01}
                value={upper}
                format={(x) => `${num(x)} s`}
                onChange={setUpper}
              />
              <div class="group" role="group" aria-label="צבירה">
                <button type="button" class="toggle" onClick={togglePlay} aria-pressed={s.playing}>
                  {s.playing ? 'עצירה' : 'הפעלה'}
                </button>
                <Toggle label="גרף הצבירה" on={s.showAccum} swatch="var(--accent)" onChange={(x) => setS({ ...s, showAccum: x })} />
              </div>
            </>
          )}
          {isRod && (
            <div class="group" role="group" aria-label="מה להציג">
              <Toggle
                label="מרכז המסה"
                on={s.showCm}
                swatch="var(--accent)"
                onChange={(x) => {
                  user.current.cm = true;
                  setS({ ...s, showCm: x });
                }}
              />
            </div>
          )}
        </>
      }
    />
  );
}

/** The width of one piece of [a, upper] cut into n. */
const pieceWidth = (p: Profile, upper: number, n: number) => (upper - p.a) / n;

/** y = g(s) from s0 to s1 inside the plot box. */
function curve(ctx: CanvasRenderingContext2D, plot: Plot, g: (s: number) => number, s0: number, s1: number, color: string, width: number, dash: number[] = []) {
  if (s1 <= s0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.box.x, plot.box.y - 2, plot.box.w, plot.box.h + 4);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  const N = 200;
  for (let i = 0; i <= N; i++) {
    const x = s0 + ((s1 - s0) * i) / N;
    const X = plot.px(x);
    const Y = plot.py(g(x));
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  }
  ctx.stroke();
  ctx.restore();
}

/** The horizontal axis line through zero, when zero is inside the range and above the frame's bottom. */
function zeroLine(ctx: CanvasRenderingContext2D, plot: Plot, p: Palette) {
  if (plot.y.min >= 0 || plot.y.max <= 0) return;
  const y = plot.py(0);
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(plot.box.x, y);
  ctx.lineTo(plot.box.x + plot.box.w, y);
  ctx.stroke();
  ctx.restore();
}

/** A dashed vertical line at the upper limit; on the top panel, a small "t" above it. */
function limitLine(ctx: CanvasRenderingContext2D, plot: Plot, x: number, p: Palette, labelled = true) {
  const X = plot.px(x);
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(X, plot.box.y);
  ctx.lineTo(X, plot.box.y + plot.box.h);
  ctx.stroke();
  ctx.restore();
  if (labelled) {
    ctx.save();
    ctx.font = `600 13px ${p.fontUi}`;
    ctx.fillStyle = p.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.direction = 'ltr';
    // keep the label clear of the corner buttons: near the right edge it moves below the top of the frame
    const W = ctx.canvas.clientWidth || ctx.canvas.width;
    const under = X > W - BUTTONS_W && plot.box.y < BUTTONS_H;
    ctx.fillText('t', X + (under ? -10 : 0), under ? BUTTONS_H + 16 : plot.box.y - 4);
    ctx.restore();
  }
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, r: number) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function glyph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, p: Palette) {
  ctx.save();
  ctx.font = `700 17px ${p.fontUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * The rod under the density graph, on the same x scale: cut into the same pieces, each shaded by its
 * density, with a dot at the point where the piece's mass is counted (area ∝ mass). With `cm`, the sum's
 * centre of mass as a pivot under the rod and the exact one as a dashed line.
 */
function drawRod(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  top: Plot,
  H: number,
  split: number,
  pieces: { x0: number; x1: number; height: number }[],
  n: number,
  rule: Rule,
  prof: Profile,
  cm: { sum: number; exact: number } | null,
) {
  const yTop = H * split + 6;
  const avail = H - yTop;
  const thick = Math.max(14, Math.min(24, avail * 0.22));
  const yc = yTop + avail * 0.36;
  const lamMax = Math.max(...pieces.map((q) => q.height), 1e-9);
  const ds = (prof.b - prof.a) / n;
  for (const [i, q] of pieces.entries()) {
    const xa = top.px(q.x0);
    const xb = top.px(q.x1);
    ctx.save();
    ctx.fillStyle = withAlpha(p.equip, 0.18 + 0.72 * (q.height / lamMax));
    ctx.fillRect(xa, yc - thick / 2, xb - xa, thick);
    ctx.restore();
    if (n <= 40 && i > 0) {
      ctx.save();
      ctx.strokeStyle = p.paper;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xa, yc - thick / 2);
      ctx.lineTo(xa, yc + thick / 2);
      ctx.stroke();
      ctx.restore();
    }
    const sx = prof.a + (i + (rule === 'left' ? 0 : 0.5)) * ds;
    const r = Math.max(1.5, Math.min(5, 4.5 * Math.sqrt((q.height * ds) / (lamMax * (prof.b - prof.a) / 6))));
    dot(ctx, top.px(sx), yc, p.ink, r);
  }
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(top.px(prof.a), yc - thick / 2, top.px(prof.b) - top.px(prof.a), thick);
  ctx.restore();
  // the rod's ends
  ctx.save();
  ctx.font = `12px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('0', top.px(prof.a), yc + thick / 2 + 4);
  ctx.fillText('L', top.px(prof.b), yc + thick / 2 + 4);
  ctx.restore();
  if (cm) {
    const X = top.px(cm.sum);
    const yb = yc + thick / 2 + 2;
    ctx.save();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.moveTo(X, yb);
    ctx.lineTo(X - 9, yb + 15);
    ctx.lineTo(X + 9, yb + 15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = p.accent;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    const XE = top.px(cm.exact);
    ctx.beginPath();
    ctx.moveTo(XE, yc - thick / 2 - 10);
    ctx.lineTo(XE, yb + 18);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.fillStyle = p.accent;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('מרכז המסה', X, yb + 18);
    ctx.restore();
  }
}
