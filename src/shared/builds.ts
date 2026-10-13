import { z } from "zod";
import {
  buildNameSchema,
  buildSchema,
  cardIdSchema,
  MAX_OPERATION_ENTRIES,
  identifierSchema,
  levelSchema,
  motivationKey,
  motivationKindSchema,
  noteTextSchema,
  type Build,
  type LevelUp,
  type MotivationKind,
} from "./schema/index.js";

export { motivationKey } from "./schema/index.js";
export type { Build, LevelUp, MotivationKind } from "./schema/index.js";

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

export interface MotivationInput {
  kind: MotivationKind;
  cardId: string;
  text: string;
  level?: number;
  /** The slot level of an initial pick. Its stored motivation uses startLevel. */
  forLevel?: number;
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
    motivations: [],
    guidance: {},
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
    motivations: build.motivations.filter(
      (motivation) => motivation.level !== highest.level,
    ),
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
    motivations: build.motivations.map((motivation) => ({ ...motivation })),
    guidance: Object.fromEntries(
      Object.entries(build.guidance).map(([cardId, note]) => [
        cardId,
        { ...note },
      ]),
    ),
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

export function upsertNote(
  build: Build,
  cardId: string,
  text: string,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  cardIdSchema.parse(cardId);
  noteTextSchema.parse(text);
  const existing = build.guidance[cardId];
  if (text === "" && existing === undefined) {
    return build;
  }
  if (text !== "" && existing?.text === text) {
    return build;
  }

  const guidance = cloneRecord(build.guidance);
  if (text === "") {
    delete guidance[cardId];
  } else {
    setRecordValue(guidance, cardId, {
      text,
      updatedAt: getNow(options),
    });
  }
  return buildSchema.parse({
    ...build,
    guidance,
    updatedAt: guidance[cardId]?.updatedAt ?? getNow(options),
  });
}

export const upsertGuidance = upsertNote;

export function upsertMotivation(
  build: Build,
  input: MotivationInput,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const kind = motivationKindSchema.parse(input.kind);
  const cardId = cardIdSchema.parse(input.cardId);
  const level = resolveMotivationLevel(build, { ...input, kind });
  const text = noteTextSchema.parse(input.text);
  const key = motivationKey(level, cardId, kind);
  const existingIndex = build.motivations.findIndex(
    (motivation) =>
      motivationKey(motivation.level, motivation.cardId, motivation.kind) ===
      key,
  );
  const existing =
    existingIndex === -1 ? undefined : build.motivations[existingIndex];

  if (text === "" && existing === undefined) {
    return build;
  }
  if (text !== "" && existing?.text === text) {
    return build;
  }

  const motivations = [...build.motivations];
  let mutationTimestamp: string | undefined;
  if (text === "") {
    motivations.splice(existingIndex, 1);
  } else {
    mutationTimestamp = getNow(options);
    const next = {
      level,
      cardId,
      kind,
      text,
      updatedAt: mutationTimestamp,
    };
    if (existingIndex === -1) {
      motivations.push(next);
    } else {
      motivations[existingIndex] = next;
    }
  }

  return buildSchema.parse({
    ...build,
    motivations,
    updatedAt: mutationTimestamp ?? getNow(options),
  });
}

function resolveMotivationLevel(
  build: Build,
  input: MotivationInput & { kind: MotivationKind },
): number {
  const isInitialPick =
    input.kind === "add" &&
    input.level !== undefined &&
    build.startPicks.some(
      (pick) => pick.forLevel === input.level && pick.cardId === input.cardId,
    );
  if (
    input.kind === "exclude" ||
    input.forLevel !== undefined ||
    isInitialPick
  ) {
    if (input.forLevel !== undefined) {
      levelSchema.parse(input.forLevel);
      if (input.forLevel < 2 || input.forLevel > build.startLevel) {
        throw new Error(
          "An initial pick slot must be between 2 and startLevel",
        );
      }
    }
    return build.startLevel;
  }
  if (input.level === undefined) {
    throw new Error("A level is required for a non-initial motivation");
  }
  return levelSchema.parse(input.level);
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

function cloneRecord<T>(record: Record<string, T>): Record<string, T> {
  const clone = Object.create(null) as Record<string, T>;
  for (const key of Object.keys(record)) {
    setRecordValue(clone, key, record[key]!);
  }
  return clone;
}

function setRecordValue<T>(
  record: Record<string, T>,
  key: string,
  value: T,
): void {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function getId(options: BuildMutationOptions): string {
  return (
    options.id?.() ??
    options.uuid?.() ??
    options.generateId?.() ??
    generateUuid()
  );
}
