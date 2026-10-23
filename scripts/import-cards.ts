import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rename,
  rm,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Card, CardLevel, Character } from "../src/shared/character";
import {
  characterDefinitions,
  frosthavenCharacters,
  mercenaryCharacters,
  snowdancer,
  geminateMeleeCards,
  type CharacterDefinition,
} from "./characters";

const RAW_REPOSITORY_URL =
  "https://raw.githubusercontent.com/cmlenius/gloomhaven-card-browser";
const SOURCE_METADATA_DIRECTORY = "data/character-abilities";
const SOURCE_IMAGE_PATH = "images/";
export const SOURCE_METADATA_URL = `${RAW_REPOSITORY_URL}/main/${SOURCE_METADATA_DIRECTORY}/frosthaven.json`;
export const SOURCE_IMAGE_BASE_URL = `${RAW_REPOSITORY_URL}/images/${SOURCE_IMAGE_PATH}`;
export const SOURCE_REPOSITORY =
  "https://github.com/cmlenius/gloomhaven-card-browser";
export const SOURCE_REVISION_URLS = {
  metadata:
    "https://api.github.com/repos/cmlenius/gloomhaven-card-browser/commits/main",
  images:
    "https://api.github.com/repos/cmlenius/gloomhaven-card-browser/commits/images",
} as const;

const GENERATED_DATA_DIRECTORY = "src/shared/data/characters";

export interface SourceCardRecord {
  name: string;
  expansion: string;
  image: string;
  level: string;
  initiative: string;
}

export interface SourceRevisions {
  metadata: string;
  images: string;
}

export interface ParsedCard extends Card {
  sourceImage: string;
}

export interface ParsedCardBack {
  image: string;
  outputPath: string;
}

export interface ParsedSourceRecords {
  cards: ParsedCard[];
  back?: ParsedCardBack;
}

export interface ImportPlan {
  source: CharacterDefinition["source"];
  character: Character;
  cards: ParsedCard[];
  back: ParsedCardBack;
  metadataChecksum: string;
  sourceRevisions: SourceRevisions;
}

export interface SourceManifest {
  generatedBy: string;
  source: {
    repository: string;
    metadata: {
      url: string;
      revision: string;
      sha256: string;
    };
    images: {
      baseUrl: string;
      revision: string;
    };
  };
  assets: Array<{
    id: string;
    source: string;
    sha256: string;
  }>;
  icon: {
    source: string;
    sha256: string;
  };
}

export type FetchImplementation = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface ImportFileSystem {
  mkdtemp: typeof mkdtemp;
  readFile: typeof readFile;
  rename: typeof rename;
  rm: typeof rm;
  mkdir: typeof mkdir;
  writeFile: typeof writeFile;
}

const defaultFileSystem: ImportFileSystem = {
  mkdtemp,
  readFile,
  rename,
  rm,
  mkdir,
  writeFile,
};

export interface ImportCardsOptions {
  character?: CharacterDefinition;
  projectRoot?: string;
  iconSource?: string;
  fetchImpl?: FetchImplementation;
  fileSystem?: Partial<ImportFileSystem>;
  requireCompleteCatalog?: boolean;
  sourceRevisions?: SourceRevisions;
}

export interface ImportCardsResult {
  character: Character;
  manifest: SourceManifest;
}

interface ExpectedCard {
  id: string;
  name: string;
  level: CardLevel;
  initiative: number;
}

