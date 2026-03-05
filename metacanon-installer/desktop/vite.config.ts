import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isTauriBuild = process.env.TAURI_ENV_PLATFORM != null;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  base: isTauriBuild ? './' : '/',
  server: {
    port: 4173,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || undefined,
  },
  envPrefix: ['VITE_', 'TAURI_'],
});
