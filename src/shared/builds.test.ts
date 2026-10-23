import { describe, expect, it, vi } from "vitest";
import {
  copyBuild,
  createBuild,
  deleteBuild,
  deleteHighestLevel,
  generateUuid,
  appendLevelUp,
  removeBuildOperation,
  renameBuild,
  restorePickedCard,
  setLevelUp,
  setStartDeck,
  setStartPick,
  cardNoteHistory,
  effectiveCardNote,
  removeCardNote,
  setCardNote,
} from "./builds";
import { buildSchema } from "./schema";
import type { Build } from "./schema";

const firstId = "123e4567-e89b-42d3-a456-426614174000";
const copyId = "123e4567-e89b-42d3-a456-426614174001";
const firstTime = "2024-01-02T03:04:05.000Z";
const secondTime = "2024-01-03T03:04:05.000Z";

const options = {
  id: () => firstId,
  now: () => firstTime,
};

describe("build mutations", () => {
  it("creates a build with immutable start-level shape and empty editable state", () => {
    const build = createBuild(
      {
        characterId: "future-class",
        name: "  Freeze control  ",
        startLevel: 3,
      },
      options,
    );

    expect(build).toEqual({
      id: firstId,
      characterId: "future-class",
      name: "Freeze control",
      startLevel: 3,
      startPicks: [
        { forLevel: 2, cardId: null },
        { forLevel: 3, cardId: null },
      ],
      startDeck: [],
      levelUps: [],
      cardNotes: [],
      createdAt: firstTime,
      updatedAt: firstTime,
    });
  });

  it("updates starting picks and decks without changing unrelated build data", () => {
    const build = createBuild(
      { characterId: "SD", name: "Original", startLevel: 3 },
      options,
    );

    const withPick = setStartPick(build, 2, "birds-in-a-tempest", {
      now: () => secondTime,
    });
    expect(withPick.startPicks).toEqual([
      { forLevel: 2, cardId: "birds-in-a-tempest" },
      { forLevel: 3, cardId: null },
    ]);
    expect(withPick.startLevel).toBe(3);
    expect(withPick.name).toBe("Original");
    expect(withPick.updatedAt).toBe(secondTime);

    const withDeck = setStartDeck(withPick, ["blizzard", "whiteout"], {
      now: () => firstTime,
    });
    expect(withDeck.startDeck).toEqual(["blizzard", "whiteout"]);
    expect(withDeck.startPicks).toEqual(withPick.startPicks);
    expect(setStartPick(withDeck, 2, "birds-in-a-tempest")).toBe(withDeck);
    expect(() => setStartPick(build, 1, "blizzard")).toThrow();
  });

  it("appends an empty next level and updates only its build timestamp", () => {
    const build = createBuild(
      { characterId: "SD", name: "Original", startLevel: 1 },
      options,
    );
    const appended = appendLevelUp(build, { now: () => secondTime });

    expect(appended.levelUps).toEqual([
      { level: 2, pick: null, added: [], dropped: [] },
    ]);
    expect(appended.startDeck).toEqual([]);
    expect(appended.updatedAt).toBe(secondTime);
    expect(() => appendLevelUp(appended)).not.toThrow();
    expect(
      appendLevelUp(appended, { now: () => secondTime }).levelUps,
    ).toHaveLength(2);
    expect(() => appendLevelUp({ ...build, startLevel: 9 })).toThrow();
  });

  it("replaces one level-up without changing later operations or unrelated fields", () => {
    const build = createBuild(
      { characterId: "SD", name: "Original", startLevel: 1 },
      options,
    );
    const withLevels = appendLevelUp(
      appendLevelUp(build, { now: () => secondTime }),
      { now: () => secondTime },
    );
    const updated = setLevelUp(
      withLevels,
      2,
      {
        pick: "birds-in-a-tempest",
        added: ["birds-in-a-tempest"],
        dropped: ["blizzard"],
      },
      { now: () => secondTime },
    );

    expect(updated.levelUps[0]).toEqual({
      level: 2,
      pick: "birds-in-a-tempest",
      added: ["birds-in-a-tempest"],
      dropped: ["blizzard"],
    });
    expect(updated.levelUps[1]).toEqual(withLevels.levelUps[1]);
    expect(updated.name).toBe(build.name);
    expect(updated.createdAt).toBe(build.createdAt);
    expect(updated.updatedAt).toBe(secondTime);
    expect(() =>
      setLevelUp(build, 3, { pick: null, added: [], dropped: [] }),
    ).toThrow();
  });

  it("removes only the targeted stored operation and its paired pick add", () => {
    const build = buildSchema.parse({
      ...createBuild(
        { characterId: "SD", name: "Original", startLevel: 1 },
        options,
      ),
      startDeck: ["blizzard", "whiteout"],
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest", "tornado"],
          dropped: ["blizzard", "whiteout"],
        },
      ],
    });

    const withoutAdd = removeBuildOperation(build, 2, {
      kind: "add",
      index: 1,
      cardId: "tornado",
    });
    expect(withoutAdd.levelUps[0]).toEqual({
      level: 2,
      pick: "birds-in-a-tempest",
      added: ["birds-in-a-tempest"],
      dropped: ["blizzard", "whiteout"],
    });
    expect(
      removeBuildOperation(withoutAdd, 2, {
        kind: "add",
        index: 0,
        cardId: "not-tornado",
      }),
    ).toBe(withoutAdd);

    const withoutPick = removeBuildOperation(build, 2, {
      kind: "pick",
      index: 0,
      cardId: "birds-in-a-tempest",
    });
    expect(withoutPick.levelUps[0]).toEqual({
      level: 2,
      pick: null,
      added: ["tornado"],
      dropped: ["blizzard", "whiteout"],
    });

    const starting = buildSchema.parse({
      ...createBuild(
        { characterId: "SD", name: "Starting", startLevel: 2 },
        options,
      ),
      startPicks: [{ forLevel: 2, cardId: "tornado" }],
      startDeck: ["blizzard", "whiteout"],
    });
    const withoutStartingPick = removeBuildOperation(starting, 2, {
      kind: "start-pick",
      index: 0,
      cardId: "tornado",
      forLevel: 2,
    });
    expect(withoutStartingPick.startPicks).toEqual([
      { forLevel: 2, cardId: null },
    ]);
    const withoutStartingCard = removeBuildOperation(build, 1, {
      kind: "start-deck",
      index: 1,
      cardId: "whiteout",
    });
    expect(withoutStartingCard.startDeck).toEqual(["blizzard"]);
  });

  it("restores a missing picked-card add without changing other operations", () => {
    const build = buildSchema.parse({
      ...createBuild(
        { characterId: "SD", name: "Original", startLevel: 1 },
        options,
      ),
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: [],
          dropped: ["blizzard"],
        },
      ],
    });

    const restored = restorePickedCard(build, 2, "birds-in-a-tempest");
    expect(restored.levelUps[0]).toEqual({
      level: 2,
      pick: "birds-in-a-tempest",
      added: ["birds-in-a-tempest"],
      dropped: ["blizzard"],
    });
    expect(restorePickedCard(restored, 2, "birds-in-a-tempest")).toBe(restored);
  });

  it("deletes only the highest level and the notes recorded at it", () => {
    const build = buildSchema.parse({
      ...createBuild(
        { characterId: "SD", name: "Original", startLevel: 1 },
        options,
      ),
      levelUps: [
        { level: 2, pick: null, added: [], dropped: [] },
        { level: 3, pick: null, added: [], dropped: [] },
      ],
      cardNotes: [
        {
          cardId: "tornado",
          level: 2,
          text: "Keep level 2 note",
          updatedAt: firstTime,
        },
        {
          cardId: "tornado",
          level: 3,
          text: "Delete this note",
          updatedAt: firstTime,
        },
      ],
    });

    const deleted = deleteHighestLevel(build, { now: () => secondTime });
    expect(deleted.levelUps).toEqual([
      { level: 2, pick: null, added: [], dropped: [] },
    ]);
    expect(deleted.cardNotes).toEqual([
      {
        cardId: "tornado",
        level: 2,
        text: "Keep level 2 note",
        updatedAt: firstTime,
      },
    ]);
    expect(deleted.updatedAt).toBe(secondTime);
  });

  it("renames only when the trimmed name changes and updates the build timestamp", () => {
    const build = createBuild(
      { characterId: "SD", name: "Original", startLevel: 1 },
      options,
    );

    expect(renameBuild(build, "  Original  ", { now: () => secondTime })).toBe(
      build,
    );
    expect(
      renameBuild(build, "Renamed", { now: () => secondTime }),
    ).toMatchObject({
      name: "Renamed",
      createdAt: firstTime,
      updatedAt: secondTime,
      startLevel: 1,
    });
  });

  it("deep-copies a build with new build identity/timestamps but preserved note timestamps", () => {
    const build: Build = {
      ...createBuild(
        { characterId: "SD", name: "Original", startLevel: 2 },
        options,
      ),
      startPicks: [{ forLevel: 2, cardId: "picked-card" }],
      startDeck: ["picked-card"],
      cardNotes: [
        {
          cardId: "picked-card",
          level: 2,
          text: "Use it",
          updatedAt: firstTime,
        },
      ],
    };

    const copy = copyBuild(build, "Copied", {
      id: () => copyId,
      now: () => secondTime,
    });

    expect(copy).toMatchObject({
      id: copyId,
      name: "Copied",
      createdAt: secondTime,
      updatedAt: secondTime,
      characterId: "SD",
      startLevel: 2,
    });
    expect(copy.cardNotes[0]?.updatedAt).toBe(firstTime);

    copy.startPicks[0]!.cardId = "changed";
    copy.cardNotes[0]!.text = "changed";
    expect(build.startPicks[0]?.cardId).toBe("picked-card");
    expect(build.cardNotes[0]?.text).toBe("Use it");
  });

  it("deletes only the requested build and treats a missing build as a no-op", () => {
    const first = createBuild(
      { characterId: "SD", name: "First", startLevel: 1 },
      options,
    );
    const second = createBuild(
      { characterId: "SD", name: "Second", startLevel: 1 },
      { ...options, id: () => copyId },
    );
    const builds = [first, second];

    expect(deleteBuild(builds, firstId)).toEqual([second]);
    expect(deleteBuild(builds, "123e4567-e89b-42d3-a456-426614174099")).toBe(
      builds,
    );
  });

  it("resolves a card's note from the highest recorded level up to the requested level", () => {
    let build = createBuild(
      { characterId: "SD", name: "Original", startLevel: 1 },
      options,
    );
    build = setCardNote(build, "card", 1, "Level 1 note", options);
    build = setCardNote(build, "card", 4, "Level 4 note", options);
    build = setCardNote(build, "other", 2, "Other card", options);

    expect(effectiveCardNote(build, "card", 1)?.text).toBe("Level 1 note");
    expect(effectiveCardNote(build, "card", 3)?.text).toBe("Level 1 note");
    expect(effectiveCardNote(build, "card", 9)?.text).toBe("Level 4 note");
    expect(effectiveCardNote(build, "other", 1)).toBeUndefined();
    expect(cardNoteHistory(build, "card").map((note) => note.level)).toEqual([
      1, 4,
    ]);
  });

  it("records a level's version, preserving whitespace, and keeps older versions", () => {
    const build = setCardNote(
      createBuild(
        { characterId: "SD", name: "Original", startLevel: 1 },
        options,
      ),
      "card",
      1,
      "Old",
      options,
    );
    const updated = setCardNote(
      build,
      "card",
      3,
      "  keep whitespace\nexactly  ",
      { now: () => secondTime },
    );

    expect(updated.cardNotes).toEqual([
      { cardId: "card", level: 1, text: "Old", updatedAt: firstTime },
      {
        cardId: "card",
        level: 3,
        text: "  keep whitespace\nexactly  ",
        updatedAt: secondTime,
      },
    ]);
    expect(updated.updatedAt).toBe(secondTime);
    expect(
      setCardNote(updated, "card", 3, "  keep whitespace\nexactly  "),
    ).toBe(updated);
  });

  it("stores an empty note only when it clears an inherited one", () => {
    const empty = createBuild(
      { characterId: "SD", name: "Original", startLevel: 1 },
      options,
    );
    expect(setCardNote(empty, "card", 2, "")).toBe(empty);

    const withNote = setCardNote(empty, "card", 1, "Inherited", options);
    const cleared = setCardNote(withNote, "card", 2, "", options);
    expect(effectiveCardNote(cleared, "card", 2)?.text).toBe("");
    expect(cleared.cardNotes).toHaveLength(2);

    // Typing the inherited text back removes the level's redundant version.
    const restored = setCardNote(cleared, "card", 2, "Inherited", options);
    expect(restored.cardNotes).toEqual(withNote.cardNotes);

    // Clearing a note with nothing to inherit removes it.
    expect(setCardNote(withNote, "card", 1, "", options).cardNotes).toEqual([]);
  });

  it("reverts a level's version so the older note applies again", () => {
    let build = createBuild(
      { characterId: "SD", name: "Original", startLevel: 1 },
      options,
    );
    build = setCardNote(build, "card", 1, "Old", options);
    build = setCardNote(build, "card", 3, "New", options);

    const reverted = removeCardNote(build, "card", 3, options);
    expect(effectiveCardNote(reverted, "card", 3)?.text).toBe("Old");
    expect(removeCardNote(reverted, "card", 3, options)).toBe(reverted);
  });

  it("generates standards-compliant UUID v4 values without Math.random", () => {
    const uuid = generateUuid();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("falls back to secure getRandomValues when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(0);
        return bytes;
      },
    });

    expect(generateUuid()).toBe("00000000-0000-4000-8000-000000000000");
    vi.unstubAllGlobals();
  });
});
