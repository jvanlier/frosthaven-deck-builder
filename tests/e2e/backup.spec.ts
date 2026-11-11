import { expect, test } from "@playwright/test";
import type { AppData } from "../../src/shared/schema";
import { fixtureData } from "./fixtures";

test("exports acknowledged data and replaces it only after import confirmation", async ({
  page,
}) => {
  let persisted = structuredClone(fixtureData) as AppData;
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
      baseRevision: number;
      data: AppData;
    };
    expect(body.baseRevision).toBe(persisted.revision);
    persisted = { ...body.data, revision: persisted.revision + 1 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: persisted.revision }),
    });
  });

  await page.goto("/");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "frosthaven-deck-builder-backup.json",
  );

  const imported = structuredClone(fixtureData) as AppData;
  imported.revision = 999;
  imported.builds[0]!.name = "Imported plan";
  const input = page.getByLabel("Import JSON backup");
  await input.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  const dialog = page.getByRole("dialog", { name: "Replace saved data?" });
  await expect(dialog).toContainText("1 build");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(persisted.builds[0]!.name).toBe("Freeze control");

  await input.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page
    .getByRole("dialog", { name: "Replace saved data?" })
    .getByRole("button", { name: "Replace data" })
    .click();
  await expect.poll(() => persisted.builds[0]!.name).toBe("Imported plan");
});

test("keeps import failure and conflict recovery controls usable", async ({
  page,
}) => {
  let persisted = structuredClone(fixtureData) as AppData;
  let response: "failure" | "conflict" | "success" = "failure";
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
    if (response === "failure") {
      response = "success";
      await route.fulfill({ status: 503, body: "unavailable" });
      return;
    }
    if (response === "conflict") {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ revision: persisted.revision + 1 }),
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

  await page.goto("/");
  const input = page.getByLabel("Import JSON backup");
  const failedImport = structuredClone(fixtureData) as AppData;
  failedImport.builds[0]!.name = "Retried plan";
  await input.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(failedImport)),
  });
  await page
    .getByRole("dialog", { name: "Replace saved data?" })
    .getByRole("button", { name: "Replace data" })
    .click();
  await expect(page.locator(".save-feedback.error")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Replace saved data?" }),
  ).toBeHidden();
  await page
    .locator(".save-feedback.error")
    .getByRole("button", { name: "Retry" })
    .click();
  await expect.poll(() => persisted.builds[0]!.name).toBe("Retried plan");

  response = "conflict";
  await page.reload();
  const conflictedImport = structuredClone(fixtureData) as AppData;
  conflictedImport.builds[0]!.name = "Conflicted plan";
  await page.getByLabel("Import JSON backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(conflictedImport)),
  });
  await page
    .getByRole("dialog", { name: "Replace saved data?" })
    .getByRole("button", { name: "Replace data" })
    .click();
  await expect(page.locator(".save-feedback.conflict")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Replace saved data?" }),
  ).toBeHidden();
  await expect(
    page.locator(".save-feedback.conflict").getByRole("button", {
      name: "Download pending JSON",
    }),
  ).toBeVisible();
});

test("rejects malformed and oversized imports without changing live data", async ({
  page,
}) => {
  let persisted = structuredClone(fixtureData) as AppData;
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(persisted),
      });
      return;
    }
    throw new Error("Invalid imports must not reach the save API");
  });

  await page.goto("/");
  const input = page.getByLabel("Import JSON backup");
  await input.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("not json"),
  });
  await expect(page.getByRole("alert")).toHaveText(
    "The backup file is not valid JSON.",
  );
  await input.setInputFiles({
    name: "oversized.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(1_048_577, 120),
  });
  await expect(page.getByRole("alert")).toHaveText(
    "The backup file must be at most 1 MiB.",
  );
  expect(persisted).toEqual(fixtureData);
});
