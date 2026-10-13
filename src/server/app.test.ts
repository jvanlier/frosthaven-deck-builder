import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("health app", () => {
  it("returns a healthy response", async () => {
    const response = await createApp().request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
