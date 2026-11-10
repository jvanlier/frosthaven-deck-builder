import { expect, test } from "@playwright/test";
import type { AppData } from "../../src/shared/schema";
import {
  fixtureBuildId,
  fixtureData,
  deckFixtureData,
  invalidDeckFixtureData,
  levelUpBuildId,
  revisedLevelFixtureData,
} from "./fixtures";

for (const view of ["starting", "deck"] as const) {
  test(`keeps ${view} issues below the header while scrolling`, async ({
    page,
  }) => {
    await page.route("**/api/data", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          view === "starting" ? fixtureData : invalidDeckFixtureData,
        ),
      }),
    );
    await page.goto(
      `/c/SD/b/${fixtureBuildId}/l/${view === "starting" ? "1/start" : "2"}`,
    );
    const bar = page.locator(
      view === "starting" ? ".starting-hand-status" : ".deck-issues",
    );
    await expect(bar).toBeVisible();
    if (view === "starting") {
      await expect
        .poll(() =>
          bar.evaluate((element) =>
            Math.abs(
              element.getBoundingClientRect().top -
                Number.parseFloat(getComputedStyle(element).top),
            ),
          ),
        )
        .toBeLessThan(2);
    }
    await bar.evaluate((element) => {
      window.scrollTo(
        0,
        window.scrollY + element.getBoundingClientRect().top + 200,
      );
    });
    await expect
      .poll(async () =>
        bar.evaluate((element) => {
          const top = Number.parseFloat(getComputedStyle(element).top);
          return Math.abs(element.getBoundingClientRect().top - top);
        }),
      )
      .toBeLessThan(2);
    if (view === "deck") {
      await expect(bar.getByRole("button").first()).toBeVisible();
      await expect(
        bar.getByRole("button", { name: /^Edit level/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Edit this level" }),
      ).toBeAttached();
    } else {
      await expect(bar).toContainText("0 / 11 cards");
      await bar.evaluate((element) => {
        const zoom = document.querySelectorAll(
          ".starting-hand .enlarge-button",
        )[4]!;
        const targetY = element.getBoundingClientRect().top + 20;
        window.scrollBy(0, zoom.getBoundingClientRect().top + 18 - targetY);
      });
      const barCoversZoom = await bar.evaluate((element) => {
        const zoom = document.querySelectorAll(
          ".starting-hand .enlarge-button",
        )[4]!;
        const box = zoom.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          ),
        );
      });
      expect(barCoversZoom).toBe(true);
      await bar.getByRole("button", { name: "Done", exact: true }).click();
      await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/1`);
      await expect(
        page.getByText("0 / 11 cards", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .locator(".deck-issues")
          .getByRole("button", { name: /^Edit level/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Edit starting deck" }),
      ).toBeVisible();
    }
  });
}

test("keeps starting cards in place when the deck becomes incomplete", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        route.request().method() === "GET" ? deckFixtureData : { revision: 1 },
      ),
    }),
  );
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/1/start`);
  const status = page.getByRole("list", { name: "Starting build status" });
  await expect(status).toContainText("11 / 11 cards");
  const done = page.getByRole("button", { name: "Done", exact: true });
  await expect(done).toBeEnabled();
  const grid = page.locator(".starting-hand > .card-grid");
  const barRight = await page
    .locator(".starting-hand-status")
    .evaluate((element) => element.getBoundingClientRect().right);
  const cardsRight = await grid
    .locator(".card-tile")
    .evaluateAll((cards) =>
      Math.max(...cards.map((card) => card.getBoundingClientRect().right)),
    );
  expect(Math.abs(barRight - cardsRight)).toBeLessThan(2);
  const gridTop = () =>
    grid.evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
  const initialTop = await gridTop();
  await page
    .getByRole("button", {
      name: "Remove Cold Therapy from starting deck",
      exact: true,
    })
    .click();
  await expect(status).toContainText("10 / 11 cards");
  await expect(done).toBeEnabled();
  expect(Math.abs((await gridTop()) - initialTop)).toBeLessThan(2);
  await page
    .getByRole("button", {
      name: "Add Cold Therapy to starting deck",
      exact: true,
    })
    .click();
  await expect(status).toContainText("11 / 11 cards");
  expect(Math.abs((await gridTop()) - initialTop)).toBeLessThan(2);
  await done.click();
  await expect(page).toHaveURL(`/c/SD/b/${fixtureBuildId}/l/1`);
  await expect(
    page.getByRole("heading", { name: "Deck: Freeze control" }),
  ).toBeAttached();
});

