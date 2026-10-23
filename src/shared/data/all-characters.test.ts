import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { SourceManifest } from "../../../scripts/import-cards";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { characters, getCharacter } from "./characters";
import { createBuild } from "../builds";
import { replayBuild } from "../rules";

const handSizes: Record<string, number> = {
  AN: 11,
  CA: 10,
  HA: 9,
  SA: 10,
  BB: 10,
  BN: 10,
  BO: 12,
  CR: 12,
  DF: 12,
  DT: 10,
  DW: 11,
  FF: 8,
  GE: 14,
  HV: 9,
  IF: 11,
  ME: 9,
  PC: 10,
  PY: 10,
  SD: 11,
  SH: 10,
  TA: 9,
};

describe("all supported characters", () => {
  it("includes 17 Frosthaven and four Mercenary Pack classes with their actual hand sizes", () => {
    expect(
      Object.fromEntries(characters.map(({ id, handSize }) => [id, handSize])),
    ).toEqual(handSizes);
  });

  for (const [id, handSize] of Object.entries(handSizes)) {
    it(`${id} has a complete local catalog and supports deck planning`, async () => {
      const character = getCharacter(id);
      expect(character).toBeDefined();
      if (!character) return;
      expect(new Set(character.cards.map((card) => card.id)).size).toBe(
        character.cards.length,
      );
      expect(character.cards.filter((card) => card.level === "X")).toHaveLength(
        id === "GE" ? 4 : 3,
      );
      for (let level = 2; level <= 9; level++) {
        expect(
          character.cards.filter((card) => card.level === level),
        ).toHaveLength(2);
      }
      const build = createBuild({
        characterId: id,
        name: character.name,
        startLevel: 1,
      });
      build.startDeck = character.cards
        .filter((card) => card.level === 1)
        .slice(0, handSize)
        .map((card) => card.id);
      expect(replayBuild(build, character).issues).toEqual([]);
      let hand = character.cards.filter((card) =>
        build.startDeck.includes(card.id),
      );
      for (let level = 2; level <= 9; level++) {
        const pick = character.cards.find((card) => card.level === level)!;
        const drop = hand.find((card) => card.form === pick.form)!;
        build.levelUps.push({
          level,
          pick: pick.id,
          added: [pick.id],
          dropped: [drop.id],
        });
        hand = hand.filter((card) => card.id !== drop.id).concat(pick);
      }
      const planned = replayBuild(build, character);
      expect(planned.levels).toHaveLength(9);
      expect(planned.issues).toEqual([]);
      const manifest = JSON.parse(
        await readFile(
          new URL(`./characters/${id}-source-manifest.json`, import.meta.url),
          "utf8",
        ),
      ) as SourceManifest;
      const assets = new Map(
        manifest.assets.map((asset) => [asset.id, asset.sha256]),
      );
      expect(assets.size).toBe(character.cards.length + 1);
      const files = [
        { path: `icons/${character.icon}`, checksum: manifest.icon.sha256 },
        {
          path: `cards/${character.cardBack}`,
          checksum: assets.get(`${id.toLowerCase()}-back`),
        },
        ...character.cards.map((card) => ({
          path: `cards/${card.image}`,
          checksum: assets.get(card.id),
        })),
      ];
      for (const { path, checksum } of files) {
        const bytes = await readFile(
          fileURLToPath(new URL(`../../../public/${path}`, import.meta.url)),
        );
        expect(bytes.byteLength).toBeGreaterThan(0);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(checksum);
      }
    });
  }

  it("requires seven cards of each Geminate form, including after leveling up", () => {
    const character = getCharacter("GE")!;
    expect(character).toBeDefined();
    if (!character) return;
    const build = createBuild({
      characterId: "GE",
      name: "Forms",
      startLevel: 1,
    });
    build.startDeck = character.cards
      .filter((card) => card.level === 1)
      .map((card) => card.id);
    const unbalanced = {
      ...build,
      startDeck: build.startDeck
        .filter((id) => id !== "mind-spike")
        .concat("reckless-jab"),
    };
    expect(
      replayBuild(unbalanced, character).issues.map(({ code }) => code),
    ).toContain("FORM_IMBALANCE");
    build.levelUps = [
      {
        level: 2,
        pick: "venomous-barbs",
        added: ["venomous-barbs"],
        dropped: ["mind-spike"],
      },
    ];
    expect(
      replayBuild(build, character).levels[1]!.issues.map(({ code }) => code),
    ).toContain("FORM_IMBALANCE");
    build.levelUps[0]!.dropped = ["icebound-quills"];
    expect(replayBuild(build, character).issues).toEqual([]);
  });

  it("keeps both Blinkblade initiatives", () => {
    expect(
      getCharacter("BB")?.cards.find((card) => card.id === "blurry-jab")
        ?.initiative,
    ).toBe("20/50");
  });
});
