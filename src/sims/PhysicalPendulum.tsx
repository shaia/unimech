/**
 * PhysicalPendulum (lesson 8.7): a body with a row of holes, hung on a pin through one of them.
 *
 * Swing mode: a uniform rod (1.20 m) or a uniform disc (radius 0.30 m) swings on the pin; beside it, when shown, the
 * simple pendulum of the equivalent length ℓ = d + k²/d swings from the same height. The two obey the same equation,
 * θ̈ = −(g/ℓ) sin θ, so they move together at any amplitude, and a dashed level line joins the bob to the centre of
 * oscillation O on the body. Under the stage, the small-angle period T(d) against the pin's distance d from the CM:
 * its minimum at d = k, the curve 2π√(d/g) of a point mass at the CM for comparison, and the other hole k²/d with the
 * same period.
 * Blow mode: the body hangs at rest on the pin and gets a short horizontal blow J at a distance b below the pin (the
 * learner drags it). Drawn just after the blow: the velocities of the points of the line pin → CM, the impulse P of
 * the pin on the body, and, when the pin is removed ("בלי הציר"), the point of that line that is momentarily at
 * rest. P vanishes at b = ℓ, the centre of percussion.
 *
 * Physics: src/physics/physpendulum.ts (on rigidbody.ts). Tasks tick only inside the learner's own handlers
 * (sliders, chips, buttons, the drag); a text step only sets the state, and never plays or ticks.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import {
  blowFree,
  blowPivoted,
  conjugatePivot,
  ellOf,
  gyrationRadius,
  lineVelocity,
  maxPivot,
  periodAt,
  pivotInertia,
  smallPeriod,
  swingTable,
  thetaAt,
  type Body,
  type BodyKind,
} from '~/physics/physpendulum';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot, type Box, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Mode = 'swing' | 'blow';

const BODIES: Record<BodyKind, Body> = {
  rod: { kind: 'rod', m: 1.0, size: 1.2 },
  disc: { kind: 'disc', m: 1.0, size: 0.3 },
};
const BODY_LABEL: Record<BodyKind, string> = { rod: 'מוט', disc: 'דסקה' };
/** holes every 5 cm from the CM */
const HOLE = 0.05;
/** the blow of blow mode [N·s] */
const J_BLOW = 1.0;
const RAD = Math.PI / 180;

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  shortest: 'במוט, מצאו את החור שזמן המחזור שלו הקצר ביותר.',
  'same-period': `מצאו שני חורים שונים עם אותו זמן מחזור. מה הקשר בין שני המרחקים ${ltr('d')} שלהם?`,
  'amplitude-60': `הציגו את המטוטלת הפשוטה, הרימו את זווית השחרור ל-${ltr('60°')} והפעילו. האם השתיים עדיין נעות יחד?`,
  'disc-shortest': 'עברו לדסקה ומצאו גם בה את החור שזמן המחזור שלו הקצר ביותר.',
  'no-jolt': 'גררו את מקום המכה עד שהציר לא מפעיל מתקף על המוט.',
  forward: 'מצאו מקום מכה שבו הציר דוחף את הגוף **עם** כיוון המכה, ולא נגדו.',
  'free-rest': 'הסירו את הציר, ומצאו מכה שאחריה הנקודה שנחה היא בדיוק החור שבו היה הציר.',
  'other-pivot': `תלו את המוט בחור אחר, ומצאו מחדש את מקום המכה שבו הציר לא מפעיל מתקף.`,
};

export interface PhysicalPendulumProps {
  id: string;
  mode?: Mode;
  /** the body shown first, and the chips offered */
  body?: BodyKind;
  bodies?: BodyKind[];
  /** the pin's distance from the CM [m], a multiple of 5 cm */
  d?: number;
  /** release angle [degrees] (swing mode) */
  theta0?: number;
  /** show the simple pendulum of length ℓ (swing mode) */
  simple?: boolean;
  /** the blow's distance below the pin [m] (blow mode) */
  b?: number;
  /** the pin removed (blow mode) */
  free?: boolean;
  /** mark the centre of percussion (blow mode) */
  cp?: boolean;
  /**
   * draw the curve T(d), the line d = k and the twin hole on the chart (swing mode; default true). Off, the chart
   * shows only the point-mass curve and the hole in use, so the figure does not answer the Predict; a text step
   * (`curve: true`) or the learner's first change turns it on.
   */
  curve?: boolean;
  tasks?: string[];
}

