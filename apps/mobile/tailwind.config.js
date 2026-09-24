/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../web/src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Darker muted copy preserves AA contrast on the softened app surfaces.
        slate: {
          500: '#52666A',
        },
        // Prairie Transit blue — matches the web application.
        navy: {
          50: '#F0F6F7',
          100: '#E1EEF1',
          200: '#C3DDE4',
          300: '#96C1CE',
          400: '#65A0B3',
          500: '#397F99',
          600: '#2D6C86',
          700: '#235C78',
          800: '#19465E',
          900: '#163B4F',
          950: '#123447',
        },
        yellow: {
          50: '#FFFBF2',
          100: '#FFF4D8',
          200: '#FDE5A9',
          300: '#F8D273',
          400: '#F2B84B',
          500: '#E3A234',
          600: '#C78322',
          700: '#9B6919',
          800: '#754E17',
          900: '#5A3C14',
        },
        success: {
          50: '#F1F9F6',
          100: '#E6F4EE',
          200: '#C8E7DA',
          300: '#96D1BA',
          400: '#58AF90',
          500: '#328E6D',
          600: '#238064',
          700: '#185C49',
          800: '#164B3D',
          900: '#133E34',
        },
        warning: {
          50: '#FFFAF0',
          100: '#FFF3DC',
          200: '#FDE2B3',
          300: '#F5C97E',
          400: '#E4A342',
          500: '#CF861F',
          600: '#C27A1A',
          700: '#925711',
          800: '#70430D',
          900: '#59370F',
        },
        danger: {
          50: '#FFF5F6',
          100: '#FCEAEC',
          200: '#F6CDD1',
          300: '#ECA5AC',
          400: '#DD747E',
          500: '#CF5963',
          600: '#C64B55',
          700: '#A13A44',
          800: '#87313A',
          900: '#702C34',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Roboto Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        sm: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.05)',
        ring: '0 0 0 1px rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04)',
        card: '0 1px 3px 0 rgb(15 23 42 / 0.05), 0 4px 12px -2px rgb(15 23 42 / 0.05)',
        'card-hover': '0 4px 6px -1px rgb(15 23 42 / 0.07), 0 8px 24px -4px rgb(15 23 42 / 0.07)',
        popover: '0 4px 6px -1px rgb(15 23 42 / 0.08), 0 10px 24px -4px rgb(15 23 42 / 0.10)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-in-up': 'fade-in-up 0.3s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
