import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhyChooseUsCarousel } from './WhyChooseUsCarousel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root;
let container: HTMLDivElement;
let viewport: HTMLDivElement;
let viewportWidth: number;
let visibleCards: number;
let resize: () => void;
const scrollTo = vi.fn();

beforeEach(() => {
  viewportWidth = 1200;
  visibleCards = 3;
  scrollTo.mockReset();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  const cardWidth = () => (viewportWidth - (visibleCards - 1) * 24) / visibleCards;
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(() => viewportWidth);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(cardWidth);
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.parentElement
      ? Array.from(this.parentElement.children).indexOf(this) * (cardWidth() + 24)
      : 0;
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => root.render(<WhyChooseUsCarousel />));
  viewport = container.querySelector('#why-choose-us-cards')!;
  Object.defineProperty(viewport, 'scrollTo', { value: scrollTo });
  scrollTo.mockImplementation(({ left }: ScrollToOptions) => {
    viewport.scrollLeft = left ?? 0;
    viewport.dispatchEvent(new Event('scroll'));
  });
}

function button(label: string) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

function status() {
  return container.querySelector('[role="status"]')!.textContent;
}

async function click(label: string) {
  await act(async () => button(label).click());
}

describe('Why choose us carousel', () => {
  it('shows five reasons and advances one card at a time without looping', async () => {
    await render();
    expect(container.querySelectorAll('article')).toHaveLength(5);
    expect(status()).toBe('Cards 1\u20133 of 5');
    expect(button('Previous cards').disabled).toBe(true);
    await click('Next cards');
    expect(status()).toBe('Cards 2\u20134 of 5');
    await click('Next cards');
    expect(status()).toBe('Cards 3\u20135 of 5');
    expect(button('Next cards').disabled).toBe(true);
    await click('Next cards');
    expect(status()).toBe('Cards 3\u20135 of 5');
    await click('Previous cards');
    expect(status()).toBe('Cards 2\u20134 of 5');
  });

  it('supports keyboard navigation while retaining focus on the scroll region', async () => {
    await render();
    viewport.focus();
    for (const [key, expected] of [
      ['ArrowRight', '2\u20134'],
      ['End', '3\u20135'],
      ['Home', '1\u20133'],
      ['ArrowLeft', '1\u20133'],
    ]) {
      await act(async () =>
        viewport.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        ),
      );
      expect(status()).toBe(`Cards ${expected} of 5`);
      expect(document.activeElement).toBe(viewport);
    }
  });

  it('keeps each rapid click when the first smooth scroll has not finished', async () => {
    await render();
    scrollTo.mockImplementationOnce(() => undefined);
    await click('Next cards');
    await click('Next cards');
    expect(status()).toBe('Cards 3\u20135 of 5');
    expect(button('Next cards').disabled).toBe(true);
  });

  it('updates the visible range and clamps the position when resizing', async () => {
    await render();
    await click('Next cards');
    await click('Next cards');
    viewportWidth = 768;
    visibleCards = 2;
    await act(async () => resize());
    expect(status()).toBe('Cards 3\u20134 of 5');
    await click('Next cards');
    expect(status()).toBe('Cards 4\u20135 of 5');
    viewportWidth = 1200;
    visibleCards = 3;
    await act(async () => resize());
    expect(status()).toBe('Cards 3\u20135 of 5');
    expect(button('Next cards').disabled).toBe(true);
    viewportWidth = 320;
    visibleCards = 1;
    await act(async () => resize());
    expect(status()).toBe('Cards 3 of 5');
    expect(button('Next cards').disabled).toBe(false);
  });

  it('keeps controls and announcements in sync after native scrolling', async () => {
    viewportWidth = 320;
    visibleCards = 1;
    await render();
    await act(async () => {
      viewport.scrollLeft = (320 + 24) * 4;
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(status()).toBe('Cards 5 of 5');
    expect(button('Next cards').disabled).toBe(true);
    expect(button('Previous cards').disabled).toBe(false);
  });

  it('uses instant navigation when reduced motion is requested', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    await render();
    await click('Next cards');
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 408, behavior: 'auto' });
  });
});
