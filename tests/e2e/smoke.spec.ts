import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { AppData } from "../../src/shared/schema";

const fixtureBuildId = "123e4567-e89b-42d3-a456-426614174000";
const fixtureData = {
  schemaVersion: 2,
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
      cardNotes: [],
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
const startThreeFixtureData = {
  ...fixtureData,
  builds: [
    {
      ...fixtureData.builds[0],
      id: "123e4567-e89b-42d3-a456-426614174001",
      name: "Starting three",
      startLevel: 3,
      startPicks: [
        { forLevel: 2, cardId: "birds-in-a-tempest" },
        { forLevel: 3, cardId: "tornado" },
      ],
    },
  ],
};
const deckFixtureData = {
  ...fixtureData,
  builds: [
    {
      ...fixtureData.builds[0],
      startDeck: [
        "blizzard",
        "chilling-impact",
        "cold-therapy",
        "cross-winds",
        "enticing-breeze",
        "frigid-growth",
        "gathering-force",
        "lifting-gust",
        "natures-breath",
        "snowball",
        "whiteout",
      ],
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest"],
          dropped: ["whiteout"],
        },
      ],
      cardNotes: [
        {
          cardId: "cold-therapy",
          level: 1,
          text: "Use early.\nPair with Snowball.",
          updatedAt: "2024-01-02T03:04:05.000Z",
        },
        {
          cardId: "birds-in-a-tempest",
          level: 2,
          text: "The best level-up pick.",
          updatedAt: "2024-01-02T03:04:05.000Z",
        },
        {
          cardId: "whiteout",
          level: 2,
          text: "The weakest initiative.",
          updatedAt: "2024-01-02T03:04:05.000Z",
        },
      ],
    },
  ],
};

const overviewFixtureData = {
  ...deckFixtureData,
  builds: [
    {
      ...deckFixtureData.builds[0],
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest"],
          dropped: ["whiteout"],
        },
        {
          level: 3,
          pick: "tornado",
          added: ["tornado", "white-winds"],
          dropped: ["snowball", "blizzard"],
        },
      ],
    },
  ],
};

const invalidDeckFixtureData = {
  ...deckFixtureData,
  builds: [
    {
      ...deckFixtureData.builds[0],
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: [],
          dropped: ["whiteout"],
        },
      ],
    },
  ],
};

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

