/**
 * The prefix ruler: one logarithmic ruler from 10⁻¹² to 10⁹, a marker the student slides along it,
 * and the marked quantity written three ways: scientific notation, with a prefix, and in full.
 * Built for lesson 0.3. Each step of the ruler is a factor of 10, and the prefixes sit every three
 * steps, so "μ is a thousand times smaller than m" is something you can see.
 *
 * The value is kept as a mantissa from a short list times a power of ten, so every readout is
 * digit-exact (0.15, never 0.15000000000000002).
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { handNote, withAlpha } from './core/ink';
import { decimalOf, PREFIXES, prefixed, superscript } from './core/format';
import SimShell, { Toggle, type TaskDef } from './core/SimShell';

export type RulerUnit = 's' | 'm';

const E_MIN = -12;
const E_MAX = 9;
const MANTISSAS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9];
const ASPECT = 1.9;

interface Landmark {
  /** value as [mantissa, exponent] */
  at: [number, number];
  label: string;
}

const LANDMARKS: Record<RulerUnit, Landmark[]> = {
  s: [
    { at: [8.6, 4], label: 'יממה' },
    { at: [3.2, 7], label: 'שנה' },
  ],
  m: [
    { at: [1, -10], label: 'אטום' },
    { at: [6.4, 6], label: 'רדיוס כדור הארץ' },
  ],
};

/** a band on the ruler: where this unit's numbers live in the course */
const BANDS: Record<RulerUnit, { from: number; to: number; label: string } | null> = {
  s: { from: -3, to: 1, label: 'הזמנים בניסויי פרק 1' },
  m: null,
};

const UNIT_LABEL: Record<RulerUnit, string> = { s: 'זמן, בשניות', m: 'אורך, במטר' };

const TASK_LABEL: Record<string, string> = {
  'set-20ms': 'בזמן: הזיזו את הסמן ל-20 מילי-שניות (קריאה של שער אור). איך כותבים את זה בכתיב מדעי?',
  'set-15cm': 'באורך: הזיזו את הסמן ל-15 ס"מ. כמה זה במטרים?',
};

interface State {
  m: number;
  e: number;
  unit: RulerUnit;
}

export interface PrefixRulerProps {
  id: string;
  unit?: RulerUnit;
  /** starting value as [mantissa, exponent] */
  value?: [number, number];
  tasks?: string[];
}

const initial = (p: PrefixRulerProps): State => ({ m: p.value?.[0] ?? 3, e: p.value?.[1] ?? -5, unit: p.unit ?? 's' });

/** every value on the ruler, in order */
const NOTCHES: [number, number][] = [];
for (let e = E_MIN; e <= E_MAX; e++) for (const m of MANTISSAS) if (e < E_MAX || m === 1) NOTCHES.push([m, e]);
const notchIndex = (m: number, e: number) => NOTCHES.findIndex(([nm, ne]) => nm === m && ne === e);
const log = (m: number, e: number) => Math.log10(m) + e;

const sciText = (m: number, e: number, unit: string) => `${String(m)}·10${superscript(e)} ${unit}`;
const cmText = (m: number, e: number) => (e >= -3 && e < 0 ? `${decimalOf(m, e + 2)} cm` : null);

