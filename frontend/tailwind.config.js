/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta oficial A&M — extraída do logo real (A_M_Corporate_color.png)
        am: {
          navy: "#00244A",
          "navy-light": "#305068",
          blue: "#5888B0",
          "blue-light": "#78A0C0",
          bg: "#D8E8F0",
          text: "#305068",
          "text-secondary": "#98A8B0",
          border: "#C8D0D8",
          "border-strong": "#98A8B0",
          alert: "#F08810",
          danger: "#C83838",
          positive: "#98C838",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,36,74,0.08)",
      },
    },
  },
  plugins: [],
}

