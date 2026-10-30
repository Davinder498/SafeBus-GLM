// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../../../packages/config/theme-bootstrap.js', import.meta.url),
  'utf8',
);
function boot(saved, dark, blocked = false, appearanceScope) {
  const root = { dataset: { appearanceScope }, style: {} };
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
    expect(root.style.backgroundColor).toBe('#F2F6F7');
  });
  it('uses Light for a new installation regardless of device appearance', () => {
    expect(boot(null, true).dataset.theme).toBe('light');
    expect(boot(null, false).dataset.theme).toBe('light');
  });
  it('honors both choices and migrates removed System and invalid values to Light', () => {
    expect(boot('light', true).dataset.theme).toBe('light');
    expect(boot('dark', false).dataset.theme).toBe('dark');
    expect(boot('system', true).dataset.theme).toBe('light');
    expect(boot('invalid', true).dataset.theme).toBe('light');
  });
  it('can paint the correct background even with blocked storage and no metadata', () => {
    const root = boot(null, true, true);
    expect(root.style.colorScheme).toBe('light');
    expect(root.style.backgroundColor).toBe('#F2F6F7');
  });
});
