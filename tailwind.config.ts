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
        primary: "#000000",
        secondary: "#0058BE",
        "secondary-container": "#2170E4",
        "on-secondary": "#FFFFFF",
        background: "#F7F9FB",
        surface: "#F7F9FB",
        "surface-container": "#ECEEF0",
        "surface-container-low": "#F2F4F6",
        "surface-container-high": "#E6E8EA",
        "surface-container-highest": "#E0E3E5",
        "surface-lowest": "#FFFFFF",
        "on-background": "#191C1E",
        "on-surface": "#191C1E",
        "on-surface-variant": "#45464D",
        outline: "#76777D",
        "outline-variant": "#C6C6CD",
        "primary-container": "#131B2E",
        error: "#BA1A1A",
      },
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        "display-lg": ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "600" }],
        "headline-lg": ["32px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-md": ["20px", { lineHeight: "1.4", fontWeight: "500" }],
        "body-lg": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        "label-caps": ["12px", { lineHeight: "1", letterSpacing: "0.05em", fontWeight: "500" }],
      },
      spacing: {
        "stack-sm": "8px",
        "stack-md": "16px",
        "stack-lg": "32px",
        "stack-xl": "64px",
        gutter: "24px",
        "margin-mobile": "16px",
      },
      maxWidth: {
        container: "1200px",
      },
      borderRadius: {
        DEFAULT: "4px",
        lg: "8px",
        xl: "12px",
        full: "9999px",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
      },
    },
  },
  plugins: [],
};
export default config;
