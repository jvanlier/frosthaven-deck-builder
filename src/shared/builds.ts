import { z } from "zod";
import {
  buildNameSchema,
  buildSchema,
  cardIdSchema,
  MAX_OPERATION_ENTRIES,
  identifierSchema,
  levelSchema,
  noteTextSchema,
  type Build,
  type CardNote,
  type LevelUp,
} from "./schema/index.js";

export type { Build, CardNote, LevelUp } from "./schema/index.js";

export interface CreateBuildInput {
  characterId: string;
  name: string;
  startLevel: number;
}

export interface BuildMutationOptions {
  now?: () => string;
  id?: () => string;
  uuid?: () => string;
  generateId?: () => string;
}

export type BuildOperationKind =
  "start-pick" | "start-deck" | "pick" | "add" | "drop";

export interface BuildOperationIdentity {
  kind: BuildOperationKind;
  index: number;
  cardId?: string | null;
  forLevel?: number;
}

export function generateUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error("A cryptographically secure UUID source is unavailable");
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hexadecimal = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
}

export function createBuild(
  input: CreateBuildInput,
  options: BuildMutationOptions = {},
): Build {
  const startLevel = levelSchema.parse(input.startLevel);
  const timestamp = getNow(options);
  const id = getId(options);

  return buildSchema.parse({
    id,
    characterId: identifierSchema.parse(input.characterId),
    name: buildNameSchema.parse(input.name),
    startLevel,
    startPicks: Array.from({ length: startLevel - 1 }, (_, index) => ({
      forLevel: index + 2,
      cardId: null,
    })),
    startDeck: [],
    levelUps: [],
    cardNotes: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function setStartPick(
  build: Build,
  forLevel: number,
  cardId: string | null,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const slotLevel = levelSchema.parse(forLevel);
  const nextCardId = cardId === null ? null : cardIdSchema.parse(cardId);
  const pickIndex = build.startPicks.findIndex(
    (pick) => pick.forLevel === slotLevel,
  );
  if (pickIndex === -1) {
    throw new Error(`No starting pick slot exists for level ${slotLevel}`);
  }
  if (build.startPicks[pickIndex]?.cardId === nextCardId) {
    return build;
  }

  const startPicks = build.startPicks.map((pick, index) =>
    index === pickIndex ? { ...pick, cardId: nextCardId } : { ...pick },
  );
  return buildSchema.parse({
    ...build,
    startPicks,
    updatedAt: getNow(options),
  });
}

export function setStartDeck(
  build: Build,
  cardIds: readonly string[],
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const startDeck = z
    .array(cardIdSchema)
    .max(MAX_OPERATION_ENTRIES)
    .parse([...cardIds]);
  if (
    startDeck.length === build.startDeck.length &&
    startDeck.every((cardId, index) => cardId === build.startDeck[index])
  ) {
    return build;
  }

  return buildSchema.parse({
    ...build,
    startDeck,
    updatedAt: getNow(options),
  });
}

export function appendLevelUp(
  build: Build,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const nextLevel = build.startLevel + build.levelUps.length + 1;
  if (nextLevel > 9) {
    throw new Error("A build cannot have a level above 9");
  }
  return buildSchema.parse({
    ...build,
    levelUps: [
      ...build.levelUps.map(cloneLevelUp),
      { level: nextLevel, pick: null, added: [], dropped: [] },
    ],
    updatedAt: getNow(options),
  });
}

export function setLevelUp(
  build: Build,
  level: number,
  levelUp: Pick<LevelUp, "pick" | "added" | "dropped">,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const targetLevel = levelSchema.parse(level);
  const levelIndex = build.levelUps.findIndex(
    (candidate) => candidate.level === targetLevel,
  );
  if (levelIndex === -1) {
    throw new Error(`No level-up exists for level ${targetLevel}`);
  }

  const nextLevelUp = {
    level: targetLevel,
    pick: levelUp.pick === null ? null : cardIdSchema.parse(levelUp.pick),
    added: z
      .array(cardIdSchema)
      .max(MAX_OPERATION_ENTRIES)
      .parse(levelUp.added),
    dropped: z
      .array(cardIdSchema)
      .max(MAX_OPERATION_ENTRIES)
      .parse(levelUp.dropped),
  };
  const levelUps = build.levelUps.map((candidate, index) =>
    index === levelIndex ? nextLevelUp : cloneLevelUp(candidate),
  );
  return buildSchema.parse({
    ...build,
    levelUps,
    updatedAt: getNow(options),
  });
}

export function removeBuildOperation(
  build: Build,
  level: number,
  operation: BuildOperationIdentity,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  if (operation.kind === "start-pick") {
    if (operation.forLevel === undefined) {
      return build;
    }
    const pick = build.startPicks.find(
      (candidate) => candidate.forLevel === operation.forLevel,
    );
    if (!pick || pick.cardId !== operation.cardId) {
      return build;
    }
    return setStartPick(build, operation.forLevel, null, options);
  }

  if (operation.kind === "start-deck") {
    const cardId = build.startDeck[operation.index];
    if (cardId === undefined || cardId !== operation.cardId) {
      return build;
    }
    return setStartDeck(
      build,
      build.startDeck.filter((_, index) => index !== operation.index),
      options,
    );
  }

  const levelUp = build.levelUps.find((candidate) => candidate.level === level);
  if (!levelUp) {
    return build;
  }

  if (operation.kind === "pick") {
    if (levelUp.pick !== operation.cardId) {
      return build;
    }
    return setLevelUp(
      build,
      level,
      {
        pick: null,
        added: levelUp.added.filter((cardId) => cardId !== operation.cardId),
        dropped: [...levelUp.dropped],
      },
      options,
    );
  }

  const values = operation.kind === "add" ? levelUp.added : levelUp.dropped;
  if (values[operation.index] !== operation.cardId) {
    return build;
  }
  const nextValues = values.filter((_, index) => index !== operation.index);
  return setLevelUp(
    build,
    level,
    operation.kind === "add"
      ? {
          pick: levelUp.pick,
          added: nextValues,
          dropped: [...levelUp.dropped],
        }
      : {
          pick: levelUp.pick,
          added: [...levelUp.added],
          dropped: nextValues,
        },
    options,
  );
}

export function restorePickedCard(
  build: Build,
  level: number,
  cardId: string,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const levelUp = build.levelUps.find((candidate) => candidate.level === level);
  if (!levelUp || levelUp.pick !== cardId || levelUp.added.includes(cardId)) {
    return build;
  }
  return setLevelUp(
    build,
    level,
    {
      pick: levelUp.pick,
      added: [...levelUp.added, cardId],
      dropped: [...levelUp.dropped],
    },
    options,
  );
}

export function deleteHighestLevel(
  build: Build,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const highest = build.levelUps.at(-1);
  if (!highest) {
    throw new Error("A build has no level-up to delete");
  }
  return buildSchema.parse({
    ...build,
    levelUps: build.levelUps.slice(0, -1).map(cloneLevelUp),
    cardNotes: build.cardNotes.filter((note) => note.level !== highest.level),
    updatedAt: getNow(options),
  });
}

export function renameBuild(
  build: Build,
  name: string,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const nextName = buildNameSchema.parse(name);
  if (nextName === build.name) {
    return build;
  }

  return buildSchema.parse({
    ...build,
    name: nextName,
    updatedAt: getNow(options),
  });
}

export function copyBuild(
  build: Build,
  name: string,
  options: BuildMutationOptions = {},
): Build {
  const timestamp = getNow(options);
  return buildSchema.parse({
    id: getId(options),
    characterId: build.characterId,
    name: buildNameSchema.parse(name),
    startLevel: build.startLevel,
    startPicks: build.startPicks.map((pick) => ({ ...pick })),
    startDeck: [...build.startDeck],
    levelUps: build.levelUps.map((levelUp) => ({
      ...levelUp,
      added: [...levelUp.added],
      dropped: [...levelUp.dropped],
    })),
    cardNotes: build.cardNotes.map((note) => ({ ...note })),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function deleteBuild(builds: Build[], buildId: string): Build[] {
  identifierSchema.parse(buildId);
  if (!builds.some((build) => build.id === buildId)) {
    return builds;
  }
  return builds.filter((build) => build.id !== buildId);
}

/**
 * The note that applies to a card at a level: the one recorded at the highest
 * level up to and including that level. Notes record synergies, so they carry
 * forward until a later level records a new version.
 */
export function effectiveCardNote(
  build: Build,
  cardId: string,
  level: number,
): CardNote | undefined {
  let effective: CardNote | undefined;
  for (const note of build.cardNotes) {
    if (
      note.cardId === cardId &&
      note.level <= level &&
      (!effective || note.level > effective.level)
    ) {
      effective = note;
    }
  }
  return effective;
}

/** Every recorded version of a card's note, from lowest to highest level. */
export function cardNoteHistory(build: Build, cardId: string): CardNote[] {
  return build.cardNotes
    .filter((note) => note.cardId === cardId)
    .sort((left, right) => left.level - right.level);
}

/**
 * Records a card's note at a level. Text that matches what the level would
 * inherit anyway removes that level's version instead, so an empty note is
 * only stored when it clears an inherited one.
 */
export function setCardNote(
  build: Build,
  cardId: string,
  level: number,
  text: string,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const noteCardId = cardIdSchema.parse(cardId);
  const noteLevel = levelSchema.parse(level);
  const noteText = noteTextSchema.parse(text);
  const existing = build.cardNotes.find(
    (note) => note.cardId === noteCardId && note.level === noteLevel,
  );
  if (existing?.text === noteText) {
    return build;
  }
  const inherited = effectiveCardNote(build, noteCardId, noteLevel - 1);
  if (noteText === (inherited?.text ?? "")) {
    return existing
      ? removeCardNote(build, noteCardId, noteLevel, options)
      : build;
  }

  const updatedAt = getNow(options);
  const next = {
    cardId: noteCardId,
    level: noteLevel,
    text: noteText,
    updatedAt,
  };
  return buildSchema.parse({
    ...build,
    cardNotes: existing
      ? build.cardNotes.map((note) => (note === existing ? next : { ...note }))
      : [...build.cardNotes.map((note) => ({ ...note })), next],
    updatedAt,
  });
}

/** Removes a level's version so the card falls back to its older note. */
export function removeCardNote(
  build: Build,
  cardId: string,
  level: number,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const cardNotes = build.cardNotes.filter(
    (note) => note.cardId !== cardId || note.level !== level,
  );
  if (cardNotes.length === build.cardNotes.length) {
    return build;
  }
  return buildSchema.parse({ ...build, cardNotes, updatedAt: getNow(options) });
}

function cloneLevelUp(levelUp: LevelUp): LevelUp {
  return {
    ...levelUp,
    added: [...levelUp.added],
    dropped: [...levelUp.dropped],
  };
}

function getNow(options: Pick<BuildMutationOptions, "now">): string {
  return options.now?.() ?? new Date().toISOString();
}

function getId(options: BuildMutationOptions): string {
  return (
    options.id?.() ??
    options.uuid?.() ??
    options.generateId?.() ??
    generateUuid()
  );
}
