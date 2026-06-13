import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#080D14",
          surface: "#0F1923",
          card: "#1A2535",
          hover: "#243044",
        },
        teal: {
          DEFAULT: "#00D4B4",
          dim: "#00A88F",
          glow: "rgba(0,212,180,0.15)",
        },
        amber: {
          DEFAULT: "#FF9500",
          dim: "#CC7700",
          glow: "rgba(255,149,0,0.15)",
        },
        text: {
          DEFAULT: "#E8EDF5",
          soft: "#B0BCCC",
        },
        muted: "#6B7A99",
        border: "#1E2D42",
      },
      fontFamily: {
        display: ["var(--font-syne)", "sans-serif"],
        body: ["var(--font-plus-jakarta)", "sans-serif"],
      },
      boxShadow: {
        teal: "0 0 24px rgba(0,212,180,0.25)",
        amber: "0 0 24px rgba(255,149,0,0.25)",
      },
      borderRadius: {
        card: "16px",
      },
      backgroundImage: {
        "teal-glow": "radial-gradient(ellipse at top, rgba(0,212,180,0.08) 0%, transparent 60%)",
      },
    },
  },
  plugins: [],
};

export default config;
