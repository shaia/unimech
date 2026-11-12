/**
 * HohmannTransfer: a spacecraft around the Earth, seen from above the plane of its orbit (lesson 6.6).
 *
 * Two modes, chosen by a prop and by the mode buttons:
 *   'escape'   a launch from distance r at speed v, at angle α above the local horizontal (α = 0: along the
 *              dashed circle of radius r, counter-clockwise; α = 90°: straight out). The curve is the orbit the
 *              launch produces: an ellipse, a parabola or a hyperbola, or a straight line when α = 90°. A path
 *              that dips inside the Earth ends at its surface (the part inside is hidden by the disc).
 *   'transfer' the craft starts on the inner circle r₁ (dashed); the outer circle r₂ (dashed) is the target. The
 *              learner sets Δv and fires a tangential burn (along the velocity) wherever the craft is; the jump
 *              buttons move the craft along its orbit to the next periapsis or apoapsis.
 * A filled dot marks the periapsis of the current orbit, a ring its apoapsis. The craft carries its velocity
 * arrow; each burn leaves a mark in the acceleration colour (Δv₁, Δv₂, …).
 *
 * The strip under the orbit:
 *   escape:   a speed axis at the craft's current distance: the circular speed v_c(r) and the escape speed
 *             v_esc(r) as ticks, the region v ≥ v_esc shaded, and the craft's speed as a diamond.
 *   transfer: the Hohmann ladder of speeds for the current r₁, r₂ (v₁, the transfer ellipse at r₁, at r₂, and
 *             v₂): Δv₁ and Δv₂ as arrows in the acceleration colour, the unpowered coast between them dashed;
 *             below it the learner's own burns as bars (|Δv| each, end to end) against the Hohmann total.
 *
 * Physics: src/physics/orbit.ts (elements, vis-viva, Hohmann) and src/physics/transfer.ts (burns, states on a
 * conic, propagation). GM = G_NEWTON · M_EARTH, radii in Earth radii R_E on the sliders. The clock is sped up so
 * that one circular orbit at the reference radius takes about six seconds.
 *
 * Props (Astro wrapper: <Spread fig="fig-6-6a" figure={HohmannTransfer} figureProps={{ … }}>)
 *   id     figure id (Spread passes it); tasks are `${id}:${task}`
 *   mode   'escape' | 'transfer' (default 'escape')
 *   r      launch distance [R_E], 1…3 in steps of 0.1 (default 2)
 *   v      launch speed [km/s], 1…12 in steps of 0.05 (default 7)
 *   alpha  launch angle above the horizontal [deg], 0…90 in steps of 5 (default 0)
 *   r1, r2 inner start circle and target circle [R_E], 1.2…8 in steps of 0.1 (defaults 2 and 5)
 *   dv     the burn [km/s], −3…3 in steps of 0.01 (default 0)
 *   tasks  task ids to show (below)
 *
 * Step `set` keys: mode, r, v (km/s, or 'esc' / 'circ' for exactly v_esc(r) / v_c(r)), alpha, at ('launch' |
 *   'peri' | 'apo' | 'minor': where the craft sits on the escape orbit), r1, r2, dv (km/s, or 'h1' / 'h2' for the
 *   exact Hohmann burns), stage ('start' | 'burn1' | 'coast' | 'apo' | 'burn2' | 'brake'). Steps never tick tasks:
 *   tasks are ticked only inside the learner's own event handlers.
 *
 * Tasks:
 *   escape       the learner raises the launch speed until the orbit opens (ε ≥ 0)
 *   angle        the learner changes the launch angle at a fixed speed (a does not change)
 *   burn1        a first burn from the circle r₁ whose far apsis lands within 2% of r₂
 *   circularise  a burn that leaves a circle (e < 0.02) within 2% of r₂, after at least one earlier burn
 *   brake        a backward burn at r ≈ r₂ > r₁, after at least one earlier burn
 *   down         a completed transfer inward: a circle within 2% of r₂ < r₁
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { G_NEWTON, M_EARTH, R_EARTH } from '~/physics/constants';
import { apsides, circularSpeed, elementsFromState, escapeSpeed, orbitalPeriod, radiusAt, type Elements, type PlanarState } from '~/physics/orbit';
import { apsisState, hohmannSpeeds, hitsBody, launchState, propagate, stateAt, tangentialBurn } from '~/physics/transfer';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Mode = 'escape' | 'transfer';
type Vec = readonly [number, number];

const GM = G_NEWTON * M_EARTH;
const RE = R_EARTH;
const SECONDS_PER_ORBIT = 6;

const TASK_LABEL: Record<string, string> = {
  escape: 'הגדילו את מהירות השיגור עד שהמסלול נפתח ולא חוזר.',
  angle: 'השאירו את המהירות ושנו את זווית השיגור. מה משתנה במסלול, ומה לא?',
  burn1: 'במצב "מעבר": מצאו Δv שמביא את הנקודה הרחוקה של המסלול אל המעגל החיצוני, ולחצו "דחיפה".',
  circularise: 'הגיעו אל המעגל החיצוני ותנו דחיפה שנייה, כך שהחללית תישאר עליו במסלול מעגלי.',
  brake: 'נסו גם את הרעיון ההפוך: על המעגל החיצוני תנו דחיפה אחורה (Δv שלילי). לאן החללית הולכת?',
  down: 'העבירו את החללית ממעגל חיצוני אל מעגל פנימי, ובדקו לאיזה כיוון כל אחת משתי הדחיפות.',
};

export interface HohmannTransferProps {
  id: string;
  mode?: Mode;
  r?: number;
  v?: number;
  alpha?: number;
  r1?: number;
  r2?: number;
  dv?: number;
  tasks?: string[];
}

interface Burn {
  at: Vec;
  dv: number;
}

interface State {
  mode: Mode;
  /** escape launch distance [m], speed [m/s], angle [deg] */
  r: number;
  v: number;
  alpha: number;
  /** transfer circles [m] and the burn on the slider [m/s] */
  r1: number;
  r2: number;
  dv: number;
  craft: PlanarState;
  burns: Burn[];
  playing: boolean;
  hit: boolean;
  gone: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const snap = (x: number, step: number) => Math.round(x / step) * step;
