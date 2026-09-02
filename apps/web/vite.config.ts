import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'XIAODAN_');
  const base = (process.env.XIAODAN_BASE_PATH || env.XIAODAN_BASE_PATH || '/xiaodan').replace(/\/?$/, '/');
  return {
    base,
    plugins: [react()],
    resolve: { conditions: ['development'] },
    build: {
      outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 550,
      rollupOptions: { output: { manualChunks(id) {
        if (id.includes('@codemirror') || id.includes('/codemirror/') || id.includes('@lezer')) return 'editor';
        if (id.includes('@fullcalendar')) return 'calendar';
        if (id.includes('@tanstack')) return 'query';
        if (id.includes('react') || id.includes('scheduler')) return 'react';
        return undefined;
      } } }
    },
    server: {
      proxy: { [`${base}api`]: 'http://127.0.0.1:3210' }
    }
  };
});
