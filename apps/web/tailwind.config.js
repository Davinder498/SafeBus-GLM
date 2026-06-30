/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
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
        success: {
          50: '#E8F5E9',
          100: '#C8E6C9',
          500: '#4CAF50',
          600: '#2E7D32',
          700: '#1B5E20',
        },
        warning: {
          50: '#FFF8E1',
          100: '#FFF3E0',
          200: '#FFE0B2',
          500: '#FF9800',
          600: '#FB8C00',
          700: '#F57C00',
        },
        danger: {
          50: '#FFEBEE',
          100: '#FFCDD2',
          500: '#EF5350',
          600: '#C62828',
          700: '#B71C1C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Roboto Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
      },
    },
  },
  plugins: [],
};
