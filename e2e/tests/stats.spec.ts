import { test, expect } from "@playwright/test";

/**
 * US-07 — e2e/user-stories.md
 * "At day's end the Stats tab shows my timeline, per-neighborhood
 * performance, coach improvements, and my streak/records."
 */
test("US-07: Stats tab shows timeline, per-neighborhood performance, coach improvements, and streak/records", async ({
  page,
}) => {
  await page.goto("/stats");
  await expect(page.locator('section[aria-label="Stats"]')).toBeVisible();

  // Timeline.
  const timelineCard = page.locator(".card", { hasText: "Timeline" });
  await expect(timelineCard).toBeVisible();
  const timelineRows = timelineCard.locator(".tlr");
  await expect(timelineRows).toHaveCount(4);
  await expect(timelineRows.first()).toContainText("Sprinter to Tilburg");
  await expect(timelineRows.last()).toContainText("2 sales in Wilgenstraat");

  // Per-neighborhood performance table.
  const neighborhoodCard = page.locator(".card", { hasText: "By neighborhood" });
  await expect(neighborhoodCard).toBeVisible();
  const headerCells = neighborhoodCard.locator("th");
  await expect(headerCells).toHaveText(["Loop", "Doors/h", "Conv %", "€"]);
  const rows = neighborhoodCard.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Groenewoud-W");
  await expect(rows.nth(0)).toContainText("44");
  await expect(rows.nth(1)).toContainText("Groenewoud-O");

  // Coach improvements.
  const coachCard = page.locator(".card", { hasText: "Coach" });
  await expect(coachCard.locator(".cardtitle")).toHaveText("Coach · 3 improvements");
  await expect(coachCard.locator(".coach li")).toHaveCount(3);
  await expect(coachCard.locator(".coach li").first()).toContainText("converts 2.1");

  // Streak + personal records.
  await expect(page.locator(".streak")).toContainText("6-day streak");
  await expect(page.locator(".streak")).toContainText("Personal best: 11 days");
  await expect(page.locator(".streak .pill")).toContainText("#3 this week");
  const recordCards = page.locator(".rec");
  await expect(recordCards).toHaveCount(4);
  await expect(recordCards.nth(0)).toContainText("Best doors in one hour");
  await expect(recordCards.nth(2)).toContainText("Record rate · Tilburg");
});
