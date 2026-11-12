/**
 * KeplerLaws (lesson 6.5): a planet around the Sun on a Kepler ellipse, moving in real Kepler time (`ellipseAtTime`,
 * Kepler's equation, never an integration). Two views:
 *
 * - 'areas': a = 1 AU, the eccentricity e from a slider. The orbit is cut into eight sectors of equal time T/8 from
 *   the periapsis; the sectors the planet has swept are shaded, and each completed one carries its area, integrated
 *   numerically as ∫½r²dθ (src/physics/kepler.ts `equalTimeSectors`): the second law, measured. The axes toggle draws
 *   the semi-major axis a, the semi-minor axis b and the distance ae from the centre of the ellipse to the Sun (the
 *   first law: the Sun sits at a focus). The velocity arrow grows and shrinks with the speed.
 * - 'periods': an orbit of semi-major axis a (slider, 0.3–40 AU) drawn twice, as a circle of radius a and as an
 *   ellipse of the same a and eccentricity e, both planets leaving the +x axis together at t = 0: they come back
 *   together after one period T, whatever e (the third law, and E = −GMm/(2a)). Below, a log-log plot of T² against
 *   a³ with the eight planets as measured (NASA fact sheet, in kepler.ts) and the line T² = 4π²a³/GM of the model;
 *   the current orbit is a point on that line.
 *
 * Axes: x right (toward the periapsis), y up; the motion is counter-clockwise. Units on screen: AU (1.5·10¹¹ m, the
 * course's constant), years (3.156·10⁷ s), km/s. Every number comes from src/physics; nothing here is a physics formula
 * beyond unit conversions.
 */

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AU, G_NEWTON, M_SUN, YEAR } from '~/physics/constants';
import {
  PLANETS,
  arealVelocity,
  arealVelocityOfState,
  ellipseArea,
  equalTimeSectors,
  planetA,
  planetT,
  semiLatusRectum,
  semiMinorAxis,
  specificOrbitEnergy,
  stateAt,
  type Sector,
} from '~/physics/kepler';
import { orbitalPeriod, radiusAt } from '~/physics/orbit';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type KeplerView = 'areas' | 'periods';

const GM = G_NEWTON * M_SUN;
/** equal-time sectors per period */
const N_SECTORS = 8;
/** a full period plays in about this many seconds of real time */
const RUN_SECONDS = 8;
const E_MAX = 0.8;
const E_MAX_PERIODS = 0.9;
/** the periods view's semi-major axis range [AU], on a log slider */
const A_MIN = 0.3;
const A_MAX = 40;
/** areas view: the world box [AU] (fixed, so the scale stays put as e changes; room above for the buttons) */
const BOX = { x0: -1.88, x1: 1.12, y0: -1.18, y1: 1.5 };
/** the reset and fullscreen buttons cover this corner of the stage (CSS px from the top-right) */
const BUTTONS_W = 96;
const BUTTONS_H = 52;
/** periods view: the orbit drawing takes this fraction of the stage height; the plot the rest */
const ORBIT_FRAC = 0.46;
const JUPITER = PLANETS.find((p) => p.id === 'jupiter')!;

const TASK_LABEL: Record<string, string> = {
  'equal-areas': 'קבעו e של 0.5 לפחות, הציגו את הגזרות והפעילו מחזור שלם. האם השטחים שווים?',
  apoapsis: 'הזיזו את הזמן עד שכוכב הלכת בנקודת הריחוק. איזה חלק מזמן המחזור עבר?',
  circle: 'קבעו e = 0. איזו צורה יש עכשיו לגזרות, ומה קורה למהירות?',
  'same-period': 'קבעו e של 0.6 לפחות והפעילו מחזור שלם. מי חוזר ראשון לציר x?',
  jupiter: 'הזיזו את a עד חצי הציר הראשי של צדק. האם הנקודה של המסלול נופלת על הנקודה של צדק?',
};

