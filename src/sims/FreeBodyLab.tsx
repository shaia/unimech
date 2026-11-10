/**
 * FreeBodyLab (lesson 2.2): a few bodies that act on one another. The top of the stage sketches the
 * scene (a book on a table in an elevator, blocks pushed in a row, a block on a block, a block on a table
 * pulled by a hanging weight, a horse and a cart). Below it, two free-body diagrams (the stage is LTR
 * physics space): the left panel is the body the reader chose, with every force on it and only those;
 * the right panel is where the third-law partner of the chosen
 * force acts: the other body's full diagram, or, when the partner acts on an agent outside the system
 * (the Earth, the floor, the hand, the rope), that agent with that one force. The two forces of a pair
 * are never drawn on one diagram.
 *
 * Physics comes from src/physics/bodies.ts: each scene solves the bodies' coupled equations (second law
 * per body, third law between them, a shared acceleration) and lists every force with its agent and
 * its partner. The figure is a snapshot (constant forces, constant accelerations): nothing animates.
 *
 * Arrow lengths grow as the 0.4 power of the force's magnitude, one scale per scene, so that a
 * contact push of a few newtons stays visible beside a weight of thousands; equal forces get equal
 * arrows, and the readout carries the numbers.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  bookScene,
  contactScene,
  freeBody,
  horseScene,
  isBody,
  mag,
  netForce,
  partnerOf,
  pulleyScene,
  stackScene,
  type Force,
  type Scene,
  type SceneName,
} from '~/physics/bodies';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { directionHe, sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/** the reset and fullscreen buttons cover this corner of the stage (CSS px from the top-right) */
const BUTTONS_W = 96;
const BUTTONS_H = 52;
/** the sketch takes this fraction of the stage height; the two diagrams share the rest */
const SKETCH_FRAC = 0.44;
/** arrow length ∝ |F|^LEN_POWER, at least ARROW_MIN px */
const LEN_POWER = 0.4;
const ARROW_MIN = 22;

const SCENE_LABEL: Record<SceneName, string> = {
  book: 'ספר על שולחן',
  contact: 'גושים צמודים',
  stack: 'גוש על גוש',
  pulley: 'שולחן ומשקולת',
  horse: 'סוס ועגלה',
};

const TASK_LABEL: Record<string, string> = {
  'book-pair': 'בחרו בספר את הכובד שלו. על איזה גוף פועל הזוג שלו?',
  'book-elevator': 'האיצו את המעלית כלפי מעלה ב-2 m/s² או יותר. האם הכוח הנורמלי על הספר עדיין שווה לכובד שלו? ומה עם הזוג שלו?',
  'contact-side': 'דחפו את הגושים מימין במקום משמאל. מה קרה לכוח בין הגושים?',
  'contact-middle': 'עברו לשלושה גושים, בחרו את הגוש האמצעי ולחצו על אחד מכוחות המגע שעליו. איפה מצויר הזוג שלו?',
  'stack-friction': 'בחרו "גוש על גוש", את הגוש B ואת כוח החיכוך שעליו. מי מפעיל אותו, ועל מי פועל הזוג שלו?',
  'horse-pair': 'בחרו "סוס ועגלה", ובסוס את הכוח של העגלה עליו. באיזה תרשים נמצא הזוג שלו?',
  'pulley-rope': 'בחרו בגוש שעל השולחן את הכוח T. על מה פועל הזוג שלו?',
  'pulley-heavy': 'הגדילו את M עד הסוף. לאיזה ערך מתקרבת המתיחות?',
  'pulley-light': 'הקטינו את M עד הסוף. מה קורה למתיחות ולתאוצה?',
};

/** slider ranges */
const AUP = { min: -4, max: 4, step: 0.5 };
const FPUSH = { min: 0, max: 24, step: 1 };
const FPULL = { min: 0, max: 16, step: 1 };
const MBLOCK = { min: 0.5, max: 20, step: 0.5 };
const FGROUND = { min: 400, max: 2000, step: 100 };

interface State {
  scene: SceneName;
  body: string;
  force: string | null;
  n: 2 | 3;
  side: 'left' | 'right';
  F: number;
  Fstack: number;
  stackOn: 'A' | 'B';
  aUp: number;
  M: number;
  Fground: number;
  showNet: boolean;
}

export interface FreeBodyLabProps {
  id: string;
  scene?: SceneName;
  /** scenes offered as buttons (default: only the starting one, no buttons) */
  scenes?: SceneName[];
  body?: string;
  force?: string | null;
  n?: 2 | 3;
  side?: 'left' | 'right';
  /** the hand's push on the row of blocks [N] */
  F?: number;
  /** the pull on the stack [N] */
  Fstack?: number;
  stackOn?: 'A' | 'B';
  aUp?: number;
  M?: number;
  Fground?: number;
  showNet?: boolean;
  tasks?: string[];
}

