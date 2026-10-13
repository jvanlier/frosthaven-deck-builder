import {
  buildNameSchema,
  buildSchema,
  cardIdSchema,
  identifierSchema,
  levelSchema,
  motivationKey,
  motivationKindSchema,
  noteTextSchema,
  type Build,
  type MotivationKind,
} from "./schema/index.js";

export { motivationKey } from "./schema/index.js";
export type { Build, MotivationKind } from "./schema/index.js";

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
  if (existing?.text === text) {
    return build;
  }

  const guidance = { ...build.guidance };
  if (text === "") {
    delete guidance[cardId];
  } else {
    guidance[cardId] = { text, updatedAt: getNow(options) };
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
  if (existing?.text === text) {
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