const num = (x: number, sig = 3) => (Math.abs(x) < 1e-9 ? '0' : sci(x, sig).replace('-', '−'));
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

const rLaunch = (x: unknown, d: number) => clamp(snap(isNum(x) ? x : d, 0.1), 1, 3) * RE;
const rCircle = (x: unknown, d: number) => clamp(snap(isNum(x) ? x : d, 0.1), 1.2, 8) * RE;
const angle = (x: unknown, d: number) => clamp(snap(isNum(x) ? x : d, 5), 0, 90);
const speed = (x: unknown, d: number) => clamp(snap(isNum(x) ? x : d, 0.05), 1, 12) * 1e3;
const burnSize = (x: unknown, d: number) => clamp(snap(isNum(x) ? x : d, 0.01), -3, 3) * 1e3;

const circleState = (r: number): PlanarState => ({ r: [r, 0], v: [0, circularSpeed(GM, r)] });
const launch = (s: Pick<State, 'r' | 'v' | 'alpha'>) => launchState(s.r, s.v, (s.alpha * Math.PI) / 180);

function initial(p: HohmannTransferProps): State {
  const mode: Mode = p.mode ?? 'escape';
  const r = rLaunch(p.r, 2);
  const v = speed(p.v, 7);
  const alpha = angle(p.alpha, 0);
  const r1 = rCircle(p.r1, 2);
  const r2 = rCircle(p.r2, 5);
  return {
    mode,
    r,
    v,
    alpha,
    r1,
    r2,
    dv: burnSize(p.dv, 0),
    craft: mode === 'escape' ? launch({ r, v, alpha }) : circleState(r1),
    burns: [],
    playing: false,
    hit: false,
    gone: false,
  };
}

/* ================================================================== the orbit of a state */

interface Orbit {
  el: Elements;
  eps: number;
  /** ε ≥ 0 within rounding */
  open: boolean;
  /** h ≈ 0: a straight radial line */
  radial: boolean;
  a: number;
  rp: number;
  ra: number;
  hits: boolean;
  kind: 'circle' | 'ellipse' | 'parabola' | 'hyperbola' | 'radial';
}