const EXPECTED_CARDS: readonly ExpectedCard[] = [
  {
    id: "birds-in-a-tempest",
    name: "Birds in a Tempest",
    level: 2,
    initiative: 18,
  },
  { id: "biting-frost", name: "Biting Frost", level: 4, initiative: 16 },
  {
    id: "blinding-vortex",
    name: "Blinding Vortex",
    level: "X",
    initiative: 31,
  },
  { id: "blizzard", name: "Blizzard", level: 1, initiative: 71 },
  { id: "chilling-impact", name: "Chilling Impact", level: 1, initiative: 31 },
  { id: "cold-snap", name: "Cold Snap", level: 3, initiative: 86 },
  { id: "cold-therapy", name: "Cold Therapy", level: 1, initiative: 20 },
  { id: "cross-winds", name: "Cross Winds", level: 1, initiative: 32 },
  { id: "enticing-breeze", name: "Enticing Breeze", level: 1, initiative: 76 },
  { id: "freezing-storm", name: "Freezing Storm", level: 7, initiative: 81 },
  { id: "frigid-growth", name: "Frigid Growth", level: 1, initiative: 70 },
  { id: "frozen-brand", name: "Frozen Brand", level: 6, initiative: 33 },
  { id: "gathering-force", name: "Gathering Force", level: 1, initiative: 89 },
  { id: "lifting-gust", name: "Lifting Gust", level: 1, initiative: 27 },
  { id: "natures-breath", name: "Nature's Breath", level: 1, initiative: 90 },
  { id: "polar-vortex", name: "Polar Vortex", level: 3, initiative: 61 },
  {
    id: "refreshing-flurry",
    name: "Refreshing Flurry",
    level: 6,
    initiative: 95,
  },
  { id: "shifting-snow", name: "Shifting Snow", level: 5, initiative: 17 },
  { id: "snowball", name: "Snowball", level: 1, initiative: 23 },
  { id: "snowblind", name: "Snowblind", level: 9, initiative: 83 },
  { id: "storm-wall", name: "Storm Wall", level: 7, initiative: 30 },
  { id: "surging-blow", name: "Surging Blow", level: 8, initiative: 73 },
  {
    id: "the-endless-white",
    name: "The Endless White",
    level: 8,
    initiative: 5,
  },
  {
    id: "the-spirits-call",
    name: "The Spirit's Call",
    level: "X",
    initiative: 45,
  },
  { id: "tornado", name: "Tornado", level: 2, initiative: 59 },
  { id: "whipping-gale", name: "Whipping Gale", level: 5, initiative: 79 },
  { id: "whiteout", name: "Whiteout", level: 1, initiative: 21 },
  { id: "white-winds", name: "White Winds", level: "X", initiative: 11 },
  { id: "winds-of-change", name: "Winds of Change", level: 9, initiative: 15 },
  { id: "zephyr-barrier", name: "Zephyr Barrier", level: 4, initiative: 40 },
];

export function parseSourceRecords(
  records: readonly unknown[],
  character: CharacterDefinition = snowdancer,
): ParsedSourceRecords {
  const prefix = `character-ability-cards/${character.source.directory}/${character.id}/`;
  const backImage = `${prefix}${character.source.filePrefix}${character.id.toLowerCase()}-back.jpeg`;
  const imagePattern = new RegExp(
    `^${prefix}${character.source.filePrefix}[a-z0-9]+(?:-[a-z0-9]+)*\\.jpeg$`,
  );
  const characterRecords = records.filter((value) =>
    isCharacterRecord(value, character.id),
  );
  const cards: ParsedCard[] = [];
  let back: ParsedCardBack | undefined;

  for (const [index, value] of characterRecords.entries()) {
    const record = parseSourceRecord(value, index);
    if (!imagePattern.test(record.image)) {
      throw new Error(`Unsafe ${character.name} image path: ${record.image}`);
    }

    if (record.image === backImage) {
      if (back) {
        throw new Error(`Duplicate ${character.name} card back`);
      }
      if (record.level !== "-" || record.initiative !== "-") {
        throw new Error(
          `${character.name} card back has playable card metadata`,
        );
      }
      back = { image: record.image, outputPath: basename(record.image) };
      continue;
    }

    const parsed = parsePlayableCard(record, character);
    cards.push(parsed);
  }

  assertUnique(
    cards.map((card) => card.id),
    "card ID",
  );
  assertUnique(
    cards.map((card) => card.name.toLocaleLowerCase("en-US")),
    "display name",
  );

  cards.sort((left, right) => left.id.localeCompare(right.id));
  return { cards, back };
}

