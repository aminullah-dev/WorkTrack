/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Manager portal SPA. Built output goes to dist/ and is served by Firebase
// Hosting (see backend/firebase.json hosting config).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        /*
         * Split the dependencies out of the application bundle.
         *
         * Everything shipped as one file, so each portal deploy made every
         * manager re-download React and the Firebase SDK along with the two
         * lines that actually changed. Separating them means a deploy
         * invalidates only the app chunk; the rest stays in the browser cache,
         * which matters a great deal on the connections this is used over.
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          // Firebase is the largest single dependency and changes rarely.
          if (id.includes("/firebase/") || id.includes("@firebase/")) {
            return "firebase";
          }
          if (id.includes("/react") || id.includes("/scheduler/")) {
            return "react";
          }
          return "vendor";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