function orbitOf(c: PlanarState): Orbit {
  const el = elementsFromState(GM, c.r, c.v);
  const r = Math.hypot(c.r[0], c.r[1]);
  const v = Math.hypot(c.v[0], c.v[1]);
  const eps = 0.5 * v * v - GM / r;
  // classification by the energy, not by e: a radial orbit has e = 1 whatever its energy
  const band = 1e-9 * (GM / r);
  const open = eps > -band;
  const radial = Math.abs(el.h) < 1e-9 * r * Math.max(v, 1);
  const a = Math.abs(eps) <= band ? Number.POSITIVE_INFINITY : -GM / (2 * eps);
  const { rp, ra } = radial ? { rp: 0, ra: open ? Number.POSITIVE_INFINITY : 2 * a } : apsides(el.p, el.e);
  const kind: Orbit['kind'] = radial
    ? 'radial'
    : Math.abs(eps) <= band
      ? 'parabola'
      : open
        ? 'hyperbola'
        : el.e < 1e-6
          ? 'circle'
          : 'ellipse';
  const hits = radial ? !open || dot(c.r, c.v) < 0 : !open ? hitsBody(el, RE * (1 - 1e-9)) : dot(c.r, c.v) < 0 && el.p / (1 + el.e) < RE;
  return { el, eps, open, radial, a, rp, ra, hits, kind };
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const rOf = (c: PlanarState) => Math.hypot(c.r[0], c.r[1]);
const vOf = (c: PlanarState) => Math.hypot(c.v[0], c.v[1]);

/** The radius the view must show: fixed per mode and setting, so a burn never rescales the picture. */
const viewRadius = (s: State) => (s.mode === 'escape' ? 4.2 * s.r : 1.14 * Math.max(s.r1, s.r2));

/** Reference radius for the clock: one circular orbit there takes SECONDS_PER_ORBIT. */
const warp = (s: State) => orbitalPeriod(GM, s.mode === 'escape' ? s.r : s.r1) / SECONDS_PER_ORBIT;

/* ================================================================== transfer stages for the steps */

function transferStage(s: State, stage: string): Pick<State, 'craft' | 'burns'> {
  const c0 = circleState(s.r1);
  if (stage === 'start' || s.r1 === s.r2) return { craft: c0, burns: [] };
  const H = hohmannSpeeds(GM, s.r1, s.r2);
  const b1: Burn = { at: c0.r, dv: H.dv1 };
  const c1 = tangentialBurn(c0, H.dv1);
  if (stage === 'burn1') return { craft: c1, burns: [b1] };
  const el1 = elementsFromState(GM, c1.r, c1.v);
  if (stage === 'coast') return { craft: stateAt(GM, el1, Math.PI / 2), burns: [b1] };
  // the far apsis of the transfer ellipse: the apoapsis outward, the periapsis inward
  const far = apsisState(GM, el1, s.r2 > s.r1 ? 'apo' : 'peri') ?? c1;
  if (stage === 'apo') return { craft: far, burns: [b1] };
  if (stage === 'burn2') return { craft: tangentialBurn(far, H.dv2), burns: [b1, { at: far.r, dv: H.dv2 }] };
  if (stage === 'brake') return { craft: tangentialBurn(far, -Math.abs(H.dv2)), burns: [b1, { at: far.r, dv: -Math.abs(H.dv2) }] };
  return { craft: c0, burns: [] };
}

function escapeAt(c: PlanarState, at: string): PlanarState {
  const o = orbitOf(c);
  if (o.radial || o.kind === 'circle') return c;
  if (at === 'peri') return apsisState(GM, o.el, 'peri') ?? c;
  if (at === 'apo') return o.open ? c : (apsisState(GM, o.el, 'apo') ?? c);
  if (at === 'minor' && !o.open) {
    // the end of the minor axis, where r = a: cos θ = −e, on the way out (θ in (0, π))
    return stateAt(GM, o.el, o.el.periapsisAngle + Math.sign(o.el.h) * Math.acos(-o.el.e));
  }
  return c;
}

/* ================================================================== text on the canvas */

function mathText(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  s: string,
  x: number,
  y: number,
  o: { color?: string; size?: number; italic?: boolean; align?: CanvasTextAlign; weight?: number; sub?: string } = {},
): number {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textBaseline = 'middle';
  const size = o.size ?? 13;
  const big = `${o.italic === false ? '' : 'italic '}${o.weight ?? 700} ${size}px ${p.fontUi}`;
  const small = `${o.italic === false ? '' : 'italic '}${o.weight ?? 700} ${Math.round(size * 0.72)}px ${p.fontUi}`;
  ctx.font = big;
  const wb = ctx.measureText(s).width;
  ctx.font = small;
  const ws = o.sub ? ctx.measureText(o.sub).width + 1 : 0;
  const total = wb + ws;
  const align = o.align ?? 'center';
  const x0 = align === 'center' ? x - total / 2 : align === 'right' || align === 'end' ? x - total : x;
  ctx.textAlign = 'left';
  const draw = (t: string, font: string, xx: number, yy: number) => {
    ctx.font = font;
    ctx.lineWidth = 3;
    ctx.strokeStyle = withAlpha(p.paper, 0.85);
    ctx.strokeText(t, xx, yy);
    ctx.fillStyle = o.color ?? p.ink;
    ctx.fillText(t, xx, yy);
  };
  draw(s, big, x0, y);
  if (o.sub) draw(o.sub, small, x0 + wb + 1, y + size * 0.3);
  ctx.restore();
  return total;
}

/** Hebrew label, RTL, its right edge at x. */
function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; weight?: number } = {}): number {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `${o.weight ?? 600} ${o.size ?? 12}px ${p.fontUi}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink2;
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/* ================================================================== the component */

export default function HohmannTransfer(props: HohmannTransferProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t) ?? false;
  const done = (t: string) => {
    if (has(t)) markTask(`${props.id}:${t}`);
  };
  const o = orbitOf(s.craft);

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next: State = { ...prev, playing: false, hit: false, gone: false };
          if (st.mode === 'escape' || st.mode === 'transfer') next.mode = st.mode;
          if (isNum(st.r)) next.r = rLaunch(st.r, prev.r / RE);
          if (isNum(st.alpha)) next.alpha = angle(st.alpha, prev.alpha);
          if (isNum(st.v)) next.v = speed(st.v, prev.v / 1e3);
          else if (st.v === 'esc') next.v = escapeSpeed(GM, next.r);
          else if (st.v === 'circ') next.v = circularSpeed(GM, next.r);
          if (isNum(st.r1)) next.r1 = rCircle(st.r1, prev.r1 / RE);
          if (isNum(st.r2)) next.r2 = rCircle(st.r2, prev.r2 / RE);
          const H = next.r1 !== next.r2 ? hohmannSpeeds(GM, next.r1, next.r2) : null;
          if (isNum(st.dv)) next.dv = burnSize(st.dv, prev.dv / 1e3);
          else if (st.dv === 'h1' && H) next.dv = H.dv1;
          else if (st.dv === 'h2' && H) next.dv = H.dv2;
          if (next.mode === 'escape') {
            const c = launch(next);
            next.craft = typeof st.at === 'string' ? escapeAt(c, st.at) : c;
            next.burns = [];
          } else {
            Object.assign(next, transferStage(next, typeof st.stage === 'string' ? st.stage : 'start'));
          }
          return next;
        });
      }),
    [props.id],
  );

  // playback along the orbit, frozen in still mode
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => {
        if (!prev.playing) return prev;
        const out = propagate(GM, prev.craft, dt * warp(prev), 2e-3, RE);
        if (out.hit) return { ...prev, craft: out.s, playing: false, hit: true };
        if (rOf(out.s) > 1.6 * viewRadius(prev)) return { ...prev, craft: out.s, playing: false, gone: true };
        return { ...prev, craft: out.s };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  useEffect(() => {
    const h = setTimeout(() => setLive(describe(s, o)), 700);
    return () => clearTimeout(h);
  }, [s.mode, s.r, s.v, s.alpha, s.r1, s.r2, s.burns.length]);

  // a taller stage on a narrow screen
  const [aspect, setAspect] = useState(0.92);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paint(ctx, view, p, s, o);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 10, worldHeight: 10 / aspect, animate: false });
  useEffect(invalidate, [s, aspect]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAspect(el.getBoundingClientRect().width < 520 ? 0.74 : 0.92));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------------- the learner's own actions (the only place tasks are ticked) */

  const setLaunch = (patch: Partial<Pick<State, 'r' | 'v' | 'alpha'>>) => {
    const next = { ...s, ...patch };
    const c = launch(next);
    const no = orbitOf(c);
    setS({ ...next, craft: c, burns: [], playing: false, hit: false, gone: false });
    if ('v' in patch && no.open) done('escape');
    if ('alpha' in patch && patch.alpha !== s.alpha) done('angle');
  };

  const setCircles = (patch: Partial<Pick<State, 'r1' | 'r2'>>) => {
    const next = { ...s, ...patch };
    setS({ ...next, craft: circleState(next.r1), burns: [], playing: false, hit: false, gone: false });
  };

  const setMode = (mode: Mode) => {
    if (mode === s.mode) return;
    const next = { ...s, mode };
    setS({ ...next, craft: mode === 'escape' ? launch(next) : circleState(next.r1), burns: [], playing: false, hit: false, gone: false });
  };

  const fire = () => {
    if (s.mode !== 'transfer' || s.hit || s.gone || s.dv === 0) return;
    const before = s.craft;
    const c = tangentialBurn(before, s.dv);
    const burns = [...s.burns, { at: before.r, dv: s.dv }];
    setS({ ...s, craft: c, burns });
    const no = orbitOf(c);
    const r = rOf(before);
    const near = (x: number, y: number) => Math.abs(x / y - 1) < 0.02;
    // the first burn from the start circle: the far apsis must reach r₂
    if (s.burns.length === 0 && near(r, s.r1) && !no.open && !no.radial) {
      const far = Math.abs(no.rp - r) < Math.abs(no.ra - r) ? no.ra : no.rp;
      if (near(far, s.r2) && s.r2 !== s.r1) done('burn1');
    }
    if (s.burns.length >= 1 && !no.open && no.el.e < 0.02 && near(r, s.r2) && s.r2 !== s.r1) {
      done('circularise');
      if (s.r2 < s.r1) done('down');
    }
    if (s.burns.length >= 1 && s.dv < 0 && s.r2 > s.r1 && near(r, s.r2)) done('brake');
  };

  const jump = (which: 'peri' | 'apo') => {
    if (o.open || o.radial || o.kind === 'circle' || o.hits) return;
    const c = apsisState(GM, o.el, which);
    if (c) setS({ ...s, craft: c, playing: false });
  };

  const reset = () => {
    const next = initial(props);
    setS(next);
    setLive('האיור אופס.');
  };

  const play = (on: boolean) => {
    if (on && (s.hit || s.gone)) {
      // after a crash or an exit the scene starts again: from the launch, or from the start circle
      const fresh = s.mode === 'escape' ? launch(s) : circleState(s.r1);
      setS({ ...s, craft: fresh, burns: [], hit: false, gone: false, playing: true });
      return;
    }
    setS({ ...s, playing: on });
  };

  const H = s.r1 !== s.r2 ? hohmannSpeeds(GM, s.r1, s.r2) : null;
  const total = s.burns.reduce((acc, b) => acc + Math.abs(b.dv), 0);
  const canJump = !o.open && !o.radial && o.kind !== 'circle' && !o.hits && !s.hit && !s.gone;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: חללית סביב כדור הארץ, במבט מעל מישור המסלול. ${describe(s, o)}`}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        s.mode === 'escape' ? (
          <>
            <span class="q" data-readout="r">
              <i>r</i> = {num(rOf(s.craft) / RE)} <i>R</i>
              <sub>E</sub>
            </span>
            <span class="q" data-readout="v">
              <i>v</i> = {num(vOf(s.craft) / 1e3)} km/s
            </span>
            <span class="q" data-readout="vc">
              <i>v</i>
              <sub>c</sub> = {num(circularSpeed(GM, rOf(s.craft)) / 1e3)} km/s
            </span>
            <span class="q" data-readout="vesc">
              <i>v</i>
              <sub>esc</sub> = {num(escapeSpeed(GM, rOf(s.craft)) / 1e3)} km/s
            </span>
            <span class="q" data-readout="eps">
              <i>ε</i> = {num(o.eps / 1e6)} MJ/kg
            </span>
            <span data-readout="a">
              {o.open ? (
                'המסלול פתוח'
              ) : (
                <b class="q">
                  <i>a</i> = {num(o.a / RE)} <i>R</i>
                  <sub>E</sub>
                </b>
              )}
            </span>
            <span data-readout="kind">
              <b>{KIND_HE[o.kind]}</b>
              {o.hits ? ', פוגע בכדור הארץ' : ''}
            </span>
          </>
        ) : (
          <>
            <span class="q" data-readout="r">
              <i>r</i> = {num(rOf(s.craft) / RE)} <i>R</i>
              <sub>E</sub>
            </span>
            <span class="q" data-readout="v">
              <i>v</i> = {num(vOf(s.craft) / 1e3)} km/s
            </span>
            <span data-readout="orbit">
              {o.open || o.radial ? (
                <b>{KIND_HE[o.kind]}</b>
              ) : o.kind === 'circle' ? (
                <b class="q">
                  מעגל, <i>r</i> = {num(o.a / RE)} <i>R</i>
                  <sub>E</sub>
                </b>
              ) : (
                <b class="q">
                  <i>r</i>
                  <sub>p</sub> = {num(o.rp / RE)}, <i>r</i>
                  <sub>a</sub> = {num(o.ra / RE)} <i>R</i>
                  <sub>E</sub>
                </b>
              )}
              {o.hits ? ', פוגע בכדור הארץ' : ''}
            </span>
            <span data-readout="burns">
              הדחיפות שלכם:{' '}
              <b class="q">
                {s.burns.length === 0 ? '—' : `Σ|Δv| = ${num(total / 1e3)} km/s`}
              </b>
            </span>
            {H && (
              <span data-readout="hohmann">
                הוהמן:{' '}
                <b class="q">
                  Δ<i>v</i>₁ = {num(H.dv1 / 1e3)}, Δ<i>v</i>₂ = {num(H.dv2 / 1e3)}, Σ = {num(H.total / 1e3)} km/s
                </b>
              </span>
            )}
          </>
        )
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מצב האיור">
            <Toggle label="מילוט" on={s.mode === 'escape'} onChange={() => setMode('escape')} />
            <Toggle label="מעבר" on={s.mode === 'transfer'} onChange={() => setMode('transfer')} />
          </div>
          {s.mode === 'escape' ? (
            <>
              <Slider label="מרחק השיגור, ברדיוסי כדור הארץ" min={1} max={3} step={0.1} value={Math.round((s.r / RE) * 10) / 10} format={(v) => `r = ${num(v)}`} onChange={(v) => setLaunch({ r: rLaunch(v, 2) })} />
              <Slider label="מהירות השיגור" min={1} max={12} step={0.05} value={s.v / 1e3} format={(v) => `${num(v)} km/s`} onChange={(v) => setLaunch({ v: speed(v, 7) })} />
              <Slider label="זווית מעל האופק" min={0} max={90} step={5} value={s.alpha} format={(v) => `${num(v)}°`} onChange={(v) => setLaunch({ alpha: angle(v, 0) })} />
            </>
          ) : (
            <>
              <Slider label="מעגל ההתחלה, ברדיוסי כדור הארץ" min={1.2} max={8} step={0.1} value={Math.round((s.r1 / RE) * 10) / 10} format={(v) => `r₁ = ${num(v)}`} onChange={(v) => setCircles({ r1: rCircle(v, 2) })} />
              <Slider label="מעגל היעד, ברדיוסי כדור הארץ" min={1.2} max={8} step={0.1} value={Math.round((s.r2 / RE) * 10) / 10} format={(v) => `r₂ = ${num(v)}`} onChange={(v) => setCircles({ r2: rCircle(v, 5) })} />
              <Slider label="שינוי המהירות" min={-3} max={3} step={0.01} value={Math.round(s.dv / 10) / 100} format={(v) => `Δv = ${num(v)} km/s`} onChange={(v) => setS({ ...s, dv: burnSize(v, 0) })} />
            </>
          )}
          <div class="group" role="group" aria-label="תנועה">
            <Toggle label={s.playing ? 'עצירה' : 'הפעלה'} on={s.playing} onChange={play} />
            {s.mode === 'transfer' && (
              <>
                <button type="button" class="toggle" onClick={fire} disabled={s.hit || s.gone || s.dv === 0}>
                  דחיפה
                </button>
                <button type="button" class="toggle" onClick={() => jump('apo')} disabled={!canJump}>
                  לנקודת הריחוק
                </button>
                <button type="button" class="toggle" onClick={() => jump('peri')} disabled={!canJump}>
                  לנקודת הקרבה
                </button>
              </>
            )}
          </div>
        </>
      }
    />
  );
}

