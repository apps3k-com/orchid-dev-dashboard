import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests live next to the code they cover (src/**/*.test.ts). Server/GitHub
    // logic added in later increments is tested here too.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
