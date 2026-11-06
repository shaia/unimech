/**
 * Out of the page, into the page: an arrow standing on a sheet of paper, seen from an angle the
 * student tilts. Seen from the side it is an ordinary arrow; seen face-on it shrinks to a point,
 * and what is left is ⊙ (the arrowhead coming at you) or ⊗ (the tail feathers going away).
 * Built for lesson 0.2; the same symbols carry chapters 4–5.
 *
 * Orthographic view: the page is the x–y plane, z points out of it toward the reader. The camera
 * tilts about the x axis by the view angle α (90° = looking straight down at the page).
 */

import { useEffect, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { handNote, mix, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type P3 = [number, number, number];
export type Pointing = 'out' | 'in';

const WORLD_W = 4;
const WORLD_H = 3;
const PAGE_W = 1.5;
const PAGE_H = 1.1;
const Z_NEAR = 0.15;
const Z_FAR = 1.45;
const HEAD_L = 0.36;
const HEAD_R = 0.17;
const FIN_L = 0.32;
const FIN_W = 0.16;
const MIN_ANGLE = 5;
const FACE_ON = 85;

const TASK_LABEL: Record<string, string> = {
  'see-out': 'כשהחץ מצביע החוצה מהדף, הטו את המבט עד שתסתכלו ישר על הדף. מה נשאר מהחץ?',
  'see-in': 'עכשיו הפכו את החץ כך שיצביע לתוך הדף, והסתכלו שוב ישר על הדף.',
};

export interface DepthArrowProps {
  id: string;
  /** view angle in degrees: 90 looks straight down at the page */
  view?: number;
  pointing?: Pointing;
  tasks?: string[];
}

interface State {
  view: number;
  pointing: Pointing;
}

const initial = (p: DepthArrowProps): State => ({ view: p.view ?? 30, pointing: p.pointing ?? 'out' });

export default function DepthArrow(props: DepthArrowProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) =>
        setS((prev) => ({
          view: typeof st.view === 'number' ? Math.max(MIN_ANGLE, Math.min(90, st.view)) : prev.view,
          pointing: st.pointing === 'out' || st.pointing === 'in' ? st.pointing : prev.pointing,
        })),
      ),
    [props.id],
  );

  useEffect(() => {
    if (s.view < FACE_ON) return;
    if (props.tasks?.includes('see-out') && s.pointing === 'out') markTask(`${props.id}:see-out`);
    if (props.tasks?.includes('see-in') && s.pointing === 'in') markTask(`${props.id}:see-in`);
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const a = (s.view * Math.PI) / 180;
    const sa = Math.sin(a);
    const ca = Math.cos(a);
    const cx = view.w / 2;
    const cy = view.h * 0.62 - view.h * 0.12 * (s.view / 90);
    const k = view.ppm;
    const scr = ([x, y, z]: P3): [number, number] => [cx + x * k, cy - (y * sa + z * ca) * k];
    /** distance toward the camera: larger is nearer */
    const depth = ([, y, z]: P3) => -y * ca + z * sa;

    // the page
    const corners: P3[] = [
      [-PAGE_W, -PAGE_H, 0],
      [PAGE_W, -PAGE_H, 0],
      [PAGE_W, PAGE_H, 0],
      [-PAGE_W, PAGE_H, 0],
    ];
    ctx.save();
    ctx.beginPath();
    corners.forEach((c, i) => (i ? ctx.lineTo(...scr(c)) : ctx.moveTo(...scr(c))));
    ctx.closePath();
    ctx.fillStyle = mix(p.paper, p.ink, 0.06);
    ctx.fill();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // ruled lines, so the tilt of the sheet reads at a glance
    ctx.strokeStyle = withAlpha(p.ink, 0.1);
    for (let y = -PAGE_H + 0.25; y < PAGE_H; y += 0.25) {
      ctx.beginPath();
      ctx.moveTo(...scr([-PAGE_W + 0.12, y, 0]));
      ctx.lineTo(...scr([PAGE_W - 0.12, y, 0]));
      ctx.stroke();
    }
    ctx.restore();

    // the arrow: shaft, head at the tip, feathers at the tail
    const out = s.pointing === 'out';
    const zTip = out ? Z_FAR : Z_NEAR;
    const zTail = out ? Z_NEAR : Z_FAR;
    const dir = out ? 1 : -1;
    const zBase = zTip - dir * HEAD_L;
    const color = p.force;

    const parts: { d: number; paint: () => void }[] = [];
    parts.push({
      d: depth([0, 0, (zTail + zBase) / 2]),
      paint: () => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(...scr([0, 0, zTail]));
        ctx.lineTo(...scr([0, 0, zBase]));
        ctx.stroke();
        ctx.restore();
      },
    });
    // feathers: two fins in the diagonal planes, so face-on they make a ×
    for (const [ux, uy] of [
      [Math.SQRT1_2, Math.SQRT1_2],
      [Math.SQRT1_2, -Math.SQRT1_2],
    ] as const) {
      const fin: P3[] = [
        [-ux * FIN_W, -uy * FIN_W, zTail],
        [ux * FIN_W, uy * FIN_W, zTail],
        [ux * FIN_W * 0.6, uy * FIN_W * 0.6, zTail + dir * FIN_L],
        [-ux * FIN_W * 0.6, -uy * FIN_W * 0.6, zTail + dir * FIN_L],
      ];
      parts.push({
        d: depth([0, 0, zTail + dir * FIN_L * 0.3]) + 0.001,
        paint: () => {
          ctx.save();
          ctx.beginPath();
          fin.forEach((c, i) => (i ? ctx.lineTo(...scr(c)) : ctx.moveTo(...scr(c))));
          ctx.closePath();
          ctx.fillStyle = withAlpha(mix(color, p.paper, 0.35), 0.92);
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.4;
          ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.restore();
        },
      });
    }
    // the head: a cone; its base disc shows only when it faces the camera (the arrow points away)
    parts.push({
      d: depth([0, 0, (zBase + zTip) / 2]),
      paint: () => cone(ctx, scr, zBase, zTip, HEAD_R, sa, out, color, p),
    });
    parts.sort((u, v) => u.d - v.d).forEach((q) => q.paint());

    // a face-on note: what the symbol is, in the margin
    if (s.view >= FACE_ON) {
      handNote(ctx, out ? '⊙  החוד מתקרב אליכם' : '⊗  הזנב מתרחק מכם', cx, view.h - 22, p, 17);
    } else if (s.view <= 35) {
      handNote(ctx, out ? 'החץ יוצא מהדף, אליכם' : 'החץ נכנס אל הדף, הרחק מכם', cx, view.h - 22, p, 15);
    }
    // top-left: the top-right corner holds the reset and fullscreen buttons
    eye(ctx, 40, 30, s.view, p);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  const describe = (st: State) =>
    `החץ מצביע ${st.pointing === 'out' ? 'החוצה מהדף' : 'לתוך הדף'}. זווית ההסתכלות ${Math.round(st.view)} מעלות` +
    (st.view >= FACE_ON ? `: מבט ישר על הדף, ורואים ${st.pointing === 'out' ? 'נקודה בתוך עיגול' : 'איקס בתוך עיגול'}.` : '.');

  const set = (next: Partial<State>) =>
    setS((prev) => {
      const st = { ...prev, ...next };
      setLive(describe(st));
      return st;
    });

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 15 : 5;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set({ view: Math.min(90, s.view + step) });
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set({ view: Math.max(MIN_ANGLE, s.view - step) });
    else if (e.key === ' ' || e.key === 'Enter') set({ pointing: s.pointing === 'out' ? 'in' : 'out' });
    else return;
    e.preventDefault();
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: חץ שעומד על דף. ${describe(s)} במקלדת: חיצים משנים את זווית ההסתכלות, רווח הופך את כיוון החץ.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={() => set(initial(props))}
      onKeyDown={onKeyDown}
      readout={
        <span>
          זווית ההסתכלות: <b class="q">{Math.round(s.view)}°</b>
          {s.view >= FACE_ON ? ' (מבט ישר על הדף)' : s.view <= 15 ? ' (כמעט מהצד)' : ''}
        </span>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="כיוון החץ">
            <Toggle label="⊙ החוצה מהדף" on={s.pointing === 'out'} swatch="var(--force)" onChange={() => set({ pointing: 'out' })} />
            <Toggle label="⊗ לתוך הדף" on={s.pointing === 'in'} swatch="var(--force)" onChange={() => set({ pointing: 'in' })} />
          </div>
          <Slider
            label="זווית ההסתכלות"
            min={MIN_ANGLE}
            max={90}
            step={1}
            value={s.view}
            format={(v) => `${Math.round(v)}°`}
            onChange={(v) => set({ view: v })}
          />
        </>
      }
    />
  );
}

