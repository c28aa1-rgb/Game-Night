import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createKaraoke } from "./server/karaoke.mjs";

// In dev, the room API runs inside Vite's server so `npm run dev` is all you need.
// `npm run dev -- --host` lets phones on the same Wi-Fi join.
function karaokeApi() {
  const karaoke = createKaraoke(); // API only; Vite serves the app
  return {
    name: "karaoke-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!(await karaoke.handle(req, res))) next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), karaokeApi()],
  base: "./",
});
