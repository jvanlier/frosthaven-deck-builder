import { expect, test } from "@playwright/test";

test("loads the deck builder shell and health status", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Frosthaven Deck Builder" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Server healthy");
});

test("keeps card actions separate from enlarge and provides an image fallback", async ({
  page,
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
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(firstEnlarge).toBeFocused();

  const fallbackImage = page
    .locator(".card-tile")
    .nth(1)
    .locator("img")
    .first();
  await expect(fallbackImage).toHaveAttribute("src", /fh-sd-back\.jpeg/);
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
