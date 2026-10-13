import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename as realRename,
  writeFile,
} from "node:fs/promises";
import type { PathLike } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/snowdancer-source.json";
import {
  createImportPlan,
  importCards,
  parseSourceRecords,
  validateCatalog,
} from "./import-cards";

const fixtureIcon = fileURLToPath(
  new URL("../docs/mockup/snowdancer-icon.png", import.meta.url),
);

function sourceRecord(overrides: Record<string, string> = {}) {
  return {
    name: "nature's breath",
    expansion: "Frosthaven",
    image: "character-ability-cards/frosthaven/SD/fh-natures-breath.jpeg",
    level: "1",
    initiative: "90",
    ...overrides,
  };
}

describe("Snowdancer source parsing", () => {
  it("filters to Snowdancer, keeps the card back, and derives stable card fields", () => {
    const parsed = parseSourceRecords(fixture);

    expect(parsed.back?.image).toBe(
      "character-ability-cards/frosthaven/SD/fh-sd-back.jpeg",
    );
    expect(parsed.cards).toEqual([
      {
        id: "natures-breath",
        name: "Nature's Breath",
        level: 1,
        initiative: 90,
        image: "SD/fh-natures-breath.jpeg",
        sourceImage:
          "character-ability-cards/frosthaven/SD/fh-natures-breath.jpeg",
      },
      {
        id: "the-endless-white",
        name: "The Endless White",
        level: 8,
        initiative: 5,
        image: "SD/fh-the-endless-white.jpeg",
        sourceImage:
          "character-ability-cards/frosthaven/SD/fh-the-endless-white.jpeg",
      },
    ]);
  });

  it("converts X levels and padded initiatives without changing the source slug", () => {
    const parsed = parseSourceRecords([
      sourceRecord({
        name: "the spirit's call",
        image: "character-ability-cards/frosthaven/SD/fh-the-spirits-call.jpeg",
        level: "X",
        initiative: "05",
      }),
    ]);

    expect(parsed.cards[0]).toMatchObject({
      id: "the-spirits-call",
      name: "The Spirit's Call",
      level: "X",
      initiative: 5,
    });
  });

  it.each([
    ["duplicate source slugs", [sourceRecord(), sourceRecord()]],
    [
      "duplicate display names",
      [
        sourceRecord(),
        sourceRecord({
          image:
            "character-ability-cards/frosthaven/SD/fh-natures-breath-copy.jpeg",
        }),
      ],
    ],
    [
      "unsafe image paths",
      [
        sourceRecord({
          image: "character-ability-cards/frosthaven/SD/../fh-card.jpeg",
        }),
      ],
    ],
    ["unsupported levels", [sourceRecord({ level: "10" })]],
    ["non-numeric initiatives", [sourceRecord({ initiative: "20/50" })]],
  ])("rejects %s", (_description, records) => {
    expect(() => parseSourceRecords(records)).toThrow();
  });
});

describe("Snowdancer import plan", () => {
  it("is deterministic and validates the complete catalog against the spec", () => {
    const first = createImportPlan(fixture, {
      requireCompleteCatalog: false,
      metadataChecksum: "metadata-checksum",
      sourceRevisions: {
        metadata: "metadata-revision",
        images: "image-revision",
      },
    });
    const second = createImportPlan([...fixture].reverse(), {
      requireCompleteCatalog: false,
      metadataChecksum: "metadata-checksum",
      sourceRevisions: {
        metadata: "metadata-revision",
        images: "image-revision",
      },
    });

    expect(JSON.stringify(first.character)).toBe(
      JSON.stringify(second.character),
    );
    expect(first.character).toEqual({
      id: "SD",
      name: "Snowdancer",
      handSize: 11,
      icon: "SD.png",
      cards: [
        {
          id: "natures-breath",
          name: "Nature's Breath",
          level: 1,
          initiative: 90,
          image: "SD/fh-natures-breath.jpeg",
        },
        {
          id: "the-endless-white",
          name: "The Endless White",
          level: 8,
          initiative: 5,
          image: "SD/fh-the-endless-white.jpeg",
        },
      ],
    });
  });

  it("rejects a catalog that does not exactly match the Snowdancer card list", () => {
    const plan = createImportPlan(fixture, {
      requireCompleteCatalog: false,
      metadataChecksum: "metadata-checksum",
      sourceRevisions: {
        metadata: "metadata-revision",
        images: "image-revision",
      },
    });

    expect(() => validateCatalog(plan.character.cards)).toThrow(
      /30 playable cards/,
    );
  });
});

