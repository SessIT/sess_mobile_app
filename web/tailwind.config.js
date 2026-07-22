/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Matches the mobile app's brand blue (#1E3A8A) so both surfaces feel like one product.
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#4f5bd5',
          600: '#3a45b0',
          700: '#2b3690',
          800: '#1E3A8A',
          900: '#172554',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        // Soft, layered shadows for a premium (not flat "Bootstrap") feel.
        card: '0 1px 2px 0 rgba(15,23,42,0.04), 0 1px 3px 0 rgba(15,23,42,0.06)',
        'card-hover': '0 8px 24px -6px rgba(15,23,42,0.12), 0 2px 6px -1px rgba(15,23,42,0.06)',
        soft: '0 2px 8px -2px rgba(15,23,42,0.08)',
        'brand-glow': '0 8px 24px -8px rgba(30,58,138,0.45)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.35s ease-out both',
      },
    },
  },
  plugins: [],
};