const KIND_HE: Record<Orbit['kind'], string> = {
  circle: 'מעגל',
  ellipse: 'אליפסה',
  parabola: 'פרבולה',
  hyperbola: 'היפרבולה',
  radial: 'תנועה בקו ישר, לאורך הרדיוס',
};

function describe(s: State, o: Orbit): string {
  const r = num(rOf(s.craft) / RE);
  const v = num(vOf(s.craft) / 1e3);
  const shape = `${KIND_HE[o.kind]}${o.hits ? ' שפוגע בכדור הארץ' : ''}`;
  if (s.mode === 'escape')
    return `שיגור ממרחק ${num(s.r / RE)} רדיוסי כדור הארץ, במהירות ${num(s.v / 1e3)} קילומטר לשנייה, בזווית ${num(s.alpha)} מעלות מעל האופק. מהירות המילוט שם ${num(escapeSpeed(GM, s.r) / 1e3)} קילומטר לשנייה. המסלול: ${shape}. החללית עכשיו במרחק ${r} רדיוסי כדור הארץ, במהירות ${v} קילומטר לשנייה.`;
  return `מעבר ממעגל ברדיוס ${num(s.r1 / RE)} למעגל ברדיוס ${num(s.r2 / RE)} רדיוסי כדור הארץ. בוצעו ${s.burns.length} דחיפות. המסלול הנוכחי: ${shape}. החללית במרחק ${r} רדיוסי כדור הארץ, במהירות ${v} קילומטר לשנייה.`;
}

