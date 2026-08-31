import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'XIAODAN_');
  const base = (env.XIAODAN_BASE_PATH || '/xiaodan').replace(/\/?$/, '/');
  return {
    base,
    plugins: [react()],
    resolve: { conditions: ['development'] },
    build: { outDir: 'dist', emptyOutDir: true },
    server: {
      proxy: { [`${base}api`]: 'http://127.0.0.1:3210' }
    }
  };
});
