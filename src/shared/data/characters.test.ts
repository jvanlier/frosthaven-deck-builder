import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { characters, getCharacter } from "./characters";
import { attribution } from "../attribution";
import { validateCatalog } from "../../../scripts/import-cards";
import manifest from "./characters/source-manifest.json";

function assetPath(relativePath: string): string {
  return fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url));
}

describe("committed Snowdancer catalog", () => {
  it("exports reusable attribution content for the About view", () => {
    expect(attribution).toEqual({
      copyright:
        "Card artwork, text, and class icons © Cephalofair Games, used for personal, non-commercial purposes.",
      source:
        "Card data and images are sourced through cmlenius/gloomhaven-card-browser.",
      removal:
        "If Cephalofair Games requests it, the images will be removed or this repository will be made private.",
    });
  });

  it("exports the data-driven character and handles unknown IDs", () => {
    expect(characters).toHaveLength(1);
    expect(getCharacter("SD")).toBe(characters[0]);
    expect(getCharacter("unknown")).toBeUndefined();
    expect(characters[0]).toMatchObject({
      id: "SD",
      name: "Snowdancer",
      handSize: 11,
      icon: "SD.png",
    });
  });

  it("contains the spec card counts and starting pool", () => {
    const snowdancer = characters[0];
    const counts = new Map<string | number, number>();
    for (const card of snowdancer.cards) {
      counts.set(card.level, (counts.get(card.level) ?? 0) + 1);
    }

    expect(() => validateCatalog(snowdancer.cards)).not.toThrow();
    expect(snowdancer.cards).toHaveLength(30);
    expect(counts.get(1)).toBe(11);
    expect(counts.get("X")).toBe(3);
    for (let level = 2; level <= 9; level += 1) {
      expect(counts.get(level)).toBe(2);
    }
    expect(
      snowdancer.cards.filter((card) => card.level === 1 || card.level === "X"),
    ).toHaveLength(14);
  });

  it("includes every local card, back, and class icon with recorded checksums", async () => {
    const snowdancer = characters[0];
    const recordedAssets = new Map(
      manifest.assets.map((asset) => [asset.id, asset]),
    );

    expect(recordedAssets.size).toBe(31);
    for (const card of snowdancer.cards) {
      const bytes = await readFile(assetPath(`public/cards/${card.image}`));
      expect(bytes.byteLength).toBeGreaterThan(0);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        recordedAssets.get(card.id)?.sha256,
      );
    }

    const back = await readFile(assetPath("public/cards/SD/fh-sd-back.jpeg"));
    expect(createHash("sha256").update(back).digest("hex")).toBe(
      recordedAssets.get("sd-back")?.sha256,
    );
    const icon = await readFile(assetPath("public/icons/SD.png"));
    expect(createHash("sha256").update(icon).digest("hex")).toBe(
      manifest.icon.sha256,
    );
  });
});
