/**
 * SafeBus Alberta — Typography tokens.
 *
 * Per UI Plan §3.3: Inter font, system UI fallback. Readable on phones.
 */

export const fontFamily = {
  sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
  mono: ['Roboto Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
} as const;

export const fontSize = {
  display: '32px',
  h1: '28px',
  h2: '22px',
  h3: '18px',
  body: '16px',
  bodySm: '14px',
  caption: '12px',
  stat: '36px',
  button: '16px',
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.6,
} as const;

export const typography = {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} as const;
