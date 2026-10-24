import { expect, type Page } from '@playwright/test';

/** Check the visible contents too: a fixed-height control can clip its own
 * label while the document still passes a scrollWidth-only assertion. */
export async function expectUsableMobileLayout(page: Page) {
  const failures = await page.evaluate(() => {
    const failures: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1)
      failures.push('Page scrolls horizontally');
    for (const element of document.querySelectorAll<HTMLElement>(
      'button, input:not([type="hidden"]), select, textarea',
    )) {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height || getComputedStyle(element).visibility === 'hidden') continue;
      const name =
        element.getAttribute('aria-label') ||
        element.textContent?.trim() ||
        element.id ||
        element.tagName;
      if (box.left < -1 || box.right > window.innerWidth + 1)
        failures.push(`${name}: outside page width`);
      if (element.matches('button')) {
        if (box.height < 43) failures.push(`${name}: touch target below 44px`);
        const range = document.createRange();
        range.selectNodeContents(element);
        for (const rect of range.getClientRects()) {
          if (
            rect.width > 0 &&
            rect.height > 0 &&
            (rect.left < box.left - 1 ||
              rect.right > box.right + 1 ||
              rect.top < box.top - 1 ||
              rect.bottom > box.bottom + 1)
          )
            failures.push(`${name}: label clipped or outside button`);
        }
      }
    }
    return [...new Set(failures)];
  });
  expect(
    failures,
    'Controls must fit the viewport, contain their labels, and be usable by touch',
  ).toEqual([]);
}
