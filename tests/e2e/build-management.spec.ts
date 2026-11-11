import { expect, test } from "@playwright/test";
import { fixtureData, startThreeFixtureData } from "./fixtures";

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
