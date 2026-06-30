/**
 * SafeBus Alberta — Spacing, radius, shadows, breakpoints.
 *
 * Per UI Plan §3.4: 4/8/12/16/24/32px scale. Touch targets ≥ 44×44px.
 */

export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const radius = {
  none: '0px',
  sm: '4px',
  default: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export const shadow = {
  none: 'none',
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px rgba(0, 0, 0, 0.07)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px rgba(0, 0, 0, 0.15)',
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

/** Minimum touch target size (WCAG 2.1 AA). */
export const minTouchTarget = '44px';

export const layout = {
  spacing,
  radius,
  shadow,
  breakpoints,
  minTouchTarget,
} as const;
