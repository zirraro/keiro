/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'keiro-dark': '#0B1120',
        'keiro-dark-card': '#1E293B',
      },
      animation: {
        'float-slow': 'float-blob 8s ease-in-out infinite',
        'float-medium': 'float-blob 6s ease-in-out infinite',
        'gradient': 'gradient-shift 8s ease infinite',
        'glow': 'glow-pulse 3s ease-in-out infinite',
        'shimmer': 'shimmer 3s ease-in-out infinite',
        'micro-bounce': 'micro-bounce 0.3s ease-in-out',
      },
      boxShadow: {
        'glow-blue': '0 0 30px rgba(59, 130, 246, 0.2)',
        'glow-cyan': '0 0 30px rgba(6, 182, 212, 0.2)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
