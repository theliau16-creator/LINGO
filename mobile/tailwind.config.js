/**
 * Design tokens ported from src/styles.css (web, Tailwind v4 + oklch).
 * NativeWind runs on Tailwind v3, which doesn't reliably resolve oklch() on
 * every RN style engine version, so every color below is the sRGB hex/rgba
 * equivalent of the web token, computed once (see the OKLab -> sRGB formula
 * in the Phase 1 migration notes) rather than re-authored by eye. Keep the
 * semantic names identical to the web tokens so screens map 1:1.
 *
 * Not ported: backdrop-filter glass effect (needs expo-blur), CSS gradients
 * (needs expo-linear-gradient), and the true "SF Pro Rounded" system-rounded
 * font trait (RN's `fontFamily` can't select it directly — falls back to the
 * plain system font until a native font-descriptor solution is added).
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#06070c",
        foreground: "#f7f8fb",

        card: "#0e0f16",
        "card-foreground": "#f7f8fb",
        popover: "#0f1119",
        "popover-foreground": "#f7f8fb",

        primary: "#337bff",
        "primary-foreground": "#fbfcfe",
        "primary-glow": "#aa6ef3",

        secondary: "#1c1f29",
        "secondary-foreground": "#f4f5f8",

        muted: "#1b1c25",
        "muted-foreground": "#9598a4",

        accent: "#aa6ef3",
        "accent-foreground": "#fbfcfe",

        destructive: "#f52e44",
        "destructive-foreground": "#fbfcfe",

        border: "rgba(255,255,255,0.10)",
        input: "rgba(255,255,255,0.12)",
        ring: "#337bff",

        surface: "rgba(255,255,255,0.06)",
        "surface-strong": "rgba(255,255,255,0.10)",

        "bubble-in": "#21232d",
        "bubble-in-foreground": "#f7f8fb",
      },
      borderRadius: {
        sm: 8,
        md: 12,
        lg: 16,
        xl: 24,
        "2xl": 32,
        "3xl": 40,
        "4xl": 48,
      },
    },
  },
  plugins: [],
};
