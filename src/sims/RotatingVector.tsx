/**
 * RotatingVector (lesson 7.2): a turntable seen from two frames side by side (one above the other on a narrow
 * screen): the room, the inertial frame S, on the right (top); the turntable's own frame S′ on the left (bottom).
 * The turntable turns at ω about its centre O, counter-clockwise seen from above, so ω points out of the page.
 * In S the turntable and its painted lines turn and the room's marks stand still; in S′ the turntable stands
 * still and the room's marks turn the other way.
 *
 * mode 'rates' (figure 7.2א), three presets:
 *   'fixed'  an arrow Q painted on the turntable, from O. In S′ it stands still, (dQ/dt)_rot = 0; in S its tip moves
 *            on a circle and (dQ/dt)_in = ω × Q, perpendicular to Q, of length ω|Q|.
 *   'unit'   the unit vectors ê₁, ê₂ of the turning axes. In S, ê₁ now and a moment later (turned by Δθ) and their
 *            difference Δê₁; |Δê₁|/Δθ → 1 and the angle between Δê₁ and ê₁ → 90° as Δθ → 0. In S′ they never move.
 *   'bug'    a bug walks out from O along a painted radial line at v′ relative to the turntable; Q = r, its
 *            position. In S′ a straight line; in S a spiral. At the bug: (dQ/dt)_rot = v′ (dashed), ω × Q, and
 *            their sum (dQ/dt)_in, the velocity in S.
 * mode 'forces' (figure 7.2ב): one instant, at which the two frames' axes coincide. The bug, mass m = 4.0 g, at r
 *   from O on the painted line, walks along it at v′ (negative: toward O) and so a′ = 0; the turntable turns at ω
 *   and its rate changes at ω̇. In S: the bug's acceleration a and its terms 2ω×v′, ω×(ω×r′), ω̇×r′ (dashed). In S′:
 *   the real horizontal force F on the bug (the turntable's friction on its feet, F = m a) and the fictitious
 *   forces F_cf, F_cor, F_Euler (dashed), which sum to −F because a′ = 0.
 *
 * Physics: src/physics/rotrate.ts (walkerState, accelerationTerms, unitChordRatio, unitChordAngle) on
 * src/physics/rotating.ts (rotateZ, centrifugalForce, coriolisForce, eulerForce). Canvas world coordinates are y-up.
 *
 * Tasks tick only inside the learner's own handlers (sliders, the play button reaching the end of the walk); a text
 * step sets a state and never plays, so scrolling through the text completes nothing.
 *   fixed-omega  in 'fixed', the learner changes ω
 *   shrink       in 'unit', the learner makes Δθ ≤ 0.1 rad
 *   bug-walk     in 'bug', the learner plays the walk to the rim (or drags the bug there) with ω ≠ 0
 *   stand        in 'forces', the learner sets v′ = 0 with ω ≠ 0 and r ≠ 0: the Coriolis force vanishes
 *   reverse      in 'forces', the learner sets v′ < 0 with ω ≠ 0: the Coriolis force turns around
 *   spin-up      in 'forces', the learner sets ω̇ ≠ 0 with r ≠ 0: the Euler force appears
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { centrifugalForce, coriolisForce, eulerForce, rotateZ } from '~/physics/rotating';
import { accelerationTerms, unitChordAngle, unitChordRatio, walkerState } from '~/physics/rotrate';
import { cross3, len3, type Vec3 } from '~/physics/vec';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { sci } from './core/format';
import { arrow, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type RateMode = 'rates' | 'forces';
export type RatePreset = 'fixed' | 'unit' | 'bug';

export interface RotatingVectorProps {
  id: string;
  mode?: RateMode;
  presets?: RatePreset[];
  preset?: RatePreset;
  /** ω [rad/s] */
  omega?: number;
  /** the bug's speed along its line relative to the turntable [m/s] */
  vp?: number;
  /** the bug's distance from O [m] */
  r?: number;
  /** the turntable's angle of turn in S [deg] ('fixed', 'unit') */
  theta?: number;
  /** Δθ [rad] ('unit') */
  dtheta?: number;
  /** ω̇ [rad/s²] ('forces') */
  alpha?: number;
  tasks?: string[];
}

const TASK_LABEL: Record<string, string> = {
  'fixed-omega': 'שנו את המהירות הזוויתית ω, ועקבו אחרי החץ שבקצה של Q בכל אחת משתי המערכות.',
  shrink: 'הקטינו את Δθ עד 0.1 רדיאן או פחות. לאיזה מספר מתקרב היחס, ולאיזו זווית?',
  'bug-walk': 'הפעילו את ההליכה של החיפושית עד שפת הפטיפון, והשוו את המסלול שלה בשתי המערכות.',
  stand: 'עצרו את החיפושית (v′ = 0). איזה כוח מדומה נעלם?',
  reverse: 'שלחו את החיפושית פנימה, אל המרכז (v′ שלילית). מה קרה לכוח קוריוליס?',
  'spin-up': 'תנו לפטיפון להאיץ או להאט (ω̇ שונה מאפס). איזה כוח מדומה הופיע, ולאן הוא פונה?',
};

const PRESET_LABEL: Record<RatePreset, string> = { fixed: 'וקטור מודבק', unit: 'וקטורי יחידה', bug: 'חיפושית' };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const deg = Math.PI / 180;
/** a readout number: 3 significant figures, a true minus sign, and no "−0" */
const num = (x: number) => (Math.abs(x) < 5e-4 ? '0' : sci(x, 3).replace('-', '−'));

/** the turntable's radius, the room's ring of marks, the bug's start and the painted arrow Q [m] */
const R_DISK = 0.4;
const R_ROOM = 0.47;
const R_START = 0.05;
const Q_LEN = 0.3;
const Q_ANGLE = 30 * deg;
const U_LEN = 0.3; // the drawn length of a unit vector
const MASS = 0.004; // the bug [kg]
const R_FORCES = 0.35; // the bug's largest distance in 'forces', so every arrow stays in its panel
/** arrow scales: metres of arrow per m/s, per mN, per m/s² (so m a and F have the same length) */
const RATE_SCALE = 0.6;
const FORCE_SCALE = 0.07;
const ACC_SCALE = FORCE_SCALE * MASS * 1000;
const GAP = 0.06;

interface Layout {
  stacked: boolean;
  pw: number;
  ph: number;
}
const layoutFor = (cssWidth: number): Layout => (cssWidth < 520 ? { stacked: true, pw: 1.4, ph: 1.2 } : { stacked: false, pw: 1.3, ph: 1.3 });
const aspectOf = (L: Layout) => (L.stacked ? L.pw / (2 * L.ph + GAP) : (2 * L.pw + GAP) / L.ph);
const worldOf = (L: Layout) => (L.stacked ? { w: L.pw, h: 2 * L.ph + GAP } : { w: 2 * L.pw + GAP, h: L.ph });

