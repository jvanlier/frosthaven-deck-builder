import { expect, test } from "@playwright/test";
import { mockWorkspaceApi } from "./workspace-api";
import type { AppData } from "../../src/shared/schema";
import { fixtureBuildId, deckFixtureData } from "./fixtures";

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

test("edits card notes only in editors and shows them read-only elsewhere", async ({
  page,
}) => {
  let persisted = structuredClone(deckFixtureData) as AppData;
  await mockWorkspaceApi(
    page,
    () => persisted,
    (data) => {
      persisted = data;
    },
  );

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