test("matches the compact image-first mockup on desktop and phone", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({ json: revisedLevelFixtureData }),
  );
  for (const width of [1280, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/c/SD/b/${levelUpBuildId}/l/2/level-up`);
    const candidate = page.locator(".level-up-candidate").first();
    const card = candidate.locator(".card-action");
    const image = card.locator("img");
    const cardBox = (await card.boundingBox())!;
    const imageBox = (await image.boundingBox())!;
    expect(Math.abs(cardBox.height - imageBox.height)).toBeLessThan(3);
    if (width > 520) expect(cardBox.width).toBe(220);
    await expect(page.locator(".level-up-picks .level-up-group")).toHaveCount(
      1,
    );
    await expect(
      page.getByRole("heading", { name: "Available cards" }),
    ).toBeVisible();
    const zoomBox = (await candidate.locator(".enlarge-button").boundingBox())!;
    expect(zoomBox.y).toBeLessThan(cardBox.y + 16);
    expect(zoomBox.x + zoomBox.width).toBeLessThanOrEqual(
      cardBox.x + cardBox.width,
    );
    // Card notes sit below the card on an opaque panel, never over the art.
    await expect(candidate.locator(".card-note-input")).toHaveCSS(
      "background-color",
      "rgb(22, 34, 56)",
    );
    await expect(candidate.locator("textarea")).toHaveCSS(
      "background-color",
      "rgb(11, 18, 32)",
    );
    const noteBox = (await candidate
      .locator(".card-note-input")
      .boundingBox())!;
    expect(noteBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
    await expect(page.locator(".bottom-tabs").getByRole("link")).toHaveCount(3);
    expect(
      await page
        .locator(".app-header")
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeLessThan(125);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.goto(`/c/SD/b/${levelUpBuildId}/l/2`);
    const deckCards = page.locator(".deck-card-list .card-action");
    const deckCardBox = (await deckCards.first().boundingBox())!;
    expect(deckCardBox.width).toBe(cardBox.width);
    if (width <= 520) {
      expect((await deckCards.nth(1).boundingBox())!.y).toBe(deckCardBox.y);
      expect((await deckCards.nth(2).boundingBox())!.y).toBeGreaterThan(
        deckCardBox.y,
      );
    }
  }
});

test("places deck issue badges beside each other when there is room", async ({
  page,
}) => {
  const data = structuredClone(deckFixtureData) as AppData;
  data.builds[0]!.levelUps = [
    {
      level: 2,
      pick: null,
      added: ["white-winds"],
      dropped: [],
    },
  ];
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.setViewportSize({ width: 1240, height: 900 });
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2`);
  const badges = page.locator(".repair-list li > span");
  await expect(badges).toHaveCount(2);
  const first = await badges.nth(0).boundingBox();
  const second = await badges.nth(1).boundingBox();
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
  expect(second!.x).toBeGreaterThanOrEqual(first!.x + first!.width);
  const badgeAppearance = (elements: Element[]) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        text: element.textContent?.trim(),
        color: style.color,
        background: style.backgroundColor,
        padding: style.padding,
        borderRadius: style.borderRadius,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      };
    });
  const viewBadges = await badges.evaluateAll(badgeAppearance);
  await page.getByRole("link", { name: "Edit this level" }).click();
  const editBadges = page.locator(".level-up-instruction, .level-up-counter");
  await expect(editBadges).toHaveCount(2);
  expect(await editBadges.evaluateAll(badgeAppearance)).toEqual(viewBadges);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
});

