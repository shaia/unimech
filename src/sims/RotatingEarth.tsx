/**
 * RotatingEarth (lesson 7.4): the rotating Earth seen in its own frame, in three views.
 *
 * 'meridian': a cross-section of the Earth through its axis, with a point at latitude λ and, beside it (below it
 *   on a narrow screen), a close view of that point turned so that the radius points up: the gravitational
 *   acceleration g toward the centre, the centrifugal acceleration ω²R cos λ away from the axis (a fictitious
 *   force per unit mass, dashed), their sum g_eff, and a plumb line along g_eff beside the dashed radius, the
 *   angle α between them marked. The real α is at most about 0.1°, so the learner may multiply ω by k (1–15);
 *   the readout then says, in words, that ω is exaggerated, by how much, and gives both angles.
 * 'foucault': the floor under a Foucault pendulum seen from above (north up, east right). The swing plane turns at
 *   −ω sin λ (`foucaultPlaneAngle`), a faint line for every hour that has passed. The close-up integrates a 20 m
 *   pendulum in the Earth's frame (`foucaultStep`) with ω exaggerated ×200 and shows the Coriolis push to the
 *   right of the velocity on every swing.
 * 'cyclone': parcels of air released at rest around a low (or water around a drain), integrated with a fixed
 *   pressure push toward the centre, the horizontal Coriolis acceleration at the real ω and linear friction
 *   (`parcelPath`).
 *
 * Tasks tick only inside the learner's own handlers (sliders, buttons); a text step sets the state and never
 * ticks a task, so scrolling through the text completes nothing.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G, OMEGA_EARTH, R_EARTH } from '~/physics/constants';
import {
  coriolisTurnRate,
  foucaultPlaneAngle,
  foucaultStep,
  horizontalCoriolisAccel,
  parcelPath,
  verticalOmega,
  type ParcelField,
  type Planar,
} from '~/physics/earthrot';
import { effectiveGravityMagnitude, foucaultPeriod, plumbDeviation } from '~/physics/rotating';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type ViewId = 'meridian' | 'foucault' | 'cyclone';
export type FlowId = 'low' | 'sink';

const DEG = Math.PI / 180;
const K_MAX = 15;
/** the close-up's pendulum: length [m], amplitude [m], exaggeration of ω */
const PEND_L = 20;
const PEND_A = 1;
const CLOSE_K = 200;
const CLOSE_SWINGS = 24;
const W0 = Math.sqrt(G / PEND_L);
const T0 = (2 * Math.PI) / W0;
const HOURS_MAX = 48;

/** the parcel models: half-width of the view [m], start radius, duration [s], push, core, friction */
const FLOWS: Record<FlowId, { half: number; r0: number; tEnd: number; aP: number; rCore: number; k: number; label: string }> = {
  low: { half: 5e5, r0: 4e5, tEnd: 3 * 86400, aP: 1e-3, rCore: 5e4, k: 3e-5, label: 'סופה' },
  sink: { half: 0.25, r0: 0.2, tEnd: 10, aP: 0.05, rCore: 0.02, k: 0.3, label: 'כיור' },
};

/** A quantity isolated as LTR (U+2066 … U+2069), with no-break spaces inside. */
const ltr = (s: string) => String.fromCharCode(0x2066) + s.replace(/ /g, String.fromCharCode(0xa0)) + String.fromCharCode(0x2069);

const TASK_LABEL: Record<string, string> = {
  exaggerate: `הגדילו את ${ltr('ω')} עד שהנטייה של האנך נראית לעין. לאיזה צד זזה המשקולת: אל הקוטב או אל קו המשווה?`,
  ends: 'הביאו את הנקודה לקו המשווה ואחר כך לקוטב. איפה תאוצת הנפילה האפקטיבית הכי קטנה, ואיפה האנך מצביע בדיוק אל המרכז?',
  'max-lat': 'חפשו את קו הרוחב שבו האנך נוטה הכי הרבה מהקו אל המרכז.',
  pole: `קבעו קו רוחב ${ltr('90°')} והריצו את הזמן יממה שלמה. בכמה הסתובב מישור התנודה?`,
  equator: 'עכשיו בקו המשווה: הריצו את הזמן. האם המישור מסתובב?',
  south: 'עברו לחצי הכדור הדרומי והריצו את הזמן. לאיזה כיוון מסתובב המישור עכשיו?',
  closeup: 'פתחו את המבט מקרוב ועקבו אחרי כמה תנודות. לאיזה צד של המהירות פונה כוח קוריוליס?',
  north: 'בחצי הכדור הצפוני: שחררו את האוויר. לאיזה כיוון הוא מקיף את הלחץ הנמוך?',
  'south-flow': 'עברו לחצי הכדור הדרומי ושחררו שוב.',
  sink: `בחרו "כיור" ושחררו. כמה הסיט כוח קוריוליס את המים?`,
};