for (const firstInvalidLevel of [1, 2, null]) {
  test(`shows the lowest earlier level needing repair (${firstInvalidLevel})`, async ({
    page,
  }) => {
    const data = structuredClone(overviewFixtureData);
    if (firstInvalidLevel === 1) {
      data.builds[0]!.startDeck = [];
    } else if (firstInvalidLevel === 2) {
      data.builds[0]!.levelUps[0]!.dropped = [];
    }
    await page.route("**/api/data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      }),
    );
    await page.goto(`/c/SD/b/${fixtureBuildId}/l/3`);
    await expect(
      page.getByRole("heading", { name: "Deck: Freeze control" }),
    ).toBeAttached();
    const badge = page
      .locator(".deck-issues")
      .getByText(/^Fix level \d+ first$/);
    if (firstInvalidLevel === null) {
      await expect(badge).toHaveCount(0);
    } else {
      await expect(badge).toHaveText(`Fix level ${firstInvalidLevel} first`);
      await page.goto(`/c/SD/b/${fixtureBuildId}/l/${firstInvalidLevel}`);
      await expect(
        page.getByRole("heading", { name: "Deck: Freeze control" }),
      ).toBeAttached();
      await expect(badge).toHaveCount(0);
    }
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

for (const view of ["starting", "deck"] as const) {
  test(`keeps ${view} issues below the header while scrolling`, async ({
    page,
  }) => {
    await page.route("**/api/data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          view === "starting" ? fixtureData : invalidDeckFixtureData,
        ),
      }),
    );
    await page.goto(
      `/c/SD/b/${fixtureBuildId}/l/${view === "starting" ? "1/start" : "2"}`,
    );
    const bar = page.locator(
      view === "starting" ? ".starting-hand-status" : ".deck-issues",
    );
    await expect(bar).toBeVisible();
    if (view === "starting") {
      await expect
        .poll(() =>
          bar.evaluate((element) =>
            Math.abs(
              element.getBoundingClientRect().top -
                Number.parseFloat(getComputedStyle(element).top),
            ),
          ),
        )
        .toBeLessThan(2);
    }
    await bar.evaluate((element) => {
      window.scrollTo(
        0,
        window.scrollY + element.getBoundingClientRect().top + 200,
      );
    });
    await expect
      .poll(async () =>
        bar.evaluate((element) => {
          const top = Number.parseFloat(getComputedStyle(element).top);
          return Math.abs(element.getBoundingClientRect().top - top);
        }),
      )
      .toBeLessThan(2);
    if (view === "deck") {
      await expect(bar.getByRole("button").first()).toBeVisible();
      await expect(
        bar.getByRole("button", { name: /^Edit level/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Edit this level" }),
      ).toBeAttached();
    } else {
      await expect(bar).toContainText("0 / 11 cards");
      await bar.evaluate((element) => {
        const zoom = document.querySelectorAll(
          ".starting-hand .enlarge-button",
        )[4]!;
        const targetY = element.getBoundingClientRect().top + 20;
        window.scrollBy(0, zoom.getBoundingClientRect().top + 18 - targetY);
      });
      const barCoversZoom = await bar.evaluate((element) => {
        const zoom = document.querySelectorAll(
          ".starting-hand .enlarge-button",
        )[4]!;
        const box = zoom.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          ),
        );
      });
      expect(barCoversZoom).toBe(true);
      await bar.getByRole("button", { name: "Done", exact: true }).click();
      await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/1`);
      await expect(
        page.getByText("0 / 11 cards", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .locator(".deck-issues")
          .getByRole("button", { name: /^Edit level/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Edit starting deck" }),
      ).toBeVisible();
    }
  });
}

test("keeps starting cards in place when the deck becomes incomplete", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        route.request().method() === "GET" ? deckFixtureData : { revision: 1 },
      ),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/1/start`);
  const status = page.getByRole("list", { name: "Starting build status" });
  await expect(status).toContainText("11 / 11 cards");
  const done = page.getByRole("button", { name: "Done", exact: true });
  await expect(done).toBeEnabled();
  const grid = page.locator(".starting-hand > .card-grid");
  const barRight = await page
    .locator(".starting-hand-status")
    .evaluate((element) => element.getBoundingClientRect().right);
  const cardsRight = await grid
    .locator(".card-tile")
    .evaluateAll((cards) =>
      Math.max(...cards.map((card) => card.getBoundingClientRect().right)),
    );
  expect(Math.abs(barRight - cardsRight)).toBeLessThan(2);
  const gridTop = () =>
    grid.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
  const initialTop = await gridTop();
  await page
    .getByRole("button", {
      name: "Remove Cold Therapy from starting deck",
      exact: true,
    })
    .click();
  await expect(status).toContainText("10 / 11 cards");
  await expect(done).toBeEnabled();
  expect(Math.abs((await gridTop()) - initialTop)).toBeLessThan(2);
  await page
    .getByRole("button", {
      name: "Add Cold Therapy to starting deck",
      exact: true,
    })
    .click();
  await expect(status).toContainText("11 / 11 cards");
  expect(Math.abs((await gridTop()) - initialTop)).toBeLessThan(2);
  await done.click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/1`);
  await expect(
    page.getByRole("heading", { name: "Deck: Freeze control" }),
  ).toBeAttached();
});

const lastPositionStorageKey = "frosthaven-deck-builder:last-position";
const levelUpBuildId = "123e4567-e89b-42d3-a456-426614174002";
const levelUpBaseBuild = {
  ...fixtureData.builds[0],
  id: levelUpBuildId,
  name: "Level-up lab",
  startDeck: deckFixtureData.builds[0].startDeck,
};
const levelUpFixtureData = {
  ...fixtureData,
  builds: [levelUpBaseBuild],
};
const revisedLevelFixtureData = {
  ...fixtureData,
  builds: [
    {
      ...levelUpBaseBuild,
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest"],
          dropped: ["whiteout"],
        },
      ],
    },
  ],
};
const plannedLaterFixtureData = {
  ...fixtureData,
  builds: [
    {
      ...levelUpBaseBuild,
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest"],
          dropped: ["whiteout"],
        },
        {
          level: 3,
          pick: "tornado",
          added: ["tornado"],
          dropped: ["snowball"],
        },
      ],
    },
  ],
};
const invalidEditedLevelFixtureData = {
  ...revisedLevelFixtureData,
  builds: [
    {
      ...revisedLevelFixtureData.builds[0],
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest", "tornado"],
          dropped: ["whiteout"],
        },
      ],
    },
  ],
};
const resetDuringSaveFixtureData = {
  ...revisedLevelFixtureData,
  builds: [
    {
      ...revisedLevelFixtureData.builds[0],
      name: "Keep this name",
      cardNotes: [
        {
          cardId: "tornado",
          level: 1,
          text: "Keep this unrelated note.",
          updatedAt: "2024-01-02T03:04:05.000Z",
        },
      ],
    },
  ],
};

test("matches the compact image-first mockup on desktop and phone", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({ json: revisedLevelFixtureData }),
  );
  for (const width of [1280, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/c/SD/b/${levelUpBuildId}/l/2/level-up`);
    const candidate = page.locator(".level-up-candidate").first();
    const card = candidate.locator(".card-action");
    const image = card.locator("img");
    const cardBox = (await card.boundingBox())!;
    const imageBox = (await image.boundingBox())!;
    expect(Math.abs(cardBox.height - imageBox.height)).toBeLessThan(3);
    if (width > 520) expect(cardBox.width).toBe(220);
    await expect(page.locator(".level-up-picks .level-up-group")).toHaveCount(
      1,
    );
    await expect(
      page.getByRole("heading", { name: "Available cards" }),
    ).toBeVisible();
    const zoomBox = (await candidate.locator(".enlarge-button").boundingBox())!;
    expect(zoomBox.y).toBeLessThan(cardBox.y + 16);
    expect(zoomBox.x + zoomBox.width).toBeLessThanOrEqual(
      cardBox.x + cardBox.width,
    );
    // Card notes sit below the card on an opaque panel, never over the art.
    await expect(candidate.locator(".card-note-input")).toHaveCSS(
      "background-color",
      "rgb(22, 34, 56)",
    );
    await expect(candidate.locator("textarea")).toHaveCSS(
      "background-color",
      "rgb(11, 18, 32)",
    );
    const noteBox = (await candidate
      .locator(".card-note-input")
      .boundingBox())!;
    expect(noteBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
    await expect(page.locator(".bottom-tabs").getByRole("link")).toHaveCount(3);
    expect(
      await page
        .locator(".app-header")
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeLessThan(125);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.goto(`/c/SD/b/${levelUpBuildId}/l/2`);
    const deckCards = page.locator(".deck-card-list .card-action");
    const deckCardBox = (await deckCards.first().boundingBox())!;
    expect(deckCardBox.width).toBe(cardBox.width);
    if (width <= 520) {
      expect((await deckCards.nth(1).boundingBox())!.y).toBe(deckCardBox.y);
      expect((await deckCards.nth(2).boundingBox())!.y).toBeGreaterThan(
        deckCardBox.y,
      );
    }
  }
});

test("runs a level-up pick, drop and done through the stored editor", async ({
  page,
}) => {
  let persisted = structuredClone(levelUpFixtureData);
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/1`);
  await page.getByRole("link", { name: "Level up" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${levelUpBuildId}/l/2/level-up`);
  await expect(
    page.getByRole("heading", { name: "Earlier, not yet picked" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Available cards" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Birds in a Tempest" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pick Birds in a Tempest" }).click();
  if (page.viewportSize()!.width < 1240) {
    await expect(
      page.getByRole("heading", { name: "Your deck", exact: true }),
    ).toBeFocused();
  }
  await expect(page.getByText("12 / 11 cards", { exact: true })).toBeVisible();
  const excluded = page.locator(
    '.level-up-candidate:has([data-card-id="tornado"])',
  );
  await expect(excluded.getByRole("status")).toHaveText("Not in pool");
  await expect(
    excluded.getByRole("button", { name: "Pick Tornado", exact: true }),
  ).toBeEnabled();
  await excluded
    .getByLabel("Card note for Tornado")
    .fill("Prefer the other card.");
  await expect
    .poll(() => persisted.builds[0]!.cardNotes)
    .toContainEqual(
      expect.objectContaining({
        cardId: "tornado",
        level: 2,
        text: "Prefer the other card.",
      }),
    );
  await page.reload();
  await expect(excluded.getByLabel("Card note for Tornado")).toHaveValue(
    "Prefer the other card.",
  );
  await expect(page.locator(".level-up-editor .deck-issues")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Drop Blizzard" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Drop Blizzard" }).click();
  await expect(page.locator(".level-up-instruction")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Done" })).toBeEnabled();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${levelUpBuildId}/l/2`);
  await expect
    .poll(async () => persisted.builds[0]?.levelUps[0])
    .toMatchObject({
      level: 2,
      pick: "birds-in-a-tempest",
      added: ["birds-in-a-tempest"],
      dropped: ["blizzard"],
    });
});

test("scrolls and moves focus to the deck after a mobile pick", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let persisted = structuredClone(levelUpFixtureData);
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/1`);
  await page.getByRole("link", { name: "Level up" }).click();
  await page.getByRole("button", { name: "Pick Birds in a Tempest" }).click();
  const deckHeading = page.getByRole("heading", { name: "Your deck" });
  await expect(deckHeading).toBeFocused();
  await expect
    .poll(async () => {
      const headingBox = await deckHeading.boundingBox();
      const stickyBottom = await page
        .locator(".app-header, .level-up-status")
        .evaluateAll((elements) =>
          Math.max(
            ...elements.map(
              (element) =>
                (element as HTMLElement).getBoundingClientRect().bottom,
            ),
          ),
        );
      return (headingBox?.y ?? Number.POSITIVE_INFINITY) - stickyBottom;
    })
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        (await deckHeading.boundingBox())?.y ?? Number.POSITIVE_INFINITY,
    )
    .toBeLessThan(568);
  await expect
    .poll(async () => {
      const headingBox = await deckHeading.boundingBox();
      const bottomTabs = await page
        .getByRole("navigation", { name: "Primary navigation" })
        .boundingBox();
      return (
        (headingBox?.y ?? 568) +
        (headingBox?.height ?? 0) -
        (bottomTabs?.y ?? 0)
      );
    })
    .toBeLessThanOrEqual(0);
});

test("keeps enlarged cards view-only and restores focus before picking", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let persisted = structuredClone(levelUpFixtureData);
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/1`);
  await page.getByRole("link", { name: "Level up" }).click();
  const enlargeButton = page.getByRole("button", {
    name: "Enlarge Birds in a Tempest",
  });
  await expect(enlargeButton).toBeVisible();
  await page.evaluate(() => {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>(".enlarge-button"),
    ].find(
      (candidate) =>
        candidate.getAttribute("aria-label") === "Enlarge Birds in a Tempest",
    );
    if (!button) {
      return;
    }
    const stickyBottom = Math.max(
      0,
      ...Array.from(
        document.querySelectorAll<HTMLElement>(
          ".app-header, .save-feedback, .level-up-status",
        ),
      ).map((element) => element.getBoundingClientRect().bottom),
    );
    const bottomTabs = document.querySelector<HTMLElement>(".bottom-tabs");
    const safeTop = stickyBottom + 16;
    const safeBottom =
      Math.min(
        window.innerHeight,
        bottomTabs?.getBoundingClientRect().top ?? window.innerHeight,
      ) - 16;
    const buttonCenter =
      button.getBoundingClientRect().top +
      button.getBoundingClientRect().height / 2;
    const safeCenter = (safeTop + safeBottom) / 2;
    window.scrollBy({ top: buttonCenter - safeCenter, behavior: "auto" });
  });
  await enlargeButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(enlargeButton).toBeFocused();
  await page
    .getByRole("button", { name: "Pick Birds in a Tempest", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Your deck" })).toBeFocused();
});

test("preserves later stored operations when revising an earlier level", async ({
  page,
}) => {
  let persisted = structuredClone(plannedLaterFixtureData);
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/2`);
  await page.getByRole("link", { name: "Edit this level" }).click();
  await page.getByRole("button", { name: "Pick Tornado" }).click();
  await expect
    .poll(async () => persisted.builds[0]?.levelUps)
    .toEqual([
      {
        level: 2,
        pick: "tornado",
        added: ["tornado"],
        dropped: ["whiteout"],
      },
      {
        level: 3,
        pick: "tornado",
        added: ["tornado"],
        dropped: ["snowball"],
      },
    ]);
});

test("retains a pre-existing invalid operation in the edited level", async ({
  page,
}) => {
  let persisted = structuredClone(invalidEditedLevelFixtureData);
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/2`);
  await page.getByRole("link", { name: "Edit this level" }).click();
  await page.getByRole("button", { name: "Drop Blizzard" }).click();
  await expect
    .poll(async () => persisted.builds[0]?.levelUps[0])
    .toMatchObject({
      level: 2,
      pick: "birds-in-a-tempest",
      added: expect.arrayContaining(["birds-in-a-tempest", "tornado"]),
      dropped: ["whiteout", "blizzard"],
    });
});

test("resets during an in-flight save without losing unrelated fields or notes", async ({
  page,
}) => {
  let persisted = structuredClone(resetDuringSaveFixtureData);
  let firstPutStarted = false;
  let releaseFirstPut: (() => void) | undefined;
  const firstPut = new Promise<void>((resolve) => {
    releaseFirstPut = resolve;
  });
  let putCount = 0;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    putCount += 1;
    const body = JSON.parse(route.request().postData() ?? "{}");
    if (putCount === 1) {
      firstPutStarted = true;
      await firstPut;
    }
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/2/level-up`);
  await page.getByRole("button", { name: "Pick Tornado" }).click();
  await page.getByLabel("Card note for Tornado").first().fill("Temporary note");
  await expect.poll(() => firstPutStarted).toBe(true);
  await page
    .getByRole("button", { name: "Reset (current edit)", exact: true })
    .click();
  releaseFirstPut?.();

  await expect.poll(() => putCount).toBe(2);
  await expect
    .poll(async () => persisted.builds[0])
    .toMatchObject({
      name: "Keep this name",
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest"],
          dropped: ["whiteout"],
        },
      ],
      cardNotes: resetDuringSaveFixtureData.builds[0].cardNotes,
    });
});

test("keeps swap notes stable and new cards removable", async ({ page }) => {
  let persisted = structuredClone(revisedLevelFixtureData);
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/2`);
  await page.getByRole("link", { name: "Edit this level" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${levelUpBuildId}/l/2/level-up`);
  await expect(page.locator(".level-up-deck .card-name")).toHaveText([
    "Birds in a Tempest",
    "Cold Therapy",
    "Whiteout",
    "Snowball",
    "Lifting Gust",
    "Chilling Impact",
    "Cross Winds",
    "Frigid Growth",
    "Blizzard",
    "Enticing Breeze",
    "Gathering Force",
    "Nature's Breath",
  ]);
  const whiteout = page.getByRole("button", {
    name: "Add White Winds to deck",
  });
  await whiteout.click();
  await expect(
    page.getByLabel("Card note for White Winds").first(),
  ).toBeVisible();
  await page
    .getByLabel("Card note for White Winds")
    .first()
    .fill("Bring it back for control.");
  await page
    .getByRole("region", { name: "Other pool cards" })
    .getByRole("button", { name: "Remove White Winds from deck" })
    .click();
  await page.getByRole("button", { name: "Add White Winds to deck" }).click();
  await expect(
    page.getByLabel("Card note for White Winds").first(),
  ).toHaveValue("Bring it back for control.");
  // The added card is removable from both the pool and "Your deck".
  const removeWhiteWinds = page.getByRole("button", {
    name: "Remove White Winds from deck",
  });
  await expect(removeWhiteWinds).toHaveCount(2);
  await page
    .getByRole("region", { name: "Your deck" })
    .getByRole("button", { name: "Remove White Winds from deck" })
    .click();
  await expect(removeWhiteWinds).toHaveCount(0);
  await page.getByRole("button", { name: "Add White Winds to deck" }).click();
  await expect(removeWhiteWinds).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Drop Birds in a Tempest" }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".level-up-deck")
      .getByRole("button", { name: "Unpick Birds in a Tempest" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Drop Snowball" }).click();
  await expect(page.getByRole("button", { name: "Done" })).toBeEnabled();
  await page.getByRole("button", { name: "Done" }).click();
  await expect
    .poll(async () => persisted.builds[0]?.levelUps[0])
    .toEqual(
      expect.objectContaining({
        added: expect.arrayContaining(["birds-in-a-tempest", "white-winds"]),
        dropped: expect.arrayContaining(["whiteout", "snowball"]),
      }),
    );
  await expect(persisted.builds[0]?.cardNotes).toEqual([
    {
      level: 2,
      cardId: "white-winds",
      text: "Bring it back for control.",
      updatedAt: expect.any(String),
    },
  ]);
});

test("appends unfinished levels, resumes them after reload and resets only this editor", async ({
  page,
}) => {
  let persisted = structuredClone(levelUpFixtureData);
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/1`);
  await page.getByRole("link", { name: "Level up" }).click();
  await expect.poll(async () => persisted.builds[0]?.levelUps.length).toBe(1);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${levelUpBuildId}/l/2`);
  await expect(page.locator(".deck-issues")).toContainText(
    "Level 2 pick has not been chosen",
  );
  await page.getByRole("link", { name: "Edit this level" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Level up" })).toBeVisible();
  await expect(
    page.getByText("Level 2 pick has not been chosen"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pick Birds in a Tempest" }).click();
  await page.getByRole("button", { name: "Add White Winds to deck" }).click();
  await page
    .getByLabel("Card note for White Winds")
    .first()
    .fill("Temporary note");
  await page
    .getByRole("button", { name: "Reset (current edit)", exact: true })
    .click();
  await expect(
    page.getByText("Level 2 pick has not been chosen"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Done" })).toBeEnabled();
  await expect
    .poll(async () => persisted.builds[0]?.levelUps[0])
    .toMatchObject({ pick: null, added: [], dropped: [] });
  await expect(persisted.builds[0]?.cardNotes).toEqual([]);
});

test("colors a full card count green even when the pick is missing or invalid", async ({
  page,
}) => {
  const data = structuredClone(deckFixtureData) as AppData;
  data.builds[0]!.levelUps = [
    {
      level: 2,
      pick: null,
      added: ["birds-in-a-tempest"],
      dropped: [],
    },
  ];
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2/level-up`);
  await expect(page.locator(".level-up-instruction")).toHaveText(
    "Level 2 pick has not been chosen",
  );
  await expect(page.locator(".level-up-instruction")).toHaveCSS(
    "color",
    "rgb(251, 191, 36)",
  );
  await expect(page.locator(".level-up-counter")).toHaveText("11 / 11 cards");
  await expect(page.locator(".level-up-counter")).toHaveCSS(
    "color",
    "rgb(74, 222, 128)",
  );
  await expect(page.locator(".level-up-counter")).toHaveCSS(
    "background-color",
    "rgba(74, 222, 128, 0.133)",
  );
  await expect(page.locator(".deck-issues")).toContainText(
    "Birds in a Tempest is not in the pool",
  );
});

