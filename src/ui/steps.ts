/**
 * The step bus: text steps drive the live figure beside them (scrollytelling).
 *
 * A <Step fig="fig-1-5" state={{...}}> in the text page becomes an element with data
 * attributes; when it reaches the middle of the viewport the bus announces its state.
 * Figures may hydrate after the first announcement, so the last state per figure is kept on
 * window and handed to late subscribers.
 */

export type StepState = Record<string, unknown>;

interface StepDetail {
  fig: string;
  id: string;
  state: StepState;
}

declare global {
  interface Window {
    __unimechSteps?: Record<string, StepDetail>;
  }
}

const EVENT = 'unimech:step';

export function announceStep(detail: StepDetail) {
  window.__unimechSteps ??= {};
  window.__unimechSteps[detail.fig] = detail;
  window.dispatchEvent(new CustomEvent<StepDetail>(EVENT, { detail }));
}

/** Subscribe a figure to its steps; the callback fires immediately with the latest state. */
export function subscribeSteps(fig: string, cb: (state: StepState, id: string) => void): () => void {
  const handler = (e: Event) => {
    const d = (e as CustomEvent<StepDetail>).detail;
    if (d.fig === fig) cb(d.state, d.id);
  };
  window.addEventListener(EVENT, handler);
  const last = window.__unimechSteps?.[fig];
  if (last) cb(last.state, last.id);
  return () => window.removeEventListener(EVENT, handler);
}

/** Wire every [data-step] element on the page to the bus. Called once by the lesson layout. */
export function initStepObserver() {
  const steps = Array.from(document.querySelectorAll<HTMLElement>('[data-step]'));
  if (steps.length === 0) return;
  let current: HTMLElement | null = null;
  // scrolling re-announces nothing while the same step stays mid-screen; a click always does, so
  // clicking the active step puts the figure back in that step's state (lessons promise this)
  const activate = (el: HTMLElement, force = false) => {
    if (el === current && !force) return;
    current?.classList.remove('is-active');
    el.classList.add('is-active');
    current = el;
    announceStep({
      fig: el.dataset.fig ?? '',
      id: el.dataset.step ?? '',
      state: JSON.parse(el.dataset.state ?? '{}'),
    });
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) activate(e.target as HTMLElement);
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  steps.forEach((s) => {
    io.observe(s);
    s.addEventListener('click', () => activate(s, true));
  });
}
