/**
 * CoordinateLab (lesson 0.7): three views of curvilinear coordinates.
 *
 * - mode 'polar': a polar grid over the Cartesian axes and a point P the reader drags (or sets with the
 *   r and θ sliders). Drawn: r, θ, the Cartesian x and y of P, the unit vectors r̂ and θ̂ at P, and on
 *   request x̂ and ŷ at P (the same everywhere) and r̂, θ̂ at twelve points of P's circle (they turn).
 * - mode 'area': the patch r…r+dr, θ…θ+dθ at P, its two sides dr and r dθ, and on request the whole
 *   ring r…r+dr. The readout compares the exact patch area with r dr dθ and with dr dθ.
 * - mode 'space': spherical (r, θ, φ) or cylindrical (s, φ, z) coordinates of a point in an oblique
 *   projection, the unit vectors there and the volume element with its three edges
 *   (dr, r dθ, r sin θ dφ, or ds, s dφ, dz).
 *
 * Physics (geometry) from src/physics/coords.ts. World units are metres; angles in the state are radians.
 *
 * Props: id (required), mode, r, thetaDeg, dr, dth, ring, many, xy, system, systems, sr, sthDeg, phiDeg,
 * cs, cz, d, basis, tasks.
 * Step `set` keys: the same names except id, mode, systems and tasks.
 *
 * Tasks (ticked only by the reader's own drags and sliders, never by a text step):
 *   theta-down  polar: θ̂ points straight down (θ within 4° of 180°)
 *   ray         polar: r changed by a factor ≥ 2 while θ stayed within 3°
 *   double-r    area: r at least twice its starting value, dr and dθ untouched
 *   shrink      area: dr and dθ at their smallest
 *   pole        space (spherical): θ within 15° of a pole
 *   far-r       space (spherical): r at least twice its starting value
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  cylindricalBasis,
  cylindricalElement,
  degrees360,
  fromCylindrical,
  fromPolar,
  fromSpherical,
  polarAreaElement,
  polarBasis,
  polarPatchArea,
  ringArea,
  ringAreaElement,
  sphericalBasis,
  sphericalElement,
  sphericalPatchVolume,
  toPolar,
  type Vec2,
  type Vec3,
} from '~/physics/coords';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Mode = 'polar' | 'area' | 'space';
type System = 'sph' | 'cyl';

const WORLD_W = 5.4;
const WORLD_H = 4.6;
/** the area mode zooms in: a smaller window whose centre sits up and to the right of O [m] */
const AREA_ZOOM = 0.7;
const AREA_CENTRE: Vec2 = [1.1, 1.0];
const AREA_TH_MAX = (80 * Math.PI) / 180;
const centreOf = (mode: Mode): Vec2 => (mode === 'area' ? AREA_CENTRE : [0, 0]);
/** the reset and fullscreen buttons cover this corner of the stage (CSS px from the top-right) */
const BUTTONS_W = 96;
const BUTTONS_H = 52;
const DEG = Math.PI / 180;
const UNIT = 0.6; // drawn length of a unit vector [m]
const R_MIN = 0.2;
const R_MAX = 2.1;
const DR_MIN = 0.05;
const DR_MAX = 0.5;
const DTH_MIN = 0.05;
const DTH_MAX = 0.6;
/** oblique view of space: azimuth and elevation of the viewer */
const AZ = 32 * DEG;
const EL = 20 * DEG;
const E1: Vec3 = [-Math.sin(AZ), Math.cos(AZ), 0];
const E2: Vec3 = [-Math.sin(EL) * Math.cos(AZ), -Math.sin(EL) * Math.sin(AZ), Math.cos(EL)];
const VIEW: Vec3 = [Math.cos(EL) * Math.cos(AZ), Math.cos(EL) * Math.sin(AZ), Math.sin(EL)];
const SPACE_SHIFT: Vec2 = [0, -0.3];
/** space mode draws a little larger than the plane */
const SPACE_ZOOM = 0.85;

const TASK_LABEL: Record<string, string> = {
  'theta-down': 'גררו את P למקום שבו θ̂ מצביע ישר למטה. מה הזווית θ שם, ולאן מצביע r̂?',
  ray: 'שנו את r פי 2 לפחות בלי לשנות את θ (בפס הגרירה של r). האם r̂ ו-θ̂ השתנו?',
  'double-r': 'הרחיקו את P מ-O פי 2 לפחות, בלי לשנות את dr ואת dθ. פי כמה גדל r dr dθ?',
  shrink: 'הקטינו את dr ואת dθ עד הסוף. מה היחס בין השטח המדויק לבין r dr dθ עכשיו?',
  pole: 'בקואורדינטות כדוריות, הזיזו את θ אל אחד הקטבים. מה קורה לצלע r sin θ dφ?',
  'far-r': 'בקואורדינטות כדוריות, הכפילו את r. פי כמה גדל r² sin θ dr dθ dφ?',
};

interface State {
  r: number;
  th: number;
  dr: number;
  dth: number;
  ring: boolean;
  many: boolean;
  xy: boolean;
  system: System;
  sr: number;
  sth: number;
  phi: number;
  cs: number;
  cz: number;
  d: number;
  basis: boolean;
}