test("places deck issue badges beside each other when there is room", async ({
  page,
}) => {
  const data = structuredClone(deckFixtureData) as AppData;
  data.builds[0]!.levelUps = [
    {
      level: 2,
      pick: null,
      added: ["white-winds"],
      dropped: [],
    },
  ];
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.setViewportSize({ width: 1240, height: 900 });
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);
  const badges = page.locator(".repair-list li > span");
  await expect(badges).toHaveCount(2);
  const first = await badges.nth(0).boundingBox();
  const second = await badges.nth(1).boundingBox();
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
  expect(second!.x).toBeGreaterThanOrEqual(first!.x + first!.width);
  const badgeAppearance = (elements: Element[]) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        text: element.textContent?.trim(),
        color: style.color,
        background: style.backgroundColor,
        padding: style.padding,
        borderRadius: style.borderRadius,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      };
    });
  const viewBadges = await badges.evaluateAll(badgeAppearance);
  await page.getByRole("link", { name: "Edit this level" }).click();
  const editBadges = page.locator(".level-up-instruction, .level-up-counter");
  await expect(editBadges).toHaveCount(2);
  expect(await editBadges.evaluateAll(badgeAppearance)).toEqual(viewBadges);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
});

test("shows amber overfull counts without redundant deck instructions", async ({
  page,
}) => {
  const data = structuredClone(deckFixtureData);
  data.builds[0]!.levelUps = [
    {
      level: 2,
      pick: "birds-in-a-tempest",
      added: ["birds-in-a-tempest"],
      dropped: [],
    },
  ];
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2/level-up`);
  await expect(page.locator(".level-up-counter")).toHaveText("12 / 11 cards");
  await expect(page.locator(".level-up-instruction")).toHaveCount(0);
  await page.getByRole("button", { name: "Done" }).click();
  const issue = page.locator('.repair-list [data-issue-code="DECK_TOO_LARGE"]');
  await expect(issue).toHaveText("12 / 11 cards");
  const colors = await issue.evaluate((element) => ({
    actual: getComputedStyle(element).color,
    warning: getComputedStyle(element.closest(".issue-list")!).color,
    background: getComputedStyle(element.querySelector("span")!)
      .backgroundColor,
  }));
  expect(colors.actual).toBe(colors.warning);
  expect(colors.background).toBe("rgba(251, 191, 36, 0.133)");
});

test("allows leaving an invalid level-up deck with Done", async ({ page }) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(invalidDeckFixtureData),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2/level-up`);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/2`);
  await expect(page.locator(".deck-issues")).toContainText(
    "Picked card birds-in-a-tempest must be added to the deck",
  );
});

test("scopes editor reset and appending to the current level", async ({
  page,
}) => {
  let persisted = structuredClone(levelUpFixtureData);
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/1`);
  await page.getByRole("link", { name: "Level up" }).click();
  await page.getByRole("button", { name: "Pick Birds in a Tempest" }).click();
  await page.getByRole("button", { name: "Drop Blizzard" }).click();
  await page.getByRole("link", { name: "Level up" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${levelUpBuildId}/l/3/level-up`);
  await expect.poll(async () => persisted.builds[0]?.levelUps.length).toBe(2);

  await page.getByRole("link", { name: "Level 2", exact: true }).click();
  await page.getByRole("link", { name: "Edit this level" }).click();
  await page.getByRole("link", { name: "Level up" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${levelUpBuildId}/l/3/level-up`);
  await page.getByRole("button", { name: "Pick Cold Snap" }).click();
  await page
    .getByRole("button", { name: "Reset (current edit)", exact: true })
    .click();
  await expect
    .poll(async () => persisted.builds[0]?.levelUps[1])
    .toMatchObject({ pick: null, added: [], dropped: [] });
  await expect
    .poll(async () => persisted.builds[0]?.levelUps[0])
    .toMatchObject({
      pick: "birds-in-a-tempest",
      added: ["birds-in-a-tempest"],
      dropped: ["blizzard"],
    });
});