/* ================================================================== painting */

interface Layout {
  w: number;
  /** the orbit view: centre and pixels per metre */
  cx: number;
  cy: number;
  ppm: number;
  viewH: number;
  strip: { y0: number; h: number };
}

function layout(view: View, s: State): Layout {
  const { w, h } = view;
  const stripH = clamp(0.3 * h, 132, 156);
  const viewH = h - stripH;
  const R = viewRadius(s);
  const ppm = (Math.min(w, viewH) / 2 - 10) / R;
  return { w, cx: w / 2, cy: viewH / 2, ppm, viewH, strip: { y0: viewH, h: stripH } };
}

function paint(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, o: Orbit) {
  const L = layout(view, s);
  // a canvas not laid out yet (zero or tiny height) has no room for the orbit view
  if (L.viewH < 60 || !(L.ppm > 0)) return;
  const X = (x: number) => L.cx + x * L.ppm;
  const Y = (y: number) => L.cy - y * L.ppm;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, L.w, L.viewH);
  ctx.clip();
  ctx.fillStyle = withAlpha(p.paper2, 0.45);
  ctx.fillRect(0, 0, L.w, L.viewH);

  // dashed reference circles
  const dashedCircle = (r: number, label: string, labelAngle: number) => {
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(X(0), Y(0), r * L.ppm, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (label) {
      const lx = X(r * Math.cos(labelAngle)) + 10 * Math.cos(labelAngle);
      const ly = Y(r * Math.sin(labelAngle)) - 10 * Math.sin(labelAngle);
      mathText(ctx, p, label, lx, ly, { size: 13, color: p.ink2 });
    }
  };
  if (s.mode === 'escape') dashedCircle(s.r, '', 0);
  else {
    dashedCircle(s.r1, 'r₁', (3 * Math.PI) / 4);
    dashedCircle(s.r2, 'r₂', (3 * Math.PI) / 4 + 0.12);
  }

  // the orbit
  const Rv = viewRadius(s) * 1.7;
  ctx.save();
  ctx.strokeStyle = o.open ? p.accent : p.ink2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (o.radial) {
    const u: Vec = [s.craft.r[0] / rOf(s.craft), s.craft.r[1] / rOf(s.craft)];
    const far = Math.min(o.open ? Rv : o.ra, Rv);
    ctx.moveTo(X(u[0] * RE), Y(u[1] * RE));
    ctx.lineTo(X(u[0] * far), Y(u[1] * far));
  } else {
    const { e, p: pp, periapsisAngle: w } = o.el;
    const lim = e >= 1 ? Math.acos(-1 / e) - 1e-3 : Math.PI;
    let pen = false;
    const N = 360;
    for (let i = 0; i <= N; i++) {
      const th = -lim + (2 * lim * i) / N;
      const rr = radiusAt(pp, e, th);
      if (!Number.isFinite(rr) || rr > Rv) {
        pen = false;
        continue;
      }
      const x = X(rr * Math.cos(th + w));
      const y = Y(rr * Math.sin(th + w));
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    }
  }
  ctx.stroke();
  ctx.restore();

  // the Earth, drawn over the orbit: a path that dips inside it ends at its surface
  ctx.save();
  ctx.fillStyle = mixPaper(p);
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(X(0), Y(0), RE * L.ppm, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // apsides
  if (!o.radial && o.kind !== 'circle') {
    const peri = o.rp;
    const w = o.el.periapsisAngle;
    if (peri > RE) dotAt(ctx, p, X(peri * Math.cos(w)), Y(peri * Math.sin(w)), true);
    if (!o.open && Number.isFinite(o.ra) && o.ra < Rv) dotAt(ctx, p, X(-o.ra * Math.cos(w)), Y(-o.ra * Math.sin(w)), false);
  }

  // the launch direction (escape): the local horizontal and the angle α
  if (s.mode === 'escape' && s.alpha > 0) {
    const x0 = X(s.r);
    const y0 = Y(0);
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 26);
    ctx.lineTo(x0, y0 - 40);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    // the horizontal points up the screen (+y world); α turns it toward +x (right on screen)
    ctx.arc(x0, y0, 24, -Math.PI / 2, -Math.PI / 2 + (s.alpha * Math.PI) / 180);
    ctx.stroke();
    ctx.restore();
    const mid = -Math.PI / 2 + (s.alpha * Math.PI) / 360;
    mathText(ctx, p, 'α', x0 + 34 * Math.cos(mid), y0 + 34 * Math.sin(mid), { size: 13, color: p.ink2 });
  }

  // burn marks
  s.burns.forEach((b, i) => {
    const bx = X(b.at[0]);
    const by = Y(b.at[1]);
    ctx.save();
    ctx.fillStyle = p.accel;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5;
      // larger than the craft's dot, so a mark under the craft still shows its points
      const rr = k % 2 === 0 ? 12 : 5;
      ctx.lineTo(bx + rr * Math.cos(a), by + rr * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const out = Math.hypot(b.at[0], b.at[1]);
    const ux = b.at[0] / out;
    const uy = b.at[1] / out;
    // outside the orbit, or inside it when the outside runs off the canvas
    const outside = bx + ux * 26 > 20 && bx + ux * 26 < L.w - 20 && by - uy * 26 > 12 && by - uy * 26 < L.viewH - 12;
    const k = outside ? 26 : -30;
    mathText(ctx, p, `Δv${sub(i + 1)}`, bx + ux * k, by - uy * k + 2, { size: 12, color: p.accel });
  });

  // the craft and its velocity
  const cx = X(s.craft.r[0]);
  const cy = Y(s.craft.r[1]);
  const vRef = s.mode === 'escape' ? escapeSpeed(GM, s.r) : circularSpeed(GM, Math.min(s.r1, s.r2));
  const vs = (0.14 * Math.min(L.w, L.viewH)) / vRef;
  const vx = s.craft.v[0] * vs;
  const vy = s.craft.v[1] * vs;
  const vl = Math.hypot(vx, vy);
  const k = vl > 0 && vl < 14 ? 14 / vl : 1;
  if (!s.hit && vl > 0) arrow(ctx, cx, cy, cx + vx * k, cy - vy * k, { color: p.velocity, width: 2.6, head: 9 });
  ctx.save();
  ctx.fillStyle = s.hit ? p.neg : p.ink;
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (!s.hit && vl > 0) mathText(ctx, p, 'v', cx + vx * k + (vx / vl) * 11, cy - vy * k - (vy / vl) * 11, { size: 13, color: p.velocity });

  // status words, top left (the tools sit top right)
  const status = s.hit ? 'פגיעה בכדור הארץ' : s.gone ? 'יצאה מהאיור' : '';
  if (status) heText(ctx, p, status, 8 + 130, 16, { size: 13, weight: 700, color: p.ink });
  ctx.restore();

  if (s.mode === 'escape') paintEscapeStrip(ctx, p, L, s);
  else paintLadder(ctx, p, L, s);
}

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n: number) =>
  String(n)
    .split('')
    .map((c) => SUBS[Number(c)] ?? c)
    .join('');

