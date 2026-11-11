import { expect, test } from "@playwright/test";
import { fixtureData, startThreeFixtureData } from "./fixtures";

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
