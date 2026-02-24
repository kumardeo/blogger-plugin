import react from '@vitejs/plugin-react-swc';
import blogger from 'blogger-plugin/vite';
import { defineConfig, type Plugin } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    blogger({
      proxyBlog: 'https://blogger-plugin-dev.blogspot.com',
    }) as Plugin,
  ],
});
