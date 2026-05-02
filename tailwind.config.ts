import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        paper: {
          bg: "#f5f0e8",
          text: "#3d3426",
          dialogue: "#8c6b4a",
          accent: "#5c4d3c",
          muted: "#b8a99a",
          border: "#e8e0d4",
        },
        ink: {
          bg: "#1c1c1e",
          text: "#c8c8cc",
          dialogue: "#d4a574",
          accent: "#a8a8ab",
          muted: "#6b6b6e",
          border: "#2c2c2e",
        },
      },
      fontFamily: {
        serif: ["Georgia", "Noto Serif SC", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
