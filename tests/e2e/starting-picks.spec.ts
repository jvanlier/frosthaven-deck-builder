import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createBuild } from "../../src/shared/builds";
import type { AppData } from "../../src/shared/schema";

test("builds a level-seven hand from highest picks down, including lower-level choices", async ({
  page,
}) => {
  let persisted: AppData = {
    schemaVersion: 2,
    revision: 0,
    builds: [
      createBuild({ characterId: "SD", name: "Top down", startLevel: 7 }),
    ],
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
  const path = `/c/SD/b/${persisted.builds[0]!.id}/l/7/start`;
  await page.goto(path);
  const statusBar = page.locator(".starting-setup-status");
  const pickBadge = statusBar.getByText("0 / 6 level-up cards picked", {
    exact: true,
  });
  await expect(pickBadge).toHaveAttribute("data-tone", "incomplete");
  await expect(pickBadge).toHaveCSS("color", "rgb(251, 191, 36)");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(
    page.getByRole("heading", { name: "Level 7 pick" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next pick", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Pick Freezing Storm", exact: true })
    .click();
  await expect
    .poll(() => persisted.builds[0]!.startDeck)
    .toEqual(["freezing-storm"]);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page).toHaveURL(path.replace("/start", ""));
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Level 6 pick", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Level 7 pick, complete", exact: true })
    .click();
  await page
    .getByLabel("Card note for Freezing Storm")
    .fill("Keep this reason if I change my mind.");
  await page
    .getByRole("button", { name: "Unpick Freezing Storm", exact: true })
    .click();
  await expect.poll(() => persisted.builds[0]!.startDeck).toEqual([]);
  await page
    .getByRole("button", { name: "Pick Freezing Storm", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pick Storm Wall", exact: true })
    .click();
  await expect
    .poll(() => persisted.builds[0]!.startDeck)
    .toEqual(["storm-wall"]);
  const picked = page
    .locator(".level-up-candidate")
    .filter({ has: page.locator('.card-tile[data-card-id="storm-wall"]') });
  await expect(picked.getByLabel("Card note for Storm Wall")).toBeVisible();
  // The card's note follows it from picked to excluded.
  const rejected = page.getByLabel("Card note for Freezing Storm");
  await expect(rejected).toHaveValue("Keep this reason if I change my mind.");
  await rejected.fill("Storm Wall defines this build.");
  await expect(page.getByLabel("Card note for Frozen Brand")).toBeVisible();
  const deferred = page.locator('.card-tile[data-card-id="frozen-brand"]');
  await expect(deferred.locator(".card-action img")).toHaveCSS(
    "filter",
    "grayscale(1)",
  );
  await expect(deferred.locator(".card-action")).toBeEnabled();
  const cardBox = (await picked.locator(".card-action").boundingBox())!;
  const noteBox = (await picked.locator(".card-note-input").boundingBox())!;
  expect(noteBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
  await expect
    .poll(() => persisted.builds[0]!.cardNotes)
    .toContainEqual(
      expect.objectContaining({
        cardId: "freezing-storm",
        text: "Storm Wall defines this build.",
      }),
    );
  expect(
    persisted.builds[0]!.cardNotes.filter(
      (note) => note.cardId === "freezing-storm",
    ),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Next pick", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Level 6 pick" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Freezing Storm", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Pick Refreshing Flurry", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pick Shifting Snow", exact: true })
    .click();
  await expect(page.getByLabel("Card note for Shifting Snow")).toBeVisible();
  await expect(page.getByLabel("Card note for Frozen Brand")).toBeVisible();
  await expect(
    page.getByLabel("Card note for Refreshing Flurry"),
  ).toBeVisible();
  await expect(page.getByLabel("Card note for Whipping Gale")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Next pick", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Level 5 pick" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Whipping Gale", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Frozen Brand", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pick Refreshing Flurry", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Pick Cold Snap", exact: true })
    .click();
  await page.getByRole("button", { name: "Next pick", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Level 4 pick" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Whipping Gale", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pick Polar Vortex", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pick Biting Frost", exact: true })
    .click();
  await expect
    .poll(() => persisted.builds[0]!.startPicks[2]!.cardId)
    .toBe("biting-frost");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Level 3 pick" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pick Cold Snap", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Pick Polar Vortex", exact: true })
    .click();
  await page.getByRole("button", { name: "Next pick", exact: true }).click();
  await page.getByRole("button", { name: "Pick Tornado", exact: true }).click();
  await page
    .getByRole("button", { name: "Build starting hand", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Complement your picks · Level 7 hand" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeEnabled();
  await expect.poll(() => persisted.builds[0]!.startDeck.length).toBe(6);
  await expect(
    page.getByText("Build your starting hand", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".starting-hand-status")).toHaveCount(1);
  await expect(
    statusBar.getByText("6 / 6 level-up cards picked", { exact: true }),
  ).toHaveAttribute("data-tone", "complete");
  await expect(
    statusBar.getByText("6 / 6 level-up cards picked", { exact: true }),
  ).toHaveCSS("color", "rgb(74, 222, 128)");
  await expect(statusBar).toContainText("6 / 11 cards");
  const disclosure = page.locator(".starting-pick-summary");
  await expect(disclosure.locator("summary")).toHaveText("Level-up card picks");
  await expect(disclosure).toHaveCSS("border-top-width", "1px");
  const listBox = (await disclosure.locator("ul").boundingBox())!;
  const disclosureBox = (await disclosure.boundingBox())!;
  expect(listBox.x).toBeGreaterThan(disclosureBox.x + 12);
  await disclosure.locator("summary").click();
  await expect(
    disclosure.getByRole("button", {
      name: "Change level 2 pick",
      exact: true,
    }),
  ).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Complement your picks · Level 7 hand" }),
  ).toBeVisible();
  await disclosure.locator("summary").click();
  await expect(
    statusBar.getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight / 2),
  );
  await expect
    .poll(async () => {
      const bar = (await statusBar.boundingBox())!;
      const header = (await page.locator(".app-header").boundingBox())!;
      return Math.abs(bar.y - (header.y + header.height + 12));
    })
    .toBeLessThan(2);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page).toHaveURL(path.replace("/start", ""));
  await page.goto(path);
  await expect(page.getByLabel("Card note for Freezing Storm")).toHaveValue(
    "Storm Wall defines this build.",
  );
  await expect(
    page.locator('[data-issue-code="START_CARD_NOT_IN_POOL"]'),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator('[data-issue-code="START_CARD_NOT_IN_POOL"]'),
  ).toHaveCount(0);
  for (const name of [
    "Cold Therapy",
    "Whiteout",
    "Snowball",
    "Lifting Gust",
    "Chilling Impact",
  ]) {
    await page
      .getByRole("button", {
        name: `Add ${name} to starting deck`,
        exact: true,
      })
      .click();
  }
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "Remove Storm Wall from starting deck",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByLabel("Card note for Storm Wall")
    .fill("The build's main card.");
  await page
    .getByRole("button", {
      name: "Change level 7 pick for Storm Wall",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Level 7 pick", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unpick Storm Wall", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Card note for Storm Wall")).toHaveValue(
    "The build's main card.",
  );
  await expect.poll(() => persisted.builds[0]!.startDeck.length).toBe(11);
  await page
    .getByRole("button", { name: "Return to hand", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", {
      name: "Remove Cold Therapy from starting deck",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", {
      name: "Add Cold Therapy to starting deck",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "Change level 7 pick for Storm Wall",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Pick Freezing Storm", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Return to hand", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Change level 7 pick for Freezing Storm",
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() => persisted.builds[0]!.startDeck)
    .toEqual(
      expect.arrayContaining([
        "freezing-storm",
        "cold-therapy",
        "whiteout",
        "snowball",
        "lifting-gust",
        "chilling-impact",
      ]),
    );
  expect(persisted.builds[0]!.startDeck).not.toContain("storm-wall");
  await page
    .getByRole("button", {
      name: "Change level 7 pick for Freezing Storm",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Pick Cold Snap", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Return to hand", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Next pick", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Level 5 pick", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("no longer available");
  await expect
    .poll(() => persisted.builds[0]!.startPicks[5]!.cardId)
    .toBe("cold-snap");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page).toHaveURL(path.replace("/start", ""));
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Level 5 pick", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("no longer available");
  await page
    .getByRole("button", { name: "Pick Whipping Gale", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Build starting hand", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeEnabled();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page).toHaveURL(path.replace("/start", ""));
});
