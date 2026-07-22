import { test, expect } from "@playwright/test";
import { enterDemoMode, goToTab } from "./helpers";

/**
 * US-04 — e2e/user-stories.md
 * "I log a door in one tap; my stats update instantly, the address
 * auto-advances, and a 5-second Undo restores everything if I fat-finger it."
 *
 * The store (app/src/lib/store.tsx) is client-side React state with no
 * persistence — Today's numbers only reflect a Log tap within the same SPA
 * session, so this test navigates via the tab bar (client-side) rather than
 * page.goto between steps.
 */
test("US-04: logging a door updates stats instantly, advances the address, and Undo restores everything", async ({
  page,
}) => {
  // The fixed 87/14/4/€152 Today baseline this test checks against only
  // shows once demo mode is explicitly on (WIZARD-BRIEF); the address
  // scrubber itself is unaffected by demo mode.
  await enterDemoMode(page);
  await goToTab(page, "Log");

  await expect(page.locator(".addrst")).toHaveText("Meidoornstraat 42");
  await expect(page.locator(".addrmeta")).toContainText("door 8 of 23");

  // One tap logs the outcome.
  await page.locator('[data-o="Conversation"]').click();

  // Address auto-advances to the next door immediately.
  await expect(page.locator(".addrst")).toHaveText("Meidoornstraat 44");
  await expect(page.locator(".addrmeta")).toContainText("door 9 of 23");

  // Snackbar confirms the log and offers Undo, within a 5s window.
  const snack = page.locator(".snack");
  await expect(snack).toHaveClass(/show/);
  await expect(snack).toContainText("Conversation — Meidoornstraat 42");
  await expect(snack.locator(".undo")).toBeVisible();

  // Stats update instantly — check on Today via client-side tab nav (the
  // store is shared across routes within one page session).
  await goToTab(page, "Today");
  await expect(page.locator(".statv").first()).toBeVisible();
  let values = await page.locator(".statv").allTextContents();
  expect(values).toEqual(["88", "15", "4", "€152", "9,418", "7.2"]); // doors+1, convos+1 (conversation counts)

  // Undo restores everything: stats and the address scrubber position.
  await goToTab(page, "Log");
  await expect(page.locator(".snack.show .undo")).toBeVisible();
  await page.locator(".snack .undo").click();

  await expect(page.locator(".addrst")).toHaveText("Meidoornstraat 42");
  await expect(page.locator(".addrmeta")).toContainText("door 8 of 23");

  await goToTab(page, "Today");
  await expect(page.locator(".statv").first()).toBeVisible();
  values = await page.locator(".statv").allTextContents();
  expect(values).toEqual(["87", "14", "4", "€152", "9,418", "7.2"]); // back to baseline
});
