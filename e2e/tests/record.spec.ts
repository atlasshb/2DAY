import { test, expect } from "@playwright/test";
import { enterDemoMode, goToTab, openRecordSheetToSamples, pickSample, SAMPLE } from "./helpers";

/**
 * US-08, US-09, US-10 — e2e/user-stories.md
 * The doorstep conversation-recording flow (components/coach/**), driven via
 * the always-available sample-transcript picker so the journey is
 * deterministic. Expected outcome/confidence/objections/improvements below
 * were verified against the app's actual deterministicAnalyzer output for
 * each sample in app/src/lib/transcripts.ts (not hand-guessed).
 */

test("US-08: recording a conversation surfaces the detected outcome, confidence, improvements, and objections", async ({
  page,
}) => {
  await page.goto("/log");
  await openRecordSheetToSamples(page);

  // Consent state is my choice — toggle it before capturing.
  const consentChip = page.getByTestId("consent-chip");
  await expect(consentChip).toHaveText(/Notes only/);
  await expect(consentChip).toHaveAttribute("aria-pressed", "false");
  await consentChip.click();
  await expect(consentChip).toHaveAttribute("aria-pressed", "true");
  await expect(consentChip).toHaveText(/Resident informed/);

  // NL sale sample: price objection raised and HANDLED (rep reassures with
  // "Begrijpelijk … maandelijks opzeggen" — core reassurance lexicon).
  await pickSample(page, SAMPLE.nlSalePriceObjection);

  const card = page.getByTestId("analysis-card");
  await expect(card).toBeVisible();

  const outcome = page.getByTestId("analysis-outcome");
  await expect(outcome).toContainText("Sale");
  await expect(outcome).toContainText("77%");
  await expect(page.getByTestId("analysis-language")).toHaveText("NL");

  // Handled objection ⇒ no coaching tips for this conversation: the Improve
  // card is not rendered, and "what went well" carries the positives.
  await expect(card.locator(".card", { hasText: "Improve" })).toBeHidden();
  const wentWell = card.locator(".card", { hasText: "What went well" });
  await expect(wentWell).toBeVisible();
  await expect(wentWell.locator(".coach li")).toHaveCount(2);

  const objectionsCard = card
    .locator(".card")
    .filter({ has: page.locator(".cardtitle", { hasText: "Objections" }) });
  await expect(objectionsCard).toBeVisible();
  const objRow = objectionsCard.locator(".objrow");
  await expect(objRow).toHaveCount(1);
  await expect(objRow.locator(".objkind")).toHaveText("Price");
  await expect(objRow.locator(".objquote")).toContainText("Het klinkt allemaal duur");
  await expect(objRow.locator(".objhandled")).toHaveAttribute("aria-label", "handled");

  await expect(card.locator(".anasummary")).toContainText("Uitkomst: verkoop (77% zekerheid)");
  await expect(card.locator(".anasummary")).toContainText("1 behandeld");

  // Second capture in the same visit: the not-interested sample DOES leave an
  // objection unhandled — improvements must appear, grounded in the objection.
  await card.getByRole("button", { name: "Dismiss" }).click();
  await expect(card).toBeHidden();
  await openRecordSheetToSamples(page);
  await pickSample(page, SAMPLE.nlNotInterested);

  const card2 = page.getByTestId("analysis-card");
  await expect(card2).toBeVisible();
  await expect(page.getByTestId("analysis-outcome")).toContainText("91%");
  const improveCard = card2.locator(".card", { hasText: "Improve" });
  await expect(improveCard).toBeVisible();
  const improvementItems = improveCard.locator(".coach li");
  await expect(improvementItems).toHaveCount(1);
  await expect(improvementItems.first().locator(".areachip")).toHaveText("Objections");
  const objRow2 = card2.locator(".objrow");
  await expect(objRow2.locator(".objhandled")).toHaveAttribute("aria-label", "not handled");
});

test("US-09: a conversation in a different language than the UI still classifies correctly and gives a readable summary", async ({
  page,
}) => {
  await page.goto("/log");
  await openRecordSheetToSamples(page);

  // EN follow-up sample — UI/rep language is Dutch (CoachRecorder.REP_UI_LANGUAGE).
  await pickSample(page, SAMPLE.enFollowUp);

  const card = page.getByTestId("analysis-card");
  await expect(card).toBeVisible();

  const outcome = page.getByTestId("analysis-outcome");
  await expect(outcome).toContainText("Follow-up");
  await expect(outcome).toContainText("91%");
  await expect(page.getByTestId("analysis-language")).toHaveText("EN");

  // Original (English) summary is shown, plus a readable translated summary
  // in the rep's UI language since it differs from the detected language.
  await expect(card.locator(".anasummary")).toContainText("Outcome: follow-up (91% confidence)");
  const translated = card.locator(".translatedsummary");
  await expect(translated).toBeVisible();
  await expect(translated).toContainText("Uitkomst: vervolgafspraak (91% zekerheid)");
  await expect(translated).toContainText("Vervolgstap: Come back after 7");

  await expect(card.locator(".nextstep")).toContainText("Come back after 7");
});

test("US-10: logging the recorded outcome from the analysis card counts exactly like a manual log", async ({
  page,
}) => {
  // US-10 checks Today's fixed baseline stats — that fixture only shows
  // once demo mode is explicitly on (WIZARD-BRIEF); Log itself is unaffected.
  await enterDemoMode(page);
  await goToTab(page, "Log");

  await goToTab(page, "Today");
  await expect(page.locator(".statv").first()).toBeVisible();
  expect(await page.locator(".statv").allTextContents()).toEqual([
    "87",
    "14",
    "4",
    "€152",
    "9,418",
    "7.2",
  ]);

  await goToTab(page, "Log");
  await openRecordSheetToSamples(page);
  await pickSample(page, SAMPLE.nlSalePriceObjection); // classifies as "sale"

  const card = page.getByTestId("analysis-card");
  await expect(card).toBeVisible();
  await page.getByTestId("log-outcome-btn").click();

  // Same snackbar + Undo affordance as a manual Log tap.
  const snack = page.locator(".snack");
  await expect(snack).toHaveClass(/show/);
  await expect(snack).toContainText("Sale — Meidoornstraat 42");
  await expect(card).toBeHidden();

  // Counts exactly like a manual "Sale" tap: doors+1, convos+1, sales+1, +€38.
  await goToTab(page, "Today");
  await expect(page.locator(".statv").first()).toBeVisible();
  expect(await page.locator(".statv").allTextContents()).toEqual([
    "88",
    "15",
    "5",
    "€190",
    "9,418",
    "7.2",
  ]);
});
