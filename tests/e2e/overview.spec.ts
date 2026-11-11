import { expect, test } from "@playwright/test";
import {
  fixtureBuildId,
  startThreeFixtureData,
  overviewFixtureData,
  invalidDeckFixtureData,
} from "./fixtures";

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