test("loads local class icons in the picker and build header", async ({
  page,
}) => {
  let releaseData!: () => void;
  const loading = new Promise<void>((resolve) => {
    releaseData = resolve;
  });
  await page.route("**/api/data", async (route) => {
    await loading;
    await route.fulfill({ json: fixtureData });
  });
  await page.goto("/");
  await expect(page.getByText("Loading your deck workspace…")).toBeVisible();
  releaseData();
  const pickerIcon = page.locator('.character-choice[href="/c/SD"] img');
  await expect(pickerIcon).toHaveAttribute("src", "/icons/SD.png");
  await expect
    .poll(() =>
      pickerIcon.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/1`);
  const headerIcon = page.locator(".brand img");
  await expect(headerIcon).toHaveAttribute("src", "/icons/SD.png");
  await expect
    .poll(() =>
      headerIcon.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
});

test("loads the deck builder shell and health status", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Frosthaven Deck Builder" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Server healthy");
});

test("keeps card actions separate from enlarge and provides an image fallback", async ({
  page,
  browserName,
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
  // WebKit requires Option+Tab to include buttons in keyboard navigation.
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(firstEnlarge).toBeFocused();

  await firstEnlarge.click();
  await expect(dialog.getByRole("button")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
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
  await expect(pausedDialog.getByRole("button")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Toggle paused card" })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(pausedDialog.getByRole("button")).toHaveCount(1);
  await pausedDialog
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(pausedDialog).toBeHidden();
  await expect(
    pausedCard.getByRole("button", { name: /Enlarge/ }),
  ).toBeFocused();
});

test("renders a derived deck view and links to the overview", async ({
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

  await expect(page.getByText("Freeze control", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Previous and next deck levels" }),
  ).toHaveCount(0);
  await expect(page.locator(".pool-badge")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Deck: Freeze control" }),
  ).toBeVisible();
  await expect(page.getByText("0 / 11 cards", { exact: true })).toBeVisible();
  await expect(page.getByText("Incomplete", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Edit starting deck" }),
  ).toHaveAttribute("href", `/c/SD/b/${fixtureBuildId}/l/1/start`);
  const primaryNavigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  await expect(
    primaryNavigation.getByRole("link", { name: "Level up" }),
  ).toHaveAttribute("href", `/c/SD/b/${fixtureBuildId}/l/1/start`);
  await expect(
    primaryNavigation.getByRole("link", { name: "Overview" }),
  ).toHaveAttribute("href", `/c/SD/b/${fixtureBuildId}/overview`);

  await page.goto(`/c/SD/b/${fixtureBuildId}/overview`);
  await expect(
    page.getByRole("heading", { name: "Build overview" }),
  ).toBeVisible();
  await expect(page.locator(".overview-group-row")).toHaveCount(10);
  await expect(page.locator(".overview-card-name")).toHaveCount(30);
  await expect(page.getByText("Blizzard", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open level 1 deck" }),
  ).toHaveAttribute("href", `/c/SD/b/${fixtureBuildId}/l/1`);
});

test("shows overview membership, applied markers, swap counts and card notes", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(overviewFixtureData),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/overview`);

  await expect(
    page.getByText("Pick: Tornado · 2 added · 1 extra swap · 2 dropped", {
      exact: true,
    }),
  ).toBeVisible();

  const levelOneDeckLink = page.getByRole("link", {
    name: "Open level 1 deck",
  });
  await levelOneDeckLink.click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/1`);
  await page.goto(`/c/SD/b/${fixtureBuildId}/overview`);
  const levelTwoDeckLink = page.getByRole("link", {
    name: "Open level 2 deck",
  });
  await levelTwoDeckLink.focus();
  await expect(levelTwoDeckLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/2`);
  await page.goto(`/c/SD/b/${fixtureBuildId}/overview`);
  const summaryCells = page.locator(".overview-summary-row td");
  await expect(summaryCells).toHaveCount(3);
  expect(
    await summaryCells.evaluateAll((cells) =>
      cells.map((cell) => cell.scrollWidth > cell.clientWidth + 1),
    ),
  ).toEqual([false, false, false]);

  await expect(page.getByLabel("Tornado: In deck; Picked here")).toBeVisible();
  await expect(
    page.getByLabel("White Winds: In deck; Added here"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Snowball: In pool, not in deck; Dropped here"),
  ).toBeVisible();

  // Notes surface in the cell where they were recorded, without navigating.
  await expect(page.getByRole("link", { name: /motivation/ })).toHaveCount(0);
  const noteButton = page.getByRole("button", {
    name: "Card note for Whiteout at level 2",
  });
  await noteButton.evaluate((button) =>
    button.scrollIntoView({ block: "center", inline: "center" }),
  );
  await expect(
    page.getByRole("button", { name: /^Card note for Whiteout/ }),
  ).toHaveCount(1);
  await noteButton.click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/overview`);
  await expect(page.getByRole("tooltip")).toHaveText("The weakest initiative.");
  await expect(noteButton).toHaveAttribute("aria-expanded", "true");
  await noteButton.click();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("keeps starting pick slot context in overview cells and summaries", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(startThreeFixtureData),
    }),
  );
  await page.goto(`/c/SD/b/${startThreeFixtureData.builds[0].id}/overview`);

  await expect(
    page.getByLabel(
      "Birds in a Tempest: In pool, not in deck; Picked at level 2",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Starting picks: Level 2: Birds in a Tempest, Level 3: Tornado",
      { exact: true },
    ),
  ).toBeVisible();
});

test("marks incomplete and invalid levels amber in the header", async ({
  page,
}) => {
  const data = structuredClone(deckFixtureData) as AppData;
  data.builds[0]!.levelUps.push(
    { level: 3, pick: null, added: [], dropped: [] },
    {
      level: 4,
      pick: "polar-vortex",
      added: ["polar-vortex", "unknown-card"],
      dropped: ["snowball"],
    },
  );
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/3`);
  const nav = page.getByRole("navigation", { name: "Level navigation" });
  for (const level of [1, 2]) {
    await expect(
      nav.getByRole("link", { name: `Level ${level}`, exact: true }),
    ).not.toHaveAttribute("data-needs-attention");
  }
  for (const level of [3, 4]) {
    const link = nav.getByRole("link", { name: `Level ${level}`, exact: true });
    await expect(link).toHaveAttribute("data-needs-attention", "true");
    await expect(link).toHaveAccessibleDescription(
      `Level ${level} needs attention`,
    );
  }
  const selected = nav.getByRole("link", { name: "Level 3", exact: true });
  await expect(selected).toHaveAttribute("aria-current", "page");
  await expect(selected).toHaveCSS("background-color", "rgb(251, 191, 36)");
  await expect(
    nav.getByRole("link", { name: "Level 4", exact: true }),
  ).toHaveCSS("color", "rgb(251, 191, 36)");
  await nav.getByRole("link", { name: "Level 2", exact: true }).click();
  await expect(
    nav.getByRole("link", { name: "Level 2", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(selected).toHaveCSS("color", "rgb(251, 191, 36)");
});

test("flags an invalid overview column without hiding its applied state", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(invalidDeckFixtureData),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/overview`);

  await expect(
    page.getByRole("status", { name: "Level 2 column invalid" }),
  ).toBeVisible();
  await expect(
    page.getByText("Pick: Birds in a Tempest · 0 added · 1 dropped", {
      exact: true,
    }),
  ).toBeVisible();
});

test("shows card notes, dropped cards and a read-only note history", async ({
  page,
}) => {
  const data = structuredClone(deckFixtureData) as AppData;
  // A later version must not leak into the level 2 deck view.
  data.builds[0]!.cardNotes.push({
    cardId: "cold-therapy",
    level: 3,
    text: "Later: heal the summon.",
    updatedAt: "2024-01-02T03:04:05.000Z",
  });
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);

  await expect(
    page.getByRole("heading", { name: "Deck: Freeze control" }),
  ).toBeVisible();
  const deckCardNames = page.locator(".deck-card-list .card-name");
  await expect(deckCardNames).toHaveText([
    "Birds in a Tempest",
    "Cold Therapy",
    "Snowball",
    "Lifting Gust",
    "Chilling Impact",
    "Cross Winds",
    "Frigid Growth",
    "Blizzard",
    "Enticing Breeze",
    "Gathering Force",
    "Nature's Breath",
  ]);
  await expect(page.locator(".deck-intro .status-badge")).toHaveCount(0);
  await expect(page.locator(".change-section")).toHaveCount(0);
  const birds = page.locator(
    '.deck-card-item:has([data-card-id="birds-in-a-tempest"])',
  );
  await expect(birds.locator(".card-state")).toHaveText("Level 2 pick");
  await expect(page.getByText("NEW", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);

  const showNotes = page.getByRole("checkbox", { name: "Show card note" });
  await expect(showNotes).not.toBeChecked();
  await expect(page.locator(".card-note")).toHaveCount(0);
  await showNotes.check();
  const coldTherapy = page.locator(
    '.deck-card-item:has([data-card-id="cold-therapy"])',
  );
  await expect(coldTherapy.locator(".card-note")).toContainText("Use early.");
  await expect(coldTherapy.locator(".card-note")).toContainText(
    "Pair with Snowball.",
  );
  await expect(coldTherapy.locator(".card-note-level")).toHaveText("L1");
  await expect(page.getByText("Later: heal the summon.")).toHaveCount(0);
  await expect(birds.locator(".card-note")).toContainText(
    "The best level-up pick.",
  );
  const emptyNote = page
    .locator('.deck-card-item:has([data-card-id="snowball"]) .card-note em')
    .first();
  await expect(emptyNote).toHaveText("No card note");
  await expect(emptyNote).toHaveCSS("font-style", "italic");

  const showDropped = page.getByRole("checkbox", {
    name: "Show dropped cards",
  });
  await expect(showDropped).not.toBeChecked();
  await expect(page.locator('[data-card-id="whiteout"]')).toHaveCount(0);
  await showDropped.check();
  const whiteout = page.locator(
    '.deck-card-item:has([data-card-id="whiteout"])',
  );
  await expect(whiteout.locator(".card-state")).toHaveText("Dropped");
  await expect(whiteout.locator(".card-state")).toHaveCSS(
    "background-color",
    "rgb(183, 57, 57)",
  );
  await expect(whiteout.locator(".card-note")).toContainText(
    "The weakest initiative.",
  );

  await page.getByRole("button", { name: "Open Cold Therapy details" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/card/cold-therapy`);
  await expect(
    page.getByRole("heading", { name: "Card detail" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cold Therapy" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  const history = page.locator(".card-note-history li");
  await expect(history).toHaveCount(2);
  await expect(history.locator(".card-note-level")).toHaveText([
    "Level 1",
    "Level 3",
  ]);
  await expect(history.nth(1)).toContainText("Later: heal the summon.");
  await page.getByRole("link", { name: "Back to level 2 deck" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/2`);

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/1`);
  await expect(
    page.getByRole("checkbox", { name: "Show dropped cards" }),
  ).toHaveCount(0);
});

test("renders replay validation messages without redundant invalid badges", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(invalidDeckFixtureData),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);
  await expect(page.getByText("Invalid", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Picked card birds-in-a-tempest must be added to the deck", {
      exact: true,
    }),
  ).toBeVisible();
});

test("removes an invalid downstream operation without changing its neighbors", async ({
  page,
}) => {
  let persisted = structuredClone(invalidEditedLevelFixtureData);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/2`);
  await expect(page.getByText("Invalid", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Remove added card Tornado" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "Remove added card Tornado" }).click();
  await expect
    .poll(async () => persisted.builds[0]?.levelUps[0])
    .toEqual({
      level: 2,
      pick: "birds-in-a-tempest",
      added: ["birds-in-a-tempest"],
      dropped: ["whiteout"],
    });
  await expect(page.getByText("Invalid", { exact: true })).toHaveCount(0);
});

test("deletes only the highest level and its card notes", async ({ page }) => {
  let persisted = structuredClone(plannedLaterFixtureData) as AppData;
  persisted.builds[0]!.cardNotes = [
    {
      cardId: "birds-in-a-tempest",
      level: 2,
      text: "Keep this note",
      updatedAt: "2024-01-02T03:04:05.000Z",
    },
    {
      cardId: "tornado",
      level: 3,
      text: "Delete this note",
      updatedAt: "2024-01-02T03:04:05.000Z",
    },
  ];
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/2`);
  await expect(
    page.getByRole("button", { name: "Delete level 2" }),
  ).toHaveCount(0);
  await page.goto(`/c/SD/b/${levelUpBuildId}/l/3`);
  await page.getByRole("button", { name: "Delete level 3" }).click();
  await expect(
    page.getByRole("dialog", { name: "Delete level 3?" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "card notes recorded at level 3",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Delete level 3?" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Delete level 3" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete level" })
    .click();
  await expect(page).toHaveURL(`/c/SD/b/${levelUpBuildId}/l/2`);
  await expect
    .poll(async () => persisted.builds[0])
    .toMatchObject({
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest"],
          dropped: ["whiteout"],
        },
      ],
      cardNotes: [
        {
          cardId: "birds-in-a-tempest",
          level: 2,
          text: "Keep this note",
        },
      ],
    });
});

test("keeps starting-pick warnings without redundant edit buttons", async ({
  page,
}) => {
  const persisted = structuredClone(startThreeFixtureData) as AppData;
  persisted.builds[0]!.startPicks = [
    { forLevel: 2, cardId: null },
    { forLevel: 3, cardId: null },
  ];
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(persisted),
    }),
  );

  await page.goto(
    `/c/SD/b/${persisted.builds[0]!.id}/l/${persisted.builds[0]!.startLevel}`,
  );
  await expect(
    page.getByRole("button", { name: "Edit starting choices" }),
  ).toHaveCount(0);
  await expect(page.locator('[data-issue-code="MISSING_PICK"]')).toHaveCount(2);
  await page.getByRole("link", { name: "Edit starting deck" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${persisted.builds[0]!.id}/l/3/start`);
});

test("restores a picked card when its stored add is missing", async ({
  page,
}) => {
  let persisted = structuredClone(invalidDeckFixtureData);
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);
  await page
    .getByRole("button", { name: "Restore Birds in a Tempest to deck" })
    .click();
  await expect
    .poll(async () => persisted.builds[0]?.levelUps[0])
    .toMatchObject({ added: ["birds-in-a-tempest"] });
  await expect(page.getByText("Invalid", { exact: true })).toHaveCount(0);
});

test("carries card notes forward and records a new version per level", async ({
  page,
}) => {
  let persisted = structuredClone(deckFixtureData) as AppData;
  persisted.builds[0]!.levelUps.push({
    level: 3,
    pick: "polar-vortex",
    added: ["polar-vortex"],
    dropped: ["snowball"],
  });
  persisted.builds[0]!.cardNotes.push({
    cardId: "tornado",
    level: 2,
    text: "Already explained at level 2",
    updatedAt: "2024-01-02T03:04:05.000Z",
  });
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: persisted });
      return;
    }
    const body = route.request().postDataJSON();
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({ json: { revision: persisted.revision } });
  });
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/3/level-up`);
  const available = page.getByRole("region", {
    name: "Available cards",
    exact: true,
  });
  // Every shown card can carry a note, including kept deck cards.
  const candidates = available.locator(".level-up-candidate");
  await expect(candidates.first()).toBeVisible();
  await expect(available.getByRole("textbox")).toHaveCount(
    await candidates.count(),
  );
  const deck = page.locator(".level-up-deck");
  await expect(deck.getByRole("textbox")).toHaveCount(
    await deck.locator(".level-up-deck-card").count(),
  );
  await expect(available.getByText("Card note", { exact: true })).toHaveCount(
    await candidates.count(),
  );

  // A picked card shows the same note in both places, kept in sync.
  const pickNotes = page.getByLabel("Card note for Polar Vortex");
  await expect(pickNotes).toHaveCount(2);
  await pickNotes.first().fill("Synced between both fields");
  await expect(pickNotes.nth(1)).toHaveValue("Synced between both fields");
  await pickNotes.nth(1).fill("");

  const tornado = candidates.filter({
    has: page.getByRole("button", { name: "Pick Tornado", exact: true }),
  });
  await expect(tornado.locator(".card-tile")).toHaveAttribute(
    "data-state",
    "Not in pool",
  );
  const tornadoNote = tornado.getByLabel("Card note for Tornado");
  await expect(tornadoNote).toHaveValue("Already explained at level 2");
  await expect(tornado.locator(".card-note-level")).toHaveText("from L2");
  await expect(tornado.getByRole("button", { name: /Revert/ })).toHaveCount(0);

  await tornadoNote.fill("Still skipping it at level 3");
  await expect(tornado.locator(".card-note-level")).toHaveText("L3");
  await expect
    .poll(() =>
      persisted.builds[0]!.cardNotes.filter(
        (note) => note.cardId === "tornado",
      ),
    )
    .toEqual([
      expect.objectContaining({
        level: 2,
        text: "Already explained at level 2",
      }),
      expect.objectContaining({
        level: 3,
        text: "Still skipping it at level 3",
      }),
    ]);

  await tornado
    .getByRole("button", { name: "Revert Tornado note to level 2" })
    .click();
  await expect(tornadoNote).toHaveValue("Already explained at level 2");
  await expect(tornado.locator(".card-note-level")).toHaveText("from L2");
  await expect
    .poll(() =>
      persisted.builds[0]!.cardNotes.filter(
        (note) => note.cardId === "tornado",
      ),
    )
    .toEqual([expect.objectContaining({ level: 2 })]);

  // Clearing an inherited note stores an empty version for this level.
  await tornadoNote.fill("");
  await expect(tornado.locator(".card-note-level")).toHaveText("L3");
  await expect
    .poll(
      () =>
        persisted.builds[0]!.cardNotes.find(
          (note) => note.cardId === "tornado" && note.level === 3,
        )?.text,
    )
    .toBe("");

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2/level-up`);
  await expect(page.getByLabel("Card note for Tornado")).toHaveValue(
    "Already explained at level 2",
  );
});

test("sorts Your deck and the deck view by descending level with X last", async ({
  page,
}) => {
  const data = structuredClone(deckFixtureData) as AppData;
  data.builds[0]!.levelUps.push({
    level: 3,
    pick: "polar-vortex",
    added: ["polar-vortex", "white-winds"],
    dropped: [],
  });
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/3/level-up`);
  await expect(
    page.locator(".level-up-deck .card-action img").first(),
  ).toBeVisible();
  const levels = await page
    .locator(".level-up-deck .card-action img")
    .evaluateAll((images) =>
      images.map((image) => image.getAttribute("alt")!.split("level ")[1]!),
    );
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".deck-card-list .card-action img")).toHaveCount(
    levels.length,
  );
  const viewLevels = await page
    .locator(".deck-card-list .card-action img")
    .evaluateAll((images) =>
      images.map((image) => image.getAttribute("alt")!.split("level ")[1]!),
    );
  expect(viewLevels).toEqual(levels);
  expect(levels).toEqual(expect.arrayContaining(["3", "2", "1", "X"]));
  expect(levels).toEqual(
    [...levels].sort(
      (left, right) =>
        (right === "X" ? 0 : Number(right)) - (left === "X" ? 0 : Number(left)),
    ),
  );
});

