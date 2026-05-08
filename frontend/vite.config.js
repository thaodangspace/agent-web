import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  build: {
    outDir: '../internal/server/static/dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      $lib: '/src/lib',
    },
  },
  server: {
    allowedHosts: ['macserver'],
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
