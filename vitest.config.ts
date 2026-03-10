import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      src: path.resolve(__dirname, "src"),
      obsidian: path.resolve(__dirname, "src/__mocks__/obsidian.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 60000,
  },
});
