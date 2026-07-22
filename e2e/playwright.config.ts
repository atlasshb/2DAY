import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

/**
 * E2E user-journey suite for the 2DAY app (production build).
 * Runs against `next start` on :3100; phone-sized viewport; fake microphone
 * for the doorstep-recording flow so the full journey is drivable headlessly.
 */
const localChromium = "/opt/pw-browsers/chromium";
const executablePath =
  fs.existsSync(localChromium) && fs.statSync(localChromium).isFile()
    ? localChromium
    : undefined; // CI: playwright-managed chromium via `playwright install`

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    launchOptions: {
      executablePath,
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }],
  webServer: {
    // `next start` refuses to run against `output: "export"` (it wants
    // `serve out` — see static-server.mjs's header comment for why this is
    // a small dependency-free server instead of a new npm package).
    // Requires `npm run build -w @2day/app` to have produced `app/out/`.
    command: "node static-server.mjs",
    // Playwright's webServer.env REPLACES the whole environment rather than
    // merging — omit process.env here and Windows can't even resolve
    // cmd.exe to launch the command with.
    env: { ...process.env, PORT: "3100" } as Record<string, string>,
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