interface Setup {
  body: BodyKind;
  d: number;
  th0: number;
  simple: boolean;
  b: number;
  free: boolean;
  cp: boolean;
  curve: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const isBody = (x: unknown): x is BodyKind => x === 'rod' || x === 'disc';
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 1e-9) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));
const holeOf = (body: BodyKind, d: number) => clamp(roundTo(d, HOLE), HOLE, maxPivot(BODIES[body]));
/** how far the body reaches below the pin, along the line pin → CM [m] */
const reachBelow = (body: BodyKind, d: number) => d + (body === 'rod' ? BODIES.rod.size / 2 : BODIES.disc.size);
const reachAbove = (body: BodyKind, d: number) => (body === 'rod' ? BODIES.rod.size / 2 : BODIES.disc.size) - d;

/** Canvas text with a paper halo (Latin and math labels only; Hebrew goes through patchNote). */
function haloText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { font: string; color?: string; align?: CanvasTextAlign }) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.font = o.font;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.92);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** A symbol with a subscript (J with P below), with a paper halo, centred near (x, y); `tail` follows on the line. */
function subLabel(ctx: CanvasRenderingContext2D, p: Palette, main: string, sub: string, x: number, y: number, size: number, color: string, tail = '') {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.92);
  ctx.fillStyle = color;
  const fMain = `italic 700 ${size}px ${p.fontUi}`;
  const fSub = `italic 700 ${Math.round(size * 0.7)}px ${p.fontUi}`;
  ctx.font = fMain;
  const wMain = ctx.measureText(main).width;
  const wTail = tail ? ctx.measureText(tail).width : 0;
  ctx.font = fSub;
  const wSub = ctx.measureText(sub).width;
  let cx = x - (wMain + wSub + wTail) / 2;
  ctx.textAlign = 'left';
  ctx.font = fMain;
  ctx.strokeText(main, cx, y);
  ctx.fillText(main, cx, y);
  cx += wMain;
  ctx.font = fSub;
  ctx.strokeText(sub, cx, y + size * 0.3);
  ctx.fillText(sub, cx, y + size * 0.3);
  cx += wSub;
  if (tail) {
    ctx.font = fMain;
    ctx.strokeText(tail, cx, y);
    ctx.fillText(tail, cx, y);
  }
  ctx.restore();
}

/** A Hebrew note on a small paper patch. */
function patchNote(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.font = `500 ${size}px ${p.fontHand}`;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = withAlpha(p.paper, 0.88);
  ctx.fillRect(x - w / 2 - 3, y - size * 0.62, w + 6, size * 1.24);
  ctx.restore();
  handNote(ctx, text, x, y, p, size);
}

function dashed(ctx: CanvasRenderingContext2D, color: string, x1: number, y1: number, x2: number, y2: number, width = 1.1, dash: number[] = [5, 4]) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width = 2, fill?: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
}

