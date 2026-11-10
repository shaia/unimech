/**
 * FrictionRamp (lesson 2.4): dry friction in three scenes.
 *
 * - 'pull': a block on a level floor pulled by a rope with force F at angle φ above the horizontal. Below it,
 *   the friction against F: static friction follows F cos φ up to μs N, then the block breaks free and the
 *   friction drops to μk N. The learner sees that μs N is a ceiling, not the value.
 * - 'incline': a block on a slope whose angle the learner tilts. Static friction grows as mg sin θ until it
 *   reaches μs mg cos θ at tan θ = μs; then the block slides down with kinetic friction. A gauge shows the
 *   friction against its ceiling; changing the mass moves both together.
 * - 'stack': block A on block B, B on a smooth floor, a force F on B or on A. Two free-body diagrams, one per
 *   body, show the friction pair: on A it points forward when B is pulled (friction in the direction of the
 *   motion). Past the largest common pull the blocks slide on each other.
 *
 * Every number comes from src/physics/friction.ts. Motion runs only while motionAllowed(); in still mode the
 * figure shows the regime the block ends up in (sliding, or at rest) without animating it.
 *
 * Tasks tick only for quantities the learner changed with the controls (`touched`), never for a state that a
 * text step set: a step clears `touched` and sets the state, so a step can never tick a task.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import { frictionAtRest, stack, stepSlider, thresholdAngle, type StackState } from '~/physics/friction';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps, type StepState } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { sci } from './core/format';
import { arrow, handNote, withAlpha } from './core/ink';
import { drawAxes, insetBox, makePlot, niceTicks } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/** below this stage width (CSS px) the scenes use their narrow layouts */
const NARROW_W = 520;
const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bool = (x: unknown): boolean | null => (typeof x === 'boolean' ? x : null);
/** A readout number: 3 significant figures, a true minus sign, and no "−0". */
const signed = (x: number) => (Math.abs(x) < 0.005 ? '0' : sci(x, 3).replace('-', '−'));

const TASK_LABEL: Record<string, string> = {
  'static-match': 'הגדילו את הכוח בהדרגה, בלי שהגוש יזוז, וקראו את החיכוך בשלושה ערכים שונים של F. למה הוא שווה?',
  'break-free': 'הגדילו את הכוח עד שהגוש מתחיל להחליק. מה קרה לחיכוך ברגע הזה?',
  'tilt-slip': 'הטו את המדרון לאט, עד שהגוש מתחיל להחליק. קראו את הזווית.',
  'mass-same': 'הטו את המדרון קרוב לסף (עד שלוש מעלות מתחתיו), ושנו את המסה. האם הגוש מחליק?',
  'together-forward': 'משכו את B, התחתון, בכוח קרוב לכוח המרבי, כך שהגושים עוד נעים יחד. לאן פונה החיכוך על A?',
  'slip-bottom': 'משכו את B בכוח גדול מהכוח המרבי, כך שהגושים מחליקים זה על זה.',
  'pull-top': 'עברו למשיכה של A, העליון, ומצאו כוח שבו הגושים מחליקים. השוו לכוח המרבי כשמשכו את B.',
};

export type FrictionMode = 'pull' | 'incline' | 'stack';

export interface FrictionRampProps {
  id: string;
  mode: FrictionMode;
  /** the block's mass [kg] (pull, incline) */
  m?: number;
  mus?: number;
  muk?: number;
  /** pull: the rope's force [N] and angle above the horizontal [deg]; the slider's top force */
  F?: number;
  phi?: number;
  FMax?: number;
  /** incline: the slope angle [deg] */
  theta?: number;
  /** stack: the masses [kg] and which block the force acts on */
  mA?: number;
  mB?: number;
  on?: 'A' | 'B';
  /** incline: show mg sin θ and mg cos θ */
  parts?: boolean;
  tasks?: string[];
}

interface State {
  m: number;
  F: number;
  phi: number;
  theta: number;
  on: 'A' | 'B';
  parts: boolean;
  /** position along the surface [m] and velocity [m/s] of the block (pull, incline), or of A relative to B (stack) */
  s: number;
  v: number;
  /** the block slides (or A slides on B) */
  moving: boolean;
}

/**
 * Canvas text with a paper-coloured halo; Latin and math labels only (LTR). Hebrew goes through handNote.
 * `_X` sets the one character X as a subscript (Unicode has no subscript capitals): 'a_A', 'm_Ag'.
 */
function label(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, color: string, size = 13, align: CanvasTextAlign = 'center') {
  // runs of [text, subscript?]
  const runs: [string, boolean][] = [];
  for (const part of s.split(/(_.)/)) {
    if (!part) continue;
    if (part.startsWith('_') && part.length === 2) runs.push([part[1], true]);
    else runs.push([part, false]);
  }
  const subSize = Math.round(size * 0.72);
  const fontOf = (sub: boolean) => `italic 600 ${sub ? subSize : size}px ${p.fontUi}`;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.fillStyle = color;
  const widths = runs.map(([t, sub]) => {
    ctx.font = fontOf(sub);
    return ctx.measureText(t).width;
  });
  const total = widths.reduce((a, b) => a + b, 0);
  const cx = align === 'center' ? x - total / 2 : align === 'right' || align === 'end' ? x - total : x;
  // halos first, then the ink, so a halo never covers the run before it
  for (const pass of ['halo', 'ink'] as const) {
    let px = cx;
    runs.forEach(([t, sub], i) => {
      ctx.font = fontOf(sub);
      const py = sub ? y + size * 0.3 : y;
      if (pass === 'halo') ctx.strokeText(t, px, py);
      else ctx.fillText(t, px, py);
      px += widths[i];
    });
  }
  ctx.restore();
}

