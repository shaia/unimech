/**
 * CollisionPlane (lesson 4.3): two smooth discs (pucks on air-hockey ice) seen from above. Disc 1 comes in along
 * +x on the line y = b and hits disc 2, at rest at the origin. The figure draws, on the ice: the paths before and
 * after (drawn for equal times, so their lengths compare the speeds), the two discs at the moment of contact
 * (faint), the line of centres there and the impulse J on disc 2 along it, and the scattering angles θ₁, θ₂
 * measured from the incoming direction. Beside it, the momentum triangle p₁ = p₁′ + p₂′ with the circle on which
 * the tip of p₁′ lies in every elastic collision (and, for a heavy projectile, the tangent from O at θmax).
 * Optionally, a graph of θ₁ against b for the current masses and e.
 *
 * Every number comes from src/physics/collisions2d.ts. Tasks tick only in the learner's own handlers (the launch
 * button, the b slider); a text step sets the state but never launches, so a step never ticks a task.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { scatter, separationAngle, thetaMaxElastic, type Scatter } from '~/physics/collisions2d';
import { add, len, scale, type Vec2 } from '~/physics/vec';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, chevron, handNote, withAlpha } from './core/ink';
import { drawAxes, insetBox, makePlot, type Box } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/** below this stage width (CSS px) the panels stack */
const NARROW_W = 520;
/** disc radii [m] (air-hockey pucks) */
const R = 0.05;
const D = 2 * R;
/** half-extent of the patch of ice drawn [m] */
const XH = 0.45;
const YH = 0.36;
/** the incoming path's length before contact [m] */
const L_IN = 0.3;
/** the faster outgoing path's length [m] */
const L_OUT = 0.3;
/** a launch plays in this many seconds (slow motion) */
const PLAY = 2.6;
const DEG = 180 / Math.PI;

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside, so it reads left to right in Hebrew. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  launch: 'שגרו את הדיסקית פעם אחת, בכפתור "שגרו".',
  'two-b': `בלי לשנות את המסות, את המהירות ואת ${ltr('e')}: שגרו בשני ערכים שונים של ${ltr('b')}. האם התנע נשמר בשתי הפעמים? והאם הכיוונים זהים?`,
  'right-angle': `במסות שוות ובהתנגשות אלסטית: שגרו בשני ערכים שונים של ${ltr('b')}, שאינם אפס. מה הזווית בין המסלולים בכל פעם?`,
  'head-on': `שגרו עם ${ltr('b = 0')}. באיזה כיוון נעות הדיסקיות אחרי ההתנגשות?`,
  inelastic: `במסות שוות: הקטינו את ${ltr('e')} מתחת ל-1 ושגרו. האם הזווית בין המסלולים עדיין ישרה?`,
  'theta-max': `בהגדרה "כבד על קל": הזיזו את ${ltr('b')} עד שזווית הפיזור ${ltr('θ₁')} הכי גדולה, והשוו אותה ל-${ltr('θmax')}.`,
  'light-heavy': `בהגדרה "קל על כבד": שגרו כך שהדיסקית הפוגעת תחזור לאחור, בזווית פיזור גדולה מ-${ltr('90°')}.`,
};

export interface CollisionPlaneProps {
  id: string;
  /** masses [kg], the projectile's speed [m/s], the impact parameter [m], the coefficient of restitution */
  m1?: number;
  m2?: number;
  v?: number;
  b?: number;
  e?: number;
  /** draw the circle of elastic outcomes in the momentum panel */
  circle?: boolean;
  /** show the graph of θ₁ against b */
  anglePlot?: boolean;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

interface Setup {
  m1: number;
  m2: number;
  v: number;
  b: number;
  e: number;
}

interface Launch {
  n: number;
  setup: Setup;
  res: Scatter;
}

const M_MIN = 0.05;
const M_MAX = 0.6;
const V_MIN = 0.5;
const V_MAX = 3;
const B_MAX = 0.098;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 0) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));

const solve = (s: Setup) => scatter({ m1: s.m1, m2: s.m2, v: s.v, b: s.b, R1: R, R2: R, e: s.e });
const sameSetup = (a: Setup, c: Setup) => a.m1 === c.m1 && a.m2 === c.m2 && a.v === c.v && a.e === c.e;

