import { colors } from './colors.ts';
import { typography } from './typography.ts';
import { layout } from './layout.ts';

export * from './colors.ts';
export * from './typography.ts';
export * from './layout.ts';
export * from './status-colors.ts';

export const theme = {
  colors,
  typography,
  layout,
} as const;
