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
    // Process the shared package so the obsidian alias above reaches its imports too.
    server: { deps: { inline: ["obsidian-llm-hub-common"] } },
    include: ["src/**/*.test.ts"],
    testTimeout: 60000,
  },
});