/** A cone from a base circle at zBase to the apex at zTip, on the z axis. */
function cone(
  ctx: CanvasRenderingContext2D,
  scr: (p: P3) => [number, number],
  zBase: number,
  zTip: number,
  r: number,
  sa: number,
  out: boolean,
  color: string,
  p: Palette,
) {
  const ring: [number, number][] = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    ring.push(scr([r * Math.cos(t), r * Math.sin(t), zBase]));
  }
  const apex = scr([0, 0, zTip]);
  const hull = convexHull([...ring, apex]);
  ctx.save();
  ctx.beginPath();
  hull.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
  ctx.closePath();
  const grad = ctx.createLinearGradient(apex[0] - r * 60, 0, apex[0] + r * 60, 0);
  grad.addColorStop(0, mix(color, '#ffffff', 0.35));
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = mix(color, '#000000', 0.25);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  if (!out) {
    // pointing away: the flat back of the head faces the camera
    ctx.beginPath();
    ring.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.closePath();
    ctx.fillStyle = mix(color, p.paper, 0.25);
    ctx.fill();
    ctx.stroke();
  } else if (sa > 0.9) {
    // pointing at the camera: the tip is the dot of ⊙
    ctx.beginPath();
    ctx.arc(apex[0], apex[1], 3.4, 0, Math.PI * 2);
    ctx.fillStyle = p.ink;
    ctx.fill();
  }
  ctx.restore();
}

/** Andrew's monotone chain. */
function convexHull(pts: [number, number][]): [number, number][] {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of s.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** A small eye in the corner, tilted with the view, so "where am I looking from" is visible. */
function eye(ctx: CanvasRenderingContext2D, x: number, y: number, viewDeg: number, p: Palette) {
  const a = (viewDeg * Math.PI) / 180;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = p.ink2;
  ctx.fillStyle = p.ink2;
  ctx.lineWidth = 1.4;
  // the page as a short line, and the line of sight onto it at angle α
  ctx.beginPath();
  ctx.moveTo(-22, 14);
  ctx.lineTo(22, 14);
  ctx.stroke();
  const ex = -Math.cos(a) * 22;
  const ey = 14 - Math.sin(a) * 22;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(0, 14);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(ex, ey, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
