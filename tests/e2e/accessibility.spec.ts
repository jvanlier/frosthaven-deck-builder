import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { AppData } from "../../src/shared/schema";
import {
  fixtureBuildId,
  deckFixtureData,
  levelUpBuildId,
  levelUpFixtureData,
} from "./fixtures";

test("keeps card actions separate from enlarge and provides an image fallback", async ({
  page,
  browserName,
}) => {
  await page.goto("/__test/cards");

  const firstAction = page.locator(".card-action").first();
  const firstLabel = await firstAction.getAttribute("aria-label");
  await firstAction.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Selected" }),
  ).toContainText(firstLabel?.replace("Open ", "") ?? "");

  const firstEnlarge = page.getByRole("button", { name: /Enlarge/ }).first();
  await firstEnlarge.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  // WebKit requires Option+Tab to include buttons in keyboard navigation.
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(firstEnlarge).toBeFocused();

  await firstEnlarge.click();
  await expect(dialog.getByRole("button")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(firstEnlarge).toBeFocused();

  const fallbackImage = page
    .locator(".card-tile")
    .nth(1)
    .locator("img")
    .first();
  await expect(fallbackImage).toHaveAttribute("src", /fh-sd-back\.jpeg/);

  const pausedCard = page.locator(".card-tile").nth(2);
  await expect(pausedCard.getByRole("status")).toHaveText("Paused");
  await expect(pausedCard.locator(".card-action")).toBeDisabled();
  await pausedCard.getByRole("button", { name: /Enlarge/ }).click();
  const pausedDialog = page.getByRole("dialog");
  await expect(pausedDialog.getByRole("button")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Toggle paused card" })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(pausedDialog.getByRole("button")).toHaveCount(1);
  await pausedDialog
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(pausedDialog).toBeHidden();
  await expect(
    pausedCard.getByRole("button", { name: /Enlarge/ }),
  ).toBeFocused();
});

test("supports keyboard-only card activation and visible focus", async ({
  page,
  browserName,
}) => {
  await page.goto("/__test/cards");
  const firstAction = page.locator(".card-action").first();
  await firstAction.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Selected" }),
  ).toContainText(
    (await firstAction.getAttribute("aria-label"))?.replace("Open ", "") ?? "",
  );

  // WebKit requires Option+Tab to include buttons in keyboard navigation.
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  const firstEnlarge = page.getByRole("button", { name: /Enlarge/ }).first();
  await expect(firstEnlarge).toBeFocused();
  await expect(firstEnlarge).toHaveCSS("outline-style", "solid");
});

test("uses instant level-up scrolling under reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const state = window as Window & {
      lastScrollBehavior?: ScrollBehavior;
    };
    const originalScrollTo = window.scrollTo.bind(window);
    window.scrollTo = ((x: number | ScrollToOptions, y?: number) => {
      if (typeof x === "object" && x !== null) {
        state.lastScrollBehavior = x.behavior ?? "auto";
      }
      if (typeof x === "number") {
        originalScrollTo(x, y ?? 0);
      } else {
        originalScrollTo(x);
      }
    }) as typeof window.scrollTo;
  });
  let persisted = structuredClone(levelUpFixtureData) as AppData;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      data: AppData;
    };
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto(`/c/SD/b/${levelUpBuildId}/l/2/level-up`);
  await page.getByRole("button", { name: "Pick Birds in a Tempest" }).click();
  await expect(page.getByRole("heading", { name: "Your deck" })).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { lastScrollBehavior?: ScrollBehavior })
            .lastScrollBehavior,
      ),
    )
    .toBe("auto");
  expect(
    await page.evaluate(() => {
      const value = getComputedStyle(
        document.documentElement,
      ).transitionDuration;
      const duration = Number.parseFloat(value);
      return value.endsWith("ms") ? duration : duration * 1000;
    }),
  ).toBeLessThanOrEqual(0.01);
});

test("passes automated accessibility audits across the build workspace", async ({
  page,
}) => {
  await page.route("**/api/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deckFixtureData),
    }),
  );
  const expectAccessible = async () => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  };

  await page.goto("/c/SD");
  await expect(page.getByText("Freeze control", { exact: true })).toBeVisible();
  await expectAccessible();

  await page.getByRole("button", { name: "Create build" }).click();
  const createDialog = page.getByRole("dialog", { name: "Create build" });
  await expect(createDialog).toBeVisible();
  await expectAccessible();
  await page.keyboard.press("Escape");

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/1`);
  await expect(
    page.getByRole("heading", { name: "Deck: Freeze control" }),
  ).toBeVisible();
  await expectAccessible();
  await page
    .getByRole("button", { name: /Enlarge/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectAccessible();
  await page.keyboard.press("Escape");

  await page.goto(`/c/SD/b/${fixtureBuildId}/l/2/level-up`);
  await expect(page.getByRole("heading", { name: "Level up" })).toBeVisible();
  await expectAccessible();

  await page.goto(`/c/SD/b/${fixtureBuildId}/overview`);
  await expect(
    page.getByRole("heading", { name: "Build overview" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Card note for Whiteout at level 2" })
    .focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expectAccessible();

  await page.goto(`/c/SD/b/${fixtureBuildId}/card/birds-in-a-tempest`);
  await expect(
    page.getByRole("heading", { name: "Card detail" }),
  ).toBeVisible();
  await expectAccessible();
});
