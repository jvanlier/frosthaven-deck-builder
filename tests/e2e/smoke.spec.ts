import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { AppData } from "../../src/shared/schema";

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
      guidance: {
        "cold-therapy": {
          text: "Use early.\nPair with Snowball.",
          updatedAt: "2024-01-02T03:04:05.000Z",
        },
      },
      motivations: [
        {
          level: 2,
          cardId: "birds-in-a-tempest",
          kind: "add",
          text: "The best level-up pick.",
          updatedAt: "2024-01-02T03:04:05.000Z",
        },
        {
          level: 2,
          cardId: "whiteout",
          kind: "drop",
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
      guidance: {
        blizzard: {
          text: "Keep this guidance.",
          updatedAt: "2024-01-02T03:04:05.000Z",
        },
      },
      motivations: [
        {
          level: 1,
          cardId: "tornado",
          kind: "exclude",
          text: "Keep this unrelated note.",
          updatedAt: "2024-01-02T03:04:05.000Z",
        },
      ],
    },
  ],
};

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
    page.getByRole("heading", { name: "Newly unlocked" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Birds in a Tempest" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pick Birds in a Tempest" }).click();
  await expect(page.getByText("12 / 11 cards", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Drop Blizzard" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Drop Blizzard" }).click();
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

test("moves focus to the deck after picking from an enlarged card", async ({
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
  await dialog.getByRole("button", { name: "Pick Birds in a Tempest" }).click();
  await expect(dialog).toBeHidden();
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
  await page.getByLabel("Why add Tornado?").fill("Temporary note");
  await expect.poll(() => firstPutStarted).toBe(true);
  await page.getByRole("button", { name: "Reset" }).click();
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
      guidance: resetDuringSaveFixtureData.builds[0].guidance,
      motivations: resetDuringSaveFixtureData.builds[0].motivations,
    });
});