const FIRST_BODY: Record<SceneName, string> = { book: 'book', contact: 'b1', stack: 'A', pulley: 'block', horse: 'horse' };

function initial(p: FreeBodyLabProps): State {
  const scene = p.scene ?? 'book';
  return {
    scene,
    body: p.body ?? FIRST_BODY[scene],
    force: p.force ?? null,
    n: p.n ?? 2,
    side: p.side ?? 'left',
    F: p.F ?? 12,
    Fstack: p.Fstack ?? 8,
    stackOn: p.stackOn ?? 'B',
    aUp: p.aUp ?? 0,
    M: p.M ?? 4,
    Fground: p.Fground ?? 1200,
    showNet: p.showNet ?? true,
  };
}

function buildScene(s: State): Scene {
  switch (s.scene) {
    case 'book':
      return bookScene({ mBook: 1.0, mTable: 10, aUp: s.aUp });
    case 'contact':
      return contactScene({ masses: s.n === 2 ? [3, 1] : [3, 2, 1], F: s.F, side: s.side });
    case 'stack':
      return stackScene({ mA: 1, mB: 3, F: s.Fstack, on: s.stackOn });
    case 'pulley':
      return pulleyScene({ M: s.M, m: 1 });
    case 'horse':
      return horseScene({ mHorse: 500, mCart: 300, Fground: s.Fground, fRoad: 400 });
  }
}

/** A state stays consistent: the chosen body exists in the scene, the chosen force acts on it. */
function settle(s: State): State {
  const sc = buildScene(s);
  const body = sc.bodies.some((b) => b.id === s.body) ? s.body : sc.bodies[0].id;
  const force = s.force && sc.forces.some((f) => f.id === s.force && f.on === body) ? s.force : null;
  return body === s.body && force === s.force ? s : { ...s, body, force };
}

const num = (x: number) => (Math.abs(x) < 5e-4 ? '0' : sci(x, 3).replace('-', '−'));
/** "m_{1}g" → "m1g": the text a screen reader and a test see */
const plain = (sym: string) => sym.replace(/_\{([^}]*)\}/g, '$1');
const dirOf = (v: readonly number[]) => directionHe(Math.atan2(v[1], v[0]));

/** A symbol with subscripts, for the readout and the controls. */
function Sym({ s }: { s: string }) {
  const parts = s.split(/_\{([^}]*)\}/);
  return (
    <bdi dir="ltr" class="q">
      {parts.map((t, i) => (i % 2 ? <sub key={i}>{t}</sub> : <i key={i}>{t}</i>))}
    </bdi>
  );
}

