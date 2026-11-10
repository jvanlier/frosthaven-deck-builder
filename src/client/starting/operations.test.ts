import { describe, expect, it } from "vitest";
import { createBuild } from "../../shared/builds.js";
import { buildSchema } from "../../shared/schema/index.js";
import { chooseStartingPick } from "./operations";

const timestamp = "2024-01-02T03:04:05.000Z";
const nextTimestamp = "2024-01-03T03:04:05.000Z";
const options = { now: () => nextTimestamp };

function startingBuild() {
  return buildSchema.parse({
    ...createBuild(
      { characterId: "SD", name: "Starting setup", startLevel: 3 },
      {
        id: () => "123e4567-e89b-42d3-a456-426614174000",
        now: () => timestamp,
      },
    ),
    startPicks: [
      { forLevel: 2, cardId: "birds-in-a-tempest" },
      { forLevel: 3, cardId: "cold-snap" },
    ],
    startDeck: ["missing-card", "cold-snap", "whiteout", "missing-other"],
    levelUps: [
      { level: 4, pick: "cold-snap", added: ["cold-snap"], dropped: [] },
    ],
    cardNotes: [
      {
        cardId: "cold-snap",
        level: 3,
        text: "Keep this",
        updatedAt: timestamp,
      },
    ],
  });
}

describe("starting editor operations", () => {
  it("replaces a higher pick without clearing conflicting lower picks or invalid stored entries", () => {
    const build = startingBuild();
    const original = structuredClone(build);
    const changed = chooseStartingPick(build, 3, "birds-in-a-tempest", options);

    expect(changed.startPicks).toEqual([
      { forLevel: 2, cardId: "birds-in-a-tempest" },
      { forLevel: 3, cardId: "birds-in-a-tempest" },
    ]);
    expect(changed.startDeck).toEqual([
      "missing-card",
      "whiteout",
      "missing-other",
      "birds-in-a-tempest",
    ]);
    expect(changed.levelUps).toEqual(original.levelUps);
    expect(changed.cardNotes).toEqual(original.cardNotes);
    expect(changed.createdAt).toBe(timestamp);
    expect(changed.updatedAt).toBe(nextTimestamp);
    expect(build).toEqual(original);
  });

  it("keeps hand entries owned by another slot when unpicking a duplicate pick", () => {
    const build = buildSchema.parse({
      ...startingBuild(),
      startPicks: [
        { forLevel: 2, cardId: "birds-in-a-tempest" },
        { forLevel: 3, cardId: "birds-in-a-tempest" },
      ],
      startDeck: ["birds-in-a-tempest", "missing-card", "whiteout"],
    });
    const changed = chooseStartingPick(build, 3, "birds-in-a-tempest", options);

    expect(changed.startPicks).toEqual([
      { forLevel: 2, cardId: "birds-in-a-tempest" },
      { forLevel: 3, cardId: null },
    ]);
    expect(changed.startDeck).toEqual(build.startDeck);
    expect(changed.levelUps).toEqual(build.levelUps);
    expect(changed.cardNotes).toEqual(build.cardNotes);
  });
});
