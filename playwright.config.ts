import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://localhost:3015";
const isLocalhost = baseURL.includes("localhost");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: require.resolve("./e2e/global-setup.ts"),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL,
    storageState: ".auth/user.json",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  ...(isLocalhost
    ? {
        webServer: {
          command: "pnpm dev",
          port: 3015,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
});
