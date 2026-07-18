import { test, expect } from "@playwright/test";
import { goToTab } from "./helpers";

/**
 * US-06 — e2e/user-stories.md
 * "In direct sunlight I flip to Sun mode and every tab stays legible; the
 * toggle persists as I navigate."
 */
test("US-06: Sun mode toggles and persists across tab navigation", async ({ page }) => {
  await page.goto("/");

  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-mode", "night");
  await expect(page.locator(".modebtn")).toHaveText("☀︎ Sun");

  await page.locator(".modebtn").click();
  await expect(app).toHaveAttribute("data-mode", "sun");
  await expect(page.locator(".modebtn")).toHaveText("☾ Night");

  // Persists across every tab (client-side nav — same store instance).
  for (const tab of ["Plan", "Route", "Log", "Stats", "Today"] as const) {
    await goToTab(page, tab);
    await expect(app).toHaveAttribute("data-mode", "sun");
    // Legible: the status strip + tab bar remain visible in Sun mode on every screen.
    await expect(page.locator(".status")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  }

  // Toggling back to Night also persists.
  await page.locator(".modebtn").click();
  await expect(app).toHaveAttribute("data-mode", "night");
  await goToTab(page, "Plan");
  await expect(app).toHaveAttribute("data-mode", "night");
});
