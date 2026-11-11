import { expect, test } from "@playwright/test";
import { fixtureBuildId, fixtureData } from "./fixtures";

test("loads local class icons in the picker and build header", async ({
  page,
}) => {
  let releaseData!: () => void;
  const loading = new Promise<void>((resolve) => {
    releaseData = resolve;
  });
  await page.route("**/api/data", async (route) => {
    await loading;
    await route.fulfill({ json: fixtureData });
  });
  await page.goto("/");
  await expect(page.getByText("Loading your deck workspace…")).toBeVisible();
  releaseData();
  const pickerIcon = page.locator('.character-choice[href="/c/SD"] img');
  await expect(pickerIcon).toHaveAttribute("src", "/icons/SD.png");
  await expect
    .poll(() =>
      pickerIcon.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/1`);
  const headerIcon = page.locator(".brand img");
  await expect(headerIcon).toHaveAttribute("src", "/icons/SD.png");
  await expect
    .poll(() =>
      headerIcon.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
});

test("loads the deck builder shell and health status", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Frosthaven Deck Builder" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Server healthy");
});

test("fits the compact layout and exposes attribution", async ({ page }) => {
  await page.goto("/__test/cards");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));

  await page.goto("/about");
  await expect(
    page.getByRole("heading", { name: "Local, personal deck planning" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Attribution" }),
  ).toBeVisible();
});
