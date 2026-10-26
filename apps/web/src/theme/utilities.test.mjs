// @vitest-environment node
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import config from '../../tailwind.config.js';

describe('shared palette compatibility', () => {
  it('compiles valid dark colors for existing utilities, opacity and interaction variants', async () => {
    const result = await postcss([
      tailwind({
        ...config,
        content: [
          { raw: 'text-slate-900 bg-white hover:bg-white/95 focus:ring-navy-500 divide-slate-200' },
        ],
      }),
    ]).process('@tailwind utilities;', { from: undefined });
    const declarations = [];
    result.root.walkRules((rule) => {
      if (rule.selector.includes('html[data-theme="dark"]')) {
        rule.walkDecls((declaration) => declarations.push(declaration.value));
      }
    });
    expect(declarations).toContain('rgb(var(--color-text-rgb) / 1)');
    expect(declarations).toContain('rgb(var(--color-surface-rgb) / 0.95)');
    expect(declarations).toContain('rgb(var(--color-focus-rgb) / 1)');
    expect(
      declarations.every((value) => !value.includes('=>') && !value.includes('<alpha-value>')),
    ).toBe(true);
    expect(result.css).toContain('@media screen');
    expect(result.css).toContain('color: rgb(15 23 42 / var(--tw-text-opacity, 1))');
  });
});
