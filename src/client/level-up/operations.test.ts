import { describe, expect, it } from "vitest";
import { createBuild } from "../../shared/builds.js";
import { getCharacter } from "../../shared/data/characters/index.js";
import { replayBuild } from "../../shared/rules/index.js";
import {
  buildSchema,
  type Build,
  type LevelUp,
} from "../../shared/schema/index.js";
import {
  captureLevelUpEdit,
  changeLevelUpDeck,
  chooseLevelUpPick,
  resetLevelUpEdit,
} from "./operations";

const timestamp = "2024-01-02T03:04:05.000Z";
const nextTimestamp = "2024-01-03T03:04:05.000Z";
const character = getCharacter("SD")!;

function makeBuild(overrides: Partial<Build> = {}): Build {
  return buildSchema.parse({
    ...createBuild(
      { characterId: "SD", name: "Level-up setup", startLevel: 1 },
      {
        id: () => "123e4567-e89b-42d3-a456-426614174000",
        now: () => timestamp,
      },
    ),
    startDeck: ["whiteout", "cold-therapy"],
    levelUps: [
      {
        level: 2,
        pick: "birds-in-a-tempest",
        added: ["missing-add", "missing-other", "birds-in-a-tempest"],
        dropped: ["whiteout", "missing-drop"],
      },
    ],
    ...overrides,
  });
}

describe("level-up editor operations", () => {
  it("replaces a pick at its stored position and unpicks it without changing unrelated operations", () => {
    const levelUp: LevelUp = {
      level: 2,
      pick: "birds-in-a-tempest",
      added: ["missing-add", "birds-in-a-tempest", "tornado", "missing-other"],
      dropped: ["missing-drop", "whiteout"],
    };
    const original = structuredClone(levelUp);
    const changed = chooseLevelUpPick(levelUp, "tornado");

    expect(changed).toEqual({
      pick: "tornado",
      added: ["missing-add", "tornado", "missing-other"],
      dropped: original.dropped,
    });
    expect(chooseLevelUpPick({ level: 2, ...changed }, "tornado")).toEqual({
      pick: null,
      added: ["missing-add", "missing-other"],
      dropped: original.dropped,
    });
    expect(levelUp).toEqual(original);
  });

  it("undoes an applied drop while preserving unresolved entries and their order", () => {
    const build = makeBuild();
    const original = structuredClone(build);
    const [previous, state] = replayBuild(build, character).levels;
    const changed = changeLevelUpDeck(
      build.levelUps[0]!,
      previous!.deck.map((card) => card.id),
      state!,
      "whiteout",
      "add",
    );

    expect(changed).toEqual({
      pick: "birds-in-a-tempest",
      added: ["missing-add", "missing-other", "birds-in-a-tempest"],
      dropped: ["missing-drop"],
    });
    expect(build).toEqual(original);
  });

  it("retains an unresolved add when dropping that card would conflict with it", () => {
    const build = makeBuild({
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["cold-therapy", "missing-add", "birds-in-a-tempest"],
          dropped: ["whiteout", "missing-drop"],
        },
      ],
    });
    const [previous, state] = replayBuild(build, character).levels;
    const changed = changeLevelUpDeck(
      build.levelUps[0]!,
      previous!.deck.map((card) => card.id),
      state!,
      "cold-therapy",
      "remove",
    );

    expect(changed).toEqual({
      pick: "birds-in-a-tempest",
      added: ["cold-therapy", "missing-add", "birds-in-a-tempest"],
      dropped: ["missing-drop", "whiteout"],
    });
  });

  it("resets only this edit's operations and touched notes on the current build", () => {
    const build = makeBuild({
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest"],
          dropped: ["whiteout"],
        },
        { level: 3, pick: "tornado", added: ["tornado"], dropped: [] },
      ],
      cardNotes: [
        {
          cardId: "cold-therapy",
          level: 1,
          text: "Inherited",
          updatedAt: timestamp,
        },
        {
          cardId: "birds-in-a-tempest",
          level: 2,
          text: "Original note",
          updatedAt: timestamp,
        },
        {
          cardId: "snowball",
          level: 2,
          text: "Unrelated",
          updatedAt: timestamp,
        },
        {
          cardId: "birds-in-a-tempest",
          level: 3,
          text: "Later note",
          updatedAt: timestamp,
        },
      ],
    });
    const baseline = captureLevelUpEdit(build, build.levelUps[0]!);
    const current = buildSchema.parse({
      ...build,
      name: "Renamed while saving",
      startDeck: [...build.startDeck, "snowball"],
      levelUps: [
        {
          level: 2,
          pick: "tornado",
          added: ["tornado"],
          dropped: ["cold-therapy"],
        },
        {
          level: 3,
          pick: "missing-pick",
          added: ["missing-add"],
          dropped: ["missing-drop"],
        },
      ],
      cardNotes: [
        build.cardNotes[0],
        {
          cardId: "birds-in-a-tempest",
          level: 2,
          text: "Temporary",
          updatedAt: nextTimestamp,
        },
        {
          cardId: "snowball",
          level: 2,
          text: "Changed elsewhere",
          updatedAt: nextTimestamp,
        },
        build.cardNotes[3],
        {
          cardId: "tornado",
          level: 2,
          text: "New temporary note",
          updatedAt: nextTimestamp,
        },
      ],
    });
    const original = structuredClone(current);
    const reset = resetLevelUpEdit(
      current,
      baseline,
      new Set(["birds-in-a-tempest", "tornado", "cold-therapy"]),
      { now: () => nextTimestamp },
    );

    expect(reset.levelUps).toEqual([build.levelUps[0], current.levelUps[1]]);
    expect(reset.cardNotes).toEqual([
      build.cardNotes[0],
      current.cardNotes[2],
      build.cardNotes[3],
      build.cardNotes[1],
    ]);
    expect(reset.name).toBe("Renamed while saving");
    expect(reset.startDeck).toEqual(current.startDeck);
    expect(reset.createdAt).toBe(timestamp);
    expect(reset.updatedAt).toBe(nextTimestamp);
    expect(current).toEqual(original);
  });
});