export default function FreeBodyLab(props: FreeBodyLabProps) {
  const [s, setS] = useState<State>(() => settle(initial(props)));
  const [live, setLive] = useState('');
  /** the state object a text step produced: it never ticks a task */
  const stepState = useRef<State | null>(null);
  /** what the reader changed by hand since the last step */
  const user = useRef({ force: false, side: false, aUp: false, M: false });
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const scene = buildScene(s);
  const body = scene.bodies.find((b) => b.id === s.body)!;
  const fbd = freeBody(scene, body.id);
  const sel = s.force ? scene.forces.find((f) => f.id === s.force) ?? null : null;
  const partner = sel ? partnerOf(scene, sel.id) : null;
  const net = netForce(scene, body.id);
  const nameOf = (id: string) => scene.bodies.find((b) => b.id === id)?.name ?? scene.agents[id] ?? id;

  useEffect(
    () =>
      subscribeSteps(props.id, (step) => {
        setS((prev) => {
          let next: State = { ...prev };
          if (typeof step.scene === 'string' && step.scene in SCENE_LABEL) next.scene = step.scene as SceneName;
          if (typeof step.body === 'string') next.body = step.body;
          if (typeof step.force === 'string' || step.force === null) next.force = step.force as string | null;
          else if (step.scene !== undefined || step.body !== undefined) next.force = null;
          if (step.n === 2 || step.n === 3) next.n = step.n;
          if (step.side === 'left' || step.side === 'right') next.side = step.side;
          if (step.stackOn === 'A' || step.stackOn === 'B') next.stackOn = step.stackOn;
          for (const k of ['F', 'Fstack', 'aUp', 'M', 'Fground'] as const) {
            if (typeof step[k] === 'number') next[k] = step[k] as number;
          }
          if (typeof step.showNet === 'boolean') next.showNet = step.showNet;
          next = settle(next);
          stepState.current = next;
          user.current = { force: false, side: false, aUp: false, M: false };
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
    if (has('book-pair') && u.force && s.scene === 'book' && s.force === 'book<earth:weight') done('book-pair');
    if (has('book-elevator') && u.aUp && s.scene === 'book' && s.aUp >= 2 - 1e-9) done('book-elevator');
    if (has('contact-side') && u.side && s.scene === 'contact' && s.side === 'right') done('contact-side');
    if (has('contact-middle') && u.force && s.scene === 'contact' && s.n === 3 && s.body === 'b2' && !!s.force?.endsWith(':contact')) {
      done('contact-middle');
    }
    if (has('stack-friction') && u.force && s.scene === 'stack' && s.force === 'B<A:friction') done('stack-friction');
    if (has('horse-pair') && u.force && s.scene === 'horse' && s.force === 'horse<cart:tension') done('horse-pair');
    if (has('pulley-rope') && u.force && s.scene === 'pulley' && s.force === 'block<rope:tension') done('pulley-rope');
    if (has('pulley-heavy') && u.M && s.scene === 'pulley' && s.M >= MBLOCK.max - 1e-9) done('pulley-heavy');
    if (has('pulley-light') && u.M && s.scene === 'pulley' && s.M <= MBLOCK.min + 1e-9) done('pulley-light');
  }, [s, props.id, props.tasks]);

  /** the sketch's body rectangles in CSS px, for clicks on the canvas */
  const hit = useRef<Record<string, [number, number, number, number]>>({});

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    // before layout the canvas has no width yet: the sketch's scale would be negative (and arc() throws)
    if (W <= BUTTONS_W + 16 || H <= 0) return;
    const sketchH = H * SKETCH_FRAC;
    const rects = drawSketch(ctx, p, scene, s, { x: 8, y: 6, w: W - BUTTONS_W - 8, h: sketchH - 10 });
    hit.current = rects;
    // the chosen body, and the body its partner force acts on, outlined in the sketch
    outline(ctx, rects[body.id], p.accent, []);
    if (partner && rects[partner.on]) outline(ctx, rects[partner.on], p.accent, [5, 4]);

    // the two diagrams
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, sketchH);
    ctx.lineTo(W - 8, sketchH);
    ctx.moveTo(W / 2, sketchH + 8);
    ctx.lineTo(W / 2, H - 8);
    ctx.stroke();
    ctx.restore();

    const fMax = Math.max(1e-9, ...scene.forces.map((f) => mag(f.vec)));
    const panelH = H - sketchH;
    const lMax = Math.min(W / 2, panelH) * 0.38;
    // a power below 1 keeps a few-newton push visible beside a weight of thousands; equal forces still
    // get equal arrows, and no non-zero force is shorter than ARROW_MIN
    const len = (F: number) => (F < 1e-9 ? 0 : Math.max(ARROW_MIN, lMax * (F / fMax) ** LEN_POWER));
    const left = { x: 0, y: sketchH, w: W / 2, h: panelH };
    const right = { x: W / 2, y: sketchH, w: W / 2, h: panelH };

    heText(ctx, p, `הכוחות על ${body.name}`, left.x + left.w / 2, left.y + 14, p.ink2);
    diagram(ctx, p, view, left, body.massSymbol, fbd, sel?.id ?? null, len, s.showNet ? net : null, body.a);

    if (partner && isBody(scene, partner.on)) {
      const other = scene.bodies.find((b) => b.id === partner.on)!;
      heText(ctx, p, `הכוחות על ${other.name}`, right.x + right.w / 2, right.y + 14, p.ink2);
      const onOther = freeBody(scene, other.id);
      diagram(ctx, p, view, right, other.massSymbol, onOther, partner.id, len, s.showNet ? netForce(scene, other.id) : null, other.a);
    } else if (partner) {
      const agent = scene.agents[partner.on];
      heText(ctx, p, `על ${agent}: רק הזוג`, right.x + right.w / 2, right.y + 14, p.ink2);
      agentDiagram(ctx, p, right, agent, partner, len);
    } else {
      heText(ctx, p, 'בחרו כוח, ויופיע כאן הזוג שלו', right.x + right.w / 2, right.y + right.h / 2, p.ink3);
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 4, worldHeight: 3, animate: false });
  useEffect(invalidate, [s]);

  const describe = () => {
    const forces = fbd.map((f) => `${plain(f.symbol)} של ${nameOf(f.by)}, ${num(mag(f.vec))} N ${dirOf(f.vec)}`).join('; ');
    const pair = sel && partner ? ` הכוח הנבחר ${plain(sel.symbol)}; הזוג שלו פועל על ${nameOf(partner.on)}, ${dirOf(partner.vec)}.` : '';
    return `${SCENE_LABEL[s.scene]}. הכוחות על ${body.name}: ${forces}.${pair}`;
  };

  const update = (patch: Partial<State>, flags: Partial<typeof user.current> = {}) => {
    Object.assign(user.current, flags);
    setS((prev) => settle({ ...prev, ...patch }));
  };
  const chooseScene = (scene: SceneName) => {
    update({ scene, body: FIRST_BODY[scene], force: null });
    setLive(`נבחר המצב: ${SCENE_LABEL[scene]}.`);
  };
  const chooseBody = (id: string) => {
    update({ body: id, force: null });
    setLive(`נבחר הגוף: ${nameOf(id)}.`);
  };
  const chooseForce = (id: string) => {
    update({ force: s.force === id ? null : id }, { force: true });
  };
  const onPointerDown = (e: PointerEvent) => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    for (const b of scene.bodies) {
      const q = hit.current[b.id];
      if (q && x >= q[0] && x <= q[0] + q[2] && y >= q[1] && y <= q[1] + q[3]) {
        chooseBody(b.id);
        return;
      }
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const ids = scene.bodies.map((b) => b.id);
      const i = ids.indexOf(s.body);
      chooseBody(ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]);
    }
  };
  const reset = () => {
    stepState.current = null;
    user.current = { force: false, side: false, aUp: false, M: false };
    setS(settle(initial(props)));
    setLive('האיור אופס.');
  };

  const scenes = props.scenes ?? [];
  const okAll = Object.values(scene.ok).every(Boolean);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: כמה גופים ותרשים כוחות לכל אחד. ${describe()} החיצים ימינה ושמאלה מחליפים גוף.`}
      canvasRef={canvasRef}
      aspect={4 / 3}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      cursor="pointer"
      readout={
        <>
          <span data-readout="body">
            {body.name}:{' '}
            <bdi class="q">
              <Sym s={body.massSymbol} /> = {num(body.m)} kg
            </bdi>
          </span>
          <b data-readout="a">
            <bdi class="q">a = {num(mag(body.a))} m/s²</bdi>
            {mag(body.a) > 1e-9 ? ` ${dirOf(body.a)}` : ''}
          </b>
          {fbd.map((f) => (
            <span key={f.id} data-readout={`f-${plain(f.symbol)}`}>
              <bdi class="q">
                <Sym s={f.symbol} /> = {num(mag(f.vec))} N
              </bdi>
              {mag(f.vec) > 1e-9 ? ` ${dirOf(f.vec)}` : ''} (של {nameOf(f.by)})
            </span>
          ))}
          <b data-readout="net">
            <bdi class="q">ΣF = {num(mag(net))} N</bdi>
            {mag(net) > 1e-9 ? ` ${dirOf(net)}` : ''}
          </b>
          {sel && partner && (
            <span data-readout="pair">
              הזוג של <Sym s={sel.symbol} />: הכוח של {nameOf(partner.by)} על {nameOf(partner.on)} —{' '}
              <bdi class="q">{num(mag(partner.vec))} N</bdi>
              {mag(partner.vec) > 1e-9 ? ` ${dirOf(partner.vec)}` : ''}
            </span>
          )}
          {scene.muNeeded !== undefined && (
            <span data-readout="mu">
              מקדם החיכוך הסטטי הדרוש בין A ל-B: לפחות <bdi class="q">{num(scene.muNeeded)}</bdi>
            </span>
          )}
          {!okAll && (
            <span data-readout="warn">
              המודל לא תקף כאן: {Object.entries(scene.ok).filter(([, v]) => !v).map(([k]) => k).join(', ')} לא מתקיים
            </span>
          )}
        </>
      }
      controls={
        <>
          {scenes.length > 1 && (
            <div class="group" role="group" aria-label="בחירת מצב">
              {scenes.map((name) => (
                <Toggle key={name} label={SCENE_LABEL[name]} on={s.scene === name} onChange={() => chooseScene(name)} />
              ))}
            </div>
          )}
          <div class="group" role="group" aria-label="בחירת גוף">
            {scene.bodies.map((b) => (
              <Toggle key={b.id} label={b.name} on={s.body === b.id} onChange={() => chooseBody(b.id)} />
            ))}
          </div>
          <div class="group" role="group" aria-label="הכוחות על הגוף: בחרו כוח כדי לראות את הזוג שלו">
            {fbd.map((f) => (
              <Toggle
                key={f.id}
                label={
                  <>
                    <Sym s={f.symbol} /> מ{nameOf(f.by)}
                  </>
                }
                on={s.force === f.id}
                swatch="var(--force)"
                onChange={() => chooseForce(f.id)}
              />
            ))}
            <Toggle label="ΣF" on={s.showNet} swatch="var(--force)" onChange={(x) => update({ showNet: x })} />
          </div>
          {s.scene === 'book' && (
            <Slider
              label="תאוצת המעלית (למעלה חיובי)"
              min={AUP.min}
              max={AUP.max}
              step={AUP.step}
              value={s.aUp}
              format={(x) => `${num(x)} m/s²`}
              onChange={(x) => update({ aUp: x }, { aUp: true })}
            />
          )}
          {s.scene === 'contact' && (
            <>
              <div class="group" role="group" aria-label="מספר הגושים וצד הדחיפה">
                <Toggle label="שני גושים" on={s.n === 2} onChange={() => update({ n: 2 })} />
                <Toggle label="שלושה גושים" on={s.n === 3} onChange={() => update({ n: 3 })} />
                <Toggle label="דחיפה משמאל" on={s.side === 'left'} onChange={() => update({ side: 'left' }, { side: true })} />
                <Toggle label="דחיפה מימין" on={s.side === 'right'} onChange={() => update({ side: 'right' }, { side: true })} />
              </div>
              <Slider label="הדחיפה F" min={FPUSH.min} max={FPUSH.max} step={FPUSH.step} value={s.F} format={(x) => `${num(x)} N`} onChange={(x) => update({ F: x })} />
            </>
          )}
          {s.scene === 'stack' && (
            <>
              <div class="group" role="group" aria-label="על איזה גוש מושכים">
                <Toggle label="מושכים את B" on={s.stackOn === 'B'} onChange={() => update({ stackOn: 'B' })} />
                <Toggle label="מושכים את A" on={s.stackOn === 'A'} onChange={() => update({ stackOn: 'A' })} />
              </div>
              <Slider label="המשיכה F" min={FPULL.min} max={FPULL.max} step={FPULL.step} value={s.Fstack} format={(x) => `${num(x)} N`} onChange={(x) => update({ Fstack: x })} />
            </>
          )}
          {s.scene === 'pulley' && (
            <Slider label="המסה M שעל השולחן" min={MBLOCK.min} max={MBLOCK.max} step={MBLOCK.step} value={s.M} format={(x) => `${num(x)} kg`} onChange={(x) => update({ M: x }, { M: true })} />
          )}
          {s.scene === 'horse' && (
            <Slider
              label="הדחיפה של הקרקע על הסוס"
              min={FGROUND.min}
              max={FGROUND.max}
              step={FGROUND.step}
              value={s.Fground}
              format={(x) => `${num(x)} N`}
              onChange={(x) => update({ Fground: x })}
            />
          )}
        </>
      }
    />
  );
}

/* --------------------------------------------------------------------------- the sketch */

type Box = { x: number; y: number; w: number; h: number };
type Rect = [number, number, number, number];

/**
 * Draw the scene in a box of CSS px. Each scene is laid out in its own units (y up) and scaled to fit;
 * returns each body's rectangle in CSS px.
 */
function drawSketch(ctx: CanvasRenderingContext2D, p: Palette, sc: Scene, s: State, box: Box): Record<string, Rect> {
  const SIZE: Record<SceneName, [number, number]> = { book: [10, 6], contact: [12, 5], stack: [12, 5], pulley: [12, 7], horse: [12, 5] };
  const [SW, SH] = SIZE[s.scene];
  const k = Math.min(box.w / SW, box.h / SH);
  const ox = box.x + (box.w - SW * k) / 2;
  const oy = box.y + (box.h + SH * k) / 2; // the bottom of the sketch, in px
  const X = (u: number) => ox + u * k;
  const Y = (v: number) => oy - v * k;
  /** a rectangle given in sketch units by its left, bottom, right, top */
  const R = (x0: number, y0: number, x1: number, y1: number): Rect => [X(x0), Y(y1), (x1 - x0) * k, (y1 - y0) * k];
  const rects: Record<string, Rect> = {};
  const line = (pts: [number, number][], color = p.ink2, width = 1.6) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach(([u, v], i) => (i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v))));
    ctx.stroke();
    ctx.restore();
  };
  const ground = (y: number, x0: number, x1: number) => {
    line([
      [x0, y],
      [x1, y],
    ], p.ink2, 1.8);
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    for (let u = x0 + 0.2; u < x1; u += 0.5) {
      ctx.beginPath();
      ctx.moveTo(X(u), Y(y));
      ctx.lineTo(X(u - 0.3), Y(y - 0.3));
      ctx.stroke();
    }
    ctx.restore();
  };
  const block = (id: string, r: Rect, label: string) => {
    rects[id] = r;
    ctx.save();
    ctx.fillStyle = p.paper2;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.fillRect(...r);
    ctx.strokeRect(...r);
    ctx.restore();
    sym(ctx, p, label, r[0] + r[2] / 2, r[1] + r[3] / 2, p.ink, 13);
  };
  /** an arrow in sketch units */
  const vec = (x0: number, y0: number, x1: number, y1: number, color: string, label: string, width = 2.4, labelAt: 'tip' | 'mid' = 'tip') => {
    arrow(ctx, X(x0), Y(y0), X(x1), Y(y1), { color, width, head: 10 });
    const dx = X(x1) - X(x0);
    const dy = Y(y1) - Y(y0);
    const d = Math.hypot(dx, dy) || 1;
    // 'mid': above the shaft's middle, for an arrow whose tip touches a body (its label would sit on the body)
    if (labelAt === 'mid') sym(ctx, p, label, (X(x0) + X(x1)) / 2, (Y(y0) + Y(y1)) / 2 - 13, color, 13);
    else sym(ctx, p, label, X(x1) + (12 * dx) / d, Y(y1) + (12 * dy) / d, color, 13);
  };
  const accelArrow = (x: number, y: number, ax: number, ay: number) => {
    const m = Math.hypot(ax, ay);
    if (m < 1e-9) return;
    const L = 1.4;
    vec(x, y, x + (L * ax) / m, y + (L * ay) / m, p.accel, 'a', 2);
  };
  const body = (id: string) => sc.bodies.find((b) => b.id === id)!;

  switch (s.scene) {
    case 'book': {
      // the room, or the elevator: its walls, its floor
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(...R(0.5, 0.3, 9.5, 5.8));
      ctx.restore();
      ground(0.6, 0.5, 9.5);
      // the table: top and two legs; its rectangle is the whole of it
      rects.table = R(3, 0.6, 7, 2.9);
      ctx.save();
      ctx.fillStyle = p.paper2;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.6;
      for (const r of [R(3, 2.6, 7, 2.9), R(3.3, 0.6, 3.6, 2.6), R(6.4, 0.6, 6.7, 2.6)]) {
        ctx.fillRect(...r);
        ctx.strokeRect(...r);
      }
      ctx.restore();
      sym(ctx, p, 'M', X(5), Y(1.8), p.ink, 13);
      block('book', R(4.3, 2.9, 5.7, 3.7), 'm');
      if (Math.abs(s.aUp) > 1e-9) vec(8.6, 2.6, 8.6, 2.6 + 0.4 * s.aUp, p.accel, 'a', 2);
      break;
    }
    case 'contact': {
      ground(0.8, 0.5, 11.5);
      const sizes = sc.bodies.map((b) => 1.4 + 0.4 * b.m);
      const total = sizes.reduce((a, b) => a + b, 0);
      let x = (12 - total) / 2;
      sc.bodies.forEach((b, i) => {
        block(b.id, R(x, 0.8, x + sizes[i], 0.8 + sizes[i]), b.massSymbol);
        x += sizes[i];
      });
      const x0 = (12 - total) / 2;
      const h = 0.8 + sizes[s.side === 'left' ? 0 : sizes.length - 1] / 2;
      if (s.F > 0) {
        if (s.side === 'left') vec(x0 - 1.8, h, x0 - 0.05, h, p.force, 'F', 2.4, 'mid');
        else vec(x0 + total + 1.8, h, x0 + total + 0.05, h, p.force, 'F', 2.4, 'mid');
      }
      accelArrow(6 - 0.7 * Math.sign(body('b1').a[0]), 0.8 + Math.max(...sizes) + 0.5, body('b1').a[0], 0);
      break;
    }
    case 'stack': {
      ground(0.8, 0.5, 11.5);
      block('B', R(3.5, 0.8, 8.5, 2.4), 'B');
      block('A', R(4.8, 2.4, 7.2, 3.6), 'A');
      if (s.Fstack > 0) {
        if (s.stackOn === 'B') vec(8.55, 1.6, 10.6, 1.6, p.force, 'F');
        else vec(7.25, 3.0, 9.3, 3.0, p.force, 'F');
      }
      accelArrow(2, 3.4, body('A').a[0], 0);
      break;
    }
    case 'pulley': {
      // the table: its top and the leg under the pulley
      ctx.save();
      ctx.fillStyle = p.paper2;
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.4;
      ctx.fillRect(...R(0.5, 4.1, 8, 4.5));
      ctx.strokeRect(...R(0.5, 4.1, 8, 4.5));
      ctx.fillRect(...R(7.6, 0.3, 7.9, 4.1));
      ctx.strokeRect(...R(7.6, 0.3, 7.9, 4.1));
      ctx.restore();
      line([
        [8, 4.5],
        [8.4, 4.9],
      ], p.ink2, 1.6);
      const bw = 1.6 + 0.12 * Math.min(s.M, 10);
      block('block', R(4.6 - bw, 4.5, 4.6, 4.5 + 1.2), 'M');
      // the rope: block → over the pulley → down to the weight
      // level with the pulley's top (centre 4.9, radius 0.4), so the rope is parallel to the table
      line([
        [4.6, 5.3],
        [8.4, 5.3],
      ], p.ink, 1.6);
      line([
        [8.8, 4.9],
        [8.8, 2.6],
      ], p.ink, 1.6);
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(X(8.4), Y(4.9), 0.4 * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      block('weight', R(8.2, 1.4, 9.4, 2.6), 'm');
      accelArrow(4.6 - bw / 2 - 0.7, 6.3, body('block').a[0], 0);
      accelArrow(10.2, 2.6, 0, body('weight').a[1]);
      break;
    }
    case 'horse': {
      ground(0.8, 0.5, 11.5);
      // the cart: a box on two wheels
      block('cart', R(1.2, 1.3, 4.6, 2.9), 'm_{2}');
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.6;
      for (const u of [2, 3.8]) {
        ctx.beginPath();
        ctx.arc(X(u), Y(1.05), 0.25 * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      // the horse: a body on four legs
      line([
        [6.6, 1.6],
        [6.6, 0.8],
      ]);
      line([
        [7.1, 1.6],
        [7.1, 0.8],
      ]);
      line([
        [8.8, 1.6],
        [8.8, 0.8],
      ]);
      line([
        [9.3, 1.6],
        [9.3, 0.8],
      ]);
      block('horse', R(6.2, 1.6, 9.6, 3.0), 'm_{1}');
      line([
        [9.6, 2.8],
        [10.4, 3.8],
      ], p.ink, 2.2);
      line([
        [4.6, 2.2],
        [6.2, 2.4],
      ], p.ink, 1.8);
      heLabel(ctx, p, 'עגלה', X(2.9), Y(3.3));
      heLabel(ctx, p, 'סוס', X(7.9), Y(3.4));
      accelArrow(5, 4.2, body('horse').a[0], 0);
      break;
    }
  }
  return rects;
}

function outline(ctx: CanvasRenderingContext2D, r: Rect | undefined, color: string, dash: number[]) {
  if (!r) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.6;
  ctx.setLineDash(dash);
  ctx.strokeRect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8);
  ctx.restore();
}

/* --------------------------------------------------------------------------- the diagrams */

/**
 * One body's free-body diagram in a panel: the body as a small box, every force on it as an arrow from
 * its centre (arrows in one direction side by side), the highlighted one with a halo; the net force as
 * a thick, translucent arrow behind them; the acceleration in its own colour beside the box.
 */
function diagram(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  view: View,
  panel: Box,
  label: string,
  forces: Force[],
  highlight: string | null,
  len: (F: number) => number,
  net: readonly number[] | null,
  acc: readonly number[],
) {
  const cx = panel.x + panel.w / 2;
  const cy = panel.y + 24 + (panel.h - 24) / 2;
  const bw = 26;
  const bh = 20;
  // the net force, behind everything
  if (net) {
    const m = Math.hypot(net[0], net[1]);
    if (m > 1e-9) {
      const L = len(m);
      const ex = cx + (L * net[0]) / m;
      const ey = cy - (L * net[1]) / m;
      arrow(ctx, cx, cy, ex, ey, { color: p.force, width: 7, head: 16, alpha: 0.3 });
      // beyond the tip and to one side, clear of the label of a force that points the same way
      const ux = net[0] / m;
      const uy = -net[1] / m;
      sym(ctx, p, 'ΣF', ex + 12 * ux + 16 * uy, ey + 12 * uy - 16 * ux, withAlpha(p.force, 0.8), 13, view, panel);
    } else {
      sym(ctx, p, 'ΣF = 0', cx + bw / 2 + 6 + symWidth(ctx, p, 'ΣF = 0', 12) / 2, cy + bh / 2 + 12, withAlpha(p.force, 0.85), 12, view, panel);
    }
  }
  ctx.save();
  ctx.fillStyle = p.paper2;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.6;
  ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
  ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
  ctx.restore();
  // the body's mass symbol beside the box, up and to the left, where arrows along the axes do not go
  sym(ctx, p, label, cx - bw / 2 - 12, cy - bh / 2 - 10, p.ink2, 12, view, panel);

  // group the forces by direction, so arrows that share one sit side by side
  const groups = new Map<number, Force[]>();
  const zeros: Force[] = [];
  for (const f of forces) {
    const m = Math.hypot(f.vec[0], f.vec[1]);
    if (len(m) < 2) {
      zeros.push(f);
      continue;
    }
    const key = Math.round(Math.atan2(f.vec[1], f.vec[0]) / (Math.PI / 8));
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  for (const list of groups.values()) {
    list.forEach((f, i) => {
      const m = Math.hypot(f.vec[0], f.vec[1]);
      const ux = f.vec[0] / m;
      const uy = -f.vec[1] / m; // screen y down
      const off = (i - (list.length - 1) / 2) * 13;
      const sx = cx - uy * off;
      const sy = cy + ux * off;
      const L = len(m);
      const ex = sx + ux * L;
      const ey = sy + uy * L;
      const on = f.id === highlight;
      if (on) arrow(ctx, sx, sy, ex, ey, { color: p.accent, width: 9, head: 18, alpha: 0.35 });
      arrow(ctx, sx, sy, ex, ey, { color: p.force, width: on ? 3.2 : 2.2, head: on ? 13 : 10 });
      const side = (Math.abs(uy) * (symWidth(ctx, p, f.symbol, 13) / 2 + 6) + Math.abs(ux) * 9) * Math.sign(off || 1);
      sym(ctx, p, f.symbol, ex + ux * 13 - uy * side, ey + uy * 13 + ux * side, on ? p.accent : p.force, 13, view, panel);
    });
  }
  zeros.forEach((f, i) => sym(ctx, p, `${f.symbol} = 0`, cx, cy + bh / 2 + 30 + 15 * i, p.force, 12, view, panel));

  // the acceleration, in the panel's bottom-left corner, clear of the force arrows
  const am = Math.hypot(acc[0], acc[1]);
  if (am > 1e-9) {
    const x0 = panel.x + 34;
    const y0 = panel.y + panel.h - 34;
    arrow(ctx, x0 - (11 * acc[0]) / am, y0 + (11 * acc[1]) / am, x0 + (11 * acc[0]) / am, y0 - (11 * acc[1]) / am, { color: p.accel, width: 2, head: 8 });
    // the label beside the arrow's middle: above a sideways arrow, to the right of an upright one
    const sideways = Math.abs(acc[0]) >= Math.abs(acc[1]);
    sym(ctx, p, 'a', sideways ? x0 : x0 + 12, sideways ? y0 - 12 : y0, p.accel, 12, view, panel);
  }
}

/** An agent outside the system with only the partner force on it. */
function agentDiagram(ctx: CanvasRenderingContext2D, p: Palette, panel: Box, name: string, f: Force, len: (F: number) => number) {
  const cx = panel.x + panel.w / 2;
  const cy = panel.y + 24 + (panel.h - 24) / 2;
  ctx.save();
  ctx.font = `600 12px ${p.fontUi}`;
  const bw = Math.max(40, Math.min(ctx.measureText(name).width + 14, 70));
  ctx.restore();
  const bh = 24;
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
  ctx.restore();
  // the name above the box, where the one arrow does not go (or below it, if the arrow points up)
  heText(ctx, p, name, cx, f.vec[1] > 0 ? cy + bh / 2 + 12 : cy - bh / 2 - 12, p.ink2);
  const m = Math.hypot(f.vec[0], f.vec[1]);
  if (len(m) < 2) {
    sym(ctx, p, `${f.symbol} = 0`, cx, cy + bh / 2 + 16, p.force, 12);
    return;
  }
  const ux = f.vec[0] / m;
  const uy = -f.vec[1] / m;
  const L = len(m);
  const ex = cx + ux * L;
  const ey = cy + uy * L;
  arrow(ctx, cx, cy, ex, ey, { color: p.accent, width: 9, head: 18, alpha: 0.35 });
  arrow(ctx, cx, cy, ex, ey, { color: p.force, width: 3.2, head: 13 });
  sym(ctx, p, f.symbol, ex + ux * 14 - uy * 10, ey + uy * 14 + ux * 10, p.accent, 13);
}

/* --------------------------------------------------------------------------- text */

/**
 * A math label with subscripts ("N_{1}" draws N with a lowered small 1), centred at (x, y), with a
 * paper halo. Kept inside the panel (if given) and out of the buttons' corner.
 */
function sym(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, color: string, size: number, view?: View, panel?: Box) {
  const parts = s.split(/_\{([^}]*)\}/);
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const big = `italic 600 ${size}px ${p.fontUi}`;
  const small = `600 ${Math.round(size * 0.72)}px ${p.fontUi}`;
  const widths = parts.map((t, i) => {
    ctx.font = i % 2 ? small : big;
    return ctx.measureText(t).width;
  });
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = x;
  let cy = y;
  if (panel) {
    cx = Math.min(Math.max(cx, panel.x + total / 2 + 4), panel.x + panel.w - total / 2 - 4);
    cy = Math.min(Math.max(cy, panel.y + 30), panel.y + panel.h - 10);
  }
  if (view && cx + total / 2 > view.w - BUTTONS_W && cy < BUTTONS_H + 8) cy = BUTTONS_H + 8;
  let at = cx - total / 2;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  parts.forEach((t, i) => {
    ctx.font = i % 2 ? small : big;
    const yy = i % 2 ? cy + size * 0.3 : cy;
    ctx.strokeText(t, at, yy);
    ctx.fillStyle = color;
    ctx.fillText(t, at, yy);
    at += widths[i];
  });
  ctx.restore();
}

/** The drawn width of a math label of sym(). */
function symWidth(ctx: CanvasRenderingContext2D, p: Palette, s: string, size: number) {
  ctx.save();
  let total = 0;
  s.split(/_\{([^}]*)\}/).forEach((t, i) => {
    ctx.font = i % 2 ? `600 ${Math.round(size * 0.72)}px ${p.fontUi}` : `italic 600 ${size}px ${p.fontUi}`;
    total += ctx.measureText(t).width;
  });
  ctx.restore();
  return total;
}

/** Hebrew text, centred at (x, y), with a paper halo. */
function heText(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 12px ${p.fontUi}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = withAlpha(p.paper, 0.9);
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** A small Hebrew name in the sketch. */
function heLabel(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number) {
  heText(ctx, p, s, x, y, p.ink2);
}
