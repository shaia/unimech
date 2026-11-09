/**
 * PolarFrame (lesson 1.4): a point moves in the plane, and the polar unit vectors r̂ and θ̂ ride with
 * it. The velocity is drawn with its two polar components (ṙ along r̂, rθ̇ along θ̂); the acceleration
 * with its four terms (r̈, −rθ̇², rθ̈, 2ṙθ̇), each toggleable and drawn head to tail, beside the total.
 * An optional construction shows r̂ (or θ̂) at θ and at θ + Δθ and their difference, for the derivation
 * dr̂/dt = θ̇θ̂, dθ̂/dt = −θ̇r̂.
 *
 * Physics comes from src/physics/polar.ts. Positions are drawn in units of the largest r of the run, so
 * every preset fills the stage; arrows have their own scale per preset (one for velocity, one for
 * acceleration), fixed over the run so lengths compare between instants.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  LESSON_PRESETS,
  accelTerms,
  polarAcceleration,
  polarBasis,
  polarMotion,
  polarVelocity,
  presetDuration,
  type AccelTerms,
  type PolarState,
  type PresetName,
} from '~/physics/polar';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 2.7;
const WORLD_H = 2.35;
/** the largest r of a run is drawn at this many world units from O */
const R_FIT = 1.0;
/** in the Δ construction the largest r is drawn smaller, and O sits down and to the left (world units) */
const R_FIT_DELTA = 0.55;
const DELTA_ORIGIN = [-0.4, -0.35] as const;
/** the reset and fullscreen buttons cover this corner of the stage (CSS px from the top-right) */
const BUTTONS_W = 96;
const BUTTONS_H = 52;
/** world length of the longest velocity / acceleration arrow of a run, and of a unit vector */
const V_FIT = 0.55;
const A_FIT = 0.55;
const UNIT = 0.3;
/** a full run of any preset plays in about this many seconds of real time */
const RUN_SECONDS = 8;

type TermKey = keyof AccelTerms;
const TERM_KEYS: TermKey[] = ['radial', 'centripetal', 'angular', 'coriolis'];
const TERM_LABEL: Record<TermKey, string> = {
  radial: 'r̈',
  centripetal: '−rθ̇²',
  angular: 'rθ̈',
  coriolis: '2ṙθ̇',
};
/** which unit vector each term lies along */
const TERM_ALONG: Record<TermKey, 'r' | 'th'> = { radial: 'r', centripetal: 'r', angular: 'th', coriolis: 'th' };

const PRESET_LABEL: Record<PresetName, string> = {
  circle: 'מעגל אחיד',
  'spin-up': 'מעגל שמאיץ',
  radial: 'לאורך קרן',
  bug: 'חיפושית על מוט',
  bead: 'חרוז חופשי על מוט',
  spiral: 'ספירלה',
  line: 'קו ישר',
  pull: 'משיכה דרך חור',
};

const TASK_LABEL: Record<string, string> = {
  'bug-terms': 'בתנועה של החיפושית, הדליקו את ארבעת האיברים של התאוצה. אילו שניים מהם אפס כל הזמן?',
  'bug-sideways': 'כבו את כל האיברים חוץ מ-2ṙθ̇. לאיזה כיוון הוא מצביע ביחס למוט?',
  'bug-far': 'הריצו את החיפושית עד שהמרחק שלה מהציר כפול מהמרחק בהתחלה. איזה איבר גדל, ואיזה נשאר קבוע?',
  'shrink-delta': 'הקטינו את Δθ עד הסוף. מה הזווית בין Δr̂ לבין r̂ עכשיו?',
  'line-zero': 'בחרו "קו ישר" והדליקו את ארבעת האיברים. איפה נגמרת שרשרת החצים?',
  'bead-double': 'בחרו "חרוז חופשי על מוט" והריצו עד שהחרוז במרחק כפול מהציר. איזה רכיב של התאוצה נשאר אפס כל הזמן?',
  'pull-half': 'בחרו "משיכה דרך חור" והריצו עד שהמרחק מהחור קטן פי 2. פי כמה גדל θ̇?',
};

