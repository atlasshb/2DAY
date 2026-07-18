import { test, expect } from "@playwright/test";

/**
 * US-11, US-12, US-13 — e2e/user-stories.md
 * Cold app-shell routing, the PWA manifest, and tab-bar/primary-action
 * accessibility (roles/names + the 48px minimum target size).
 */

const ROUTES: Array<{ path: string; screenLabel: string; tabName: string }> = [
  { path: "/", screenLabel: "Today", tabName: "Today" },
  { path: "/plan", screenLabel: "Plan", tabName: "Plan" },
  { path: "/route", screenLabel: "Route", tabName: "Route" },
  { path: "/log", screenLabel: "Log a door", tabName: "Log" },
  { path: "/stats", screenLabel: "Stats", tabName: "Stats" },
];

test("US-11: every tab opens directly by URL (cold app-shell routing)", async ({ page }) => {
  for (const { path, screenLabel, tabName } of ROUTES) {
    await page.goto(path);
    await expect(page.locator(`section[aria-label="${screenLabel}"]`)).toBeVisible();
    // The app shell (status strip + tab bar) mounts correctly on a cold load too.
    await expect(page.locator(".status")).toBeVisible();
    const activeTab = page.getByRole("link", { name: tabName });
    await expect(activeTab).toHaveAttribute("aria-current", "page");
  }
});

test("US-12: the PWA manifest is served and well-formed", async ({ page, request }) => {
  await page.goto("/");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBe("/manifest.webmanifest");

  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("application/manifest+json");

  const manifest = await response.json();
  expect(manifest.name).toBe("2DAY — Field OS");
  expect(manifest.short_name).toBe("2DAY");
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toBe("#0B0F14");
  expect(manifest.start_url).toBe("/");
  expect(Array.isArray(manifest.icons)).toBe(true);
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test("US-13: tab bar and primary actions have accessible names and meet the 48px minimum target size", async ({
  page,
}) => {
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible();

  const tabLabels = ["Today", "Plan", "Route", "Log", "Stats"];
  for (const label of tabLabels) {
    const tab = page.getByRole("link", { name: label });
    await expect(tab).toBeVisible();
    const box = await tab.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  }

  // Primary actions: the door-outcome log buttons on the Log screen.
  await page.goto("/log");
  const outcomeLabels = [
    "No answer",
    "Conversation",
    "Sale",
    "Not interested",
    "Follow-up",
    "Do not knock",
    "Inaccessible",
  ];
  for (const label of outcomeLabels) {
    const btn = page.getByRole("button", { name: new RegExp(label) });
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  }

  // The Record pill that opens the doorstep recorder is also a primary action.
  const recordToggle = page.getByTestId("record-toggle");
  await expect(recordToggle).toBeVisible();
  const recordBox = await recordToggle.boundingBox();
  expect(recordBox?.height ?? 0).toBeGreaterThanOrEqual(48);
});