export default function PrefixRuler(props: PrefixRulerProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const dragging = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) =>
        setS((prev) => {
          const next = { ...prev };
          if (st.unit === 's' || st.unit === 'm') next.unit = st.unit;
          if (Array.isArray(st.value) && notchIndex(Number(st.value[0]), Number(st.value[1])) >= 0) {
            next.m = Number(st.value[0]);
            next.e = Number(st.value[1]);
          }
          return next;
        }),
      ),
    [props.id],
  );

  useEffect(() => {
    if (props.tasks?.includes('set-20ms') && s.unit === 's' && s.m === 2 && s.e === -2) markTask(`${props.id}:set-20ms`);
    if (props.tasks?.includes('set-15cm') && s.unit === 'm' && s.m === 1.5 && s.e === -1) markTask(`${props.id}:set-15cm`);
  }, [s, props.id, props.tasks]);

  const layout = (v: View) => {
    const pad = Math.max(18, v.w * 0.04);
    const x0 = pad;
    const x1 = v.w - pad;
    return { x0, x1, y: v.h * 0.52, px: (L: number) => x0 + ((L - E_MIN) / (E_MAX - E_MIN)) * (x1 - x0) };
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const { x0, x1, y, px } = layout(view);
    const narrow = view.w < 520;

    const band = BANDS[s.unit];
    if (band) {
      ctx.save();
      ctx.fillStyle = withAlpha(p.velocity, 0.14);
      ctx.fillRect(px(band.from), y - 12, px(band.to) - px(band.from), 24);
      ctx.restore();
      handNote(ctx, band.label, (px(band.from) + px(band.to)) / 2, y + 48, p, narrow ? 12 : 14);
    }

    // the ruler: a tick per power of ten, longer ticks and labels at the prefixes
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    for (let e = E_MIN; e <= E_MAX; e++) {
      const major = e in PREFIXES;
      const x = px(e);
      ctx.lineWidth = major ? 1.6 : 1;
      ctx.strokeStyle = major ? p.ink : p.ink3;
      ctx.beginPath();
      ctx.moveTo(x, y - (major ? 9 : 5));
      ctx.lineTo(x, y + (major ? 9 : 5));
      ctx.stroke();
      if (e < E_MAX) {
        // minor marks at 2…9: the ruler is logarithmic, they crowd toward the next power
        ctx.strokeStyle = withAlpha(p.ink, 0.18);
        ctx.lineWidth = 1;
        for (let m = 2; m <= 9; m++) {
          const xm = px(e + Math.log10(m));
          ctx.beginPath();
          ctx.moveTo(xm, y - 2.5);
          ctx.lineTo(xm, y + 2.5);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = p.ink;
    for (const [k, name] of Object.entries(PREFIXES)) {
      const e = Number(k);
      ctx.font = `700 ${narrow ? 13 : 16}px ${p.fontUi}`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(name === '' ? (s.unit as string) : `${name}${s.unit}`, px(e), y - 13);
      ctx.font = `${narrow ? 10 : 12}px ${p.fontUi}`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = p.ink2;
      ctx.fillText(e === 0 ? '1' : `10${superscript(e)}`, px(e), y + 13);
      ctx.fillStyle = p.ink;
    }
    if (s.unit === 'm') {
      ctx.font = `600 ${narrow ? 11 : 13}px ${p.fontUi}`;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = p.ink2;
      ctx.fillText('cm', px(-2), y - 13 - (narrow ? 14 : 17));
    }
    ctx.restore();

    for (const l of LANDMARKS[s.unit]) {
      const x = px(log(...l.at));
      ctx.save();
      ctx.fillStyle = p.hand;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      handNote(ctx, l.label, x, y + 48, p, narrow ? 12 : 14);
    }

    // the marker
    const xm = px(log(s.m, s.e));
    ctx.save();
    ctx.fillStyle = p.accent;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(xm, y - 4);
    ctx.lineTo(xm - 8, y - 4 - 30);
    ctx.lineTo(xm + 8, y - 4 - 30);
    ctx.closePath();
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(xm, y - 34);
    ctx.lineTo(xm, y + 16);
    ctx.stroke();
    const text = prefixed(s.m, s.e, s.unit);
    ctx.font = `700 ${narrow ? 14 : 17}px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(text).width;
    const tx = Math.max(x0 + tw / 2, Math.min(x1 - tw / 2, xm));
    ctx.fillText(text, tx, y - 40);
    ctx.restore();
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  const describe = (st: State) => {
    const cm = st.unit === 'm' ? cmText(st.m, st.e) : null;
    return `הסמן על ${prefixed(st.m, st.e, st.unit)}, כלומר ${st.m} כפול 10 בחזקת ${st.e} ${st.unit === 's' ? 'שניות' : 'מטר'}${cm ? `, שהם ${cm}` : ''}.`;
  };

  const setNotch = (i: number) => {
    const [m, e] = NOTCHES[Math.max(0, Math.min(NOTCHES.length - 1, i))];
    setS((prev) => (prev.m === m && prev.e === e ? prev : { ...prev, m, e }));
  };

  const fromPointer = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const { x0, x1 } = layout(v);
    const L = E_MIN + ((e.offsetX - x0) / (x1 - x0)) * (E_MAX - E_MIN);
    let best = 0;
    NOTCHES.forEach(([m, ex], i) => {
      if (Math.abs(log(m, ex) - L) < Math.abs(log(...NOTCHES[best]) - L)) best = i;
    });
    setNotch(best);
  };

  /** move the marker by `by` notches (the keyboard, and the ‹ › buttons: a 2-pixel target is no target on a phone) */
  const nudge = (by: number) => {
    const [m, ex] = NOTCHES[Math.max(0, Math.min(NOTCHES.length - 1, notchIndex(s.m, s.e) + by))];
    const next = { ...s, m, e: ex };
    setS(next);
    setLive(describe(next));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? MANTISSAS.length : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nudge(step);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nudge(-step);
    else return;
    e.preventDefault();
  };

  const cm = s.unit === 'm' ? cmText(s.m, s.e) : null;
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: סרגל של חזקות עשר, מ-10 בחזקת מינוס 12 עד 10 בחזקת 9. ${describe(s)} גררו את הסמן; במקלדת: חיצים מזיזים, Shift קופץ חזקה שלמה.`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onReset={() => setS(initial(props))}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e)}
      onPointerUp={() => {
        if (dragging.current) setLive(describe(s));
        dragging.current = false;
      }}
      cursor="ew-resize"
      readout={
        <>
          <span>
            כתיב מדעי: <b class="q">{sciText(s.m, s.e, s.unit)}</b>
          </span>
          <span>
            עם קידומת: <b class="q">{prefixed(s.m, s.e, s.unit)}</b>
            {cm && cm !== prefixed(s.m, s.e, s.unit) && <b class="q"> = {cm}</b>}
          </span>
          <span style={{ overflowWrap: 'anywhere' }}>
            במלואו: <b class="q">{decimalOf(s.m, s.e)} {s.unit}</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="איזה גודל מודדים">
            {(['s', 'm'] as RulerUnit[]).map((u) => (
              <Toggle key={u} label={UNIT_LABEL[u]} on={s.unit === u} onChange={() => setS({ ...s, unit: u })} />
            ))}
          </div>
          <div class="group ltr-space" role="group" aria-label="כיוון עדין">
            <button type="button" class="toggle" aria-label="ערך קטן יותר" onClick={() => nudge(-1)}>
              ‹
            </button>
            <button type="button" class="toggle" aria-label="ערך גדול יותר" onClick={() => nudge(1)}>
              ›
            </button>
          </div>
          <p class="hint hand">גררו את הסמן לאורך הסרגל, וכוונו בכפתורים. מקו לקו: פי 10. מקידומת לקידומת: פי 1000.</p>
        </>
      }
    />
  );
}