export interface CoordinateLabProps {
  id: string;
  mode?: Mode;
  r?: number;
  thetaDeg?: number;
  dr?: number;
  dth?: number;
  ring?: boolean;
  many?: boolean;
  xy?: boolean;
  system?: System;
  /** systems offered as buttons in space mode (default both) */
  systems?: System[];
  sr?: number;
  sthDeg?: number;
  phiDeg?: number;
  cs?: number;
  cz?: number;
  /** size of the drawn volume element: dr = d m, dθ = dφ = d rad (dz = d m) */
  d?: number;
  basis?: boolean;
  tasks?: string[];
}

function initial(p: CoordinateLabProps): State {
  return {
    r: p.r ?? 1.5,
    th: (p.thetaDeg ?? 40) * DEG,
    dr: p.dr ?? 0.3,
    dth: p.dth ?? 0.3,
    ring: p.ring ?? false,
    many: p.many ?? false,
    xy: p.xy ?? false,
    system: p.system ?? 'sph',
    sr: p.sr ?? 1.4,
    sth: (p.sthDeg ?? 55) * DEG,
    phi: (p.phiDeg ?? 40) * DEG,
    cs: p.cs ?? 1.2,
    cz: p.cz ?? 0.8,
    d: p.d ?? 0.3,
    basis: p.basis ?? true,
  };
}

const num = (x: number, sig = 3) => (Math.abs(x) < 5e-4 ? '0' : sci(x, sig).replace('-', '−'));
const deg = (rad: number) => `${Math.round(degrees360(rad))}°`;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** project a point of space onto the stage plane (world metres) */
const proj = (p: Vec3): Vec2 => [
  p[0] * E1[0] + p[1] * E1[1] + p[2] * E1[2] + SPACE_SHIFT[0],
  p[0] * E2[0] + p[1] * E2[1] + p[2] * E2[2] + SPACE_SHIFT[1],
];
const front = (p: Vec3) => p[0] * VIEW[0] + p[1] * VIEW[1] + p[2] * VIEW[2] >= 0;

