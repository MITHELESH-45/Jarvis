/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        slateGray: '#708090',
        electricBlue: '#00F0FF',
        white: '#FFFFFF',
      },
    },
  },
  plugins: [],
}
