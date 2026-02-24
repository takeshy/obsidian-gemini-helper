import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      src: "./src",
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