/* ================================================================== text on the canvas */

function mathText(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  s: string,
  x: number,
  y: number,
  o: { color?: string; size?: number; italic?: boolean; align?: CanvasTextAlign; weight?: number } = {},
) {
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
  ctx.restore();
}

/** A label with a subscript, such as (dQ/dt) with "rot", centred on (x, y). */
function subText(ctx: CanvasRenderingContext2D, p: Palette, main: string, sub: string, x: number, y: number, color: string, size = 13) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.font = `italic 700 ${size}px ${p.fontUi}`;
  const wm = ctx.measureText(main).width;
  ctx.font = `700 ${Math.round(size * 0.72)}px ${p.fontUi}`;
  const ws = ctx.measureText(sub).width;
  ctx.restore();
  const x0 = x - (wm + ws + 1) / 2;
  mathText(ctx, p, main, x0, y, { color, size, align: 'left' });
  mathText(ctx, p, sub, x0 + wm + 1, y + size * 0.32, { color, size: Math.round(size * 0.72), align: 'left', italic: false });
}

/** Hebrew label, RTL, its right edge at x. Returns its width. */
function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; weight?: number } = {}) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
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

/* ================================================================== panels */

interface Panel {
  frame: 'S' | 'S′';
  /** screen position of the panel's top-left corner and its size [CSS px] */
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** world → screen within the panel; (0, 0) is the turntable's centre O */
  sx: (x: number) => number;
  sy: (y: number) => number;
}

function makePanels(view: View, L: Layout, centreShift: number): Panel[] {
  const { w, h, ppm } = view;
  const W = worldOf(L);
  const left = w / 2 - (W.w / 2) * ppm;
  const top = h / 2 - (W.h / 2) * ppm;
  const pw = L.pw * ppm;
  const ph = L.ph * ppm;
  const g = GAP * ppm;
  // S on the right (on top when stacked), S′ on the left (below)
  const boxes: { frame: 'S' | 'S′'; x0: number; y0: number }[] = L.stacked
    ? [
        { frame: 'S', x0: left, y0: top },
        { frame: 'S′', x0: left, y0: top + ph + g },
      ]
    : [
        { frame: 'S', x0: left + pw + g, y0: top },
        { frame: 'S′', x0: left, y0: top },
      ];
  return boxes.map((b) => {
    const cx = b.x0 + pw / 2 + centreShift * ppm;
    const cy = b.y0 + ph / 2 + 0.05 * ppm;
    return { ...b, w: pw, h: ph, sx: (x: number) => cx + x * ppm, sy: (y: number) => cy - y * ppm };
  });
}

/** The room: a ring of marks fixed in S, and a wider mark (a door) at 90°; turned by `turn` in S′. */
function drawRoom(ctx: CanvasRenderingContext2D, p: Palette, pn: Panel, turn: number, ppm: number) {
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 24; i++) {
    const a = (i * 2 * Math.PI) / 24 + turn;
    const r1 = R_ROOM - 0.015;
    const r2 = R_ROOM + 0.02;
    ctx.beginPath();
    ctx.moveTo(pn.sx(r1 * Math.cos(a)), pn.sy(r1 * Math.sin(a)));
    ctx.lineTo(pn.sx(r2 * Math.cos(a)), pn.sy(r2 * Math.sin(a)));
    ctx.stroke();
  }
  // the door: a thick arc
  ctx.lineWidth = 5;
  ctx.strokeStyle = withAlpha(p.ink2, 0.75);
  ctx.beginPath();
  ctx.arc(pn.sx(0), pn.sy(0), (R_ROOM + 0.005) * ppm, -(Math.PI / 2 + 0.17 + turn), -(Math.PI / 2 - 0.17 + turn));
  ctx.stroke();
  ctx.restore();
}