/** the smallest Δθ the construction allows [rad]; reaching it ticks 'shrink-delta' */
const DTH_MIN = 0.05;
const DTH_MAX = 1.2;

interface State {
  preset: PresetName;
  t: number;
  playing: boolean;
  showBasis: boolean;
  showV: boolean;
  showVParts: boolean;
  showA: boolean;
  terms: Record<TermKey, boolean>;
  showDelta: boolean;
  deltaOf: 'r' | 'th';
  dTheta: number;
}

export interface PolarFrameProps {
  id: string;
  preset?: PresetName;
  /** presets offered as buttons (default: only the starting one, no buttons) */
  presets?: PresetName[];
  t?: number;
  showBasis?: boolean;
  showV?: boolean;
  showVParts?: boolean;
  showA?: boolean;
  /** acceleration terms shown at the start */
  terms?: TermKey[];
  showDelta?: boolean;
  deltaOf?: 'r' | 'th';
  dTheta?: number;
  tasks?: string[];
}

const termsFrom = (list: readonly string[] | undefined): Record<TermKey, boolean> => ({
  radial: !!list?.includes('radial'),
  centripetal: !!list?.includes('centripetal'),
  angular: !!list?.includes('angular'),
  coriolis: !!list?.includes('coriolis'),
});

function initial(p: PolarFrameProps): State {
  return {
    preset: p.preset ?? 'bug',
    t: p.t ?? 0,
    playing: false,
    showBasis: p.showBasis ?? true,
    showV: p.showV ?? true,
    showVParts: p.showVParts ?? false,
    showA: p.showA ?? false,
    terms: termsFrom(p.terms),
    showDelta: p.showDelta ?? false,
    deltaOf: p.deltaOf ?? 'r',
    dTheta: p.dTheta ?? 0.8,
  };
}

/** Everything about a preset that does not change during the run: its motion, length and scales. */
function runOf(preset: PresetName) {
  const params = LESSON_PRESETS[preset];
  const motion = polarMotion(preset, params);
  const T = presetDuration(preset, params);
  let rMax = 0;
  let vMax = 0;
  let aMax = 0;
  const path: PolarState[] = [];
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const s = motion((T * i) / N);
    path.push(s);
    const v = polarVelocity(s);
    const a = polarAcceleration(s);
    const k = accelTerms(s);
    rMax = Math.max(rMax, s.r);
    vMax = Math.max(vMax, Math.hypot(v.vr, v.vth));
    aMax = Math.max(aMax, Math.hypot(a.ar, a.ath), ...TERM_KEYS.map((key) => Math.abs(k[key])));
  }
  return { params, motion, T, path, rMax, vScale: V_FIT / (vMax || 1), aScale: A_FIT / (aMax || 1) };
}

const num = (x: number) => (Math.abs(x) < 5e-4 ? '0' : sci(x, 3).replace('-', '−'));
const deg = (rad: number) => {
  const d = (rad * 180) / Math.PI;
  return `${Math.round(((d % 360) + 360) % 360)}°`;
};

