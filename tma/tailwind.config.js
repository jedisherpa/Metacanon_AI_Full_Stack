/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Living Atlas territory colors
        citadel: '#F5C842',
        forge: '#00E5FF',
        hub: '#9B59B6',
        engine: '#39FF14',
        // Dark voxel backgrounds
        void: '#0A0A0F',
        'void-mid': '#12121A',
        'void-light': '#1E1E2E'
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate'
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px currentColor' },
          '100%': { boxShadow: '0 0 20px currentColor, 0 0 40px currentColor' }
        }
      }
    }
  },
  plugins: []
};
