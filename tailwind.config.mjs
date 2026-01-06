/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        csuGreen: "#1E4D2B",
        csuGold: "#C8C372"
      }
    }
  },
  plugins: []
};

export default config;