export function createImportPlan(
  records: readonly unknown[],
  options: {
    metadataChecksum: string;
    sourceRevisions: SourceRevisions;
    requireCompleteCatalog?: boolean;
    character?: CharacterDefinition;
  },
): ImportPlan {
  const character = options.character ?? snowdancer;
  const parsed = parseSourceRecords(records, character);
  if (!parsed.back) {
    throw new Error(`${character.name} source is missing the card back`);
  }
  const cards = parsed.cards.map(
    ({ sourceImage: _sourceImage, ...card }) => card,
  );

  if (options.requireCompleteCatalog !== false) {
    validateCatalog(cards, character);
  }

  return {
    source: character.source,
    character: {
      id: character.id,
      name: character.name,
      handSize: character.handSize,
      icon: `${character.id}.png`,
      cardBack: `${character.id}/${parsed.back.outputPath}`,
      cards,
    },
    cards: parsed.cards,
    back: parsed.back,
    metadataChecksum: options.metadataChecksum,
    sourceRevisions: options.sourceRevisions,
  };
}

export function validateCatalog(
  cards: readonly Card[],
  character: CharacterDefinition = snowdancer,
): void {
  const levelXCount = character.id === "GE" ? 4 : 3;
  const expectedCount = character.levelOneCards + levelXCount + 16;
  if (cards.length !== expectedCount) {
    throw new Error(
      `${character.name} catalog must contain ${expectedCount} playable cards, received ${cards.length}`,
    );
  }
  const counts = new Map<CardLevel, number>();
  for (const card of cards)
    counts.set(card.level, (counts.get(card.level) ?? 0) + 1);
  if (
    counts.get(1) !== character.levelOneCards ||
    counts.get("X") !== levelXCount ||
    Array.from({ length: 8 }, (_, index) => index + 2).some(
      (level) => counts.get(level as CardLevel) !== 2,
    )
  ) {
    throw new Error(
      `${character.name} catalog has incorrect card counts by level`,
    );
  }
  if (character.id !== "SD") return;

  const expectedById = new Map(EXPECTED_CARDS.map((card) => [card.id, card]));
  const actualIds = new Set<string>();
  for (const card of cards) {
    if (actualIds.has(card.id)) {
      throw new Error(`Duplicate Snowdancer card ID: ${card.id}`);
    }
    actualIds.add(card.id);
    const expected = expectedById.get(card.id);
    if (!expected) {
      throw new Error(`Unexpected Snowdancer card ID: ${card.id}`);
    }
    if (
      card.name !== expected.name ||
      card.level !== expected.level ||
      card.initiative !== expected.initiative ||
      card.image !== `SD/fh-${card.id}.jpeg`
    ) {
      throw new Error(
        `Snowdancer card metadata does not match the spec: ${card.id}`,
      );
    }
  }

  if (actualIds.size !== expectedById.size) {
    throw new Error("Snowdancer catalog is missing a card from the spec");
  }
}

