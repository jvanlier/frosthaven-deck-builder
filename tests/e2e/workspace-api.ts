import type { Page } from "@playwright/test";

/** Ordinary successful saves; timing and failure scenarios keep their own routes. */
export async function mockWorkspaceApi<T extends { revision: number }>(
  page: Page,
  readData: () => T,
  writeData: (data: T) => void,
): Promise<void> {
  await page.route("**/api/data", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(readData()),
      });
      return;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    writeData({ ...body.data, revision: readData().revision + 1 });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ revision: readData().revision }),
    });
  });
}
