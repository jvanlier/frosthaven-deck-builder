import { describe, expect, it, vi } from "vitest";
import {
  copyBuild,
  createBuild,
  deleteBuild,
  deleteHighestLevel,
  generateUuid,
  motivationKey,
  appendLevelUp,
  removeBuildOperation,
  renameBuild,
  restorePickedCard,
  setLevelUp,
  setStartDeck,
  setStartPick,
  upsertMotivation,
  upsertNote,
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
      motivations: [],
      guidance: {},
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

  it("deletes only the highest level and its motivations while retaining guidance", () => {
    const build = buildSchema.parse({
      ...createBuild(
        { characterId: "SD", name: "Original", startLevel: 1 },
        options,
      ),
      levelUps: [
        { level: 2, pick: null, added: [], dropped: [] },
        { level: 3, pick: null, added: [], dropped: [] },
      ],
      motivations: [
        {
          level: 2,
          cardId: "blizzard",
          kind: "add",
          text: "Keep level 2 note",
          updatedAt: firstTime,
        },
        {
          level: 3,
          cardId: "tornado",
          kind: "drop",
          text: "Delete this note",
          updatedAt: firstTime,
        },
      ],
      guidance: {
        tornado: { text: "Keep guidance", updatedAt: firstTime },
      },
    });

    const deleted = deleteHighestLevel(build, { now: () => secondTime });
    expect(deleted.levelUps).toEqual([
      { level: 2, pick: null, added: [], dropped: [] },
    ]);
    expect(deleted.motivations).toEqual([
      {
        level: 2,
        cardId: "blizzard",
        kind: "add",
        text: "Keep level 2 note",
        updatedAt: firstTime,
      },
    ]);
    expect(deleted.guidance).toEqual(build.guidance);
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
      motivations: [
        {
          level: 2,
          cardId: "picked-card",
          kind: "add",
          text: "A reason",
          updatedAt: firstTime,
        },
      ],
      guidance: {
        "picked-card": { text: "Use it", updatedAt: firstTime },
      },
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
    expect(copy.motivations[0]?.updatedAt).toBe(firstTime);
    expect(copy.guidance["picked-card"]?.updatedAt).toBe(firstTime);

    copy.startPicks[0]!.cardId = "changed";
    copy.guidance["picked-card"]!.text = "changed";
    expect(build.startPicks[0]?.cardId).toBe("picked-card");
    expect(build.guidance["picked-card"]?.text).toBe("Use it");
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

  it("uses tuple motivation keys and preserves hidden unrelated motivations", () => {
    expect(motivationKey(2, "a|b", "add")).toBe(
      JSON.stringify([2, "a|b", "add"]),
    );

    const build = createBuild(
      { characterId: "SD", name: "Original", startLevel: 3 },
      options,
    );
    const withHiddenNote = upsertMotivation(
      build,
      { kind: "add", cardId: "later-card", level: 4, text: "Later reason" },
      { now: () => firstTime },
    );
    const withInitialPickNote = upsertMotivation(
      withHiddenNote,
      {
        kind: "add",
        cardId: "start-card",
        forLevel: 2,
        level: 2,
        text: "Starting reason",
      },
      { now: () => secondTime },
    );

    expect(withInitialPickNote.motivations).toEqual([
      {
        level: 4,
        cardId: "later-card",
        kind: "add",
        text: "Later reason",
        updatedAt: firstTime,
      },
      {
        level: 3,
        cardId: "start-card",
        kind: "add",
        text: "Starting reason",
        updatedAt: secondTime,
      },
    ]);

    const changed = upsertMotivation(
      withInitialPickNote,
      {
        kind: "add",
        cardId: "later-card",
        level: 4,
        text: "  keep whitespace\nexactly  ",
      },
      { now: () => secondTime },
    );
    expect(changed.motivations[0]?.text).toBe("  keep whitespace\nexactly  ");
    expect(changed.motivations[1]?.text).toBe("Starting reason");
  });

  it("preserves prototype-named guidance IDs and serializes them safely", () => {
    const build = createBuild(
      { characterId: "SD", name: "Original", startLevel: 1 },
      options,
    );
    const updated = upsertNote(build, "__proto__", "preserve this note", {
      now: () => firstTime,
    });

    expect(Object.hasOwn(updated.guidance, "__proto__")).toBe(true);
    expect(updated.guidance["__proto__"]?.text).toBe("preserve this note");
    expect(JSON.parse(JSON.stringify(updated)).guidance["__proto__"]).toEqual({
      text: "preserve this note",
      updatedAt: firstTime,
    });
  });

  it("removes empty guidance/motivation notes without touching unrelated notes", () => {
    const build = createBuild(
      { characterId: "SD", name: "Original", startLevel: 1 },
      options,
    );
    const importedEmptyNotes = buildSchema.parse({
      ...build,
      guidance: {
        "empty-guidance": { text: "", updatedAt: firstTime },
      },
      motivations: [
        {
          level: 1,
          cardId: "empty-motivation",
          kind: "exclude",
          text: "",
          updatedAt: firstTime,
        },
      ],
    });
    const clearedImportedGuidance = upsertNote(
      importedEmptyNotes,
      "empty-guidance",
      "",
      { now: () => secondTime },
    );
    const clearedImportedMotivation = upsertMotivation(
      clearedImportedGuidance,
      { kind: "exclude", cardId: "empty-motivation", text: "" },
      { now: () => secondTime },
    );
    const withGuidance = upsertNote(
      clearedImportedMotivation,
      "card-a",
      "guidance",
      { now: () => firstTime },
    );
    const withBoth = upsertMotivation(
      withGuidance,
      { kind: "exclude", cardId: "card-b", text: "exclude reason" },
      { now: () => firstTime },
    );

    const clearedGuidance = upsertNote(withBoth, "card-a", "", {
      now: () => secondTime,
    });
    const clearedMotivation = upsertMotivation(
      clearedGuidance,
      { kind: "exclude", cardId: "card-b", text: "" },
      { now: () => secondTime },
    );

    expect(clearedImportedGuidance.guidance).toEqual({});
    expect(clearedImportedMotivation.motivations).toEqual([]);
    expect(clearedGuidance.guidance).toEqual({});
    expect(clearedGuidance.motivations).toHaveLength(1);
    expect(clearedMotivation.motivations).toEqual([]);
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