export async function importCards(
  options: ImportCardsOptions = {},
): Promise<ImportCardsResult> {
  const character = options.character ?? snowdancer;
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const fileSystem = { ...defaultFileSystem, ...options.fileSystem };
  const sourceRevisions =
    options.sourceRevisions ?? (await fetchSourceRevisions(fetchImpl));
  const metadataResponse = await fetchRequired(
    fetchImpl,
    sourceMetadataUrl(sourceRevisions.metadata, character.source.directory),
    "source metadata download",
  );
  const metadataBytes = new Uint8Array(await metadataResponse.arrayBuffer());
  const metadataText = new TextDecoder().decode(metadataBytes);
  let records: unknown;
  try {
    records = JSON.parse(metadataText);
  } catch (error) {
    throw new Error("Source metadata is not valid JSON", { cause: error });
  }
  if (!Array.isArray(records)) {
    throw new Error("Source metadata must be an array");
  }

  const plan = createImportPlan(records, {
    metadataChecksum: sha256(metadataBytes),
    sourceRevisions,
    requireCompleteCatalog: options.requireCompleteCatalog,
    character,
  });
  const assetBytes = new Map<string, Uint8Array>();
  for (const card of plan.cards) {
    assetBytes.set(
      card.id,
      await downloadAsset(
        fetchImpl,
        card.sourceImage,
        card.id,
        sourceRevisions.images,
      ),
    );
  }
  const backId = `${plan.character.id.toLowerCase()}-back`;
  assetBytes.set(
    backId,
    await downloadAsset(
      fetchImpl,
      plan.back.image,
      "card back",
      sourceRevisions.images,
    ),
  );

  const iconSource =
    options.iconSource ??
    `icons/characters/${character.source.iconDirectory}/${character.id}.png`;
  const iconBytes = options.iconSource
    ? new Uint8Array(
        await fileSystem.readFile(
          isAbsolute(iconSource)
            ? iconSource
            : resolve(projectRoot, iconSource),
        ),
      )
    : await downloadAsset(
        fetchImpl,
        iconSource,
        "class icon",
        sourceRevisions.images,
      );
  const manifest = createManifest(plan, assetBytes, iconSource, iconBytes);
  await commitOutputs(
    projectRoot,
    plan,
    manifest,
    assetBytes,
    iconBytes,
    fileSystem,
  );

  return { character: plan.character, manifest };
}

export async function fetchSourceRevisions(
  fetchImpl: FetchImplementation,
): Promise<SourceRevisions> {
  const [metadataResponse, imagesResponse] = await Promise.all([
    fetchRequired(
      fetchImpl,
      SOURCE_REVISION_URLS.metadata,
      "metadata revision",
    ),
    fetchRequired(fetchImpl, SOURCE_REVISION_URLS.images, "image revision"),
  ]);
  const [metadata, images] = await Promise.all([
    readRevision(metadataResponse),
    readRevision(imagesResponse),
  ]);
  return { metadata, images };
}

function isCharacterRecord(
  value: unknown,
  characterId: string,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "image" in value &&
    typeof value.image === "string" &&
    value.image.includes(`/${characterId}/`)
  );
}

function parseSourceRecord(value: unknown, index: number): SourceCardRecord {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid character source record at index ${index}`);
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.name !== "string" ||
    typeof record.expansion !== "string" ||
    typeof record.image !== "string" ||
    typeof record.level !== "string" ||
    typeof record.initiative !== "string"
  ) {
    throw new Error(`Invalid character source record at index ${index}`);
  }
  return {
    name: record.name as string,
    expansion: record.expansion as string,
    image: record.image as string,
    level: record.level as string,
    initiative: record.initiative as string,
  };
}

function parsePlayableCard(
  record: SourceCardRecord,
  character: CharacterDefinition,
): ParsedCard {
  const characterId = character.id;
  const fileName = basename(record.image);
  const id = fileName.slice(
    character.source.filePrefix.length,
    -".jpeg".length,
  );
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`Unsafe character card slug: ${id}`);
  }
  const level = parseCardLevel(record.level);
  const initiative = parseInitiative(record.initiative, characterId === "BB");
  return {
    id,
    name: toDisplayName(record.name),
    level,
    initiative,
    image: `${characterId}/${fileName}`,
    sourceImage: record.image,
    ...(characterId === "GE"
      ? {
          form: geminateMeleeCards.has(id)
            ? ("melee" as const)
            : ("ranged" as const),
        }
      : {}),
  };
}

function parseCardLevel(level: string): CardLevel {
  if (level === "X") {
    return "X";
  }
  if (/^[1-9]$/.test(level)) {
    return Number(level) as CardLevel;
  }
  throw new Error(`Unsupported character card level: ${level}`);
}

function parseInitiative(
  initiative: string,
  dual: boolean,
): Card["initiative"] {
  if (dual && /^\d{2}\/\d{2}$/.test(initiative))
    return initiative as `${number}/${number}`;
  if (!/^\d{1,2}$/.test(initiative)) {
    throw new Error(`Unsupported character initiative: ${initiative}`);
  }
  return Number(initiative);
}

function toDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Character card display name cannot be empty");
  }
  const lowerCaseWords = new Set(["a", "an", "and", "in", "of", "on", "the"]);
  return trimmed
    .split(/\s+/)
    .map((word, index) => {
      if (index > 0 && lowerCaseWords.has(word)) {
        return word;
      }
      return `${word[0].toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate character ${label}: ${value}`);
    }
    seen.add(value);
  }
}

async function fetchRequired(
  fetchImpl: FetchImplementation,
  url: string,
  description: string,
): Promise<Response> {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed ${description}: HTTP ${response.status}`);
  }
  return response;
}