test("styles level-up pick badges as centered pills in view and edit", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({ json: deckFixtureData }),
  );
  for (const route of ["2", "2/level-up"]) {
    await page.goto(`/c/SD/b/${fixtureBuildId}/l/${route}`);
    const badge = page
      .locator('.card-tile[data-card-id="birds-in-a-tempest"] .card-state')
      .first();
    await expect(badge).toHaveText("Level 2 pick");
    await expect(badge).toHaveCSS("top", "-11px");
    await expect(badge).toHaveCSS("border-radius", "99px");
    await expect(badge).toHaveCSS("font-size", "12px");
    await expect(badge).toHaveCSS("color", "rgb(3, 17, 31)");
    await expect(badge).toHaveCSS("background-color", "rgb(125, 211, 252)");
    const offset = await badge.evaluate((element) => {
      const badge = element.getBoundingClientRect();
      const card = element.closest(".card-tile")!.getBoundingClientRect();
      return Math.abs(badge.x + badge.width / 2 - card.x - card.width / 2);
    });
    expect(offset).toBeLessThan(2);
  }
});

test("combines available cards in descending level order", async ({ page }) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fullFixtureData),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/3/level-up`);
  const available = page.getByRole("region", {
    name: "Available cards",
    exact: true,
  });
  await expect(available).toBeVisible();
  const levels = await available
    .locator(".card-action img")
    .evaluateAll((images) =>
      images.map((image) =>
        Number(image.getAttribute("alt")!.split("level ")[1]),
      ),
    );
  expect(levels).toEqual([3, 3, 2, 2]);
  await expect(
    page.getByRole("heading", { name: "Earlier, not yet picked" }),
  ).toHaveCount(0);
});

test("shares content width across starting and level-up views and editors", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deckFixtureData),
    }),
  );
  for (const width of [390, 900, 1240]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = [];
    for (const [route, selector] of [
      ["1", ".deck-intro"],
      ["1/start", ".starting-hand-status"],
      ["2", ".deck-intro"],
      ["2/level-up", ".level-up-status"],
    ]) {
      await page.goto(`/c/SD/b/${fixtureBuildId}/l/${route}`);
      const section = page.locator(selector!);
      await expect(section).toBeVisible();
      if (route === "2/level-up") {
        const available = await page.locator(".level-up-picks").boundingBox();
        const deck = await page.locator(".level-up-hand").boundingBox();
        expect(deck!.y).toBeGreaterThanOrEqual(
          available!.y + available!.height,
        );
        expect(Math.abs(deck!.x - available!.x)).toBeLessThan(2);
        expect(Math.abs(deck!.width - available!.width)).toBeLessThan(2);
      }
      bounds.push(
        await section.evaluate((element) => {
          const { left, right } = element.getBoundingClientRect();
          return { left, right };
        }),
      );
    }
    for (const bound of bounds.slice(1)) {
      expect(Math.abs(bound.left - bounds[0]!.left)).toBeLessThan(2);
      expect(Math.abs(bound.right - bounds[0]!.right)).toBeLessThan(2);
    }
  }
});

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

test("keeps saving feedback subtle without shifting content while scrolling", async ({
  page,
}) => {
  let releasePut!: () => void;
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fullFixtureData),
      });
      return;
    }
    await new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: 1 }),
    });
  });
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/9/__test/save-feedback`);
  const content = page.locator(".page-content");
  const contentTop = (await content.boundingBox())!.y;
  await page.getByRole("button", { name: "Trigger pending save" }).click();
  const feedback = page.locator(".save-feedback");
  await expect(feedback).toHaveText("Saving…");
  await expect(feedback).toHaveCSS("position", "fixed");
  await expect(feedback).toHaveCSS("background-color", "rgb(17, 26, 46)");
  const feedbackBox = (await feedback.boundingBox())!;
  expect(feedbackBox.width).toBeLessThan(160);
  expect(feedbackBox.y + feedbackBox.height).toBeLessThan(
    (await page.locator(".bottom-tabs").boundingBox())!.y,
  );
  expect((await content.boundingBox())!.y).toBe(contentTop);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(async () => (await feedback.boundingBox())?.y ?? -1)
    .toBeGreaterThanOrEqual(
      (await page.locator(".app-header").boundingBox())!.height - 1,
    );
  releasePut();
  await expect(feedback).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect((await content.boundingBox())!.y).toBe(contentTop);
});

test("keeps error and conflict feedback below the mobile header", async ({
  page,
}) => {
  for (const [name, response] of [
    ["error", { status: 503, body: "unavailable" }],
    ["conflict", { status: 409, body: JSON.stringify({ revision: 1 }) }],
  ] as const) {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.route("**/api/data", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fullFixtureData),
        });
        return;
      }
      await route.fulfill({ status: response.status, body: response.body });
    });
    await page.goto(`/c/SD/b/${fixtureBuildId}/l/9/__test/save-feedback`);
    await page.getByRole("button", { name: "Trigger pending save" }).click();
    const feedback = page.locator(`.save-feedback.${name}`);
    await expect(feedback).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(async () => (await feedback.boundingBox())?.y ?? -1)
      .toBeGreaterThanOrEqual(
        (await page.locator(".app-header").boundingBox())!.height - 1,
      );
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
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
    page.getByRole("heading", { name: "Choose your character" }),
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

