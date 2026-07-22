import { test, expect } from "@playwright/test";

/**
 * TRAIL-BRIEF definition of done: "one new Playwright spec using
 * context.setGeolocation + permissions:['geolocation']: toggle on, push 2
 * fake positions, expect 2 timestamped trail points in the list."
 *
 * Independent of the wizard/demo mode — the Route tab always renders the
 * Trail panel, wizard profile or not.
 */
test("trail: toggle on, two fake positions produce two timestamped trail points", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);

  await page.goto("/route");
  await expect(page.getByTestId("trail-toggle")).toHaveText("Start trail");

  await page.getByTestId("trail-toggle").click();
  await expect(page.getByTestId("trail-toggle")).toHaveText("Stop trail");
  await expect(page.getByTestId("retrace-point")).toHaveCount(0);

  // First fake position.
  await context.setGeolocation({ latitude: 51.5606, longitude: 5.0919 });
  await expect(page.getByTestId("retrace-point")).toHaveCount(1, { timeout: 5000 });

  // Second fake position, ~30 m north — over the 15 m move threshold, so it
  // records too (not just the elapsed-time fallback).
  await context.setGeolocation({ latitude: 51.5609, longitude: 5.0919 });
  await expect(page.getByTestId("retrace-point")).toHaveCount(2, { timeout: 5000 });

  await expect(page.getByTestId("trail-live-stats")).toContainText("2 points");
  await expect(page.getByTestId("retrace-list")).toContainText("Trail started");
  await expect(page.getByTestId("retrace-list")).toContainText("Moved");

  // Stop toggles cleanly back and the GPS status chip in the status strip
  // reflects it (TRAIL-BRIEF: "GPS chip must reflect REAL state").
  await expect(page.getByTestId("gps-chip")).toContainText("GPS");
  await page.getByTestId("trail-toggle").click();
  await expect(page.getByTestId("trail-toggle")).toHaveText("Start trail");
  await expect(page.getByTestId("gps-chip")).toContainText("off");
});
