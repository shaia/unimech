/**
 * CollisionTrack (lesson 4.1): two carts on a frictionless horizontal track collide head-on, seen from the lab
 * frame. Cart 1 starts on the left, cart 2 on the right; the x axis points right. The learner sets the masses,
 * the velocities before the collision and the coefficient of restitution e, and runs the collision.
 *
 * Above: the track, the carts (size grows with mass), each cart's velocity as an arrow (before the contact
 * v₁, v₂; after it v₁′, v₂′), and on request the centre of mass, which moves at one velocity throughout.
 * Below: the momentum of each cart and the total, before and after (the totals are equal); the kinetic energy
 * of each cart before and after, stacked, with the part lost in the collision shaded on the "after" bar, so
 * that both bars have the same length; the lost part is ½ μ (v₁ − v₂)² (1 − e²).
 *
 * Every number comes from src/physics/collisions.ts. Tasks tick only in the learner's own handler (the run
 * button); a text step sets the setup and the instant shown, never runs a collision.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  approaching,
  cmVelocity,
  collide,
  kineticEnergy,
  kineticEnergyLoss,
  momentum,
  type After,
} from '~/physics/collisions';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/** below this stage width (CSS px) the bars stack under each other and the stage is taller */
const NARROW_W = 520;
/** the track, in metres: it runs from −L to L */
const L = 3;
/** real seconds a run takes to play, from the start to the end of the window */
const PLAY = 2.6;

const TASK_LABEL: Record<string, string> = {
  exchange: 'הפעילו התנגשות אלסטית (e = 1) בין שתי עגלות שוות מסה, כשעגלה 2 עומדת. מה קורה לעגלה 1?',
  stick: 'הפעילו התנגשות פלסטית (e = 0). השוו את שני פסי האנרגיה ואת שני פסי התנע.',
  'bounce-back': 'מצאו מסות שבהן עגלה 1, שנעה ימינה, חוזרת שמאלה אחרי התנגשות אלסטית, והפעילו.',
  partial: 'הפעילו התנגשות עם e בין 0 ל-1. איזה חלק מהאנרגיה הקינטית אבד?',
};

export type Preset = 'elastic-equal' | 'heavy-light' | 'light-heavy' | 'plastic';

interface Setup {
  m1: number;
  m2: number;
  v1: number;
  v2: number;
  e: number;
}

const PRESETS: Record<Preset, { label: string; s: Setup }> = {
  'elastic-equal': { label: 'אלסטית, מסות שוות', s: { m1: 1, m2: 1, v1: 2, v2: 0, e: 1 } },
  'heavy-light': { label: 'כבדה פוגעת בקלה', s: { m1: 3, m2: 1, v1: 2, v2: 0, e: 1 } },
  'light-heavy': { label: 'קלה פוגעת בכבדה', s: { m1: 1, m2: 3, v1: 2, v2: 0, e: 1 } },
  plastic: { label: 'פלסטית', s: { m1: 1, m2: 1, v1: 2, v2: 0, e: 0 } },
};
const PRESET_IDS = Object.keys(PRESETS) as Preset[];

export interface CollisionTrackProps {
  id: string;
  preset?: Preset;
  m1?: number;
  m2?: number;
  v1?: number;
  v2?: number;
  e?: number;
  /** show the centre of mass on the track */
  cm?: boolean;
  /** the instant shown at the start, as a fraction of the window: −1 the start, 0 the contact, 1 the end */
  s?: number;
  tasks?: string[];
  taskLabels?: Record<string, string>;
}

const M_MIN = 0.5;
const M_MAX = 5;
const V_MIN = -3;
const V_MAX = 3;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
const roundTo = (x: number, step: number) => Number((Math.round(x / step) * step).toPrecision(10));
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number, tiny = 1e-9) => (Math.abs(x) <= tiny ? '0' : sci(x, 3).replace('-', '−'));
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** The collision as the figure reads it. */
interface Model {
  /** the setup's masses [kg] and velocities before [m/s] */
  mass1: number;
  mass2: number;
  setupV1: number;
  setupV2: number;
  meet: boolean;
  after: After;
  P: number;
  Pf: number;
  K1: number;
  K2: number;
  K1f: number;
  K2f: number;
  lost: number;
  V: number;
  /** cart widths [m] */
  w1: number;
  w2: number;
  /** half window [s], and the touching faces of the carts at an instant of it [m] */
  T: number;
  faces: (t: number) => [number, number];
}

