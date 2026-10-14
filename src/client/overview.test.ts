import { describe, expect, it } from "vitest";
import { createBuild } from "../shared/builds";
import { characters } from "../shared/data/characters";
import { buildSchema, type Build } from "../shared/schema";
import { buildOverviewModel } from "./overview";

const character = characters[0]!;
const timestamp = "2024-01-02T03:04:05.000Z";
const startingCards = [
  "blizzard",
  "chilling-impact",
  "cold-therapy",
  "cross-winds",
  "enticing-breeze",
  "frigid-growth",
  "gathering-force",
  "lifting-gust",
  "natures-breath",
  "snowball",
  "whiteout",
];

function makeBuild(overrides: Partial<Build> = {}): Build {
  const build = createBuild(
    { characterId: character.id, name: "Freeze control", startLevel: 1 },
    { id: () => "123e4567-e89b-42d3-a456-426614174000", now: () => timestamp },
  );
  return buildSchema.parse({
    ...build,
    startDeck: startingCards,
    ...overrides,
  });
}

describe("overview matrix projection", () => {
  it("groups every catalog card by printed level and projects deck/pool membership", () => {
    const model = buildOverviewModel(makeBuild(), character);

    expect(model.levels.map((level) => level.level)).toEqual([1]);
    expect(model.groups.map((group) => group.level)).toEqual([
      1,
      "X",
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
    ]);
    expect(
      model.groups.reduce((count, group) => count + group.cards.length, 0),
    ).toBe(30);

    const level = model.levels[0]!;
    expect(
      level.cells.find((cell) => cell.card.id === "blizzard")?.membership,
    ).toBe("deck");
    expect(
      level.cells.find((cell) => cell.card.id === "white-winds")?.membership,
    ).toBe("pool");
    expect(
      level.cells.find((cell) => cell.card.id === "tornado")?.membership,
    ).toBe("not-in-pool");
  });

  it("marks applied picks, extra additions and drops without counting invalid stored operations", () => {
    const model = buildOverviewModel(
      makeBuild({
        levelUps: [
          {
            level: 2,
            pick: "birds-in-a-tempest",
            added: ["birds-in-a-tempest"],
            dropped: ["whiteout"],
          },
          {
            level: 3,
            pick: "tornado",
            added: ["tornado", "white-winds", "unknown-add"],
            dropped: ["snowball", "unknown-drop"],
          },
        ],
      }),
      character,
    );

    const levelThree = model.levels.find((level) => level.level === 3)!;
    expect(levelThree.summary).toMatchObject({
      pick: "tornado",
      addedCount: 2,
      extraAddedCount: 1,
      droppedCount: 1,
    });
    expect(
      levelThree.cells.find((cell) => cell.card.id === "tornado")?.marker,
    ).toBe("picked");
    expect(
      levelThree.cells.find((cell) => cell.card.id === "white-winds")?.marker,
    ).toBe("added");
    expect(
      levelThree.cells.find((cell) => cell.card.id === "snowball")?.marker,
    ).toBe("dropped");
    expect(
      levelThree.cells.find((cell) => cell.card.id === "unknown-add"),
    ).toBeUndefined();
  });

  it("exposes every currently applicable motivation on its card cell", () => {
    const model = buildOverviewModel(
      makeBuild({
        startLevel: 2,
        startPicks: [{ forLevel: 2, cardId: "birds-in-a-tempest" }],
        startDeck: startingCards,
        motivations: [
          {
            level: 2,
            cardId: "birds-in-a-tempest",
            kind: "add",
            text: "A strong pick",
            updatedAt: timestamp,
          },
          {
            level: 2,
            cardId: "birds-in-a-tempest",
            kind: "exclude",
            text: "Still not in the hand",
            updatedAt: timestamp,
          },
          {
            level: 2,
            cardId: "tornado",
            kind: "exclude",
            text: "Too unreliable",
            updatedAt: timestamp,
          },
        ],
      }),
      character,
    );

    const start = model.levels[0]!;
    const picked = start.cells.find(
      (cell) => cell.card.id === "birds-in-a-tempest",
    );
    expect(picked?.marker).toBe("picked");
    expect(picked?.markerForLevel).toBe(2);
    expect(picked?.motivations).toEqual([
      expect.objectContaining({ kind: "add", text: "A strong pick" }),
      expect.objectContaining({
        kind: "exclude",
        text: "Still not in the hand",
      }),
    ]);
    expect(
      start.cells.find((cell) => cell.card.id === "tornado")?.motivations,
    ).toEqual([
      expect.objectContaining({ kind: "exclude", text: "Too unreliable" }),
    ]);
  });

  it("keeps a starting pick's slot and applied counts distinct from the start level", () => {
    const model = buildOverviewModel(
      makeBuild({
        startLevel: 3,
        startPicks: [
          { forLevel: 2, cardId: "birds-in-a-tempest" },
          { forLevel: 3, cardId: "tornado" },
        ],
      }),
      character,
    );

    expect(model.levels[0]?.summary).toMatchObject({
      isStartingLevel: true,
      startingPicks: [
        { cardId: "birds-in-a-tempest", forLevel: 2 },
        { cardId: "tornado", forLevel: 3 },
      ],
    });

    const later = buildOverviewModel(
      makeBuild({
        levelUps: [
          {
            level: 2,
            pick: "cold-therapy",
            added: ["white-winds"],
            dropped: ["whiteout"],
          },
        ],
      }),
      character,
    ).levels[1]!;
    expect(later.summary).toMatchObject({
      isStartingLevel: false,
      pick: null,
      addedCount: 1,
      droppedCount: 1,
    });
  });

  it("hides stale motivation indicators while keeping their stored notes intact", () => {
    const build = makeBuild({
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest"],
          dropped: ["whiteout"],
        },
      ],
      motivations: [
        {
          level: 2,
          cardId: "whiteout",
          kind: "drop",
          text: "Only while this is dropped",
          updatedAt: timestamp,
        },
      ],
    });
    const stale = buildSchema.parse({
      ...build,
      startDeck: startingCards.filter((cardId) => cardId !== "whiteout"),
    });

    expect(
      buildOverviewModel(build, character).levels[1]?.cells.find(
        (cell) => cell.card.id === "whiteout",
      )?.motivations,
    ).toEqual([
      expect.objectContaining({ text: "Only while this is dropped" }),
    ]);
    expect(
      buildOverviewModel(stale, character).levels[1]?.cells.find(
        (cell) => cell.card.id === "whiteout",
      )?.motivations,
    ).toEqual([]);
  });
});
