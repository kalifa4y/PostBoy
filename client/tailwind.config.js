/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ows: {
          bg: '#000000',
          surface1: '#0d120f',
          surface2: '#101712',
          card: '#121a14',
          border: '#1e2621',
          borderSubtle: '#162019',
          accent: '#08EB08',
          accentHover: '#06c406',
          accentGlow: 'rgba(8, 235, 8, 0.15)',
          textMain: '#f0fdf4',
          textMuted: '#8c9e91',
          textSubtle: '#526357',
        }
      },
      fontFamily: {
        heading: ['"Cal Sans"', 'sans-serif'],
        body: ['"Google Sans Flex"', 'system-ui', 'sans-serif'],
        accent: ['"Cal Sans"', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
