import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wails from "@wailsio/runtime/plugins/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
//
// ⚠️  This config contains critical fixes for a React white-screen crash in
// production builds (duplicate React instances + circular chunk imports).
// DO NOT re-add manualChunks or remove the React resolve aliases.
// Full details: docs/technical/ReactBundlingFix.md
//
export default defineConfig({
  plugins: [react(), wails("./bindings"), tailwindcss()],
  resolve: {
    alias: {
      // Force ALL React imports to frontend's single copy (see ReactBundlingFix.md)
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime'),
    },
    // Belt-and-suspenders: tells Vite's resolver to always deduplicate these
    // packages even if they appear at different paths in the dependency tree.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  optimizeDeps: {
    // Keep React pre-bundled and deduplicated across the application and the
    // packaged ladder-visualizer peer dependency.
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  build: {
    // DO NOT add manualChunks — causes circular chunk imports that crash React.
    // Wails embeds assets in-memory so chunk splitting has no caching benefit.
    // See docs/technical/ReactBundlingFix.md for details.
    chunkSizeWarningLimit: 800, // bumped from 600; fewer chunks = larger main bundle
  },
});