function mixPaper(p: Palette) {
  return withAlpha(p.ink3, 0.28);
}

function dotAt(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, filled: boolean) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = p.ink;
  ctx.fillStyle = filled ? p.ink : p.paper;
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function stripFrame(ctx: CanvasRenderingContext2D, p: Palette, L: Layout, title: string) {
  const { y0, h } = L.strip;
  ctx.fillStyle = withAlpha(p.paper2, 0.7);
  ctx.fillRect(0, y0, L.w, h);
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y0 + 0.5);
  ctx.lineTo(L.w, y0 + 0.5);
  ctx.stroke();
  heText(ctx, p, title, L.w - 8, y0 + 13, { size: 12, weight: 700, color: p.ink });
}

/** A speed axis [0, vmax] in km/s across the strip; returns the x of a speed [m/s]. */
function speedAxis(ctx: CanvasRenderingContext2D, p: Palette, L: Layout, y: number, vmax: number) {
  const left = 16;
  const right = L.w - 16;
  const xv = (v: number) => left + (Math.min(v, vmax) / vmax) * (right - left);
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  const step = [1, 2, 5].find((st) => ((st * 1e3) / vmax) * (right - left) >= 34) ?? 5;
  for (let k = 0; k * 1e3 <= vmax; k += step) {
    const x = xv(k * 1e3);
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x, y + 3);
    ctx.stroke();
    // the last number would collide with the unit at the right end
    if (x < right - 34) mathText(ctx, p, String(k), x, y + 11, { size: 10, italic: false, weight: 500, color: p.ink3 });
  }
  ctx.restore();
  mathText(ctx, p, 'km/s', right, y + 11, { size: 10, italic: false, weight: 500, color: p.ink3, align: 'right' });
  return xv;
}

