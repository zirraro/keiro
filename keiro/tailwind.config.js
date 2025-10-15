/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx,js,jsx}","./components/**/*.{ts,tsx,js,jsx}","./src/**/*.{ts,tsx,js,jsx}"],
  theme: { extend: { borderRadius:{ xl:"12px","2xl":"16px" } } },
  plugins: [],
};
