import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f3f4f6",
        line: "#d5d9e0",
        ink: { DEFAULT: "#1b1f27", sub: "#4f5766", faint: "#6b7280" },
        accent: { DEFAULT: "#1c4ea0", soft: "#e8eef8" },
        warn: { DEFAULT: "#8a4b00", soft: "#fff4dc", line: "#e0b45a" },
        danger: { DEFAULT: "#a61b1b", soft: "#fdeceb", line: "#e3a5a1" },
      },
      fontFamily: {
        sans: [
          "Hiragino Sans",
          "Hiragino Kaku Gothic ProN",
          "Noto Sans JP",
          "Yu Gothic",
          "Meiryo",
          "system-ui",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      keyframes: {
        indeterminate: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(350%)" },
        },
      },
      animation: {
        indeterminate: "indeterminate 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
