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
    // Required for npm-linked packages (ladder-visualizer uses `file:` protocol).
    // Without this, Vite follows the symlink to the real path outside node_modules,
    // which breaks module resolution for that package's dependencies.
    preserveSymlinks: true,
    alias: {
      // Point linked package to its symlink inside node_modules (not the real path)
      'ladder-visualizer': path.resolve(__dirname, 'node_modules/ladder-visualizer'),

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
    // Exclude linked packages from Vite's pre-bundling (dep optimizer) —
    // their source changes during development and must be re-transformed on each edit.
    exclude: ['ladder-visualizer'],
    // Explicitly include React in pre-bundling so it gets optimized even though
    // ladder-visualizer (which depends on it) is excluded. Without this, Vite
    // might skip pre-bundling React, leading to slow page loads in dev mode.
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  build: {
    // DO NOT add manualChunks — causes circular chunk imports that crash React.
    // Wails embeds assets in-memory so chunk splitting has no caching benefit.
    // See docs/technical/ReactBundlingFix.md for details.
    chunkSizeWarningLimit: 800, // bumped from 600; fewer chunks = larger main bundle
  },
});
