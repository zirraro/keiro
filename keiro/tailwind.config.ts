import type { Config } from "tailwindcss"

export default {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      container: { center: true, padding: "1rem" },
      borderRadius: { xl: "12px", "2xl": "16px" },
    },
  },
  plugins: [],
} satisfies Config
