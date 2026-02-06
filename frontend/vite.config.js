import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wails from "@wailsio/runtime/plugins/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), wails("./bindings"), tailwindcss()],
  resolve: {
    // Preserve symlinks for npm link to work properly
    preserveSymlinks: true,
    alias: {
      // Explicitly resolve ladder-visualizer to the linked package
      'ladder-visualizer': path.resolve(__dirname, 'node_modules/ladder-visualizer'),
    },
  },
  optimizeDeps: {
    // Don't pre-bundle linked packages
    exclude: ['ladder-visualizer'],
  },
  build: {
    // Increase warning limit for vendor chunks (they're pre-optimized)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Ladder visualizer (industrial file viewer)
          if (id.includes('ladder-visualizer')) {
            return 'vendor-ladder';
          }
          // PDF viewer (react-pdf + pdfjs-dist)
          if (id.includes('react-pdf') || id.includes('pdfjs-dist')) {
            return 'vendor-pdf';
          }
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