async function readRevision(response: Response): Promise<string> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new Error("Source revision response is not valid JSON", {
      cause: error,
    });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("sha" in body) ||
    typeof body.sha !== "string" ||
    !/^[a-f0-9]{40}$/.test(body.sha)
  ) {
    throw new Error("Source revision response did not contain a commit SHA");
  }
  return body.sha;
}

function sourceMetadataUrl(revision: string, directory: string): string {
  return `${RAW_REPOSITORY_URL}/${revision}/${SOURCE_METADATA_DIRECTORY}/${directory}.json`;
}

function sourceImageBaseUrl(revision: string): string {
  return `${RAW_REPOSITORY_URL}/${revision}/${SOURCE_IMAGE_PATH}`;
}

async function downloadAsset(
  fetchImpl: FetchImplementation,
  sourceImage: string,
  label: string,
  revision: string,
): Promise<Uint8Array> {
  const url = new URL(sourceImage, sourceImageBaseUrl(revision)).toString();
  const response = await fetchRequired(fetchImpl, url, `${label} download`);
  return new Uint8Array(await response.arrayBuffer());
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function createManifest(
  plan: ImportPlan,
  assetBytes: ReadonlyMap<string, Uint8Array>,
  iconSource: string,
  iconBytes: Uint8Array,
): SourceManifest {
  return {
    generatedBy: "scripts/import-cards.ts",
    source: {
      repository: SOURCE_REPOSITORY,
      metadata: {
        url: sourceMetadataUrl(
          plan.sourceRevisions.metadata,
          plan.source.directory,
        ),
        revision: plan.sourceRevisions.metadata,
        sha256: plan.metadataChecksum,
      },
      images: {
        baseUrl: sourceImageBaseUrl(plan.sourceRevisions.images),
        revision: plan.sourceRevisions.images,
      },
    },
    assets: [
      ...plan.cards.map((card) => ({
        id: card.id,
        source: card.sourceImage,
        sha256: sha256(assetBytes.get(card.id) as Uint8Array),
      })),
      {
        id: `${plan.character.id.toLowerCase()}-back`,
        source: plan.back.image,
        sha256: sha256(
          assetBytes.get(
            `${plan.character.id.toLowerCase()}-back`,
          ) as Uint8Array,
        ),
      },
    ],
    icon: { source: iconSource, sha256: sha256(iconBytes) },
  };
}

interface InstalledFileState {
  target: string;
  backup: string;
  hadPreviousFile: boolean;
  installed: boolean;
}

async function commitOutputs(
  projectRoot: string,
  plan: ImportPlan,
  manifest: SourceManifest,
  assetBytes: ReadonlyMap<string, Uint8Array>,
  iconBytes: Uint8Array,
  fileSystem: ImportFileSystem,
): Promise<void> {
  const generatedFiles = [
    {
      relativePath: `${GENERATED_DATA_DIRECTORY}/${plan.character.id}.json`,
      contents: `${JSON.stringify(plan.character, null, 2)}\n`,
    },
    {
      relativePath: `${GENERATED_DATA_DIRECTORY}/${plan.character.id}-source-manifest.json`,
      contents: `${JSON.stringify(manifest, null, 2)}\n`,
    },
    {
      relativePath: `${GENERATED_DATA_DIRECTORY}/index.ts`,
      contents: createCatalogIndex(),
    },
    ...plan.cards.map((card) => ({
      relativePath: `public/cards/${card.image}`,
      contents: assetBytes.get(card.id) as Uint8Array,
    })),
    {
      relativePath: `public/cards/${plan.character.id}/${plan.back.outputPath}`,
      contents: assetBytes.get(
        `${plan.character.id.toLowerCase()}-back`,
      ) as Uint8Array,
    },
    {
      relativePath: `public/icons/${plan.character.icon}`,
      contents: iconBytes,
    },
  ];

  const stagingDirectory = await fileSystem.mkdtemp(
    join(projectRoot, ".import-cards-"),
  );
  const fileStates: InstalledFileState[] = [];
  let committed = false;
  try {
    for (const [index, file] of generatedFiles.entries()) {
      const stagedPath = join(stagingDirectory, file.relativePath);
      await fileSystem.mkdir(dirname(stagedPath), { recursive: true });
      await fileSystem.writeFile(stagedPath, file.contents);

      const target = join(projectRoot, file.relativePath);
      await fileSystem.mkdir(dirname(target), { recursive: true });
      const backup = join(stagingDirectory, ".backups", `${index}.bak`);
      const state: InstalledFileState = {
        target,
        backup,
        hadPreviousFile: false,
        installed: false,
      };
      fileStates.push(state);
      try {
        await fileSystem.mkdir(dirname(backup), { recursive: true });
        await fileSystem.rename(target, backup);
        state.hadPreviousFile = true;
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
      }

      await fileSystem.rename(stagedPath, target);
      state.installed = true;
    }
    committed = true;
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const state of [...fileStates].reverse()) {
      if (state.installed) {
        try {
          await fileSystem.rm(state.target, { force: true });
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (state.hadPreviousFile) {
        try {
          await fileSystem.rename(state.backup, state.target);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
    }
    if (rollbackErrors.length > 0) {
      throw new Error(
        `Import failed and rollback incomplete; staging directory retained at ${stagingDirectory}. ${rollbackErrors.map(formatError).join("; ")}`,
        { cause: error },
      );
    }
    try {
      await fileSystem.rm(stagingDirectory, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new Error(
        `Import failed; rollback completed but staging directory retained at ${stagingDirectory}: ${formatError(cleanupError)}`,
        { cause: error },
      );
    }
    throw error;
  }

  if (committed) {
    await fileSystem.rm(stagingDirectory, { recursive: true, force: true });
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createCatalogIndex(): string {
  return `${characterDefinitions.map(({ id }) => `import ${id} from "./${id}.json" with { type: "json" };`).join("\n")}\nimport type { Character } from "../../character.js";\n\nexport const characterGroups = [\n  {\n    name: "Frosthaven",\n    characters: [\n${frosthavenCharacters.map(({ id }) => `      ${id},`).join("\n")}\n    ] as Character[],\n  },\n  {\n    name: "Mercenary Pack",\n    characters: [${mercenaryCharacters.map(({ id }) => id).join(", ")}] as Character[],\n  },\n];\n\nexport const characters = characterGroups.flatMap((group) => group.characters);\n\nexport function getCharacter(id: string): Character | undefined {\n  return characters.find((character) => character.id === id);\n}\n`;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function main(): Promise<void> {
  const sourceRevisions = await fetchSourceRevisions((input, init) =>
    fetch(input, init),
  );
  for (const character of characterDefinitions) {
    const result = await importCards({ character, sourceRevisions });
    console.log(
      `Imported ${result.character.cards.length} ${character.name} cards, card back, and class icon.`,
    );
  }
}

if (
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? "")
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
