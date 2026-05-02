import { version as viteVersion } from 'vite';

export const DEFAULT_MODULES = [
  'src/index.tsx',
  'src/index.ts',
  'src/index.jsx',
  'src/index.js',
  'src/main.tsx',
  'src/main.ts',
  'src/main.jsx',
  'src/main.js',
] as const;

export const DEFAULT_TEMPLATES = ['index.xml', 'template.xml', 'theme.xml', 'src/index.xml', 'src/template.xml', 'src/theme.xml'] as const;

export const VITE_MAJOR = Number(viteVersion.split('.')[0]);
export const VITE_BUNDLER_KEY = (VITE_MAJOR >= 8 ? 'rolldownOptions' : 'rollupOptions') as 'rollupOptions';
