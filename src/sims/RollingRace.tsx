/**
 * RollingRace (lesson 8.4): rolling with and without slipping, in two scenes.
 *
 * - 'race': five bodies released together from rest down one slope (angle θ, length 2.0 m), each on its own lane:
 *   a ring, a disc (solid cylinder), a hollow sphere, a solid sphere, and a block that slides on a frictionless strip.
 *   The learner sets θ and one coefficient μ for static and kinetic friction (the model's simplification). Below the
 *   lanes a close-up of one chosen body on the slope, with the forces on it where they act: the weight at the CM, the
 *   normal force and the friction at the contact point; a gauge compares the friction rolling needs, β m g sin θ/(1 + β),
 *   with the most the slope can give, μ N. Past the threshold the body rolls with slipping (kinetic friction μ N), and
 *   its spoke turns visibly slower than the distance it covers.
 * - 'skid': a round body lands on a level floor with speed v₀ and spin ω₀ (any sign; Rω₀ > 0 is the rolling sense)
 *   and skids under kinetic friction until the contact point stops slipping, then rolls. Below it a graph of v, ωR and
 *   the slip speed u = v − ωR against time, with the moment rolling starts marked. The camera follows the body; the
 *   floor's metre marks scroll, the landing point is a flag. The body is drawn larger than scale.
 *
 * Physics: src/physics/rolling.ts (inclineMotion, inclineState, timeDown, skid, skidSummary) on top of
 * src/physics/rigidbody.ts. Tasks tick only inside the learner's own handlers (sliders, chips, buttons); a text step
 * sets the scene and the instant shown, never plays and never ticks.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import { BETA, type RoundBody } from '~/physics/rigidbody';
import { inclineMotion, inclineState, kePerMass, skid, skidSummary, timeDown } from '~/physics/rolling';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import { drawAxes, insetBox, makePlot, niceTicks, type Box } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type RaceBody = RoundBody | 'block';
export type RollingMode = 'race' | 'skid';

/** the slope's length [m] */
const TRACK = 2.0;
/** the body's radius in the skid scene [m] (a bowling ball); the race's radius never enters a result */
const R_SKID = 0.11;
const NARROW_W = 520;

const LANES: RaceBody[] = ['disc', 'ring', 'block', 'solidSphere', 'hollowSphere'];
const NAME: Record<RaceBody, string> = {
  ring: 'טבעת',
  disc: 'דסקה',
  hollowSphere: 'קליפה כדורית',
  solidSphere: 'כדור מלא',
  block: 'קובייה',
};
const betaOf = (b: RaceBody) => (b === 'block' ? 0 : BETA[b]);
/** the motion's name (a noun, so it fits every body's gender) */
const stateOf = (b: RaceBody, rolling: boolean) => (b === 'block' ? 'החלקה בלי חיכוך' : rolling ? 'גלגול בלי החלקה' : 'גלגול עם החלקה');
const isRaceBody = (x: unknown): x is RaceBody => x === 'ring' || x === 'disc' || x === 'hollowSphere' || x === 'solidSphere' || x === 'block';
const isRound = (x: unknown): x is RoundBody => x === 'ring' || x === 'disc' || x === 'hollowSphere' || x === 'solidSphere';

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  'race-run': 'לחצו "שחררו" וצפו במרוץ. מי מגיע ראשון לקו הסיום, ומי אחרון?',
  'steeper-same-order': 'שנו את זווית המדרון ושחררו שוב. האם סדר ההגעה השתנה?',
  'ring-slips': `הקטינו את ${ltr('μ')} עד שהטבעת מתחילה להחליק, בזמן שהכדור המלא עדיין מתגלגל בלי החלקה.`,
  'all-slip': 'מצאו מקדם חיכוך, גדול מאפס, שבו כל ארבעת הגופים העגולים מחליקים, ושחררו. מה קרה לסדר?',
  'no-spin': `זרקו כדור מלא בלי סיבוב (${ltr('Rω₀ = 0')}) והפעילו. איזה חלק מ-${ltr('v₀')} נשאר כשההחלקה נגמרת?`,
  'mu-free': `זרקו בלי סיבוב, באותה ${ltr('v₀')}, בשני מקדמי חיכוך שונים, והפעילו כל פעם. מה השתנה, ומה לא?`,
  'come-back': 'מצאו סיבוב לאחור שגורם לכדור, שנזרק קדימה, לחזור אליכם, והפעילו.',
  'no-friction-roll': 'כוונו את הסיבוב כך שהכדור מתגלגל בלי החלקה כבר ברגע הנחיתה. מה עושה החיכוך?',
};

export interface RollingRaceProps {
  id: string;
  mode: RollingMode;
  /** race: the slope angle [deg], the coefficient of friction, the body shown in the close-up */
  theta?: number;
  mu?: number;
  focus?: RaceBody;
  /** skid: the body, the landing speed [m/s], the spin as the rim speed Rω₀ [m/s] (rolling sense), and μ_k */
  body?: RoundBody;
  v0?: number;
  w0R?: number;
  tasks?: string[];
}

interface RaceSetup {
  theta: number;
  mu: number;
  focus: RaceBody;
}
interface SkidSetup {
  body: RoundBody;
  v0: number;
  w0R: number;
  mu: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
const rad = (d: number) => (d * Math.PI) / 180;
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 1e-9) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));

const LIM = { theta: [5, 50] as const, mu: [0, 0.6] as const, v0: [0, 10] as const, w0R: [-15, 15] as const, muK: [0.05, 0.6] as const };