test("creates a starting build, caps the hand, and restores it after reload", async ({
  page,
}) => {
  let persisted = { ...fixtureData, builds: [] as typeof fixtureData.builds };
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: 1 }),
    });
  });

  await page.goto("/c/SD");
  await page.getByRole("button", { name: "Create build" }).click();
  const dialog = page.getByRole("dialog", { name: "Create build" });
  await dialog.getByRole("button", { name: "Create build" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Enter a name from 1 to 100 characters.",
  );
  await dialog.getByLabel("Build name").fill("Freeze control");
  await dialog.getByRole("button", { name: "Create build" }).click();
  await expect(
    page.getByRole("heading", { name: "Starting deck: Freeze control" }),
  ).toBeVisible();

  for (const name of [
    "Blizzard",
    "Chilling Impact",
    "Cold Therapy",
    "Cross Winds",
    "Enticing Breeze",
    "Frigid Growth",
    "Gathering Force",
    "Lifting Gust",
    "Nature's Breath",
  ]) {
    await page
      .getByRole("button", { name: `Add ${name} to starting deck` })
      .click();
  }
  await expect(page.getByText("9 / 11 cards", { exact: true })).toBeVisible();
  await expect
    .poll(async () => persisted.builds[0]?.startDeck.length ?? 0, {
      timeout: 5_000,
    })
    .toBe(9);
  await page.reload();
  await expect(page.getByText("9 / 11 cards", { exact: true })).toBeVisible();

  for (const name of ["Snowball", "Whiteout"]) {
    await page
      .getByRole("button", { name: `Add ${name} to starting deck` })
      .click();
  }
  await expect(page.getByText("11 / 11 cards", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Blinding Vortex to starting deck" }),
  ).toBeDisabled();

  await expect
    .poll(async () => persisted.builds[0]?.startDeck.length ?? 0, {
      timeout: 5_000,
    })
    .toBe(11);
  await page.reload();
  await expect(page.getByText("11 / 11 cards", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Starting deck: Freeze control" }),
  ).toBeVisible();
});

test("exports acknowledged data and replaces it only after import confirmation", async ({
  page,
}) => {
  let persisted = structuredClone(fixtureData) as AppData;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      baseRevision: number;
      data: AppData;
    };
    expect(body.baseRevision).toBe(persisted.revision);
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto("/");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "frosthaven-deck-builder-backup.json",
  );

  const imported = structuredClone(fixtureData) as AppData;
  imported.revision = 999;
  imported.builds[0]!.name = "Imported plan";
  const input = page.getByLabel("Import JSON backup");
  await input.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  const dialog = page.getByRole("dialog", { name: "Replace saved data?" });
  await expect(dialog).toContainText("1 build");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(persisted.builds[0]!.name).toBe("Freeze control");

  await input.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page
    .getByRole("dialog", { name: "Replace saved data?" })
    .getByRole("button", { name: "Replace data" })
    .click();
  await expect.poll(() => persisted.builds[0]!.name).toBe("Imported plan");
});

test("keeps import failure and conflict recovery controls usable", async ({
  page,
}) => {
  let persisted = structuredClone(fixtureData) as AppData;
  let response: "failure" | "conflict" | "success" = "failure";
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      data: AppData;
    };
    if (response === "failure") {
      response = "success";
      await route.fulfill({ status: 503, body: "unavailable" });
      return;
    }
    if (response === "conflict") {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ revision: persisted.revision + 1 }),
      });
      return;
    }
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto("/");
  const input = page.getByLabel("Import JSON backup");
  const failedImport = structuredClone(fixtureData) as AppData;
  failedImport.builds[0]!.name = "Retried plan";
  await input.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(failedImport)),
  });
  await page
    .getByRole("dialog", { name: "Replace saved data?" })
    .getByRole("button", { name: "Replace data" })
    .click();
  await expect(page.locator(".save-feedback.error")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Replace saved data?" }),
  ).toBeHidden();
  await page
    .locator(".save-feedback.error")
    .getByRole("button", { name: "Retry" })
    .click();
  await expect.poll(() => persisted.builds[0]!.name).toBe("Retried plan");

  response = "conflict";
  await page.reload();
  const conflictedImport = structuredClone(fixtureData) as AppData;
  conflictedImport.builds[0]!.name = "Conflicted plan";
  await page.getByLabel("Import JSON backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(conflictedImport)),
  });
  await page
    .getByRole("dialog", { name: "Replace saved data?" })
    .getByRole("button", { name: "Replace data" })
    .click();
  await expect(page.locator(".save-feedback.conflict")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Replace saved data?" }),
  ).toBeHidden();
  await expect(
    page.locator(".save-feedback.conflict").getByRole("button", {
      name: "Download pending JSON",
    }),
  ).toBeVisible();
});

test("rejects malformed and oversized imports without changing live data", async ({
  page,
}) => {
  let persisted = structuredClone(fixtureData) as AppData;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    throw new Error("Invalid imports must not reach the save API");
  });

  await page.goto("/");
  const input = page.getByLabel("Import JSON backup");
  await input.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("not json"),
  });
  await expect(page.getByRole("alert")).toHaveText(
    "The backup file is not valid JSON.",
  );
  await input.setInputFiles({
    name: "oversized.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(1_048_577, 120),
  });
  await expect(page.getByRole("alert")).toHaveText(
    "The backup file must be at most 1 MiB.",
  );
  expect(persisted).toEqual(fixtureData);
});

test("renames, copies, and confirms build deletion", async ({ page }) => {
  let persisted = fixtureData;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: 1 }),
    });
  });

  await page.goto("/c/SD");
  const original = page.locator("li").filter({ hasText: "Freeze control" });
  await original.getByRole("button", { name: "Rename" }).click();
  const renameDialog = page.getByRole("dialog", { name: "Rename build" });
  await renameDialog.getByLabel("Build name").fill("Cold control");
  await renameDialog.getByRole("button", { name: "Rename build" }).click();
  await expect(page.getByText("Cold control", { exact: true })).toBeVisible();

  const renamed = page.locator("li").filter({ hasText: "Cold control" });
  await renamed.getByRole("button", { name: "Copy" }).click();
  const copyDialog = page.getByRole("dialog", { name: "Copy build" });
  await copyDialog.getByLabel("Build name").fill("Independent copy");
  await copyDialog.getByRole("button", { name: "Copy build" }).click();
  await expect(
    page.getByRole("heading", { name: "Starting deck: Independent copy" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add Blizzard to starting deck" })
    .click();
  await expect
    .poll(async () =>
      persisted.builds.map((build) => [build.name, build.startDeck]),
    )
    .toEqual([
      ["Cold control", []],
      ["Independent copy", ["blizzard"]],
    ]);
  await page
    .getByRole("link", { name: "Frosthaven Deck Builder builds" })
    .click();
  await expect(
    page.getByText("Independent copy", { exact: true }),
  ).toBeVisible();

  const copied = page.locator("li").filter({ hasText: "Independent copy" });
  await renamed.getByRole("button", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete build?" });
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Cold control", { exact: true })).toBeVisible();
  await renamed.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: "Delete build?" })
    .getByRole("button", { name: "Delete build" })
    .click();
  await expect(page.getByText("Cold control", { exact: true })).toHaveCount(0);
  await expect(copied).toBeVisible();
});

test("copies a higher starting level with its pick slots intact", async ({
  page,
}) => {
  let persisted = startThreeFixtureData;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: 1 }),
    });
  });

  await page.goto("/c/SD");
  await page.locator("li").getByRole("button", { name: "Copy" }).click();
  const copyDialog = page.getByRole("dialog", { name: "Copy build" });
  await copyDialog.getByLabel("Build name").fill("Higher copy");
  await copyDialog.getByRole("button", { name: "Copy build" }).click();
  await expect(
    page.getByRole("heading", { name: "Starting deck: Higher copy" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Starting setup steps" })
      .getByRole("button"),
  ).toHaveCount(3);
  await expect(page.locator(".starting-pick-summary")).toHaveCount(0);
  for (const level of [2, 3]) {
    await expect(
      page
        .getByRole("navigation", { name: "Starting setup steps" })
        .getByRole("button", { name: `Level ${level} pick, complete` }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { name: "Complement your picks · Level 3 hand" }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const build = persisted.builds.find(
        (candidate) => candidate.name === "Higher copy",
      );
      return [build?.startLevel, build?.startPicks.length];
    })
    .toEqual([3, 2]);
});

test("pauses open build dialogs after a save failure", async ({ page }) => {
  let releaseSave!: () => void;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...fixtureData, builds: [] }),
      });
      return;
    }
    await new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await route.fulfill({ status: 503, body: "unavailable" });
  });

  await page.goto("/c/SD");
  await page.getByRole("button", { name: "Create build" }).click();
  const createDialog = page.getByRole("dialog", { name: "Create build" });
  await createDialog.getByLabel("Build name").fill("Pending build");
  await createDialog.getByRole("button", { name: "Create build" }).click();
  await page
    .getByRole("link", { name: "Frosthaven Deck Builder builds" })
    .click();
  await page.getByRole("button", { name: "Create build" }).click();
  await expect.poll(() => Boolean(releaseSave)).toBe(true);
  releaseSave();
  await expect(page.getByRole("alert")).toContainText("Error saving");
  await expect(
    page
      .getByRole("dialog", { name: "Create build" })
      .getByRole("button", { name: "Create build" }),
  ).toBeDisabled();
  await expect(page).toHaveURL(/\/c\/SD$/);
});

test("preserves a lower starting pick while surfacing a higher-slot conflict", async ({
  page,
}) => {
  let persisted = startThreeFixtureData;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: 1 }),
    });
  });

  await page.goto(`/c/SD/b/${startThreeFixtureData.builds[0].id}/l/3/start`);
  await page
    .getByRole("navigation", { name: "Starting setup steps" })
    .getByRole("button", { name: /^Level 3 pick/ })
    .click();
  await page
    .getByRole("button", { name: "Pick Birds in a Tempest", exact: true })
    .click();
  await page.getByRole("button", { name: "Next pick" }).click();
  await expect(
    page.getByRole("heading", { name: "Level 2 pick" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("no longer available");
  await expect(
    page.getByRole("button", { name: "Return to hand", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(async () => {
      const build = persisted.builds[0];
      return [build?.startPicks[0]?.cardId, build?.startPicks[1]?.cardId];
    })
    .toEqual(["birds-in-a-tempest", "birds-in-a-tempest"]);
  await page.getByRole("button", { name: "Pick Tornado", exact: true }).click();
  await expect
    .poll(() => persisted.builds[0]!.startDeck)
    .toEqual(expect.arrayContaining(["birds-in-a-tempest", "tornado"]));
  await page
    .getByRole("button", { name: "Return to hand", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Complement your picks · Level 3 hand" }),
  ).toBeVisible();
});

test("offers sequential legal picks for a higher starting level", async ({
  page,
}) => {
  let persisted: {
    schemaVersion: 2;
    revision: number;
    builds: Array<{ startPicks: Array<{ cardId: string | null }> }>;
  } = { schemaVersion: 2, revision: 0, builds: [] };
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: 1 }),
    });
  });
  await page.goto("/c/SD");
  await page.getByRole("button", { name: "Create build" }).click();
  const dialog = page.getByRole("dialog", { name: "Create build" });
  await dialog.getByLabel("Build name").fill("Prosperity three");
  await dialog.getByLabel("Start level").selectOption("3");
  await dialog.getByRole("button", { name: "Create build" }).click();

  await expect(
    page.getByRole("heading", { name: "Level 3 pick" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Birds in a Tempest" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Cold Snap" }),
  ).toBeVisible();
  await expect(page.locator(".starting-hand")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Pick Cold Snap", exact: true })
    .click();
  await expect
    .poll(async () =>
      persisted.builds[0]?.startPicks.map((pick) => pick.cardId),
    )
    .toEqual([null, "cold-snap"]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Level 2 pick" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Tornado" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Polar Vortex" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Pick Birds in a Tempest", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Build starting hand", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Change level 3 pick for Cold Snap" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Change level 2 pick for Birds in a Tempest",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Card note for Polar Vortex")).toBeVisible();
});

