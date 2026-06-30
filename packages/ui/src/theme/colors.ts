/**
 * SafeBus Alberta — Color tokens.
 *
 * Per UI Plan §3.2:
 *   - Deep navy / dark blue → trust, navigation, primary buttons, active route
 *   - School bus yellow → accent ONLY (do not overuse)
 *   - Soft green → success (completed pickup/drop-off)
 *   - Amber → warning (delay, GPS stale)
 *   - Red → serious alerts ONLY (GPS lost, breakdown, urgent)
 *   - Light gray → backgrounds, inactive/empty states
 *   - White → cards, surfaces
 */

export const colors = {
  navy: {
    50: '#F0F4F8',
    100: '#E8EEF4',
    200: '#C5D3E0',
    300: '#8FA8C2',
    400: '#5B7B9E',
    500: '#3B5B7E',
    600: '#2A4670',
    700: '#1E3A5F',
    800: '#16304F',
    900: '#0F2A44',
  },
  yellow: {
    50: '#FFFBE6',
    100: '#FEF3D6',
    200: '#FDE5A8',
    300: '#FCD66B',
    400: '#FBC73E',
    500: '#F5B400',
    600: '#D49600',
    700: '#A87400',
  },
  green: {
    50: '#E8F5E9',
    100: '#C8E6C9',
    200: '#A5D6A7',
    500: '#4CAF50',
    600: '#2E7D32',
    700: '#1B5E20',
  },
  amber: {
    50: '#FFF8E1',
    100: '#FFF3E0',
    200: '#FFE0B2',
    300: '#FFCC80',
    400: '#FFB74D',
    500: '#FF9800',
    600: '#FB8C00',
    700: '#F57C00',
  },
  red: {
    50: '#FFEBEE',
    100: '#FFCDD2',
    200: '#EF9A9A',
    500: '#EF5350',
    600: '#C62828',
    700: '#B71C1C',
  },
  gray: {
    50: '#F8F9FA',
    100: '#F1F3F5',
    200: '#E9ECEF',
    300: '#DEE2E6',
    400: '#CED4DA',
    500: '#868E96',
    600: '#495057',
    700: '#343A40',
    800: '#212529',
    900: '#16191C',
  },
  white: '#FFFFFF',
  transparent: 'transparent',
} as const;

export type ColorScale = Record<string, string>;
export type Colors = typeof colors;