/** A block drawn as a rectangle rotated by `ang` (radians, counter-clockwise on screen), centred at (cx, cy). */
function block(ctx: CanvasRenderingContext2D, p: Palette, cx: number, cy: number, w: number, h: number, ang: number, name?: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-ang);
  ctx.fillStyle = withAlpha(p.equip, 0.55);
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.6;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
  if (name) label(ctx, p, name, cx, cy, p.ink, 14);
}

export default function FrictionRamp(props: FrictionRampProps) {
  const mode = props.mode;
  const mus = props.mus ?? 0.6;
  const muk = Math.min(props.muk ?? 0.4, mus);
  const F_TOP = props.FMax ?? (mode === 'stack' ? 24 : 40);
  const mA = props.mA ?? 1;
  const mB = props.mB ?? 3;
  const TRACK = 1.6; // incline: the length of slope the block can slide [m]

  const initial = (): State => ({
    m: props.m ?? 2,
    F: clamp(props.F ?? 0, 0, F_TOP),
    phi: props.phi ?? 0,
    theta: props.theta ?? 10,
    on: props.on ?? 'B',
    parts: props.parts ?? false,
    s: 0,
    v: 0,
    moving: false,
  });
  /** the rules that start and stop sliding, applied after every change */
  const settle = (s: State): State => {
    if (mode === 'stack') {
      const k = stack({ mA, mB, mus, muk, F: s.F, on: s.on });
      return k.together ? { ...s, moving: false, s: 0, v: 0 } : { ...s, moving: true };
    }
    if (mode === 'incline' && s.s >= TRACK - 1e-9) return { ...s, moving: false, v: 0 };
    const N = mode === 'incline' ? s.m * G * Math.cos(rad(s.theta)) : Math.max(0, s.m * G - s.F * Math.sin(rad(s.phi)));
    const drive = mode === 'incline' ? s.m * G * Math.sin(rad(s.theta)) : s.F * Math.cos(rad(s.phi));
    if (!s.moving && !frictionAtRest(drive, N, { mus, muk }).holds) return { ...s, moving: true };
    // in still mode nothing integrates: a block whose drive is below μk N would slow down and stop, so show it stopped
    if (s.moving && !motionAllowed() && drive < muk * N) return { ...s, moving: false, v: 0 };
    return s;
  };

  const [st, setSt] = useState<State>(() => settle(initial()));
  const [live, setLive] = useState('');
  const touched = useRef(new Set<string>());
  const seenStatic = useRef(new Set<number>());
  const lastT = useRef<number | null>(null);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  /* ---------- the physics of the current state ---------- */
  // pull and incline: the force along the surface (drive, along +s) and the normal force
  const pullN = Math.max(0, st.m * G - st.F * Math.sin(rad(st.phi)));
  const surface =
    mode === 'incline'
      ? { drive: st.m * G * Math.sin(rad(st.theta)), N: st.m * G * Math.cos(rad(st.theta)) }
      : { drive: st.F * Math.cos(rad(st.phi)), N: pullN };
  const fMax = mus * surface.N;
  const fKin = muk * surface.N;
  const breaks = !frictionAtRest(surface.drive, surface.N, { mus, muk }).holds;
  /** friction on the block along +s [N]: static −drive at rest, kinetic −μk N while it slides forward */
  const fNow = st.moving ? -fKin : -surface.drive;
  const aNow = st.moving ? (surface.drive - fKin) / st.m : 0;
  const atBottom = mode === 'incline' && st.s >= TRACK - 1e-9;
  const stk: StackState | null = mode === 'stack' ? stack({ mA, mB, mus, muk, F: st.F, on: st.on }) : null;

  const change = (patch: Partial<State>) => {
    for (const k of Object.keys(patch)) touched.current.add(k);
    setSt((prev) => settle({ ...prev, ...patch }));
  };

  // text steps set the scene; they clear what the learner touched and put the block back at rest
  useEffect(
    () =>
      subscribeSteps(props.id, (s: StepState) => {
        touched.current.clear();
        setSt((prev) =>
          settle({
            ...prev,
            m: clamp(num(s.m) ?? prev.m, 0.5, 5),
            F: clamp(num(s.F) ?? prev.F, 0, F_TOP),
            phi: clamp(num(s.phi) ?? prev.phi, 0, 60),
            theta: clamp(num(s.theta) ?? prev.theta, 0, 50),
            on: s.on === 'A' || s.on === 'B' ? s.on : prev.on,
            parts: bool(s.parts) ?? prev.parts,
            s: 0,
            v: 0,
            moving: false,
          }),
        );
      }),
    [props.id],
  );

  // tasks
  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const own = (...keys: string[]) => keys.some((k) => touched.current.has(k));
    if (mode === 'pull') {
      if (has('static-match') && own('F') && !st.moving && st.F > 0) {
        seenStatic.current.add(Math.round(st.F * 2));
        if (seenStatic.current.size >= 3) done('static-match');
      }
      if (has('break-free') && own('F', 'phi') && st.moving) done('break-free');
    }
    if (mode === 'incline') {
      const th = thresholdAngle(mus);
      if (has('tilt-slip') && own('theta') && st.moving) done('tilt-slip');
      if (has('mass-same') && own('m') && !st.moving && st.theta >= th - 3 && st.theta < th) done('mass-same');
    }
    if (mode === 'stack' && stk) {
      if (has('together-forward') && own('F') && st.on === 'B' && stk.together && st.F >= 0.8 * stk.Fmax) done('together-forward');
      if (has('slip-bottom') && own('F') && st.on === 'B' && !stk.together) done('slip-bottom');
      if (has('pull-top') && own('on') && st.on === 'A' && !stk.together) done('pull-top');
    }
  }, [st]);

  // the screen-reader line, after the controls settle
  useEffect(() => {
    const h = setTimeout(() => setLive(describe()), 600);
    return () => clearTimeout(h);
  }, [st]);

  function describe(): string {
    if (mode === 'stack' && stk) {
      return stk.together
        ? `הגושים נעים יחד בתאוצה ${sci(stk.aA)} מטר לשנייה בריבוע. החיכוך על A הוא ${sci(Math.abs(stk.fOnA))} ניוטון, ${stk.fOnA > 0 ? 'קדימה' : 'אחורה'}.`
        : `הגושים מחליקים זה על זה. התאוצה של A ${sci(stk.aA)} ושל B ${sci(stk.aB)} מטר לשנייה בריבוע. החיכוך הקינטי על A ${sci(Math.abs(stk.fOnA))} ניוטון, ${stk.fOnA > 0 ? 'קדימה' : 'אחורה'}.`;
    }
    if (st.moving) return `הגוש מחליק. החיכוך קינטי, ${sci(fKin)} ניוטון, והתאוצה ${sci(aNow)} מטר לשנייה בריבוע.`;
    if (atBottom) return 'הגוש הגיע לתחתית המדרון ונעצר על המעצור.';
    return `הגוש במנוחה. החיכוך סטטי, ${sci(Math.abs(fNow))} ניוטון, והערך המרבי שלו ${sci(fMax)} ניוטון.`;
  }

  /* ---------- motion ---------- */
  const advance = (t: number) => {
    if (lastT.current === null) {
      lastT.current = t;
      return;
    }
    const dt = Math.min(0.05, t - lastT.current);
    lastT.current = t;
    if (dt <= 0) return;
    setSt((prev) => {
      if (!prev.moving) return prev;
      if (mode === 'stack') {
        const k = stack({ mA, mB, mus, muk, F: prev.F, on: prev.on });
        const arel = k.aA - k.aB;
        let v = prev.v + arel * dt;
        let s = prev.s + prev.v * dt + 0.5 * arel * dt * dt;
        // A has reached the edge of B: the picture starts over (the blocks would part here)
        if (Math.abs(s) > 0.26) {
          s = 0;
          v = 0;
        }
        return { ...prev, s, v };
      }
      const N = mode === 'incline' ? prev.m * G * Math.cos(rad(prev.theta)) : Math.max(0, prev.m * G - prev.F * Math.sin(rad(prev.phi)));
      const drive = mode === 'incline' ? prev.m * G * Math.sin(rad(prev.theta)) : prev.F * Math.cos(rad(prev.phi));
      // a block that broke free starts from v = 0⁺ in the direction of the drive
      const v0 = prev.v === 0 ? 1e-9 * Math.sign(drive) : prev.v;
      const next = stepSlider({ s: prev.s, v: v0 }, { m: prev.m, drive, N, mus, muk }, dt);
      if (mode === 'incline' && next.s >= TRACK) return { ...prev, s: TRACK, v: 0, moving: false };
      return { ...prev, s: next.s, v: next.v, moving: next.v !== 0 };
    });
  };

  /* ---------- drawing ---------- */
  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    if (st.moving && motionAllowed()) advance(t);
    else lastT.current = null;
    const narrow = view.w < NARROW_W;
    const fs = narrow ? 11 : 13;
    if (mode === 'pull') drawPull(ctx, view.w, view.h, p, fs, narrow);
    else if (mode === 'incline') drawIncline(ctx, view.w, view.h, p, fs, narrow);
    else drawStack(ctx, view.w, view.h, p, fs, narrow);
  };

  function drawPull(ctx: CanvasRenderingContext2D, W: number, H: number, p: Palette, fs: number, narrow: boolean) {
    // the scene: the top 42 %
    const floorY = H * 0.36;
    const bw = Math.min(110, W * 0.2);
    const bh = bw * 0.6;
    const cx = W * 0.42;
    const cy = floorY - bh / 2;
    // the floor, its marks scrolling with the block's position
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(8, floorY);
    ctx.lineTo(W - 8, floorY);
    ctx.stroke();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    const step = 40;
    const off = ((st.s * 60) % step + step) % step; // the floor's marks move 60 px per metre
    for (let x = 8 - off; x < W - 8; x += step) {
      if (x < 8) continue;
      ctx.beginPath();
      ctx.moveTo(x, floorY);
      ctx.lineTo(x - 8, floorY + 9);
      ctx.stroke();
    }
    ctx.restore();
    block(ctx, p, cx, cy, bw, bh, 0, 'm');
    // forces on the block, one scale: the largest of mg and the slider's top force fits
    const k = (H * 0.12) / Math.max(st.m * G, F_TOP);
    const col = p.force;
    arrow(ctx, cx, cy, cx, cy + k * st.m * G, { color: col, width: 2.4, head: 9 });
    label(ctx, p, 'mg', cx + 16, cy + k * st.m * G - 4, col, fs + 1, 'left');
    if (pullN > 0) {
      arrow(ctx, cx - bw * 0.25, floorY, cx - bw * 0.25, floorY - k * pullN, { color: col, width: 2.4, head: 9 });
      label(ctx, p, 'N', cx - bw * 0.25 - 12, floorY - k * pullN + 4, col, fs + 1);
    }
    if (st.F > 0) {
      const ex = cx + bw / 2;
      const ux = Math.cos(rad(st.phi));
      const uy = Math.sin(rad(st.phi));
      // the rope, then the force it exerts
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(ex, cy);
      ctx.lineTo(ex + (k * st.F + 30) * ux, cy - (k * st.F + 30) * uy);
      ctx.stroke();
      ctx.restore();
      arrow(ctx, ex, cy, ex + k * st.F * ux, cy - k * st.F * uy, { color: col, width: 2.4, head: 9 });
      label(ctx, p, 'F', ex + k * st.F * ux + 8, cy - k * st.F * uy - 12, col, fs + 1);
    }
    if (Math.abs(fNow) > 1e-6) {
      const fx = cx - bw * 0.05;
      arrow(ctx, fx, floorY - 2, fx + k * fNow, floorY - 2, { color: col, width: 2.4, head: 9 });
      label(ctx, p, st.moving ? 'fₖ' : 'fₛ', fx + k * fNow - 10, floorY + 13, col, fs + 1);
    }
    if (st.moving && Math.abs(aNow) > 1e-6) {
      arrow(ctx, cx, cy - bh / 2 - 14, cx + 22 * Math.sign(aNow) * Math.min(3, 0.6 + Math.abs(aNow)), cy - bh / 2 - 14, { color: p.accel, width: 2, head: 8 });
      label(ctx, p, 'a', cx - 10, cy - bh / 2 - 14, p.accel, fs);
    }
    handNote(ctx, st.moving ? 'מחליק' : 'במנוחה', W * 0.5, 22, p, narrow ? 13 : 16);

    // the graph: friction against the pull
    const outer = { x: 8, y: H * 0.45, w: W - 16, h: H * 0.55 - 6 };
    const box = insetBox(outer, { l: 52, r: 14, t: 8, b: 42 });
    const yTop = Math.max(st.m * G * mus, 5) * 1.15;
    const plot = makePlot(
      box,
      { min: 0, max: F_TOP, label: 'הכוח F (N)', ticks: niceTicks(0, F_TOP, narrow ? 4 : 8) },
      { min: 0, max: yTop, label: 'החיכוך (N)', ticks: niceTicks(0, yTop, 4) },
    );
    drawAxes(ctx, plot, p);
    // the ceiling μs N and the kinetic value μk N, which change with F when the rope slopes up
    const Nof = (F: number) => Math.max(0, st.m * G - F * Math.sin(rad(st.phi)));
    const Fx = (F: number) => F * Math.cos(rad(st.phi));
    const curve = (f: (F: number) => number, color: string, width: number, dash: number[], from = 0, to = F_TOP) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y - 2, box.w, box.h + 4);
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const F = from + ((to - from) * i) / 120;
        const X = plot.px(F);
        const Y = plot.py(f(F));
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      ctx.restore();
    };
    // the pull at which the block breaks free: F cos φ = μs (mg − F sin φ)
    const Fbreak = (mus * st.m * G) / (Math.cos(rad(st.phi)) + mus * Math.sin(rad(st.phi)));
    curve((F) => mus * Nof(F), p.ink3, 1.3, [5, 4]);
    curve((F) => Fx(F), p.force, 2.4, [], 0, Math.min(Fbreak, F_TOP));
    curve((F) => muk * Nof(F), p.force, 2.4, [], Math.min(Fbreak, F_TOP), F_TOP);
    curve((F) => muk * Nof(F), p.force, 1.2, [3, 4], 0, Math.min(Fbreak, F_TOP));
    if (Fbreak < F_TOP) {
      // the drop from μs N to μk N where the block breaks free
      ctx.save();
      ctx.strokeStyle = p.force;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(plot.px(Fbreak), plot.py(mus * Nof(Fbreak)));
      ctx.lineTo(plot.px(Fbreak), plot.py(muk * Nof(Fbreak)));
      ctx.stroke();
      ctx.restore();
    }
    label(ctx, p, 'μₛN', plot.px(F_TOP) - 6, plot.py(mus * Nof(F_TOP)) - 10, p.ink2, fs, 'right');
    label(ctx, p, 'μₖN', plot.px(F_TOP) - 6, plot.py(muk * Nof(F_TOP)) + 12, p.force, fs, 'right');
    // the present state
    ctx.save();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(plot.px(st.F), plot.py(Math.abs(fNow)), 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawIncline(ctx: CanvasRenderingContext2D, W: number, H: number, p: Palette, fs: number, narrow: boolean) {
    const th = rad(st.theta);
    // the slope: its foot at the bottom right, rising to the left (the block slides down to the right)
    const footX = W * 0.9;
    const baseY = H * 0.86;
    const len = Math.min(W * 0.8, (H * 0.78) / Math.sin(rad(50)));
    const topX = footX - len * Math.cos(th);
    const topY = baseY - len * Math.sin(th);
    ctx.save();
    ctx.fillStyle = withAlpha(p.ink3, 0.12);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.lineTo(footX, baseY);
    ctx.lineTo(topX, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // the angle at the foot
    ctx.beginPath();
    ctx.arc(footX, baseY, 46, Math.PI, Math.PI + th, false);
    ctx.stroke();
    ctx.restore();
    label(ctx, p, `θ = ${st.theta}°`, footX - 30, baseY + 16, p.ink, fs + 1, 'right');

    // the block, its distance s down the slope from a start near the top
    const ux = Math.cos(th); // down the slope, screen: (+ux, +uy)
    const uy = Math.sin(th);
    const bw = Math.min(90, W * 0.14);
    const bh = bw * 0.62;
    // the start leaves room up the slope for the friction arrow, which leaves the block's up-slope corner
    const startD = 0.22 * len + bw / 2;
    const d = startD + (st.s / TRACK) * (0.9 * len - startD - bw / 2);
    const sx = topX + d * ux; // the contact point on the slope
    const sy = topY + d * uy;
    // the outward normal to the slope, on screen: (uy, −ux), up and to the right
    const cx = sx + (bh / 2) * uy;
    const cy = sy - (bh / 2) * ux;
    block(ctx, p, cx, cy, bw, bh, -th);
    // the stop at the end of the track, against which the block comes to rest
    {
      const ex = topX + 0.9 * len * ux;
      const ey = topY + 0.9 * len * uy;
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + bh * 0.55 * uy, ey - bh * 0.55 * ux);
      ctx.stroke();
      ctx.restore();
    }

    // forces on the block, from its centre; one scale for all of them, the slider's heaviest block fitting. A light
    // block's weight still gets a shaft longer than its head: the scale grows, and the arrows keep their proportions.
    const k = Math.max((H * 0.42) / (5 * G), 26 / (st.m * G));
    const W_ = st.m * G;
    const col = p.force;
    arrow(ctx, cx, cy, cx, cy + k * W_, { color: col, width: 2.4, head: 9 });
    label(ctx, p, 'mg', cx + 6, cy + k * W_ + 8, col, fs + 1, 'left');
    const N = surface.N;
    // N is perpendicular to the slope, outward: screen direction (uy, −ux); drawn from the contact, up the block's side
    const nx0 = sx + (bw * 0.3) * ux;
    const ny0 = sy + (bw * 0.3) * uy;
    arrow(ctx, nx0, ny0, nx0 + k * N * uy, ny0 - k * N * ux, { color: col, width: 2.4, head: 9 });
    label(ctx, p, 'N', nx0 + k * N * uy - 12, ny0 - k * N * ux - 4, col, fs + 1);
    // friction along the slope, up it (−s) at the contact
    // at the foot the block rests against the stop, which pushes on it too: the friction there is not drawn
    const f = atBottom ? 0 : -fNow; // magnitude up the slope
    if (f > 1e-6) {
      // from the up-slope end of the contact face, so the arrow lies along the surface clear of the block; never
      // shorter than an arrow that reads as one. Its label sits past the tip, up the slope, away from mg.
      const fx0 = sx - (bw / 2) * ux;
      const fy0 = sy - (bw / 2) * uy;
      const fl = Math.max(k * f, 24);
      const tx = fx0 - fl * ux;
      const ty = fy0 - fl * uy;
      arrow(ctx, fx0, fy0, tx, ty, { color: col, width: 2.4, head: 9 });
      label(ctx, p, st.moving ? 'fₖ' : 'fₛ', tx - 10 * ux + 9 * uy, ty - 10 * uy - 9 * ux, col, fs + 1);
    }
    if (st.parts) {
      // the components of mg along the slope and perpendicular to it, dashed, from the centre
      ctx.save();
      ctx.setLineDash([5, 4]);
      arrow(ctx, cx, cy, cx + k * W_ * Math.sin(th) * ux, cy + k * W_ * Math.sin(th) * uy, { color: col, width: 1.4, head: 7, alpha: 0.75 });
      // into the slope: screen direction (−uy, ux)
      arrow(ctx, cx, cy, cx - k * W_ * Math.cos(th) * uy, cy + k * W_ * Math.cos(th) * ux, { color: col, width: 1.4, head: 7, alpha: 0.75 });
      ctx.restore();
      label(ctx, p, 'mg sinθ', cx + k * W_ * Math.sin(th) * ux + 8, cy + k * W_ * Math.sin(th) * uy + 12, col, fs - 1, 'left');
      label(ctx, p, 'mg cosθ', cx - k * W_ * Math.cos(th) * uy - 8, cy + k * W_ * Math.cos(th) * ux + 6, col, fs - 1, 'right');
    }
    if (st.moving && aNow > 1e-6) {
      const ax = cx + (bh * 0.9) * uy;
      const ay = cy - (bh * 0.9) * ux;
      arrow(ctx, ax, ay, ax + 34 * ux, ay + 34 * uy, { color: p.accel, width: 2, head: 8 });
      label(ctx, p, 'a', ax - 8, ay - 6, p.accel, fs);
    }

    // the gauge: friction against its ceiling μs N (static) and the kinetic value μk N
    const gx = 14;
    const gy = 16;
    const gw = Math.min(W * 0.42, 240);
    const gh = 12;
    const full = (mus * 5 * G) * 1.05; // the largest ceiling the sliders allow, so the bar keeps its scale
    const px = (v: number) => gx + (v / full) * gw;
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.fillStyle = withAlpha(p.force, 0.75);
    if (!atBottom) ctx.fillRect(gx, gy, px(Math.abs(fNow)) - gx, gh);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px(fMax), gy - 4);
    ctx.lineTo(px(fMax), gy + gh + 4);
    ctx.stroke();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = p.ink3;
    ctx.beginPath();
    ctx.moveTo(px(fKin), gy - 2);
    ctx.lineTo(px(fKin), gy + gh + 2);
    ctx.stroke();
    ctx.restore();
    label(ctx, p, 'μₛN', px(fMax), gy + gh + 13, p.ink, fs - 1);
    if (!atBottom) label(ctx, p, 'f', px(Math.abs(fNow)) + 2, gy - 8, p.force, fs - 1, 'left');
    handNote(ctx, atBottom ? 'בתחתית' : st.moving ? 'מחליק' : 'במנוחה', W * 0.62, 24, p, narrow ? 13 : 16);
  }

  function drawStack(ctx: CanvasRenderingContext2D, W: number, H: number, p: Palette, fs: number, narrow: boolean) {
    if (!stk) return;
    // the blocks on the left (on a narrow screen: on top); one free-body diagram per block on the right (below)
    const sceneW = narrow ? W : W * 0.5;
    const sceneH = narrow ? H * 0.4 : H;
    // on a narrow screen the blocks sit low in their band, below the reset and fullscreen buttons
    const floorY = sceneH * (narrow ? 0.78 : 0.62);
    const bwB = Math.min(sceneW * 0.6, 260);
    const bhB = Math.min(48, sceneH * 0.2);
    const bwA = bwB * 0.34;
    const bhA = bhB * 0.9;
    const cxB = sceneW * 0.42;
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(8, floorY);
    ctx.lineTo(sceneW - 8, floorY);
    ctx.stroke();
    ctx.restore();
    // under the floor, left of where a_B's label starts
    handNote(ctx, 'רצפה חלקה', sceneW * (narrow ? 0.15 : 0.24), floorY + (narrow ? 14 : 40), p, narrow ? 12 : 14);
    block(ctx, p, cxB, floorY - bhB / 2, bwB, bhB, 0, 'B');
    // A sits on B, shifted by its slide relative to B (s in metres, B drawn 0.8 m long)
    const cxA = cxB + (st.s / 0.8) * bwB;
    const cyA = floorY - bhB - bhA / 2;
    block(ctx, p, cxA, cyA, bwA, bhA, 0, 'A');
    // the pull, on the chosen block
    const kF = (sceneW * 0.16) / F_TOP;
    if (st.F > 0) {
      const [ox, oy] = st.on === 'B' ? [cxB + bwB / 2, floorY - bhB / 2] : [cxA + bwA / 2, cyA];
      arrow(ctx, ox, oy, ox + kF * st.F, oy, { color: p.force, width: 2.4, head: 9 });
      label(ctx, p, 'F', ox + kF * st.F + 6, oy, p.force, fs + 1, 'left');
    }
    // the two accelerations, on one scale with each other
    const kA = (sceneW * 0.22) / Math.max(Math.abs(stk.aA), Math.abs(stk.aB), 1);
    const yA = cyA - bhA / 2 - 12;
    const yB = floorY + 14;
    if (Math.abs(stk.aA) > 1e-6) arrow(ctx, cxA, yA, cxA + kA * stk.aA, yA, { color: p.accel, width: 2, head: 8 });
    label(ctx, p, 'a_A', cxA - 8, yA, p.accel, fs, 'right');
    if (Math.abs(stk.aB) > 1e-6) arrow(ctx, cxB, yB, cxB + kA * stk.aB, yB, { color: p.accel, width: 2, head: 8 });
    label(ctx, p, 'a_B', cxB - 8, yB, p.accel, fs, 'right');
    // the state, top left, clear of a_A (whose label ends just left of A's centre)
    handNote(ctx, stk.together ? 'נעים יחד' : 'מחליקים', narrow ? sceneW * 0.17 : sceneW * 0.5, narrow ? 16 : sceneH * 0.12, p, narrow ? 13 : 16);

    // free-body diagrams. The horizontal forces of both diagrams share one scale, set by the largest of them, so
    // F and the friction pair always fill the room; the vertical forces (faint) have a fixed scale of their own.
    // The caption says so.
    const panelX = narrow ? 0 : W * 0.5;
    const panelY = narrow ? H * 0.4 : 0;
    const panelW = narrow ? W : W * 0.5;
    const panelH = narrow ? H * 0.6 : H;
    const centreA: [number, number] = narrow ? [panelW * 0.25, panelY + panelH * 0.52] : [panelX + panelW * 0.4, panelY + panelH * 0.28];
    const centreB: [number, number] = narrow ? [panelW * 0.72, panelY + panelH * 0.52] : [panelX + panelW * 0.4, panelY + panelH * 0.76];
    const room = narrow ? panelW * 0.2 : panelW * 0.45;
    const kh = room / Math.max(st.F, Math.abs(stk.fOnA), 0.5);
    const kv = (narrow ? panelH * 0.36 : panelH * 0.21) / ((mA + mB) * G);
    /** half the side of the square that stands for each body; every arrow starts on its edge */
    const half = 7;
    // `dx` separates two arrows that leave the same edge (B's weight and A's push on it, both down)
    type Arrow = { x: number; y: number; dx?: number; text: string; faint?: boolean };
    const fbd = ([cx, cy]: [number, number], name: string, forces: Arrow[]) => {
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.fillRect(cx - half, cy - half, 2 * half, 2 * half);
      ctx.restore();
      // the name below-left: above-left is where a horizontal force's label goes when it has no room past the tip
      label(ctx, p, name, cx - 18, cy + 18, p.ink, fs + 2);
      for (const f of forces) {
        if (Math.hypot(f.x, f.y) < 1e-6) continue;
        const dx = f.dx ?? 0;
        const vertical = f.x === 0;
        const x0 = vertical ? cx + dx : cx + Math.sign(f.x) * half;
        const y0 = vertical ? cy - Math.sign(f.y) * half : cy;
        const x1 = x0 + kh * f.x;
        const y1 = y0 - kv * f.y;
        arrow(ctx, x0, y0, x1, y1, { color: p.force, width: f.faint ? 1.8 : 2.4, head: 8, alpha: f.faint ? 0.65 : 1 });
        // the label just past the tip: beside a vertical arrow (on its own side), in line with a horizontal one
        if (vertical) label(ctx, p, f.text, x1 + (dx < 0 ? -5 : 5), y1 - Math.sign(f.y) * 4, p.force, fs - 1, dx < 0 ? 'right' : 'left');
        else {
          ctx.save();
          ctx.font = `italic 600 ${fs - 1}px ${p.fontUi}`;
          const tw = ctx.measureText(f.text.replace('_', '')).width;
          ctx.restore();
          const past = x1 + Math.sign(f.x) * 6;
          const fits = f.x > 0 ? past + tw < W - 4 : past - tw > 4;
          // past the tip when it fits on the canvas, otherwise above the arrow, ending at its tip
          if (fits) label(ctx, p, f.text, past, y1, p.force, fs - 1, f.x > 0 ? 'left' : 'right');
          else label(ctx, p, f.text, x1, y1 - 11, p.force, fs - 1, f.x > 0 ? 'right' : 'left');
        }
      }
    };
    const fA = stk.fOnA;
    const NA = mA * G;
    fbd(centreA, 'A', [
      { x: 0, y: -mA * G, text: 'm_Ag', faint: true },
      { x: 0, y: NA, text: 'N(B→A)', faint: true },
      { x: fA, y: 0, text: 'f(B→A)' },
      ...(st.on === 'A' ? [{ x: st.F, y: 0, text: 'F' }] : []),
    ]);
    fbd(centreB, 'B', [
      { x: 0, y: -mB * G, dx: -4, text: 'm_Bg', faint: true },
      { x: 0, y: -NA, dx: 4, text: 'N(A→B)', faint: true },
      { x: 0, y: (mA + mB) * G, text: 'N₀', faint: true },
      { x: -fA, y: 0, text: 'f(A→B)' },
      ...(st.on === 'B' ? [{ x: st.F, y: 0, text: 'F' }] : []),
    ]);
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.beginPath();
    if (narrow) {
      ctx.moveTo(8, panelY);
      ctx.lineTo(W - 8, panelY);
    } else {
      ctx.moveTo(panelX, 8);
      ctx.lineTo(panelX, H - 8);
      ctx.moveTo(panelX + 12, H * 0.5);
      ctx.lineTo(W - 8, H * 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: st.moving });
  useEffect(invalidate, [st]);

  // a narrow stage stacks the blocks above their free-body diagrams, so the stacked scene gets a taller canvas there
  const [narrowStage, setNarrowStage] = useState(false);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || mode !== 'stack') return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      setNarrowStage(w > 0 && w < NARROW_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const aspect = mode === 'stack' ? (narrowStage ? 0.95 : 16 / 10) : mode === 'pull' ? 4 / 3 : 16 / 10;
  const thS = thresholdAngle(mus);
  const figLabel =
    mode === 'pull'
      ? `איור חי: גוש בעל מסה ${sci(st.m)} קילוגרם על רצפה, נמשך בחבל בכוח ${sci(st.F)} ניוטון בזווית ${st.phi} מעלות מעל האופק, ומתחתיו גרף של החיכוך כפונקציה של הכוח. ${describe()} במקלדת: חץ ימינה ושמאלה משנה את הכוח.`
      : mode === 'incline'
        ? `איור חי: גוש בעל מסה ${sci(st.m)} קילוגרם על מדרון בזווית ${st.theta} מעלות. ${describe()} במקלדת: חץ למעלה ולמטה משנה את הזווית.`
        : `איור חי: גוש A על גוש B על רצפה חלקה, כוח ${sci(st.F)} ניוטון על ${st.on}. ${describe()} במקלדת: חץ ימינה ושמאלה משנה את הכוח.`;

  const onKeyDown = (e: KeyboardEvent) => {
    if (mode === 'incline' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) change({ theta: clamp(st.theta + (e.key === 'ArrowUp' ? 1 : -1), 0, 50) });
    else if (mode !== 'incline' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) change({ F: clamp(st.F + (e.key === 'ArrowRight' ? 0.5 : -0.5), 0, F_TOP) });
    else return;
    e.preventDefault();
  };

  const readout =
    mode === 'stack' && stk ? (
      <>
        <span>
          כוח מרבי לתנועה משותפת <b class="q">{sci(stk.Fmax)} N</b>
        </span>
        <span class="q" data-readout="fA">
          f(B→A) = <b>{signed(stk.fOnA)} N</b>
        </span>
        <span class="q" data-readout="aA">
          a<sub>A</sub> = <b>{signed(stk.aA)} m/s²</b>
        </span>
        <span class="q" data-readout="aB">
          a<sub>B</sub> = <b>{signed(stk.aB)} m/s²</b>
        </span>
        <span data-readout="state">{stk.together ? 'נעים יחד, החיכוך סטטי' : 'מחליקים, החיכוך קינטי'}</span>
      </>
    ) : (
      <>
        {mode === 'incline' && (
          <span class="q" data-readout="along">
            mg sinθ = <b>{sci(surface.drive)} N</b>
          </span>
        )}
        <span class="q" data-readout="N">
          N = <b>{sci(surface.N)} N</b>
        </span>
        <span class="q" data-readout="f">
          f = <b>{atBottom ? '—' : `${sci(Math.abs(fNow))} N`}</b>
        </span>
        <span class="q" data-readout="fmax">
          μₛN = <b>{sci(fMax)} N</b>
        </span>
        <span class="q" data-readout="a">
          a = <b>{signed(aNow)} m/s²</b>
        </span>
        <span data-readout="state">{atBottom ? 'בתחתית המדרון' : st.moving ? 'מחליק, החיכוך קינטי' : breaks ? 'מתחיל להחליק' : 'במנוחה, החיכוך סטטי'}</span>
        {mode === 'incline' && (
          <span>
            זווית הסף <b class="q">{sci(thS)}°</b>
          </span>
        )}
      </>
    );

  const controls =
    mode === 'pull' ? (
      <>
        <Slider label="הכוח F" value={st.F} min={0} max={F_TOP} step={0.5} format={(v) => `${sci(v)} N`} onChange={(v) => change({ F: v })} />
        <Slider label="זווית החבל מעל האופק" value={st.phi} min={0} max={60} step={1} format={(d) => `${d}°`} onChange={(d) => change({ phi: d })} />
        <div class="group" role="group" aria-label="הגוש">
          <button type="button" class="btn ghost" onClick={() => setSt((s) => settle({ ...s, v: 0, moving: false }))}>
            עצרו את הגוש
          </button>
        </div>
      </>
    ) : mode === 'incline' ? (
      <>
        <Slider label="זווית המדרון" value={st.theta} min={0} max={50} step={1} format={(d) => `${d}°`} onChange={(d) => change({ theta: d })} />
        <Slider label="המסה" value={st.m} min={0.5} max={5} step={0.5} format={(v) => `${sci(v)} kg`} onChange={(v) => change({ m: v })} />
        <div class="group" role="group" aria-label="הגוש ומה להציג">
          <button type="button" class="btn ghost" onClick={() => setSt((s) => settle({ ...s, s: 0, v: 0, moving: false }))}>
            החזירו למעלה
          </button>
          <Toggle label="רכיבי הכובד" on={st.parts} swatch="var(--force)" onChange={(on) => setSt((s) => ({ ...s, parts: on }))} />
        </div>
      </>
    ) : (
      <>
        <Slider label="הכוח F" value={st.F} min={0} max={F_TOP} step={0.5} format={(v) => `${sci(v)} N`} onChange={(v) => change({ F: v })} />
        <div class="group" role="group" aria-label="על איזה גוש מושכים">
          <Toggle label="מושכים את B (התחתון)" on={st.on === 'B'} onChange={() => change({ on: 'B' })} />
          <Toggle label="מושכים את A (העליון)" on={st.on === 'A'} onChange={() => change({ on: 'A' })} />
        </div>
      </>
    );

  return (
    <SimShell
      fig={props.id}
      label={figLabel}
      canvasRef={canvasRef}
      aspect={aspect}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onReset={() => {
        touched.current.clear();
        seenStatic.current.clear();
        setSt(settle(initial()));
        setLive('האיור חזר למצב ההתחלה.');
      }}
      readout={readout}
      controls={controls}
    />
  );
}