function paintEscapeStrip(ctx: CanvasRenderingContext2D, p: Palette, L: Layout, s: State) {
  const { y0, h } = L.strip;
  stripFrame(ctx, p, L, 'המהירות במרחק הנוכחי');
  const r = rOf(s.craft);
  const vc = circularSpeed(GM, r);
  const ve = escapeSpeed(GM, r);
  const v = vOf(s.craft);
  const vmax = Math.max(1.3 * escapeSpeed(GM, s.r), 1.08 * v, 1.08 * ve);
  const y = y0 + h * 0.6;
  const xv = speedAxis(ctx, p, L, y, vmax);
  // the open region v ≥ v_esc
  ctx.save();
  ctx.fillStyle = withAlpha(p.accent, 0.14);
  ctx.fillRect(xv(ve), y - 22, xv(vmax) - xv(ve), 22);
  ctx.restore();
  const tick = (vv: number, base: string, subLabel: string, color: string, above: number) => {
    const x = xv(vv);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 22);
    ctx.lineTo(x, y + 3);
    ctx.stroke();
    ctx.restore();
    mathText(ctx, p, base, x, y - 22 - above, { size: 12, color, sub: subLabel });
  };
  tick(vc, 'v', 'c', p.ink2, 8);
  tick(ve, 'v', 'esc', p.ink2, 8);
  // the craft
  const x = xv(v);
  ctx.save();
  ctx.fillStyle = p.velocity;
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x + 7, y);
  ctx.lineTo(x, y + 7);
  ctx.lineTo(x - 7, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  mathText(ctx, p, 'v', x, y + 24, { size: 12, color: p.velocity });
}

