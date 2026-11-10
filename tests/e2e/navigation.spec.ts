import { expect, test } from "@playwright/test";
import {
  fixtureBuildId,
  fixtureData,
  fullFixtureData,
  deckFixtureData,
  overviewFixtureData,
  lastPositionStorageKey,
} from "./fixtures";

for (const { name, startLevel, latestLevel } of [
  { name: "Testlvl1", startLevel: 1, latestLevel: 5 },
  { name: "demo", startLevel: 1, latestLevel: 3 },
  { name: "Higher starting level", startLevel: 4, latestLevel: 6 },
  { name: "New level one", startLevel: 1, latestLevel: 1 },
  { name: "New level four", startLevel: 4, latestLevel: 4 },
]) {
  test(`opens ${name} at its incomplete starting level`, async ({ page }) => {
    await page.route("**/api/data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...fixtureData,
          builds: [
            {
              ...fixtureData.builds[0],
              name,
              startLevel,
              startPicks: Array.from(
                { length: startLevel - 1 },
                (_, index) => ({
                  forLevel: index + 2,
                  cardId: null,
                }),
              ),
              levelUps: Array.from(
                { length: latestLevel - startLevel },
                (_, index) => ({
                  level: startLevel + index + 1,
                  pick: null,
                  added: [],
                  dropped: [],
                }),
              ),
            },
          ],
        }),
      }),
    );
    await page.goto("/c/SD");
    await page
      .getByRole("link", {
        name: `${name} Level: start ${startLevel} · latest ${latestLevel}`,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      `/c/SD/b/${fixtureBuildId}/l/${startLevel}${latestLevel === startLevel ? "/start" : ""}`,
    );
  });
}

for (const firstInvalidLevel of [null, 2, 3]) {
  test(`opens a build at ${firstInvalidLevel === null ? "the latest valid level" : `the first issue at level ${firstInvalidLevel}`}`, async ({
    page,
  }) => {
    const data = structuredClone(overviewFixtureData);
    if (firstInvalidLevel !== null) {
      for (const levelUp of data.builds[0]!.levelUps) {
        if (levelUp.level >= firstInvalidLevel) {
          levelUp.dropped = [];
        }
      }
    }
    await page.route("**/api/data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      }),
    );
    await page.goto("/c/SD");
    const attention = page.locator(".build-attention");
    if (firstInvalidLevel === null) {
      await expect(
        page.getByRole("link", {
          name: "Freeze control Level: start 1 · latest 3",
          exact: true,
        }),
      ).toBeVisible();
      await expect(attention).toHaveCount(0);
    } else {
      await expect(attention).toHaveText("Needs attention");
    }
    await page
      .getByRole("link", {
        name: "Freeze control Level: start 1 · latest 3",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      `/c/SD/b/${fixtureBuildId}/l/${firstInvalidLevel ?? 3}`,
    );
  });
}

for (const valid of [true, false]) {
  test(`opens a ${valid ? "valid" : "invalid"} starting-only deck in ${valid ? "view" : "the editor"}`, async ({
    page,
  }) => {
    const build = deckFixtureData.builds[0]!;
    await page.route("**/api/data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...deckFixtureData,
          builds: [
            {
              ...build,
              levelUps: [],
              startDeck: valid
                ? build.startDeck
                : [...build.startDeck.slice(1), "unknown-card"],
            },
          ],
        }),
      }),
    );
    await page.goto("/c/SD");
    await page
      .getByRole("link", {
        name: "Freeze control Level: start 1 · latest 1",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      `/c/SD/b/${fixtureBuildId}/l/1${valid ? "" : "/start"}`,
    );
  });
}

test("switches between stored levels using the header navigation", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deckFixtureData),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/1`);
  const editRight = await page
    .locator(".deck-intro > .button-link")
    .evaluate((element) => element.getBoundingClientRect().right);
  const cardsRight = await page
    .locator(".deck-card-list .card-tile")
    .evaluateAll((cards) =>
      Math.max(...cards.map((card) => card.getBoundingClientRect().right)),
    );
  expect(Math.abs(editRight - cardsRight)).toBeLessThan(2);
  await page.getByRole("link", { name: "Level 2", exact: true }).click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/2`);
  await page.getByRole("link", { name: "Level 1", exact: true }).click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/1`);
});

test("offers the last valid deck on the picker and safely ignores invalid storage", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deckFixtureData),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);
  await expect(page).toHaveURL(/\/l\/2$/);
  await page
    .getByRole("link", { name: "Frosthaven Deck Builder builds" })
    .click();
  await expect(page).toHaveURL(`/c/SD`);
  await expect(
    page.getByRole("heading", { name: "Your builds" }),
  ).toBeVisible();

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/1/start`);
  await page
    .getByRole("link", { name: "Frosthaven Deck Builder builds" })
    .click();
  await expect(page).toHaveURL(`/c/SD`);

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);
  await expect(page).toHaveURL(/\/l\/2$/);
  await expect(
    page.evaluate((key) => localStorage.getItem(key), lastPositionStorageKey),
  ).resolves.toBe(
    JSON.stringify({ characterId: "SD", buildId: fixtureBuildId, level: 2 }),
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Choose your character" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("link", {
      name: "Resume Snowdancer · Freeze control · Level 2",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/2`);
  await expect(
    page.getByRole("heading", { name: "Deck: Freeze control" }),
  ).toBeVisible();

  await page.evaluate(
    (key) => localStorage.setItem(key, "not-json"),
    lastPositionStorageKey,
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Choose your character" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Resume/ })).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  await page.evaluate(
    ({ key, buildId }) =>
      localStorage.setItem(
        key,
        JSON.stringify({ characterId: "SD", buildId, level: 9 }),
      ),
    { key: lastPositionStorageKey, buildId: fixtureBuildId },
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Choose your character" }),
  ).toBeVisible();

  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          characterId: "SD",
          buildId: "missing-build",
          level: 1,
        }),
      ),
    lastPositionStorageKey,
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Choose your character" }),
  ).toBeVisible();
});

test("keeps deck navigation usable when local storage is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("local storage is blocked");
      },
    });
  });
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deckFixtureData),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);
  await expect(
    page.getByRole("heading", { name: "Deck: Freeze control" }),
  ).toBeVisible();
});

test("keeps malformed deck routes safe", async ({ page }) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deckFixtureData),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/99`);
  await expect(
    page.getByRole("heading", { name: "This deck view is unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to builds" }),
  ).toBeVisible();
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
  await page.getByRole("link", { name: "Level 9", exact: true }).waitFor();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await expect(
    page.getByRole("link", { name: "Level 9", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Level up" })).toHaveAttribute(
    "href",
    `/c/SD/b/${fixtureBuildId}/l/1/start`,
  );
  await expect(page.getByRole("button", { name: /Level up/i })).toHaveCount(0);
});
