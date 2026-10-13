import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as nodeFs from "node:fs/promises";
import { createApp } from "./app";
import {
  createDataStore,
  StorageError,
  type DataStoreFileSystem,
} from "./storage";
import { appDataSchema, type AppData } from "../shared/schema";

const timestamp = "2024-01-02T03:04:05.000Z";
const buildId = "123e4567-e89b-42d3-a456-426614174000";
const temporaryDirectories: string[] = [];

function dataWithName(name: string): AppData {
  return appDataSchema.parse({
    schemaVersion: 1,
    revision: 99,
    builds: [
      {
        id: buildId,
        characterId: "SD",
        name,
        startLevel: 1,
        startPicks: [],
        startDeck: [],
        levelUps: [],
        motivations: [],
        guidance: {},
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  });
}

async function newDataDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "frosthaven-api-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function put(
  app: ReturnType<typeof createApp>,
  baseRevision: number,
  data: AppData,
): Promise<Response> {
  return app.request("/api/data", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseRevision, data }),
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("revision-safe data API", () => {
  it("initializes missing storage and returns no-store data", async () => {
    const app = createApp({ dataDir: await newDataDir() });

    const response = await app.request("/api/data");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      schemaVersion: 1,
      revision: 0,
      builds: [],
    });
  });

  it("round-trips supported data while assigning the server revision", async () => {
    const app = createApp({ dataDir: await newDataDir() });
    const response = await put(app, 0, dataWithName("Freeze control"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 1 });

    const stored = await app.request("/api/data");
    expect((await stored.json()) as AppData).toMatchObject({
      revision: 1,
      builds: [{ name: "Freeze control", characterId: "SD" }],
    });
  });

  it("rejects malformed, oversized, and unsupported requests", async () => {
    const app = createApp({ dataDir: await newDataDir() });

    const malformed = await app.request("/api/data", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(malformed.status).toBe(400);

    const oversized = await app.request("/api/data", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "x".repeat(1_048_577),
    });
    expect(oversized.status).toBe(413);

    const unsupported = await put(
      app,
      0,
      appDataSchema.parse({
        ...dataWithName("Unsupported"),
        builds: [
          { ...dataWithName("Unsupported").builds[0], characterId: "NOPE" },
        ],
      }),
    );
    expect(unsupported.status).toBe(400);
  });

  it("allows game-invalid but structurally valid choices and detects stale writes", async () => {
    const app = createApp({ dataDir: await newDataDir() });
    const semanticallyInvalid = dataWithName("Unknown card");
    semanticallyInvalid.builds[0]!.startDeck = ["not-a-card"];

    expect((await put(app, 0, semanticallyInvalid)).status).toBe(200);
    const conflict = await put(app, 0, dataWithName("Stale"));

    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ revision: 1 });
  });

  it("serializes simultaneous writes with the same base revision", async () => {
    const app = createApp({ dataDir: await newDataDir() });

    const responses = await Promise.all([
      put(app, 0, dataWithName("First")),
      put(app, 0, dataWithName("Second")),
    ]);

    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(1);
    const stored = await app.request("/api/data");
    expect(await stored.json()).toMatchObject({ revision: 1 });
  });

  it("keeps exactly the 20 newest predecessor backups", async () => {
    const dataDir = await newDataDir();
    const app = createApp({ dataDir });

    for (let revision = 0; revision < 25; revision += 1) {
      expect(
        (await put(app, revision, dataWithName(`Build ${revision}`))).status,
      ).toBe(200);
    }

    const backups = await readdir(join(dataDir, "backups"));
    expect(backups).toHaveLength(20);
    expect(
      backups.every(
        (name) => name.startsWith("appdata-") && name.endsWith(".json"),
      ),
    ).toBe(true);

    const revisions = await Promise.all(
      backups.map(async (name) => {
        const saved = JSON.parse(
          await readFile(join(dataDir, "backups", name), "utf8"),
        ) as AppData;
        return saved.revision;
      }),
    );
    expect(revisions.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 5),
    );
  });

  it("does not turn corrupt storage into an empty document", async () => {
    const dataDir = await newDataDir();
    await writeFile(join(dataDir, "appdata.json"), "{broken", "utf8");
    const app = createApp({ dataDir });

    const response = await app.request("/api/data");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Stored data is unavailable",
    });
  });

  it("preserves the predecessor when a pre-replacement write fails", async () => {
    const dataDir = await newDataDir();
    const app = createApp({ dataDir });
    expect((await put(app, 0, dataWithName("Original"))).status).toBe(200);

    const failingFileSystem: DataStoreFileSystem = {
      ...nodeFs,
      writeFile: async (path, data, options) => {
        if (path.includes(".appdata.json.")) {
          throw new Error("simulated temp write failure");
        }
        return nodeFs.writeFile(path, data, options);
      },
    };
    const store = createDataStore({ dataDir, fs: failingFileSystem });

    await expect(
      store.put(1, dataWithName("Should not commit")),
    ).rejects.toBeInstanceOf(StorageError);
    expect(await store.get()).toMatchObject({
      revision: 1,
      builds: [{ name: "Original" }],
    });
  });

  it("reports uncertain durability after rename and rereads the committed revision", async () => {
    const dataDir = await newDataDir();
    let failDirectorySync = true;
    const failingFileSystem: DataStoreFileSystem = {
      ...nodeFs,
      open: async (path, flags) => {
        if (path === dataDir && failDirectorySync) {
          failDirectorySync = false;
          const error = new Error(
            "simulated directory fsync failure",
          ) as NodeJS.ErrnoException;
          error.code = "EIO";
          throw error;
        }
        return nodeFs.open(path, flags);
      },
    };
    const store = createDataStore({ dataDir, fs: failingFileSystem });

    await expect(store.put(0, dataWithName("Committed"))).rejects.toMatchObject(
      {
        uncertain: true,
      },
    );
    expect(await store.get()).toMatchObject({
      revision: 1,
      builds: [{ name: "Committed" }],
    });
  });

  it("serves frontend routes without masking API or asset 404s", async () => {
    const dataDir = await newDataDir();
    const staticDir = await newDataDir();
    await writeFile(
      join(staticDir, "index.html"),
      "<!doctype html><p>app</p>",
      "utf8",
    );
    await writeFile(
      join(staticDir, "asset.js"),
      "console.log('asset')",
      "utf8",
    );
    const app = createApp({ dataDir, staticDir });

    expect((await app.request("/build/one")).status).toBe(200);
    expect(await (await app.request("/build/one")).text()).toContain(
      "<p>app</p>",
    );
    expect((await app.request("/asset.js")).status).toBe(200);
    expect((await app.request("/missing.js")).status).toBe(404);
    expect((await app.request("/api/missing")).status).toBe(404);
  });
});