function paintLadder(ctx: CanvasRenderingContext2D, p: Palette, L: Layout, s: State) {
  const { y0, h } = L.strip;
  stripFrame(ctx, p, L, 'סולם המהירויות של הוהמן');
  if (s.r1 === s.r2) {
    heText(ctx, p, 'בחרו מעגל יעד שונה ממעגל ההתחלה.', L.w - 8, y0 + h / 2, { size: 12 });
    return;
  }
  const H = hohmannSpeeds(GM, s.r1, s.r2);
  const vmax = 1.1 * Math.max(H.vAt1, H.v1, H.v2, H.vAt2, vOf(s.craft));
  const y = y0 + h * 0.54;
  const xv = speedAxis(ctx, p, L, y, vmax);
  const yA = y - 14;
  const yB = y - 30;
  // Δv₁ (at r₁), the coast (no engine), Δv₂ (at r₂)
  const segment = (a: number, b: number, yy: number, color: string, dashed: boolean, label: string) => {
    ctx.save();
    if (dashed) ctx.setLineDash([4, 3]);
    if (Math.abs(xv(b) - xv(a)) > 2) arrow(ctx, xv(a), yy, xv(b), yy, { color, width: dashed ? 1.6 : 2.6, head: 8 });
    ctx.restore();
    if (label) mathText(ctx, p, label, (xv(a) + xv(b)) / 2, yy - 9, { size: 11, color });
  };
  segment(H.v1, H.vAt1, yA, p.accel, false, 'Δv₁');
  segment(H.vAt1, H.vAt2, yB, p.ink3, true, '');
  segment(H.vAt2, H.v2, yA, p.accel, false, 'Δv₂');
  // the coast label, in Hebrew, beside its dashed arrow
  const cxm = (xv(H.vAt1) + xv(H.vAt2)) / 2;
  ctx.save();
  ctx.font = `600 11px ${p.fontUi}`;
  const tw = ctx.measureText('בלי מנוע').width;
  ctx.restore();
  heText(ctx, p, 'בלי מנוע', cxm + tw / 2, yB - 9, { size: 11, color: p.ink2 });
  // the four speeds as ticks on the axis
  const tick = (v: number, label: string, subLabel: string) => {
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(xv(v), y - 4);
    ctx.lineTo(xv(v), y + 4);
    ctx.stroke();
    ctx.restore();
    return mathText(ctx, p, label, xv(v), y + 24, { size: 11, color: p.ink2, sub: subLabel });
  };
  tick(H.v1, 'v', '1');
  tick(H.v2, 'v', '2');
  // the craft's speed now
  const x = xv(vOf(s.craft));
  ctx.save();
  ctx.fillStyle = p.velocity;
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x + 6, y);
  ctx.lineTo(x, y + 6);
  ctx.lineTo(x - 6, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // the learner's burns as bars, end to end, against the Hohmann total (dashed outline)
  const yb = y0 + h - 18;
  const scale = (L.w - 32) / Math.max(1.25 * H.total, s.burns.reduce((a, b) => a + Math.abs(b.dv), 0) * 1.05, 1);
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(16, yb - 6, H.total * scale, 12);
  ctx.restore();
  let x0 = 16;
  s.burns.forEach((b, i) => {
    const wd = Math.abs(b.dv) * scale;
    ctx.save();
    ctx.fillStyle = withAlpha(p.accel, i % 2 === 0 ? 0.85 : 0.45);
    ctx.fillRect(x0, yb - 4, wd, 8);
    ctx.restore();
    x0 += wd;
  });
  const lx = 16 + Math.max(H.total * scale, x0 - 16) + 6;
  if (lx < L.w - 60) mathText(ctx, p, 'Σ|Δv|', lx, yb, { size: 11, color: p.ink2, align: 'left' });
}
