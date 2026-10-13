import { describe, expect, it } from "vitest";
import { appDataSchema, putDataRequestSchema, type AppData } from "./index";

const timestamp = "2024-01-02T03:04:05.000Z";
const buildId = "123e4567-e89b-42d3-a456-426614174000";

function validBuild(overrides: Record<string, unknown> = {}) {
  return {
    id: buildId,
    characterId: "unknown-character-is-structurally-valid",
    name: "Freeze control",
    startLevel: 3,
    startPicks: [
      { forLevel: 2, cardId: null },
      { forLevel: 3, cardId: "unknown-card" },
    ],
    startDeck: ["cold-therapy"],
    levelUps: [
      {
        level: 4,
        pick: "new-card",
        added: ["new-card"],
        dropped: ["cold-therapy"],
      },
    ],
    motivations: [
      {
        level: 3,
        cardId: "unknown-card",
        kind: "add",
        text: "Keep the option available.",
        updatedAt: timestamp,
      },
    ],
    guidance: {
      "cold-therapy": { text: "Use this early.", updatedAt: timestamp },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function validData(overrides: Record<string, unknown> = {}): AppData {
  return appDataSchema.parse({
    schemaVersion: 1,
    revision: 0,
    builds: [validBuild()],
    ...overrides,
  });
}

describe("shared document schemas", () => {
  it("accepts structurally valid planning data without enforcing game semantics", () => {
    const data = validData();

    expect(data.builds[0]?.characterId).toBe(
      "unknown-character-is-structurally-valid",
    );
    expect(data.builds[0]?.startPicks[1]?.cardId).toBe("unknown-card");
  });

  it("accepts a null/incomplete start pick and an overfull starting deck", () => {
    expect(() =>
      appDataSchema.parse({
        schemaVersion: 1,
        revision: 0,
        builds: [
          validBuild({
            startLevel: 1,
            startPicks: [],
            startDeck: Array.from(
              { length: 12 },
              (_, index) => `card-${index}`,
            ),
            levelUps: [],
          }),
        ],
      }),
    ).not.toThrow();
  });

  it("rejects strict-shape, revision, UUID and timestamp violations", () => {
    expect(() =>
      appDataSchema.parse({ ...validData(), extra: true }),
    ).toThrow();
    expect(() =>
      appDataSchema.parse({ ...validData(), revision: -1 }),
    ).toThrow();
    expect(() =>
      appDataSchema.parse({
        ...validData(),
        builds: [validBuild({ id: "not-a-uuid" })],
      }),
    ).toThrow();
    expect(() =>
      appDataSchema.parse({
        ...validData(),
        builds: [validBuild({ createdAt: "2024-02-30T03:04:05.000Z" })],
      }),
    ).toThrow();
  });

  it("trims names but preserves nonempty note whitespace and line breaks", () => {
    const data = appDataSchema.parse({
      schemaVersion: 1,
      revision: 0,
      builds: [
        validBuild({
          name: "  Preserve the name  ",
          guidance: {
            card: { text: "  first line\nsecond line  ", updatedAt: timestamp },
          },
        }),
      ],
    });

    expect(data.builds[0]?.name).toBe("Preserve the name");
    expect(data.builds[0]?.guidance.card?.text).toBe(
      "  first line\nsecond line  ",
    );
  });

  it("requires exact ordered start slots and contiguous ordered level-ups", () => {
    expect(() =>
      appDataSchema.parse({
        ...validData(),
        builds: [validBuild({ startPicks: [{ forLevel: 3, cardId: null }] })],
      }),
    ).toThrow();
    expect(() =>
      appDataSchema.parse({
        ...validData(),
        builds: [
          validBuild({ levelUps: [{ ...validBuild().levelUps[0], level: 5 }] }),
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate build/card/motivation keys and overlapping deck edits", () => {
    const duplicateBuild = validBuild();
    expect(() =>
      appDataSchema.parse({
        schemaVersion: 1,
        revision: 0,
        builds: [validBuild(), duplicateBuild],
      }),
    ).toThrow();

    expect(() =>
      appDataSchema.parse({
        ...validData(),
        builds: [validBuild({ startDeck: ["same-card", "same-card"] })],
      }),
    ).toThrow();
    expect(() =>
      appDataSchema.parse({
        ...validData(),
        builds: [
          validBuild({
            levelUps: [
              {
                level: 4,
                pick: "new-card",
                added: ["same-card"],
                dropped: ["same-card"],
              },
            ],
          }),
        ],
      }),
    ).toThrow();
    expect(() =>
      appDataSchema.parse({
        ...validData(),
        builds: [
          validBuild({
            motivations: [
              validBuild().motivations[0],
              validBuild().motivations[0],
            ],
          }),
        ],
      }),
    ).toThrow();
  });

  it("bounds identifiers, operation arrays, notes and serialized documents", () => {
    const tooLong = "x".repeat(101);
    expect(() =>
      appDataSchema.parse({
        ...validData(),
        builds: [validBuild({ characterId: tooLong })],
      }),
    ).toThrow();
    expect(() =>
      appDataSchema.parse({
        ...validData(),
        builds: [
          validBuild({ startDeck: Array.from({ length: 101 }, () => "x") }),
        ],
      }),
    ).toThrow();
    expect(() =>
      appDataSchema.parse({
        ...validData(),
        builds: [
          validBuild({
            guidance: {
              card: { text: "x".repeat(20_001), updatedAt: timestamp },
            },
          }),
        ],
      }),
    ).toThrow();

    const hugeGuidance = Object.fromEntries(
      Array.from({ length: 60 }, (_, index) => [
        `card-${index}`,
        { text: "x".repeat(20_000), updatedAt: timestamp },
      ]),
    );
    expect(() =>
      appDataSchema.parse({
        ...validData(),
        builds: [validBuild({ guidance: hugeGuidance })],
      }),
    ).toThrow();
  });

  it("validates the revision-wrapped PUT request", () => {
    expect(
      putDataRequestSchema.parse({ baseRevision: 4, data: validData() }),
    ).toMatchObject({ baseRevision: 4 });
    expect(() =>
      putDataRequestSchema.parse({
        baseRevision: 0,
        data: validData(),
        extra: true,
      }),
    ).toThrow();
  });
});
