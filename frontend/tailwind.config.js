/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '475px',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        '2xs': '0 1px 2px 0 rgb(0 0 0 / 0.04)',
      },
      backdropBlur: {
        xs: '2px',
      },
      opacity: {
        12: '0.12',
      },
      spacing: {
        0.2: '0.05rem',
      },
    },
  },
  plugins: [],
};
