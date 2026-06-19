import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // Vitest 4's parallel worker pool fails on this Windows setup ("Cannot read
    // properties of undefined (reading 'config')" inside spawned workers, collecting
    // zero tests). The sim suite is tiny (~1s) so serial execution costs nothing and
    // restores a reliable `npm test` gate. Revisit if Vitest patches the pool issue.
    fileParallelism: false,
  },
});