export default function CoordinateLab(props: CoordinateLabProps) {
  const mode: Mode = props.mode ?? 'polar';
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  /** what the reader did since the last step or reset */
  const user = useRef({ moved: false, rLo: Infinity, rHi: 0, thAnchor: NaN, movedS: false });
  const drag = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const init = initial(props);

  const resetUser = () => {
    user.current = { moved: false, rLo: Infinity, rHi: 0, thAnchor: NaN, movedS: false };
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          const next: State = { ...prev };
          for (const k of ['r', 'dr', 'dth', 'sr', 'cs', 'cz', 'd'] as const) {
            if (typeof step[k] === 'number') next[k] = step[k] as number;
          }
          if (typeof step.thetaDeg === 'number') next.th = step.thetaDeg * DEG;
          if (typeof step.sthDeg === 'number') next.sth = step.sthDeg * DEG;
          if (typeof step.phiDeg === 'number') next.phi = step.phiDeg * DEG;
          for (const k of ['ring', 'many', 'xy', 'basis'] as const) {
            if (typeof step[k] === 'boolean') next[k] = step[k] as boolean;
          }
          if (step.system === 'sph' || step.system === 'cyl') next.system = step.system;
          stepState.current = next;
          resetUser();
          return next;
        });
      }),
    [props.id],
  );

  // tasks: checked against the figure's own state, never against a state a text step produced
  useEffect(() => {
    if (s === stepState.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const u = user.current;
    if (has('theta-down') && u.moved && Math.abs(degrees360(s.th) - 180) <= 4) done('theta-down');
    if (has('ray') && u.moved && u.rHi / u.rLo >= 2 - 1e-9) done('ray');
    if (has('double-r') && u.moved && s.r >= 2 * init.r - 1e-9 && s.dr === init.dr && s.dth === init.dth) done('double-r');
    if (has('shrink') && s.dr <= DR_MIN + 1e-9 && s.dth <= DTH_MIN + 1e-9) done('shrink');
    const thd = degrees360(s.sth);
    if (has('pole') && u.movedS && s.system === 'sph' && (thd <= 15 || thd >= 165)) done('pole');
    if (has('far-r') && u.movedS && s.system === 'sph' && s.sr >= 2 * init.sr - 1e-9) done('far-r');
  }, [s, props.id, props.tasks]);

  /** the reader moved P to (r, θ): track the radial range while θ stays put, for the 'ray' task */
  const userMove = (r: number, thIn: number) => {
    // the zoomed area view shows the first quadrant: keep the patch in it
    const th = mode === 'area' ? clamp(Math.atan2(Math.sin(thIn), Math.cos(thIn)), 0, AREA_TH_MAX) : thIn;
    const u = user.current;
    u.moved = true;
    if (!Number.isFinite(u.thAnchor) || Math.abs(Math.atan2(Math.sin(th - u.thAnchor), Math.cos(th - u.thAnchor))) > 3 * DEG) {
      u.thAnchor = th;
      u.rLo = r;
      u.rHi = r;
    } else {
      u.rLo = Math.min(u.rLo, r);
      u.rHi = Math.max(u.rHi, r);
    }
    setS((prev) => ({ ...prev, r, th }));
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    if (mode === 'space') drawSpace(ctx, view, p, s);
    else drawPlane(ctx, view, p, s, mode, centreOf(mode));
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, {
    worldWidth: mode === 'area' ? WORLD_W * AREA_ZOOM : mode === 'space' ? WORLD_W * SPACE_ZOOM : WORLD_W,
    worldHeight: mode === 'area' ? WORLD_H * AREA_ZOOM : mode === 'space' ? WORLD_H * SPACE_ZOOM : WORLD_H,
    animate: false,
  });
  useEffect(invalidate, [s]);

  const worldOf = (e: PointerEvent): Vec2 | null => {
    const v = viewRef.current;
    const c = canvasRef.current;
    if (!v || !c) return null;
    const rect = c.getBoundingClientRect();
    const w = toWorld(v, e.clientX - rect.left, e.clientY - rect.top);
    const k = centreOf(mode);
    return [w[0] + k[0], w[1] + k[1]];
  };
  const setFromPointer = (w: Vec2) => {
    const { r, theta } = toPolar(w);
    userMove(clamp(r, R_MIN, R_MAX), ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
  };
  const onPointerDown = (e: PointerEvent) => {
    if (mode === 'space') return;
    const v = viewRef.current;
    const w = worldOf(e);
    if (!v || !w) return;
    const P = fromPolar(s.r, s.th);
    if (Math.hypot(P[0] - w[0], P[1] - w[1]) * v.ppm > 28) return;
    drag.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const w = worldOf(e);
    if (w) setFromPointer(w);
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe());
    drag.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (mode === 'space') return;
    const k: Record<string, [number, number]> = {
      ArrowUp: [0.1, 0],
      ArrowDown: [-0.1, 0],
      ArrowLeft: [0, 5 * DEG],
      ArrowRight: [0, -5 * DEG],
    };
    const m = k[e.key];
    if (!m) return;
    e.preventDefault();
    userMove(clamp(s.r + m[0], R_MIN, R_MAX), (((s.th + m[1]) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    setLive(describe());
  };
  const reset = () => {
    stepState.current = null;
    resetUser();
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const [x, y] = fromPolar(s.r, s.th);
  const { rHat, thetaHat } = polarBasis(s.th);
  const exact = polarPatchArea(s.r, s.dr, s.dth);
  const elem = polarAreaElement(s.r, s.dr, s.dth);
  const sph = sphericalElement(s.sr, s.sth, s.d, s.d, s.d);
  const sphExact = sphericalPatchVolume(s.sr, s.sth, s.d, s.d, s.d);
  const cyl = cylindricalElement(s.cs, s.d, s.d, s.d);
  const Psph = fromSpherical(s.sr, s.sth, s.phi);
  const Pcyl = fromCylindrical(s.cs, s.phi, s.cz);

  function describe(): string {
    if (mode === 'space') {
      return s.system === 'sph'
        ? `קואורדינטות כדוריות: r = ${num(s.sr)} m, θ = ${deg(s.sth)}, φ = ${deg(s.phi)}; הצלעות של המשבצת ${num(sph.edges[0])}, ${num(sph.edges[1])} ו-${num(sph.edges[2])} m.`
        : `קואורדינטות גליליות: s = ${num(s.cs)} m, φ = ${deg(s.phi)}, z = ${num(s.cz)} m; הצלעות של המשבצת ${num(cyl.edges[0])}, ${num(cyl.edges[1])} ו-${num(cyl.edges[2])} m.`;
    }
    const base = `P ב-r = ${num(s.r)} m, θ = ${deg(s.th)}, כלומר x = ${num(x)} m, y = ${num(y)} m.`;
    return mode === 'area' ? `${base} שטח המשבצת ${num(exact)} m², ו-r dr dθ = ${num(elem)} m².` : base;
  }

  const userSphere = (patch: Partial<State>) => {
    user.current.movedS = true;
    setS((prev) => ({ ...prev, ...patch }));
  };
  const systems = props.systems ?? ['sph', 'cyl'];

  const label =
    mode === 'space'
      ? 'איור חי: נקודה במרחב בקואורדינטות כדוריות או גליליות, וקטורי היחידה בה, ואלמנט הנפח עם שלוש הצלעות שלו. '
      : mode === 'area'
        ? 'איור חי: רשת קוטבית, ומשבצת בין r ל-r + dr ובין θ ל-θ + dθ, עם שתי הצלעות שלה. '
        : 'איור חי: רשת קוטבית על הצירים x ו-y, ונקודה P עם וקטורי היחידה הקוטביים בה. ';

  return (
    <SimShell
      fig={props.id}
      label={`${label}${describe()}${mode === 'space' ? '' : ' גררו את P, או הזיזו אותו בחצים במקלדת.'}`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={mode === 'space' ? 'default' : 'grab'}
      readout={
        mode === 'space' ? (
          s.system === 'sph' ? (
            <>
              <span class="q" data-readout="xyz">
                (x, y, z) = ({num(Psph[0])}, {num(Psph[1])}, {num(Psph[2])}) m
              </span>
              <span class="q" data-readout="edges">
                dr = {num(sph.edges[0])} m, r dθ = {num(sph.edges[1])} m, r sin θ dφ = {num(sph.edges[2])} m
              </span>
              <b class="q" data-readout="dV">r² sin θ dr dθ dφ = {num(sph.dV)} m³</b>
              <span class="q" data-readout="exact">הנפח המדויק: {num(sphExact)} m³</span>
            </>
          ) : (
            <>
              <span class="q" data-readout="xyz">
                (x, y, z) = ({num(Pcyl[0])}, {num(Pcyl[1])}, {num(Pcyl[2])}) m
              </span>
              <span class="q" data-readout="edges">
                ds = {num(cyl.edges[0])} m, s dφ = {num(cyl.edges[1])} m, dz = {num(cyl.edges[2])} m
              </span>
              <b class="q" data-readout="dV">s ds dφ dz = {num(cyl.dV)} m³</b>
            </>
          )
        ) : (
          <>
            <span class="q" data-readout="xy">
              x = {num(x)} m, y = {num(y)} m
            </span>
            <b class="q" data-readout="polar">
              r = {num(s.r)} m, θ = {deg(s.th)}
            </b>
            {mode === 'polar' && (
              <>
                <span class="q" data-readout="rhat">
                  r̂ = ({num(rHat[0], 2)}, {num(rHat[1], 2)})
                </span>
                <span class="q" data-readout="thetahat">
                  θ̂ = ({num(thetaHat[0], 2)}, {num(thetaHat[1], 2)})
                </span>
              </>
            )}
            {mode === 'area' && (
              <>
                <span class="q" data-readout="exact">השטח המדויק: {num(exact)} m²</span>
                <b class="q" data-readout="element">r dr dθ = {num(elem)} m²</b>
                <span class="q" data-readout="ratio">היחס: {num(exact / elem, 3)}</span>
                <span class="q" data-readout="nojac">dr dθ = {num(s.dr * s.dth)} (בלי r)</span>
                {s.ring && (
                  <span class="q" data-readout="ring">
                    טבעת: {num(ringArea(s.r, s.dr))} m², 2πr dr = {num(ringAreaElement(s.r, s.dr))} m²
                  </span>
                )}
              </>
            )}
          </>
        )
      }
      controls={
        mode === 'space' ? (
          <>
            {systems.length > 1 && (
              <div class="group" role="group" aria-label="מערכת קואורדינטות">
                <Toggle label="כדוריות" on={s.system === 'sph'} onChange={() => setS((prev) => ({ ...prev, system: 'sph' }))} />
                <Toggle label="גליליות" on={s.system === 'cyl'} onChange={() => setS((prev) => ({ ...prev, system: 'cyl' }))} />
              </div>
            )}
            {s.system === 'sph' ? (
              <>
                <Slider label="r" min={0.5} max={2.0} step={0.05} value={s.sr} format={(v) => `${num(v)} m`} onChange={(v) => userSphere({ sr: v })} />
                <Slider label="θ (מהציר z)" min={5} max={175} step={1} value={Math.round(s.sth / DEG)} format={(v) => `${v}°`} onChange={(v) => userSphere({ sth: v * DEG })} />
              </>
            ) : (
              <>
                <Slider label="s" min={0.3} max={1.8} step={0.05} value={s.cs} format={(v) => `${num(v)} m`} onChange={(v) => userSphere({ cs: v })} />
                <Slider label="z" min={-1.2} max={1.6} step={0.05} value={s.cz} format={(v) => `${num(v)} m`} onChange={(v) => userSphere({ cz: v })} />
              </>
            )}
            <Slider label="φ" min={0} max={355} step={1} value={Math.round(s.phi / DEG)} format={(v) => `${v}°`} onChange={(v) => userSphere({ phi: v * DEG })} />
            <Slider label="גודל המשבצת" min={0.1} max={0.5} step={0.05} value={s.d} format={(v) => `${num(v)}`} onChange={(v) => setS((prev) => ({ ...prev, d: v }))} />
            <div class="group" role="group" aria-label="מה להציג">
              <Toggle label="וקטורי היחידה" on={s.basis} swatch="var(--accent)" onChange={(on) => setS((prev) => ({ ...prev, basis: on }))} />
            </div>
          </>
        ) : (
          <>
            <Slider label="r" min={R_MIN} max={R_MAX} step={0.05} value={s.r} format={(v) => `${num(v)} m`} onChange={(v) => userMove(v, s.th)} />
            <Slider
              label="θ"
              min={0}
              max={mode === 'area' ? 80 : 355}
              step={1}
              value={Math.round(degrees360(s.th))}
              format={(v) => `${v}°`}
              onChange={(v) => userMove(s.r, v * DEG)}
            />
            {mode === 'area' && (
              <>
                <Slider label="dr" min={DR_MIN} max={DR_MAX} step={0.05} value={s.dr} format={(v) => `${num(v)} m`} onChange={(v) => setS((prev) => ({ ...prev, dr: Math.round(v / 0.05) * 0.05 }))} />
                <Slider label="dθ" min={DTH_MIN} max={DTH_MAX} step={0.05} value={s.dth} format={(v) => `${num(v)} rad`} onChange={(v) => setS((prev) => ({ ...prev, dth: Math.round(v / 0.05) * 0.05 }))} />
              </>
            )}
            <div class="group" role="group" aria-label="מה להציג">
              {mode === 'polar' && (
                <>
                  <Toggle label={<><bdi dir="ltr">r̂</bdi> ו-<bdi dir="ltr">θ̂</bdi> סביב המעגל</>} on={s.many} swatch="var(--accent)" onChange={(on) => setS((prev) => ({ ...prev, many: on }))} />
                  <Toggle label={<><bdi dir="ltr">x̂</bdi> ו-<bdi dir="ltr">ŷ</bdi></>} on={s.xy} swatch="var(--ink-3)" onChange={(on) => setS((prev) => ({ ...prev, xy: on }))} />
                </>
              )}
              {mode === 'area' && <Toggle label="כל הטבעת" on={s.ring} swatch="var(--accent)" onChange={(on) => setS((prev) => ({ ...prev, ring: on }))} />}
            </div>
          </>
        )
      }
    />
  );
}

/* ------------------------------------------------------------------ the plane: polar and area modes */

function drawPlane(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State, mode: Mode, centre: Vec2) {
  const at = (x: number, y: number) => toScreen(view, x - centre[0], y - centre[1]);
  const L = (text: string, x: number, y: number, color: string) => label(ctx, text, x, y, color, p, view);
  const O = at(0, 0);
  const ppm = view.ppm;

  // the polar grid: circles every 0.5 m, rays every 30°
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  for (let r = 0.5; r <= 3.5; r += 0.5) {
    ctx.beginPath();
    ctx.arc(O[0], O[1], r * ppm, 0, Math.PI * 2);
    ctx.stroke();
  }
  const reach = Math.hypot(view.w, view.h);
  for (let i = 0; i < 12; i++) {
    const t = (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(O[0], O[1]);
    ctx.lineTo(O[0] + reach * Math.cos(t), O[1] - reach * Math.sin(t));
    ctx.stroke();
  }
  ctx.restore();
  // the Cartesian axes
  arrow(ctx, 6, O[1], view.w - 8, O[1], { color: p.ink3, width: 1.3, head: 8 });
  arrow(ctx, O[0], view.h - 6, O[0], 8, { color: p.ink3, width: 1.3, head: 8 });
  L('x', view.w - 14, O[1] + 14, p.ink2);
  L('y', O[0] - 14, 16, p.ink2);
  L('O', O[0] - 11, O[1] + 13, p.ink2);
  // ring labels on the +x axis: 1 m and 2 m
  // ring labels on the −x side of the axis, clear of the drops from P (or above the axis when −x is off-stage)
  for (const r of [1, 2]) {
    const left = O[0] - r * ppm > 16;
    L(`${r} m`, left ? O[0] - r * ppm : O[0] + r * ppm, left ? O[1] + 13 : O[1] - 10, p.ink3);
  }

  const P = at(...fromPolar(s.r, s.th));
  const { rHat, thetaHat } = polarBasis(s.th);

  if (mode === 'area') {
    // the whole ring r…r+dr, faint
    if (s.ring) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(O[0], O[1], (s.r + s.dr) * ppm, 0, Math.PI * 2);
      ctx.arc(O[0], O[1], s.r * ppm, 0, Math.PI * 2, true);
      ctx.fillStyle = withAlpha(p.accent, 0.16);
      ctx.fill('evenodd');
      ctx.restore();
      const lab = at(...fromPolar(s.r + s.dr + 0.12, s.th + s.dth + 0.45));
      L('2πr dr', lab[0], lab[1], p.accent);
    }
    // the patch r…r+dr, θ…θ+dθ (canvas angles run clockwise: negate)
    ctx.save();
    ctx.beginPath();
    ctx.arc(O[0], O[1], (s.r + s.dr) * ppm, -s.th, -(s.th + s.dth), true);
    ctx.arc(O[0], O[1], s.r * ppm, -(s.th + s.dth), -s.th, false);
    ctx.closePath();
    ctx.fillStyle = withAlpha(p.accent, 0.38);
    ctx.fill();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    // the two sides at P: dr along r̂, r dθ along the inner arc
    const thSide = s.th - 0.16; // the dr label sits just clockwise of the patch
    const drMid = at(...fromPolar(s.r + s.dr / 2, thSide));
    L('dr', drMid[0], drMid[1], p.ink);
    const arcMid = at(...fromPolar(Math.max(0.12, s.r - 0.2), s.th + s.dth / 2));
    L('r dθ', arcMid[0], arcMid[1], p.ink);
    // the angle dθ at O
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    for (const t of [s.th, s.th + s.dth]) {
      const e = at(...fromPolar(s.r, t));
      ctx.beginPath();
      ctx.moveTo(O[0], O[1]);
      ctx.lineTo(e[0], e[1]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const a = Math.min(34, s.r * ppm * 0.4);
    ctx.beginPath();
    ctx.arc(O[0], O[1], a, -s.th, -(s.th + s.dth), true);
    ctx.stroke();
    ctx.restore();
    const dl = at(...fromPolar(0, 0));
    const dthLab: Vec2 = [dl[0] + (a + 14) * Math.cos(s.th + s.dth / 2), dl[1] - (a + 14) * Math.sin(s.th + s.dth / 2)];
    L('dθ', dthLab[0], dthLab[1], p.ink2);
  } else {
    // x and y of P: dashed drops to the axes
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(P[0], P[1]);
    ctx.lineTo(P[0], O[1]);
    ctx.moveTo(P[0], P[1]);
    ctx.lineTo(O[0], P[1]);
    ctx.stroke();
    ctx.restore();
    L('x', P[0], O[1] + (P[1] < O[1] ? 14 : -14), p.ink2);
    L('y', O[0] + (P[0] > O[0] ? -12 : 12), P[1], p.ink2);
    // r: the segment O→P, and θ: the arc from +x
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(O[0], O[1]);
    ctx.lineTo(P[0], P[1]);
    ctx.stroke();
    const a = Math.min(30, s.r * ppm * 0.45);
    if (s.th > 0.08) {
      ctx.beginPath();
      ctx.arc(O[0], O[1], a, 0, -s.th, true);
      ctx.stroke();
    }
    ctx.restore();
    const mid = at(...fromPolar(s.r / 2, s.th));
    L('r', mid[0] - 12 * Math.sin(s.th), mid[1] - 12 * Math.cos(s.th), p.ink);
    if (s.th > 0.08) L('θ', O[0] + (a + 12) * Math.cos(s.th / 2), O[1] - (a + 12) * Math.sin(s.th / 2), p.ink2);

    // r̂ and θ̂ around the circle through P: they turn with θ
    if (s.many) {
      for (let i = 0; i < 12; i++) {
        const t = (i * Math.PI) / 6;
        if (Math.abs(Math.atan2(Math.sin(t - s.th), Math.cos(t - s.th))) < 0.2) continue;
        const b = polarBasis(t);
        const Q = at(...fromPolar(s.r, t));
        const k = UNIT * 0.7 * ppm;
        arrow(ctx, Q[0], Q[1], Q[0] + b.rHat[0] * k, Q[1] - b.rHat[1] * k, { color: p.accent, width: 1.6, head: 7, alpha: 0.55 });
        arrow(ctx, Q[0], Q[1], Q[0] + b.thetaHat[0] * k, Q[1] - b.thetaHat[1] * k, { color: p.accent, width: 1.6, head: 7, alpha: 0.55 });
      }
    }
    // x̂ and ŷ at P: the same everywhere
    if (s.xy) {
      const k = UNIT * ppm;
      arrow(ctx, P[0], P[1], P[0] + k, P[1], { color: p.ink3, width: 2, head: 9 });
      arrow(ctx, P[0], P[1], P[0], P[1] - k, { color: p.ink3, width: 2, head: 9 });
      L('x̂', P[0] + k + 10, P[1] + 10, p.ink3);
      L('ŷ', P[0] - 10, P[1] - k - 8, p.ink3);
    }
    // r̂ and θ̂ at P
    const k = UNIT * ppm;
    const R1: Vec2 = [P[0] + rHat[0] * k, P[1] - rHat[1] * k];
    const T1: Vec2 = [P[0] + thetaHat[0] * k, P[1] - thetaHat[1] * k];
    arrow(ctx, P[0], P[1], R1[0], R1[1], { color: p.accent, width: 2.6, head: 11 });
    arrow(ctx, P[0], P[1], T1[0], T1[1], { color: p.accent, width: 2.6, head: 11 });
    L('r̂', R1[0] + 8 * rHat[0] + 12 * thetaHat[0], R1[1] - 8 * rHat[1] - 12 * thetaHat[1], p.accent);
    L('θ̂', T1[0] + 10 * thetaHat[0] - 12 * rHat[0], T1[1] - 10 * thetaHat[1] + 12 * rHat[1], p.accent);
  }

  // the point P, with a handle ring
  dot(ctx, P, p.ink, 6);
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink, 0.35);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(P[0], P[1], 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  L('P', P[0] - 14 * rHat[0] - 10 * thetaHat[0], P[1] + 14 * rHat[1] + 10 * thetaHat[1], p.ink);
}

/* ------------------------------------------------------------------ space: spherical and cylindrical */

function drawSpace(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: State) {
  const sc = (q: Vec3): Vec2 => {
    const w = proj(q);
    return toScreen(view, w[0], w[1]);
  };
  const L = (text: string, x: number, y: number, color: string) => label(ctx, text, x, y, color, p, view);
  const O = sc([0, 0, 0]);
  /** a curve of space, front parts solid, back parts dashed */
  const curve = (pts: Vec3[], color: string, width: number, alpha = 1) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const A = sc(a);
      const B = sc(b);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (!front([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])) ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(A[0], A[1]);
      ctx.lineTo(B[0], B[1]);
      ctx.stroke();
      ctx.restore();
    }
  };
  const solid = (pts: Vec3[], color: string, width: number, dash: number[] = []) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((q, i) => {
      const S = sc(q);
      if (i === 0) ctx.moveTo(S[0], S[1]);
      else ctx.lineTo(S[0], S[1]);
    });
    ctx.stroke();
    ctx.restore();
  };
  const range = (n: number, f: (t: number) => Vec3) => Array.from({ length: n + 1 }, (_, i) => f(i / n));

  // axes
  const AX = 2.3;
  for (const [v, name] of [
    [[AX, 0, 0], 'x'],
    [[0, AX, 0], 'y'],
    [[0, 0, AX], 'z'],
  ] as [Vec3, string][]) {
    const E = sc(v);
    arrow(ctx, O[0], O[1], E[0], E[1], { color: p.ink3, width: 1.3, head: 8 });
    const dx = E[0] - O[0];
    const dy = E[1] - O[1];
    const d = Math.hypot(dx, dy) || 1;
    L(name, E[0] + (12 * dx) / d, E[1] + (12 * dy) / d, p.ink2);
  }
  L('O', O[0] - 12, O[1] + 12, p.ink2);

  const d = s.d;
  // the unit vectors run along the element's edges from P, so with them on the edge labels would sit on the
  // arrows' labels: the edges are then named in the readout under the figure (which lists all three) instead
  const edgeLabels = !s.basis;
  if (s.system === 'sph') {
    const r = s.sr;
    // the sphere: its outline (a circle in this projection), the equator, P's latitude circle and meridian
    const ppm = view.ppm;
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink3, 0.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(O[0], O[1], r * ppm, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    curve(range(72, (t) => fromSpherical(r, Math.PI / 2, 2 * Math.PI * t)), p.ink3, 1);
    curve(range(72, (t) => fromSpherical(r, s.sth, 2 * Math.PI * t)), p.ink2, 1.3);
    curve(range(48, (t) => fromSpherical(r, Math.PI * t, s.phi)), p.ink2, 1.3);
    const P = fromSpherical(r, s.sth, s.phi);
    const Ps = sc(P);
    const foot: Vec3 = [P[0], P[1], 0];
    // r, the drop to the xy plane and the line from O to the foot
    solid([[0, 0, 0], P], p.ink, 1.6);
    solid([P, foot], p.ink3, 1.1, [3, 4]);
    solid([[0, 0, 0], foot], p.ink3, 1.1, [3, 4]);
    const mid = sc([P[0] / 2, P[1] / 2, P[2] / 2]);
    L('r', mid[0] + 10, mid[1] - 8, p.ink);
    // θ: an arc from the z axis to OP; φ: an arc in the xy plane from x to the foot
    const a = 0.45;
    solid(range(20, (t) => fromSpherical(a, s.sth * t, s.phi)), p.ink2, 1.3);
    const thL = sc(fromSpherical(a + 0.18, s.sth / 2, s.phi));
    L('θ', thL[0], thL[1], p.ink2);
    solid(range(20, (t) => fromSpherical(a, Math.PI / 2, s.phi * t)), p.ink2, 1.3);
    const phL = sc(fromSpherical(a + 0.2, Math.PI / 2, s.phi / 2));
    L('φ', phL[0], phL[1], p.ink2);

    // the volume element r…r+d, θ…θ+d, φ…φ+d
    const atS = (i: number, j: number, k: number) => fromSpherical(r + i * d, s.sth + j * d, s.phi + k * d);
    element(atS, sc, ctx, p);
    if (edgeLabels) {
      edgeLabel(ctx, p, view, sc, 'dr', atS(0, 0, 1), atS(1, 0, 1), atS(0.5, 0.5, 0.5));
      edgeLabel(ctx, p, view, sc, 'r dθ', atS(1, 0, 1), atS(1, 1, 1), atS(0.5, 0.5, 0.5));
      edgeLabel(ctx, p, view, sc, 'r sin θ dφ', atS(1, 1, 0), atS(1, 1, 1), atS(0.5, 0.5, 0.5));
    }

    if (s.basis) {
      const b = sphericalBasis(s.sth, s.phi);
      basisArrows(ctx, p, sc, P, [b.rHat, b.thetaHat, b.phiHat], ['r̂', 'θ̂', 'φ̂'], view);
    }
    dot(ctx, Ps, p.ink, 5);
    awayLabel(ctx, p, view, 'P', Ps, O, 16);
  } else {
    const sR = s.cs;
    const z = s.cz;
    // the cylinder of radius s: rims at z = 0 and at P's height, and its two outline lines
    curve(range(72, (t) => fromCylindrical(sR, 2 * Math.PI * t, 0)), p.ink3, 1);
    curve(range(72, (t) => fromCylindrical(sR, 2 * Math.PI * t, z)), p.ink2, 1.3);
    for (const ph of [AZ + Math.PI / 2, AZ - Math.PI / 2]) solid([fromCylindrical(sR, ph, 0), fromCylindrical(sR, ph, z)], p.ink3, 1);
    const P = fromCylindrical(sR, s.phi, z);
    const Ps = sc(P);
    const foot = fromCylindrical(sR, s.phi, 0);
    solid([[0, 0, z], P], p.ink, 1.6);
    solid([[0, 0, 0], foot], p.ink3, 1.1, [3, 4]);
    solid([foot, P], p.ink3, 1.1, [3, 4]);
    const sm = sc([P[0] / 2, P[1] / 2, z]);
    L('s', sm[0], sm[1] - 12, p.ink);
    const zm = sc([foot[0], foot[1], z / 2]);
    L('z', zm[0] + 12, zm[1], p.ink2);
    const a = 0.45;
    solid(range(20, (t) => fromCylindrical(a, s.phi * t, 0)), p.ink2, 1.3);
    const phL = sc(fromCylindrical(a + 0.2, s.phi / 2, 0));
    L('φ', phL[0], phL[1], p.ink2);

    const atC = (i: number, j: number, k: number) => fromCylindrical(sR + i * d, s.phi + j * d, z + k * d);
    element(atC, sc, ctx, p);
    if (edgeLabels) {
      edgeLabel(ctx, p, view, sc, 'ds', atC(0, 0, 0), atC(1, 0, 0), atC(0.5, 0.5, 0.5));
      edgeLabel(ctx, p, view, sc, 's dφ', atC(1, 0, 0), atC(1, 1, 0), atC(0.5, 0.5, 0.5));
      edgeLabel(ctx, p, view, sc, 'dz', atC(1, 1, 0), atC(1, 1, 1), atC(0.5, 0.5, 0.5));
    }

    if (s.basis) {
      const b = cylindricalBasis(s.phi);
      basisArrows(ctx, p, sc, P, [b.sHat, b.phiHat, b.zHat], ['ŝ', 'φ̂', 'ẑ'], view);
    }
    dot(ctx, Ps, p.ink, 5);
    awayLabel(ctx, p, view, 'P', Ps, O, 16);
  }
}

/** A label beside the edge A→B of a volume element, on the side away from the element's centre. */
function edgeLabel(ctx: CanvasRenderingContext2D, p: Palette, view: View, sc: (q: Vec3) => Vec2, text: string, A: Vec3, B: Vec3, C: Vec3) {
  const a = sc(A);
  const b = sc(B);
  const c = sc(C);
  const m: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let nx = -(b[1] - a[1]);
  let ny = b[0] - a[0];
  const L = Math.hypot(nx, ny) || 1;
  nx /= L;
  ny /= L;
  if (nx * (m[0] - c[0]) + ny * (m[1] - c[1]) < 0) {
    nx = -nx;
    ny = -ny;
  }
  ctx.save();
  ctx.font = `600 13px ${p.fontUi}`;
  const half = ctx.measureText(text).width / 2;
  ctx.restore();
  const k = 10 + half * Math.abs(nx);
  label(ctx, text, m[0] + k * nx, m[1] + k * ny + 2 * ny, p.ink, p, view);
}

/** A label `gap` px beyond point S, on the far side from point O (screen). */
function awayLabel(ctx: CanvasRenderingContext2D, p: Palette, view: View, text: string, S: Vec2, O: Vec2, gap: number) {
  const dx = S[0] - O[0];
  const dy = S[1] - O[1];
  const d = Math.hypot(dx, dy) || 1;
  label(ctx, text, S[0] - (gap * dy) / d, S[1] + (gap * dx) / d, p.ink, p, view);
}

/** The curved box of a volume element: corners at(i, j, k), i, j, k ∈ {0, 1}; 12 edges, the outer face filled. */
function element(at: (i: number, j: number, k: number) => Vec3, sc: (q: Vec3) => Vec2, ctx: CanvasRenderingContext2D, p: Palette) {
  const N = 10;
  const edge = (f: (t: number) => Vec3) => Array.from({ length: N + 1 }, (_, n) => sc(f(n / N)));
  const edges: Vec2[][] = [];
  for (const a of [0, 1]) {
    for (const b of [0, 1]) {
      edges.push(edge((t) => at(t, a, b)));
      edges.push(edge((t) => at(a, t, b)));
      edges.push(edge((t) => at(a, b, t)));
    }
  }
  // the outer face (i = 1)
  const face = [...edge((t) => at(1, t, 0)), ...edge((t) => at(1, 1, t)), ...edge((t) => at(1, 1 - t, 1)), ...edge((t) => at(1, 0, 1 - t))];
  ctx.save();
  ctx.fillStyle = withAlpha(p.accent, 0.3);
  ctx.beginPath();
  face.forEach((q, i) => (i === 0 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1])));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.8;
  for (const e of edges) {
    ctx.beginPath();
    e.forEach((q, i) => (i === 0 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1])));
    ctx.stroke();
  }
  ctx.restore();
}

function basisArrows(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  sc: (q: Vec3) => Vec2,
  P: Vec3,
  dirs: Vec3[],
  names: string[],
  view: View,
) {
  const S = sc(P);
  dirs.forEach((u, i) => {
    const E = sc([P[0] + u[0] * UNIT, P[1] + u[1] * UNIT, P[2] + u[2] * UNIT]);
    arrow(ctx, S[0], S[1], E[0], E[1], { color: p.ink, width: 2.2, head: 10 });
    const dx = E[0] - S[0];
    const dy = E[1] - S[1];
    const d = Math.hypot(dx, dy) || 1;
    label(ctx, names[i], E[0] + (12 * dx) / d, E[1] + (12 * dy) / d, p.ink, p, view);
  });
}

function dot(ctx: CanvasRenderingContext2D, at: Vec2, color: string, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(at[0], at[1], r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
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
