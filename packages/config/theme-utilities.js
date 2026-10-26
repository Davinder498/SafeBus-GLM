/**
 * Resolve palette utilities by role: the same navy is used for text and filled
 * navigation. Dynamic utilities preserve Tailwind variants and opacity without
 * emitting unused classes. Screen-only rules preserve printed documents.
 */
export function themeUtilities({ matchUtilities, theme }) {
  const palettes = [
    'slate',
    'gray',
    'zinc',
    'neutral',
    'navy',
    'yellow',
    'success',
    'green',
    'emerald',
    'warning',
    'amber',
    'orange',
    'danger',
    'red',
    'blue',
    'sky',
    'cyan',
    'teal',
    'purple',
    'violet',
    'indigo',
  ];
  const statusFor = (family) => {
    if (['success', 'green', 'emerald', 'teal'].includes(family)) return 'success';
    if (['warning', 'amber', 'orange', 'yellow'].includes(family)) return 'warning';
    if (['danger', 'red'].includes(family)) return 'danger';
    if (['blue', 'sky', 'cyan', 'purple', 'violet', 'indigo'].includes(family)) return 'info';
    return null;
  };
  const values = {
    text: {},
    bg: {},
    border: {},
    ring: {},
    'ring-offset': {},
    divide: {},
    decoration: {},
  };
  const color = (token) => `rgb(var(--color-${token}-rgb) / <alpha-value>)`;
  const resolve = (value) => (typeof value === 'function' ? value({ opacityValue: 1 }) : value);
  for (const family of palettes) {
    const palette = theme(`colors.${family}`);
    if (!palette || typeof palette !== 'object') continue;
    const status = statusFor(family);
    for (const shade of Object.keys(palette)) {
      const key = `${family}-${shade}`;
      values.text[key] = color(
        status ? `${status}-text` : Number(shade) <= 500 ? 'text-muted' : 'text',
      );
      values.bg[key] = color(
        status
          ? `${status}-${Number(shade) <= 300 ? 'surface' : 'strong'}`
          : Number(shade) <= 300
            ? 'raised'
            : 'surface',
      );
      values.border[key] = color(status ? `${status}-outline` : 'border');
      values.ring[key] = color('focus');
      values['ring-offset'][key] = color('surface');
      values.divide[key] = color('border');
      values.decoration[key] = values.text[key];
    }
  }
  values.bg.white = color('surface');
  values.border.white = color('border');
  values['ring-offset'].white = color('surface');
  for (const [prefix, property] of [
    ['text', 'color'],
    ['bg', 'backgroundColor'],
    ['border', 'borderColor'],
    ['ring', '--tw-ring-color'],
    ['ring-offset', '--tw-ring-offset-color'],
    ['decoration', 'textDecorationColor'],
  ]) {
    matchUtilities(
      {
        [prefix]: (value) => ({
          '@media screen': { 'html[data-theme="dark"] &': { [property]: resolve(value) } },
        }),
      },
      { values: values[prefix], type: 'color' },
    );
  }
  matchUtilities(
    {
      divide: (value) => ({
        '@media screen': {
          'html[data-theme="dark"] & > :not([hidden]) ~ :not([hidden])': {
            borderColor: resolve(value),
          },
        },
      }),
    },
    { values: values.divide, type: 'color' },
  );
}
