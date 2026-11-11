import { expect, test } from "@playwright/test";
import { mockWorkspaceApi } from "./workspace-api";
import type { AppData } from "../../src/shared/schema";
import {
  fixtureBuildId,
  fullFixtureData,
  deckFixtureData,
  invalidDeckFixtureData,
  levelUpBuildId,
  levelUpFixtureData,
  revisedLevelFixtureData,
  plannedLaterFixtureData,
  invalidEditedLevelFixtureData,
  resetDuringSaveFixtureData,
} from "./fixtures";

test("runs a level-up pick, drop and done through the stored editor", async ({
  page,
}) => {
  let persisted = structuredClone(levelUpFixtureData);
  await mockWorkspaceApi(
    page,
    () => persisted,
    (data) => {
      persisted = data;
    },
  );

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
  await mockWorkspaceApi(
    page,
    () => persisted,
    (data) => {
      persisted = data;
    },
  );

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
  await mockWorkspaceApi(
    page,
    () => persisted,
    (data) => {
      persisted = data;
    },
  );

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
  await mockWorkspaceApi(
    page,
    () => persisted,
    (data) => {
      persisted = data;
    },
  );

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
  await mockWorkspaceApi(
    page,
    () => persisted,
    (data) => {
      persisted = data;
    },
  );

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
  await mockWorkspaceApi(
    page,
    () => persisted,
    (data) => {
      persisted = data;
    },
  );

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
  await mockWorkspaceApi(
    page,
    () => persisted,
    (data) => {
      persisted = data;
    },
  );

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
  await mockWorkspaceApi(
    page,
    () => persisted,
    (data) => {
      persisted = data;
    },
  );

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