const widthOf = (m: number) => 0.4 * Math.cbrt(m);

function modelOf(s: Setup): Model {
  const meet = approaching(s.v1, s.v2);
  const after = meet ? collide(s.m1, s.m2, s.v1, s.v2, s.e) : { v1: s.v1, v2: s.v2 };
  const w1 = widthOf(s.m1);
  const w2 = widthOf(s.m2);
  // the faces in contact are at c + v t: fit the whole run, both carts, inside the track
  // the faces that touch (cart 1's right side, cart 2's left side) at the instant t of a window [−T, T]: when the
  // carts meet, at c + v t, with the contact at t = 0; when they do not, a gap G apart at the start
  const G = 0.5;
  const facesAt = (t: number, T: number, c: number): [number, number] =>
    meet
      ? t <= 0
        ? [c + s.v1 * t, c + s.v2 * t]
        : [c + after.v1 * t, c + after.v2 * t]
      : [c - G / 2 + s.v1 * (t + T), c + G / 2 + s.v2 * (t + T)];
  // the whole run, both carts, fits inside the track: the extent is linear in T, a T + b
  const extent = (T: number, c: number) => {
    const ends = [-T, 0, T].map((t) => facesAt(t, T, c));
    return [Math.min(...ends.map((f) => f[0] - w1)), Math.max(...ends.map((f) => f[1] + w2))];
  };
  const span = (T: number) => {
    const [a, b] = extent(T, 0);
    return b - a;
  };
  const room = 2 * L - 0.3;
  const slope = span(1) - span(0);
  const T = slope > 1e-9 ? Math.max(0.05, Math.min(1.5, (room - span(0)) / slope)) : 1.5;
  const [a0, b0] = extent(T, 0);
  const c = -(a0 + b0) / 2;
  return {
    mass1: s.m1,
    mass2: s.m2,
    setupV1: s.v1,
    setupV2: s.v2,
    meet,
    after,
    P: momentum(s.m1, s.m2, s.v1, s.v2),
    Pf: momentum(s.m1, s.m2, after.v1, after.v2),
    K1: kineticEnergy(s.m1, s.v1),
    K2: kineticEnergy(s.m2, s.v2),
    K1f: kineticEnergy(s.m1, after.v1),
    K2f: kineticEnergy(s.m2, after.v2),
    lost: meet ? kineticEnergyLoss(s.m1, s.m2, s.v1, s.v2, s.e) : 0,
    V: cmVelocity(s.m1, s.m2, s.v1, s.v2),
    w1,
    w2,
    T,
    faces: (t: number) => facesAt(t, T, c),
  };
}

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Diagonal hatching inside a rectangle. */
function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  for (let k = -h; k < w + h; k += 5) {
    ctx.beginPath();
    ctx.moveTo(x + k, y + h);
    ctx.lineTo(x + k + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

export default function CollisionTrack(props: CollisionTrackProps) {
  const initialSetup = (): Setup => {
    const base = PRESETS[props.preset ?? 'elastic-equal'].s;
    return {
      m1: clamp(props.m1 ?? base.m1, M_MIN, M_MAX),
      m2: clamp(props.m2 ?? base.m2, M_MIN, M_MAX),
      v1: clamp(props.v1 ?? base.v1, V_MIN, V_MAX),
      v2: clamp(props.v2 ?? base.v2, V_MIN, V_MAX),
      e: clamp(props.e ?? base.e, 0, 1),
    };
  };
  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [cm, setCm] = useState<boolean>(props.cm ?? false);
  /** the instant shown when nothing plays, as a fraction of the half window: −1 … 1 */
  const [s, setS] = useState<number>(clamp(props.s ?? -1, -1, 1));
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState('');
  const [narrow, setNarrow] = useState(false);
  const t0 = useRef<number | null>(null);

  const model = modelOf(setup);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: props.taskLabels?.[id] ?? TASK_LABEL[id] ?? id }));
  const done = (t: string) => {
    if (props.tasks?.includes(t)) markTask(`${props.id}:${t}`);
  };

  // text steps set the setup and the instant shown; they never run a collision, so they never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        const pr = typeof st.preset === 'string' && st.preset in PRESETS ? PRESETS[st.preset as Preset].s : null;
        setSetup((prev) => {
          const b = pr ?? prev;
          return {
            m1: clamp(num(st.m1) ?? b.m1, M_MIN, M_MAX),
            m2: clamp(num(st.m2) ?? b.m2, M_MIN, M_MAX),
            v1: clamp(num(st.v1) ?? b.v1, V_MIN, V_MAX),
            v2: clamp(num(st.v2) ?? b.v2, V_MIN, V_MAX),
            e: clamp(num(st.e) ?? b.e, 0, 1),
          };
        });
        setCm((prev) => bool(st.cm) ?? prev);
        setPlaying(false);
        const phase = st.phase === 'before' ? -1 : st.phase === 'contact' ? 0 : st.phase === 'after' ? 1 : null;
        setS(phase ?? clamp(num(st.s) ?? -1, -1, 1));
      }),
    [props.id],
  );

  const describe = (m: Model) =>
    m.meet
      ? `אחרי ההתנגשות: עגלה 1 ב-${signed(m.after.v1)} מטר בשנייה, עגלה 2 ב-${signed(m.after.v2)} מטר בשנייה. התנע הכולל ${signed(m.P)} לפני ואחרי. אבדו ${sci(m.lost)} ג׳ול מתוך ${sci(m.K1 + m.K2)}.`
      : 'העגלות לא נפגשות: עגלה 1 צריכה לנוע ימינה מהר יותר מעגלה 2.';

  const finish = () => {
    setPlaying(false);
    setS(1);
    setLive(describe(model));
  };

  const run = () => {
    const st = setup;
    if (model.meet) {
      if (same(st.e, 1) && same(st.m1, st.m2) && same(st.v2, 0) && st.v1 > 0) done('exchange');
      if (same(st.e, 0)) done('stick');
      if (st.v1 > 0 && model.after.v1 < -1e-9 && same(st.e, 1)) done('bounce-back');
      if (st.e > 1e-9 && st.e < 1 - 1e-9) done('partial');
    }
    t0.current = null;
    if (!motionAllowed()) {
      finish();
      return;
    }
    setS(-1);
    setPlaying(true);
    setLive('העגלות נעות.');
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    const nar = W < NARROW_W;
    const fs = nar ? 11 : 12;
    let sNow = s;
    if (playing) {
      if (t0.current === null) t0.current = t;
      sNow = Math.min(-1 + (2 * (t - t0.current)) / PLAY, 1);
      if (sNow >= 1) finish();
    }
    const m = model;
    const tNow = sNow * m.T;
    const afterNow = m.meet && tNow > 0;

    /* ---------------- the track */
    const trackH = H * (nar ? 0.4 : 0.47);
    const margin = 14;
    const k = (W - 2 * margin) / (2 * L); // px per metre
    const X = (x: number) => W / 2 + x * k;
    const railY = trackH - (nar ? 22 : 26);
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin - 4, railY);
    ctx.lineTo(W - margin + 4, railY);
    ctx.stroke();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    for (let x = margin; x <= W - margin; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, railY + 1);
      ctx.lineTo(x - 5, railY + 7);
      ctx.stroke();
    }
    ctx.restore();
    haloText(ctx, p, 'x →', W - margin, railY + 15, { font: `italic 600 ${fs}px ${p.fontUi}`, color: p.ink2, align: 'right' });
    // the centre of mass, when shown, moves under the rail: the note then gives way to it
    if (!cm) handNote(ctx, 'מסילה בלי חיכוך', nar ? W * 0.3 : W * 0.22, railY + 16, p, nar ? 11 : 13);

    // the faces in contact are at c + v t; before the contact each cart moves with its own velocity
    const [face1, face2] = m.faces(tNow);
    const cartHpx = (w: number) => Math.max(14, Math.min(0.55 * w * k, trackH * 0.3));
    const wheel = nar ? 3 : 4;
    const drawCart = (left: number, w: number, color: string, tag: string) => {
      const x0 = X(left);
      const wpx = w * k;
      const h = cartHpx(w);
      const y0 = railY - 2 * wheel - h;
      ctx.save();
      ctx.fillStyle = withAlpha(color, 0.85);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.2;
      roundRect(ctx, x0, y0, wpx, h, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = p.ink;
      for (const fx of [0.22, 0.78]) {
        ctx.beginPath();
        ctx.arc(x0 + fx * wpx, railY - wheel, wheel, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      haloText(ctx, p, tag, x0 + wpx / 2, y0 + h / 2, { font: `600 ${wpx > 34 ? fs + 1 : fs - 1}px ${p.fontUi}`, color: p.ink });
      return { x0, wpx, y0, h };
    };
    const c1 = drawCart(face1 - m.w1, m.w1, p.accent, m.w1 * k > 34 ? 'm₁' : '1');
    const c2 = drawCart(face2, m.w2, p.ink3, m.w2 * k > 34 ? 'm₂' : '2');

    // the velocity of each cart, an arrow above it: cart 1's lower, cart 2's higher, so they never meet
    const vMaxSeen = Math.max(1, Math.abs(m.setupV1), Math.abs(m.setupV2), Math.abs(m.after.v1), Math.abs(m.after.v2));
    const kv = (nar ? 0.2 : 0.16) * W / vMaxSeen;
    const topY = Math.min(c1.y0, c2.y0);
    const lvl1 = topY - 10;
    const lvl2 = topY - (nar ? 30 : 32);
    const vel = (cx: number, y: number, v: number, name: string) => {
      const font = `italic 600 ${fs + 1}px ${p.fontUi}`;
      if (Math.abs(v) < 1e-9) {
        ctx.save();
        ctx.fillStyle = p.velocity;
        ctx.beginPath();
        ctx.arc(cx, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        const right = cx + 64 < W - 6;
        haloText(ctx, p, `${name} = 0`, right ? cx + 6 : cx - 6, y, { font, color: p.velocity, align: right ? 'left' : 'right' });
        return;
      }
      const len = Math.sign(v) * Math.max(16, Math.abs(v) * kv);
      // the arrow starts over its cart, shifted along the track only as far as it takes to keep it on the canvas
      cx = clamp(cx, 10 - Math.min(0, len), W - 10 - Math.max(0, len));
      arrow(ctx, cx, y, cx + len, y, { color: p.velocity, width: 2.4, head: 9 });
      // the name beyond the tip, unless that runs off the canvas: then before the tail
      const tip = cx + len + Math.sign(len) * 5;
      const off = tip < 8 + 22 || tip > W - 8 - 22;
      haloText(ctx, p, name, off ? cx - Math.sign(len) * 5 : tip, y, { font, color: p.velocity, align: (off ? len < 0 : len > 0) ? 'left' : 'right' });
    };
    vel(c1.x0 + c1.wpx / 2, lvl1, afterNow ? m.after.v1 : m.setupV1, afterNow ? 'v₁′' : 'v₁');
    vel(c2.x0 + c2.wpx / 2, lvl2, afterNow ? m.after.v2 : m.setupV2, afterNow ? 'v₂′' : 'v₂');

    // the centre of mass: a triangle under the rail, moving at V all the time
    if (cm) {
      const xc1 = face1 - m.w1 / 2;
      const xc2 = face2 + m.w2 / 2;
      const xcm = (m.mass1 * xc1 + m.mass2 * xc2) / (m.mass1 + m.mass2);
      const px = X(xcm);
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.moveTo(px, railY + 3);
      ctx.lineTo(px - 6, railY + 13);
      ctx.lineTo(px + 6, railY + 13);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      haloText(ctx, p, 'CM', px + 9, railY + 10, { font: `600 ${fs - 1}px ${p.fontUi}`, color: p.ink, align: 'left' });
    }

    if (!m.meet) handNote(ctx, 'העגלות לא נפגשות', W / 2, nar ? 22 : 24, p, nar ? 13 : 15);
    else if (Math.abs(sNow) < 0.04) handNote(ctx, 'מגע', X(m.faces(0)[0]), lvl2 - 16 > 8 ? lvl2 - 16 : 12, p, nar ? 12 : 14);

    /* ---------------- the bars: momentum and kinetic energy, before and after */
    const top = trackH + 4;
    const blocks = nar
      ? [
          { x: 6, y: top, w: W - 12, h: (H - top) * 0.5 - 4 },
          { x: 6, y: top + (H - top) * 0.5, w: W - 12, h: (H - top) * 0.5 - 6 },
        ]
      : [
          { x: 8, y: top, w: W / 2 - 14, h: H - top - 8 },
          { x: W / 2 + 6, y: top, w: W / 2 - 14, h: H - top - 8 },
        ];
    for (const b of blocks) {
      ctx.save();
      ctx.strokeStyle = p.rule;
      ctx.lineWidth = 1;
      roundRect(ctx, b.x, b.y, b.w, b.h, 6);
      ctx.stroke();
      ctx.restore();
    }
    const fade = m.meet && sNow <= 0 && !afterNow ? 0.35 : 1;
    const lab = nar ? 38 : 44;
    const rowLabel = (txt: string, b: { x: number }, y: number, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      handNote(ctx, txt, b.x + lab / 2 + 2, y, p, nar ? 12 : 13);
      ctx.restore();
    };
    const small = `italic 600 ${fs}px ${p.fontUi}`;

    // momentum: in each row the momentum of cart 1, of cart 2 (thin), and the total (thick), all from one zero
    {
      const b = blocks[0];
      handNote(ctx, 'תנע', b.x + b.w / 2, b.y + 12, p, nar ? 13 : 14);
      const vals = [m.mass1 * m.setupV1, m.mass2 * m.setupV2, m.P, m.mass1 * m.after.v1, m.mass2 * m.after.v2, m.Pf];
      const lo = Math.min(0, ...vals);
      const hi = Math.max(0, ...vals);
      // room on both sides for the names beyond the tips
      const x0 = b.x + lab + 28;
      const x1 = b.x + b.w - 28;
      const sc = (x1 - x0) / Math.max(hi - lo, 1e-9);
      const zx = x0 - lo * sc;
      const rowsTop = b.y + 26;
      const rowH = (b.h - 30) / 2;
      const thin = Math.max(5, Math.min(8, rowH * 0.16));
      const thick = Math.max(8, Math.min(13, rowH * 0.26));
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(zx, rowsTop - 2);
      ctx.lineTo(zx, rowsTop + 2 * rowH - 4);
      ctx.stroke();
      ctx.restore();
      const bar = (v: number, y: number, h: number, alpha: number, name: string, a: number) => {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = withAlpha(p.momentum, alpha);
        const w = v * sc;
        ctx.fillRect(Math.min(zx, zx + w), y - h / 2, Math.abs(w), h);
        // cart 2: a tint inside a full-strength outline, so it never reads as the dimmed "after" row (dark theme)
        if (alpha < 0.9 && Math.abs(w) > 1) {
          ctx.strokeStyle = p.momentum;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(Math.min(zx, zx + w) + 0.75, y - h / 2 + 0.75, Math.abs(w) - 1.5, h - 1.5);
        }
        ctx.restore();
        const right = v >= 0;
        ctx.save();
        ctx.globalAlpha = a;
        haloText(ctx, p, name, zx + w + (right ? 4 : -4), y, { font: small, color: p.momentum, align: right ? 'left' : 'right' });
        ctx.restore();
      };
      const row = (r: number, v1: number, v2: number, P: number, a: number, primed: boolean) => {
        const y = rowsTop + r * rowH;
        const gap = (rowH - 2 * thin - thick) / 4;
        rowLabel(r === 0 ? 'לפני' : 'אחרי', b, y + rowH / 2 - 4, a);
        bar(v1, y + gap + thin / 2, thin, 0.95, primed ? 'p₁′' : 'p₁', a);
        bar(v2, y + 2 * gap + thin * 1.5, thin, 0.35, primed ? 'p₂′' : 'p₂', a);
        bar(P, y + 3 * gap + 2 * thin + thick / 2, thick, 1, primed ? 'P′' : 'P', a);
      };
      row(0, m.mass1 * m.setupV1, m.mass2 * m.setupV2, m.P, 1, false);
      row(1, m.mass1 * m.after.v1, m.mass2 * m.after.v2, m.Pf, fade, true);
    }

    // kinetic energy: one stacked bar per row; after the collision the lost part is shaded, so the rows are equal
    {
      const b = blocks[1];
      handNote(ctx, 'אנרגיה קינטית', b.x + b.w / 2, b.y + 12, p, nar ? 13 : 14);
      const Ki = m.K1 + m.K2;
      const x0 = b.x + lab + 10;
      const x1 = b.x + b.w - 14;
      const sc = (x1 - x0) / Math.max(Ki, 1e-9);
      const rowsTop = b.y + 26;
      const rowH = (b.h - 30) / 2;
      const h = Math.max(12, Math.min(22, rowH * 0.42));
      const seg = (x: number, w: number, y: number, color: string, alpha: number, name: string, a: number) => {
        if (w <= 0.3) return;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = withAlpha(color, alpha);
        ctx.fillRect(x, y - h / 2, w, h);
        // cart 2: a tint inside a full-strength outline, as in the momentum panel
        if (alpha < 0.9 && w > 1.5) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 0.75, y - h / 2 + 0.75, w - 1.5, h - 1.5);
        }
        ctx.restore();
        if (w > 26) {
          ctx.save();
          ctx.globalAlpha = a;
          haloText(ctx, p, name, x + w / 2, y, { font: small, color: p.ink });
          ctx.restore();
        }
      };
      const yb = rowsTop + rowH * 0.45;
      const ya = rowsTop + rowH * 1.45;
      rowLabel('לפני', b, yb, 1);
      rowLabel('אחרי', b, ya, fade);
      seg(x0, m.K1 * sc, yb, p.energyK, 0.95, 'K₁', 1);
      seg(x0 + m.K1 * sc, m.K2 * sc, yb, p.energyK, 0.35, 'K₂', 1);
      seg(x0, m.K1f * sc, ya, p.energyK, 0.95, 'K₁′', fade);
      seg(x0 + m.K1f * sc, m.K2f * sc, ya, p.energyK, 0.35, 'K₂′', fade);
      const lx = x0 + (m.K1f + m.K2f) * sc;
      const lw = m.lost * sc;
      if (lw > 0.5) {
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.fillStyle = withAlpha(p.energyTh, 0.18);
        ctx.fillRect(lx, ya - h / 2, lw, h);
        hatch(ctx, lx, ya - h / 2, lw, h, withAlpha(p.energyTh, 0.8));
        ctx.strokeStyle = p.energyTh;
        ctx.lineWidth = 1;
        ctx.strokeRect(lx, ya - h / 2, lw, h);
        ctx.restore();
        if (lw > 40) {
          ctx.save();
          ctx.globalAlpha = fade;
          handNote(ctx, 'אבדה', lx + lw / 2, ya + h / 2 + 10, p, nar ? 12 : 13);
          ctx.restore();
        }
      }
      // the initial energy, a dashed line through both rows
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + Ki * sc, yb - h / 2 - 4);
      ctx.lineTo(x0 + Ki * sc, ya + h / 2 + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, yb - h / 2 - 4);
      ctx.lineTo(x0, ya + h / 2 + 4);
      ctx.stroke();
      ctx.restore();
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 16 / 9, worldHeight: 1, animate: playing });
  useEffect(invalidate, [setup, s, playing, cm, narrow]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      setNarrow(w > 0 && w < NARROW_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const change = (f: (st: Setup) => Setup) => {
    setPlaying(false);
    setS(-1);
    setSetup((st) => f(st));
  };
  const setM1 = (v: number) => change((st) => ({ ...st, m1: clamp(roundTo(v, 0.1), M_MIN, M_MAX) }));
  const setM2 = (v: number) => change((st) => ({ ...st, m2: clamp(roundTo(v, 0.1), M_MIN, M_MAX) }));
  const setV1 = (v: number) => change((st) => ({ ...st, v1: clamp(roundTo(v, 0.1), V_MIN, V_MAX) }));
  const setV2 = (v: number) => change((st) => ({ ...st, v2: clamp(roundTo(v, 0.1), V_MIN, V_MAX) }));
  const setE = (v: number) => change((st) => ({ ...st, e: clamp(roundTo(v, 0.05), 0, 1) }));
  const scrub = (v: number) => {
    setPlaying(false);
    setS(clamp(v, -1, 1));
  };
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') run();
    else if (ev.key === 'ArrowUp') setE(setup.e + 0.05);
    else if (ev.key === 'ArrowDown') setE(setup.e - 0.05);
    else return;
    ev.preventDefault();
  };

  const presetOn = (id: Preset) => {
    const b = PRESETS[id].s;
    return same(b.m1, setup.m1) && same(b.m2, setup.m2) && same(b.v1, setup.v1) && same(b.v2, setup.v2) && same(b.e, setup.e);
  };
  const Ki = model.K1 + model.K2;
  const label = `איור חי: עגלה במסה ${sci(setup.m1)} קילוגרם במהירות ${signed(setup.v1)} מטר בשנייה ועגלה במסה ${sci(setup.m2)} קילוגרם במהירות ${signed(setup.v2)} מטר בשנייה, על מסילה בלי חיכוך, עם מקדם תקומה ${sci(setup.e)}. ${describe(model)} Enter מפעיל, חץ למעלה ולמטה משנה את מקדם התקומה.`;

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={narrow ? 0.8 : 16 / 9}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onReset={() => {
        setSetup(initialSetup());
        setCm(props.cm ?? false);
        setPlaying(false);
        setS(clamp(props.s ?? -1, -1, 1));
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={
        model.meet ? (
          <>
            <span class="q" data-readout="v1p">
              v₁′ = <b>{signed(model.after.v1)} m/s</b>
            </span>
            <span class="q" data-readout="v2p">
              v₂′ = <b>{signed(model.after.v2)} m/s</b>
            </span>
            <span class="q" data-readout="p">
              P = P′ = <b>{signed(model.P)} kg·m/s</b>
            </span>
            <span class="q" data-readout="k">
              K = <b>{sci(Ki)} J</b> → K′ = <b>{sci(model.K1f + model.K2f, 3)} J</b>
            </span>
            <span>
              אבדה{' '}
              <b class="q" data-readout="lost">
                {signed(model.lost)} J
              </b>
            </span>
            <span>
              מתוך האנרגיה{' '}
              <b class="q" data-readout="frac">
                {signed((100 * model.lost) / Ki)}%
              </b>
            </span>
            {cm && (
              <span class="q" data-readout="vcm">
                v<sub>CM</sub> = <b>{signed(model.V)} m/s</b>
              </span>
            )}
          </>
        ) : (
          <span data-readout="none">העגלות לא נפגשות: כדי שיתנגשו, עגלה 1 צריכה לנוע ימינה מהר יותר מעגלה 2.</span>
        )
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מצבים מוכנים">
            {PRESET_IDS.map((id) => (
              <Toggle key={id} label={PRESETS[id].label} on={presetOn(id)} onChange={() => change(() => ({ ...PRESETS[id].s }))} />
            ))}
          </div>
          <Slider label="מסה m₁" value={setup.m1} min={M_MIN} max={M_MAX} step={0.1} format={(x) => `${sci(x)} kg`} onChange={setM1} />
          <Slider label="מסה m₂" value={setup.m2} min={M_MIN} max={M_MAX} step={0.1} format={(x) => `${sci(x)} kg`} onChange={setM2} />
          <Slider label="מהירות v₁" value={setup.v1} min={V_MIN} max={V_MAX} step={0.1} format={(x) => `${signed(x)} m/s`} onChange={setV1} />
          <Slider label="מהירות v₂" value={setup.v2} min={V_MIN} max={V_MAX} step={0.1} format={(x) => `${signed(x)} m/s`} onChange={setV2} />
          <Slider label="מקדם תקומה e" value={setup.e} min={0} max={1} step={0.05} format={(x) => sci(x, 2)} onChange={setE} />
          <Slider label="זמן" value={s} min={-1} max={1} step={0.02} format={(x) => `${signed(x * model.T, 1e-6)} s`} onChange={scrub} />
          <div class="group" role="group" aria-label="הפעלה ותצוגה">
            <button type="button" class="btn primary" onClick={run}>
              הפעלה
            </button>
            <Toggle label="מרכז המסה" on={cm} onChange={setCm} />
          </div>
        </>
      }
    />
  );
}
