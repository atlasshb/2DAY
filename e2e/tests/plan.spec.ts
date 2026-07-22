import { test, expect } from "@playwright/test";
import { enterDemoMode, goToTab } from "./helpers";

/**
 * US-02, US-03 — e2e/user-stories.md
 * Compiling the day in the Plan tab (inputs as chips, compile progress,
 * legged plan with EV + explanation + 2 alternatives) and accepting it to
 * land on Route with the next street + expandable street queue.
 *
 * This is the demo fixture specifically (WIZARD-BRIEF gates it behind an
 * explicit "Try the demo"); the real, wizard-built compile flow is covered
 * in wizard.spec.ts.
 */

test("US-02: Plan tab shows input chips, compile progress, and a legged plan with EV, explanation, and 2 alternatives", async ({
  page,
}) => {
  await enterDemoMode(page);
  await goToTab(page, "Plan");

  // Inputs visible as chips before compiling.
  const chips = page.locator(".chips .pill");
  await expect(chips).toHaveCount(10);
  await expect(chips.filter({ hasText: "Maaspoort, Den Bosch" })).toBeVisible();
  await expect(chips.filter({ hasText: "Max sales" })).toBeVisible();

  const compileBtn = page.getByRole("button", { name: "Compile day" });
  await expect(compileBtn).toBeVisible();
  await compileBtn.click();

  // Compilation shows progress (spinner + label) — runs ~1.4s (PlanFlow.COMPILE_MS).
  await expect(page.locator(".compiling")).toContainText("Compiling — scoring 14 areas");

  // Legged plan with expected value.
  const compiledCard = page.locator(".card", { hasText: "Compiled plan · Tilburg" });
  await expect(compiledCard).toBeVisible({ timeout: 5000 });
  const evPills = compiledCard.locator(".evrow .pill");
  await expect(evPills).toHaveCount(4);
  await expect(evPills.nth(0)).toContainText("doors");
  await expect(evPills.nth(1)).toContainText("convos");
  await expect(evPills.nth(2)).toContainText("sales");
  await expect(compiledCard.locator(".legrow")).toHaveCount(8);

  // Explanation ("Why this plan").
  const why = page.locator(".card", { hasText: "Why this plan" });
  await expect(why).toBeVisible();
  await expect(why.locator(".explain")).toContainText("Groenewoud beats Breda-Noord today");

  // 2 alternatives.
  await expect(page.locator(".alt")).toHaveCount(2);
  await expect(page.locator(".alt").nth(0)).toContainText("Breda");
  await expect(page.locator(".alt").nth(1)).toContainText("Eindhoven");
});

test("US-03: accepting the plan lands on Route with the next street and an expandable per-street door-count queue", async ({
  page,
}) => {
  await enterDemoMode(page);
  await goToTab(page, "Plan");
  await page.getByRole("button", { name: "Compile day" }).click();
  await expect(page.locator(".card", { hasText: "Compiled plan · Tilburg" })).toBeVisible({ timeout: 5000 });

  const acceptBtn = page.locator("button.primary", { hasText: "Accept" });
  await expect(acceptBtn).toBeVisible();
  await acceptBtn.click();

  // Navigation to /route happens ~900ms after accept (PlanFlow.ACCEPT_NAV_DELAY_MS).
  await page.waitForURL("**/route", { timeout: 5000 });
  await expect(page.locator('section[aria-label="Route"]')).toBeVisible();

  // Next street instruction.
  await expect(page.locator(".nextst")).toHaveText("Meidoornstraat — even side");
  await expect(page.locator(".nextmeta")).toContainText("23 doors");

  // Street queue starts collapsed and expands to reveal per-street door counts.
  const expandBtn = page.getByRole("button", { name: "Expand street queue" });
  await expect(expandBtn).toHaveAttribute("aria-expanded", "false");
  await expandBtn.click();
  await expect(expandBtn).toHaveAttribute("aria-expanded", "true");

  const rows = page.locator(".qrow");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Meidoornstraat");
  await expect(rows.nth(0).locator(".doors")).toHaveText("23");
  await expect(rows.nth(1).locator(".doors")).toHaveText("31");
  await expect(rows.nth(2).locator(".doors")).toHaveText("17");
  await expect(rows.nth(3)).toContainText("skipped"); // the skipped Beethovenlaan row has no door count
});
