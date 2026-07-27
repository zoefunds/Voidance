import type { Config } from "tailwindcss";

// Design tokens ported from DESIGN.md, with the type scale deliberately
// reduced across the board — the product owner wants small, dense body
// text (not the large Playfair display sizes in the original prototype).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "trust-blue": "#0A2540",
        "research-teal": "#00D4FF",
        "innovation-slate": "#F6F9FC",
        "success-green": "#10B981",
        "alert-amber": "#F59E0B",
        "error-crimson": "#DC2626",
        surface: "#f7fafd",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f1f4f7",
        "surface-container": "#ebeef1",
        "surface-container-high": "#e5e8eb",
        "on-surface": "#181c1e",
        "on-surface-variant": "#43474d",
        outline: "#74777e",
        "outline-variant": "#c4c6ce",
      },
      fontFamily: {
        display: ["var(--font-playfair)", "Georgia", "serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      fontSize: {
        // scaled well below the prototype's display-lg(48px)/headline(32px)
        "display-sm": ["26px", { lineHeight: "32px", fontWeight: "700", letterSpacing: "-0.01em" }],
        "headline-xs": ["18px", { lineHeight: "24px", fontWeight: "600" }],
        "title-sm": ["14px", { lineHeight: "20px", fontWeight: "600" }],
        "body-sm": ["13px", { lineHeight: "20px", fontWeight: "400" }],
        "label-xs": ["11px", { lineHeight: "16px", fontWeight: "500", letterSpacing: "0.02em" }],
        "code-xs": ["11px", { lineHeight: "16px", fontWeight: "400" }],
      },
      borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem" },
      boxShadow: { ambient: "0px 4px 20px rgba(10, 37, 64, 0.05)" },
    },
  },
  plugins: [],
};
export default config;