export interface RotatingEarthProps {
  id: string;
  view: ViewId;
  /** latitude [°] */
  lat?: number;
  /** meridian: ω is shown multiplied by k */
  k?: number;
  /** foucault: hours since the release */
  hours?: number;
  /** foucault: the integrated close-up */
  closeup?: boolean;
  /** cyclone: the flow */
  flow?: FlowId;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const isFlow = (x: unknown): x is FlowId => x === 'low' || x === 'sink';
const minus = (s: string) => s.replace('-', '−');

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

/** Hebrew handwriting with a paper halo, so it stays legible over lines. */
function haloNote(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, size: number, color?: string) {
  ctx.save();
  ctx.font = `500 ${size}px ${p.fontHand}`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = withAlpha(p.paper, 0.92);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color ?? p.hand;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Screen angle of a world vector (y up). */
const scrAngle = (v: readonly [number, number]) => Math.atan2(-v[1], v[0]);

/** An arc at (x, y) from direction a to direction b (world vectors), the short way, optionally with a head at b. */
function angleArc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: readonly [number, number], b: readonly [number, number], color: string, head = false) {
  const a1 = scrAngle(a);
  let d = scrAngle(b) - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, a1, a1 + d, d < 0);
  ctx.stroke();
  ctx.restore();
  if (head && Math.abs(d) > 0.08) {
    const e = a1 + d;
    const ex = x + r * Math.cos(e);
    const ey = y + r * Math.sin(e);
    // the tangent in the sense of travel
    const s = d > 0 ? 1 : -1;
    const tx = -Math.sin(e) * s;
    const ty = Math.cos(e) * s;
    arrow(ctx, ex - tx * 10, ey - ty * 10, ex, ey, { color, width: 1.5, head: 8 });
  }
}

function dot(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number, fill: string) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function dashed(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 1.2, dash: number[] = [5, 4]) {
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

/** Sense of a rotation rate seen from above: positive = counter-clockwise. */
const senseHe = (rate: number, tiny = 1e-15) => (Math.abs(rate) <= tiny ? 'לא מסתובב' : rate > 0 ? 'נגד כיוון השעון' : 'עם כיוון השעון');

/** The angle swept about the origin along a path [rad], counter-clockwise positive. */
function swept(path: Planar[]): number {
  let a = 0;
  for (let i = 1; i < path.length; i++) {
    let d = Math.atan2(path[i].y, path[i].x) - Math.atan2(path[i - 1].y, path[i - 1].x);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    a += d;
  }
  return a;
}

/** The close-up swing, integrated in the Earth's frame with ω exaggerated: samples every T0/120. */
function closeTrace(latDeg: number): { t: number; s: Planar }[] {
  const wz = verticalOmega(CLOSE_K * OMEGA_EARTH, latDeg * DEG);
  const per = 120;
  const sub = 4;
  const dt = T0 / per / sub;
  // released from rest on the north–south line, at its north end
  let s: Planar = { x: 0, y: PEND_A, vx: 0, vy: 0 };
  const out: { t: number; s: Planar }[] = [{ t: 0, s }];
  for (let i = 1; i <= CLOSE_SWINGS * per; i++) {
    for (let j = 0; j < sub; j++) s = foucaultStep(s, W0, wz, dt);
    out.push({ t: (i * T0) / per, s });
  }
  return out;
}

/** Eight parcels released at rest around the centre. */
function flowPaths(flow: FlowId, latDeg: number): Planar[][] {
  const F = FLOWS[flow];
  const field: ParcelField = { aP: F.aP, sense: 1, rCore: F.rCore, wz: verticalOmega(OMEGA_EARTH, latDeg * DEG), k: F.k };
  const out: Planar[][] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    out.push(parcelPath({ x: F.r0 * Math.cos(a), y: F.r0 * Math.sin(a), vx: 0, vy: 0 }, field, F.tEnd, 240));
  }
  return out;
}