describe("Snowdancer import transaction", () => {
  it("does not leave generated output when an asset download fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "frosthaven-import-"));

    await expect(
      importCards({
        projectRoot: root,
        iconSource: fixtureIcon,
        requireCompleteCatalog: false,
        sourceRevisions: {
          metadata: "metadata-revision",
          images: "image-revision",
        },
        fetchImpl: async (url) => {
          if (url.endsWith("frosthaven.json")) {
            return new Response(JSON.stringify(fixture), { status: 200 });
          }
          if (url.endsWith("fh-natures-breath.jpeg")) {
            return new Response("downloaded first asset", { status: 200 });
          }
          return new Response("not found", { status: 404 });
        },
      }),
    ).rejects.toThrow(/download/i);

    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("pins metadata and asset downloads to the recorded revisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "frosthaven-import-"));
    const requestedUrls: string[] = [];
    const image = new TextEncoder().encode("fixture image");
    const back = new TextEncoder().encode("fixture back");

    const result = await importCards({
      projectRoot: root,
      iconSource: fixtureIcon,
      requireCompleteCatalog: false,
      sourceRevisions: {
        metadata: "metadata-revision",
        images: "image-revision",
      },
      fetchImpl: async (url) => {
        requestedUrls.push(url);
        if (url.endsWith("frosthaven.json")) {
          return new Response(JSON.stringify(fixture), { status: 200 });
        }
        return new Response(url.endsWith("fh-sd-back.jpeg") ? back : image, {
          status: 200,
        });
      },
    });

    expect(requestedUrls).toContain(
      "https://raw.githubusercontent.com/cmlenius/gloomhaven-card-browser/metadata-revision/data/character-abilities/frosthaven.json",
    );
    expect(requestedUrls).toContain(
      "https://raw.githubusercontent.com/cmlenius/gloomhaven-card-browser/image-revision/images/character-ability-cards/frosthaven/SD/fh-natures-breath.jpeg",
    );
    expect(result.manifest.source.metadata.url).toContain(
      "/metadata-revision/",
    );
    expect(result.manifest.source.images.baseUrl).toContain("/image-revision/");
  });

  it("preserves the staging backups when rollback itself fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "frosthaven-import-"));
    const existingCatalog = join(root, "src/shared/data/characters/SD.json");
    await mkdir(join(root, "src/shared/data/characters"), { recursive: true });
    await writeFile(existingCatalog, "old catalog");
    let stagedInstalls = 0;
    const fileSystem = {
      rename: async (from: PathLike, to: PathLike) => {
        const fromPath = String(from);
        const toPath = String(to);
        if (
          fromPath.includes(".import-cards-") &&
          !toPath.includes(".backups")
        ) {
          stagedInstalls += 1;
          if (stagedInstalls === 2) {
            throw new Error("injected install failure");
          }
        }
        if (fromPath.includes(".backups") && toPath.endsWith("SD.json")) {
          throw new Error("injected restore failure");
        }
        return realRename(from, to);
      },
    };

    let failure: unknown;
    try {
      await importCards({
        projectRoot: root,
        iconSource: fixtureIcon,
        requireCompleteCatalog: false,
        sourceRevisions: {
          metadata: "metadata-revision",
          images: "image-revision",
        },
        fileSystem,
        fetchImpl: async (url) => {
          if (url.endsWith("frosthaven.json")) {
            return new Response(JSON.stringify(fixture), { status: 200 });
          }
          return new Response("fixture asset", { status: 200 });
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(
      /rollback incomplete.*staging directory/,
    );
    const remainingFiles = await readdir(root, { recursive: true });
    expect(remainingFiles.some((entry) => entry.includes(".backups"))).toBe(
      true,
    );
  });

  it("writes the catalog, local assets, manifest checksums, and index only after all downloads succeed", async () => {
    const root = await mkdtemp(join(tmpdir(), "frosthaven-import-"));
    const image = new TextEncoder().encode("fixture image");
    const back = new TextEncoder().encode("fixture back");

    await importCards({
      projectRoot: root,
      iconSource: fixtureIcon,
      requireCompleteCatalog: false,
      sourceRevisions: {
        metadata: "metadata-revision",
        images: "image-revision",
      },
      fetchImpl: async (url) => {
        if (url.endsWith("frosthaven.json")) {
          return new Response(JSON.stringify(fixture), { status: 200 });
        }
        return new Response(url.endsWith("fh-sd-back.jpeg") ? back : image, {
          status: 200,
        });
      },
    });

    await expect(
      readFile(join(root, "src/shared/data/characters/SD.json"), "utf8"),
    ).resolves.toContain('"handSize": 11');
    await expect(
      readFile(join(root, "public/cards/SD/fh-sd-back.jpeg")),
    ).resolves.toEqual(Buffer.from(back));
    await expect(
      readFile(join(root, "public/cards/SD/fh-natures-breath.jpeg")),
    ).resolves.toEqual(Buffer.from(image));
    await expect(
      readFile(
        join(root, "src/shared/data/characters/source-manifest.json"),
        "utf8",
      ),
    ).resolves.toContain('"metadata-revision"');
    await expect(
      readFile(join(root, "src/shared/data/characters/index.ts"), "utf8"),
    ).resolves.toContain("getCharacter");
  });
});
