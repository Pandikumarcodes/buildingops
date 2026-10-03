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
        "/buildings": environment.BACKEND_URL ?? "http://127.0.0.1:8000",
        "/zones": environment.BACKEND_URL ?? "http://127.0.0.1:8000",
        "/telemetry": environment.BACKEND_URL ?? "http://127.0.0.1:8000",
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
