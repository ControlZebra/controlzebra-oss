import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wails from "@wailsio/runtime/plugins/vite";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), wails("./bindings"), tailwindcss()],
  build: {
    // Increase warning limit for vendor chunks (they're pre-optimized)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React core
          if (id.includes('node_modules/react-dom')) {
            return 'vendor-react-dom';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          // Terminal (xterm is large)
          if (id.includes('@xterm')) {
            return 'vendor-terminal';
          }
          // Lucide icons (large icon library)
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }
          // UI utilities
          if (id.includes('class-variance-authority') || 
              id.includes('clsx') || 
              id.includes('tailwind-merge') ||
              id.includes('@radix-ui')) {
            return 'vendor-ui';
          }
          // Toast notifications
          if (id.includes('sonner')) {
            return 'vendor-toast';
          }
          // Other node_modules
          if (id.includes('node_modules')) {
            return 'vendor-misc';
          }
        },
      },
    },
  },
});
