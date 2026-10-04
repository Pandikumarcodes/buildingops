import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, "..", ["FRONTEND_", "BACKEND_URL"]);

  return {
    plugins: [react()],
    server: {
      host: environment.FRONTEND_HOST ?? "127.0.0.1",
      port: Number(environment.FRONTEND_PORT ?? 5173),
      proxy: {
        "/buildings": {
          target: environment.BACKEND_URL ?? "http://127.0.0.1:8000",
          // Browser route reloads need Vite's HTML shell; API requests stay proxied.
          bypass: (request) => request.headers.accept?.includes("text/html") ? "/index.html" : undefined,
        },
        "/zones": {
          target: environment.BACKEND_URL ?? "http://127.0.0.1:8000",
          bypass: (request) => request.headers.accept?.includes("text/html") ? "/index.html" : undefined,
        },
        "/telemetry": environment.BACKEND_URL ?? "http://127.0.0.1:8000",
        "/devices": {
          target: environment.BACKEND_URL ?? "http://127.0.0.1:8000",
          bypass: (request) => request.headers.accept?.includes("text/html") ? "/index.html" : undefined,
        },
        "/alerts": environment.BACKEND_URL ?? "http://127.0.0.1:8000",
        // M12 AI Assistant
        "/ai": environment.BACKEND_URL ?? "http://127.0.0.1:8000",
        "/ws": {
          target: environment.BACKEND_URL ?? "http://127.0.0.1:8000",
          ws: true,
        },
      },
    },
  };
});