export interface KeplerLawsProps {
  id: string;
  view?: KeplerView;
  /** eccentricity */
  e?: number;
  /** semi-major axis [AU] (periods view; the areas view is fixed at 1 AU) */
  a?: number;
  /** time as a fraction of the period */
  tf?: number;
  sectors?: boolean;
  axes?: boolean;
  tasks?: string[];
}

interface State {
  e: number;
  a: number;
  tf: number;
  playing: boolean;
  sectors: boolean;
  axes: boolean;
}

function initial(p: KeplerLawsProps): State {
  const view = p.view ?? 'areas';
  return {
    e: p.e ?? 0.6,
    a: view === 'areas' ? 1 : (p.a ?? 1),
    tf: p.tf ?? 0,
    playing: false,
    sectors: p.sectors ?? true,
    axes: p.axes ?? false,
  };
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const num = (x: number, sig = 3) => (Math.abs(x) < 1e-12 ? '0' : sci(x, sig).replace('-', '−'));
/** the true anomaly at time fraction tf, continuous over one turn (0 → 2π) */
const unwrap = (theta: number, tf: number) => (tf >= 1 ? 2 * Math.PI : theta < -1e-12 || (tf > 0.5 && theta <= 1e-12) ? theta + 2 * Math.PI : theta);

export default function KeplerLaws(props: KeplerLawsProps) {
  const view: KeplerView = props.view ?? 'areas';
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  /** every state a text step produced: none of them ever ticks a task */
  const stepStates = useRef(new WeakSet<State>());
  const userRan = useRef(false);
  const userE = useRef(false);
  const userA = useRef(false);
  const userT = useRef(false);
  const visible = useRef(true);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const aM = s.a * AU;
  const T = orbitalPeriod(GM, aM);
  const tf = clamp(s.tf, 0, 1);
  const now = stateAt(GM, aM, s.e, tf * T);
  const sectors: Sector[] = useMemo(() => equalTimeSectors(GM, aM, s.e, N_SECTORS), [aM, s.e]);
  const circleNow = stateAt(GM, aM, 0, tf * T);

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev, playing: false };
          if (typeof step.e === 'number') next.e = clamp(step.e, 0, view === 'areas' ? E_MAX : E_MAX_PERIODS);
          if (typeof step.a === 'number' && view === 'periods') next.a = clamp(step.a, A_MIN, A_MAX);
          if (typeof step.tf === 'number') next.tf = clamp(step.tf, 0, 1);
          if (typeof step.sectors === 'boolean') next.sectors = step.sectors;
          if (typeof step.axes === 'boolean') next.axes = step.axes;
          stepStates.current.add(next);
          userRan.current = false;
          userE.current = false;
          userA.current = false;
          userT.current = false;
          return next;
        });
      }),
    [props.id],
  );

  // playback: one period in about RUN_SECONDS; still mode freezes it
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.max(0, Math.min(0.05, (t - last) / 1000));
      last = t;
      if (motionAllowed() && visible.current && !document.hidden) {
        setS((prev) => {
          const f = prev.tf + dt / RUN_SECONDS;
          return f >= 1 ? { ...prev, tf: 1, playing: false } : { ...prev, tf: f };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  // tasks: checked against the learner's own states only, never a state a text step produced
  useEffect(() => {
    if (stepStates.current.has(s)) return;
    const has = (id: string) => props.tasks?.includes(id);
    const done = (id: string) => markTask(`${props.id}:${id}`);
    const atEnd = tf >= 1 - 1e-6;
    if (view === 'areas') {
      if (has('equal-areas') && userRan.current && atEnd && s.sectors && s.e >= 0.5 - 1e-9) done('equal-areas');
      if (has('apoapsis') && userT.current && Math.abs(tf - 0.5) < 0.01) done('apoapsis');
      if (has('circle') && userE.current && s.e < 0.005) done('circle');
    } else {
      if (has('same-period') && userRan.current && atEnd && s.e >= 0.6 - 1e-9) done('same-period');
      if (has('jupiter') && userA.current && Math.abs(aM / planetA(JUPITER) - 1) < 0.02) done('jupiter');
    }
  }, [s, props.id, props.tasks]);

  /* ------------------------------------------------------------ drawing */

  const draw = ({ ctx, view: v, palette: p }: FrameInfo) => {
    const narrow = v.w < 520;
    const fs = narrow ? 11 : 13;
    const L = (text: string, x: number, y: number, color: string, size = fs) => label(ctx, text, x, y, color, p, v, size);
    const unit = clamp(v.w / 640, 0.62, 1);
    if (view === 'areas') drawAreas(ctx, v, p, L, unit, narrow);
    else drawPeriods(ctx, v, p, L, unit, narrow, fs);
  };

  function drawAreas(
    ctx: CanvasRenderingContext2D,
    v: View,
    p: Palette,
    L: (t: string, x: number, y: number, c: string, size?: number) => void,
    unit: number,
    narrow: boolean,
  ) {
    const ppm = Math.min(v.w / (BOX.x1 - BOX.x0), v.h / (BOX.y1 - BOX.y0));
    const cx = (BOX.x0 + BOX.x1) / 2;
    const cy = (BOX.y0 + BOX.y1) / 2;
    /** world [AU] → screen */
    const at = (x: number, y: number): [number, number] => [v.w / 2 + (x - cx) * ppm, v.h / 2 - (y - cy) * ppm];
    const e = s.e;
    const pAU = semiLatusRectum(1, e);
    const bAU = semiMinorAxis(1, e);
    const orbitPt = (th: number): [number, number] => {
      const r = radiusAt(pAU, e, th);
      return at(r * Math.cos(th), r * Math.sin(th));
    };
    // the orbit, faint and dashed
    const ring: [number, number][] = [];
    for (let i = 0; i <= 360; i++) ring.push(orbitPt((i / 360) * 2 * Math.PI));
    polyline(ctx, ring, withAlpha(p.ink3, 0.7), 1.2, [4, 4]);
    const thNow = unwrap(now.theta, tf);

    // equal-time sectors from the Sun: completed ones with their area, the current one growing
    if (s.sectors) {
      ctx.save();
      ctx.font = `600 ${narrow ? 10 : 12}px ${p.fontUi}`;
      const labW = ctx.measureText('0.314').width;
      ctx.restore();
      sectors.forEach((sec, k) => {
        if (sec.th0 >= thNow - 1e-12) return;
        const th1 = Math.min(sec.th1, thNow);
        const pts: [number, number][] = [at(0, 0)];
        const n = Math.max(8, Math.ceil(((th1 - sec.th0) * 180) / Math.PI));
        for (let i = 0; i <= n; i++) pts.push(orbitPt(sec.th0 + ((th1 - sec.th0) * i) / n));
        fillPoly(ctx, pts, k % 2 ? withAlpha(p.accent, 0.22) : withAlpha(p.momentum, 0.22));
        strokePoly(ctx, pts, withAlpha(k % 2 ? p.accent : p.momentum, 0.55), 1);
        if (th1 >= sec.th1 - 1e-9) {
          // the area label on the sector's bisector, far enough out that the sector is wide enough for it
          const mid = (sec.th0 + sec.th1) / 2;
          const rMid = radiusAt(pAU, e, mid);
          const width = (sec.th1 - sec.th0) * rMid * ppm;
          const f = clamp((labW + 8) / Math.max(width, 1), 0.5, 0.86);
          const q = at(f * rMid * Math.cos(mid), f * rMid * Math.sin(mid));
          L(num(sec.area / AU ** 2), q[0], q[1], k % 2 ? p.accent : p.momentum, narrow ? 10 : 12);
        }
      });
    }

    // the travelled path
    const path: [number, number][] = [];
    const m = Math.max(2, Math.ceil((thNow * 180) / Math.PI));
    for (let i = 0; i <= m; i++) path.push(orbitPt((thNow * i) / m));
    polyline(ctx, path, p.ink2, 1.8);

    // the first law: centre, the empty focus, a, b and ae
    const C = at(-e, 0);
    if (s.axes) {
      const Pp = at(1 - e, 0);
      const Ap = at(-1 - e, 0);
      const B = at(-e, bAU);
      // a from the centre toward the apoapsis (the other half carries ae and the Sun)
      dashed(ctx, Ap, Pp, withAlpha(p.ink2, 0.7), 1.2);
      line(ctx, C, Ap, p.ink, 1.8);
      line(ctx, C, B, p.ink, 1.8);
      if (e > 0.02) line(ctx, C, at(0, 0), p.accent, 2.4);
      L('a', (C[0] + Ap[0]) / 2, C[1] - 13, p.ink);
      L('b', C[0] - 12, (C[1] + B[1]) / 2, p.ink);
      if (e > 0.12) L('ae', (C[0] + at(0, 0)[0]) / 2, C[1] - 13, p.accent);
      // the far focus and the centre
      const F2 = at(-2 * e, 0);
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(F2[0], F2[1], 4 * unit + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    cross(ctx, C, p.ink2, 5 * unit + 1);

    // the Sun at the focus
    const S = at(0, 0);
    ctx.save();
    ctx.fillStyle = p.energyTh;
    ctx.beginPath();
    ctx.arc(S[0], S[1], 8 * unit + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // r from the Sun, the planet and its velocity
    const P = at(now.r[0] / AU, now.r[1] / AU);
    line(ctx, S, P, p.ink, 1.6);
    const speed = Math.hypot(now.v[0], now.v[1]);
    const vMax = Math.sqrt((GM / aM) * ((1 + e) / (1 - e)));
    const vLen = Math.max((speed / vMax) * 0.62 * ppm, 18);
    const Vt: [number, number] = [P[0] + (now.v[0] / speed) * vLen, P[1] - (now.v[1] / speed) * vLen];
    arrow(ctx, P[0], P[1], Vt[0], Vt[1], { color: p.velocity, width: 3, head: 11 });
    beyond(L, 'v', P, Vt, p.velocity);
    planet(ctx, P, p, 6 * unit + 1, true);
  }

  function drawPeriods(
    ctx: CanvasRenderingContext2D,
    v: View,
    p: Palette,
    L: (t: string, x: number, y: number, c: string, size?: number) => void,
    unit: number,
    narrow: boolean,
    fs: number,
  ) {
    const areaH = v.h * ORBIT_FRAC;
    const e = s.e;
    // world box [AU]: the ellipse (periapsis at +x) and the circle of radius a, with margins; the top margin clears the buttons
    const a = s.a;
    const x0 = -a * (1 + e), x1 = a, y0 = -a, y1 = a;
    const padTop = BUTTONS_H - 6;
    const pad = 12;
    // never negative, even while the stage is still being laid out
    const ppm = Math.max(1e-3, Math.min((v.w - 2 * pad - BUTTONS_W * 0.4) / (x1 - x0), (areaH - padTop - pad) / (y1 - y0)));
    const cxs = pad + (v.w - 2 * pad - BUTTONS_W * 0.4) / 2;
    const cys = padTop + (areaH - padTop - pad) / 2;
    const at = (x: number, y: number): [number, number] => [cxs + (x - (x0 + x1) / 2) * ppm, cys - (y - (y0 + y1) / 2) * ppm];
    // the circle and the ellipse, with the scale bar
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink2, 0.8);
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    const O = at(0, 0);
    ctx.beginPath();
    ctx.arc(O[0], O[1], a * ppm, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const pE = semiLatusRectum(a, e);
    const ring: [number, number][] = [];
    for (let i = 0; i <= 360; i++) {
      const th = (i / 360) * 2 * Math.PI;
      const r = radiusAt(pE, e, th);
      ring.push(at(r * Math.cos(th), r * Math.sin(th)));
    }
    polyline(ctx, ring, p.ink, 1.6);
    ctx.save();
    ctx.fillStyle = p.energyTh;
    ctx.beginPath();
    ctx.arc(O[0], O[1], 6 * unit + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // both planets: the circle's hollow, the ellipse's filled
    const Pc = at(circleNow.r[0] / AU, circleNow.r[1] / AU);
    const Pe = at(now.r[0] / AU, now.r[1] / AU);
    planet(ctx, Pc, p, 6 * unit + 1, false);
    planet(ctx, Pe, p, 6 * unit + 1, true);
    // a scale bar of a nice length, bottom left of the orbit area
    const nice = niceLength(a / 2);
    const bx = pad + 4;
    const by = areaH - 10;
    line(ctx, [bx, by], [bx + nice * ppm, by], p.ink2, 2);
    line(ctx, [bx, by - 4], [bx, by + 4], p.ink2, 1.5);
    line(ctx, [bx + nice * ppm, by - 4], [bx + nice * ppm, by + 4], p.ink2, 1.5);
    L(`${num(nice, 2)} AU`, bx + (nice * ppm) / 2, by - 11, p.ink2, fs - 1);
    // a separator
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.beginPath();
    ctx.moveTo(0, areaH + 0.5);
    ctx.lineTo(v.w, areaH + 0.5);
    ctx.stroke();
    ctx.restore();

    // the plot: T² against a³, both logarithmic
    const box = insetBox({ x: 0, y: areaH, w: v.w, h: v.h - areaH }, { l: 58, r: 14, t: 14, b: 44 });
    const plot: Plot = makePlot(
      box,
      { min: 0.01, max: 1e5, scale: 'log', label: 'a³ (AU³)' },
      { min: 0.01, max: 1e5, scale: 'log', label: 'T² (yr²)' },
    );
    drawAxes(ctx, plot, p);
    // the model's line
    const k = (4 * Math.PI * Math.PI * AU ** 3) / (GM * YEAR * YEAR);
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.strokeStyle = withAlpha(p.accent, 0.8);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(plot.px(0.01), plot.py(0.01 * k));
    ctx.lineTo(plot.px(1e5), plot.py(1e5 * k));
    ctx.stroke();
    ctx.restore();
    // the planets as measured
    PLANETS.forEach((pl, i) => {
      const ax = (planetA(pl) / AU) ** 3;
      const ty = (planetT(pl) / YEAR) ** 2;
      const X = plot.px(ax), Y = plot.py(ty);
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(X, Y, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const size = narrow ? 10 : 11;
      // on a narrow stage the inner planets crowd: name only Mercury, the Earth, Jupiter and Neptune, all above the line
      if (narrow) {
        if (['mercury', 'earth', 'jupiter', 'neptune'].includes(pl.id)) hebrew(ctx, pl.he, X - 7, Y - 9, p.ink2, p, size, 'right');
      } else if (i % 2 === 0) hebrew(ctx, pl.he, X - 7, Y - 9, p.ink2, p, size, 'right');
      else hebrew(ctx, pl.he, X + 7, Y + 10, p.ink2, p, size, 'left');
    });
    // the current orbit
    const X = plot.px(a ** 3), Y = plot.py((T / YEAR) ** 2);
    ctx.save();
    ctx.strokeStyle = withAlpha(p.accent, 0.9);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(X, box.y + box.h);
    ctx.lineTo(X, Y);
    ctx.lineTo(box.x, Y);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(X, Y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [s, sectors]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const io = new IntersectionObserver((es) => {
      visible.current = es.some((x) => x.isIntersecting);
    });
    io.observe(c);
    return () => io.disconnect();
  }, []);

  /* ------------------------------------------------------------ interaction */

  const setTime = (f: number) => {
    userT.current = true;
    userRan.current = true;
    setS((prev) => ({ ...prev, tf: clamp(f, 0, 1), playing: false }));
  };
  const togglePlay = () => {
    userRan.current = true;
    setS((prev) => ({ ...prev, playing: !prev.playing, tf: !prev.playing && prev.tf >= 0.999 ? 0 : prev.tf }));
  };
  const setE = (e: number) => {
    userE.current = true;
    userRan.current = false;
    setS((prev) => ({ ...prev, e: Math.round(e * 100) / 100, tf: 0, playing: false }));
  };
  const setA = (lg: number) => {
    userA.current = true;
    userRan.current = false;
    setS((prev) => ({ ...prev, a: 10 ** lg, tf: 0, playing: false }));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      togglePlay();
      return;
    }
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setTime(tf + d / 80);
  };
  const reset = () => {
    userRan.current = false;
    userE.current = false;
    userA.current = false;
    userT.current = false;
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const speed = Math.hypot(now.v[0], now.v[1]);
  const areal = (arealVelocityOfState(now.r, now.v) * YEAR) / AU ** 2;
  function describe() {
    const base = `זמן ${num(tf * T / YEAR)} שנים מתוך זמן מחזור ${num(T / YEAR)} שנים; מרחק מהשמש ${num(now.dist / AU)} AU, מהירות ${num(speed / 1e3)} km/s.`;
    if (view === 'areas') return `אליפסה עם a = 1 AU ו-e = ${num(s.e, 2)}. ${base} כל גזרה בשטח ${num(sectors[0].area / AU ** 2)} AU².`;
    return `מעגל ואליפסה עם a = ${num(s.a)} AU ו-e = ${num(s.e, 2)}. ${base}`;
  }

  /* ------------------------------------------------------------ readouts */

  let readout: ComponentChildren;
  if (view === 'areas') {
    readout = (
      <>
        <span class="q" data-readout="t">t = {num((tf * T) / YEAR)} yr</span>
        <span class="q" data-readout="T">T = {num(T / YEAR)} yr</span>
        <span class="q" data-readout="r">r = {num(now.dist / AU)} AU</span>
        <span class="q" data-readout="v">v = {num(speed / 1e3)} km/s</span>
        <b class="q" data-readout="areal">½|r×v| = {num(areal)} AU²/yr</b>
        <span class="q" data-readout="piab">πab/T = {num((ellipseArea(aM, s.e) / AU ** 2) / (T / YEAR))} AU²/yr</span>
        <b class="q" data-readout="sector">ΔA = {num(sectors[0].area / AU ** 2)} AU²</b>
      </>
    );
  } else {
    const eps = specificOrbitEnergy(GM, aM);
    const kE = 0.5 * speed * speed;
    const uE = -GM / now.dist;
    const kC = 0.5 * (circleNow.v[0] ** 2 + circleNow.v[1] ** 2);
    const uC = -GM / circleNow.dist;
    readout = (
      <>
        <span class="q" data-readout="a">a = {num(s.a)} AU</span>
        <b class="q" data-readout="T">T = {num(T / YEAR)} yr</b>
        <span class="q" data-readout="t">t = {num((tf * T) / YEAR)} yr</span>
        <span class="q" data-readout="ratio">T²/a³ = {num((T / YEAR) ** 2 / s.a ** 3, 4)} yr²/AU³</span>
        <span class="q" data-readout="ellipse">● K/m = {num(kE)}, U/m = {num(uE)} J/kg</span>
        <span class="q" data-readout="circle">○ K/m = {num(kC)}, U/m = {num(uC)} J/kg</span>
        <b class="q" data-readout="eps">E/m = −GM/(2a) = {num(eps)} J/kg</b>
        <span class="q" data-readout="h">dA/dt: ● {num((arealVelocity(GM, aM, s.e) * YEAR) / AU ** 2)}, ○ {num((arealVelocity(GM, aM, 0) * YEAR) / AU ** 2)} AU²/yr</span>
      </>
    );
  }

  const label0 =
    view === 'areas'
      ? 'איור חי: כוכב לכת על אליפסה סביב השמש, והגזרות שהקו מהשמש מכסה בשמיניות של זמן המחזור. '
      : 'איור חי: מסלול מעגלי ומסלול אליפטי עם אותו חצי ציר ראשי, וגרף של ריבוע זמן המחזור מול חצי הציר הראשי בחזקה שלישית. ';
  const lgA = Math.log10(s.a);
  return (
    <SimShell
      fig={props.id}
      label={`${label0}${describe()} רווח מפעיל ועוצר; חיצים מזיזים את הזמן.`}
      canvasRef={canvasRef}
      aspect={view === 'areas' ? 1.12 : 0.85}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      readout={readout}
      controls={
        <>
          <div class="group" role="group" aria-label="זמן">
            <button type="button" class="toggle" onClick={togglePlay} aria-pressed={s.playing}>
              {s.playing ? 'עצירה' : 'הפעלה'}
            </button>
          </div>
          <Slider label="הזמן t" min={0} max={1} step={1 / 400} value={tf} format={(f) => `${num((f * T) / YEAR)} yr`} onChange={setTime} />
          <Slider label="האקסצנטריות e" min={0} max={view === 'areas' ? E_MAX : E_MAX_PERIODS} step={0.01} value={s.e} format={(e) => num(e, 2)} onChange={setE} />
          {view === 'periods' && (
            <Slider
              label="חצי הציר הראשי a"
              min={Math.log10(A_MIN)}
              max={Math.log10(A_MAX)}
              step={(Math.log10(A_MAX) - Math.log10(A_MIN)) / 400}
              value={lgA}
              format={(lg) => `${num(10 ** lg)} AU`}
              onChange={setA}
            />
          )}
          {view === 'areas' && (
            <div class="group" role="group" aria-label="מה להציג">
              <Toggle label="גזרות" on={s.sectors} swatch="var(--momentum)" onChange={(x) => setS((prev) => ({ ...prev, sectors: x }))} />
              <Toggle label="צירים" on={s.axes} swatch="var(--accent)" onChange={(x) => setS((prev) => ({ ...prev, axes: x }))} />
            </div>
          )}
        </>
      }
    />
  );
}

/* ------------------------------------------------------------ drawing helpers */

/** 1, 2 or 5 × 10ⁿ, at most x */
function niceLength(x: number): number {
  const mag = 10 ** Math.floor(Math.log10(x));
  const f = x / mag;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * mag;
}

function planet(ctx: CanvasRenderingContext2D, P: [number, number], p: Palette, r: number, filled: boolean) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(P[0], P[1], Math.max(4, r), 0, Math.PI * 2);
  if (filled) {
    ctx.fillStyle = p.ink;
    ctx.fill();
  } else {
    ctx.fillStyle = p.paper;
    ctx.fill();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function cross(ctx: CanvasRenderingContext2D, C: [number, number], color: string, s: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(C[0] - s, C[1]);
  ctx.lineTo(C[0] + s, C[1]);
  ctx.moveTo(C[0], C[1] - s);
  ctx.lineTo(C[0], C[1] + s);
  ctx.stroke();
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string, width: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.restore();
}

function dashed(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string, width = 1.2) {
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.restore();
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

function fillPoly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function strokePoly(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, width: number) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}

/** A label just beyond the tip of an arrow from `from` to `to`. */
function beyond(
  L: (text: string, x: number, y: number, color: string) => void,
  text: string,
  from: [number, number],
  to: [number, number],
  color: string,
  gap = 12,
) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const d = Math.hypot(dx, dy) || 1;
  L(text, to[0] + (gap * dx) / d, to[1] + (gap * dy) / d, color);
}

/**
 * A canvas label (Latin letters and numbers, LTR) with a paper-coloured halo, kept inside the stage and out of the
 * top-right corner where the reset and fullscreen buttons sit.
 */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, p: Palette, v: View, size: number) {
  ctx.save();
  ctx.font = `600 ${size}px ${p.fontUi}`;
  ctx.direction = 'ltr';
  const half = ctx.measureText(text).width / 2;
  const pad = 4;
  let cx = Math.min(Math.max(x, half + pad), v.w - half - pad);
  let cy = Math.min(Math.max(y, 9 + pad), v.h - 9 - pad);
  if (cx + half > v.w - BUTTONS_W && cy < BUTTONS_H + 9) {
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

/** A Hebrew label (an RTL run), anchored at x on its right or left end. */
function hebrew(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, p: Palette, size: number, align: 'right' | 'left') {
  ctx.save();
  ctx.font = `600 ${size}px ${p.fontUi}`;
  ctx.direction = 'rtl';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = p.paper;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
