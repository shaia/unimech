/**
 * Canvas plumbing shared by every live figure: crisp rendering on high-DPI screens,
 * a world↔screen transform in SI metres, theme colours read from CSS tokens, and a frame
 * loop that pauses when the figure is off-screen or the reader wants stillness.
 */

import { useEffect, useRef } from 'preact/hooks';
import { motionAllowed } from '~/progress/settings';

export interface View {
  /** CSS pixel size */
  w: number;
  h: number;
  dpr: number;
  /** CSS pixels per metre */
  ppm: number;
  /** world point at the canvas centre [m] */
  ox: number;
  oy: number;
}

export const toScreen = (v: View, x: number, y: number): [number, number] => [
  v.w / 2 + (x - v.ox) * v.ppm,
  v.h / 2 - (y - v.oy) * v.ppm,
];

export const toWorld = (v: View, sx: number, sy: number): [number, number] => [
  v.ox + (sx - v.w / 2) / v.ppm,
  v.oy - (sy - v.h / 2) / v.ppm,
];

export interface Palette {
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  paper: string;
  paper2: string;
  accent: string;
  hand: string;
  pos: string;
  neg: string;
  velocity: string;
  accel: string;
  force: string;
  momentum: string;
  energyK: string;
  energyP: string;
  energyEl: string;
  energyTh: string;
  equip: string;
  fontHand: string;
  fontUi: string;
}

export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const g = (n: string) => cs.getPropertyValue(n).trim();
  return {
    ink: g('--ink'),
    ink2: g('--ink-2'),
    ink3: g('--ink-3'),
    rule: g('--rule'),
    paper: g('--paper'),
    paper2: g('--paper-2'),
    accent: g('--accent'),
    hand: g('--hand'),
    pos: g('--pos'),
    neg: g('--neg'),
    velocity: g('--velocity'),
    accel: g('--accel'),
    force: g('--force'),
    momentum: g('--momentum'),
    energyK: g('--energy-k'),
    energyP: g('--energy-p'),
    energyEl: g('--energy-el'),
    energyTh: g('--energy-th'),
    equip: g('--equip'),
    fontHand: g('--font-hand'),
    fontUi: g('--font-ui'),
  };
}

export interface FrameInfo {
  ctx: CanvasRenderingContext2D;
  view: View;
  palette: Palette;
  /** seconds since the loop started (frozen while still) */
  t: number;
}

interface LoopOptions {
  /** world width that must fit [m]; height follows the aspect ratio */
  worldWidth: number;
  worldHeight: number;
  /** request continuous frames (animated figure) */
  animate: boolean;
}

/**
 * Keep a canvas sized to its box and redraw it. `draw` runs on resize, theme change,
 * whenever `invalidate()` is called and, if `animate`, every frame while visible and allowed.
 */
export function useFigureCanvas(
  draw: (f: FrameInfo) => void,
  opts: LoopOptions,
): { canvasRef: { current: HTMLCanvasElement | null }; invalidate: () => void; viewRef: { current: View | null } } {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<View | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const dirty = useRef(true);
  const invalidate = useRef(() => {
    dirty.current = true;
  }).current;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let palette = readPalette(canvas);
    let raf = 0;
    let visible = true;
    let t = 0;
    let last = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const o = optsRef.current;
      const ppm = Math.min(rect.width / o.worldWidth, rect.height / o.worldHeight);
      viewRef.current = { w: rect.width, h: rect.height, dpr, ppm, ox: 0, oy: 0 };
      dirty.current = true;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // the first rAF timestamp is the frame's start, which can precede the performance.now() taken at
      // setup: clamp at 0 so t never goes negative (figures index arrays with t)
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const moving = optsRef.current.animate && visible && motionAllowed();
      if (moving) t += dt;
      if (!moving && !dirty.current) return;
      dirty.current = false;
      const view = viewRef.current;
      if (!view) return;
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.clearRect(0, 0, view.w, view.h);
      drawRef.current({ ctx, view, palette, t });
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver((es) => {
      visible = es.some((e) => e.isIntersecting);
      dirty.current = true;
    });
    io.observe(canvas);
    const onTheme = () => {
      palette = readPalette(canvas);
      dirty.current = true;
    };
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', onTheme);
    window.addEventListener('unimech:settings', onTheme);
    resize();
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mq.removeEventListener('change', onTheme);
      window.removeEventListener('unimech:settings', onTheme);
    };
  }, []);

  return { canvasRef, invalidate, viewRef };
}
