/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#16a34a', // green
          foreground: '#ffffff'
        }
      }
    },
  },
  plugins: [],
}
