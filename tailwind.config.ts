import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Wine/burgundy accent. wine-700 is the primary action color
        // (white text on it clears WCAG AA).
        wine: {
          50: "#fbf1f4",
          100: "#f6e0e7",
          200: "#eec2d0",
          300: "#e199b0",
          400: "#d16688",
          500: "#bd3f65",
          600: "#a52a4f",
          700: "#7c1d3b",
          800: "#5f1830",
          900: "#4a1526",
        },
      },
    },
  },
  plugins: [],
};
export default config;
