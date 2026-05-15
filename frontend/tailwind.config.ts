import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg))',
        panel: 'hsl(var(--panel))',
        panel2: 'hsl(var(--panel-2))',
        text: 'hsl(var(--text))',
        muted: 'hsl(var(--muted))',
        line: 'hsl(var(--line))',
        accent: 'hsl(var(--accent))',
        accent2: 'hsl(var(--accent-hover))',
        danger: 'hsl(var(--danger))',
        success: 'hsl(var(--success))'
      },
      boxShadow: {
        soft: '0 8px 30px rgba(15, 23, 42, 0.06)',
        insetSoft: 'inset 0 1px 0 rgba(255, 255, 255, 0.7)'
      },
      borderRadius: {
        xl2: '1rem'
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
} satisfies Config;
