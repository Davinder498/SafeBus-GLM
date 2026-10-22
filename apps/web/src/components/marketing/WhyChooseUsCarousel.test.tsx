import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhyChooseUsCarousel } from './WhyChooseUsCarousel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root;
let container: HTMLDivElement;
let intersect: (entries: { isIntersecting: boolean }[]) => void;
let motionChange: () => void;
let reducedMotion: boolean;

beforeEach(() => {
  vi.useFakeTimers();
  reducedMotion = false;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof intersect) {
        intersect = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return reducedMotion;
      },
      addEventListener: (_: string, callback: () => void) => {
        motionChange = callback;
      },
      removeEventListener: vi.fn(),
    })),
  );
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(visible = true) {
  await act(async () => root.render(<WhyChooseUsCarousel />));
  await act(async () => intersect([{ isIntersecting: visible }]));
}

function button(label: string) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

function title() {
  return container.querySelector('article[aria-hidden="false"] h3')!.textContent;
}

async function click(label: string) {
  await act(async () => button(label).click());
}

async function advance(milliseconds = 3000) {
  await act(async () => vi.advanceTimersByTime(milliseconds));
}

describe('Why choose us carousel', () => {
  it('shows one reason at a time, changes after three seconds and loops', async () => {
    await render();
    expect(container.querySelectorAll('article')).toHaveLength(5);
    expect(container.querySelectorAll('article[aria-hidden="false"]')).toHaveLength(1);
    expect(title()).toBe('Security at the core');
    await advance(2999);
    expect(title()).toBe('Security at the core');
    await advance(1);
    expect(title()).toBe('5% for brighter futures');
    for (let index = 0; index < 4; index++) await advance();
    expect(title()).toBe('Security at the core');
    expect(container.querySelector('#why-choose-us-cards')?.getAttribute('aria-live')).toBe('off');
  });

  it('supports direct selection and keyboard navigation', async () => {
    await render();
    await click('Show reason 3: Proudly Alberta-based');
    expect(title()).toBe('Proudly Alberta-based');
    const region = container.querySelector<HTMLDivElement>('[aria-roledescription="carousel"]')!;
    await act(async () => region.focus());
    for (const [key, expected] of [
      ['ArrowRight', 'No ads. No data sales.'],
      ['End', 'Built around school transportation'],
      ['Home', 'Security at the core'],
      ['ArrowLeft', 'Built around school transportation'],
    ]) {
      await act(async () =>
        region.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        ),
      );
      expect(title()).toBe(expected);
      expect(document.activeElement).toBe(region);
    }
    expect(
      container.querySelector('button[aria-current="true"]')?.getAttribute('aria-label'),
    ).toContain('reason 5');
  });

  it('pauses while hovered or focused and waits three seconds after interaction ends', async () => {
    await render();
    const region = container.querySelector<HTMLDivElement>('[aria-roledescription="carousel"]')!;
    await act(async () => region.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    await advance(6000);
    expect(title()).toBe('Security at the core');
    await act(async () => region.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
    await advance();
    expect(title()).toBe('5% for brighter futures');
    await act(async () => button('Show reason 2: 5% for brighter futures').focus());
    await advance(6000);
    expect(title()).toBe('5% for brighter futures');
    await act(async () => button('Show reason 2: 5% for brighter futures').blur());
    await advance();
    expect(title()).toBe('Proudly Alberta-based');
  });

  it('does not rotate offscreen or in a background tab', async () => {
    await render(false);
    await advance(6000);
    expect(title()).toBe('Security at the core');
    await act(async () => intersect([{ isIntersecting: true }]));
    await advance();
    expect(title()).toBe('5% for brighter futures');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await advance(6000);
    expect(title()).toBe('5% for brighter futures');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await advance();
    expect(title()).toBe('Proudly Alberta-based');
  });

  it('respects reduced motion on load and when the preference changes', async () => {
    reducedMotion = true;
    await render();
    await advance(6000);
    expect(title()).toBe('Security at the core');
    await click('Show reason 2: 5% for brighter futures');
    expect(title()).toBe('5% for brighter futures');
    reducedMotion = false;
    await act(async () => motionChange());
    await advance();
    expect(title()).toBe('Proudly Alberta-based');
    reducedMotion = true;
    await act(async () => motionChange());
    await advance(6000);
    expect(title()).toBe('Proudly Alberta-based');
  });

  it('cleans up the rotation timer on unmount', async () => {
    await render();
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container);
  });
});
