import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0' },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], motion: ['gsap'] }
      }
    }
  }
});