test("edits card notes only in editors and shows them read-only elsewhere", async ({
  page,
}) => {
  let persisted = structuredClone(deckFixtureData) as AppData;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);
  const primaryNavigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  await expect(primaryNavigation.getByRole("link")).toHaveCount(3);
  await expect(
    primaryNavigation.getByRole("link", { name: "Notes" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Edit this level" }).click();
  const birdsNote = page
    .locator(".level-up-deck")
    .getByLabel("Card note for Birds in a Tempest");
  await expect(birdsNote).toHaveValue("The best level-up pick.");
  const originalTimestamp = persisted.builds[0]!.cardNotes.find(
    (note) => note.cardId === "birds-in-a-tempest",
  )!.updatedAt;
  await birdsNote.fill("<b>Top</b>\nPair with Cold Therapy.");
  await expect
    .poll(
      async () =>
        persisted.builds[0]?.cardNotes.find(
          (note) => note.cardId === "birds-in-a-tempest" && note.level === 2,
        )?.text,
    )
    .toBe("<b>Top</b>\nPair with Cold Therapy.");
  expect(
    persisted.builds[0]!.cardNotes.find(
      (note) => note.cardId === "birds-in-a-tempest",
    )!.updatedAt,
  ).not.toBe(originalTimestamp);

  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("checkbox", { name: "Show card note" }).check();
  await expect(
    page
      .locator(".card-note .plain-text")
      .filter({ hasText: "<b>Top</b>\nPair with Cold Therapy." }),
  ).toBeVisible();
  await expect(page.locator(".card-note b")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open Birds in a Tempest details" })
    .click();
  await page.reload();
  await expect(page.locator(".card-note-history")).toContainText(
    "<b>Top</b>\nPair with Cold Therapy.",
  );

  await page.goto(`/c/SD/b/${fixtureBuildId}/motivations`);
  await expect(
    page.getByRole("heading", { name: "Build motivations" }),
  ).toHaveCount(0);

  await page.goto(`/c/SD`);
  await page
    .locator("li")
    .filter({ hasText: "Freeze control" })
    .getByRole("button", { name: "Copy" })
    .click();
  const copyDialog = page.getByRole("dialog", { name: "Copy build" });
  await copyDialog.getByLabel("Build name").fill("Independent notes copy");
  await copyDialog.getByRole("button", { name: "Copy build" }).click();
  await expect
    .poll(() =>
      persisted.builds.find((build) => build.name === "Independent notes copy"),
    )
    .toBeDefined();
  const copiedBuild = persisted.builds.find(
    (build) => build.name === "Independent notes copy",
  )!;
  await page.goto(`/c/SD/b/${copiedBuild.id}/l/2/level-up`);
  const copiedNote = page
    .locator(".level-up-deck")
    .getByLabel("Card note for Birds in a Tempest");
  await expect(copiedNote).toHaveValue("<b>Top</b>\nPair with Cold Therapy.");
  await copiedNote.fill("Copy-only note");
  await expect
    .poll(
      async () =>
        persisted.builds
          .find((build) => build.id === copiedBuild.id)
          ?.cardNotes.find((note) => note.cardId === "birds-in-a-tempest")
          ?.text,
    )
    .toBe("Copy-only note");
  expect(
    persisted.builds
      .find((build) => build.id === fixtureBuildId)
      ?.cardNotes.find((note) => note.cardId === "birds-in-a-tempest")?.text,
  ).toBe("<b>Top</b>\nPair with Cold Therapy.");
});

test("keeps one card note per card in the starting editor, whatever its state", async ({
  page,
}) => {
  let persisted = structuredClone(deckFixtureData) as AppData;
  const initialHand = persisted.builds[0]!.startDeck;
  persisted.builds[0] = {
    ...persisted.builds[0]!,
    startLevel: 2,
    startPicks: [{ forLevel: 2, cardId: "birds-in-a-tempest" }],
    startDeck: initialHand.slice(0, 10),
    levelUps: [],
  };
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: persisted });
    } else {
      const body = route.request().postDataJSON();
      persisted = { ...body.data, revision: persisted.revision + 1 };
      await route.fulfill({ json: { revision: persisted.revision } });
    }
  });
  const startPath = `/c/SD/b/${fixtureBuildId}/l/2/start`;
  await page.goto(startPath);
  const unpicked = page
    .locator(".starting-deck-card")
    .filter({ has: page.locator('.card-tile[data-card-id="tornado"]') });
  const excluded = page
    .locator(".starting-deck-card")
    .filter({ has: page.locator('.card-tile[data-card-id="white-winds"]') });
  await expect(unpicked.locator(".card-action")).toBeDisabled();
  await expect(unpicked.locator(".card-action img")).toHaveCSS(
    "filter",
    "grayscale(1)",
  );
  const unpickedNote = unpicked.getByLabel("Card note for Tornado");
  await expect(unpickedNote).toBeEnabled();
  await expect(excluded.getByLabel("Card note for White Winds")).toBeEnabled();
  await unpickedNote.fill("I prefer the other level-two card.");
  await expect
    .poll(() => persisted.builds[0]!.cardNotes)
    .toContainEqual(
      expect.objectContaining({
        level: 2,
        cardId: "tornado",
        text: "I prefer the other level-two card.",
      }),
    );
  await unpicked.getByRole("button", { name: "Enlarge Tornado" }).click();
  const zoom = page.getByRole("dialog");
  await expect(zoom.getByRole("button")).toHaveCount(1);
  await zoom.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Whiteout to starting deck" })
    .click();
  const note = excluded.getByLabel("Card note for White Winds");
  await expect(note).toBeEnabled();
  await expect(excluded.locator(".card-action")).toBeDisabled();
  await expect(excluded.locator(".card-action img")).toHaveCSS(
    "filter",
    "grayscale(1)",
  );
  const notePanel = excluded.locator(".card-note-input");
  const inclusionPanel = page
    .locator(".starting-deck-card")
    .filter({ has: page.locator('.card-tile[data-card-id="cold-therapy"]') })
    .locator(".card-note-input");
  // A not-in-deck card's note takes the Not in deck pill's colour scheme.
  await expect(notePanel).toHaveCSS("color", "rgb(226, 232, 240)");
  await expect(inclusionPanel).toHaveCSS("color", "rgb(125, 211, 252)");
  expect(
    await notePanel.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe(
    await inclusionPanel.evaluate((el) => getComputedStyle(el).backgroundColor),
  );
  await expect(notePanel.getByText("Card note", { exact: true })).toBeVisible();
  const box = (await excluded.locator(".card-action").boundingBox())!;
  const noteBox = (await note.boundingBox())!;
  expect(noteBox.y).toBeGreaterThanOrEqual(box.y + box.height);
  await note.fill("Not enough room in this hand.");
  await expect
    .poll(() => persisted.builds[0]!.cardNotes)
    .toContainEqual(
      expect.objectContaining({
        level: 2,
        cardId: "white-winds",
        text: "Not enough room in this hand.",
      }),
    );
  await expect(page.locator(".exclusions, .exclusion-list")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Remove Whiteout from starting deck" })
    .click();
  await expect(note).toHaveValue("Not enough room in this hand.");
  await expect(excluded.locator(".card-action")).toBeEnabled();
  await expect(unpicked.locator(".card-action")).toBeDisabled();
  await expect(unpickedNote).toHaveValue("I prefer the other level-two card.");
  await page
    .getByRole("button", { name: "Add Whiteout to starting deck" })
    .click();
  await expect(note).toHaveValue("Not enough room in this hand.");
  await expect.poll(() => persisted.builds[0]!.startDeck.length).toBe(11);
  await page.reload();
  await expect(note).toHaveValue("Not enough room in this hand.");
  await expect(unpickedNote).toHaveValue("I prefer the other level-two card.");
  await page
    .getByRole("navigation", { name: "Starting setup steps" })
    .getByRole("button", { name: /^Level 2 pick/ })
    .click();
  await page.getByRole("button", { name: "Pick Tornado", exact: true }).click();
  await page
    .getByRole("button", { name: "Return to hand", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Birds in a Tempest is not in the starting pool",
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Remove Whiteout from starting deck" })
    .click();
  await expect(
    page.getByRole("button", { name: "Change level 2 pick for Tornado" }),
  ).toBeEnabled();
  await expect(unpickedNote).toHaveValue("I prefer the other level-two card.");
  await expect.poll(() => persisted.builds[0]!.startDeck).toContain("tornado");
  expect(persisted.builds[0]!.cardNotes).toContainEqual(
    expect.objectContaining({
      cardId: "tornado",
      text: "I prefer the other level-two card.",
    }),
  );
});

for (const startLevel of [1, 3]) {
  test(`documents starting-hand card notes at start level ${startLevel}`, async ({
    page,
  }) => {
    let persisted = structuredClone(fixtureData) as AppData;
    persisted.builds[0] = {
      ...persisted.builds[0]!,
      startLevel,
      startPicks:
        startLevel === 3 ? startThreeFixtureData.builds[0].startPicks : [],
      startDeck: ["cold-therapy"],
    };
    await page.route("**/api/data", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: persisted });
      } else {
        const body = route.request().postDataJSON();
        persisted = { ...body.data, revision: persisted.revision + 1 };
        await route.fulfill({ json: { revision: persisted.revision } });
      }
    });
    const startPath = `/c/SD/b/${fixtureBuildId}/l/${startLevel}/start`;
    const reason = "Reliable healing.\n<b>Keep for support.</b>";
    const expectedNote = {
      level: startLevel,
      cardId: "cold-therapy",
      text: reason,
    };
    await page.goto(startPath);
    const note = page.getByLabel("Card note for Cold Therapy");
    await expect(note).toBeVisible();
    await expect(
      page
        .locator(".starting-deck-card")
        .filter({
          has: page.locator('.card-tile[data-card-id="cold-therapy"]'),
        })
        .locator(".card-note-input"),
    ).toHaveCSS("background-color", "rgb(22, 34, 56)");
    const cardBox = (await page
      .locator('.starting-deck-card [data-card-id="cold-therapy"].card-action')
      .boundingBox())!;
    const noteBox = (await note.boundingBox())!;
    expect(noteBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
    await expect(page.getByLabel("Card note for Whiteout")).toHaveValue("");
    await note.fill(reason);
    await expect
      .poll(() => persisted.builds[0]!.cardNotes)
      .toContainEqual(expect.objectContaining(expectedNote));
    await page.reload();
    await expect(note).toHaveValue(reason);
    await page
      .getByRole("button", { name: "Remove Cold Therapy from starting deck" })
      .click();
    await expect(note).toHaveValue(reason);
    await expect
      .poll(() => persisted.builds[0]!.startDeck)
      .not.toContain("cold-therapy");
    expect(persisted.builds[0]!.cardNotes).toContainEqual(
      expect.objectContaining(expectedNote),
    );
    await page.goto(`/c/SD/b/${fixtureBuildId}/card/cold-therapy`);
    await expect(page.locator(".card-note-history")).toContainText(
      `Level ${startLevel}`,
    );
    await expect(page.locator(".card-note-history")).toContainText(
      "<b>Keep for support.</b>",
    );
  });
}

