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
import mercenaryFixture from "./fixtures/mercenary-source.json";
import { frosthavenCharacters, mercenaryCharacters } from "./characters";
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

describe("other character imports", () => {
  it("filters a class catalog and preserves Blinkblade's fast/slow initiatives", () => {
    const character = frosthavenCharacters.find(({ id }) => id === "BB")!;
    const plan = createImportPlan(
      [
        ...fixture.filter((record) => record.image.includes("/SD/")),
        sourceRecord({
          name: "blurry jab",
          image: "character-ability-cards/frosthaven/BB/fh-blurry-jab.jpeg",
          initiative: "20/50",
        }),
        sourceRecord({
          name: "bb-back",
          image: "character-ability-cards/frosthaven/BB/fh-bb-back.jpeg",
          level: "-",
          initiative: "-",
        }),
      ],
      {
        character,
        metadataChecksum: "checksum",
        sourceRevisions: { metadata: "metadata", images: "images" },
        requireCompleteCatalog: false,
      },
    );
    expect(plan.character).toMatchObject({
      id: "BB",
      name: "Blinkblade",
      handSize: 10,
      icon: "BB.png",
    });
    expect(plan.character.cards).toEqual([
      {
        id: "blurry-jab",
        name: "Blurry Jab",
        level: 1,
        initiative: "20/50",
        image: "BB/fh-blurry-jab.jpeg",
      },
    ]);
    expect(plan.back.outputPath).toBe("fh-bb-back.jpeg");
  });

  it("rejects malformed dual initiatives and unsafe paths for other classes", () => {
    const character = frosthavenCharacters.find(({ id }) => id === "BB")!;
    const invalidOverrides: Record<string, string>[] = [
      { initiative: "20/50/80" },
      { image: "character-ability-cards/frosthaven/BB/../fh-blurry-jab.jpeg" },
    ];
    for (const overrides of invalidOverrides) {
      expect(() =>
        parseSourceRecords(
          [
            sourceRecord({
              image: "character-ability-cards/frosthaven/BB/fh-blurry-jab.jpeg",
              ...overrides,
            }),
          ],
          character,
        ),
      ).toThrow();
    }
  });
});

describe("Mercenary Pack imports", () => {
  const hail = mercenaryCharacters.find(({ id }) => id === "HA")!;

  it("uses the mercenary source paths and preserves unprefixed card IDs", () => {
    const plan = createImportPlan([...fixture, ...mercenaryFixture], {
      character: hail,
      requireCompleteCatalog: false,
      metadataChecksum: "checksum",
      sourceRevisions: {
        metadata: "metadata-revision",
        images: "image-revision",
      },
    });
    expect(plan.character).toEqual({
      id: "HA",
      name: "Hail",
      handSize: 9,
      icon: "HA.png",
      cardBack: "HA/ha-back.jpeg",
      cards: [
        {
          id: "gather-reagents",
          name: "Gather Reagents",
          level: 1,
          initiative: 21,
          image: "HA/gather-reagents.jpeg",
        },
        {
          id: "somewhere-to-be",
          name: "Somewhere To Be",
          level: 1,
          initiative: 10,
          image: "HA/somewhere-to-be.jpeg",
        },
      ],
    });
    expect(plan.back.outputPath).toBe("ha-back.jpeg");
  });

  it("rejects unsafe Mercenary Pack image paths", () => {
    expect(() =>
      parseSourceRecords(
        [
          {
            ...mercenaryFixture[1],
            image:
              "character-ability-cards/mercenary/HA/../gather-reagents.jpeg",
          },
        ],
        hail,
      ),
    ).toThrow(/Unsafe/);
  });

  it("downloads and installs the mercenary artwork, icon, and source manifest locally", async () => {
    const root = await mkdtemp(join(tmpdir(), "mercenary-import-"));
    const requests: string[] = [];
    const result = await importCards({
      projectRoot: root,
      character: hail,
      requireCompleteCatalog: false,
      sourceRevisions: {
        metadata: "metadata-revision",
        images: "image-revision",
      },
      fetchImpl: async (url) => {
        requests.push(url);
        return url.endsWith("mercenary.json")
          ? new Response(JSON.stringify(mercenaryFixture))
          : new Response("local artwork");
      },
    });
    expect(requests).toContain(
      "https://raw.githubusercontent.com/cmlenius/gloomhaven-card-browser/metadata-revision/data/character-abilities/mercenary.json",
    );
    expect(requests).toContain(
      "https://raw.githubusercontent.com/cmlenius/gloomhaven-card-browser/image-revision/images/icons/characters/merc/HA.png",
    );
    expect(result.manifest.source.metadata.url).toContain("/mercenary.json");
    for (const path of [
      "public/cards/HA/gather-reagents.jpeg",
      "public/cards/HA/ha-back.jpeg",
      "public/icons/HA.png",
    ]) {
      await expect(readFile(join(root, path), "utf8")).resolves.toBe(
        "local artwork",
      );
    }
    const catalog = JSON.parse(
      await readFile(join(root, "src/shared/data/characters/HA.json"), "utf8"),
    );
    expect(catalog).toEqual(result.character);
    const manifest = JSON.parse(
      await readFile(
        join(root, "src/shared/data/characters/HA-source-manifest.json"),
        "utf8",
      ),
    );
    expect(manifest).toEqual(result.manifest);
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
      cardBack: "SD/fh-sd-back.jpeg",
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
        join(root, "src/shared/data/characters/SD-source-manifest.json"),
        "utf8",
      ),
    ).resolves.toContain('"metadata-revision"');
    await expect(
      readFile(join(root, "src/shared/data/characters/index.ts"), "utf8"),
    ).resolves.toBe(
      await readFile(
        new URL("../src/shared/data/characters/index.ts", import.meta.url),
        "utf8",
      ),
    );
  });
});
