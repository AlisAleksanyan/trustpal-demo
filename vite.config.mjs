import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createAiMiddleware } from "./server/ai-api.mjs";
import { createPayPalMiddleware } from "./server/paypal-api.mjs";
import { createImpactStore } from "./server/impact-store.mjs";
import { createImpactMiddleware } from "./server/impact-api.mjs";
import { createStewardMiddleware } from "./server/steward-api.mjs";
import { causes } from "./src/data.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const store = createImpactStore({ causes });
  return {
    build: {
      outDir: "dist/client",
    },
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      warmup: {
        clientFiles: ["./src/main.jsx"],
      },
    },
    plugins: [
      {
        name: "trustpal-ai-api",
        configureServer(server) {
          server.middlewares.use(createAiMiddleware(env, store));
          server.middlewares.use(createImpactMiddleware(store, env));
          server.middlewares.use(createStewardMiddleware(store, env));
        },
      },
      {
        name: "trustpal-paypal-api",
        configureServer(server) {
          server.middlewares.use(createPayPalMiddleware(env, store));
        },
      },
      react(),
    ],
  };
});
