/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        black: '#000000',
        green: {
          400: '#00ff41',
          500: '#00ff41',
          600: '#00cc41',
          700: '#009941',
          800: '#006641',
          900: '#003341',
        },
        blue: {
          400: '#10f0f0',
          500: '#0cf0f0',
          600: '#00d0d0',
          700: '#00b0b0',
        },
        purple: {
          400: '#ff00ff',
          500: '#cc00cc',
          600: '#990099',
        },
      },
      fontFamily: {
        terminal: ['VT323', 'Share Tech Mono', 'monospace'],
        pixel: ['"Press Start 2P"', 'monospace'],
      },
      boxShadow: {
        'neon-green': '0 0 5px #00ff41, 0 0 10px #00ff41',
        'neon-blue': '0 0 5px #10f0f0, 0 0 10px #10f0f0',
        'neon-purple': '0 0 5px #ff00ff, 0 0 10px #ff00ff',
      },
    },
  },
  plugins: [],
} 