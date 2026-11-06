/**
 * The frame every simulation sits in: an LTR canvas stage, an RTL control panel, guided
 * tasks with check marks, a fullscreen button and an aria-live line for screen readers.
 */

import type { ComponentChildren, Ref } from 'preact';
import { useRef } from 'preact/hooks';
import { progress } from '~/progress/store';
import { useMounted } from '~/ui/useMounted';
import './SimShell.css';

export interface TaskDef {
  id: string;
  label: string;
}

interface Props {
  /** figure id; task ids are stored as `${fig}:${task}` */
  fig: string;
  label: string;
  canvasRef: Ref<HTMLCanvasElement>;
  /** aspect ratio of the stage, width / height */
  aspect?: number;
  controls?: ComponentChildren;
  readout?: ComponentChildren;
  tasks?: TaskDef[];
  live: string;
  onReset?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  onPointerDown?: (e: PointerEvent) => void;
  onPointerMove?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
  cursor?: string;
}

export default function SimShell(p: Props) {
  const root = useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  const done = mounted ? progress.value.tasks : {};
  const toggleFull = () => {
    const el = root.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };
  return (
    <div class="sim" ref={root}>
      <div class="sim-stage ltr-space" style={{ aspectRatio: String(p.aspect ?? 4 / 3) }}>
        <canvas
          ref={p.canvasRef}
          tabIndex={0}
          role="img"
          aria-label={p.label}
          style={{ cursor: p.cursor ?? 'default' }}
          onKeyDown={p.onKeyDown}
          onPointerDown={p.onPointerDown}
          onPointerMove={p.onPointerMove}
          onPointerUp={p.onPointerUp}
          onPointerCancel={p.onPointerUp}
        />
        <div class="sim-tools">
          {p.onReset && (
            <button type="button" class="tool" onClick={p.onReset} title="איפוס" aria-label="איפוס">
              ↺
            </button>
          )}
          <button type="button" class="tool" onClick={toggleFull} title="מסך מלא" aria-label="מסך מלא">
            ⛶
          </button>
        </div>
      </div>
      {p.readout && <div class="sim-readout">{p.readout}</div>}
      {p.controls && <div class="sim-controls">{p.controls}</div>}
      {p.tasks && p.tasks.length > 0 && (
        <ol class="sim-tasks" aria-label="משימות">
          {p.tasks.map((t) => {
            const ok = !!done[`${p.fig}:${t.id}`];
            return (
              <li class={ok ? 'done' : ''} key={t.id}>
                <span class="tick" aria-hidden="true">
                  {ok ? '✓' : ''}
                </span>
                <span>{t.label}</span>
                {ok && <span class="sr-only"> (הושלם)</span>}
              </li>
            );
          })}
        </ol>
      )}
      <p class="sr-only" aria-live="polite">
        {p.live}
      </p>
    </div>
  );
}

/** A labelled toggle chip for the control panel. A label with math ("1/r") passes <bdi dir="ltr">. */
export function Toggle(p: { label: ComponentChildren; on: boolean; onChange: (v: boolean) => void; swatch?: string }) {
  return (
    <button type="button" class={`toggle ${p.on ? 'on' : ''}`} aria-pressed={p.on} onClick={() => p.onChange(!p.on)}>
      {p.swatch && <span class="swatch" style={{ background: p.swatch }} aria-hidden="true" />}
      {p.label}
    </button>
  );
}

/** A slider whose physical axis runs left→right whatever the page direction. */
export function Slider(p: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label class="slider">
      <span class="slider-label">{p.label}</span>
      <input
        type="range"
        dir="ltr"
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        aria-valuetext={p.format(p.value)}
        onInput={(e) => p.onChange(Number((e.target as HTMLInputElement).value))}
      />
      <output class="q">{p.format(p.value)}</output>
    </label>
  );
}
