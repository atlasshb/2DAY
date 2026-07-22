import { test, expect } from "@playwright/test";
import { enterDemoMode } from "./helpers";

/**
 * US-01, US-05 — e2e/user-stories.md
 * "I open the app mid-shift and see my day at a glance" + the rain/train
 * nudge that surfaces without burying the screen.
 *
 * This is the demo fixture specifically — a fresh (non-demo) Today tab shows
 * the Day Setup wizard prompt instead (WIZARD-BRIEF), covered in wizard.spec.ts.
 */

test("US-01: Today shows doors, convos, sales, earnings, work-hours progress, weather, and train home at a glance", async ({
  page,
}) => {
  await enterDemoMode(page);

  // Location + weather
  await expect(page.locator(".loc")).toHaveText("Tilburg · Groenewoud");
  await expect(page.locator(".temp")).toHaveText("21°");
  await expect(page.locator(".wmeta")).toContainText("Partly cloudy");
  await expect(page.locator(".rainpill")).toContainText("Rain in 52 min");

  // Work-hours progress bar
  await expect(page.locator(".hourslbl")).toContainText("Workday 12:00");
  await expect(page.locator(".hourslbl")).toContainText("2h 38m in");
  const fillWidth = await page.locator(".hoursbar .fill").evaluate((el) => (el as HTMLElement).style.width);
  expect(fillWidth).toBe("44%");

  // Doors / convos / sales / earnings stat grid
  const statGrid = page.getByRole("list", { name: "Today's numbers" });
  await expect(statGrid).toBeVisible();
  const labels = await page.locator(".statl").allTextContents();
  expect(labels).toEqual(["Doors", "Convos", "Sales", "Est. earned", "Steps", "km walked"]);
  const values = await page.locator(".statv").allTextContents();
  expect(values).toEqual(["87", "14", "4", "€152", "9,418", "7.2"]);

  // Route-legs progress card
  await expect(page.locator(".cardtitle").first()).toContainText("Route · 3 of 7 legs done");

  // Train home
  await expect(page.locator(".trainbig")).toHaveText("IC 18:02 → Den Bosch");
  await expect(page.locator(".countd .cv")).toHaveText("3:07");
  await expect(page.locator(".countd .cl")).toHaveText("until leave-by");

  // No active disruptions strip
  await expect(page.locator(".sub", { hasText: "No disruptions" })).toBeVisible();
});

test("US-05: the rain nudge appears without burying the screen and can be acted on", async ({ page }) => {
  await enterDemoMode(page);

  // Not present at first paint (NudgeBanner renders null until the store's
  // nudge state is populated by its ~5s setTimeout).
  await expect(page.locator(".nudge.show")).toHaveCount(0);

  // Fires ~5s after load (store.tsx RAIN_NUDGE_DELAY_MS) — poll, don't sleep.
  const nudge = page.locator(".nudge.show");
  await expect(nudge).toBeVisible({ timeout: 8000 });
  await expect(page.locator(".nudge .nt")).toContainText("Rain starts in 22 min");
  await expect(page.locator(".nudge .nb")).toContainText("Zuid loop first");

  // It's a small bottom banner, not a full-screen takeover: the tab bar
  // underneath stays visible and interactive while the nudge is up.
  const nudgeBox = await nudge.boundingBox();
  expect(nudgeBox?.height ?? 0).toBeLessThan(120);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan" })).toBeVisible();

  // Acting on the nudge (its single "Re-plan" action) dismisses it and
  // records the rain re-plan on the hero pill.
  await page.locator(".nudge .act").click();
  await expect(page.locator(".nudge.show")).toHaveCount(0);
  await expect(page.locator(".rainpill")).toHaveText("☂ Route re-planned for rain");
});
