import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { characters, getCharacter } from "../../src/shared/data/characters";
import { createBuild } from "../../src/shared/builds";
import { replayBuild } from "../../src/shared/rules";
import type { AppData } from "../../src/shared/schema";

test("groups the picker into Frosthaven and Mercenary Pack", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({ json: { schemaVersion: 2, revision: 0, builds: [] } }),
  );
  await page.goto("/");
  const frosthaven = page.getByRole("region", {
    name: "Frosthaven",
    exact: true,
  });
  const mercenary = page.getByRole("region", {
    name: "Mercenary Pack",
    exact: true,
  });
  await expect(
    frosthaven.getByRole("heading", { name: "Frosthaven", level: 2 }),
  ).toBeVisible();
  await expect(
    mercenary.getByRole("heading", { name: "Mercenary Pack", level: 2 }),
  ).toBeVisible();
  await expect(frosthaven.locator(".character-choice")).toHaveCount(17);
  await expect(mercenary.locator(".character-choice strong")).toHaveText([
    "Anaphi",
    "Cassandra",
    "Hail",
    "Satha",
  ]);
  await expect(
    frosthaven.locator('.character-choice[href="/c/SD"]'),
  ).toHaveCount(1);
  await expect(
    mercenary.locator('.character-choice[href="/c/SD"]'),
  ).toHaveCount(0);
  const frosthavenNames = await frosthaven
    .locator(".character-choice strong")
    .allTextContents();
  expect(frosthavenNames).toEqual(
    [...frosthavenNames].sort((left, right) => left.localeCompare(right)),
  );
  await mercenary.locator('.character-choice[href="/c/HA"]').click();
  await expect(page).toHaveURL("/c/HA");
  await expect(
    page.getByRole("heading", { name: "Your builds" }),
  ).toBeVisible();
});

