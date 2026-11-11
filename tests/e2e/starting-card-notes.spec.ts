import { expect, test } from "@playwright/test";
import { mockWorkspaceApi } from "./workspace-api";
import type { AppData } from "../../src/shared/schema";
import {
  fixtureBuildId,
  fixtureData,
  startThreeFixtureData,
  deckFixtureData,
} from "./fixtures";

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
  await mockWorkspaceApi(
    page,
    () => persisted,
    (data) => {
      persisted = data;
    },
  );

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