test("keeps extra swaps open, notes stable and new cards undroppable", async ({
  page,
}) => {
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
    "Birds in a Tempest",
  ]);
  const swapSection = page.getByText("Swap more cards from the pool");
  await swapSection.click();
  const whiteout = page.getByRole("button", {
    name: "Add White Winds to deck",
  });
  await whiteout.click();
  await expect(page.getByLabel("Why add White Winds?")).toBeVisible();
  await page
    .getByLabel("Why add White Winds?")
    .fill("Bring it back for control.");
  await page
    .getByRole("button", { name: "Remove White Winds from deck" })
    .click();
  await page.getByRole("button", { name: "Add White Winds to deck" }).click();
  await expect(page.getByLabel("Why add White Winds?")).toHaveValue(
    "Bring it back for control.",
  );
  await expect(
    page.getByRole("button", { name: "Keep White Winds new" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Drop Birds in a Tempest" }),
  ).toHaveCount(0);
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
  await expect(persisted.builds[0]?.motivations).toEqual([
    {
      level: 2,
      cardId: "white-winds",
      kind: "add",
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
  await expect(page.getByRole("button", { name: "Done" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Level up" })).toBeVisible();
  await expect(page.getByText("Pick a card for level 2")).toBeVisible();

  await page.getByRole("button", { name: "Pick Birds in a Tempest" }).click();
  await page.getByText("Swap more cards from the pool").click();
  await page.getByRole("button", { name: "Add White Winds to deck" }).click();
  await page.getByLabel("Why add White Winds?").fill("Temporary note");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("Pick a card for level 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Done" })).toBeDisabled();
  await expect
    .poll(async () => persisted.builds[0]?.levelUps[0])
    .toMatchObject({ pick: null, added: [], dropped: [] });
  await expect(persisted.builds[0]?.motivations).toEqual([]);
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

  await page.getByRole("link", { name: "2", exact: true }).click();
  await page.getByRole("link", { name: "Edit this level" }).click();
  await page.getByRole("link", { name: "Level up" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${levelUpBuildId}/l/3/level-up`);
  await page.getByRole("button", { name: "Pick Cold Snap" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
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

  await firstEnlarge.click();
  await dialog.getByRole("button", { name: firstLabel! }).click();
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
    page
      .getByRole("navigation", { name: "Previous and next deck levels" })
      .getByText("Level 1", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Deck: Freeze control" }),
  ).toBeVisible();
  await expect(page.getByText("0 / 11 cards", { exact: true })).toBeVisible();
  await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
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

test("shows overview membership, applied markers, swap counts and note navigation", async ({
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
  expect(
    await page
      .locator(".overview-summary-row td")
      .evaluateAll((cells) =>
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

  const motivationLink = page.getByRole("link", {
    name: "Open Whiteout drop motivation",
  });
  await motivationLink.evaluate((link) =>
    link.scrollIntoView({ block: "center", inline: "center" }),
  );
  await motivationLink.click();
  await expect(page).toHaveURL(
    `/c/SD/b/${fixtureBuildId}/motivations?level=2&cardId=whiteout&kind=drop`,
  );
  await expect(
    page.getByLabel("Motivation for Dropped: Whiteout"),
  ).toBeFocused();
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

test("shows sorted cards, changes, guidance and read-only card detail", async ({
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

  await expect(
    page.getByRole("heading", { name: "Deck: Freeze control" }),
  ).toBeVisible();
  const deckCardNames = page.locator(".deck-card-list .card-name");
  await expect(deckCardNames).toHaveText([
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
    "Birds in a Tempest",
  ]);
  await expect(page.getByText("11 / 11 cards", { exact: true })).toBeVisible();
  await expect(page.getByText("Level 2 changes")).toBeVisible();
  await expect(page.getByText("Picked: Birds in a Tempest")).toBeVisible();
  await expect(page.getByText("Dropped: Whiteout")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Whiteout details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enlarge Whiteout" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Show guidance" }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Show guidance" }).check();
  await expect(page.getByText("Use early.")).toBeVisible();
  await expect(page.getByText("Pair with Snowball.")).toBeVisible();

  await page
    .getByRole("button", { name: "Open Birds in a Tempest details" })
    .click();
  await expect(page).toHaveURL(
    `/c/SD/b/${fixtureBuildId}/l/2/card/birds-in-a-tempest`,
  );
  await expect(
    page.getByRole("heading", { name: "Card detail" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Birds in a Tempest" }),
  ).toBeVisible();
  await expect(page.getByText("The best level-up pick.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to level 2 deck" }),
  ).toBeVisible();
});

test("renders invalid badges and specific replay validation messages", async ({
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
  await expect(page.getByText("Invalid", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Invalid", { exact: true })).toBeVisible();
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

test("deletes only the highest level and its motivations", async ({ page }) => {
  let persisted = structuredClone(plannedLaterFixtureData) as AppData;
  persisted.builds[0]!.motivations = [
    {
      level: 2,
      cardId: "birds-in-a-tempest",
      kind: "add",
      text: "Keep this note",
      updatedAt: "2024-01-02T03:04:05.000Z",
    },
    {
      level: 3,
      cardId: "tornado",
      kind: "drop",
      text: "Delete this note",
      updatedAt: "2024-01-02T03:04:05.000Z",
    },
  ];
  persisted.builds[0]!.guidance = {
    tornado: {
      text: "Keep this guidance",
      updatedAt: "2024-01-02T03:04:05.000Z",
    },
  };
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
      motivations: [
        {
          level: 2,
          cardId: "birds-in-a-tempest",
          text: "Keep this note",
        },
      ],
      guidance: {
        tornado: {
          text: "Keep this guidance",
        },
      },
    });
});

test("focuses the selected starting-pick repair", async ({ page }) => {
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
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Edit starting choices" })
    .nth(1)
    .click();
  await expect(page).toHaveURL(/focus=3$/);
  await expect(
    page.locator('[data-pick-level="3"] .card-action').first(),
  ).toBeFocused();
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

test("switches between stored levels with previous, next and direct navigation", async ({
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
  await page.getByRole("link", { name: "Next level (2)" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/2`);
  await page.getByRole("link", { name: "1", exact: true }).click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/1`);
  await page.getByRole("link", { name: "Next level (2)" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/2`);
  await page.getByRole("link", { name: "Previous level (1)" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/1`);
});

test("resumes the last valid deck position and safely falls back for invalid storage", async ({
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
  await page.getByRole("link", { name: "Back to builds" }).click();
  await expect(page).toHaveURL(`/c/SD`);

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);
  await expect(page).toHaveURL(/\/l\/2$/);
  await expect(
    page.evaluate((key) => localStorage.getItem(key), lastPositionStorageKey),
  ).resolves.toBe(
    JSON.stringify({ characterId: "SD", buildId: fixtureBuildId, level: 2 }),
  );

  await page.goto("/");
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
    page.getByRole("heading", { name: "Your builds" }),
  ).toBeVisible();
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
    page.getByRole("heading", { name: "Your builds" }),
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
    page.getByRole("heading", { name: "Your builds" }),
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

test("keeps saving feedback below a populated mobile header while scrolling", async ({
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
  await page.getByRole("button", { name: "Trigger pending save" }).click();
  const feedback = page.locator(".save-feedback");
  await expect(feedback).toHaveText("Saving…");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(async () => (await feedback.boundingBox())?.y ?? -1)
    .toBeGreaterThanOrEqual(
      (await page.locator(".app-header").boundingBox())!.height - 1,
    );
  releasePut();
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
  await page.getByRole("link", { name: "9", exact: true }).waitFor();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await expect(
    page.getByRole("link", { name: "9", exact: true }),
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

  await page.goto("/");
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
  await expect(page.getByText("9 / 11 cards")).toBeVisible();
  await expect
    .poll(async () => persisted.builds[0]?.startDeck.length ?? 0, {
      timeout: 5_000,
    })
    .toBe(9);
  await page.reload();
  await expect(page.getByText("9 / 11 cards")).toBeVisible();

  for (const name of ["Snowball", "Whiteout"]) {
    await page
      .getByRole("button", { name: `Add ${name} to starting deck` })
      .click();
  }
  await expect(page.getByText("11 / 11 cards")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Blinding Vortex to starting deck" }),
  ).toBeDisabled();

  await expect
    .poll(async () => persisted.builds[0]?.startDeck.length ?? 0, {
      timeout: 5_000,
    })
    .toBe(11);
  await page.reload();
  await expect(page.getByText("11 / 11 cards")).toBeVisible();
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

  await page.goto("/");
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
  await page.getByRole("link", { name: "Back to builds" }).click();
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

  await page.goto("/");
  await page.locator("li").getByRole("button", { name: "Copy" }).click();
  const copyDialog = page.getByRole("dialog", { name: "Copy build" });
  await copyDialog.getByLabel("Build name").fill("Higher copy");
  await copyDialog.getByRole("button", { name: "Copy build" }).click();
  await expect(
    page.getByRole("heading", { name: "Starting deck: Higher copy" }),
  ).toBeVisible();
  await expect(page.locator(".pick-section")).toHaveCount(2);
  await expect(page.getByText("Picked: Birds in a Tempest")).toBeVisible();
  await expect(
    page.locator(".pick-section").nth(1).getByRole("status"),
  ).toHaveText("Picked");
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

  await page.goto("/");
  await page.getByRole("button", { name: "Create build" }).click();
  const createDialog = page.getByRole("dialog", { name: "Create build" });
  await createDialog.getByLabel("Build name").fill("Pending build");
  await createDialog.getByRole("button", { name: "Create build" }).click();
  await page.getByRole("link", { name: "Back to builds" }).click();
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

test("preserves a later starting pick while surfacing an earlier conflict", async ({
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
    .locator(".pick-section")
    .first()
    .getByRole("button", { name: "Change pick" })
    .click();
  await page.getByRole("button", { name: "Pick Tornado" }).click();
  await expect(page.locator(".pick-section").nth(1)).toContainText("Picked");
  await expect(page.locator(".pick-section").nth(1)).toContainText("Tornado");
  await expect(page.getByText("is already in the pool")).toBeVisible();
  await expect
    .poll(async () => {
      const build = persisted.builds[0];
      return [build?.startPicks[0]?.cardId, build?.startPicks[1]?.cardId];
    })
    .toEqual(["tornado", "tornado"]);
});

test("offers sequential legal picks for a higher starting level", async ({
  page,
}) => {
  let persisted: {
    schemaVersion: 1;
    revision: number;
    builds: Array<{ startPicks: Array<{ cardId: string | null }> }>;
  } = { schemaVersion: 1, revision: 0, builds: [] };
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
  await page.goto("/");
  await page.getByRole("button", { name: "Create build" }).click();
  const dialog = page.getByRole("dialog", { name: "Create build" });
  await dialog.getByLabel("Build name").fill("Prosperity three");
  await dialog.getByLabel("Start level").selectOption("3");
  await dialog.getByRole("button", { name: "Create build" }).click();

  await expect(
    page.getByRole("heading", { name: "Level 2 pick" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Birds in a Tempest" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Tornado" }),
  ).toBeVisible();
  await page.getByText("Not in starting deck (18)").click();
  await expect(page.getByText("Cold Snap", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pick Birds in a Tempest" }).click();
  await expect
    .poll(async () =>
      persisted.builds[0]?.startPicks.map((pick) => pick.cardId),
    )
    .toEqual(["birds-in-a-tempest", null]);
  await page.reload();
  await expect(page.locator(".pick-section").first()).toContainText(
    "Picked: Birds in a Tempest",
  );
  await expect(
    page.getByRole("heading", { name: "Level 3 pick" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Tornado" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Cold Snap" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Polar Vortex" }),
  ).toBeVisible();
});

test("edits motivations and guidance from the notes and card detail views", async ({
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
  await page.getByRole("link", { name: "Notes" }).click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/motivations`);
  await expect(
    page.getByRole("heading", { name: "Build motivations" }),
  ).toBeVisible();
  const addMotivation = page.getByLabel(
    "Motivation for Added: Birds in a Tempest",
  );
  await expect(addMotivation).toHaveValue("The best level-up pick.");
  await addMotivation.fill("<script>alert(1)</script>\nPrefer the top action.");
  await expect
    .poll(async () => persisted.builds[0]?.motivations)
    .toContainEqual(
      expect.objectContaining({
        cardId: "birds-in-a-tempest",
        kind: "add",
        text: "<script>alert(1)</script>\nPrefer the top action.",
      }),
    );
  const dropMotivation = page.getByLabel("Motivation for Dropped: Whiteout");
  const originalDropTimestamp = persisted.builds[0]!.motivations.find(
    (motivation) =>
      motivation.cardId === "whiteout" && motivation.kind === "drop",
  )!.updatedAt;
  await dropMotivation.fill("Updated drop reason");
  await expect
    .poll(async () =>
      persisted.builds[0]?.motivations.find(
        (motivation) =>
          motivation.cardId === "whiteout" && motivation.kind === "drop",
      ),
    )
    .toMatchObject({ text: "Updated drop reason" });
  expect(
    persisted.builds[0]!.motivations.find(
      (motivation) =>
        motivation.cardId === "whiteout" && motivation.kind === "drop",
    )!.updatedAt,
  ).not.toBe(originalDropTimestamp);
  await dropMotivation.fill("");
  await expect
    .poll(async () =>
      persisted.builds[0]?.motivations.some(
        (motivation) =>
          motivation.cardId === "whiteout" && motivation.kind === "drop",
      ),
    )
    .toBe(false);

  await page.getByRole("link", { name: "Back to level 2 deck" }).click();
  const deckChangeMotivation = page.getByLabel(
    "Motivation for Birds in a Tempest",
  );
  await deckChangeMotivation.fill("Deck change reason");
  await expect
    .poll(
      async () =>
        persisted.builds[0]?.motivations.find(
          (motivation) =>
            motivation.cardId === "birds-in-a-tempest" &&
            motivation.kind === "add",
        )?.text,
    )
    .toBe("Deck change reason");
  await page
    .getByRole("button", { name: "Open Birds in a Tempest details" })
    .click();
  const cardDetailMotivation = page.getByLabel(
    "Motivation for Birds in a Tempest (Add motivation)",
  );
  await cardDetailMotivation.fill("Card detail reason");
  await expect
    .poll(
      async () =>
        persisted.builds[0]?.motivations.find(
          (motivation) =>
            motivation.cardId === "birds-in-a-tempest" &&
            motivation.kind === "add",
        )?.text,
    )
    .toBe("Card detail reason");
  const guidance = page.getByLabel("Guidance for Birds in a Tempest");
  await guidance.fill("<b>Top</b>\nPair with Cold Therapy.");
  await expect
    .poll(async () => persisted.builds[0]?.guidance["birds-in-a-tempest"]?.text)
    .toBe("<b>Top</b>\nPair with Cold Therapy.");
  await expect(
    page.getByText("<b>Top</b>\nPair with Cold Therapy."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to level 2 deck" }).click();
  await page.getByRole("checkbox", { name: "Show guidance" }).check();
  await expect(
    page
      .locator(".guidance-note .plain-text")
      .filter({ hasText: "<b>Top</b>\nPair with Cold Therapy." }),
  ).toBeVisible();
  await expect(page.locator(".guidance-note b")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open Birds in a Tempest details" })
    .click();
  await page.reload();
  await expect(guidance).toHaveValue("<b>Top</b>\nPair with Cold Therapy.");
  await expect(cardDetailMotivation).toHaveValue("Card detail reason");

  await page
    .getByRole("link", { name: "Frosthaven Deck Builder builds" })
    .click();
  await page
    .locator("li")
    .filter({ hasText: "Freeze control" })
    .getByRole("button", { name: "Copy" })
    .click();
  const copyDialog = page.getByRole("dialog", { name: "Copy build" });
  await copyDialog.getByLabel("Build name").fill("Independent guidance copy");
  await copyDialog.getByRole("button", { name: "Copy build" }).click();
  await expect
    .poll(() =>
      persisted.builds.find(
        (build) => build.name === "Independent guidance copy",
      ),
    )
    .toBeDefined();
  const copiedBuild = persisted.builds.find(
    (build) => build.name === "Independent guidance copy",
  )!;
  await page.goto(`/c/SD/b/${copiedBuild.id}/l/2/card/birds-in-a-tempest`);
  const copiedGuidance = page.getByLabel("Guidance for Birds in a Tempest");
  await expect(copiedGuidance).toHaveValue(
    "<b>Top</b>\nPair with Cold Therapy.",
  );
  await copiedGuidance.fill("Copy-only guidance");
  await expect
    .poll(
      async () =>
        persisted.builds.find((build) => build.id === copiedBuild.id)?.guidance[
          "birds-in-a-tempest"
        ]?.text,
    )
    .toBe("Copy-only guidance");
  expect(
    persisted.builds.find((build) => build.id === fixtureBuildId)?.guidance[
      "birds-in-a-tempest"
    ]?.text,
  ).toBe("<b>Top</b>\nPair with Cold Therapy.");
});

test("edits starting exclusion and initial-pick motivations", async ({
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
  await page.getByText(/Not in starting deck/).click();
  const exclusion = page.getByLabel("Why exclude Cold Snap?");
  await exclusion.fill("Not for this build.");
  await expect
    .poll(async () => persisted.builds[0]?.motivations)
    .toContainEqual(
      expect.objectContaining({
        level: 3,
        cardId: "cold-snap",
        kind: "exclude",
        text: "Not for this build.",
      }),
    );

  await page.getByRole("button", { name: "Change pick" }).first().click();
  await expect(page.getByLabel("Why add Birds in a Tempest?")).toBeVisible();
  await page.getByLabel("Why add Birds in a Tempest?").fill("Slot two reason");
  await expect
    .poll(async () => persisted.builds[0]?.motivations)
    .toContainEqual(
      expect.objectContaining({
        level: 3,
        cardId: "birds-in-a-tempest",
        kind: "add",
        text: "Slot two reason",
      }),
    );
});

test("hides and restores a motivation without deleting its stored note", async ({
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

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/1/start`);
  await page
    .getByRole("button", { name: "Remove Whiteout from starting deck" })
    .click();
  await expect
    .poll(() => persisted.builds[0]?.startDeck)
    .not.toContain("whiteout");
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);
  await expect(
    page
      .locator(".change-list p.plain-text")
      .filter({ hasText: "The weakest initiative." }),
  ).toHaveCount(0);
  expect(persisted.builds[0]?.motivations).toContainEqual(
    expect.objectContaining({ cardId: "whiteout", kind: "drop" }),
  );

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/1/start`);
  await page
    .getByRole("button", { name: "Add Whiteout to starting deck" })
    .click();
  await expect.poll(() => persisted.builds[0]?.startDeck).toContain("whiteout");
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);
  await expect(
    page
      .locator(".change-list p.plain-text")
      .filter({ hasText: "The weakest initiative." }),
  ).toBeVisible();
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

    await page.goto(`/c/SD/b/${fixtureBuildId}/l/2/card/birds-in-a-tempest`);
    await page
      .getByLabel("Guidance for Birds in a Tempest")
      .fill("Pending note");
    await expect(page.getByRole("alert")).toContainText(
      response === 409 ? "Changed on another device" : "Error saving",
    );
    await expect(
      page.getByLabel("Guidance for Birds in a Tempest"),
    ).toBeDisabled();
    await expect(
      page.getByLabel("Motivation for Birds in a Tempest (Add motivation)"),
    ).toBeDisabled();
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
  await createButton.click();
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
    await desktopDialog.getByLabel("Build name").fill("Desktop plan");
    await desktopDialog.getByRole("button", { name: "Rename build" }).click();
    await expect.poll(() => persisted.builds[0]!.name).toBe("Desktop plan");

    await phone
      .locator("li")
      .filter({ hasText: "Freeze control" })
      .getByRole("button", { name: "Rename" })
      .click();
    const phoneDialog = phone.getByRole("dialog", { name: "Rename build" });
    await phoneDialog.getByLabel("Build name").fill("Phone plan");
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