/** Canvas text with a paper halo (Latin and math labels only; Hebrew goes through handNote). */
function haloText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { font: string; color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline }) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.font = o.font;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.baseline ?? 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = o.color ?? p.ink;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/**
 * The time after contact for which both outgoing paths are drawn (the same for both, so their lengths compare
 * the two speeds after the collision): the faster disc travels L_OUT, unless a path would leave the ice.
 */
function outTime(res: Scatter): number {
  const fast = Math.max(len(res.v1p), len(res.v2p));
  let t = fast > 0 ? L_OUT / fast : 0;
  const room = (p0: Vec2, v: Vec2) => {
    let tt = Infinity;
    const lim = [XH - R - 0.01, YH - R - 0.01];
    for (const i of [0, 1]) {
      if (Math.abs(v[i]) < 1e-12) continue;
      const edge = Math.sign(v[i]) * lim[i];
      tt = Math.min(tt, (edge - p0[i]) / v[i]);
    }
    return Math.max(0, tt);
  };
  t = Math.min(t, room(res.c1, res.v1p), room([0, 0], res.v2p));
  return t;
}

export default function CollisionPlane(props: CollisionPlaneProps) {
  const initialSetup = (): Setup => ({
    m1: clamp(props.m1 ?? 0.15, M_MIN, M_MAX),
    m2: clamp(props.m2 ?? 0.25, M_MIN, M_MAX),
    v: clamp(props.v ?? 1.5, V_MIN, V_MAX),
    b: clamp(props.b ?? 0.04, -B_MAX, B_MAX),
    e: clamp(props.e ?? 1, 0, 1),
  });
  const plotOn = props.anglePlot ?? false;
  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [circle, setCircle] = useState(props.circle ?? false);
  const [flying, setFlying] = useState<Launch | null>(null);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  const count = useRef(0);
  const landed = useRef(0);
  /** every launch of this visit, for the tasks that compare launches */
  const history = useRef<Launch[]>([]);

  const res = solve(setup);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the setup and the circle; they never launch
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setSetup((prev) => ({
          m1: clamp(num(st.m1) ?? prev.m1, M_MIN, M_MAX),
          m2: clamp(num(st.m2) ?? prev.m2, M_MIN, M_MAX),
          v: clamp(num(st.v) ?? prev.v, V_MIN, V_MAX),
          b: clamp(num(st.b) ?? prev.b, -B_MAX, B_MAX),
          e: clamp(num(st.e) ?? prev.e, 0, 1),
        }));
        const c = bool(st.circle);
        if (c !== null) setCircle(c);
        setFlying(null);
      }),
    [props.id],
  );

  const thetaMaxNow = (s: Setup) => (s.m1 > s.m2 && s.e === 1 ? thetaMaxElastic(s.m1, s.m2) : null);
  /** the b slider's own check: a heavy projectile, elastic, scattered within 0.2° of θmax */
  const checkMax = (s: Setup) => {
    const tm = thetaMaxNow(s);
    if (tm === null) return;
    const r = solve(s);
    if (Number.isFinite(r.theta1) && Math.abs(r.theta1) >= tm - 0.2 / DEG) done('theta-max');
  };

  const describe = (r: Scatter) => {
    const s1 = len(r.v1p);
    const a1 = Number.isFinite(r.theta1) ? `בזווית ${sci(r.theta1 * DEG)} מעלות` : '';
    return `אחרי ההתנגשות: דיסקית 1 ${s1 > 1e-9 ? `נעה ב-${sci(s1)} מטר בשנייה ${a1}` : 'עומדת'}, ודיסקית 2 נעה ב-${sci(len(r.v2p))} מטר בשנייה בזווית ${sci(r.theta2 * DEG)} מעלות.`;
  };

  const land = (l: Launch) => {
    if (landed.current === l.n) return;
    landed.current = l.n;
    setFlying(null);
    setLive(describe(l.res));
  };

  const launch = () => {
    const n = ++count.current;
    t0.current = null;
    const s = { ...setup };
    const l: Launch = { n, setup: s, res };
    done('launch');
    const h = history.current;
    if (h.some((o) => sameSetup(o.setup, s) && o.setup.b !== s.b)) done('two-b');
    const eqEl = (o: Setup) => o.m1 === o.m2 && o.e === 1 && o.b !== 0;
    if (eqEl(s) && h.some((o) => eqEl(o.setup) && sameSetup(o.setup, s) && o.setup.b !== s.b)) done('right-angle');
    if (s.b === 0) done('head-on');
    if (s.m1 === s.m2 && s.e < 1 && s.b !== 0) done('inelastic');
    if (s.m1 < s.m2 && Number.isFinite(res.theta1) && Math.abs(res.theta1) > Math.PI / 2) done('light-heavy');
    checkMax(s);
    h.push(l);
    if (!motionAllowed()) {
      land(l);
      return;
    }
    setFlying(l);
    setLive('הדיסקית נעה.');
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    // before the first layout the stage can be a few pixels tall: the panels would get negative sizes
    if (W < 120 || H < 160) return;
    const narrow = W < NARROW_W;
    const fs = narrow ? 11 : 12;

    // the instant shown: the end of the motion, unless a launch is playing
    let shown = setup;
    let r = res;
    let frac = 1;
    if (flying) {
      if (t0.current === null) t0.current = t;
      shown = flying.setup;
      r = flying.res;
      frac = Math.min(1, (t - t0.current) / PLAY);
      if (frac >= 1) land(flying);
    }

    /* ---------------- layout */
    let table: Box;
    let mom: Box;
    let plot: Box | null = null;
    if (narrow) {
      const split = plotOn ? 0.5 : 0.62;
      table = { x: 0, y: 40, w: W, h: H * split - 40 };
      if (plotOn) {
        mom = { x: 0, y: H * split, w: W / 2, h: H * (1 - split) };
        plot = { x: W / 2, y: H * split, w: W / 2, h: H * (1 - split) };
      } else mom = { x: 0, y: H * split, w: W, h: H * (1 - split) };
    } else {
      const cut = W * (plotOn ? 0.56 : 0.6);
      table = { x: 0, y: 0, w: cut, h: H };
      if (plotOn) {
        mom = { x: cut, y: 44, w: W - cut, h: H * 0.5 - 44 };
        plot = { x: cut, y: H * 0.5, w: W - cut, h: H * 0.5 };
      } else mom = { x: cut, y: 44, w: W - cut, h: H - 44 };
    }

    drawTable(ctx, p, table, shown, r, frac, fs, narrow);
    drawMomentum(ctx, p, mom, shown, r, fs, narrow);
    if (plot) drawAnglePlot(ctx, p, plot, shown, fs, narrow);
  };

  /* ---------------- the ice, seen from above */
  function drawTable(ctx: CanvasRenderingContext2D, p: Palette, box: Box, s: Setup, r: Scatter, frac: number, fs: number, narrow: boolean) {
    const ppm = Math.min(box.w / (2 * XH), box.h / (2 * YH));
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const S = (q: Vec2): [number, number] => [cx + q[0] * ppm, cy - q[1] * ppm];
    const rp = R * ppm;

    // the ice
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.05);
    const [ix0, iy0] = S([-XH, YH]);
    ctx.fillRect(ix0, iy0, 2 * XH * ppm, 2 * YH * ppm);
    ctx.strokeStyle = p.rule;
    ctx.strokeRect(ix0, iy0, 2 * XH * ppm, 2 * YH * ppm);
    ctx.restore();

    const line = (a: Vec2, c: Vec2, color: string, width: number, dash: number[] = []) => {
      const [x1, y1] = S(a);
      const [x2, y2] = S(c);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    };
    const disc = (c: Vec2, color: string, label: string, alpha = 1, ghost = false) => {
      const [x, y] = S(c);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (ghost) {
        ctx.strokeStyle = color;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, rp, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, rp, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.paper;
        ctx.font = `700 ${Math.max(10, Math.round(rp * 0.9))}px ${p.fontUi}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.direction = 'ltr';
        ctx.fillText(label, x, y + 1);
      }
      ctx.restore();
    };

    const v1: Vec2 = [s.v, 0];
    const tIn = L_IN / s.v;
    const tOut = outTime(r);
    const start = add(r.c1, scale(v1, -tIn));
    const end1 = add(r.c1, scale(r.v1p, tOut));
    const end2 = scale(r.v2p, tOut);
    const c1col = p.accent;
    const c2col = p.ink2;

    // the axis through the target's centre, along the incoming direction
    line([-XH + 0.01, 0], [XH - 0.01, 0], withAlpha(p.ink3, 0.8), 1, [3, 5]);
    // the impact parameter b, between that axis and the incoming line, just after the start, labelled to its right
    if (Math.abs(s.b) > 0.006) {
      const xb = start[0] + 0.03;
      const [bx, by0] = S([xb, 0]);
      const [, by1] = S([xb, s.b]);
      arrow(ctx, bx, (by0 + by1) / 2, bx, by0, { color: p.ink2, width: 1.2, head: 6 });
      arrow(ctx, bx, (by0 + by1) / 2, bx, by1, { color: p.ink2, width: 1.2, head: 6 });
      haloText(ctx, p, 'b', bx + 6, (by0 + by1) / 2, { font: `italic 600 ${fs + 2}px ${p.fontUi}`, color: p.ink2, align: 'left' });
    }

    // the incoming path, and its continuation (the direction from which θ₁ is measured)
    line(start, r.c1, c1col, 2.2);
    {
      const [a, b] = S(add(start, [0.12, 0]));
      chevron(ctx, a, b, 1, 0, narrow ? 6 : 7, c1col);
    }
    if (r.hit) {
      line(r.c1, add(r.c1, [0.17, 0]), p.ink3, 1.2, [5, 4]);
      line([0, 0], [0.17, 0], p.ink3, 1.2, [5, 4]);
    }

    // the outgoing paths, both drawn for the same time (their lengths compare the two speeds after the collision)
    const s1 = len(r.v1p);
    const s2 = len(r.v2p);
    if (s1 * tOut > 1e-4) {
      line(r.c1, end1, c1col, 2.2);
      const mid = add(r.c1, scale(r.v1p, tOut * 0.6));
      const [a, b] = S(mid);
      chevron(ctx, a, b, r.v1p[0] / s1, -r.v1p[1] / s1, narrow ? 6 : 7, c1col);
    }
    if (s2 * tOut > 1e-4) {
      line([0, 0], end2, c2col, 2.2);
      const mid = scale(r.v2p, tOut * 0.6);
      const [a, b] = S(mid);
      chevron(ctx, a, b, r.v2p[0] / s2, -r.v2p[1] / s2, narrow ? 6 : 7, c2col);
    }

    // the contact: both discs (faint)
    if (r.hit) {
      disc(r.c1, c1col, '', 0.55, true);
      disc([0, 0], c2col, '', 0.55, true);
    }

    // the discs now, under the annotations so that no label hides behind a disc
    const tNow = frac * (tIn + tOut);
    let p1: Vec2;
    let p2: Vec2;
    if (tNow < tIn) {
      p1 = add(start, scale(v1, tNow));
      p2 = [0, 0];
    } else {
      p1 = add(r.c1, scale(r.v1p, tNow - tIn));
      p2 = scale(r.v2p, tNow - tIn);
    }
    disc(p2, c2col, '2', 0.92);
    disc(p1, c1col, '1', 0.92);

    // the line of centres, and the impulse on disc 2 along it
    if (r.hit) {
      const n = r.n;
      line(add(r.c1, scale(n, -0.07)), scale(n, 0.07), withAlpha(p.accent, 0.7), 1.3, [7, 4]);
      if (r.J > 0) {
        const [ax, ay] = S([0, 0]);
        const [bx, by] = S(scale(n, 0.12));
        arrow(ctx, ax, ay, bx, by, { color: p.force, width: 3, head: 10 });
        // beside the arrow, on the side away from the x axis: the arc of θ₂ lies between the arrow and the axis
        const side: Vec2 = (s.b >= 0 ? -n[0] : n[0]) < 0 ? [n[1], -n[0]] : [-n[1], n[0]];
        const [lx, ly] = S(add(scale(n, 0.09), scale(side, 0.04)));
        haloText(ctx, p, 'J', lx, ly, { font: `italic 700 ${fs + 3}px ${p.fontUi}`, color: p.force });
      }
    }

    // the scattering angles, from the incoming direction
    const angleArc = (at: Vec2, th: number, rad: number, label: string, color: string) => {
      if (!Number.isFinite(th) || Math.abs(th) < 2 / DEG) return;
      const [x, y] = S(at);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // canvas angles run clockwise (y down): the world angle th is −th on screen
      ctx.arc(x, y, rad * ppm, 0, -th, th > 0);
      ctx.stroke();
      ctx.restore();
      // the label beside the middle of the arc, or further out, or past its end: the first spot clear of both discs
      const lr = rad * ppm + (narrow ? 12 : 14);
      const discs = [S(p1), S(p2)];
      const clear = (q: [number, number]) => discs.every(([dx, dy]) => Math.hypot(q[0] - dx, q[1] - dy) > rp + 10);
      const spot = (rr: number, a: number): [number, number] => [x + rr * Math.cos(a), y - rr * Math.sin(a)];
      const sg = Math.sign(th);
      const cands = [spot(lr, th / 2), spot(lr + 16, th / 2), spot(lr, th + sg * 0.3), spot(lr, -sg * 0.25)];
      const q = cands.find(clear) ?? cands[0];
      haloText(ctx, p, label, q[0], q[1], { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color });
    };
    if (r.hit) {
      angleArc(r.c1, r.theta1, 0.075, 'θ₁', c1col);
      angleArc([0, 0], r.theta2, 0.15, 'θ₂', c2col);
    }

    // a right angle between the outgoing paths: a square at the projectile's centre at contact, where the path
    // of disc 2 (the line of centres) and the path of disc 1 meet
    const between = separationAngle(r.v1p, r.v2p);
    if (r.hit && Number.isFinite(between) && Math.abs(between - Math.PI / 2) < 1e-6) {
      const u: Vec2 = scale(r.v1p, 1 / s1);
      const k = 0.028;
      const a = S(add(r.c1, scale(u, k)));
      const b2 = S(add(r.c1, add(scale(u, k), scale(r.n, k))));
      const c = S(add(r.c1, scale(r.n, k)));
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b2[0], b2[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.stroke();
      ctx.restore();
    }

    handNote(ctx, 'מבט מלמעלה', box.x + (narrow ? 56 : 62), box.y + (narrow ? -18 : 16), p, narrow ? 12 : 14);
  }

  /* ---------------- the momentum triangle */
  function drawMomentum(ctx: CanvasRenderingContext2D, p: Palette, box: Box, s: Setup, r: Scatter, fs: number, narrow: boolean) {
    const P = s.m1 * s.v;
    const M = s.m1 + s.m2;
    const cc = (s.m1 / M) * P;
    const rr = (s.m2 / M) * P;
    const p1p: Vec2 = scale(r.v1p, s.m1);
    const xmin = Math.min(0, cc - rr, p1p[0]);
    const xmax = P;
    const yr = Math.max(rr, Math.abs(p1p[1]), 0.18 * P);
    const pad = narrow ? 18 : 24;
    const top = narrow ? 30 : 40;
    const k = Math.min((box.w - 2 * pad) / (xmax - xmin), (box.h - top - pad) / (2 * yr));
    if (!(k > 0)) return;
    const ox = box.x + box.w / 2 - ((xmin + xmax) / 2) * k;
    const oy = box.y + top + (box.h - top - pad) / 2;
    const S = (q: Vec2): [number, number] => [ox + q[0] * k, oy - q[1] * k];

    handNote(ctx, 'משולש התנע', box.x + box.w / 2, box.y + (narrow ? 12 : 14), p, narrow ? 12 : 14);

    // the circle of elastic outcomes: centre (m₁/M) p₁, radius (m₂/M) p₁
    if (circle) {
      const [x, y] = S([cc, 0]);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink2, 0.8);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(x, y, rr * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = p.ink2;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // a heavy projectile: the tangents from O at ±θmax bound every outcome
      const tm = thetaMaxNow(s);
      if (tm !== null) {
        const L = Math.sqrt(cc * cc - rr * rr);
        for (const sg of [1, -1]) {
          const [x0, y0] = S([0, 0]);
          const [x1, y1] = S([L * 1.12 * Math.cos(tm), sg * L * 1.12 * Math.sin(tm)]);
          ctx.save();
          ctx.strokeStyle = p.accent;
          ctx.lineWidth = 1.3;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
          ctx.restore();
        }
        // under the lower tangent, near O: the upper one carries p₁′ when the angle is the largest
        const [lx, ly] = S([L * 0.32 * Math.cos(tm), -L * 0.32 * Math.sin(tm)]);
        haloText(ctx, p, 'θmax', lx, ly + 12, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.accent, align: 'center' });
      }
    }

    // p₁ before, from O; p₁′ from O; p₂′ from the tip of p₁′ to the tip of p₁
    const [x0, y0] = S([0, 0]);
    const [xp, yp] = S([P, 0]);
    const [x1, y1] = S(p1p);
    arrow(ctx, x0, y0, xp, yp, { color: p.momentum, width: 3.2, head: 11 });
    const small = len(p1p) * k < 6;
    if (!small) arrow(ctx, x0, y0, x1, y1, { color: p.momentum, width: 2, head: 9, alpha: 0.85 });
    if (len(scale(r.v2p, s.m2)) * k > 3) arrow(ctx, x1, y1, xp, yp, { color: p.momentum, width: 2, head: 9, alpha: 0.85 });
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(x0, y0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    haloText(ctx, p, 'O', x0 - 5, y0 + 11, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });

    // labels: p₁ on the side of its arrow away from the triangle; p₁′ and p₂′ beside their middles, outward
    const side = p1p[1] > 1e-9 * P ? 1 : -1;
    haloText(ctx, p, 'p₁', (x0 + xp) / 2, y0 + side * (fs + 4), { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.momentum });
    const centroid: Vec2 = [(0 + P + p1p[0]) / 3, p1p[1] / 3];
    const tag = (a: Vec2, c: Vec2, txt: string) => {
      const m: Vec2 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      const d: Vec2 = [c[0] - a[0], c[1] - a[1]];
      const L = len(d);
      if (L * k < 14) return;
      let nrm: Vec2 = [-d[1] / L, d[0] / L];
      if ((m[0] - centroid[0]) * nrm[0] + (m[1] - centroid[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];
      const [mx, my] = S(m);
      haloText(ctx, p, txt, mx + nrm[0] * (fs + 6), my - nrm[1] * (fs + 6), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.momentum });
    };
    tag([0, 0], p1p, 'p₁′');
    tag(p1p, [P, 0], 'p₂′');

    // the right angle between p₁′ and p₂′
    const between = separationAngle(r.v1p, r.v2p);
    if (Number.isFinite(between) && Math.abs(between - Math.PI / 2) < 1e-6 && !small) {
      const u1: Vec2 = scale(p1p, -1 / len(p1p));
      const d2: Vec2 = [P - p1p[0], -p1p[1]];
      const u2: Vec2 = scale(d2, 1 / len(d2));
      const q = 9 / k;
      const a = S(add(p1p, scale(u1, q)));
      const b2 = S(add(p1p, add(scale(u1, q), scale(u2, q))));
      const c = S(add(p1p, scale(u2, q)));
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b2[0], b2[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------------- θ₁ against b */
  function drawAnglePlot(ctx: CanvasRenderingContext2D, p: Palette, outer: Box, s: Setup, fs: number, narrow: boolean) {
    const N = 401;
    const pts: { b: number; th: number }[] = [];
    let maxAbs = 0;
    // to the grazing edge |b| = D, where θ₁ returns to 0 (the slider stops at B_MAX, the curve does not)
    for (let i = 0; i < N; i++) {
      const b = -D + (2 * D * i) / (N - 1);
      const th = solve({ ...s, b }).theta1 * DEG;
      pts.push({ b, th });
      if (Number.isFinite(th)) maxAbs = Math.max(maxAbs, Math.abs(th));
    }
    const yTop = maxAbs > 95 ? 180 : maxAbs > 45 ? 90 : maxAbs > 20 ? 45 : 20;
    const yTicks = yTop === 180 ? [-180, -90, 0, 90, 180] : yTop === 90 ? [-90, -45, 0, 45, 90] : yTop === 45 ? [-45, 0, 45] : [-20, -10, 0, 10, 20];
    const box = insetBox(outer, { l: narrow ? 36 : 42, r: 10, t: 26, b: 40 });
    const pl = makePlot(
      box,
      { min: -0.1, max: 0.1, label: 'b (m)', ticks: narrow ? [-0.1, 0, 0.1] : [-0.1, -0.05, 0, 0.05, 0.1], format: (x) => signed(x) },
      { min: -yTop, max: yTop, ticks: yTicks, format: (x) => signed(x) },
    );
    drawAxes(ctx, pl, p);
    // the y axis's name above it, clear of the tick numbers (a rotated title collides with "−180")
    haloText(ctx, p, 'θ₁ (°)', box.x, box.y - 13, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink, align: 'center' });
    // zero line
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, pl.py(0));
    ctx.lineTo(box.x + box.w, pl.py(0));
    ctx.stroke();
    ctx.restore();
    // θmax of a heavy projectile, elastic
    const tm = thetaMaxNow(s);
    if (tm !== null) {
      for (const sg of [1, -1]) {
        const y = pl.py(sg * tm * DEG);
        ctx.save();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 1.3;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(box.x, y);
        ctx.lineTo(box.x + box.w, y);
        ctx.stroke();
        ctx.restore();
      }
      // at the left end, under the line: the maximum of θ₁ itself is on the right (b > 0), the axis title above
      haloText(ctx, p, 'θmax', box.x + 4, pl.py(tm * DEG) + 10, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.accent, align: 'left' });
    }
    // the curve, broken where the angle jumps (b = 0 when the projectile stops or bounces straight back)
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y - 2, box.w, box.h + 4);
    ctx.clip();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let prev: number | null = null;
    for (const q of pts) {
      if (!Number.isFinite(q.th) || (prev !== null && Math.abs(q.th - prev) > 60)) {
        prev = Number.isFinite(q.th) ? q.th : null;
        if (prev !== null) ctx.moveTo(pl.px(q.b), pl.py(q.th));
        continue;
      }
      if (prev === null) ctx.moveTo(pl.px(q.b), pl.py(q.th));
      else ctx.lineTo(pl.px(q.b), pl.py(q.th));
      prev = q.th;
    }
    ctx.stroke();
    ctx.restore();
    // the current b
    const th = solve(s).theta1 * DEG;
    if (Number.isFinite(th)) {
      ctx.save();
      ctx.fillStyle = p.accent;
      ctx.strokeStyle = p.paper;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pl.px(s.b), pl.py(th), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  const [narrowStage, setNarrowStage] = useState(false);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: flying !== null });
  useEffect(invalidate, [setup, circle, flying]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      setNarrowStage(w > 0 && w < NARROW_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const aspect = narrowStage ? (plotOn ? 0.6 : 0.72) : plotOn ? 1.25 : 16 / 10;

  const change = (f: (s: Setup) => Setup) => {
    setFlying(null);
    setSetup((s) => f(s));
  };
  const setM1 = (x: number) => change((s) => ({ ...s, m1: clamp(roundTo(x, 0.05), M_MIN, M_MAX) }));
  const setM2 = (x: number) => change((s) => ({ ...s, m2: clamp(roundTo(x, 0.05), M_MIN, M_MAX) }));
  const setV = (x: number) => change((s) => ({ ...s, v: clamp(roundTo(x, 0.1), V_MIN, V_MAX) }));
  const setE = (x: number) => change((s) => ({ ...s, e: clamp(roundTo(x, 0.05), 0, 1) }));
  const setB = (x: number) => {
    const b = clamp(roundTo(x, 0.002), -B_MAX, B_MAX);
    const next = { ...setup, b };
    change(() => next);
    checkMax(next);
  };
  const preset = (k: 'equal' | 'headon' | 'heavy' | 'light') =>
    change((s) =>
      k === 'equal'
        ? { ...s, m1: 0.15, m2: 0.15, e: 1, b: 0.04 }
        : k === 'headon'
          ? { ...s, b: 0 }
          : k === 'heavy'
            ? { ...s, m1: 0.45, m2: 0.15, e: 1, b: 0.04 }
            : { ...s, m1: 0.15, m2: 0.45, e: 1, b: 0.04 },
    );

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') launch();
    else if (e.key === 'ArrowUp') setB(setup.b + 0.002);
    else if (e.key === 'ArrowDown') setB(setup.b - 0.002);
    else return;
    e.preventDefault();
  };

  const s1 = len(res.v1p);
  const s2 = len(res.v2p);
  const between = separationAngle(res.v1p, res.v2p);
  const deg = (x: number) => (Number.isFinite(x) ? `${signed(x * DEG, 1e-9)}°` : '—');
  const P0x = setup.m1 * setup.v;
  const Px = setup.m1 * res.v1p[0] + setup.m2 * res.v2p[0];
  const Py = setup.m1 * res.v1p[1] + setup.m2 * res.v2p[1];
  const tm = thetaMaxNow(setup);
  const label = `איור חי: דיסקית במסה ${sci(setup.m1)} קילוגרם נעה ב-${sci(setup.v)} מטר בשנייה ופוגעת בדיסקית במסה ${sci(setup.m2)} קילוגרם שעומדת, בפרמטר פגיעה ${sci(setup.b)} מטר. ${describe(res)} במקלדת: חץ למעלה ולמטה משנה את פרמטר הפגיעה, Enter משגר.`;

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onReset={() => {
        setSetup(initialSetup());
        setCircle(props.circle ?? false);
        setFlying(null);
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        flying ? (
          <span>הדיסקיות נעות…</span>
        ) : (
          <>
            <span class="q" data-readout="v1">
              v₁′ = <b>{signed(s1, 1e-9)} m/s</b>
            </span>
            <span class="q" data-readout="th1">
              θ₁ = <b>{deg(res.theta1)}</b>
            </span>
            <span class="q" data-readout="v2">
              v₂′ = <b>{signed(s2, 1e-9)} m/s</b>
            </span>
            <span class="q" data-readout="th2">
              θ₂ = <b>{deg(res.theta2)}</b>
            </span>
            <span>
              הזווית בין המסלולים{' '}
              <b class="q" data-readout="between">
                {deg(between)}
              </b>
            </span>
            <span class="q" data-readout="px">
              Σp<sub>x</sub>: <b>{signed(P0x)} → {signed(Px, 1e-9)} kg·m/s</b>
            </span>
            <span class="q" data-readout="py">
              Σp<sub>y</sub>: <b>0 → {signed(Py, 1e-9)} kg·m/s</b>
            </span>
            <span>
              האנרגיה הקינטית שנשארה{' '}
              <b class="q" data-readout="k">
                {sci((100 * res.K1) / res.K0, 3)}%
              </b>
            </span>
            <span class="q" data-readout="J">
              J = <b>{signed(res.J, 1e-12)} N·s</b>
            </span>
            {tm !== null && (
              <span class="q" data-readout="tmax">
                θmax = <b>{sci(tm * DEG, 3)}°</b>
              </span>
            )}
          </>
        )
      }
      controls={
        <>
          <div class="group" role="group" aria-label="הגדרות מוכנות">
            <button type="button" class="btn ghost" onClick={() => preset('equal')}>
              מסות שוות
            </button>
            <button type="button" class="btn ghost" onClick={() => preset('headon')}>
              חזיתית
            </button>
            <button type="button" class="btn ghost" onClick={() => preset('heavy')}>
              כבד על קל
            </button>
            <button type="button" class="btn ghost" onClick={() => preset('light')}>
              קל על כבד
            </button>
          </div>
          <Slider label="המסה הפוגעת m₁" value={setup.m1} min={M_MIN} max={M_MAX} step={0.05} format={(x) => `${sci(x)} kg`} onChange={setM1} />
          <Slider label="מסת המטרה m₂" value={setup.m2} min={M_MIN} max={M_MAX} step={0.05} format={(x) => `${sci(x)} kg`} onChange={setM2} />
          <Slider label="המהירות ההתחלתית v" value={setup.v} min={V_MIN} max={V_MAX} step={0.1} format={(x) => `${sci(x)} m/s`} onChange={setV} />
          <Slider label="פרמטר הפגיעה b" value={setup.b} min={-B_MAX} max={B_MAX} step={0.002} format={(x) => `${signed(x)} m`} onChange={setB} />
          <Slider label="מקדם התקומה e" value={setup.e} min={0} max={1} step={0.05} format={(x) => sci(x)} onChange={setE} />
          <div class="group" role="group" aria-label="שיגור">
            <button type="button" class="btn primary" onClick={launch}>
              שגרו
            </button>
            <Toggle label="מעגל התוצאות" on={circle} onChange={setCircle} />
          </div>
        </>
      }
    />
  );
}