for (const character of characters) {
  test(`${character.name}: select character, open deck, view cards, and level up`, async ({
    page,
  }) => {
    const build = createBuild({
      characterId: character.id,
      name: "My plan",
      startLevel: 1,
    });
    const startingHand = character.cards
      .filter((card) => card.level === 1)
      .slice(0, character.handSize);
    build.startDeck = startingHand.map((card) => card.id);
    const other = createBuild({
      characterId: character.id === "SD" ? "BB" : "SD",
      name: "Other character's plan",
      startLevel: 1,
    });
    let persisted: AppData = {
      schemaVersion: 2,
      revision: 0,
      builds: [build, other],
    };
    await page.route("**/api/data", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: persisted });
      const body = route.request().postDataJSON() as { data: AppData };
      persisted = { ...body.data, revision: persisted.revision + 1 };
      return route.fulfill({ json: { revision: persisted.revision } });
    });

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Choose your character" }),
    ).toBeVisible();
    await expect(page.locator(".character-choice")).toHaveCount(
      characters.length,
    );
    await page.locator(`.character-choice[href="/c/${character.id}"]`).click();
    await expect(
      page.getByRole("heading", { name: "Your builds" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Other character's plan/ }),
    ).toHaveCount(0);
    await expect(page.locator(".brand img")).toHaveAttribute(
      "src",
      `/icons/${character.icon}`,
    );
    await page.getByRole("link", { name: /My plan Level/ }).click();
    await expect(page).toHaveURL(`/c/${character.id}/b/${build.id}/l/1`);
    await expect(page.locator(".deck-card-item")).toHaveCount(
      character.handSize,
    );
    const firstCard = startingHand[0]!;
    await page
      .getByRole("button", {
        name: `Open ${firstCard.name} details`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: firstCard.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`Level 1 · Initiative ${firstCard.initiative}`, {
        exact: !firstCard.form,
      }),
    ).toBeVisible();
    await expect(page.locator(".card-detail-image")).toHaveAttribute(
      "src",
      `/cards/${firstCard.image}`,
    );
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Build overview" }),
    ).toBeVisible();
    await expect(page.locator(".overview-matrix")).toContainText(
      firstCard.name,
    );
    await page.getByRole("link", { name: "Level up", exact: true }).click();
    await expect(page).toHaveURL(
      `/c/${character.id}/b/${build.id}/l/2/level-up`,
    );
    const pick = character.cards.find((card) => card.level === 2)!;
    await page
      .getByRole("button", { name: `Pick ${pick.name}`, exact: true })
      .click();
    await expect
      .poll(() => persisted.builds[0]!.levelUps[0]?.pick)
      .toBe(pick.id);
    const drop = startingHand.find((card) => card.form === pick.form)!;
    await page
      .getByRole("button", { name: `Drop ${drop.name}`, exact: true })
      .click();
    await expect
      .poll(() => replayBuild(persisted.builds[0]!, character).issues)
      .toEqual([]);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page).toHaveURL(`/c/${character.id}/b/${build.id}/l/2`);
    await expect(
      page.getByRole("button", {
        name: `Open ${pick.name} details`,
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Characters", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Choose your character" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: `Resume ${character.name} · My plan · Level 2`,
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("creates a build for the selected character and keeps the picker accessible", async ({
  page,
}) => {
  let persisted: AppData = { schemaVersion: 2, revision: 0, builds: [] };
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: persisted });
    persisted = {
      ...(route.request().postDataJSON() as { data: AppData }).data,
      revision: persisted.revision + 1,
    };
    return route.fulfill({ json: { revision: persisted.revision } });
  });
  await page.goto("/");
  await expect(page.locator(".character-choice")).toHaveCount(
    characters.length,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator('.character-choice[href="/c/BB"]').click();
  await page.getByRole("button", { name: "Create build", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create build" });
  await dialog.getByLabel("Build name").fill("Fast plan");
  await dialog
    .getByRole("button", { name: "Create build", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Starting deck: Fast plan" }),
  ).toBeVisible();
  for (const card of getCharacter("BB")!.cards.filter(
    (card) => card.level === 1,
  )) {
    await page
      .getByRole("button", {
        name: `Add ${card.name} to starting deck`,
        exact: true,
      })
      .click();
  }
  await expect.poll(() => persisted.builds[0]?.startDeck.length).toBe(10);
  expect(persisted.builds[0]!.characterId).toBe("BB");
  expect(replayBuild(persisted.builds[0]!, getCharacter("BB")!).issues).toEqual(
    [],
  );
});

for (const characterId of ["HV", "HA"]) {
  const character = getCharacter(characterId)!;
  test(`${character.name}: uses the local card back when artwork is missing`, async ({
    page,
  }) => {
    const card = character.cards.find(({ level }) => level === 1)!;
    const build = createBuild({
      characterId,
      name: character.name,
      startLevel: 1,
    });
    build.startDeck = [card.id];
    await page.route("**/api/data", (route) =>
      route.fulfill({
        json: { schemaVersion: 2, revision: 0, builds: [build] },
      }),
    );
    await page.route(`**/cards/${card.image}`, (route) =>
      route.fulfill({ status: 404, body: "missing" }),
    );
    await page.goto(`/c/${characterId}/b/${build.id}/l/1`);
    const image = page
      .getByRole("button", { name: `Open ${card.name} details`, exact: true })
      .locator("img");
    await expect(image).toHaveAttribute("src", `/cards/${character.cardBack}`);
    await expect
      .poll(() =>
        image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
  });
}

test("rejects builds belonging to a different character without modifying them", async ({
  page,
}) => {
  const build = createBuild({
    characterId: "SD",
    name: "Snow only",
    startLevel: 1,
  });
  const persisted: AppData = { schemaVersion: 2, revision: 0, builds: [build] };
  await page.route("**/api/data", (route) => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: persisted });
  });
  for (const suffix of [
    "l/1",
    "l/1/start",
    "l/2/level-up",
    "overview",
    "card/blizzard",
  ]) {
    await page.goto(`/c/BB/b/${build.id}/${suffix}`);
    await expect(page.locator("main")).toContainText(
      /unavailable|not available/,
    );
    await expect(page.locator(".level-switcher")).toHaveCount(0);
  }
  await page.goto("/c/unknown");
  await expect(
    page.getByRole("link", { name: "Choose a character", exact: true }),
  ).toBeVisible();
});
