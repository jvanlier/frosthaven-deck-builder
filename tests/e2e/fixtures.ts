export const fixtureBuildId = "123e4567-e89b-42d3-a456-426614174000";
export const fixtureData = {
  schemaVersion: 2,
  revision: 0,
  builds: [
    {
      id: fixtureBuildId,
      characterId: "SD",
      name: "Freeze control",
      startLevel: 1,
      startPicks: [],
      startDeck: [],
      levelUps: [],
      cardNotes: [],
      createdAt: "2024-01-02T03:04:05.000Z",
      updatedAt: "2024-01-02T03:04:05.000Z",
    },
  ],
};
export const fullFixtureData = {
  ...fixtureData,
  builds: [
    {
      ...fixtureData.builds[0],
      levelUps: Array.from({ length: 8 }, (_, index) => ({
        level: index + 2,
        pick: null,
        added: [],
        dropped: [],
      })),
    },
  ],
};
export const startThreeFixtureData = {
  ...fixtureData,
  builds: [
    {
      ...fixtureData.builds[0],
      id: "123e4567-e89b-42d3-a456-426614174001",
      name: "Starting three",
      startLevel: 3,
      startPicks: [
        { forLevel: 2, cardId: "birds-in-a-tempest" },
        { forLevel: 3, cardId: "tornado" },
      ],
    },
  ],
};
export const deckFixtureData = {
  ...fixtureData,
  builds: [
    {
      ...fixtureData.builds[0],
      startDeck: [
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
      ],
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
          cardId: "cold-therapy",
          level: 1,
          text: "Use early.\nPair with Snowball.",
          updatedAt: "2024-01-02T03:04:05.000Z",
        },
        {
          cardId: "birds-in-a-tempest",
          level: 2,
          text: "The best level-up pick.",
          updatedAt: "2024-01-02T03:04:05.000Z",
        },
        {
          cardId: "whiteout",
          level: 2,
          text: "The weakest initiative.",
          updatedAt: "2024-01-02T03:04:05.000Z",
        },
      ],
    },
  ],
};

export const overviewFixtureData = {
  ...deckFixtureData,
  builds: [
    {
      ...deckFixtureData.builds[0],
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
          added: ["tornado", "white-winds"],
          dropped: ["snowball", "blizzard"],
        },
      ],
    },
  ],
};

export const invalidDeckFixtureData = {
  ...deckFixtureData,
  builds: [
    {
      ...deckFixtureData.builds[0],
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: [],
          dropped: ["whiteout"],
        },
      ],
    },
  ],
};

export const lastPositionStorageKey = "frosthaven-deck-builder:last-position";
export const levelUpBuildId = "123e4567-e89b-42d3-a456-426614174002";
const levelUpBaseBuild = {
  ...fixtureData.builds[0],
  id: levelUpBuildId,
  name: "Level-up lab",
  startDeck: deckFixtureData.builds[0].startDeck,
};
export const levelUpFixtureData = {
  ...fixtureData,
  builds: [levelUpBaseBuild],
};
export const revisedLevelFixtureData = {
  ...fixtureData,
  builds: [
    {
      ...levelUpBaseBuild,
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest"],
          dropped: ["whiteout"],
        },
      ],
    },
  ],
};
export const plannedLaterFixtureData = {
  ...fixtureData,
  builds: [
    {
      ...levelUpBaseBuild,
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
          dropped: ["snowball"],
        },
      ],
    },
  ],
};
export const invalidEditedLevelFixtureData = {
  ...revisedLevelFixtureData,
  builds: [
    {
      ...revisedLevelFixtureData.builds[0],
      levelUps: [
        {
          level: 2,
          pick: "birds-in-a-tempest",
          added: ["birds-in-a-tempest", "tornado"],
          dropped: ["whiteout"],
        },
      ],
    },
  ],
};
export const resetDuringSaveFixtureData = {
  ...revisedLevelFixtureData,
  builds: [
    {
      ...revisedLevelFixtureData.builds[0],
      name: "Keep this name",
      cardNotes: [
        {
          cardId: "tornado",
          level: 1,
          text: "Keep this unrelated note.",
          updatedAt: "2024-01-02T03:04:05.000Z",
        },
      ],
    },
  ],
};
