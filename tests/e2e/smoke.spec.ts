import { expect, test } from "@playwright/test";

const fixtureBuildId = "123e4567-e89b-42d3-a456-426614174000";
const fixtureData = {
  schemaVersion: 1,
  revision: 0,
  builds: [
    {
      id: fixtureBuildId,
      characterId: "SD",
      name: "Freeze control",
      startLevel: 1,
      startPicks: [],
      startDeck: [],
      levelUps: [],
      motivations: [],
      guidance: {},
      createdAt: "2024-01-02T03:04:05.000Z",
      updatedAt: "2024-01-02T03:04:05.000Z",
    },
  ],
};
const fullFixtureData = {
  ...fixtureData,
  builds: [
    {
      ...fixtureData.builds[0],
      levelUps: Array.from({ length: 8 }, (_, index) => ({
        level: index + 2,
        pick: null,
        added: [],
        dropped: [],
      })),
    },
  ],
};

test("loads the deck builder shell and health status", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Frosthaven Deck Builder" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Server healthy");
});

test("keeps card actions separate from enlarge and provides an image fallback", async ({
  page,
}) => {
  await page.goto("/__test/cards");

  const firstAction = page.locator(".card-action").first();
  const firstLabel = await firstAction.getAttribute("aria-label");
  await firstAction.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Selected" }),
  ).toContainText(firstLabel?.replace("Open ", "") ?? "");

  const firstEnlarge = page.getByRole("button", { name: /Enlarge/ }).first();
  await firstEnlarge.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(firstEnlarge).toBeFocused();

  const fallbackImage = page
    .locator(".card-tile")
    .nth(1)
    .locator("img")
    .first();
  await expect(fallbackImage).toHaveAttribute("src", /fh-sd-back\.jpeg/);

  const pausedCard = page.locator(".card-tile").nth(2);
  await expect(pausedCard.getByRole("status")).toHaveText("Paused");
  await expect(pausedCard.locator(".card-action")).toBeDisabled();
  await pausedCard.getByRole("button", { name: /Enlarge/ }).click();
  const pausedDialog = page.getByRole("dialog");
  const pausedAction = pausedDialog.getByRole("button", { name: /Open/ });
  await expect(pausedAction).toBeDisabled();
  await page
    .getByRole("button", { name: "Toggle paused card" })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(pausedAction).toBeEnabled();
  await pausedAction.click();
  await expect(pausedDialog).toBeHidden();
  await expect(
    pausedCard.getByRole("button", { name: /Enlarge/ }),
  ).toBeFocused();
});

test("renders contextual build navigation from stored build data", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixtureData),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/1`);

  await expect(page.getByText("Freeze control")).toBeVisible();
  await expect(page.getByText("Level 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Level up" })).toHaveAttribute(
    "href",
    `/c/SD/b/${fixtureBuildId}/l/1/level-up`,
  );
  await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "href",
    `/c/SD/b/${fixtureBuildId}/overview`,
  );

  await page.goto(`/c/SD/b/${fixtureBuildId}/overview`);
  await expect(page.getByText("Freeze control")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Deck", exact: true }),
  ).toHaveAttribute("href", `/c/SD/b/${fixtureBuildId}/l/1`);
  await expect(page.getByRole("link", { name: "Level up" })).toHaveAttribute(
    "href",
    `/c/SD/b/${fixtureBuildId}/l/1/level-up`,
  );
});

test("keeps contextual level navigation within a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fullFixtureData),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/9`);

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await expect(
    page.getByRole("link", { name: "9", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("offers retry after an initial load failure", async ({ page }) => {
  let failed = false;
  await page.route("**/api/data", (route) => {
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 503, body: "unavailable" });
    }
    return route.continue();
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your workspace is unavailable" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByRole("heading", { name: "Your builds" }),
  ).toBeVisible();
});

test("fits the compact layout and exposes attribution", async ({ page }) => {
  await page.goto("/__test/cards");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));

  await page.goto("/about");
  await expect(
    page.getByRole("heading", { name: "Local, personal deck planning" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Attribution" }),
  ).toBeVisible();
});
