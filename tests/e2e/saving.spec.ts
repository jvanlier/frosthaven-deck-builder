import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { AppData } from "../../src/shared/schema";
import { fixtureBuildId, fixtureData, fullFixtureData } from "./fixtures";

test("keeps saving feedback subtle without shifting content while scrolling", async ({
  page,
}) => {
  let releasePut!: () => void;
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fullFixtureData),
      });
      return;
    }
    await new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: 1 }),
    });
  });
  await page.goto(`/c/SD/b/${fixtureBuildId}/l/9/__test/save-feedback`);
  const content = page.locator(".page-content");
  const contentTop = (await content.boundingBox())!.y;
  await page.getByRole("button", { name: "Trigger pending save" }).click();
  const feedback = page.locator(".save-feedback");
  await expect(feedback).toHaveText("Saving…");
  await expect(feedback).toHaveCSS("position", "fixed");
  await expect(feedback).toHaveCSS("background-color", "rgb(17, 26, 46)");
  const feedbackBox = (await feedback.boundingBox())!;
  expect(feedbackBox.width).toBeLessThan(160);
  expect(feedbackBox.y + feedbackBox.height).toBeLessThan(
    (await page.locator(".bottom-tabs").boundingBox())!.y,
  );
  expect((await content.boundingBox())!.y).toBe(contentTop);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(async () => (await feedback.boundingBox())?.y ?? -1)
    .toBeGreaterThanOrEqual(
      (await page.locator(".app-header").boundingBox())!.height - 1,
    );
  releasePut();
  await expect(feedback).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect((await content.boundingBox())!.y).toBe(contentTop);
});

test("keeps error and conflict feedback below the mobile header", async ({
  page,
}) => {
  for (const [name, response] of [
    ["error", { status: 503, body: "unavailable" }],
    ["conflict", { status: 409, body: JSON.stringify({ revision: 1 }) }],
  ] as const) {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.route("**/api/data", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fullFixtureData),
        });
        return;
      }
      await route.fulfill({ status: response.status, body: response.body });
    });
    await page.goto(`/c/SD/b/${fixtureBuildId}/l/9/__test/save-feedback`);
    await page.getByRole("button", { name: "Trigger pending save" }).click();
    const feedback = page.locator(`.save-feedback.${name}`);
    await expect(feedback).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(async () => (await feedback.boundingBox())?.y ?? -1)
      .toBeGreaterThanOrEqual(
        (await page.locator(".app-header").boundingBox())!.height - 1,
      );
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("offers retry after an initial load failure", async ({ page }) => {
  let failed = false;
  await page.route("**/api/data", (route) => {
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 503, body: "unavailable" });
    }
    return route.continue();
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your workspace is unavailable" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your character" }),
  ).toBeVisible();
});

test("preserves pending changes through a two-device conflict and explicit reload", async ({
  browser,
}) => {
  let persisted = structuredClone(fixtureData) as AppData;
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const phoneContext = await browser.newContext({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
  });
  const contexts = [desktopContext, phoneContext];

  try {
    for (const context of contexts) {
      await context.route("**/api/data", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(persisted),
          });
          return;
        }
        const body = JSON.parse(route.request().postData() ?? "{}") as {
          baseRevision: number;
          data: AppData;
        };
        if (body.baseRevision !== persisted.revision) {
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ revision: persisted.revision }),
          });
          return;
        }
        persisted = { ...body.data, revision: persisted.revision + 1 };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ revision: persisted.revision }),
        });
      });
    }

    const desktop = await desktopContext.newPage();
    const phone = await phoneContext.newPage();
    await phone.goto("/c/SD");
    await desktop.goto("/c/SD");

    await desktop
      .locator("li")
      .filter({ hasText: "Freeze control" })
      .getByRole("button", { name: "Rename" })
      .click();
    const desktopDialog = desktop.getByRole("dialog", { name: "Rename build" });
    const desktopName = desktopDialog.getByLabel("Build name");
    await expect(desktopName).toHaveValue("Freeze control");
    await desktopName.fill("Desktop plan");
    await expect(desktopName).toHaveValue("Desktop plan");
    await desktopDialog.getByRole("button", { name: "Rename build" }).click();
    await expect.poll(() => persisted.builds[0]!.name).toBe("Desktop plan");

    await phone
      .locator("li")
      .filter({ hasText: "Freeze control" })
      .getByRole("button", { name: "Rename" })
      .click();
    const phoneDialog = phone.getByRole("dialog", { name: "Rename build" });
    const phoneName = phoneDialog.getByLabel("Build name");
    await expect(phoneName).toHaveValue("Freeze control");
    await phoneName.fill("Phone plan");
    await expect(phoneName).toHaveValue("Phone plan");
    await phoneDialog.getByRole("button", { name: "Rename build" }).click();
    await expect(phone.locator(".save-feedback.conflict")).toBeVisible();

    const downloadPromise = phone.waitForEvent("download");
    await phone
      .locator(".save-feedback.conflict")
      .getByRole("button", { name: "Download pending JSON" })
      .click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    expect(
      JSON.parse(await readFile(downloadPath!, "utf8")).builds[0].name,
    ).toBe("Phone plan");

    phone.once("dialog", (dialog) => void dialog.accept());
    await phone
      .locator(".save-feedback.conflict")
      .getByRole("button", { name: "Reload" })
      .click();
    await expect(
      phone.getByText("Desktop plan", { exact: true }),
    ).toBeVisible();
    expect(persisted.builds[0]!.name).toBe("Desktop plan");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