export default function PolarFrame(props: PolarFrameProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  /** the reader has run or scrubbed time since the last step or preset change */
  const userRan = useRef(false);
  /** the preset the reader chose with a button, and whether the reader toggled a term, since the last step */
  const userPreset = useRef<PresetName | null>(null);
  const userTerms = useRef(false);
  const visible = useRef(true);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const run = useMemo(() => runOf(s.preset), [s.preset]);
  const st = run.motion(s.t);
  const v = polarVelocity(st);
  const a = polarAcceleration(st);
  const terms = accelTerms(st);

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev, playing: false };
          if (typeof step.preset === 'string' && step.preset in PRESET_LABEL) {
            if (step.preset !== prev.preset) next.t = 0;
            next.preset = step.preset as PresetName;
          }
          if (typeof step.t === 'number') next.t = step.t;
          for (const k of ['showBasis', 'showV', 'showVParts', 'showA', 'showDelta'] as const) {
            if (typeof step[k] === 'boolean') next[k] = step[k] as boolean;
          }
          if (Array.isArray(step.terms)) next.terms = termsFrom(step.terms as string[]);
          if (step.deltaOf === 'r' || step.deltaOf === 'th') next.deltaOf = step.deltaOf;
          if (typeof step.dTheta === 'number') next.dTheta = step.dTheta;
          stepState.current = next;
          userRan.current = false;
          userPreset.current = null;
          userTerms.current = false;
          return next;
        });
      }),
    [props.id],
  );

  // playback: advance t in real time, scaled so a run lasts about RUN_SECONDS; still mode freezes it
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const rate = run.T / RUN_SECONDS;
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (motionAllowed() && visible.current && !document.hidden) {
        setS((prev) => {
          const t = prev.t + dt * rate;
          return t >= run.T ? { ...prev, t: run.T, playing: false } : { ...prev, t };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, run]);

  // tasks: checked against the figure's own state, never against a state a text step produced
  useEffect(() => {
    if (s === stepState.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const all = TERM_KEYS.every((k) => s.terms[k]);
    const r0 = run.params.r0;
    const only = (k: TermKey) => TERM_KEYS.every((key) => s.terms[key] === (key === k));
    if (has('bug-terms') && userTerms.current && s.preset === 'bug' && all) done('bug-terms');
    if (has('bug-sideways') && userTerms.current && s.preset === 'bug' && only('coriolis')) done('bug-sideways');
    if (has('bug-far') && userRan.current && s.preset === 'bug' && st.r >= 2 * r0) done('bug-far');
    if (has('shrink-delta') && s.showDelta && s.dTheta <= DTH_MIN + 1e-9) done('shrink-delta');
    if (has('line-zero') && userPreset.current === 'line' && all) done('line-zero');
    if (has('bead-double') && userRan.current && s.preset === 'bead' && st.r >= 2 * r0) done('bead-double');
    if (has('pull-half') && userRan.current && s.preset === 'pull' && st.r <= r0 / 2) done('pull-half');
  }, [s, props.id, props.tasks, run, st.r]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    // The Δ construction needs room for 1.6-unit arrows beyond the point: shrink the circle and move O
    // down and left, so the arrows and their labels stay inside the stage and clear of the corner buttons.
    const fit = s.showDelta ? R_FIT_DELTA : R_FIT;
    const off = s.showDelta ? DELTA_ORIGIN : ([0, 0] as const);
    const k = fit / run.rMax; // world units per metre
    const at = (x: number, y: number) => toScreen(view, x * k + off[0], y * k + off[1]);
    const L = (text: string, x: number, y: number, color: string) => label(ctx, text, x, y, color, p, view);
    const O = at(0, 0);
    polarGrid(ctx, view, p, k, run.rMax, O);

    // the path: the whole run faint, the travelled part in ink
    const pts = run.path.map((q) => at(q.r * Math.cos(q.th), q.r * Math.sin(q.th)));
    polyline(ctx, pts, withAlpha(p.ink3, 0.55), 1.2, [4, 4]);
    const nDone = Math.round((s.t / run.T) * (run.path.length - 1));
    polyline(ctx, pts.slice(0, nDone + 1), p.ink2, 1.6);

    const { rHat, thetaHat } = polarBasis(st.th);
    const P = at(st.r * rHat[0], st.r * rHat[1]);

    // the radius and the angle θ from +x (no arc or label while θ is near zero: nothing to mark)
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(O[0], O[1]);
    ctx.lineTo(P[0], P[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    const arcR = Math.min(28, Math.hypot(P[0] - O[0], P[1] - O[1]) * 0.5);
    const th = ((st.th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const showTheta = arcR > 6 && th > 0.2 && th < 2 * Math.PI - 0.2;
    if (showTheta) {
      ctx.beginPath();
      ctx.arc(O[0], O[1], arcR, 0, -th, true);
      ctx.stroke();
    }
    ctx.restore();
    if (showTheta) L('θ', O[0] + (arcR + 10) * Math.cos(th / 2), O[1] - (arcR + 10) * Math.sin(th / 2), p.ink2);
    L('O', O[0] - 10, O[1] + 12, p.ink2);

    // world vector (in world units) from a screen point → screen tip
    const tip = (from: [number, number], wx: number, wy: number): [number, number] => [
      from[0] + wx * view.ppm,
      from[1] - wy * view.ppm,
    ];
    /** a label just beyond the tip of an arrow from `from` to `to`, `gap` px further along it */
    const beyond = (text: string, from: [number, number], to: [number, number], color: string, gap = 14) => {
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const d = Math.hypot(dx, dy) || 1;
      L(text, to[0] + (gap * dx) / d, to[1] + (gap * dy) / d, color);
    };

    // the Δ construction: the unit vector at θ and at θ + Δθ, and their difference
    if (s.showDelta) {
      const b2 = polarBasis(st.th + s.dTheta);
      const [u1, u2] = s.deltaOf === 'r' ? [rHat, b2.rHat] : [thetaHat, b2.thetaHat];
      const name = s.deltaOf === 'r' ? 'r̂' : 'θ̂';
      const len = UNIT * 1.6;
      const A1 = tip(P, u1[0] * len, u1[1] * len);
      const A2 = tip(P, u2[0] * len, u2[1] * len);
      arrow(ctx, P[0], P[1], A1[0], A1[1], { color: p.accent, width: 2.4, head: 11 });
      arrow(ctx, P[0], P[1], A2[0], A2[1], { color: p.accent, width: 2.4, head: 11, alpha: 0.45 });
      arrow(ctx, A1[0], A1[1], A2[0], A2[1], { color: p.ink, width: 2, head: 9 });
      beyond(`${name}(θ)`, P, A1, p.accent, 26);
      beyond(`${name}(θ+Δθ)`, P, A2, withAlpha(p.accent, 0.75), 34);
      // Δ label on the outer side of the chord, away from P
      const mx = (A1[0] + A2[0]) / 2;
      const my = (A1[1] + A2[1]) / 2;
      const ox = mx - P[0];
      const oy = my - P[1];
      const od = Math.hypot(ox, oy) || 1;
      L(`Δ${name}`, mx + (16 * ox) / od, my + (16 * oy) / od, p.ink);
    }

    // velocity and its polar components
    if (s.showV) {
      const kv = run.vScale;
      const vr: [number, number] = [rHat[0] * v.vr * kv, rHat[1] * v.vr * kv];
      const vt: [number, number] = [thetaHat[0] * v.vth * kv, thetaHat[1] * v.vth * kv];
      const Vend = tip(P, vr[0] + vt[0], vr[1] + vt[1]);
      if (s.showVParts) {
        const Vr = tip(P, vr[0], vr[1]);
        const Vt = tip(P, vt[0], vt[1]);
        arrow(ctx, P[0], P[1], Vr[0], Vr[1], { color: p.velocity, width: 2, head: 9, alpha: 0.6 });
        arrow(ctx, P[0], P[1], Vt[0], Vt[1], { color: p.velocity, width: 2, head: 9, alpha: 0.6 });
        dashed(ctx, Vr, Vend, withAlpha(p.velocity, 0.45));
        dashed(ctx, Vt, Vend, withAlpha(p.velocity, 0.45));
        if (Math.abs(v.vr) * kv > 0.05) beyond('ṙ r̂', P, Vr, p.velocity, 18);
        if (Math.abs(v.vth) * kv > 0.05) beyond('rθ̇ θ̂', P, Vt, p.velocity, 22);
      }
      arrow(ctx, P[0], P[1], Vend[0], Vend[1], { color: p.velocity, width: 3.2, head: 13 });
      if (Math.hypot(Vend[0] - P[0], Vend[1] - P[1]) > 2) beyond('v', P, Vend, p.velocity, 12);
    }

    // acceleration: the chosen terms head to tail, and the total
    const ka = run.aScale;
    let cur: [number, number] = [P[0], P[1]];
    let zeros = 0;
    for (const key of TERM_KEYS) {
      if (!s.terms[key]) continue;
      const u = TERM_ALONG[key] === 'r' ? rHat : thetaHat;
      const m = terms[key] * ka;
      const end = tip(cur, u[0] * m, u[1] * m);
      if (Math.abs(m) * view.ppm > 2) {
        arrow(ctx, cur[0], cur[1], end[0], end[1], { color: p.accel, width: 2, head: 9, alpha: 0.7 });
        const sx = Math.sign(m);
        // beside the middle of its arrow, on the side away from the total acceleration's label
        L(TERM_LABEL[key], (cur[0] + end[0]) / 2 + 16 * sx * u[1], (cur[1] + end[1]) / 2 + 16 * sx * u[0], p.accel);
      } else {
        // a zero term: a small ring where it would start, labelled "= 0", stacked below the point
        ring(ctx, cur, p.accel);
        L(`${TERM_LABEL[key]} = 0`, P[0] - 34, P[1] + 22 + 15 * zeros, withAlpha(p.accel, 0.85));
        zeros++;
      }
      cur = end;
    }
    if (s.showA) {
      const A = tip(P, (rHat[0] * a.ar + thetaHat[0] * a.ath) * ka, (rHat[1] * a.ar + thetaHat[1] * a.ath) * ka);
      if (Math.hypot(A[0] - P[0], A[1] - P[1]) > 2) {
        arrow(ctx, P[0], P[1], A[0], A[1], { color: p.accel, width: 3.6, head: 14 });
        beyond('a', P, A, p.accel, 14);
      } else {
        L('a = 0', P[0] + 30, P[1] - 18, p.accel);
      }
    }

    // the unit vectors on top of v and a (in uniform circular motion v lies along θ̂), labels to one side
    if (s.showBasis && !s.showDelta) {
      const R1 = tip(P, rHat[0] * UNIT, rHat[1] * UNIT);
      const T1 = tip(P, thetaHat[0] * UNIT, thetaHat[1] * UNIT);
      arrow(ctx, P[0], P[1], R1[0], R1[1], { color: p.accent, width: 2, head: 9 });
      arrow(ctx, P[0], P[1], T1[0], T1[1], { color: p.accent, width: 2, head: 9 });
      // r̂'s label sits toward +θ̂ of its tip, θ̂'s toward −r̂: off the arrows they label and off v (along θ̂)
      L('r̂', R1[0] + 6 * rHat[0] + 13 * thetaHat[0], R1[1] - 6 * rHat[1] - 13 * thetaHat[1], p.accent);
      L('θ̂', T1[0] + 6 * thetaHat[0] - 13 * rHat[0], T1[1] - 6 * thetaHat[1] + 13 * rHat[1], p.accent);
    }

    // the point itself, on top
    ctx.save();
    ctx.beginPath();
    ctx.arc(P[0], P[1], 6, 0, Math.PI * 2);
    ctx.fillStyle = p.ink;
    ctx.fill();
    ctx.restore();
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s, run]);

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
    `${PRESET_LABEL[s.preset]}, ברגע t = ${num(s.t)} s: r = ${num(st.r)} m, θ = ${deg(st.th)}. ` +
    `המהירות: רכיב רדיאלי ${num(v.vr)} m/s, רכיב זוויתי ${num(v.vth)} m/s. התאוצה: רכיב רדיאלי ${num(a.ar)} m/s², רכיב זוויתי ${num(a.ath)} m/s².`;

  const setTime = (t: number) => {
    userRan.current = true;
    setS((prev) => ({ ...prev, t: Math.max(0, Math.min(run.T, t)), playing: false }));
  };
  const togglePlay = () => {
    userRan.current = true;
    setS((prev) => ({ ...prev, playing: !prev.playing, t: !prev.playing && prev.t >= run.T ? 0 : prev.t }));
  };
  const choosePreset = (preset: PresetName) => {
    userRan.current = false;
    userPreset.current = preset;
    setS((prev) => ({ ...prev, preset, t: 0, playing: false }));
    setLive(`נבחרה התנועה: ${PRESET_LABEL[preset]}.`);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setTime(s.t + (e.key === 'ArrowRight' ? 1 : -1) * (run.T / 40));
      setLive(describe());
    }
  };
  const reset = () => {
    stepState.current = null;
    userRan.current = false;
    userPreset.current = null;
    userTerms.current = false;
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const presets = props.presets ?? [];
  const deltaLen = 2 * Math.sin(s.dTheta / 2);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: נקודה נעה במישור, ועליה וקטורי היחידה הקוטביים, המהירות והתאוצה. ${describe()} רווח מפעיל ועוצר, חיצים מזיזים את הזמן.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      readout={
        <>
          <span class="q" data-readout="t">t = {num(s.t)} s</span>
          <span class="q" data-readout="r">r = {num(st.r)} m</span>
          <span class="q" data-readout="theta">θ = {deg(st.th)}</span>
          <span class="q" data-readout="thetadot">θ̇ = {num(st.thd)} rad/s</span>
          {s.showV && (
            <b class="q" data-readout="v">
              v<sub>r</sub> = {num(v.vr)} m/s, v<sub>θ</sub> = {num(v.vth)} m/s
            </b>
          )}
          {s.showV && <span class="q" data-readout="speed">|v| = {num(Math.hypot(v.vr, v.vth))} m/s</span>}
          {TERM_KEYS.filter((key) => s.terms[key]).map((key) => (
            <span class="q" key={key} data-readout={`term-${key}`}>
              {TERM_LABEL[key]} = {num(terms[key])} m/s²
            </span>
          ))}
          {s.showA && (
            <b class="q" data-readout="a">
              a<sub>r</sub> = {num(a.ar)} m/s², a<sub>θ</sub> = {num(a.ath)} m/s²
            </b>
          )}
          {s.showA && <span class="q" data-readout="accel">|a| = {num(Math.hypot(a.ar, a.ath))} m/s²</span>}
          {s.showDelta && (
            <span class="q" data-readout="delta">
              |Δ{s.deltaOf === 'r' ? 'r̂' : 'θ̂'}|/Δθ = {sci(deltaLen / s.dTheta, 3)}, זווית עם {s.deltaOf === 'r' ? 'r̂' : 'θ̂'}:{' '}
              {Math.round(90 + (s.dTheta * 90) / Math.PI)}°
            </span>
          )}
        </>
      }
      controls={
        <>
          {presets.length > 1 && (
            <div class="group" role="group" aria-label="בחירת תנועה">
              {presets.map((name) => (
                <Toggle key={name} label={PRESET_LABEL[name]} on={s.preset === name} onChange={() => choosePreset(name)} />
              ))}
            </div>
          )}
          <div class="group" role="group" aria-label="זמן">
            <button type="button" class="toggle" onClick={togglePlay} aria-pressed={s.playing}>
              {s.playing ? 'עצירה' : 'הפעלה'}
            </button>
          </div>
          <Slider label="הזמן t" min={0} max={run.T} step={run.T / 400} value={s.t} format={(t) => `${num(t)} s`} onChange={setTime} />
          {s.showDelta && (
            <Slider
              label="Δθ"
              min={DTH_MIN}
              max={DTH_MAX}
              step={0.05}
              value={s.dTheta}
              format={(x) => `${sci(x, 2)} rad`}
              onChange={(x) => setS((prev) => ({ ...prev, dTheta: Math.round(x / 0.05) * 0.05 }))}
            />
          )}
          <div class="group" role="group" aria-label="מה להציג">
            {!s.showDelta && <Toggle label="r̂ ו-θ̂" on={s.showBasis} swatch="var(--accent)" onChange={(x) => setS({ ...s, showBasis: x })} />}
            <Toggle label="מהירות" on={s.showV} swatch="var(--velocity)" onChange={(x) => setS({ ...s, showV: x })} />
            {s.showV && <Toggle label="רכיבי המהירות" on={s.showVParts} swatch="var(--velocity)" onChange={(x) => setS({ ...s, showVParts: x })} />}
            <Toggle label="תאוצה" on={s.showA} swatch="var(--accel)" onChange={(x) => setS({ ...s, showA: x })} />
          </div>
          <div class="group" role="group" aria-label="איברי התאוצה">
            {TERM_KEYS.map((key) => (
              <Toggle
                key={key}
                label={<bdi dir="ltr">{TERM_LABEL[key]}</bdi>}
                on={s.terms[key]}
                swatch="var(--accel)"
                onChange={(x) => {
                  userTerms.current = true;
                  setS({ ...s, terms: { ...s.terms, [key]: x } });
                }}
              />
            ))}
          </div>
        </>
      }
    />
  );
}

/** Faint circles around O and rays every 30°, the x axis, and a scale bar in the bottom-left corner. */
function polarGrid(ctx: CanvasRenderingContext2D, v: View, p: Palette, k: number, rMax: number, O: [number, number]) {
  const [ox, oy] = O;
  const step = niceStep(rMax / 4);
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  for (let r = step; r <= rMax * 2.5; r += step) {
    ctx.beginPath();
    ctx.arc(ox, oy, r * k * v.ppm, 0, Math.PI * 2);
    ctx.stroke();
  }
  const reach = Math.hypot(v.w, v.h);
  for (let i = 0; i < 12; i++) {
    const t = (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + reach * Math.cos(t), oy - reach * Math.sin(t));
    ctx.stroke();
  }
  arrow(ctx, ox, oy, v.w - 8, oy, { color: p.ink3, width: 1.3, head: 8 });
  ctx.restore();
  // the axis name below the axis, at its end
  label(ctx, 'x', v.w - 12, oy + 14, p.ink2, p, v);
  // the scale bar: one circle spacing, in the bottom-left corner, clear of the drawing
  const len = step * k * v.ppm;
  const x0 = 12;
  const y0 = v.h - 12;
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0 - 4);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + len, y0);
  ctx.lineTo(x0 + len, y0 - 4);
  ctx.stroke();
  ctx.restore();
  label(ctx, `${sci(step, 2)} m`, x0 + len / 2, y0 - 11, p.ink3, p, v);
}

function niceStep(x: number): number {
  const e = 10 ** Math.floor(Math.log10(x));
  const m = x / e;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e;
}

function polyline(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, width: number, dash: number[] = []) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
  ctx.stroke();
  ctx.restore();
}

function dashed(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string) {
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.restore();
}

function ring(ctx: CanvasRenderingContext2D, at: [number, number], color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(at[0], at[1], 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * A canvas label with a paper-coloured halo, so it stays readable over grid lines and arrows. It is kept
 * inside the stage and out of the top-right corner, where the reset and fullscreen buttons sit.
 */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, p: Palette, v: View) {
  ctx.save();
  ctx.font = `600 13px ${p.fontUi}`;
  const half = ctx.measureText(text).width / 2;
  const pad = 4;
  let cx = Math.min(Math.max(x, half + pad), v.w - half - pad);
  let cy = Math.min(Math.max(y, 9 + pad), v.h - 9 - pad);
  if (cx + half > v.w - BUTTONS_W && cy < BUTTONS_H + 9) {
    // under the buttons: move below them if the point was near the top, otherwise to their left
    if (y < BUTTONS_H / 2 + 9) cy = BUTTONS_H + 9;
    else cx = v.w - BUTTONS_W - half - pad;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = p.paper;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
  ctx.restore();
}