/** The turntable turned by θ: the disk, faint spokes, the painted radial line along x′, and the centre O. */
function drawDisk(ctx: CanvasRenderingContext2D, p: Palette, pn: Panel, theta: number, ppm: number, axes: boolean) {
  ctx.save();
  ctx.fillStyle = withAlpha(p.equip, 0.12);
  ctx.strokeStyle = p.equip;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(pn.sx(0), pn.sy(0), R_DISK * ppm, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = withAlpha(p.equip, 0.35);
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    const a = theta + (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(pn.sx(0.06 * Math.cos(a)), pn.sy(0.06 * Math.sin(a)));
    ctx.lineTo(pn.sx(R_DISK * Math.cos(a)), pn.sy(R_DISK * Math.sin(a)));
    ctx.stroke();
  }
  // the painted line along x′: the bug walks on it
  ctx.strokeStyle = withAlpha(p.equip, 0.9);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(pn.sx(0), pn.sy(0));
  ctx.lineTo(pn.sx(R_DISK * Math.cos(theta)), pn.sy(R_DISK * Math.sin(theta)));
  ctx.stroke();
  if (axes) {
    // the y′ axis, faint and dashed, with the axis names at the rim
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = withAlpha(p.ink2, 0.6);
    const b = theta + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(pn.sx(0), pn.sy(0));
    ctx.lineTo(pn.sx(R_DISK * Math.cos(b)), pn.sy(R_DISK * Math.sin(b)));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  if (axes) {
    const lx = (R_DISK + 0.075) * Math.cos(theta);
    const ly = (R_DISK + 0.075) * Math.sin(theta);
    mathText(ctx, p, 'x′', pn.sx(lx), pn.sy(ly), { color: p.ink2, size: 13 });
    const b = theta + Math.PI / 2;
    mathText(ctx, p, 'y′', pn.sx((R_DISK + 0.075) * Math.cos(b)), pn.sy((R_DISK + 0.075) * Math.sin(b)), { color: p.ink2, size: 13 });
  }
  // O and ω, out of the page: ⊙
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.fillStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(pn.sx(0), pn.sy(0), 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pn.sx(0), pn.sy(0), 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A curved arrow just outside the disk: counter-clockwise for the turntable in S, clockwise for the room in S′. */
function drawTurn(ctx: CanvasRenderingContext2D, p: Palette, pn: Panel, ppm: number, ccw: boolean, label: string) {
  const R = (R_DISK + 0.03) * ppm;
  const a1 = 200 * deg;
  const a2 = 245 * deg;
  ctx.save();
  ctx.strokeStyle = ccw ? p.ink : p.ink3;
  ctx.fillStyle = ccw ? p.ink : p.ink3;
  ctx.lineWidth = 1.8;
  if (!ccw) ctx.setLineDash([4, 3]);
  ctx.beginPath();
  // canvas angles run clockwise on screen: world angle a is screen angle −a
  ctx.arc(pn.sx(0), pn.sy(0), R, -a1, -a2, true);
  ctx.stroke();
  ctx.setLineDash([]);
  const tipA = ccw ? a2 : a1;
  const dir = ccw ? 1 : -1;
  const tx = pn.sx(0) + R * Math.cos(tipA);
  const ty = pn.sy(0) - R * Math.sin(tipA);
  // tangent (world, counter-clockwise) at tipA, times dir
  const ux = -Math.sin(tipA) * dir;
  const uy = -Math.cos(tipA) * dir; // screen y is flipped
  ctx.beginPath();
  ctx.moveTo(tx + ux * 7, ty + uy * 7);
  ctx.lineTo(tx - ux * 3 - uy * 5, ty - uy * 3 + ux * 5);
  ctx.lineTo(tx - ux * 3 + uy * 5, ty - uy * 3 - ux * 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const lr = R_DISK + 0.1;
  const la = 222 * deg;
  if (label === 'ω') mathText(ctx, p, 'ω', pn.sx(lr * Math.cos(la)), pn.sy(lr * Math.sin(la)), { size: 14 });
  else heText(ctx, p, label, pn.sx(lr * Math.cos(la)) + 16, pn.sy(lr * Math.sin(la)) + 6, { size: 12, color: p.ink3 });
}

function panelTitle(ctx: CanvasRenderingContext2D, p: Palette, pn: Panel, isTopRight: boolean) {
  // the reset and fullscreen buttons take the stage's top-right ~90 px
  const right = pn.x0 + pn.w - (isTopRight ? 90 : 8);
  const tw = heText(ctx, p, pn.frame === 'S' ? 'מערכת החדר' : 'מערכת הפטיפון', right, pn.y0 + 14, { size: 13, weight: 700, color: p.ink });
  mathText(ctx, p, pn.frame, right - tw - 8, pn.y0 + 14, { align: 'right', size: 14, color: p.ink });
}

function panelBack(ctx: CanvasRenderingContext2D, p: Palette, pn: Panel) {
  ctx.fillStyle = withAlpha(p.paper2, pn.frame === 'S' ? 0.5 : 0.9);
  ctx.fillRect(pn.x0, pn.y0, pn.w, pn.h);
}

/** The bug: a small oval body with legs, heading along `heading` [world rad]. */
function drawBug(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, heading: number, ppm: number) {
  const L = Math.max(15, 0.06 * ppm);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-heading);
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.2;
  for (const s of [-1, 1]) {
    for (const dx of [-0.3, 0, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(dx * L, 0);
      ctx.lineTo(dx * L + 0.12 * L, s * 0.55 * L);
      ctx.stroke();
    }
  }
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.5 * L, 0.3 * L, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.55 * L, 0, 0.17 * L, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** An arrow in world units within a panel, from (x, y) along the world vector d (already scaled to metres). */
function warrow(
  ctx: CanvasRenderingContext2D,
  pn: Panel,
  x: number,
  y: number,
  d: Vec3,
  o: { color: string; width?: number; head?: number; dash?: boolean },
): [number, number] {
  const x2 = pn.sx(x + d[0]);
  const y2 = pn.sy(y + d[1]);
  ctx.save();
  if (o.dash) ctx.setLineDash([5, 3]);
  arrow(ctx, pn.sx(x), pn.sy(y), x2, y2, { color: o.color, width: o.width ?? 2.5, head: o.head ?? 10 });
  ctx.restore();
  return [x2, y2];
}

/** Where to put an arrow's label: past its tip, pushed sideways by `side` px. */
function labelAt(x1: number, y1: number, x2: number, y2: number, side: number, ahead = 12): [number, number] {
  const L = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / L;
  const uy = (y2 - y1) / L;
  return [x2 + ux * ahead - uy * side, y2 + uy * ahead + ux * side];
}

/** Places labels near arrow tips without overlapping the labels already placed in this frame. */
class LabelPlacer {
  private boxes: [number, number, number, number][] = [];
  private ctx: CanvasRenderingContext2D;
  private p: Palette;
  /** the panel: a label must lie inside it */
  private pn: Panel;
  constructor(ctx: CanvasRenderingContext2D, p: Palette, pn: Panel) {
    this.ctx = ctx;
    this.p = p;
    this.pn = pn;
    // the reset and fullscreen buttons sit at the stage's top-right corner, over the S panel
    if (pn.frame === 'S') this.block(pn.x0 + pn.w - 45, pn.y0 + 22, 90, 44);
  }
  /** reserve a box (a body, the centre mark) so labels avoid it */
  block(x: number, y: number, w: number, h: number) {
    this.boxes.push([x - w / 2, y - h / 2, x + w / 2, y + h / 2]);
  }
  /** reserve the drawn arrow (x1, y1) → (x2, y2), so no label covers another arrow's shaft or head */
  blockArrow(a: [number, number, number, number] | null) {
    if (!a) return;
    const n = Math.max(1, Math.ceil(Math.hypot(a[2] - a[0], a[3] - a[1]) / 6));
    for (let i = 0; i <= n; i++) this.block(a[0] + ((a[2] - a[0]) * i) / n, a[1] + ((a[3] - a[1]) * i) / n, 8, 8);
  }
  private inside(x: number, y: number, w: number, h: number) {
    const pn = this.pn;
    return x - w / 2 >= pn.x0 + 2 && x + w / 2 <= pn.x0 + pn.w - 2 && y - h / 2 >= pn.y0 + 26 && y + h / 2 <= pn.y0 + pn.h - 2;
  }
  private free(x: number, y: number, w: number, h: number) {
    const b: [number, number, number, number] = [x - w / 2 - 2, y - h / 2 - 1, x + w / 2 + 2, y + h / 2 + 1];
    const pn = this.pn;
    if (b[0] < pn.x0 + 2 || b[2] > pn.x0 + pn.w - 2 || b[1] < pn.y0 + 26 || b[3] > pn.y0 + pn.h - 2) return false;
    return this.boxes.every((o) => b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]);
  }
  /**
   * A centre point for a label of size (w, h) beside the arrow (x1, y1) → (x2, y2). With `mid`, the places beside the
   * arrow's middle are tried first: the term arrows of the S panel share their tips with the total, and labels at the
   * tips crowd one another.
   */
  at(x1: number, y1: number, x2: number, y2: number, w: number, h: number, mid = false): [number, number] {
    const L = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / L;
    const uy = (y2 - y1) / L;
    const nx = -uy;
    const ny = ux;
    const reach = 7 + Math.abs(ux) * (w / 2) + Math.abs(uy) * (h / 2);
    const side = 6 + Math.abs(nx) * (w / 2) + Math.abs(ny) * (h / 2);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const cands: [number, number][] = [
      [x2 + ux * reach, y2 + uy * reach],
      [x2 - ux * 6 + nx * side, y2 - uy * 6 + ny * side],
      [x2 - ux * 6 - nx * side, y2 - uy * 6 - ny * side],
      [mx + nx * side, my + ny * side],
      [mx - nx * side, my - ny * side],
      [x2 + ux * (reach + 14), y2 + uy * (reach + 14)],
      [x2 + ux * reach + nx * (side + 10), y2 + uy * reach + ny * (side + 10)],
      [x2 + ux * reach - nx * (side + 10), y2 + uy * reach - ny * (side + 10)],
      [mx + nx * (side + 16), my + ny * (side + 16)],
      [mx - nx * (side + 16), my - ny * (side + 16)],
      [x1 + nx * side, y1 + ny * side],
      [x1 - nx * side, y1 - ny * side],
    ];
    const order: [number, number][] = mid ? [cands[3], cands[4], cands[8], cands[9], ...cands] : cands;
    const c = order.find(([x, y]) => this.free(x, y, w, h)) ?? order.find(([x, y]) => this.inside(x, y, w, h)) ?? order[0];
    this.block(c[0], c[1], w, h);
    return c;
  }
  width(s: string, size: number, sub = '') {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `italic 700 ${size}px ${this.p.fontUi}`;
    let w = ctx.measureText(s).width;
    if (sub) {
      ctx.font = `700 ${Math.round(size * 0.72)}px ${this.p.fontUi}`;
      w += ctx.measureText(sub).width + 1;
    }
    ctx.restore();
    return w;
  }
  /** a math label beside an arrow */
  math(s: string, a: [number, number, number, number], color: string, size = 13, mid = false) {
    const w = this.width(s, size);
    const [x, y] = this.at(a[0], a[1], a[2], a[3], w, size + 2, mid);
    mathText(this.ctx, this.p, s, x, y, { color, size });
  }
  /** a label with a subscript beside an arrow */
  sub(main: string, sub: string, a: [number, number, number, number], color: string, size = 13) {
    const w = this.width(main, size, sub);
    const [x, y] = this.at(a[0], a[1], a[2], a[3], w, size + 4);
    subText(this.ctx, this.p, main, sub, x, y, color, size);
  }
}

/* ================================================================== the component */

export default function RotatingVector(props: RotatingVectorProps) {
  return props.mode === 'forces' ? <Forces {...props} /> : <Rates {...props} />;
}

/** Watch the canvas width and switch between side-by-side and stacked panels. */
function useLayoutSwitch(canvasRef: { current: HTMLCanvasElement | null }, setL: (f: (prev: Layout) => Layout) => void) {
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const next = layoutFor(el.getBoundingClientRect().width);
      setL((prev) => (prev.stacked === next.stacked ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
}

/* ------------------------------------------------------------------ rates */

interface RatesState {
  preset: RatePreset;
  omega: number;
  vp: number;
  r: number;
  theta: number; // [rad], 'fixed' and 'unit'
  dtheta: number;
  playing: boolean;
}

const OMEGA_MAX = 2.0;

function ratesInitial(p: RotatingVectorProps): RatesState {
  const presets = p.presets ?? ['fixed', 'unit', 'bug'];
  return {
    preset: p.preset ?? presets[0],
    omega: clamp(p.omega ?? 1.5, 0, OMEGA_MAX),
    vp: clamp(p.vp ?? 0.2, 0.05, 0.3),
    r: clamp(p.r ?? R_START, R_START, R_DISK),
    theta: (p.theta ?? 0) * deg,
    dtheta: clamp(p.dtheta ?? 0.8, 0.05, 1.5),
    playing: false,
  };
}

/** The bug's time since it left r = R_START, and the turntable's angle then. */
const bugTime = (s: RatesState) => (s.r - R_START) / s.vp;
const turnAngle = (s: RatesState) => (s.preset === 'bug' ? s.omega * bugTime(s) : s.theta);

interface RateArrows {
  Q: Vec3; // in S's axes
  Qp: Vec3; // in S′'s axes
  rot: Vec3; // (dQ/dt)_rot, in S's axes
  rotP: Vec3; // the same, in S′'s axes
  wq: Vec3; // ω × Q, in S's axes
  inr: Vec3; // (dQ/dt)_in, in S's axes
}

function rateArrows(s: RatesState): RateArrows {
  const th = turnAngle(s);
  const w: Vec3 = [0, 0, s.omega];
  if (s.preset === 'bug') {
    const ws = walkerState({ r0: R_START, vp: s.vp }, { omega0: s.omega }, bugTime(s));
    const rot = rotateZ(ws.vp, th);
    const wq = cross3(w, ws.r);
    return { Q: ws.r, Qp: ws.rp, rot, rotP: ws.vp, wq, inr: ws.v };
  }
  const Qp: Vec3 = [Q_LEN * Math.cos(Q_ANGLE), Q_LEN * Math.sin(Q_ANGLE), 0];
  const Q = rotateZ(Qp, th);
  const wq = cross3(w, Q);
  return { Q, Qp, rot: [0, 0, 0], rotP: [0, 0, 0], wq, inr: wq };
}

function Rates(props: RotatingVectorProps) {
  const presets = props.presets ?? ['fixed', 'unit', 'bug'];
  const [s, setS] = useState<RatesState>(() => ratesInitial(props));
  const [live, setLive] = useState('');
  const ownPlay = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        ownPlay.current = false;
        setS((prev) => {
          const next = { ...prev, playing: false };
          if (st.preset === 'fixed' || st.preset === 'unit' || st.preset === 'bug') next.preset = st.preset;
          if (typeof st.omega === 'number') next.omega = clamp(st.omega, 0, OMEGA_MAX);
          if (typeof st.vp === 'number') next.vp = clamp(st.vp, 0.05, 0.3);
          if (typeof st.r === 'number') next.r = clamp(st.r, R_START, R_DISK);
          if (typeof st.theta === 'number') next.theta = st.theta * deg;
          if (typeof st.dtheta === 'number') next.dtheta = clamp(st.dtheta, 0.05, 1.5);
          return next;
        });
      }),
    [props.id],
  );

  // playback, frozen in still mode: the turntable turns; in 'bug' the bug walks to the rim and stops
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000) * 0.5;
      last = now;
      if (!motionAllowed() || document.hidden) return;
      setS((prev) => {
        if (prev.preset === 'bug') {
          const r = prev.r + prev.vp * dt;
          if (r >= R_DISK) {
            if (ownPlay.current && prev.omega !== 0) done('bug-walk');
            ownPlay.current = false;
            return { ...prev, r: R_DISK, playing: false };
          }
          return { ...prev, r };
        }
        return { ...prev, theta: (prev.theta + prev.omega * dt) % (2 * Math.PI) };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  useEffect(() => {
    const h = setTimeout(() => setLive(ratesDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s.preset, s.omega, s.vp, s.dtheta, Math.round(s.r * 20)]);

  const [L, setL] = useState<Layout>(() => layoutFor(800));
  const W = worldOf(L);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintRates(ctx, view, p, s, L);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: W.w, worldHeight: W.h, animate: false });
  useLayoutSwitch(canvasRef, setL);
  useEffect(invalidate, [s, L]);

  const reset = () => {
    ownPlay.current = false;
    setS(ratesInitial(props));
    setLive('האיור אופס.');
  };

  const a = rateArrows(s);
  const showPreset = (pr: RatePreset) => setS((prev) => ({ ...prev, preset: pr, playing: false }));

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: פטיפון שמסתובב נגד כיוון השעון, משתי מערכות ייחוס: מימין (למעלה) מהחדר, משמאל (למטה) מהפטיפון. ${ratesDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={aspectOf(L)}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        s.preset === 'unit' ? (
          <>
            <span data-readout="dtheta">
              <bdi dir="ltr"><i>Δθ</i> = <b class="q">{num(s.dtheta)} rad</b></bdi>
            </span>
            <span data-readout="ratio">
              <bdi dir="ltr">|Δê₁| / Δθ = <b class="q">{num(unitChordRatio(s.dtheta))}</b></bdi>
            </span>
            <span data-readout="angle">
              הזווית בין <bdi dir="ltr">Δê₁</bdi> ל-<bdi dir="ltr">ê₁</bdi>: <b class="q">{num(unitChordAngle(s.dtheta) / deg)}°</b>
            </span>
          </>
        ) : (
          <>
            <span data-readout="omega">
              <bdi dir="ltr"><i>ω</i> = <b class="q">{num(s.omega)} rad/s</b></bdi>
            </span>
            <span data-readout="q">
              <bdi dir="ltr">|Q| = <b class="q">{num(len3(a.Q))} m</b></bdi>
            </span>
            <span data-readout="rot">
              <bdi dir="ltr">|(dQ/dt)rot| = <b class="q">{num(len3(a.rot))} m/s</b></bdi>
            </span>
            <span data-readout="wq">
              <bdi dir="ltr">|ω × Q| = <b class="q">{num(len3(a.wq))} m/s</b></bdi>
            </span>
            <span data-readout="in">
              <bdi dir="ltr">|(dQ/dt)in| = <b class="q">{num(len3(a.inr))} m/s</b></bdi>
            </span>
          </>
        )
      }
      controls={
        <>
          {presets.length > 1 && (
            <div class="group" role="group" aria-label="מה מצויר">
              {presets.map((pr) => (
                <Toggle key={pr} label={PRESET_LABEL[pr]} on={s.preset === pr} onChange={() => showPreset(pr)} />
              ))}
            </div>
          )}
          {s.preset !== 'unit' && (
            <Slider
              label="מהירות זוויתית של הפטיפון"
              min={0}
              max={OMEGA_MAX}
              step={0.5}
              value={s.omega}
              format={(v) => `${num(v)} rad/s`}
              onChange={(v) => {
                setS((prev) => ({ ...prev, omega: v }));
                if (s.preset === 'fixed') done('fixed-omega');
              }}
            />
          )}
          {s.preset === 'unit' && (
            <Slider
              label="זווית הסיבוב בין שני הרגעים"
              min={0.05}
              max={1.5}
              step={0.05}
              value={s.dtheta}
              format={(v) => `${num(v)} rad`}
              onChange={(v) => {
                setS((prev) => ({ ...prev, dtheta: v }));
                if (v <= 0.1 + 1e-9) done('shrink');
              }}
            />
          )}
          {s.preset === 'bug' && (
            <Slider
              label="מהירות החיפושית ביחס לפטיפון"
              min={0.05}
              max={0.3}
              step={0.05}
              value={s.vp}
              format={(v) => `${num(v)} m/s`}
              onChange={(v) => setS((prev) => ({ ...prev, vp: v }))}
            />
          )}
          {s.preset === 'bug' ? (
            <Slider
              label="מרחק החיפושית מהמרכז"
              min={R_START}
              max={R_DISK}
              step={0.01}
              value={Math.round(s.r * 100) / 100}
              format={(v) => `${num(v)} m`}
              onChange={(v) => {
                setS((prev) => ({ ...prev, r: v, playing: false }));
                if (v >= R_DISK - 1e-9 && s.omega !== 0) done('bug-walk');
              }}
            />
          ) : (
            <Slider
              label="זווית הסיבוב של הפטיפון"
              min={0}
              max={360}
              step={5}
              value={Math.round(((((s.theta / deg) % 360) + 360) % 360) / 5) * 5}
              format={(v) => `${num(v)}°`}
              onChange={(v) => setS((prev) => ({ ...prev, theta: v * deg, playing: false }))}
            />
          )}
          <div class="group" role="group" aria-label="זמן">
            <Toggle
              label={s.playing ? 'עצירה' : 'הפעלה'}
              on={s.playing}
              onChange={(on) => {
                ownPlay.current = on;
                if (on && s.preset === 'bug' && s.r >= R_DISK - 1e-9) setS((prev) => ({ ...prev, r: R_START, playing: true }));
                else setS((prev) => ({ ...prev, playing: on }));
              }}
            />
          </div>
        </>
      }
    />
  );
}

function ratesDescribe(s: RatesState): string {
  if (s.preset === 'unit')
    return `וקטורי היחידה של הצירים המסתובבים. וקטור היחידה הראשון מצויר עכשיו ואחרי סיבוב בזווית ${num(s.dtheta)} רדיאן. היחס בין אורך ההפרש לזווית הוא ${num(unitChordRatio(s.dtheta))}.`;
  const a = rateArrows(s);
  if (s.preset === 'fixed')
    return `חץ Q באורך ${num(Q_LEN)} מטר מצויר על הפטיפון. במערכת הפטיפון הוא לא זז. במערכת החדר קצב השינוי שלו ניצב לו, וגודלו ${num(len3(a.wq))} מטר לשנייה.`;
  return `חיפושית במרחק ${num(s.r)} מטר מהמרכז הולכת החוצה במהירות ${num(s.vp)} מטר לשנייה ביחס לפטיפון. במערכת החדר המהירות שלה ${num(len3(a.inr))} מטר לשנייה.`;
}

function paintRates(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: RatesState, L: Layout) {
  const { ppm } = view;
  const panels = makePanels(view, L, 0);
  const th = turnAngle(s);
  const a = rateArrows(s);
  const rotTint = withAlpha(p.velocity, 0.6);
  for (const pn of panels) {
    const inS = pn.frame === 'S';
    ctx.save();
    ctx.beginPath();
    ctx.rect(pn.x0, pn.y0, pn.w, pn.h);
    ctx.clip();
    panelBack(ctx, p, pn);
    // S: the room stands, the turntable turns by θ; S′: the turntable stands, the room turns by −θ
    drawRoom(ctx, p, pn, inS ? 0 : -th, ppm);
    drawDisk(ctx, p, pn, inS ? th : 0, ppm, s.preset !== 'unit');
    drawTurn(ctx, p, pn, ppm, inS, inS ? 'ω' : 'החדר');

    if (s.preset === 'unit') paintUnit(ctx, p, pn, s, inS ? th : 0, ppm);
    else {
      const Q = inS ? a.Q : a.Qp;
      // the trace so far: in S a circle arc (fixed) or a spiral (bug); in S′ nothing (fixed) or a straight line (bug)
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink3, 0.9);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const N = 80;
      if (s.preset === 'bug') {
        const T = bugTime(s);
        for (let i = 0; i <= N; i++) {
          const t = (T * i) / N;
          const ws = walkerState({ r0: R_START, vp: s.vp }, { omega0: s.omega }, t);
          const q = inS ? ws.r : ws.rp;
          if (i === 0) ctx.moveTo(pn.sx(q[0]), pn.sy(q[1]));
          else ctx.lineTo(pn.sx(q[0]), pn.sy(q[1]));
        }
      } else if (inS) {
        for (let i = 0; i <= N; i++) {
          const q = rotateZ(a.Qp, (th * i) / N);
          if (i === 0) ctx.moveTo(pn.sx(q[0]), pn.sy(q[1]));
          else ctx.lineTo(pn.sx(q[0]), pn.sy(q[1]));
        }
      }
      ctx.stroke();
      ctx.restore();

      // Q from O
      const [qx, qy] = warrow(ctx, pn, 0, 0, Q, { color: p.ink, width: 3, head: 11 });
      if (s.preset === 'bug') {
        const vdir = inS ? a.inr : a.rotP;
        drawBug(ctx, p, qx, qy, Math.atan2(vdir[1], vdir[0]), ppm);
      }
      const lp = new LabelPlacer(ctx, p, pn);
      lp.block(pn.sx(0), pn.sy(0), 16, 16);
      if (s.preset === 'bug') lp.block(qx, qy, 22, 22);
      // the axis names at the rim and the door in the ring: labels keep clear of them
      const thDisk = inS ? th : 0;
      for (const a of [thDisk, thDisk + Math.PI / 2]) lp.block(pn.sx((R_DISK + 0.075) * Math.cos(a)), pn.sy((R_DISK + 0.075) * Math.sin(a)), 22, 20);
      const door = Math.PI / 2 + (inS ? 0 : -th);
      lp.block(pn.sx(R_ROOM * Math.cos(door)), pn.sy(R_ROOM * Math.sin(door)), 0.2 * ppm, 0.1 * ppm);
      const qArrow: [number, number, number, number] = [pn.sx(0), pn.sy(0), qx, qy];

      if (inS) {
        if (s.preset === 'bug') {
          // head to tail: (dQ/dt)_rot then ω × Q; their sum from the bug
          const t1 = warrow(ctx, pn, Q[0], Q[1], scaleV(a.rot, RATE_SCALE), { color: rotTint, width: 2, dash: true, head: 9 });
          const t1w: [number, number] = [Q[0] + a.rot[0] * RATE_SCALE, Q[1] + a.rot[1] * RATE_SCALE];
          const t2 = warrow(ctx, pn, t1w[0], t1w[1], scaleV(a.wq, RATE_SCALE), { color: p.accent, width: 2.2, head: 9 });
          const t3 = warrow(ctx, pn, Q[0], Q[1], scaleV(a.inr, RATE_SCALE), { color: p.velocity, width: 3, head: 11 });
          lp.sub('(dQ/dt)', 'in', [qx, qy, t3[0], t3[1]], p.velocity, 12);
          if (s.omega > 0) lp.math('ω×Q', [t1[0], t1[1], t2[0], t2[1]], p.accent, 13);
          lp.sub('(dQ/dt)', 'rot', [qx, qy, t1[0], t1[1]], p.velocity, 12);
        } else {
          const t = warrow(ctx, pn, Q[0], Q[1], scaleV(a.inr, RATE_SCALE), { color: p.velocity, width: 3, head: 11 });
          if (s.omega > 0) {
            const w = lp.width('(dQ/dt)', 12, 'in') + lp.width(' = ω×Q', 12);
            const [lx, ly] = lp.at(qx, qy, t[0], t[1], w, 18);
            subText(ctx, p, '(dQ/dt)', 'in', lx - w / 2 + lp.width('(dQ/dt)', 12, 'in') / 2, ly, p.velocity, 12);
            mathText(ctx, p, '= ω×Q', lx + w / 2, ly, { color: p.velocity, size: 12, align: 'right' });
          }
        }
      } else if (s.preset === 'bug') {
        const t = warrow(ctx, pn, Q[0], Q[1], scaleV(a.rotP, RATE_SCALE), { color: rotTint, width: 2.5, dash: true, head: 10 });
        lp.sub('(dQ/dt)', 'rot', [qx, qy, t[0], t[1]], p.velocity, 12);
      } else {
        // the tip, with the statement that Q does not change here
        const w = lp.width('(dQ/dt)', 12, 'rot') + lp.width(' = 0', 12);
        const [lx, ly] = lp.at(pn.sx(0), pn.sy(0), qx, qy, w, 18);
        subText(ctx, p, '(dQ/dt)', 'rot', lx - w / 2 + lp.width('(dQ/dt)', 12, 'rot') / 2, ly, p.velocity, 12);
        mathText(ctx, p, '= 0', lx + w / 2, ly, { color: p.velocity, size: 12, align: 'right' });
      }
      // the label of Q itself, beside the middle of its arrow
      {
        const lab = s.preset === 'bug' ? 'Q = r' : 'Q';
        const w = lp.width(lab, 14);
        const qa = Math.atan2(Q[1], Q[0]);
        const cands: [number, number][] = [
          [(qArrow[0] + qx) / 2 + (w / 2 + 8) * Math.sin(qa), (qArrow[1] + qy) / 2 + (w / 2 + 8) * Math.cos(qa) * 0.6 + 6],
          [(qArrow[0] + qx) / 2 - (w / 2 + 8) * Math.sin(qa), (qArrow[1] + qy) / 2 - (w / 2 + 8) * Math.cos(qa) * 0.6 - 6],
        ];
        const c = cands[0];
        mathText(ctx, p, lab, c[0], c[1], { size: 14 });
      }
    }
    panelTitle(ctx, p, pn, inS);
    ctx.restore();
  }
}

const scaleV = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

function paintUnit(ctx: CanvasRenderingContext2D, p: Palette, pn: Panel, s: RatesState, th: number, ppm: number) {
  const inS = pn.frame === 'S';
  const e1: Vec3 = [U_LEN * Math.cos(th), U_LEN * Math.sin(th), 0];
  const e2: Vec3 = [-U_LEN * Math.sin(th), U_LEN * Math.cos(th), 0];
  warrow(ctx, pn, 0, 0, e2, { color: p.ink2, width: 2.5, head: 10 });
  const [x1, y1] = warrow(ctx, pn, 0, 0, e1, { color: p.ink, width: 3, head: 11 });
  const [l2x, l2y] = labelAt(pn.sx(0), pn.sy(0), pn.sx(e2[0]), pn.sy(e2[1]), -12, 6);
  mathText(ctx, p, 'ê₂', l2x, l2y, { color: p.ink2, size: 15 });
  if (!inS) {
    const [lx, ly] = labelAt(pn.sx(0), pn.sy(0), x1, y1, 12, 8);
    mathText(ctx, p, 'ê₁', lx, ly, { size: 15 });
    heText(ctx, p, 'וקטורי היחידה לא זזים', pn.sx(0.36), pn.sy(-0.3), { size: 12, color: p.ink2 });
    return;
  }
  // a moment later: ê₁ turned by Δθ (light), the difference Δê₁ and the arc Δθ
  const later: Vec3 = [U_LEN * Math.cos(th + s.dtheta), U_LEN * Math.sin(th + s.dtheta), 0];
  const [x3, y3] = warrow(ctx, pn, 0, 0, later, { color: withAlpha(p.ink, 0.4), width: 2.5, head: 10 });
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(pn.sx(0), pn.sy(0), 0.11 * ppm, -th, -(th + s.dtheta), true);
  ctx.stroke();
  ctx.restore();
  const am = th + s.dtheta / 2;
  mathText(ctx, p, 'Δθ', pn.sx(0.16 * Math.cos(am)), pn.sy(0.16 * Math.sin(am)), { size: 13, color: p.ink2 });
  arrow(ctx, x1, y1, x3, y3, { color: p.accent, width: 2.5, head: Math.min(10, Math.hypot(x3 - x1, y3 - y1) * 0.6) });
  // labels: ê₁ beyond its tip on the far side from the turn; Δê₁ outside the chord
  const [lx, ly] = labelAt(pn.sx(0), pn.sy(0), x1, y1, 14, 6);
  mathText(ctx, p, 'ê₁', lx, ly, { size: 15 });
  const mx = (x1 + x3) / 2 + 22 * Math.cos(am);
  const my = (y1 + y3) / 2 - 22 * Math.sin(am);
  mathText(ctx, p, 'Δê₁', mx, my, { color: p.accent, size: 14 });
}

/* ------------------------------------------------------------------ forces */

interface ForcesState {
  omega: number;
  alpha: number;
  r: number;
  vp: number;
}

function forcesInitial(p: RotatingVectorProps): ForcesState {
  return {
    omega: clamp(p.omega ?? 1.5, 0, 2),
    alpha: clamp(p.alpha ?? 0, -1, 1),
    r: clamp(p.r ?? 0.3, 0, R_FORCES),
    vp: clamp(p.vp ?? 0.2, -0.3, 0.3),
  };
}

interface ForceSet {
  rp: Vec3;
  vp: Vec3;
  terms: ReturnType<typeof accelerationTerms>;
  fcf: Vec3;
  fcor: Vec3;
  feuler: Vec3;
  F: Vec3; // the real force, m a
}

/** At the instant the axes coincide, S and S′ components are the same. Forces in mN. */
function forceSet(s: ForcesState): ForceSet {
  const rp: Vec3 = [s.r, 0, 0];
  const vp: Vec3 = [s.vp, 0, 0];
  const w: Vec3 = [0, 0, s.omega];
  const wd: Vec3 = [0, 0, s.alpha];
  const terms = accelerationTerms(rp, vp, [0, 0, 0], w, wd);
  const k = 1000; // N → mN
  return {
    rp,
    vp,
    terms,
    fcf: scaleV(centrifugalForce(MASS, w, rp), k),
    fcor: scaleV(coriolisForce(MASS, w, vp), k),
    feuler: scaleV(eulerForce(MASS, wd, rp), k),
    F: scaleV(terms.total, MASS * k),
  };
}

function Forces(props: RotatingVectorProps) {
  const [s, setS] = useState<ForcesState>(() => forcesInitial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st: StepState) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.omega === 'number') next.omega = clamp(st.omega, 0, 2);
          if (typeof st.alpha === 'number') next.alpha = clamp(st.alpha, -1, 1);
          if (typeof st.r === 'number') next.r = clamp(st.r, 0, R_FORCES);
          if (typeof st.vp === 'number') next.vp = clamp(st.vp, -0.3, 0.3);
          return next;
        });
      }),
    [props.id],
  );

  /** a learner's change: set it, then judge the new state for the tasks */
  const change = (patch: Partial<ForcesState>) => {
    const next = { ...s, ...patch };
    setS(next);
    if (next.vp === 0 && next.omega !== 0 && next.r !== 0) done('stand');
    if (next.vp < 0 && next.omega !== 0) done('reverse');
    if (next.alpha !== 0 && next.r !== 0) done('spin-up');
  };

  useEffect(() => {
    const h = setTimeout(() => setLive(forcesDescribe(s)), 700);
    return () => clearTimeout(h);
  }, [s]);

  const [L, setL] = useState<Layout>(() => layoutFor(800));
  const W = worldOf(L);
  const draw = ({ ctx, view, palette: p }: FrameInfo) => paintForces(ctx, view, p, s, L);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: W.w, worldHeight: W.h, animate: false });
  useLayoutSwitch(canvasRef, setL);
  useEffect(invalidate, [s, L]);

  const reset = () => {
    setS(forcesInitial(props));
    setLive('האיור אופס.');
  };

  const f = forceSet(s);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: חיפושית על פטיפון מסתובב, ברגע אחד. מימין (למעלה) התאוצה שלה במערכת החדר, משמאל (למטה) הכוחות עליה במערכת הפטיפון. ${forcesDescribe(s)}`}
      canvasRef={canvasRef}
      aspect={aspectOf(L)}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span data-readout="a">
            <bdi dir="ltr">S: |a| = <b class="q">{num(len3(f.terms.total))} m/s²</b></bdi>
          </span>
          <span data-readout="ap">
            <bdi dir="ltr">S′: a′ = <b class="q">0</b></bdi>
          </span>
          <span data-readout="f">
            <bdi dir="ltr">|F| = <b class="q">{num(len3(f.F))} mN</b></bdi>
          </span>
          <span data-readout="fcf">
            <bdi dir="ltr">|F_cf| = <b class="q">{num(len3(f.fcf))} mN</b></bdi>
          </span>
          <span data-readout="fcor">
            <bdi dir="ltr">|F_cor| = <b class="q">{num(len3(f.fcor))} mN</b></bdi>
          </span>
          <span data-readout="feuler">
            <bdi dir="ltr">|F_Euler| = <b class="q">{num(len3(f.feuler))} mN</b></bdi>
          </span>
        </>
      }
      controls={
        <>
          <Slider label="מהירות זוויתית ω" min={0} max={2} step={0.25} value={s.omega} format={(v) => `${num(v)} rad/s`} onChange={(v) => change({ omega: v })} />
          <Slider label="קצב השינוי של ω" min={-1} max={1} step={0.25} value={s.alpha} format={(v) => `${num(v)} rad/s²`} onChange={(v) => change({ alpha: v })} />
          <Slider label="מרחק החיפושית מהמרכז" min={0} max={R_FORCES} step={0.05} value={s.r} format={(v) => `${num(v)} m`} onChange={(v) => change({ r: v })} />
          <Slider
            label="מהירות החיפושית ביחס לפטיפון (שלילית: פנימה)"
            min={-0.3}
            max={0.3}
            step={0.05}
            value={s.vp}
            format={(v) => `${num(v)} m/s`}
            onChange={(v) => change({ vp: Math.round(v * 100) / 100 })}
          />
        </>
      }
    />
  );
}

function forcesDescribe(s: ForcesState): string {
  const f = forceSet(s);
  const walk = s.vp === 0 ? 'עומדת' : s.vp > 0 ? `הולכת החוצה במהירות ${num(s.vp)} מטר לשנייה` : `הולכת פנימה במהירות ${num(-s.vp)} מטר לשנייה`;
  return `החיפושית במרחק ${num(s.r)} מטר מהמרכז ${walk}. הכוח האמיתי עליה ${num(len3(f.F))} מילי-ניוטון; הכוח הצנטריפוגלי ${num(len3(f.fcf))}, כוח קוריוליס ${num(len3(f.fcor))} וכוח אוילר ${num(len3(f.feuler))} מילי-ניוטון.`;
}

function paintForces(ctx: CanvasRenderingContext2D, view: View, p: Palette, s: ForcesState, L: Layout) {
  const { ppm } = view;
  const panels = makePanels(view, L, -0.15);
  const f = forceSet(s);
  const accTint = withAlpha(p.accel, 0.7);
  const fictTint = withAlpha(p.force, 0.65);
  const bx = s.r;
  const MIN = 3; // px: shorter arrows are not drawn or labelled
  const MIN_SHOWN = 24; // px: arrows between MIN and this are drawn at this length
  for (const pn of panels) {
    const inS = pn.frame === 'S';
    ctx.save();
    ctx.beginPath();
    ctx.rect(pn.x0, pn.y0, pn.w, pn.h);
    ctx.clip();
    panelBack(ctx, p, pn);
    drawRoom(ctx, p, pn, 0, ppm);
    drawDisk(ctx, p, pn, 0, ppm, false);
    drawTurn(ctx, p, pn, ppm, inS, inS ? 'ω' : 'החדר');
    const X = pn.sx(bx);
    const Y = pn.sy(0);
    const lp = new LabelPlacer(ctx, p, pn);
    lp.block(pn.sx(0), pn.sy(0), 16, 16);
    lp.block(X, Y, 26, 20);
    // the bug's body: a tangential arrow starts at its front or back edge, so two of them do not overlap, and on the
    // side of the body it points to, so the legs do not hide a short one
    const bugLen = Math.max(15, 0.06 * ppm);
    const edge = bugLen * 0.35;
    const side = bugLen * 0.3;
    type Drawn = [number, number, number, number] | null;
    const bodyArrow = (d: Vec3, scale: number, color: string, dash: boolean, offset: number): Drawn => {
      const px = len3(d) * scale * ppm;
      if (px < MIN) return null;
      // a short arrow is drawn at a minimum length, so its direction can be read (the readouts give the size)
      const k = px < MIN_SHOWN ? MIN_SHOWN / px : 1;
      const x0 = bx + offset / ppm;
      const y0 = offset !== 0 ? (Math.sign(d[1]) * side) / ppm : 0;
      const t = warrow(ctx, pn, x0, y0, scaleV(d, scale * k), { color, width: dash ? 2.2 : 3, dash, head: dash ? 9 : 11 });
      return [pn.sx(x0), pn.sy(y0), t[0], t[1]];
    };
    if (inS) {
      const T = f.terms;
      const cen = bodyArrow(T.centripetal, ACC_SCALE, accTint, true, 0);
      const cor = bodyArrow(T.coriolis, ACC_SCALE, accTint, true, -edge);
      const eul = bodyArrow(T.euler, ACC_SCALE, accTint, true, +edge);
      drawBug(ctx, p, X, Y, s.vp < 0 ? Math.PI : 0, ppm);
      const tot = bodyArrow(T.total, ACC_SCALE, p.accel, false, 0);
      for (const a of [cen, cor, eul, tot]) lp.blockArrow(a);
      if (tot) lp.math('a', tot, p.accel, 15);
      if (cen) lp.math('ω×(ω×r′)', cen, p.accel, 12, true);
      if (cor) lp.math('2ω×v′', cor, p.accel, 12, true);
      if (eul) lp.math('(dω/dt)×r′', eul, p.accel, 12, true);
    } else {
      // v′ along the line, just above the bug
      let vArrow: [number, number, number, number] | null = null;
      if (Math.abs(s.vp) > 1e-9) {
        const vt = warrow(ctx, pn, bx, 0.07, [s.vp * RATE_SCALE, 0, 0], { color: p.velocity, width: 2, head: 8 });
        vArrow = [pn.sx(bx), pn.sy(0.07), vt[0], vt[1]];
      }
      const cf = bodyArrow(f.fcf, FORCE_SCALE, fictTint, true, 0);
      const cor = bodyArrow(f.fcor, FORCE_SCALE, fictTint, true, -edge);
      const eu = bodyArrow(f.feuler, FORCE_SCALE, fictTint, true, +edge);
      drawBug(ctx, p, X, Y, s.vp < 0 ? Math.PI : 0, ppm);
      const F = bodyArrow(f.F, FORCE_SCALE, p.force, false, 0);
      for (const a of [vArrow, cf, cor, eu, F]) lp.blockArrow(a);
      if (vArrow) lp.math('v′', vArrow, p.velocity, 13);
      if (F) lp.math('F', F, p.force, 15);
      if (cf) lp.sub('F', 'cf', cf, p.force, 14);
      if (cor) lp.sub('F', 'cor', cor, p.force, 14);
      if (eu) lp.sub('F', 'Euler', eu, p.force, 14);
      mathText(ctx, p, 'a′ = 0', pn.x0 + 12, pn.y0 + pn.h - 16, { size: 13, color: p.ink2, align: 'left' });
    }
    panelTitle(ctx, p, pn, inS);
    ctx.restore();
  }
}
