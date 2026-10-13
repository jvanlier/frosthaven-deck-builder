import { expect, test } from "@playwright/test";

test("loads the deck builder shell and health status", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Frosthaven Deck Builder" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Server healthy");
});