test("edits starting exclusion and initial-pick card notes", async ({
  page,
}) => {
  const initialPickData = structuredClone(startThreeFixtureData) as AppData;
  initialPickData.builds[0]!.startDeck = [
    "blizzard",
    "chilling-impact",
    "cold-therapy",
    "cross-winds",
    "enticing-breeze",
    "frigid-growth",
    "gathering-force",
    "lifting-gust",
    "natures-breath",
    "snowball",
    "whiteout",
  ];
  let persisted = initialPickData;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  const buildId = persisted.builds[0]!.id;
  await page.goto(`/c/SD/b/${buildId}/l/3/start`);
  const exclusion = page.getByLabel("Card note for Cold Snap");
  await exclusion.fill("Not for this build.");
  await expect
    .poll(async () => persisted.builds[0]?.cardNotes)
    .toContainEqual(
      expect.objectContaining({
        level: 3,
        cardId: "cold-snap",
        text: "Not for this build.",
      }),
    );

  await page
    .getByRole("navigation", { name: "Starting setup steps" })
    .getByRole("button", { name: /^Level 2 pick/ })
    .click();
  await expect(
    page.getByLabel("Card note for Birds in a Tempest"),
  ).toBeVisible();
  await page
    .getByLabel("Card note for Birds in a Tempest")
    .fill("Slot two reason");
  await expect
    .poll(async () => persisted.builds[0]?.cardNotes)
    .toContainEqual(
      expect.objectContaining({
        level: 3,
        cardId: "birds-in-a-tempest",
        text: "Slot two reason",
      }),
    );
  await page
    .getByRole("button", { name: "Return to hand", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove Blizzard from starting deck" })
    .click();
  await page
    .getByRole("button", { name: "Add Birds in a Tempest to starting deck" })
    .click();
  const includedPick = page.getByLabel("Card note for Birds in a Tempest");
  await expect(includedPick).toHaveValue("Slot two reason");
  await includedPick.fill("Shared pick and inclusion reason");
  await page
    .getByRole("navigation", { name: "Starting setup steps" })
    .getByRole("button", { name: /^Level 2 pick/ })
    .click();
  await expect(page.getByLabel("Card note for Birds in a Tempest")).toHaveValue(
    "Shared pick and inclusion reason",
  );
  await expect
    .poll(() =>
      persisted.builds[0]!.cardNotes.filter(
        (note) => note.cardId === "birds-in-a-tempest",
      ),
    )
    .toEqual([
      expect.objectContaining({
        level: 3,
        text: "Shared pick and inclusion reason",
      }),
    ]);
});

test("pauses note editors after save failures and conflicts", async ({
  page,
}) => {
  for (const response of [503, 409] as const) {
    const persisted = structuredClone(deckFixtureData) as AppData;
    await page.route("**/api/data", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(persisted),
        });
        return;
      }
      if (response === 409) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ revision: 1 }),
        });
      } else {
        await route.fulfill({ status: response, body: "unavailable" });
      }
    });

    await page.goto(`/c/SD/b/${fixtureBuildId}/l/2/level-up`);
    const birdsNote = page
      .locator(".level-up-deck")
      .getByLabel("Card note for Birds in a Tempest");
    await birdsNote.fill("Pending note");
    await expect(page.getByRole("alert")).toContainText(
      response === 409 ? "Changed on another device" : "Error saving",
    );
    await expect(birdsNote).toBeDisabled();
    await page.getByRole("link", { name: "Deck", exact: true }).click();
    await page.getByRole("link", { name: "Level 1", exact: true }).click();
    await page.getByRole("link", { name: "Edit starting deck" }).click();
    await expect(page.getByLabel("Card note for Cold Therapy")).toBeDisabled();
    await expect(page.getByLabel("Card note for White Winds")).toBeDisabled();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("restores focus after closing a build dialog with the keyboard", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...fixtureData, builds: [] }),
    }),
  );
  await page.goto("/c/SD");

  const createButton = page.getByRole("button", { name: "Create build" });
  await createButton.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Create build" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(createButton).toBeFocused();
});

test("preserves pending changes through a two-device conflict and explicit reload", async ({
  browser,
}) => {
  let persisted = structuredClone(fixtureData) as AppData;
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const phoneContext = await browser.newContext({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
  });
  const contexts = [desktopContext, phoneContext];

  try {
    for (const context of contexts) {
      await context.route("**/api/data", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(persisted),
          });
          return;
        }
        const body = JSON.parse(route.request().postData() ?? "{}") as {
          baseRevision: number;
          data: AppData;
        };
        if (body.baseRevision !== persisted.revision) {
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ revision: persisted.revision }),
          });
          return;
        }
        persisted = { ...body.data, revision: persisted.revision + 1 };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ revision: persisted.revision }),
        });
      });
    }

    const desktop = await desktopContext.newPage();
    const phone = await phoneContext.newPage();
    await phone.goto("/c/SD");
    await desktop.goto("/c/SD");

    await desktop
      .locator("li")
      .filter({ hasText: "Freeze control" })
      .getByRole("button", { name: "Rename" })
      .click();
    const desktopDialog = desktop.getByRole("dialog", { name: "Rename build" });
    const desktopName = desktopDialog.getByLabel("Build name");
    await expect(desktopName).toHaveValue("Freeze control");
    await desktopName.fill("Desktop plan");
    await expect(desktopName).toHaveValue("Desktop plan");
    await desktopDialog.getByRole("button", { name: "Rename build" }).click();
    await expect.poll(() => persisted.builds[0]!.name).toBe("Desktop plan");

    await phone
      .locator("li")
      .filter({ hasText: "Freeze control" })
      .getByRole("button", { name: "Rename" })
      .click();
    const phoneDialog = phone.getByRole("dialog", { name: "Rename build" });
    const phoneName = phoneDialog.getByLabel("Build name");
    await expect(phoneName).toHaveValue("Freeze control");
    await phoneName.fill("Phone plan");
    await expect(phoneName).toHaveValue("Phone plan");
    await phoneDialog.getByRole("button", { name: "Rename build" }).click();
    await expect(phone.locator(".save-feedback.conflict")).toBeVisible();

    const downloadPromise = phone.waitForEvent("download");
    await phone
      .locator(".save-feedback.conflict")
      .getByRole("button", { name: "Download pending JSON" })
      .click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    expect(
      JSON.parse(await readFile(downloadPath!, "utf8")).builds[0].name,
    ).toBe("Phone plan");

    phone.once("dialog", (dialog) => void dialog.accept());
    await phone
      .locator(".save-feedback.conflict")
      .getByRole("button", { name: "Reload" })
      .click();
    await expect(
      phone.getByText("Desktop plan", { exact: true }),
    ).toBeVisible();
    expect(persisted.builds[0]!.name).toBe("Desktop plan");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("supports keyboard-only card activation and visible focus", async ({
  page,
  browserName,
}) => {
  await page.goto("/__test/cards");
  const firstAction = page.locator(".card-action").first();
  await firstAction.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Selected" }),
  ).toContainText(
    (await firstAction.getAttribute("aria-label"))?.replace("Open ", "") ?? "",
  );

  // WebKit requires Option+Tab to include buttons in keyboard navigation.
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  const firstEnlarge = page.getByRole("button", { name: /Enlarge/ }).first();
  await expect(firstEnlarge).toBeFocused();
  await expect(firstEnlarge).toHaveCSS("outline-style", "solid");
});

test("uses instant level-up scrolling under reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const state = window as Window & {
      lastScrollBehavior?: ScrollBehavior;
    };
    const originalScrollTo = window.scrollTo.bind(window);
    window.scrollTo = ((x: number | ScrollToOptions, y?: number) => {
      if (typeof x === "object" && x !== null) {
        state.lastScrollBehavior = x.behavior ?? "auto";
      }
      if (typeof x === "number") {
        originalScrollTo(x, y ?? 0);
      } else {
        originalScrollTo(x);
      }
    }) as typeof window.scrollTo;
  });
  let persisted = structuredClone(levelUpFixtureData) as AppData;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      data: AppData;
    };
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/2/level-up`);
  await page.getByRole("button", { name: "Pick Birds in a Tempest" }).click();
  await expect(page.getByRole("heading", { name: "Your deck" })).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { lastScrollBehavior?: ScrollBehavior })
            .lastScrollBehavior,
      ),
    )
    .toBe("auto");
  expect(
    await page.evaluate(() => {
      const value = getComputedStyle(
        document.documentElement,
      ).transitionDuration;
      const duration = Number.parseFloat(value);
      return value.endsWith("ms") ? duration : duration * 1000;
    }),
  ).toBeLessThanOrEqual(0.01);
});

test("passes automated accessibility audits across the build workspace", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deckFixtureData),
    }),
  );
  const expectAccessible = async () => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  };

  await page.goto("/c/SD");
  await expect(page.getByText("Freeze control", { exact: true })).toBeVisible();
  await expectAccessible();

  await page.getByRole("button", { name: "Create build" }).click();
  const createDialog = page.getByRole("dialog", { name: "Create build" });
  await expect(createDialog).toBeVisible();
  await expectAccessible();
  await page.keyboard.press("Escape");

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/1`);
  await expect(
    page.getByRole("heading", { name: "Deck: Freeze control" }),
  ).toBeVisible();
  await expectAccessible();
  await page
    .getByRole("button", { name: /Enlarge/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectAccessible();
  await page.keyboard.press("Escape");

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2/level-up`);
  await expect(page.getByRole("heading", { name: "Level up" })).toBeVisible();
  await expectAccessible();

  await page.goto(`/c/SD/b/${fixtureBuildId}/overview`);
  await expect(
    page.getByRole("heading", { name: "Build overview" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Card note for Whiteout at level 2" })
    .focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expectAccessible();

  await page.goto(`/c/SD/b/${fixtureBuildId}/card/birds-in-a-tempest`);
  await expect(
    page.getByRole("heading", { name: "Card detail" }),
  ).toBeVisible();
  await expectAccessible();
});
