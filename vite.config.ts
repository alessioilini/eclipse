import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  // main.tsx ждёт платформу top-level await'ом.
  build: { target: 'es2022' },
});
