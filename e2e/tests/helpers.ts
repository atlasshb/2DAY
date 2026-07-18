/**
 * Shared helpers for the 2DAY E2E journey suite (e2e/user-stories.md).
 * Not a spec file itself — Playwright's default testMatch only picks up
 * `*.spec.ts` / `*.test.ts`, so this module is safe to import from those.
 */
import { expect, type Page } from "@playwright/test";

/** The 5 tabs in TabBar order (app/src/components/TabBar.tsx). */
export const TABS = ["Today", "Plan", "Route", "Log", "Stats"] as const;

/** Click a tab-bar link by its visible label — client-side nav (no page.goto),
 *  matching the store's client-only React state (no persistence across
 *  full page loads). */
export async function goToTab(page: Page, label: (typeof TABS)[number]): Promise<void> {
  await page.getByRole("link", { name: label }).click();
}

/**
 * Opens the doorstep record sheet (Log screen) and drives it to the
 * always-available sample-transcript list, regardless of whether this
 * browser exposes a live mic + SpeechRecognition (RecordSheet defaults to
 * "setup" phase when it does, "samples" phase directly when it doesn't).
 */
export async function openRecordSheetToSamples(page: Page): Promise<void> {
  await page.getByTestId("record-toggle").click();
  await expect(page.getByTestId("record-sheet")).toBeVisible();
  const samplesVisible = await page
    .getByTestId("sample-transcript-btn")
    .first()
    .isVisible()
    .catch(() => false);
  if (!samplesVisible) {
    await page.getByTestId("samples-link").click();
  }
  await expect(page.getByTestId("sample-transcript-btn").first()).toBeVisible();
}

/** Sample-picker row indices, in the order sampleTranscripts is declared
 *  (app/src/lib/transcripts.ts) — used to pick a specific sample deterministically. */
export const SAMPLE = {
  nlSalePriceObjection: 0,
  nlNotInterested: 1,
  enFollowUp: 2,
} as const;

export async function pickSample(page: Page, index: number): Promise<void> {
  await page.getByTestId("sample-transcript-btn").nth(index).click();
  await expect(page.getByTestId("analysis-card")).toBeVisible({ timeout: 5000 });
}
