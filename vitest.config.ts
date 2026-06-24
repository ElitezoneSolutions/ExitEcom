import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Dedicated test config so the suite runs against plain Node and does NOT load
// the app's full Vite/Nitro/Cloudflare plugin stack (which otherwise keeps the
// dev server alive and stalls `vitest run` on exit). tsconfigPaths gives tests
// the same `@/` alias the app uses.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
