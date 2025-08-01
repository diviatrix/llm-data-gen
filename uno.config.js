import { defineConfig, presetUno, presetIcons, transformerDirectives } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons()
  ],
  transformers: [
    transformerDirectives()
  ],
  theme: {
    colors: {
      brand: {
        50: '#eff6ff',
        100: '#dbeafe',
        200: '#bfdbfe',
        300: '#93c5fd',
        400: '#60a5fa',
        500: '#3b82f6',
        600: '#2563eb',
        700: '#1d4ed8',
        800: '#1e40af',
        900: '#1e3a8a'
      }
    }
  },
  content: {
    pipeline: {
      include: [
        /\.(html|js|css)($|\?)/,
        'public/**/*.{html,js,css}',
        'lib/**/*.js',
        'public/css/design-system.css'
      ]
    }
  },
  shortcuts: [
    // Можем добавить сокращения для часто используемых комбинаций
  ]
});
