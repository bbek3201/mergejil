const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(__dirname, 'src/**/*.{ts,tsx,js,jsx,html}'),
    `!${join(__dirname, 'src/**/*.{stories,spec}.{ts,tsx,js,jsx,html}')}`,
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
