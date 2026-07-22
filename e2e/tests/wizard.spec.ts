import { test, expect } from "@playwright/test";
import { goToTab } from "./helpers";

/**
 * WIZARD-BRIEF definition of done: "Fresh browser profile -> wizard runs
 * start to finish (Playwright: fake geolocation + stubbed Overpass/Nominatim
 * responses; also a manual-path test with permission denied)."
 *
 * Both Overpass (mosque search) and Nominatim (work-area geocode) are
 * stubbed — this suite never hits the real network.
 */

async function stubOsmNetwork(page: import("@playwright/test").Page) {
  await page.route("https://nominatim.openstreetmap.org/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        { display_name: "Groenewoud, Tilburg, Netherlands", lat: "51.5550", lon: "5.0800" },
      ]),
    });
  });
  await page.route("https://overpass-api.de/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        elements: [
          { type: "node", id: 123456, lat: 51.5551, lon: 5.0805, tags: { name: "Grote Moskee Tilburg" } },
        ],
      }),
    });
  });
}

test("wizard: fresh profile runs start to finish with fake geolocation and stubbed OSM, and wires real data everywhere", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 51.5606, longitude: 5.0919 });
  await stubOsmNetwork(page);

  await page.goto("/");
  await expect(page.getByTestId("today-onboarding")).toBeVisible();

  // Demo is reachable but NOT what we're testing here — the wizard is.
  await page.getByTestId("start-setup-btn").click();
  await expect(page.getByTestId("day-setup-wizard")).toBeVisible();

  // Step 1: location — real GPS via the faked position.
  await page.getByTestId("wizard-share-location").click();

  // Step 2: work area — Nominatim (stubbed) geocode, pick the top match.
  await expect(page.getByTestId("wizard-workarea-input")).toBeVisible();
  await page.getByTestId("wizard-workarea-input").fill("Groenewoud");
  await page.getByTestId("wizard-workarea-search").click();
  await expect(page.getByTestId("wizard-workarea-matches")).toBeVisible();
  await page.getByTestId("wizard-workarea-matches").getByRole("button").first().click();

  // Step 3: work hours — keep the 12:00–18:00 default.
  await expect(page.getByTestId("wizard-hours-start")).toBeVisible();
  await page.getByTestId("wizard-hours-next").click();

  // Step 4: bag + locker.
  await page.getByTestId("wizard-bag-yes").click();
  await page.getByTestId("wizard-locker-yes").click();
  await page.getByTestId("wizard-bag-next").click();

  // Step 5: prayer stops — yes.
  await page.getByTestId("wizard-prayer-yes").click();

  // Step 5a: method/madhab — keep MWL/Standard defaults.
  await expect(page.getByTestId("wizard-method-mwl")).toBeVisible();
  await page.getByTestId("wizard-settings-next").click();

  // Step 5b: combine — Dhuhr+Asr combined, Maghrib+Isha separate. The
  // on-device prayer-time preview should render now that the work area has
  // coordinates (from the stubbed Nominatim match).
  await page.getByTestId("wizard-combine-dhuhrasr-yes").click();
  await expect(page.getByTestId("wizard-prayer-preview")).toBeVisible();
  await page.getByTestId("wizard-combine-next").click();

  // Step 5c: mosque — Overpass (stubbed) result, pick it.
  await expect(page.getByTestId("wizard-mosque-results")).toBeVisible({ timeout: 5000 });
  await page.getByTestId("wizard-mosque-results").getByRole("button").first().click();

  // Step 6: summary — recap reflects every answer, then compile.
  await expect(page.locator(".wizrecaprow", { hasText: "Work area" })).toContainText("Groenewoud");
  await expect(page.locator(".wizrecaprow", { hasText: "Bag" })).toContainText("locker");
  await expect(page.locator(".wizrecaprow", { hasText: "Prayer stops" })).toContainText(
    "Grote Moskee Tilburg",
  );
  await page.getByTestId("wizard-compile").click();
  await expect(page.getByTestId("day-setup-wizard")).toBeHidden();

  // Today now shows real data, not fixture numbers: the work area label,
  // an honest "no plan yet" prompt, and an honest "no visits" empty state.
  await expect(page.locator(".loc")).toHaveText("Groenewoud, Tilburg, Netherlands");
  await expect(page.getByTestId("today-no-plan")).toBeVisible();
  await expect(page.getByTestId("today-no-visits")).toBeVisible();
  await expect(page.locator(".statv").first()).toHaveText("0");

  // Plan tab: real chips built from the wizard answers (not the fixed demo
  // ten), and compiling produces a real plan with the prayer stop on it.
  await goToTab(page, "Plan");
  await expect(page.locator(".chips .pill").filter({ hasText: "Groenewoud" })).toBeVisible();
  await expect(page.locator(".chips .pill").filter({ hasText: "locker" })).toBeVisible();
  await page.getByTestId("plan-compile-btn").click();
  const compiledCard = page.locator(".card", { hasText: "Compiled plan · Groenewoud" });
  await expect(compiledCard).toBeVisible({ timeout: 5000 });
  await expect(compiledCard).toContainText("Grote Moskee Tilburg");
  // No fabricated EV pills for a real plan — a plain, honest summary line instead.
  await expect(compiledCard.locator(".evrow")).toHaveCount(0);

  await page.getByTestId("plan-accept-btn").click();
  await page.waitForURL("**/route", { timeout: 5000 });

  // Route tab: the real plan's legs (including the prayer stop), and the
  // Day Trail panel — present regardless of wizard/demo state.
  await expect(page.getByTestId("route-plan-legs")).toContainText("Grote Moskee Tilburg");
  await expect(page.getByTestId("trail-toggle")).toBeVisible();
});

test("wizard: manual path when location permission is denied", async ({ page }) => {
  // No geolocation permission granted at all — getCurrentPosition rejects
  // with PERMISSION_DENIED, same as a real user tapping "Block". Nominatim
  // stubbed to return no matches at all, so both the manual location and
  // the work area fall back to their plain typed labels (no coordinates).
  await page.route("https://nominatim.openstreetmap.org/**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: "[]" });
  });

  await page.goto("/");
  await page.getByTestId("start-setup-btn").click();

  await page.getByTestId("wizard-share-location").click();
  await expect(page.getByTestId("wizard-manual-location")).toBeVisible({ timeout: 5000 });
  await page.getByTestId("wizard-manual-location").fill("Tilburg centrum");
  await page.getByTestId("wizard-manual-location-submit").click();

  // Work area — no online match either, use the typed text as-is.
  await expect(page.getByTestId("wizard-workarea-input")).toBeVisible();
  await page.getByTestId("wizard-workarea-input").fill("Some unmapped hamlet");
  await page.getByTestId("wizard-workarea-search").click();
  await expect(page.getByTestId("wizard-workarea-manual")).toBeVisible({ timeout: 5000 });
  await page.getByTestId("wizard-workarea-manual").click();

  await page.getByTestId("wizard-hours-next").click();
  await page.getByTestId("wizard-bag-no").click();
  await page.getByTestId("wizard-bag-next").click();
  await page.getByTestId("wizard-prayer-no").click();

  await expect(page.locator(".wizrecaprow", { hasText: "From" })).toContainText("Tilburg centrum");
  await expect(page.locator(".wizrecaprow", { hasText: "Work area" })).toContainText(
    "Some unmapped hamlet",
  );
  await page.getByTestId("wizard-compile").click();
  await expect(page.getByTestId("day-setup-wizard")).toBeHidden();

  await expect(page.locator(".loc")).toHaveText("Some unmapped hamlet");
});
