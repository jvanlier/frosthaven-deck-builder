import { describe, expect, it } from "vitest";
import { createBuild } from "../shared/builds";
import { getCharacter } from "../shared/data/characters";
import { buildSchema, type Build } from "../shared/schema";
import { buildOverviewModel } from "./overview";

const character = getCharacter("SD")!;
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

  it("marks the cells where a non-empty card note was recorded", () => {
    const model = buildOverviewModel(
      makeBuild({
        levelUps: [
          {
            level: 2,
            pick: "birds-in-a-tempest",
            added: ["birds-in-a-tempest"],
            dropped: ["whiteout"],
          },
        ],
        cardNotes: [
          {
            cardId: "tornado",
            level: 1,
            text: "Too unreliable",
            updatedAt: timestamp,
          },
          {
            cardId: "tornado",
            level: 2,
            text: "",
            updatedAt: timestamp,
          },
          {
            cardId: "whiteout",
            level: 2,
            text: "Swapped for Birds",
            updatedAt: timestamp,
          },
        ],
      }),
      character,
    );

    const cell = (level: number, cardId: string) =>
      model.levels[level - 1]?.cells.find((item) => item.card.id === cardId);
    expect(cell(1, "tornado")?.note?.text).toBe("Too unreliable");
    expect(cell(2, "tornado")?.note).toBeUndefined();
    expect(cell(1, "whiteout")?.note).toBeUndefined();
    expect(cell(2, "whiteout")?.note?.text).toBe("Swapped for Birds");
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
});
