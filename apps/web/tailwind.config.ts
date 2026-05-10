import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0c0707',
        'bg-2': '#170a0a',
        'bg-3': '#20100f',
        burgundy: '#5a0d18',
        gold: '#f1c84d',
        'gold-2': '#ffe28a',
        'gold-deep': '#b07c1e',
        rose: '#ff2d7e',
        'rose-2': '#ff6cb0',
        orange: '#ff7a1a',
        green: '#3ee07e',
        cream: '#fff5dc',
      },
      fontFamily: {
        serif: ['var(--font-cinzel)', 'serif'],
        sans: ['var(--font-manrope)', 'system-ui', 'sans-serif'],
      },
    },
  },
} satisfies Config;