test("marks incomplete and invalid levels amber in the header", async ({
  page,
}) => {
  const data = structuredClone(deckFixtureData) as AppData;
  data.builds[0]!.levelUps.push(
    { level: 3, pick: null, added: [], dropped: [] },
    {
      level: 4,
      pick: "polar-vortex",
      added: ["polar-vortex", "unknown-card"],
      dropped: ["snowball"],
    },
  );
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/3`);
  const nav = page.getByRole("navigation", { name: "Level navigation" });
  for (const level of [1, 2]) {
    await expect(
      nav.getByRole("link", { name: `Level ${level}`, exact: true }),
    ).not.toHaveAttribute("data-needs-attention");
  }
  for (const level of [3, 4]) {
    const link = nav.getByRole("link", { name: `Level ${level}`, exact: true });
    await expect(link).toHaveAttribute("data-needs-attention", "true");
    await expect(link).toHaveAccessibleDescription(
      `Level ${level} needs attention`,
    );
  }
  const selected = nav.getByRole("link", { name: "Level 3", exact: true });
  await expect(selected).toHaveAttribute("aria-current", "page");
  await expect(selected).toHaveCSS("background-color", "rgb(251, 191, 36)");
  await expect(
    nav.getByRole("link", { name: "Level 4", exact: true }),
  ).toHaveCSS("color", "rgb(251, 191, 36)");
  await nav.getByRole("link", { name: "Level 2", exact: true }).click();
  await expect(
    nav.getByRole("link", { name: "Level 2", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(selected).toHaveCSS("color", "rgb(251, 191, 36)");
});

test("sorts Your deck and the deck view by descending level with X last", async ({
  page,
}) => {
  const data = structuredClone(deckFixtureData) as AppData;
  data.builds[0]!.levelUps.push({
    level: 3,
    pick: "polar-vortex",
    added: ["polar-vortex", "white-winds"],
    dropped: [],
  });
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/3/level-up`);
  await expect(
    page.locator(".level-up-deck .card-action img").first(),
  ).toBeVisible();
  const levels = await page
    .locator(".level-up-deck .card-action img")
    .evaluateAll((images) =>
      images.map((image) => image.getAttribute("alt")!.split("level ")[1]!),
    );
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".deck-card-list .card-action img")).toHaveCount(
    levels.length,
  );
  const viewLevels = await page
    .locator(".deck-card-list .card-action img")
    .evaluateAll((images) =>
      images.map((image) => image.getAttribute("alt")!.split("level ")[1]!),
    );
  expect(viewLevels).toEqual(levels);
  expect(levels).toEqual(expect.arrayContaining(["3", "2", "1", "X"]));
  expect(levels).toEqual(
    [...levels].sort(
      (left, right) =>
        (right === "X" ? 0 : Number(right)) - (left === "X" ? 0 : Number(left)),
    ),
  );
});

test("styles level-up pick badges as centered pills in view and edit", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({ json: deckFixtureData }),
  );
  for (const route of ["2", "2/level-up"]) {
    await page.goto(`/c/SD/b/${fixtureBuildId}/l/${route}`);
    const badge = page
      .locator('.card-tile[data-card-id="birds-in-a-tempest"] .card-state')
      .first();
    await expect(badge).toHaveText("Level 2 pick");
    await expect(badge).toHaveCSS("top", "-11px");
    await expect(badge).toHaveCSS("border-radius", "99px");
    await expect(badge).toHaveCSS("font-size", "12px");
    await expect(badge).toHaveCSS("color", "rgb(3, 17, 31)");
    await expect(badge).toHaveCSS("background-color", "rgb(125, 211, 252)");
    const offset = await badge.evaluate((element) => {
      const badge = element.getBoundingClientRect();
      const card = element.closest(".card-tile")!.getBoundingClientRect();
      return Math.abs(badge.x + badge.width / 2 - card.x - card.width / 2);
    });
    expect(offset).toBeLessThan(2);
  }
});

test("shares content width across starting and level-up views and editors", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deckFixtureData),
    }),
  );
  for (const width of [390, 900, 1240]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = [];
    for (const [route, selector] of [
      ["1", ".deck-intro"],
      ["1/start", ".starting-hand-status"],
      ["2", ".deck-intro"],
      ["2/level-up", ".level-up-status"],
    ]) {
      await page.goto(`/c/SD/b/${fixtureBuildId}/l/${route}`);
      const section = page.locator(selector!);
      await expect(section).toBeVisible();
      if (route === "2/level-up") {
        const available = await page.locator(".level-up-picks").boundingBox();
        const deck = await page.locator(".level-up-hand").boundingBox();
        expect(deck!.y).toBeGreaterThanOrEqual(
          available!.y + available!.height,
        );
        expect(Math.abs(deck!.x - available!.x)).toBeLessThan(2);
        expect(Math.abs(deck!.width - available!.width)).toBeLessThan(2);
      }
      bounds.push(
        await section.evaluate((element) => {
          const { left, right } = element.getBoundingClientRect();
          return { left, right };
        }),
      );
    }
    for (const bound of bounds.slice(1)) {
      expect(Math.abs(bound.left - bounds[0]!.left)).toBeLessThan(2);
      expect(Math.abs(bound.right - bounds[0]!.right)).toBeLessThan(2);
    }
  }
});
