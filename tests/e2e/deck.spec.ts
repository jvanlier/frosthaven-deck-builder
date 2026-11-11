import { expect, test } from "@playwright/test";
import { mockWorkspaceApi } from "./workspace-api";
import type { AppData } from "../../src/shared/schema";
import {
  fixtureBuildId,
  fixtureData,
  startThreeFixtureData,
  overviewFixtureData,
  invalidDeckFixtureData,
  levelUpBuildId,
  plannedLaterFixtureData,
  invalidEditedLevelFixtureData,
} from "./fixtures";

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
  await mockWorkspaceApi(
    page,
    () => persisted,
    (data) => {
      persisted = data;
    },
  );

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
  await mockWorkspaceApi(
    page,
    () => persisted,
    (data) => {
      persisted = data;
    },
  );

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);
  await page
    .getByRole("button", { name: "Restore Birds in a Tempest to deck" })
    .click();
  await expect
    .poll(async () => persisted.builds[0]?.levelUps[0])
    .toMatchObject({ added: ["birds-in-a-tempest"] });
  await expect(page.getByText("Invalid", { exact: true })).toHaveCount(0);
});
