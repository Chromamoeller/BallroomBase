/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f7ff",
          100: "#e8edff",
          200: "#cdd6ff",
          300: "#a6b4ff",
          400: "#7a8cff",
          500: "#4f63f5",
          600: "#3a4ad9",
          700: "#2f3bb0",
          800: "#283290",
          900: "#1f2670",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 4px 16px -4px rgba(31, 38, 112, 0.12)",
      },
    },
  },
  plugins: [],
};
