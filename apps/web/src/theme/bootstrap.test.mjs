// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../../../packages/config/theme-bootstrap.js', import.meta.url),
  'utf8',
);
function boot(saved, dark, blocked = false, appearanceScope, appSurface) {
  const root = { dataset: { appearanceScope, appSurface }, style: {} };
  runInNewContext(source, {
    localStorage: {
      getItem: () => {
        if (blocked) throw Error('blocked');
        return saved;
      },
    },
    window: { matchMedia: () => ({ matches: dark }) },
    document: { documentElement: root, querySelector: () => null },
  });
  return root;
}
describe('pre-paint appearance bootstrap', () => {
  it('keeps public web pages light before React even with a saved dark preference', () => {
    const root = boot('dark', true, false, 'public');
    expect(root.dataset.theme).toBe('light');
    expect(root.style.colorScheme).toBe('light');
    expect(root.style.backgroundColor).toBe('#F5F7FA');
  });
  it('uses Light for a new installation regardless of device appearance', () => {
    expect(boot(null, true).dataset.theme).toBe('light');
    expect(boot(null, false).dataset.theme).toBe('light');
  });
  it('honors explicit choices, System and safe invalid-value fallback', () => {
    expect(boot('light', true).dataset.theme).toBe('light');
    expect(boot('dark', false).dataset.theme).toBe('dark');
    expect(boot('system', true).dataset.theme).toBe('dark');
    expect(boot('invalid', true).dataset.theme).toBe('light');
  });
  it('can paint the correct background even with blocked storage and no metadata', () => {
    const root = boot(null, true, true);
    expect(root.style.colorScheme).toBe('light');
    expect(root.style.backgroundColor).toBe('#F5F7FA');
  });
});

it('uses the device appearance for new native installs even before React paints', () => {
  expect(boot(null, true, false, undefined, 'native-mobile').dataset.theme).toBe('dark');
  expect(boot(null, false, false, undefined, 'native-mobile').dataset.theme).toBe('light');
  expect(boot(null, true, true, undefined, 'native-mobile').dataset.theme).toBe('dark');
});
