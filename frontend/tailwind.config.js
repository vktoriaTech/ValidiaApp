/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'v-magenta': '#FF0080',
        'v-magenta-deep': '#CC006B',
        'v-night': '#0D0D0D',
        'v-white': '#FFFFFF',
        'v-gray-50': '#F9FAFB',
        'v-border': '#E5E7EB',
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        accent: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