export default function RotatingEarth(props: RotatingEarthProps) {
  const view = props.view;
  const latMin = -90;
  const initLat = () => clamp(Math.round(props.lat ?? (view === 'meridian' ? 40 : 60)), latMin, 90);

  const [lat, setLat] = useState<number>(initLat);
  const [k, setK] = useState<number>(clamp(Math.round(props.k ?? 1), 1, K_MAX));
  const [hours, setHours] = useState<number>(clamp(props.hours ?? 0, 0, HOURS_MAX));
  const [closeup, setCloseup] = useState<boolean>(props.closeup ?? false);
  const [flow, setFlow] = useState<FlowId>(props.flow ?? 'low');
  /** cyclone: how much of the paths is shown, 0 (released) to 1 (the end) */
  const [shown, setShown] = useState<number>(0);
  /** an animation in progress: what it animates and when it began */
  const [playing, setPlaying] = useState<null | { kind: 'hours' | 'close' | 'flow'; from: number }>(null);
  const [live, setLive] = useState('');
  const t0 = useRef<number | null>(null);
  const visited = useRef<{ equator: boolean; pole: boolean }>({ equator: false, pole: false });
  /** close-up: the time [s] reached when nothing is moving */
  const [closeT, setCloseT] = useState<number>(0);

  const la = lat * DEG;
  const wk = k * OMEGA_EARTH;
  /** the plumb line's lean [rad]; rounding noise at the poles (cos 90° ≠ 0 in floating point) reads as 0 */
  const lean = (w: number) => {
    const a = Math.abs(plumbDeviation(G, w, R_EARTH, la));
    return a < 1e-12 ? 0 : a;
  };
  const alphaReal = lean(OMEGA_EARTH);
  const alphaShown = lean(wk);
  const geffReal = effectiveGravityMagnitude(G, OMEGA_EARTH, R_EARTH, la);
  const cfReal = Math.abs(lat) === 90 ? 0 : OMEGA_EARTH * OMEGA_EARTH * R_EARTH * Math.cos(la);
  /** ω sin λ in degrees per hour: the plane turns clockwise (seen from above) when it is positive */
  const rateDegH = -foucaultPlaneAngle(OMEGA_EARTH, la, 3600) / DEG;
  const periodH = foucaultPeriod(OMEGA_EARTH, la) / 3600;

  const close = useMemo(() => (view === 'foucault' ? closeTrace(lat) : []), [view, lat]);
  const paths = useMemo(() => (view === 'cyclone' ? flowPaths(flow, lat) : []), [view, flow, lat]);

  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the latitude, ω's factor, the hour, the close-up and the flow; they never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setPlaying(null);
        t0.current = null;
        const l = num(st.lat);
        if (l !== null) setLat(clamp(Math.round(l), latMin, 90));
        const kk = num(st.k);
        if (kk !== null) setK(clamp(Math.round(kk), 1, K_MAX));
        const hh = num(st.hours);
        setHours(hh !== null ? clamp(hh, 0, HOURS_MAX) : 0);
        const c = bool(st.closeup);
        if (c !== null) setCloseup(c);
        // the end of the close-up, a third of a swing early: the bob is halfway out and still fast
        setCloseT(st.closeEnd === true ? (CLOSE_SWINGS - 1 / 3) * T0 : 0);
        if (isFlow(st.flow)) setFlow(st.flow);
        setShown(st.end === true ? 1 : 0);
      }),
    [props.id],
  );

  /* ---------------------------------------------------------------- drawing */

  const drawMeridian = (ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette) => {
    const narrow = w < 560;
    const fs = narrow ? 11 : 12;
    const ex = narrow ? w / 2 : 0.24 * w;
    const ey = narrow ? 0.235 * h : h / 2;
    const Re = narrow ? Math.min(0.34 * w, 0.17 * h) : Math.min(0.18 * w, 0.36 * h);
    const box = narrow ? { x: 0.04 * w, y: 0.47 * h, w: 0.92 * w, h: 0.51 * h } : { x: 0.5 * w, y: 0.05 * h, w: 0.47 * w, h: 0.9 * h };

    // the Earth: the axis (north up), the equator, the point P at latitude λ on the right-hand side
    ctx.save();
    ctx.fillStyle = p.paper2;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(ex, ey, Re, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    dashed(ctx, ex, ey - Re - 18, ex, ey + Re + 10, p.ink2, 1.1, [4, 4]);
    dashed(ctx, ex - Re, ey, ex + Re, ey, p.ink3, 1, [3, 4]);
    arrow(ctx, ex, ey - Re - 4, ex, ey - Re - 30, { color: p.ink, width: 2, head: 8 });
    haloText(ctx, p, 'ω', ex + 12, ey - Re - 24, { font: `italic 700 ${fs + 3}px ${p.fontUi}`, color: p.ink });
    haloNote(ctx, p, 'צפון', ex - 26, ey - Re - 12, fs + 2);
    haloNote(ctx, p, 'קו המשווה', ex - Re * 0.5, ey + 12, fs + 1);
    const px = ex + Re * Math.cos(la);
    const py = ey - Re * Math.sin(la);
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.restore();
    // the distance from the axis, R cos λ
    dashed(ctx, ex, py, px, py, p.ink2, 1.2, [2, 3]);
    if (Math.abs(lat) < 88) haloText(ctx, p, 'R cos λ', (ex + px) / 2, py + (lat >= 0 ? -10 : 10), { font: `italic ${fs}px ${p.fontUi}`, color: p.ink2 });
    if (Math.abs(lat) > 3) {
      angleArc(ctx, ex, ey, Re * 0.28, [1, 0], [Math.cos(la), Math.sin(la)], p.ink2);
      const mid = la / 2;
      haloText(ctx, p, 'λ', ex + Re * 0.4 * Math.cos(mid), ey - Re * 0.4 * Math.sin(mid), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.ink });
    }
    dot(ctx, p, ex, ey, 3, p.ink);
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    dot(ctx, p, px, py, 3.5, p.accent);
    // the lens: from P to the close view
    const lx = narrow ? box.x + box.w / 2 : box.x;
    const ly = narrow ? box.y : box.y + box.h / 2;
    dashed(ctx, px, py, lx, ly, withAlpha(p.accent, 0.7), 1.2, [3, 4]);

    // the close view: the radius points up; north to the left, south to the right
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.restore();
    const cx = box.x + box.w / 2;
    const L = Math.min(box.h * 0.36, box.w * 0.42);
    const bobY = box.y + box.h * 0.47;
    const bob: [number, number] = [cx, bobY];
    const cfMag = k * k * OMEGA_EARTH * OMEGA_EARTH * R_EARTH * Math.cos(la); // [m/s²], shown
    const cf: [number, number] = [cfMag * Math.sin(la), cfMag * Math.cos(la)]; // (south, up)
    const ge: [number, number] = [cf[0], -G + cf[1]];
    const geLen = Math.hypot(ge[0], ge[1]);
    const ghat: [number, number] = [ge[0] / geLen, ge[1] / geLen];
    const scale = L / G; // px per m/s²
    // the ground: the sphere's surface, perpendicular to the radius
    const groundY = box.y + box.h * 0.9;
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(box.x + 14, groundY);
    ctx.lineTo(box.x + box.w - 14, groundY);
    ctx.stroke();
    ctx.restore();
    haloNote(ctx, p, 'צפון', box.x + 34, groundY - 13, fs + 1);
    haloNote(ctx, p, 'דרום', box.x + box.w - 34, groundY - 13, fs + 1);
    // the plumb line: from the suspension point S along g_eff to the bob, and the radius through S, dashed
    const sus: [number, number] = [bob[0] - ghat[0] * L * 0.95, bob[1] + ghat[1] * L * 0.95];
    dashed(ctx, sus[0], sus[1], sus[0], groundY, p.ink2, 1.2, [5, 4]);
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sus[0] - 18, sus[1]);
    ctx.lineTo(sus[0] + 18, sus[1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sus[0], sus[1]);
    ctx.lineTo(bob[0], bob[1]);
    ctx.stroke();
    ctx.restore();
    // α between the radius (down) and the string
    const aDeg = alphaShown / DEG;
    if (aDeg > 1.5) angleArc(ctx, sus[0], sus[1], L * 0.42, [0, -1], ghat, p.ink2);
    haloText(ctx, p, 'α', sus[0] + (ghat[0] >= 0 ? 1 : -1) * Math.max(14, L * 0.42 * Math.sin(alphaShown / 2) + 10), sus[1] + L * 0.42 + 4, { font: `italic 700 ${fs + 2}px ${p.fontUi}`, color: p.ink });
    // the arrows from the bob: g (real, down), the centrifugal acceleration (fictitious, dashed), g_eff
    const minLen = 16;
    const tip = (v: readonly [number, number], s: number): [number, number] => [bob[0] + v[0] * s, bob[1] - v[1] * s];
    const gTip = tip([0, -G], scale);
    arrow(ctx, bob[0], bob[1], gTip[0], gTip[1], { color: p.force, width: 2.6, head: 10 });
    haloText(ctx, p, 'g', gTip[0] - 12, gTip[1] - 6, { font: `italic 700 ${fs + 3}px ${p.fontUi}`, color: p.force });
    const cfLen = cfMag * scale;
    const cfDrawn = Math.max(minLen, cfLen);
    const cfDir: [number, number] = cfMag > 0 ? [cf[0] / cfMag, cf[1] / cfMag] : [0, 1];
    if (Math.abs(lat) < 89.5) {
      const ct = tip(cfDir, cfDrawn);
      ctx.save();
      ctx.setLineDash([5, 3]);
      arrow(ctx, bob[0], bob[1], ct[0], ct[1], { color: p.force, width: 2, head: 8 });
      ctx.restore();
      const lab = cfLen < minLen ? 'ω²R cos λ (×)' : 'ω²R cos λ';
      haloText(ctx, p, lab, ct[0] + (cfDir[0] >= 0 ? 6 : -6), ct[1] - 12, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.force, align: cfDir[0] >= 0 ? 'left' : 'right' });
    }
    const geTip = tip(ge, scale);
    arrow(ctx, bob[0], bob[1], geTip[0], geTip[1], { color: p.accel, width: 3, head: 11 });
    haloText(ctx, p, 'g_eff', geTip[0] + (ge[0] >= 0 ? 10 : -10), geTip[1] + 2, { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.accel, align: ge[0] >= 0 ? 'left' : 'right' });
    dot(ctx, p, bob[0], bob[1], 7, p.ink);
    // ω in the close view: (−cos λ, sin λ) in (south, up). Top-left corner below the title row: the figure's
    // reset and fullscreen buttons float over the top-right corner, and the arrow reaches ≤ 22 px up and left.
    {
      const ox = box.x + 34;
      const oy = box.y + 56;
      const wv: [number, number] = [-Math.cos(la), Math.sin(la)];
      arrow(ctx, ox, oy, ox + wv[0] * 22, oy - wv[1] * 22, { color: p.ink2, width: 1.6, head: 7 });
      haloText(ctx, p, 'ω', ox + 9, oy + 10, { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.ink2 });
    }
    // the honest word on the scale
    const note = k > 1 ? `ω מוגדלת פי ${k}` : cfLen < minLen ? 'החץ המקווקו מוגדל' : '';
    if (note) haloNote(ctx, p, note, box.x + box.w / 2, box.y + 16, fs + 3, k > 1 ? p.neg : p.hand);
  };

  const drawFoucault = (ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, t: number) => {
    const narrow = w < 560;
    const fs = narrow ? 11 : 12;
    const cx = w / 2;
    const cy = h / 2 + 4;
    const R = Math.min(w * 0.34, h * 0.38);
    // the floor and the compass (north up, east right: seen from above)
    ctx.save();
    ctx.fillStyle = p.paper2;
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    haloNote(ctx, p, 'צפון', cx, cy - R - 14, fs + 2);
    haloNote(ctx, p, 'דרום', cx, cy + R + 14, fs + 2);
    haloNote(ctx, p, 'מזרח', cx + R + 22, cy, fs + 2);
    haloNote(ctx, p, 'מערב', cx - R - 22, cy, fs + 2);

    if (!closeup) {
      let hrs = hours;
      if (playing?.kind === 'hours') {
        if (t0.current === null) t0.current = t;
        hrs = Math.min(HOURS_MAX, playing.from + (t - t0.current) * 6);
        if (hrs >= HOURS_MAX) finishHours();
      }
      const az0 = Math.PI / 2;
      const az = (h_: number) => az0 + foucaultPlaneAngle(OMEGA_EARTH, la, h_ * 3600);
      const line = (a: number, color: string, width: number) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.9 * Math.cos(a), cy + R * 0.9 * Math.sin(a));
        ctx.lineTo(cx + R * 0.9 * Math.cos(a), cy - R * 0.9 * Math.sin(a));
        ctx.stroke();
        ctx.restore();
      };
      for (let hh = 0; hh <= Math.floor(hrs); hh++) line(az(hh), withAlpha(p.accent, hh === 0 ? 0.55 : 0.2), hh === 0 ? 1.6 : 1);
      const a = az(hrs);
      line(a, p.ink, 2.4);
      // the arc the plane has swept, the way it turned (not the short way), at most one full turn
      const turned = clamp(a - az0, -2 * Math.PI + 0.05, 2 * Math.PI - 0.05);
      if (Math.abs(turned) > 0.02) {
        const r = R * 0.55;
        const s0 = -az0; // screen angle (y down)
        const s1 = s0 - turned;
        ctx.save();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, s0, s1, turned > 0);
        ctx.stroke();
        ctx.restore();
        const ex = cx + r * Math.cos(s1);
        const ey = cy + r * Math.sin(s1);
        const sg = turned > 0 ? -1 : 1; // screen sense of travel
        arrow(ctx, ex + Math.sin(s1) * sg * 10, ey - Math.cos(s1) * sg * 10, ex, ey, { color: p.accent, width: 1.5, head: 8 });
      }
      // the bob: swinging while the clock runs, otherwise at the end of the swing
      const ph = playing?.kind === 'hours' && motionAllowed() ? Math.cos(2 * Math.PI * (t / 1.4)) : 1;
      dot(ctx, p, cx + R * 0.9 * ph * Math.cos(a), cy - R * 0.9 * ph * Math.sin(a), 7, p.ink);
      dot(ctx, p, cx, cy, 2.5, p.ink2);
      haloText(ctx, p, `t = ${sci(hrs, 3)} h`, cx - R, cy + R + 2, { font: `600 ${fs + 1}px ${p.fontUi}`, color: p.ink, align: 'left' });
      return;
    }

    // the close-up: the integrated swing, ω exaggerated
    let tc = closeT;
    const tEnd = close[close.length - 1].t;
    if (playing?.kind === 'close') {
      if (t0.current === null) t0.current = t;
      tc = Math.min(tEnd, playing.from + (t - t0.current) * (T0 / 1.6));
      if (tc >= tEnd) finishClose();
    }
    const ppm = (R * 0.92) / PEND_A;
    const toXY = (s: Planar): [number, number] => [cx + s.x * ppm, cy - s.y * ppm];
    const per = close.length > 1 ? close[1].t : 1;
    const n = Math.min(close.length - 1, Math.round(tc / per));
    ctx.save();
    ctx.strokeStyle = withAlpha(p.accent, 0.75);
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const [X, Y] = toXY(close[i].s);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    ctx.restore();
    const s = close[n].s;
    const [X, Y] = toXY(s);
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > 1e-3) {
      const vScale = (R * 0.35) / (PEND_A * W0);
      const vl = Math.max(24, sp * vScale);
      arrow(ctx, X, Y, X + (s.vx / sp) * vl, Y - (s.vy / sp) * vl, { color: p.velocity, width: 2.2, head: 8 });
      haloText(ctx, p, 'v′', X + (s.vx / sp) * (vl + 10), Y - (s.vy / sp) * (vl + 10), { font: `italic 700 ${fs + 1}px ${p.fontUi}`, color: p.velocity });
      const wz = verticalOmega(CLOSE_K * OMEGA_EARTH, la);
      const [ax, ay] = horizontalCoriolisAccel(wz, s.vx, s.vy);
      const am = Math.hypot(ax, ay);
      if (am > 0) {
        const cl = Math.max(24, R * 0.18 * (am / (2 * Math.abs(CLOSE_K * OMEGA_EARTH) * PEND_A * W0)));
        arrow(ctx, X, Y, X + (ax / am) * cl, Y - (ay / am) * cl, { color: p.force, width: 2.2, head: 8 });
        haloText(ctx, p, 'F_cor', X + (ax / am) * (cl + 16), Y - (ay / am) * (cl + 10), { font: `italic 700 ${fs}px ${p.fontUi}`, color: p.force });
      }
    }
    dot(ctx, p, X, Y, 7, p.ink);
    dot(ctx, p, cx, cy, 2.5, p.ink2);
    // left of centre: the top-right corner holds the reset and fullscreen buttons
    haloNote(ctx, p, `ω מוגדלת פי ${CLOSE_K}`, Math.min(cx, w * 0.32), 16, fs + 3, p.neg);
    haloText(ctx, p, `${sci(tc / T0, 2)} T₀`, cx - R, cy + R + 2, { font: `600 ${fs + 1}px ${p.fontUi}`, color: p.ink, align: 'left' });
  };

  const drawCyclone = (ctx: CanvasRenderingContext2D, w: number, h: number, p: Palette, t: number) => {
    const narrow = w < 560;
    const fs = narrow ? 11 : 12;
    const F = FLOWS[flow];
    const cx = w / 2;
    const cy = h / 2 + 4;
    const half = Math.min(w * 0.38, h * 0.44);
    const ppm = half / F.half;
    let frac = shown;
    if (playing?.kind === 'flow') {
      if (t0.current === null) t0.current = t;
      frac = Math.min(1, (t - t0.current) / 6);
      if (frac >= 1) finishFlow();
    }
    // rings of equal pressure (a low) or the basin's rim (a sink)
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink3, 0.7);
    ctx.lineWidth = 0.9;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (i / 4) * half, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    dot(ctx, p, cx, cy, 4, p.ink);
    haloNote(ctx, p, flow === 'low' ? 'במרכז: לחץ נמוך' : 'במרכז: פתח הניקוז', cx, cy + half + 10, fs + 1);
    haloNote(ctx, p, 'צפון', cx, cy - half - 12, fs + 1);
    haloNote(ctx, p, 'מזרח', cx + half + 20, cy, fs + 1);
    // a scale bar
    {
      const m = flow === 'low' ? 1e5 : 0.05;
      const x0 = cx - half;
      const y0 = cy + half + 8;
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + m * ppm, y0);
      ctx.stroke();
      ctx.restore();
      haloText(ctx, p, flow === 'low' ? '100 km' : '5 cm', x0 + m * ppm + 6, y0, { font: `${fs}px ${p.fontUi}`, color: p.ink2, align: 'left' });
    }
    const toXY = (s: Planar): [number, number] => [cx + s.x * ppm, cy - s.y * ppm];
    for (const path of paths) {
      const n = Math.round(frac * (path.length - 1));
      if (n > 0) {
        ctx.save();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const [X, Y] = toXY(path[i]);
          if (i === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        }
        ctx.stroke();
        ctx.restore();
      }
      const s = path[n];
      const [X, Y] = toXY(s);
      const sp = Math.hypot(s.vx, s.vy);
      if (n > 0 && sp > 0) {
        const vl = 18;
        arrow(ctx, X, Y, X + (s.vx / sp) * vl, Y - (s.vy / sp) * vl, { color: p.velocity, width: 2, head: 7 });
      }
      dot(ctx, p, X, Y, 4.5, p.ink);
    }
    const tNow = frac * F.tEnd;
    haloText(ctx, p, flow === 'low' ? `t = ${sci(tNow / 3600, 3)} h` : `t = ${sci(tNow, 3)} s`, cx + half, cy + half + 8, { font: `600 ${fs + 1}px ${p.fontUi}`, color: p.ink, align: 'right' });
  };

  const draw = ({ ctx, view: v, palette: p, t }: FrameInfo) => {
    if (view === 'meridian') drawMeridian(ctx, v.w, v.h, p);
    else if (view === 'foucault') drawFoucault(ctx, v.w, v.h, p, t);
    else drawCyclone(ctx, v.w, v.h, p, t);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1, animate: playing !== null });
  useEffect(invalidate, [lat, k, hours, closeup, closeT, flow, shown, playing, close, paths]);

  const [aspect, setAspect] = useState(view === 'meridian' ? 1.6 : 1.3);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const narrowNow = el.getBoundingClientRect().width < 560;
      setAspect(view === 'meridian' ? (narrowNow ? 0.62 : 1.6) : narrowNow ? 0.9 : 1.3);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(invalidate, [aspect]);

  /* ---------------------------------------------------------------- animation ends */

  const playingRef = useRef(playing);
  playingRef.current = playing;
  const finishHours = () => {
    if (playingRef.current?.kind !== 'hours') return;
    playingRef.current = null;
    setPlaying(null);
    setHours(HOURS_MAX);
    setLive(`עברו ${HOURS_MAX} שעות.`);
  };
  const finishClose = () => {
    if (playingRef.current?.kind !== 'close') return;
    playingRef.current = null;
    setPlaying(null);
    setCloseT(close[close.length - 1].t);
  };
  const finishFlow = () => {
    if (playingRef.current?.kind !== 'flow') return;
    playingRef.current = null;
    setPlaying(null);
    setShown(1);
    setLive(`האוויר מקיף את המרכז ${senseHe(swept(paths[0]))}.`);
  };

  /* ---------------------------------------------------------------- input */

  const hoursTasks = (l: number, hh: number) => {
    if (l >= 89 && hh >= 23.9) done('pole');
    if (l === 0 && hh >= 12) done('equator');
    if (l < 0 && hh >= 6) done('south');
  };
  const onLat = (v: number) => {
    const l = clamp(Math.round(v), latMin, 90);
    setPlaying(null);
    t0.current = null;
    setLat(l);
    if (view === 'meridian') {
      if (l === 0) visited.current.equator = true;
      if (Math.abs(l) === 90) visited.current.pole = true;
      if (visited.current.equator && visited.current.pole) done('ends');
      // the largest lean at this ω: compare with a scan
      const wkk = k * OMEGA_EARTH;
      let best = 0;
      for (let x = 0; x <= 90; x += 0.25) best = Math.max(best, plumbDeviation(G, wkk, R_EARTH, x * DEG));
      if (plumbDeviation(G, wkk, R_EARTH, Math.abs(l) * DEG) >= 0.995 * best) done('max-lat');
    }
    if (view === 'foucault') {
      setCloseT(0);
      if (!closeup) hoursTasks(l, hours);
    }
    if (view === 'cyclone') setShown(0);
  };
  const onK = (v: number) => {
    const kk = clamp(Math.round(v), 1, K_MAX);
    setK(kk);
    if (kk >= 8) done('exaggerate');
  };
  const onHours = (v: number) => {
    setPlaying(null);
    t0.current = null;
    const hh = clamp(v, 0, HOURS_MAX);
    setHours(hh);
    hoursTasks(lat, hh);
  };
  const runHours = () => {
    t0.current = null;
    const from = hours >= HOURS_MAX ? 0 : hours;
    if (lat >= 89) done('pole');
    if (lat === 0) done('equator');
    if (lat < 0) done('south');
    if (!motionAllowed()) {
      setHours(HOURS_MAX);
      setLive(`עברו ${HOURS_MAX} שעות.`);
      return;
    }
    setHours(from);
    setPlaying({ kind: 'hours', from });
  };
  const runClose = () => {
    t0.current = null;
    done('closeup');
    if (!motionAllowed()) {
      setCloseT(close[close.length - 1].t);
      return;
    }
    setPlaying({ kind: 'close', from: 0 });
  };
  const onCloseup = (on: boolean) => {
    setPlaying(null);
    t0.current = null;
    setCloseup(on);
    setCloseT(0);
    if (on) runClose();
  };
  const release = () => {
    t0.current = null;
    if (flow === 'low' && lat > 0) done('north');
    if (flow === 'low' && lat < 0) done('south-flow');
    if (flow === 'sink') done('sink');
    if (!motionAllowed()) {
      setShown(1);
      setLive(`האוויר מקיף את המרכז ${senseHe(swept(paths[0]))}.`);
      return;
    }
    setShown(0);
    setPlaying({ kind: 'flow', from: 0 });
  };
  const onFlow = (f: FlowId) => {
    setPlaying(null);
    t0.current = null;
    setFlow(f);
    setShown(0);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') onLat(lat + 1);
    else if (e.key === 'ArrowDown') onLat(lat - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      if (view === 'foucault') (closeup ? runClose : runHours)();
      else if (view === 'cyclone') release();
      else return;
    } else return;
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- readouts and controls */

  const latText = `${minus(String(lat))}°`;
  let label = '';
  let readout = <></>;
  let controls = <></>;
  const latSlider = <Slider label="קו הרוחב λ" value={lat} min={latMin} max={90} step={1} format={(x) => `${minus(String(x))}°`} onChange={onLat} />;

  if (view === 'meridian') {
    label = `איור חי: חתך של כדור הארץ דרך הצירים, ונקודה בקו רוחב ${latText}. הנטייה האמיתית של האנך ${sci(alphaReal / DEG, 3)} מעלות.${k > 1 ? ` באיור ω מוגדלת פי ${k}, והנטייה באיור ${sci(alphaShown / DEG, 3)} מעלות.` : ''} במקלדת: חץ למעלה ולמטה משנה את קו הרוחב.`;
    readout = (
      <>
        <span class="q" data-readout="lat">
          λ = <b>{latText}</b>
        </span>
        <span class="q" data-readout="cf">
          ω²R cos λ = <b>{sci(cfReal, 3)} m/s²</b>
        </span>
        <span class="q" data-readout="geff">
          |g<sub>eff</sub>| = <b>{sci(geffReal, 4)} m/s²</b>
        </span>
        <span class="q" data-readout="alpha">
          α = <b>{sci(alphaReal / DEG, 3)}°</b>
        </span>
        {k > 1 ? (
          <span data-readout="scale">
            <b>ω מוגדלת פי {k} באיור</b>: שם <bdi dir="ltr">α = {sci(alphaShown / DEG, 3)}°</bdi>, והקריאות האחרות אמיתיות.
          </span>
        ) : (
          <span data-readout="scale">קנה מידה אמיתי: הנטייה קטנה מכדי לראות.</span>
        )}
      </>
    );
    controls = (
      <>
        {latSlider}
        <Slider label="הגדלת ω באיור (פי)" value={k} min={1} max={K_MAX} step={1} format={(x) => `×${x}`} onChange={onK} />
      </>
    );
  } else if (view === 'foucault') {
    const turnedDeg = rateDegH * hours;
    label = closeup
      ? `איור חי: מבט מקרוב על מטוטלת באורך 20 מטר בקו רוחב ${latText}, ω מוגדלת פי ${CLOSE_K}. כוח קוריוליס דוחף את המשקולת הצידה בכל תנודה.`
      : `איור חי: מישור התנודה של מטוטלת פוקו במבט מלמעלה, בקו רוחב ${latText}. המישור מסתובב ${senseHe(-rateDegH, 1e-9)}, ${sci(Math.abs(rateDegH), 3)} מעלות בשעה.`;
    readout = (
      <>
        <span class="q" data-readout="lat">
          λ = <b>{latText}</b>
        </span>
        <span class="q" data-readout="rate">
          ω sin λ = <b>{minus(sci(rateDegH, 3))}°/h</b>
        </span>
        <span class="q" data-readout="period">
          2π/(ω|sin λ|) = <b>{Number.isFinite(periodH) ? `${sci(periodH, 3)} h` : '∞'}</b>
        </span>
        <span data-readout="sense">
          <b>{senseHe(-rateDegH, 1e-9)}</b>
        </span>
        {!closeup && (
          <span class="q" data-readout="turned">
            t = {sci(hours, 3)} h: <b>{sci(Math.abs(turnedDeg), 3)}°</b>
          </span>
        )}
        {closeup && (
          <span data-readout="scale">
            <b>ω מוגדלת פי {CLOSE_K}</b> במבט מקרוב: שם המישור מסתובב <bdi dir="ltr">{sci((Math.abs(rateDegH) * CLOSE_K * T0) / 3600, 3)}°</bdi> בכל תנודה, ובאמת <bdi dir="ltr">{sci((Math.abs(rateDegH) * T0) / 3600, 3)}°</bdi>.
          </span>
        )}
      </>
    );
    controls = (
      <>
        {latSlider}
        {!closeup && (
          <Slider label="שעות מאז השחרור" value={Number(hours.toFixed(1))} min={0} max={HOURS_MAX} step={0.5} format={(x) => `${sci(x, 3)} h`} onChange={onHours} />
        )}
        <div class="group" role="group" aria-label="הזמן">
          <button type="button" class="btn primary" onClick={closeup ? runClose : runHours}>
            הריצו
          </button>
        </div>
        <div class="group" role="group" aria-label="מה להציג">
          <Toggle label="מבט מקרוב" on={closeup} onChange={onCloseup} />
        </div>
      </>
    );
  } else {
    const F = FLOWS[flow];
    const f = coriolisTurnRate(OMEGA_EARTH, la);
    const sw = paths.length ? swept(paths[0]) : 0;
    const drift = Math.max(0, ...paths.map((pa) => Math.max(...pa.map((s) => crossDist(pa[0], s)))));
    label = `איור חי: ${flow === 'low' ? 'אוויר שזורם אל לחץ נמוך' : 'מים שזורמים אל פתח ניקוז'} בקו רוחב ${latText}, במבט מלמעלה.`;
    readout = (
      <>
        <span class="q" data-readout="lat">
          λ = <b>{latText}</b>
        </span>
        <span class="q" data-readout="f">
          2ω sin λ = <b>{minus(sci(f, 3))} s⁻¹</b>
        </span>
        <span class="q" data-readout="time">
          {flow === 'low' ? `${sci(F.tEnd / 3600, 3)} h` : `${sci(F.tEnd, 3)} s`}
        </span>
        <span data-readout="sense">
          {shown >= 1 ? (
            flow === 'low' ? (
              <b>{Math.abs(sw) < 0.02 ? 'ישר פנימה' : senseHe(sw)}</b>
            ) : (
              <b>
                הסטה הצידה עד <bdi dir="ltr">{sci(drift * 1000, 2)} mm</bdi>
              </b>
            )
          ) : (
            'שחררו'
          )}
        </span>
      </>
    );
    controls = (
      <>
        {latSlider}
        <div class="group" role="group" aria-label="איזו זרימה">
          {(['low', 'sink'] as FlowId[]).map((id) => (
            <Toggle key={id} label={FLOWS[id].label} on={flow === id} onChange={() => onFlow(id)} />
          ))}
        </div>
        <div class="group" role="group" aria-label="שחרור">
          <button type="button" class="btn primary" onClick={release}>
            שחררו
          </button>
        </div>
      </>
    );
  }

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
        setLat(initLat());
        setK(clamp(Math.round(props.k ?? 1), 1, K_MAX));
        setHours(clamp(props.hours ?? 0, 0, HOURS_MAX));
        setCloseup(props.closeup ?? false);
        setCloseT(0);
        setFlow(props.flow ?? 'low');
        setShown(0);
        setPlaying(null);
        t0.current = null;
        visited.current = { equator: false, pole: false };
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={readout}
      controls={controls}
    />
  );
}

/** Distance of s from the straight line through the start and the centre (a parcel's sideways drift). */
function crossDist(start: Planar, s: Planar): number {
  const r = Math.hypot(start.x, start.y);
  return Math.abs(start.x * s.y - start.y * s.x) / r;
}
