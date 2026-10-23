import { describe, expect, it } from "vitest";
import { createBuild } from "../builds";
import { characters } from "../data/characters";
import {
  addOptions,
  applyDeckEdit,
  canAppendLevel,
  deck,
  pickOptions,
  startingPickOptions,
  pool,
  replayBuild,
  validateBuild,
} from "./index";
import { buildSchema, type Build } from "../schema";

const character = characters[0]!;
const timestamp = "2024-01-02T03:04:05.000Z";

function makeBuild(startLevel: number, overrides: Partial<Build> = {}): Build {
  const build = createBuild(
    { characterId: character.id, name: "Freeze control", startLevel },
    { id: () => "123e4567-e89b-42d3-a456-426614174000", now: () => timestamp },
  );
  return buildSchema.parse({ ...build, ...overrides });
}

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

describe("Snowdancer rules engine", () => {
  it("treats X as level 1 and returns deterministic pool/deck ordering", () => {
    const build = makeBuild(1, { startDeck: startingCards });
    const expectedPool = [
      "cold-therapy",
      "whiteout",
      "snowball",
      "lifting-gust",
      "chilling-impact",
      "cross-winds",
      "frigid-growth",
      "blizzard",
      "enticing-breeze",
      "gathering-force",
      "natures-breath",
      "white-winds",
      "blinding-vortex",
      "the-spirits-call",
    ];

    expect(pool(build, character).map((card) => card.id)).toEqual(expectedPool);
    expect(deck(build, character).map((card) => card.id)).toEqual([
      "cold-therapy",
      "whiteout",
      "snowball",
      "lifting-gust",
      "chilling-impact",
      "cross-winds",
      "frigid-growth",
      "blizzard",
      "enticing-breeze",
      "gathering-force",
      "natures-breath",
    ]);
  });

  it("offers the skipped level-2 card and level-3 cards in the next start slot", () => {
    const build = makeBuild(3, {
      startPicks: [
        { forLevel: 2, cardId: "birds-in-a-tempest" },
        { forLevel: 3, cardId: null },
      ],
    });

    expect(pickOptions(build, character, 2).map((card) => card.id)).toEqual([
      "birds-in-a-tempest",
      "tornado",
    ]);
    expect(pickOptions(build, character, 3).map((card) => card.id)).toEqual([
      "tornado",
      "polar-vortex",
      "cold-snap",
    ]);
  });

  it("works downward through starting picks, reserving higher-slot choices only", () => {
    const build = makeBuild(7);
    const ids = (level: number) =>
      startingPickOptions(build, character, level).map((card) => card.id);
    expect(ids(7)).toContain("storm-wall");
    expect(ids(7)).not.toContain("blizzard");
    expect(ids(7)).not.toContain("white-winds");
    build.startPicks[5]!.cardId = "storm-wall";
    expect(ids(6)).not.toContain("freezing-storm");
    expect(ids(6)).not.toContain("storm-wall");
    build.startPicks[4]!.cardId = "shifting-snow";
    expect(ids(5)).toContain("whipping-gale");
    expect(ids(5)).not.toContain("shifting-snow");
    expect(ids(5)).not.toContain("frozen-brand");
    expect(ids(5)).not.toContain("refreshing-flurry");
    build.startPicks[3]!.cardId = "cold-snap";
    expect(ids(4)).toContain("polar-vortex");
    expect(ids(4)).not.toContain("whipping-gale");
    // Revising a higher slot must not be constrained by a lower-slot choice.
    expect(ids(7)).toContain("cold-snap");
    expect(ids(1)).toEqual([]);
    expect(ids(8)).toEqual([]);
  });

  it("replays valid picks and normalized deck changes without storing derived decks", () => {
    const build = makeBuild(1, {
      startDeck: startingCards,
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest"],
          dropped: ["whiteout"],
        },
      ],
    });
    const result = replayBuild(build, character);
    const level = result.levels[1]!;

    expect(level.pool.map((card) => card.id)).toContain("birds-in-a-tempest");
    expect(level.deck.map((card) => card.id)).toContain("birds-in-a-tempest");
    expect(level.deck.map((card) => card.id)).not.toContain("whiteout");
    expect(level.applied).toEqual({
      startingPicks: [],
      pick: "birds-in-a-tempest",
      added: ["birds-in-a-tempest"],
      dropped: ["whiteout"],
    });
    expect(level.issues).toEqual([]);
    expect(validateBuild(build, character)).toEqual([]);
  });

  it("reports semantic violations while retaining valid independent operations", () => {
    const build = makeBuild(1, {
      startDeck: [...startingCards, "tornado", "missing-card"],
      levelUps: [
        {
          level: 2,
          pick: "cold-therapy",
          added: ["missing-add", "birds-in-a-tempest", "cold-therapy"],
          dropped: ["tornado", "missing-drop"],
        },
      ],
    });
    const issues = validateBuild(build, character);

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "START_CARD_NOT_IN_POOL",
        "UNKNOWN_CARD",
        "PICK_ALREADY_IN_POOL",
        "ADD_NOT_IN_POOL",
        "ADD_ALREADY_IN_PREV_DECK",
        "DROP_NOT_IN_PREV_DECK",
      ]),
    );
    const level = replayBuild(build, character).levels[1]!;
    expect(level.applied.added).toEqual([]);
    expect(level.applied.dropped).toEqual([]);
    expect(level.pool.map((card) => card.id)).toContain("cold-therapy");
    expect(level.deck.map((card) => card.id)).not.toContain("tornado");
  });

  it("reports a missing add separately while still applying a valid pick to the pool", () => {
    const build = makeBuild(1, {
      startDeck: startingCards,
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: [],
          dropped: [],
        },
      ],
    });
    const level = replayBuild(build, character).levels[1]!;

    expect(level.pool.map((card) => card.id)).toContain("birds-in-a-tempest");
    expect(level.applied.pick).toBe("birds-in-a-tempest");
    expect(level.applied.added).toEqual([]);
    expect(level.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PICK_NOT_ADDED",
          severity: "invalid",
        }),
      ]),
    );
  });

  it("marks partial hands incomplete and overfull hands invalid", () => {
    const incomplete = makeBuild(1, { startDeck: startingCards.slice(0, 9) });
    const overfull = makeBuild(1, {
      startDeck: [...startingCards, "blinding-vortex"],
    });

    expect(validateBuild(incomplete, character)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DECK_TOO_SMALL",
          severity: "incomplete",
        }),
      ]),
    );
    expect(validateBuild(overfull, character)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DECK_TOO_LARGE",
          severity: "invalid",
        }),
      ]),
    );
  });

  it("normalizes deck edits to added and dropped cards", () => {
    expect(applyDeckEdit(["a", "b", "c"], ["b", "c", "d"])).toEqual({
      added: ["d"],
      dropped: ["a"],
    });
  });

  it("retains unresolved stored operations while replacing the valid editable diff", () => {
    expect(
      applyDeckEdit(["a", "b"], ["b", "c"], {
        existing: { added: ["invalid-add"], dropped: ["invalid-drop"] },
        validAdded: [],
        validDropped: [],
      }),
    ).toEqual({
      added: ["invalid-add", "c"],
      dropped: ["invalid-drop", "a"],
    });
  });

  it("removes undone valid operations but reports conflicts with unresolved operations", () => {
    expect(
      applyDeckEdit(["a", "b"], ["a", "b"], {
        existing: { added: ["c"], dropped: ["d"] },
        validAdded: ["c"],
        validDropped: ["d"],
      }),
    ).toEqual({ added: [], dropped: [] });

    expect(
      applyDeckEdit(["a", "b"], ["b"], {
        existing: { added: ["a"], dropped: [] },
        validAdded: [],
        validDropped: [],
      }),
    ).toEqual({
      added: ["a"],
      dropped: [],
      conflicts: [{ cardId: "a", existing: "added", requested: "dropped" }],
    });
  });

  it("propagates edits and reports duplicate picks and stale drops", () => {
    const build = makeBuild(1, {
      startDeck: startingCards,
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
          added: ["tornado"],
          dropped: ["birds-in-a-tempest"],
        },
      ],
    });
    const changed = buildSchema.parse({
      ...build,
      levelUps: [
        {
          level: 2,
          pick: "tornado",
          added: ["tornado"],
          dropped: ["whiteout"],
        },
        build.levelUps[1],
      ],
    });
    const result = replayBuild(changed, character);

    expect(result.levels[1]?.pool.map((card) => card.id)).not.toContain(
      "birds-in-a-tempest",
    );
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 3, code: "PICK_ALREADY_IN_POOL" }),
        expect.objectContaining({ level: 3, code: "DROP_NOT_IN_PREV_DECK" }),
      ]),
    );
  });

  it("reports high-level and unknown picks without mutating the stored build", () => {
    const build = makeBuild(1, {
      startDeck: startingCards,
      levelUps: [
        { level: 2, pick: "cold-snap", added: [], dropped: [] },
        { level: 3, pick: "not-a-card", added: [], dropped: [] },
      ],
    });
    const before = JSON.stringify(build);

    expect(validateBuild(build, character)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PICK_TOO_HIGH", level: 2 }),
        expect.objectContaining({ code: "UNKNOWN_CARD", level: 3 }),
      ]),
    );
    replayBuild(build, character);
    expect(JSON.stringify(build)).toBe(before);
  });

  it("allows appending only below level 9 after complete valid history", () => {
    const complete = makeBuild(1, {
      startDeck: startingCards,
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest"],
          dropped: ["whiteout"],
        },
      ],
    });
    const incomplete = makeBuild(1, {
      startDeck: startingCards.slice(0, 10),
      levelUps: [],
    });

    expect(canAppendLevel(complete, character)).toBe(true);
    expect(canAppendLevel(incomplete, character)).toBe(false);
    expect(
      canAppendLevel(
        makeBuild(9, {
          startDeck: startingCards,
        }),
        character,
      ),
    ).toBe(false);
  });

  it("offers valid pool cards that are not already in the preceding deck", () => {
    const build = makeBuild(1, { startDeck: startingCards });
    expect(addOptions(build, character, 1).map((card) => card.id)).toEqual([
      "white-winds",
      "blinding-vortex",
      "the-spirits-call",
    ]);
  });
});