/** The centre-of-mass glyph: a circle with two filled opposite quarters. */
function cmGlyph(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number) {
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.ink;
  for (const a of [0, Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, a, a + Math.PI / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** A short hatched support line (a ceiling) from (x1, y) to (x2, y). */
function ceiling(ctx: CanvasRenderingContext2D, p: Palette, x1: number, x2: number, y: number) {
  ctx.save();
  ctx.strokeStyle = p.equip || p.ink2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.lineWidth = 1;
  for (let x = x1 + 4; x < x2; x += 7) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 6, y - 6);
    ctx.stroke();
  }
  ctx.restore();
}

export default function PhysicalPendulum(props: PhysicalPendulumProps) {
  const mode: Mode = props.mode ?? 'swing';
  const offered: BodyKind[] = props.bodies ?? [props.body ?? 'rod'];

  const initialSetup = (): Setup => {
    const body = props.body ?? offered[0];
    const d = holeOf(body, props.d ?? maxPivot(BODIES[body]));
    return {
      body,
      d,
      th0: clamp(props.theta0 ?? 10, 5, 60),
      simple: props.simple ?? false,
      b: clamp(props.b ?? 0.3, 0.02, reachBelow(body, d)),
      free: props.free ?? false,
      cp: props.cp ?? false,
      curve: props.curve ?? true,
    };
  };

  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [playing, setPlaying] = useState(false);
  /** the swing's clock while playing, frozen when stopped [s] */
  const [time, setTime] = useState(0);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  const tPaused = useRef(0);
  const dragging = useRef(false);
  /** the holes the learner chose, per body (for the same-period task) */
  const visited = useRef<Record<BodyKind, Set<number>>>({ rod: new Set(), disc: new Set() });

  const body = BODIES[setup.body];
  const k = gyrationRadius(body);
  const ell = ellOf(k, setup.d);
  const T0 = smallPeriod(k, setup.d);
  const Tamp = periodAt(k, setup.d, setup.th0 * RAD);
  const table = useMemo(() => swingTable(ell, setup.th0 * RAD, 360, 3), [ell, setup.th0]);
  const blow = setup.free ? blowFree(body, setup.d, setup.b, J_BLOW) : blowPivoted(body, setup.d, setup.b, J_BLOW);
  const restFree = setup.free ? blowFree(body, setup.d, setup.b, J_BLOW).restFromPivot : 0;

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: (TASK_LABEL[id] ?? id).replace(/\*\*/g, '') }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the setup; they never play and never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setPlaying(false);
        t0.current = null;
        tPaused.current = 0;
        setTime(0);
        setSetup((prev) => {
          const bodyK = isBody(st.body) ? st.body : prev.body;
          const d = holeOf(bodyK, num(st.d) ?? prev.d);
          return {
            body: bodyK,
            d,
            th0: clamp(num(st.theta0) ?? prev.th0, 5, 60),
            simple: bool(st.simple) ?? prev.simple,
            b: clamp(num(st.b) ?? prev.b, 0.02, reachBelow(bodyK, d)),
            free: bool(st.free) ?? prev.free,
            cp: bool(st.cp) ?? prev.cp,
            curve: bool(st.curve) ?? prev.curve,
          };
        });
      }),
    [props.id],
  );

  /* ---------------------------------------------------------------- the learner's handlers (they tick tasks) */

  const checkBlow = (s: Setup) => {
    if (mode !== 'blow') return;
    const bd = BODIES[s.body];
    if (s.free) {
      const r = blowFree(bd, s.d, s.b, J_BLOW);
      if (r.restFromPivot !== null && Math.abs(r.restFromPivot) < 0.012) done('free-rest');
      return;
    }
    const P = blowPivoted(bd, s.d, s.b, J_BLOW).P;
    if (Math.abs(P) < 0.012 * J_BLOW) {
      done('no-jolt');
      if (Math.abs(s.d - maxPivot(bd)) > 1e-6) done('other-pivot');
    }
    if (P > 0.05 * J_BLOW) done('forward');
  };

  const checkHole = (s: Setup) => {
    if (mode !== 'swing') return;
    const kk = gyrationRadius(BODIES[s.body]);
    const seen = visited.current[s.body];
    for (const d0 of seen) {
      if (Math.abs(d0 - s.d) > 1e-6 && Math.abs(conjugatePivot(kk, d0) - s.d) < 1e-6) done('same-period');
    }
    seen.add(s.d);
    // the hole with the shortest period among the holes offered
    let best = HOLE;
    for (let d = HOLE; d <= maxPivot(BODIES[s.body]) + 1e-9; d += HOLE) if (smallPeriod(kk, d) < smallPeriod(kk, best)) best = d;
    if (Math.abs(best - s.d) < 1e-6) done(s.body === 'rod' ? 'shortest' : 'disc-shortest');
  };

  /** a change the learner made: stop the swing and check the tasks */
  const change = (f: (s: Setup) => Setup, what: 'hole' | 'blow' | 'other') => {
    setPlaying(false);
    t0.current = null;
    tPaused.current = 0;
    setTime(0);
    // any change the learner makes comes after the Predict: the chart shows its whole curve from then on
    const next = { ...f(setup), curve: true };
    setSetup(next);
    if (what === 'hole') checkHole(next);
    checkBlow(next);
  };

  const describeSwing = () =>
    `${BODY_LABEL[setup.body]} תלוי ${sci(setup.d)} מטר ממרכז המסה: האורך השקול ${sci(ell)} מטר, וזמן המחזור ${sci(Tamp)} שניות בזווית שחרור של ${sci(setup.th0)} מעלות.`;

  const play = () => {
    if (setup.simple && setup.th0 >= 60 - 1e-9) done('amplitude-60');
    if (!motionAllowed()) {
      setLive(`${describeSwing()} מצב סטטי: התנועה לא מוצגת.`);
      return;
    }
    t0.current = null;
    tPaused.current = 0;
    setTime(0);
    setPlaying(true);
    setLive('הגוף מתנודד.');
  };
  const stop = () => {
    setPlaying(false);
    setTime(tPaused.current);
    setLive(describeSwing());
  };

  /* ---------------------------------------------------------------- layout and drawing */

  interface Layout {
    narrow: boolean;
    stage: Box;
    plot: Plot | null;
  }
  const dMax = maxPivot(body);
  const tMax = setup.body === 'rod' ? 3.5 : 2.5;
  const layoutOf = (w: number, h: number): Layout => {
    const narrow = w < 520;
    if (mode === 'blow') return { narrow, stage: { x: 0, y: 0, w, h }, plot: null };
    const sh = Math.round(h * (narrow ? 0.6 : 0.62));
    const pb = insetBox({ x: 0, y: sh, w, h: h - sh }, { l: narrow ? 46 : 56, r: 14, t: 14, b: 42 });
    const plot = makePlot(pb, { min: 0, max: dMax, label: 'מרחק הציר ממרכז המסה d (m)' }, { min: 0, max: tMax, label: 'T (s)' });
    return { narrow, stage: { x: 0, y: 0, w, h: sh }, plot };
  };

  /** world (metres, y up, origin at the pin) → screen, for a stage */
  interface Frame {
    ppm: number;
    Px: number;
    Py: number;
    at: (x: number, y: number) => [number, number];
  }
  const frameOf = (L: Layout): Frame => {
    const S = L.stage;
    const above = 0.6;
    const below = mode === 'swing' ? 1.32 : 1.25;
    const wide = mode === 'swing' ? 2.7 : 2.4;
    const ppm = Math.max(1, Math.min((S.w - 24) / wide, (S.h - 40) / (above + below)));
    const Px = S.x + (mode === 'swing' ? 0.4 : L.narrow ? 0.36 : 0.3) * S.w;
    const Py = S.y + 30 + above * ppm;
    return { ppm, Px, Py, at: (x, y) => [Px + x * ppm, Py - y * ppm] };
  };

  /** a point a distance s along the line pin → CM and u across it, at angle θ, in world metres from the pin */
  const bodyPoint = (s: number, u: number, th: number): [number, number] => [s * Math.sin(th) + u * Math.cos(th), -s * Math.cos(th) + u * Math.sin(th)];

  function drawBody(ctx: CanvasRenderingContext2D, p: Palette, F: Frame, th: number, narrow: boolean) {
    const d = setup.d;
    const half = setup.body === 'rod' ? body.size / 2 : body.size;
    ctx.save();
    ctx.fillStyle = withAlpha(p.paper2, 0.95);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.8;
    if (setup.body === 'rod') {
      const w = Math.max(0.045, 9 / F.ppm);
      const corners: [number, number][] = [
        bodyPoint(d - half, -w / 2, th),
        bodyPoint(d + half, -w / 2, th),
        bodyPoint(d + half, w / 2, th),
        bodyPoint(d - half, w / 2, th),
      ];
      ctx.beginPath();
      corners.forEach(([x, y], i) => {
        const [X, Y] = F.at(x, y);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      const [cx, cy] = F.at(...bodyPoint(d, 0, th));
      ctx.beginPath();
      ctx.arc(cx, cy, body.size * F.ppm, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    // the holes, every 5 cm from the CM along the line (both sides)
    const hr = narrow ? 1.8 : 2.2;
    for (let c = -half + 1e-9; c <= half + 1e-9; c += HOLE) {
      const cc = roundTo(c, HOLE);
      if (Math.abs(cc) < 1e-9) continue;
      const [X, Y] = F.at(...bodyPoint(d - cc, 0, th));
      ring(ctx, X, Y, hr, p.ink3, 1);
    }
    const [cmX, cmY] = F.at(...bodyPoint(d, 0, th));
    cmGlyph(ctx, p, cmX, cmY, narrow ? 4.5 : 5.5);
  }

  function drawPin(ctx: CanvasRenderingContext2D, p: Palette, F: Frame, S: Box) {
    // the axle's bracket comes from the left edge of the stage, behind the body
    const y = F.Py;
    ctx.save();
    ctx.strokeStyle = p.equip || p.ink2;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(S.x + 10, y);
    ctx.lineTo(F.Px, y);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (let yy = y - 18; yy < y + 18; yy += 7) {
      ctx.beginPath();
      ctx.moveTo(S.x + 10, yy);
      ctx.lineTo(S.x + 4, yy + 6);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(S.x + 10, y - 18);
    ctx.lineTo(S.x + 10, y + 18);
    ctx.stroke();
    ctx.restore();
  }

  function drawSwing(ctx: CanvasRenderingContext2D, p: Palette, L: Layout, fs: number, th: number) {
    const F = frameOf(L);
    const S = L.stage;
    const th0 = setup.th0 * RAD;
    const sx = 0.95; // the simple pendulum's support, to the right of the pin [m]
    ctx.save();
    ctx.beginPath();
    ctx.rect(S.x, S.y, S.w, S.h);
    ctx.clip();

    // the faint swing arcs: the body's lowest point, and the bob
    const lowest = reachBelow(setup.body, setup.d);
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink3, 0.6);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(F.Px, F.Py, lowest * F.ppm, Math.PI / 2 - th0, Math.PI / 2 + th0);
    ctx.stroke();
    if (setup.simple) {
      ctx.beginPath();
      ctx.arc(F.Px + sx * F.ppm, F.Py, ell * F.ppm, Math.PI / 2 - th0, Math.PI / 2 + th0);
      ctx.stroke();
    }
    ctx.restore();

    drawPin(ctx, p, F, S);
    drawBody(ctx, p, F, th, L.narrow);

    // the line pin → O: dashed beyond the body when O lies outside it
    const [Ox, Oy] = F.at(...bodyPoint(ell, 0, th));
    if (ell > lowest) {
      const [Ex, Ey] = F.at(...bodyPoint(lowest, 0, th));
      dashed(ctx, p.hand, Ex, Ey, Ox, Oy, 1.2, [3, 4]);
    }
    ring(ctx, Ox, Oy, L.narrow ? 5 : 6, p.hand, 2.2);
    haloText(ctx, p, 'O', Ox - (L.narrow ? 13 : 15), Oy, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.hand });

    // the pin
    ring(ctx, F.Px, F.Py, L.narrow ? 4 : 5, p.ink, 2, p.ink);
    haloText(ctx, p, 'P', F.Px - 4, F.Py - (L.narrow ? 14 : 16), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, align: 'right' });

    if (setup.simple) {
      const [Sx, Sy] = F.at(sx, 0);
      ceiling(ctx, p, Sx - 22, Sx + 22, Sy);
      const [Bx, By] = F.at(sx + ell * Math.sin(th), -ell * Math.cos(th));
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(Sx, Sy);
      ctx.lineTo(Bx, By);
      ctx.stroke();
      ctx.restore();
      dashed(ctx, p.hand, Ox, Oy, Bx, By, 1.2, [4, 4]);
      ring(ctx, Bx, By, L.narrow ? 7 : 9, p.ink, 1.6, p.hand);
      const [Mx, My] = F.at(sx + 0.5 * ell * Math.sin(th), -0.5 * ell * Math.cos(th));
      haloText(ctx, p, 'ℓ', Mx + 10, My, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.ink2 });
      if (By > S.y + S.h - 6) patchNote(ctx, p, `הגולה מתחת לאיור`, Sx, S.y + S.h - 14, L.narrow ? 11 : 12);
    }
    ctx.restore();

    // a rule between the stage and the chart
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.beginPath();
    ctx.moveTo(S.x + 8, S.y + S.h + 0.5);
    ctx.lineTo(S.x + S.w - 8, S.y + S.h + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawChart(ctx: CanvasRenderingContext2D, p: Palette, plot: Plot, fs: number) {
    drawAxes(ctx, plot, p);
    // a point mass at the CM: 2π√(d/g)
    drawCurve(ctx, plot, (d) => 2 * Math.PI * Math.sqrt(d / G), { color: p.ink3, width: 1.6, dash: [5, 4] });
    const dLab = 0.82 * dMax;
    haloText(ctx, p, '2π√(d/g)', plot.px(dLab), plot.py(2 * Math.PI * Math.sqrt(dLab / G)) + 13, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2 });
    const d = setup.d;
    if (setup.curve) {
      // the physical pendulum
      drawCurve(ctx, plot, (x) => (x > 0 ? smallPeriod(k, x) : Number.NaN), { color: p.accent, width: 2.6, samples: 240 });
      // d = k, the minimum
      dashed(ctx, p.hand, plot.px(k), plot.py(0), plot.px(k), plot.py(smallPeriod(k, k)), 1.2, [3, 4]);
      haloText(ctx, p, 'k', plot.px(k) + 9, plot.py(0) - 10, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.hand });
    }
    // the hole shown, and the other hole with the same period
    const dc = conjugatePivot(k, d);
    if (setup.curve && Math.abs(dc - d) > 1e-6 && dc <= dMax + 1e-9) {
      dashed(ctx, p.accent, plot.px(d), plot.py(T0), plot.px(dc), plot.py(T0), 1.1, [3, 3]);
      ring(ctx, plot.px(dc), plot.py(T0), 5, p.accent, 1.8, p.paper);
      haloText(ctx, p, 'k²/d', plot.px(dc), plot.py(T0) - 13, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.accent });
    }
    drawMarker(ctx, plot, d, T0, p.accent, { guides: true, radius: 5.5 });
  }

  function drawBlow(ctx: CanvasRenderingContext2D, p: Palette, L: Layout, fs: number) {
    const F = frameOf(L);
    const S = L.stage;
    const d = setup.d;
    const top = -reachAbove(setup.body, d);
    const bot = reachBelow(setup.body, d);
    if (!setup.free) drawPin(ctx, p, F, S);
    drawBody(ctx, p, F, 0, L.narrow);
    // velocity scale: px per m/s, and force scale: px per N·s
    const vpx = Math.min(80, 0.15 * S.w);
    const vMaxPx = S.x + S.w - 24 - F.Px;
    const fpx = Math.min(110, 0.24 * S.w);
    // the velocities of the line's points just after the blow, every 10 cm, skipping the one under J
    const tips: [number, number][] = [];
    for (let s = top; s <= bot + 1e-9; s += 0.1) {
      const v = lineVelocity(blow, d, s);
      const [X, Y] = F.at(0, -s);
      tips.push([X + clamp(v * vpx, -vMaxPx, vMaxPx), Y]);
      if (Math.abs(s - setup.b) < 0.05 || Math.abs(v) < 0.04) continue;
      const len = Math.sign(v) * clamp(Math.abs(v) * vpx, 10, vMaxPx);
      arrow(ctx, X, Y, X + len, Y, { color: p.velocity, width: 1.6, head: 7, alpha: 0.85 });
    }
    // the profile through the tips: a straight line, zero where a point is at rest
    if (tips.length > 1) dashed(ctx, p.velocity, tips[0][0], tips[0][1], tips[tips.length - 1][0], tips[tips.length - 1][1], 1.2, [4, 3]);
    haloText(ctx, p, 'v', tips[tips.length - 1][0] + 10, tips[tips.length - 1][1] + 2, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.velocity, align: 'left' });

    // the centre of percussion
    if (setup.cp && !setup.free) {
      const [X, Y] = F.at(0, -ell);
      ring(ctx, X, Y, L.narrow ? 7 : 8, p.hand, 2.2);
      patchNote(ctx, p, 'מרכז ההקשה', X - (L.narrow ? 52 : 62), Y, L.narrow ? 12 : 13);
    }
    // the pin, or where it was
    if (setup.free) {
      ring(ctx, F.Px, F.Py, L.narrow ? 6 : 7, p.ink3, 1.4);
      patchNote(ctx, p, 'כאן היה הציר', F.Px - (L.narrow ? 52 : 62), F.Py - 2, L.narrow ? 11 : 12);
      if (restFree !== null) {
        const [X, Y] = F.at(0, -restFree);
        if (Y > S.y + 8 && Y < S.y + S.h - 8) {
          ring(ctx, X, Y, L.narrow ? 6 : 7, p.velocity, 2.2);
          patchNote(ctx, p, 'נחה', X + (L.narrow ? 26 : 30), Y, L.narrow ? 11 : 12);
        }
      }
    } else {
      ring(ctx, F.Px, F.Py, L.narrow ? 4 : 5, p.ink, 2, p.ink);
      // the impulse of the pin on the body, from the pin
      const P = blow.P;
      if (Math.abs(P) > 0.004) {
        const len = Math.sign(P) * Math.max(14, Math.abs(P) * fpx);
        const yP = F.Py - (L.narrow ? 9 : 11);
        arrow(ctx, F.Px, yP, F.Px + len, yP, { color: p.force, width: 2.8, head: 9 });
        subLabel(ctx, p, 'J', 'P', F.Px + len + Math.sign(len) * 14, yP, fs + 2, p.force);
      } else subLabel(ctx, p, 'J', 'P', F.Px + 24, F.Py - 14, fs + 1, p.force, ' = 0');
    }
    // the blow, from its point on the body
    const [Jx, Jy] = F.at(0, -setup.b);
    arrow(ctx, Jx, Jy, Jx + J_BLOW * fpx, Jy, { color: p.force, width: 3.4, head: 11 });
    haloText(ctx, p, 'J', Jx + J_BLOW * fpx + 11, Jy, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.force, align: 'left' });
    ring(ctx, Jx, Jy, 3.5, p.force, 2, p.force);
  }

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const L = layoutOf(view.w, view.h);
    const fs = L.narrow ? 11 : 12;
    if (mode === 'blow') {
      drawBlow(ctx, p, L, fs);
      return;
    }
    let now = time;
    if (playing) {
      if (t0.current === null) t0.current = t;
      now = t - t0.current;
      tPaused.current = now;
    }
    const th = now === 0 ? setup.th0 * RAD : thetaAt(table, now);
    drawSwing(ctx, p, L, fs, th);
    if (L.plot) drawChart(ctx, p, L.plot, fs);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 2.7, worldHeight: 2, animate: playing });
  useEffect(invalidate, [setup, playing, time, table]);

  const [narrowStage, setNarrowStage] = useState(false);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrowStage(el.getBoundingClientRect().width < 520));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [narrowStage]);
  const aspect = mode === 'swing' ? (narrowStage ? 0.62 : 0.92) : narrowStage ? 1.05 : 1.25;

  /* ---------------------------------------------------------------- pointer: drag the blow along the body */

  const bFromPointer = (e: PointerEvent): number | null => {
    const v = viewRef.current;
    if (!v) return null;
    const F = frameOf(layoutOf(v.w, v.h));
    return (e.offsetY - F.Py) / F.ppm;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (mode !== 'blow') return;
    const v = viewRef.current;
    if (!v) return;
    const F = frameOf(layoutOf(v.w, v.h));
    const half = setup.body === 'rod' ? 0.05 : body.size;
    if (Math.abs(e.offsetX - F.Px) > Math.max(30, half * F.ppm + 10)) return;
    const b = bFromPointer(e);
    if (b === null || b < 0 || b > reachBelow(setup.body, setup.d) + 0.05) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    change((s) => ({ ...s, b: clamp(roundTo(b, 0.01), 0.02, reachBelow(s.body, s.d)) }), 'blow');
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const b = bFromPointer(e);
    if (b === null) return;
    change((s) => ({ ...s, b: clamp(roundTo(b, 0.01), 0.02, reachBelow(s.body, s.d)) }), 'blow');
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(describeBlow());
    dragging.current = false;
  };

  const describeBlow = () =>
    setup.free
      ? `בלי הציר, מכה ${sci(setup.b)} מטר מתחת למקום הציר: מרכז המסה נע ${sci(blow.vcm)} מטר לשנייה, והמהירות הזוויתית ${signed(blow.omega)} רדיאן לשנייה.`
      : `מכה ${sci(setup.b)} מטר מתחת לציר: המתקף של הציר ${signed(blow.P)} ניוטון כפול שנייה.`;

  const onKeyDown = (e: KeyboardEvent) => {
    if (mode === 'blow') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') change((s) => ({ ...s, b: clamp(roundTo(s.b + 0.01, 0.01), 0.02, reachBelow(s.body, s.d)) }), 'blow');
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') change((s) => ({ ...s, b: clamp(roundTo(s.b - 0.01, 0.01), 0.02, reachBelow(s.body, s.d)) }), 'blow');
      else return;
    } else {
      if (e.key === 'Enter' || e.key === ' ') (playing ? stop : play)();
      else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') change((s) => ({ ...s, d: holeOf(s.body, s.d + HOLE) }), 'hole');
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') change((s) => ({ ...s, d: holeOf(s.body, s.d - HOLE) }), 'hole');
      else return;
    }
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const Ip = pivotInertia(body, setup.d);
  const label =
    mode === 'swing'
      ? `איור חי: ${BODY_LABEL[setup.body]} עם חורים, תלוי על ציר דרך חור במרחק ${sci(setup.d)} מטר ממרכז המסה, ומתחתיו גרף זמן המחזור כפונקציה של המרחק הזה. האורך השקול ${sci(ell)} מטר. במקלדת: חצים מחליפים חור, Enter מפעיל.`
      : `איור חי: ${BODY_LABEL[setup.body]} תלוי ${setup.free ? 'בלי ציר' : 'על ציר'} ומקבל מכה אופקית ${sci(setup.b)} מטר מתחת לנקודת התלייה. במקלדת: חצים מזיזים את מקום המכה.`;

  const readout =
    mode === 'swing' ? (
      <>
        <span class="q" data-readout="d">
          d = <b>{signed(setup.d)} m</b>
        </span>
        <span class="q" data-readout="k">
          k = <b>{signed(k)} m</b>
        </span>
        <span class="q" data-readout="Ip">
          I<sub>P</sub> = <b>{signed(Ip)} kg·m²</b>
        </span>
        <span class="q" data-readout="ell">
          ℓ = <b>{signed(ell)} m</b>
        </span>
        <span class="q" data-readout="T">
          T<sub>0</sub> = 2π√(ℓ/g) = <b>{signed(T0)} s</b>
        </span>
        <span class="q" data-readout="Tamp">
          T(θ₀ = {sci(setup.th0)}°) = <b>{signed(Tamp)} s</b>
        </span>
      </>
    ) : (
      <>
        <span class="q" data-readout="b">
          b = <b>{signed(setup.b)} m</b>
        </span>
        <span class="q" data-readout="omega">
          ω = <b>{signed(blow.omega, 1e-9)} rad/s</b>
        </span>
        <span class="q" data-readout="vcm">
          v<sub>cm</sub> = <b>{signed(blow.vcm, 1e-9)} m/s</b>
        </span>
        {setup.free ? (
          <span class="q" data-readout="rest">
            <bdi>הנקודה הנחה מתחת לציר</bdi> = <b>{restFree === null ? '—' : `${signed(restFree, 1e-6)} m`}</b>
          </span>
        ) : (
          <span class="q" data-readout="P">
            J<sub>P</sub> = <b>{signed(blow.P, 1e-6)} N·s</b>
          </span>
        )}
      </>
    );

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={mode === 'blow' ? 'ns-resize' : 'default'}
      onReset={() => {
        setSetup(initialSetup());
        setPlaying(false);
        t0.current = null;
        tPaused.current = 0;
        setTime(0);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={readout}
      controls={
        <>
          {offered.length > 1 && (
            <div class="group" role="group" aria-label="הגוף">
              {offered.map((bk) => (
                <Toggle
                  key={bk}
                  label={BODY_LABEL[bk]}
                  on={setup.body === bk}
                  onChange={() => change((s) => ({ ...s, body: bk, d: holeOf(bk, s.d), b: clamp(s.b, 0.02, reachBelow(bk, holeOf(bk, s.d))) }), 'hole')}
                />
              ))}
            </div>
          )}
          <Slider
            label="מרחק החור ממרכז המסה d"
            value={setup.d}
            min={HOLE}
            max={dMax}
            step={HOLE}
            format={(x) => `${sci(x)} m`}
            onChange={(v) => change((s) => ({ ...s, d: holeOf(s.body, v), b: clamp(s.b, 0.02, reachBelow(s.body, holeOf(s.body, v))) }), 'hole')}
          />
          {mode === 'swing' && (
            <>
              <Slider label="זווית השחרור θ₀" value={setup.th0} min={5} max={60} step={5} format={(x) => `${sci(x)}°`} onChange={(v) => change((s) => ({ ...s, th0: clamp(Math.round(v / 5) * 5, 5, 60) }), 'other')} />
              <div class="group" role="group" aria-label="הפעלה">
                <button type="button" class="btn primary" onClick={playing ? stop : play}>
                  {playing ? 'עצירה' : 'הפעלה'}
                </button>
                <Toggle label="מטוטלת פשוטה באורך ℓ" on={setup.simple} onChange={(on) => change((s) => ({ ...s, simple: on }), 'other')} />
              </div>
            </>
          )}
          {mode === 'blow' && (
            <>
              <Slider
                label="מקום המכה מתחת לציר b"
                value={setup.b}
                min={0.02}
                max={reachBelow(setup.body, setup.d)}
                step={0.01}
                format={(x) => `${sci(x)} m`}
                onChange={(v) => change((s) => ({ ...s, b: clamp(roundTo(v, 0.01), 0.02, reachBelow(s.body, s.d)) }), 'blow')}
              />
              <div class="group" role="group" aria-label="מה להציג">
                <Toggle label="בלי הציר" on={setup.free} onChange={(on) => change((s) => ({ ...s, free: on }), 'blow')} />
                <Toggle label="מרכז ההקשה" on={setup.cp} swatch="var(--hand)" onChange={(on) => change((s) => ({ ...s, cp: on }), 'other')} />
              </div>
            </>
          )}
        </>
      }
    />
  );
}