/** Canvas text (Latin and math) with a paper halo; Hebrew goes through handNote. */
function label(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, color: string, size = 13, align: CanvasTextAlign = 'center') {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.font = `italic 600 ${size}px ${p.fontUi}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.92);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** A Hebrew note on a small paper patch, so lines under it do not cut the letters. */
function patchNote(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.font = `500 ${size}px ${p.fontHand}`;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = withAlpha(p.paper, 0.85);
  ctx.fillRect(x - w / 2 - 3, y - size * 0.62, w + 6, size * 1.24);
  ctx.restore();
  handNote(ctx, text, x, y, p, size);
}

/** Width of a Hebrew note, to keep it clear of its neighbours. */
function noteWidth(ctx: CanvasRenderingContext2D, p: Palette, text: string, size: number) {
  ctx.save();
  ctx.font = `500 ${size}px ${p.fontHand}`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/**
 * One body drawn at (cx, cy), radius r, turned by `phi` (canvas radians, clockwise positive). The block is a square
 * tilted by `tilt` (the slope's angle, clockwise on screen) whose bottom face sits on the slope.
 */
function drawBody(ctx: CanvasRenderingContext2D, p: Palette, kind: RaceBody, cx: number, cy: number, r: number, phi: number, tilt: number) {
  ctx.save();
  ctx.translate(cx, cy);
  if (kind === 'block') {
    ctx.rotate(tilt);
    ctx.fillStyle = withAlpha(p.equip, 0.55);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.5;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.strokeRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
    return;
  }
  ctx.rotate(phi);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = p.ink;
  if (kind === 'ring') {
    ctx.lineWidth = Math.max(3, r * 0.22);
    ctx.strokeStyle = p.ink2;
    ctx.beginPath();
    ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    // thin spokes, so the turning shows
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.ink3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.lineTo(r * 0.8, 0);
    ctx.stroke();
  } else if (kind === 'disc') {
    ctx.fillStyle = withAlpha(p.equip, 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'hollowSphere') {
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, withAlpha(p.paper, 0.9));
    g.addColorStop(0.75, withAlpha(p.equip, 0.25));
    g.addColorStop(1, withAlpha(p.equip, 0.85));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, withAlpha(p.equip, 0.55));
    g.addColorStop(1, withAlpha(p.ink2, 0.9));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // the spoke: a radius from the centre to the rim, in the accent colour
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -r * 0.92);
  ctx.stroke();
  ctx.restore();
}

/** A curved arrow around (cx, cy) of radius r: clockwise on screen when `cw`. */
function spinArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, cw: boolean, color: string, a0 = -Math.PI * 0.85, a1 = -Math.PI * 0.25) {
  const [from, to] = cw ? [a0, a1] : [a1, a0];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, r, from, to, !cw);
  ctx.stroke();
  ctx.restore();
  // the head, tangent at the end
  const ex = cx + r * Math.cos(to);
  const ey = cy + r * Math.sin(to);
  const tx = cw ? -Math.sin(to) : Math.sin(to);
  const ty = cw ? Math.cos(to) : -Math.cos(to);
  arrow(ctx, ex - tx * 8, ey - ty * 8, ex + tx * 2, ey + ty * 2, { color, width: 1.8, head: 8 });
}

export default function RollingRace(props: RollingRaceProps) {
  const mode = props.mode;
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  const initRace = (): RaceSetup => ({
    theta: clamp(props.theta ?? 20, ...LIM.theta),
    mu: clamp(props.mu ?? 0.5, ...LIM.mu),
    focus: props.focus ?? 'disc',
  });
  const initSkid = (): SkidSetup => ({
    body: props.body ?? 'solidSphere',
    v0: clamp(props.v0 ?? 6, ...LIM.v0),
    w0R: clamp(props.w0R ?? 0, ...LIM.w0R),
    mu: clamp(props.mu ?? 0.15, ...LIM.muK),
  });

  const [race, setRace] = useState<RaceSetup>(initRace);
  const [sk, setSk] = useState<SkidSetup>(initSkid);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  /** what the learner has played: angles (race), μ values with no spin (skid) */
  const playedTheta = useRef(new Set<number>());
  const playedMu = useRef(new Map<string, Set<number>>());

  /* ---------------------------------------------------------------- derived physics */

  const raceInfo = useMemo(() => {
    const th = rad(race.theta);
    const rows = LANES.map((b) => {
      const beta = betaOf(b);
      // the block slides on a frictionless strip; the round bodies feel μ
      const mu = b === 'block' ? 0 : race.mu;
      const m = inclineMotion(beta, th, mu);
      return { body: b, beta, mu, motion: m, tFinish: timeDown(beta, th, mu, TRACK) };
    });
    const tMax = Math.max(...rows.map((r) => r.tFinish));
    // ranks, ties sharing a rank (bodies that slip all have g(sin θ − μ cos θ))
    const sorted = [...rows].sort((a, b) => a.tFinish - b.tFinish);
    const rank = new Map<RaceBody, number>();
    let k = 0;
    sorted.forEach((r, i) => {
      if (i === 0 || r.tFinish > sorted[i - 1].tFinish * (1 + 1e-9)) k = i + 1;
      rank.set(r.body, k);
    });
    return { rows, tMax, rank };
  }, [race.theta, race.mu]);

  const skidInfo = useMemo(() => {
    const beta = BETA[sk.body];
    const sum = skidSummary(sk.v0, sk.w0R / R_SKID, R_SKID, beta, sk.mu);
    const tWin = clamp(Number.isFinite(sum.tRoll) ? Math.max(1.3 * sum.tRoll, sum.tRoll + 0.6, 1) : 4, 1, 30);
    const K0 = kePerMass(sk.v0, sk.w0R / R_SKID, R_SKID, beta);
    return { beta, sum, tWin, K0 };
  }, [sk.body, sk.v0, sk.w0R, sk.mu]);

  const tWindow = mode === 'race' ? raceInfo.tMax : skidInfo.tWin;

  /* ---------------------------------------------------------------- text steps */

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setPlaying(false);
        t0.current = null;
        if (mode === 'race') {
          setRace((prev) => ({
            theta: clamp(num(st.theta) ?? prev.theta, ...LIM.theta),
            mu: clamp(num(st.mu) ?? prev.mu, ...LIM.mu),
            focus: isRaceBody(st.focus) ? st.focus : prev.focus,
          }));
        } else {
          setSk((prev) => ({
            body: isRound(st.body) ? st.body : prev.body,
            v0: clamp(num(st.v0) ?? prev.v0, ...LIM.v0),
            w0R: clamp(num(st.w0R) ?? prev.w0R, ...LIM.w0R),
            mu: clamp(num(st.mu) ?? prev.mu, ...LIM.muK),
          }));
        }
        // a negative t asks for the end of the run (whatever its length)
        const t = num(st.t) ?? 0;
        setTime(t < 0 ? Number.POSITIVE_INFINITY : t);
      }),
    [props.id],
  );

  /* ---------------------------------------------------------------- the learner's handlers */

  const describe = (): string => {
    if (mode === 'race') {
      const f = raceInfo.rows.find((r) => r.body === race.focus);
      if (!f) return '';
      const order = [...raceInfo.rows].sort((a, b) => a.tFinish - b.tFinish).map((r) => NAME[r.body]).join(', ');
      const state = stateOf(f.body, f.motion.rolling);
      return `סדר ההגעה: ${order}. ${NAME[f.body]}: ${state}, תאוצה ${sci(f.motion.a)} מטר לשנייה בריבוע.`;
    }
    const s = skidInfo.sum;
    if (s.u0 === 0) return `הגוף מתגלגל בלי החלקה כבר מההתחלה, במהירות ${signed(sk.v0)} מטר לשנייה, בלי חיכוך.`;
    return `ההחלקה נמשכת ${sci(s.tRoll)} שניות. אחריה הגוף מתגלגל במהירות ${signed(s.vFinal)} מטר לשנייה.`;
  };

  const stop = () => {
    setPlaying(false);
    setTime(Number.POSITIVE_INFINITY);
    setLive(describe());
  };

  const play = () => {
    if (mode === 'race') {
      done('race-run');
      playedTheta.current.add(race.theta);
      if (playedTheta.current.size >= 2) done('steeper-same-order');
      const round = raceInfo.rows.filter((r) => r.body !== 'block');
      if (race.mu > 0 && round.every((r) => !r.motion.rolling)) done('all-slip');
    } else {
      const s = skidInfo.sum;
      if (sk.body === 'solidSphere' && sk.w0R === 0 && sk.v0 > 0) done('no-spin');
      if (sk.w0R === 0 && sk.v0 > 0) {
        const key = `${sk.body}:${sk.v0}`;
        const set = playedMu.current.get(key) ?? new Set<number>();
        set.add(sk.mu);
        playedMu.current.set(key, set);
        if (set.size >= 2) done('mu-free');
      }
      if (sk.v0 > 0 && s.vFinal < -1e-9) done('come-back');
    }
    t0.current = null;
    if (!motionAllowed()) {
      stop();
      return;
    }
    setTime(0);
    setPlaying(true);
    setLive(mode === 'race' ? 'הגופים משתחררים.' : 'הגוף נוחת ומחליק.');
  };

  const changeRace = (patch: Partial<RaceSetup>) => {
    setPlaying(false);
    setTime(0);
    const next = { ...race, ...patch };
    setRace(next);
    const th = rad(next.theta);
    const ringRolls = inclineMotion(BETA.ring, th, next.mu).rolling;
    const sphereRolls = inclineMotion(BETA.solidSphere, th, next.mu).rolling;
    if ((patch.mu !== undefined || patch.theta !== undefined) && !ringRolls && sphereRolls && next.mu > 0) done('ring-slips');
  };

  const changeSkid = (patch: Partial<SkidSetup>) => {
    setPlaying(false);
    setTime(0);
    const next = { ...sk, ...patch };
    setSk(next);
    if ((patch.v0 !== undefined || patch.w0R !== undefined) && next.v0 >= 0.5 && Math.abs(next.v0 - next.w0R) < 0.051) done('no-friction-roll');
  };

  const scrub = (t: number) => {
    setPlaying(false);
    setTime(clamp(t, 0, tWindow));
  };

  /* ---------------------------------------------------------------- drawing */

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    let now = clamp(time, 0, tWindow);
    if (playing) {
      if (t0.current === null) t0.current = t;
      now = Math.min(t - t0.current, tWindow);
      if (now >= tWindow) stop();
    }
    const narrow = view.w < NARROW_W;
    if (mode === 'race') drawRace(ctx, p, view.w, view.h, narrow, now);
    else drawSkid(ctx, p, view.w, view.h, narrow, now);
  };

  function drawRace(ctx: CanvasRenderingContext2D, p: Palette, W: number, H: number, narrow: boolean, now: number) {
    const th = rad(race.theta);
    const c = Math.cos(th);
    const s = Math.sin(th);
    const fs = narrow ? 11 : 13;
    const top: Box = { x: 0, y: 0, w: W, h: H * 0.56 };
    // ---- the lanes: five parallel slopes, each a line from its start (upper left) down to the right
    const r = clamp(Math.min(W, H) * 0.021, 7, 12);
    const gap = 2 * r + 7;
    const nL = LANES.length;
    // the band of lanes: the slope direction u = (c, s) on screen (y down), the outward normal n = (s, −c)
    const labelRoom = narrow ? 70 : 96;
    const extraX = (nL - 1) * gap * s + 2 * r;
    const extraY = (nL - 1) * gap * c + 2 * r + 8;
    const Lpx = Math.max(60, Math.min((top.w - labelRoom - 26 - extraX) / c, (top.h - 52 - extraY) / s));
    // the lowest lane's foot at the bottom right of the band. The lanes above it are lifted along n, which also
    // shifts them right by i·gap·s; that shift is already in extraX, so it is not added to the foot again (it was,
    // and at 390 px the upper lanes' finish ran off the canvas).
    const footX = labelRoom + Lpx * c + 4 + Math.max(0, (top.w - labelRoom - 26 - extraX - Lpx * c) / 2);
    const footY = top.h - 18;
    const ppm = Lpx / TRACK;
    raceInfo.rows.forEach((row, i) => {
      // lane i: lifted along n by i·gap
      const ox = footX - Lpx * c + i * gap * s;
      const oy = footY - Lpx * s - i * gap * c;
      const ex = ox + Lpx * c;
      const ey = oy + Lpx * s;
      ctx.save();
      ctx.strokeStyle = i === 0 ? p.ink : p.ink2;
      ctx.lineWidth = row.body === race.focus ? 2.2 : 1.3;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // the start and finish ticks across the lane
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1;
      for (const [qx, qy] of [
        [ox, oy],
        [ex, ey],
      ]) {
        ctx.beginPath();
        ctx.moveTo(qx - 4 * s, qy + 4 * c);
        ctx.lineTo(qx + (gap - 6) * s, qy - (gap - 6) * c);
        ctx.stroke();
      }
      ctx.restore();
      // the body on its lane
      const st = inclineState(row.beta, th, row.mu, 1, Math.min(now, row.tFinish));
      const d = Math.min(st.x, TRACK) * ppm;
      const cx = ox + d * c + r * s;
      const cy = oy + d * s - r * c;
      // the turned angle on screen: the rim distance it turned, in px, over the drawn radius
      const phiDraw = (st.phi * ppm) / r;
      drawBody(ctx, p, row.body, cx, cy, r, phiDraw, th);
      if (row.body === race.focus) {
        ctx.save();
        ctx.strokeStyle = withAlpha(p.accent, 0.7);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // the name, left of the lane's start
      const nm = NAME[row.body];
      const nsz = narrow ? 11 : 13;
      const nw = noteWidth(ctx, p, nm, nsz);
      patchNote(ctx, p, nm, Math.max(nw / 2 + 4, ox - 10 - nw / 2), oy - r * 0.4, nsz);
      // the rank, past the finish once it has arrived
      if (now >= row.tFinish - 1e-9) {
        label(ctx, p, String(raceInfo.rank.get(row.body) ?? ''), ex + 14 + r * s, ey - r * c - 2, p.accent, fs + 2);
      }
    });
    // the angle at the lowest lane's foot
    {
      const fx = footX;
      const fy = footY;
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx - Lpx * c, fy);
      ctx.lineTo(fx + 8, fy);
      ctx.stroke();
      ctx.strokeStyle = p.ink2;
      ctx.beginPath();
      ctx.arc(fx, fy, 30, Math.PI, Math.PI + th, false);
      ctx.stroke();
      ctx.restore();
      label(ctx, p, `θ = ${race.theta}°`, fx - 36 - 18 * Math.cos(th / 2), fy - 8 - 10 * Math.sin(th / 2), p.ink, fs, 'right');
    }
    patchNote(ctx, p, 'סיום', footX + (nL - 1) * gap * s + 6, footY - (nL - 1) * gap * c - 2 * r - 14, narrow ? 12 : 14);

    // ---- the close-up of the chosen body
    const box: Box = { x: 0, y: top.h, w: W, h: H - top.h };
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.beginPath();
    ctx.moveTo(8, box.y + 2);
    ctx.lineTo(W - 8, box.y + 2);
    ctx.stroke();
    ctx.restore();
    const row = raceInfo.rows.find((q) => q.body === race.focus) ?? raceInfo.rows[0];
    const st = inclineState(row.beta, th, row.mu, 1, Math.min(now, row.tFinish));
    const R = clamp(Math.min(box.h * 0.2, W * 0.11), 22, 46);
    // the contact point, the slope through it, the centre
    const px = box.x + W * (narrow ? 0.56 : 0.6);
    const py = box.y + box.h * 0.64;
    const cx = px + R * s;
    const cy = py - R * c;
    const span = Math.min(W * 0.48, box.h * 1.1);
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px - span * c, py - span * s);
    ctx.lineTo(px + span * c, py + span * s);
    ctx.stroke();
    // hatches under the slope, scrolling with the distance covered (one every 0.1 m of slope at 4 px per cm)
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    const step = 18;
    const shift = (((st.x * 400) % step) + step) % step;
    for (let d = -span + step - shift; d < span; d += step) {
      const hx = px + d * c;
      const hy = py + d * s;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - 7 * s - 5 * c, hy + 7 * c - 5 * s);
      ctx.stroke();
    }
    ctx.restore();
    // the body: turned by its own spin, scaled so that rolling without slipping looks like it (rim arc = distance)
    const phiClose = (st.phi * 400) / R;
    drawBody(ctx, p, row.body, cx, cy, R, phiClose, th);
    // forces, one scale: mg is 1.6 R long
    const k = (1.6 * R) / G;
    const fcol = p.force;
    // weight, at the CM
    arrow(ctx, cx, cy, cx, cy + k * G, { color: fcol, width: 2.4, head: 9 });
    label(ctx, p, 'mg', cx + 8, cy + k * G + 2, fcol, fs + 1, 'left');
    // normal force, at the contact point, out of the slope (screen direction n = (s, −c)), into the body
    const N = G * c;
    const nTipX = px + k * N * s;
    const nTipY = py - k * N * c;
    arrow(ctx, px, py, nTipX, nTipY, { color: fcol, width: 2.4, head: 9 });
    label(ctx, p, 'N', nTipX + 10 * c + 4, nTipY + 10 * s - 6, fcol, fs + 1, 'left');
    // friction, at the contact point, up the slope (screen direction −u)
    const f = row.motion.fPerMass;
    if (row.body !== 'block' && f > 1e-9) {
      // never shorter than reaches past the body's rim, so the arrow reads as one
      const fl = Math.max(k * f, 0.8 * R);
      const tx = px - fl * c;
      const ty = py - fl * s;
      arrow(ctx, px, py, tx, ty, { color: fcol, width: 2.4, head: 9 });
      label(ctx, p, row.motion.rolling ? 'fₛ' : 'fₖ', tx - 12 * c + 10 * s, ty - 12 * s - 10 * c, fcol, fs + 1);
    }
    // acceleration of the CM, down the slope, ahead of the body at the height of its centre (clear of the gauge)
    if (row.motion.a > 1e-9) {
      const ax = cx + (R + 10) * c;
      const ay = cy + (R + 10) * s;
      const al = Math.max(16, Math.min(18 + 8 * row.motion.a, (W - 26 - ax) / c));
      arrow(ctx, ax, ay, ax + al * c, ay + al * s, { color: p.accel, width: 2, head: 8 });
      label(ctx, p, 'a', ax + (al / 2) * c + 11 * s, ay + (al / 2) * s - 11 * c, p.accel, fs);
    }
    // angular acceleration (rolling sense: clockwise on screen)
    if (row.body !== 'block' && row.motion.alphaR > 1e-9) {
      // on the upper left of the body, clear of N (upper right), mg (down) and the friction (lower left)
      spinArrow(ctx, cx, cy, R * 0.6, true, p.accel, -Math.PI * 0.98, -Math.PI * 0.62);
      label(ctx, p, 'α', cx + (R * 0.6 + 12) * Math.cos(-Math.PI * 0.8), cy + (R * 0.6 + 12) * Math.sin(-Math.PI * 0.8), p.accel, fs);
    }
    // the slip of the contact point (rolling with slipping): an arrow down the slope beside the contact
    if (row.body !== 'block' && !row.motion.rolling && st.u > 1e-6) {
      // a velocity, not a force: drawn just under the slope from below the contact point, down the slope
      const ul = Math.max(R, Math.min(70, 14 * st.u));
      // centred on the contact point along the slope, 14 px under it
      const ux0 = px - 14 * s - (ul / 2) * c;
      const uy0 = py + 14 * c - (ul / 2) * s;
      arrow(ctx, ux0, uy0, ux0 + ul * c, uy0 + ul * s, { color: p.velocity, width: 1.8, head: 7 });
      label(ctx, p, 'u', ux0 + (ul + 9) * c - 4 * s, uy0 + (ul + 9) * s + 6 * c, p.velocity, fs);
    }
    // the gauge: the friction rolling needs against the most μN the slope gives
    // top right of the close-up, where the slope (falling to the right) leaves room
    const gw = Math.min(W * 0.38, 200);
    const gx = W - gw - 14;
    const gy = box.y + 22;
    const gh = 11;
    const need = (row.beta / (1 + row.beta)) * G * s;
    const most = row.mu * N;
    const full = Math.max(G * 0.6 * 0.92, need, most) * 1.08;
    const X = (v: number) => gx + (v / full) * gw;
    ctx.save();
    if (row.body !== 'block') {
      ctx.strokeStyle = p.rule;
      ctx.strokeRect(gx, gy, gw, gh);
      ctx.fillStyle = withAlpha(p.force, 0.75);
      ctx.fillRect(gx, gy, X(f) - gx, gh);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(most), gy - 4);
      ctx.lineTo(X(most), gy + gh + 4);
      ctx.stroke();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = p.hand;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(X(need), gy - 6);
      ctx.lineTo(X(need), gy + gh + 6);
      ctx.stroke();
    }
    ctx.restore();
    if (row.body !== 'block') {
      label(ctx, p, 'μN', X(most), gy + gh + 13, p.ink, fs - 1);
      // the friction's name at the bar's start: the fill is f
      label(ctx, p, 'f', gx - 5, gy + gh / 2, p.force, fs, 'right');
      // the needed friction, marked above the bar (Hebrew)
      const nsz = narrow ? 11 : 13;
      const nw = noteWidth(ctx, p, 'הדרוש לגלגול', nsz);
      handNote(ctx, 'הדרוש לגלגול', clamp(X(need), gx + nw / 2, W - nw / 2 - 4), gy - 14, p, nsz);
    }
    patchNote(ctx, p, `${NAME[row.body]}: ${stateOf(row.body, row.motion.rolling)}`, narrow ? W * 0.3 : W * 0.25, box.y + 18, narrow ? 13 : 15);
  }

  function drawSkid(ctx: CanvasRenderingContext2D, p: Palette, W: number, H: number, narrow: boolean, now: number) {
    const fs = narrow ? 11 : 13;
    const beta = skidInfo.beta;
    const st = skid(sk.v0, sk.w0R / R_SKID, R_SKID, beta, sk.mu, now);
    const sceneH = H * 0.42;
    const floorY = sceneH - 40;
    const r = clamp(sceneH * 0.17, 16, 30);
    // the camera: 1 m is W/7 px, the body near the middle
    const ppm = W / 7;
    const camX = st.x;
    const bodyX = W * 0.5;
    const sx = (x: number) => bodyX + (x - camX) * ppm;
    // floor, metre marks and the landing flag
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(6, floorY);
    ctx.lineTo(W - 6, floorY);
    ctx.stroke();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    ctx.font = `11px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const first = Math.floor(camX - 4);
    for (let m = first; m <= camX + 4; m++) {
      const X = sx(m);
      if (X < 4 || X > W - 4) continue;
      ctx.beginPath();
      ctx.moveTo(X, floorY);
      ctx.lineTo(X, floorY + 7);
      ctx.stroke();
      ctx.fillText(`${m} m`, X, floorY + 24);
    }
    ctx.restore();
    const flagX = sx(0);
    if (flagX > -10 && flagX < W + 10) {
      ctx.save();
      ctx.strokeStyle = p.hand;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(flagX, floorY);
      ctx.lineTo(flagX, floorY - 2.4 * r);
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.hand, 0.6);
      ctx.beginPath();
      ctx.moveTo(flagX, floorY - 2.4 * r);
      ctx.lineTo(flagX + 14, floorY - 2.4 * r + 6);
      ctx.lineTo(flagX, floorY - 2.4 * r + 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // the body
    const cx = bodyX;
    const cy = floorY - r;
    const phiDraw = (st.phi * R_SKID * ppm) / r;
    drawBody(ctx, p, sk.body, cx, cy, r, phiDraw, 0);
    // velocity of the CM (above the body)
    const vScale = Math.min(10, (W * 0.18) / 4);
    // the same threshold as the v readout (5e-3 m/s): at the turning point the readout says 0, so draw no arrow
    if (Math.abs(st.v) > 5e-3) {
      const vl = Math.sign(st.v) * Math.max(14, Math.abs(st.v) * vScale);
      arrow(ctx, cx, cy - r - 12, cx + vl, cy - r - 12, { color: p.velocity, width: 2.2, head: 8 });
      label(ctx, p, 'v', cx + vl + 9 * Math.sign(vl), cy - r - 12, p.velocity, fs + 1);
    }
    // the spin sense
    if (Math.abs(st.omega) > 1e-6) {
      spinArrow(ctx, cx, cy, r + 7, st.omega > 0, p.accent);
      label(ctx, p, 'ω', cx + (r + 16) * (st.omega > 0 ? 1 : -1), cy - r - 2, p.accent, fs);
    }
    // the slip velocity of the contact point and the kinetic friction, both at the contact point
    if (!st.rolling && Math.abs(st.u) > 1e-6) {
      // the slip velocity, a velocity of the contact point, just under the floor; the friction along the floor from
      // the contact point, long enough to reach past the body's rim, its label past the tip
      const ul = Math.sign(st.u) * Math.max(r + 8, Math.min(W * 0.3, Math.abs(st.u) * vScale * 0.8));
      arrow(ctx, cx, floorY + 9, cx + ul, floorY + 9, { color: p.velocity, width: 1.6, head: 7, alpha: 0.9 });
      label(ctx, p, 'u', cx + ul + 9 * Math.sign(ul), floorY + 9, p.velocity, fs);
      const fl = -Math.sign(st.u) * (r + 14);
      arrow(ctx, cx, floorY - 1, cx + fl, floorY - 1, { color: p.force, width: 2.4, head: 9 });
      label(ctx, p, 'fₖ', cx + fl + 12 * Math.sign(fl), floorY - 9, p.force, fs + 1);
    }
    patchNote(ctx, p, st.rolling ? 'גלגול בלי החלקה' : 'גלגול עם החלקה', narrow ? W * 0.24 : W * 0.2, 20, narrow ? 13 : 15);

    // ---- the graph: v, ωR and u against t
    const outer: Box = { x: 4, y: sceneH + 4, w: W - 8, h: H - sceneH - 8 };
    const pb = insetBox(outer, { l: 46, r: 12, t: 22, b: 40 });
    const s0 = skidInfo.sum;
    const vals = [sk.v0, sk.w0R, s0.vFinal, sk.v0 - sk.w0R, 0];
    const yMax = Math.max(...vals) * 1.12 + 0.2;
    const yMin = Math.min(...vals) * 1.12 - 0.2;
    const tWin = skidInfo.tWin;
    const plot = makePlot(pb, { min: 0, max: tWin, label: 'הזמן t (s)', ticks: niceTicks(0, tWin, narrow ? 4 : 6) }, { min: yMin, max: yMax, label: 'מהירות (m/s)', ticks: niceTicks(yMin, yMax, 5) });
    drawAxes(ctx, plot, p);
    // the zero line
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pb.x, plot.py(0));
    ctx.lineTo(pb.x + pb.w, plot.py(0));
    ctx.stroke();
    ctx.restore();
    const curve = (f: (t: number) => number, color: string, width: number, dash: number[], upTo: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(pb.x, pb.y - 2, pb.w, pb.h + 4);
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const n = 240;
      for (let i = 0; i <= n; i++) {
        const t = (upTo * i) / n;
        const X = plot.px(t);
        const Y = plot.py(f(t));
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      ctx.restore();
    };
    const at = (t: number) => skid(sk.v0, sk.w0R / R_SKID, R_SKID, beta, sk.mu, t);
    // the whole run faint, the part that has happened bold
    curve((t) => at(t).v, withAlpha(p.velocity, 0.3), 1.4, [], tWin);
    curve((t) => at(t).omega * R_SKID, withAlpha(p.accent, 0.3), 1.4, [], tWin);
    curve((t) => at(t).u, withAlpha(p.ink, 0.25), 1.4, [5, 4], tWin);
    if (now > 0) {
      curve((t) => at(t).v, p.velocity, 2.6, [], now);
      curve((t) => at(t).omega * R_SKID, p.accent, 2.6, [], now);
      curve((t) => at(t).u, p.ink, 2, [5, 4], now);
    }
    // labels at the right end of each curve
    const endT = tWin;
    const e = at(endT);
    const lx = plot.px(endT) - 4;
    const ys = [
      { y: plot.py(e.v), t: 'v', c: p.velocity },
      { y: plot.py(e.omega * R_SKID), t: 'ωR', c: p.accent },
      { y: plot.py(e.u), t: 'u', c: p.ink },
    ];
    // the rolling v and ωR coincide: spread the labels apart vertically
    ys.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ys.length; i++) if (ys[i].y - ys[i - 1].y < 14) ys[i].y = ys[i - 1].y + 14;
    for (const q of ys) label(ctx, p, q.t, lx, q.y - 9, q.c, fs, 'right');
    // the moment rolling starts
    if (Number.isFinite(s0.tRoll) && s0.tRoll > 0 && s0.tRoll < tWin) {
      const X = plot.px(s0.tRoll);
      ctx.save();
      ctx.strokeStyle = p.hand;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(X, pb.y);
      ctx.lineTo(X, pb.y + pb.h);
      ctx.stroke();
      ctx.restore();
      const nt = 'מתחיל להתגלגל';
      const nsz = narrow ? 11 : 13;
      const w = noteWidth(ctx, p, nt, nsz);
      patchNote(ctx, p, nt, clamp(X, pb.x + w / 2 + 2, pb.x + pb.w - w / 2 - 2), pb.y - 10, nsz);
    }
    // now
    ctx.save();
    ctx.fillStyle = p.velocity;
    ctx.beginPath();
    ctx.arc(plot.px(now), plot.py(st.v), 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(plot.px(now), plot.py(st.omega * R_SKID), 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: playing });
  useEffect(invalidate, [race, sk, time, playing, raceInfo, skidInfo]);

  const [narrowStage, setNarrowStage] = useState(false);
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
  useEffect(invalidate, [narrowStage]);
  const aspect = mode === 'race' ? (narrowStage ? 0.68 : 1.05) : narrowStage ? 0.82 : 1.25;

  /* ---------------------------------------------------------------- readouts and controls */

  const shown = clamp(time, 0, tWindow);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') play();
    else if (mode === 'race' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) changeRace({ theta: clamp(race.theta + (e.key === 'ArrowUp' ? 1 : -1), ...LIM.theta) });
    else if (mode === 'race' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) changeRace({ mu: clamp(roundTo(race.mu + (e.key === 'ArrowRight' ? 0.01 : -0.01), 0.01), ...LIM.mu) });
    else if (mode === 'skid' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) changeSkid({ w0R: clamp(roundTo(sk.w0R + (e.key === 'ArrowRight' ? 0.5 : -0.5), 0.1), ...LIM.w0R) });
    else return;
    e.preventDefault();
  };

  const reset = () => {
    setRace(initRace());
    setSk(initSkid());
    setPlaying(false);
    setTime(0);
    t0.current = null;
    setLive('האיור חזר למצב ההתחלה.');
  };

  if (mode === 'race') {
    const f = raceInfo.rows.find((q) => q.body === race.focus) ?? raceInfo.rows[0];
    const figLabel = `איור חי: מרוץ של טבעת, דסקה, קליפה כדורית, כדור מלא וקובייה במורד מדרון בזווית ${race.theta} מעלות, עם מקדם חיכוך ${sci(race.mu)}. ${describe()} במקלדת: חצים למעלה ולמטה משנים את הזווית, ימינה ושמאלה את מקדם החיכוך, Enter משחרר.`;
    return (
      <SimShell
        fig={props.id}
        label={figLabel}
        canvasRef={canvasRef}
        aspect={aspect}
        live={live}
        tasks={tasks}
        onKeyDown={onKeyDown}
        onReset={reset}
        readout={
          <>
            <span class="q" data-readout="a">
              a = <b>{signed(f.motion.a)} m/s²</b>
            </span>
            <span class="q" data-readout="f">
              f/(mg) = <b>{f.body === 'block' ? '0' : signed(f.motion.fPerMass / G)}</b>
            </span>
            <span class="q" data-readout="mumin">
              μ<sub>min</sub> = <b>{signed(f.motion.muMin)}</b>
            </span>
            <span class="q" data-readout="tfinish">
              <bdi>זמן ירידה</bdi> = <b>{signed(f.tFinish)} s</b>
            </span>
            <span data-readout="state">{stateOf(f.body, f.motion.rolling)}</span>
            <span class="q" data-readout="t">
              t = <b>{signed(shown)} s</b>
            </span>
          </>
        }
        controls={
          <>
            <Slider label="זווית המדרון θ" value={race.theta} min={LIM.theta[0]} max={LIM.theta[1]} step={1} format={(d) => `${d}°`} onChange={(d) => changeRace({ theta: clamp(Math.round(d), ...LIM.theta) })} />
            <Slider label="מקדם החיכוך μ" value={race.mu} min={LIM.mu[0]} max={LIM.mu[1]} step={0.01} format={(v) => signed(v)} onChange={(v) => changeRace({ mu: clamp(roundTo(v, 0.01), ...LIM.mu) })} />
            <div class="group" role="group" aria-label="הגוף בתקריב">
              {(['ring', 'disc', 'hollowSphere', 'solidSphere', 'block'] as RaceBody[]).map((b) => (
                <Toggle key={b} label={NAME[b]} on={race.focus === b} onChange={() => setRace((s) => ({ ...s, focus: b }))} />
              ))}
            </div>
            <Slider label="זמן" value={Number(shown.toPrecision(3))} min={0} max={Number(tWindow.toPrecision(3))} step={0.01} format={(x) => `${sci(x)} s`} onChange={scrub} />
            <div class="group" role="group" aria-label="הפעלה">
              <button type="button" class="btn primary" onClick={play}>
                שחררו
              </button>
            </div>
          </>
        }
      />
    );
  }

  const s0 = skidInfo.sum;
  const sNow = skid(sk.v0, sk.w0R / R_SKID, R_SKID, skidInfo.beta, sk.mu, shown);
  const kFrac = skidInfo.K0 > 0 ? kePerMass(s0.vFinal, s0.omegaFinal, R_SKID, skidInfo.beta) / skidInfo.K0 : 1;
  const figLabel = `איור חי: ${NAME[sk.body]} נוחת על רצפה אופקית במהירות ${signed(sk.v0)} מטר לשנייה, עם סיבוב התחלתי שמהירות השפה שלו ${signed(sk.w0R)} מטר לשנייה, ומקדם חיכוך קינטי ${sci(sk.mu)}. מתחת לו גרף של המהירות, של ωR ושל מהירות ההחלקה מול הזמן. ${describe()} במקלדת: חצים ימינה ושמאלה משנים את הסיבוב, Enter מפעיל.`;
  return (
    <SimShell
      fig={props.id}
      label={figLabel}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onReset={reset}
      readout={
        <>
          <span class="q" data-readout="troll">
            t<sub>roll</sub> = <b>{signed(s0.tRoll)} s</b>
          </span>
          <span class="q" data-readout="xroll">
            x<sub>roll</sub> = <b>{signed(s0.distance)} m</b>
          </span>
          <span class="q" data-readout="vf">
            v<sub>f</sub> = <b>{signed(s0.vFinal)} m/s</b>
          </span>
          <span class="q" data-readout="kfrac">
            K<sub>f</sub>/K<sub>0</sub> = <b>{signed(kFrac)}</b>
          </span>
          <span class="q" data-readout="t">
            t = <b>{signed(shown)} s</b>
          </span>
          <span class="q" data-readout="v">
            v = <b>{signed(sNow.v, 5e-3)} m/s</b>
          </span>
          <span class="q" data-readout="wR">
            ωR = <b>{signed(sNow.omega * R_SKID, 5e-3)} m/s</b>
          </span>
          <span class="q" data-readout="u">
            u = <b>{signed(sNow.u, 5e-3)} m/s</b>
          </span>
          <span class="q" data-readout="x">
            x = <b>{signed(sNow.x, 5e-3)} m</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="הגוף">
            {(['solidSphere', 'hollowSphere', 'disc', 'ring'] as RoundBody[]).map((b) => (
              <Toggle key={b} label={NAME[b]} on={sk.body === b} onChange={() => changeSkid({ body: b })} />
            ))}
          </div>
          <Slider label="המהירות בנחיתה v₀" value={sk.v0} min={LIM.v0[0]} max={LIM.v0[1]} step={0.1} format={(v) => `${signed(v)} m/s`} onChange={(v) => changeSkid({ v0: clamp(roundTo(v, 0.1), ...LIM.v0) })} />
          <Slider label="הסיבוב בנחיתה Rω₀ (חיובי: בכיוון הגלגול)" value={sk.w0R} min={LIM.w0R[0]} max={LIM.w0R[1]} step={0.1} format={(v) => `${signed(v)} m/s`} onChange={(v) => changeSkid({ w0R: clamp(roundTo(v, 0.1), ...LIM.w0R) })} />
          <Slider label="מקדם החיכוך הקינטי μₖ" value={sk.mu} min={LIM.muK[0]} max={LIM.muK[1]} step={0.01} format={(v) => signed(v)} onChange={(v) => changeSkid({ mu: clamp(roundTo(v, 0.01), ...LIM.muK) })} />
          <Slider label="זמן" value={Number(shown.toPrecision(3))} min={0} max={Number(tWindow.toPrecision(3))} step={0.01} format={(x) => `${sci(x)} s`} onChange={scrub} />
          <div class="group" role="group" aria-label="הפעלה">
            <button type="button" class="btn primary" onClick={play}>
              הפעלה
            </button>
          </div>
        </>
      }
    />
  );
}
