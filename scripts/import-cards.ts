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

export const SOURCE_METADATA_URL =
  "https://raw.githubusercontent.com/cmlenius/gloomhaven-card-browser/main/data/character-abilities/frosthaven.json";
export const SOURCE_IMAGE_BASE_URL =
  "https://raw.githubusercontent.com/cmlenius/gloomhaven-card-browser/images/images/";
export const SOURCE_REPOSITORY =
  "https://github.com/cmlenius/gloomhaven-card-browser";
export const SOURCE_REVISION_URLS = {
  metadata:
    "https://api.github.com/repos/cmlenius/gloomhaven-card-browser/commits/main",
  images:
    "https://api.github.com/repos/cmlenius/gloomhaven-card-browser/commits/images",
} as const;

const SOURCE_IMAGE_PREFIX = "character-ability-cards/frosthaven/SD/";
const SOURCE_IMAGE_PATTERN =
  /^character-ability-cards\/frosthaven\/SD\/fh-[a-z0-9]+(?:-[a-z0-9]+)*\.jpeg$/;
const BACK_SOURCE_IMAGE = `${SOURCE_IMAGE_PREFIX}fh-sd-back.jpeg`;
const GENERATED_CARD_DIRECTORY = "public/cards/SD";
const GENERATED_DATA_DIRECTORY = "src/shared/data/characters";
const GENERATED_ICON_PATH = "public/icons/SD.png";
const DEFAULT_ICON_SOURCE = "docs/mockup/snowdancer-icon.png";

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

export interface ImportCardsOptions {
  projectRoot?: string;
  iconSource?: string;
  fetchImpl?: FetchImplementation;
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
): ParsedSourceRecords {
  const snowdancerRecords = records.filter(isSnowdancerRecord);
  const cards: ParsedCard[] = [];
  let back: ParsedCardBack | undefined;

  for (const [index, value] of snowdancerRecords.entries()) {
    const record = parseSourceRecord(value, index);
    if (!SOURCE_IMAGE_PATTERN.test(record.image)) {
      throw new Error(`Unsafe Snowdancer image path: ${record.image}`);
    }

    if (record.image === BACK_SOURCE_IMAGE) {
      if (back) {
        throw new Error("Duplicate Snowdancer card back");
      }
      if (record.level !== "-" || record.initiative !== "-") {
        throw new Error("Snowdancer card back has playable card metadata");
      }
      back = { image: record.image, outputPath: "fh-sd-back.jpeg" };
      continue;
    }

    const parsed = parsePlayableCard(record);
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
  },
): ImportPlan {
  const parsed = parseSourceRecords(records);
  if (!parsed.back) {
    throw new Error("Snowdancer source is missing the card back");
  }
  const cards = parsed.cards.map(
    ({ sourceImage: _sourceImage, ...card }) => card,
  );

  if (options.requireCompleteCatalog !== false) {
    validateCatalog(cards);
  }

  return {
    character: {
      id: "SD",
      name: "Snowdancer",
      handSize: 11,
      icon: "SD.png",
      cards,
    },
    cards: parsed.cards,
    back: parsed.back,
    metadataChecksum: options.metadataChecksum,
    sourceRevisions: options.sourceRevisions,
  };
}

export function validateCatalog(cards: readonly Card[]): void {
  if (cards.length !== EXPECTED_CARDS.length) {
    throw new Error(
      `Snowdancer catalog must contain 30 playable cards, received ${cards.length}`,
    );
  }

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

  const levelCounts = new Map<CardLevel, number>();
  for (const card of cards) {
    levelCounts.set(card.level, (levelCounts.get(card.level) ?? 0) + 1);
  }
  if (levelCounts.get(1) !== 11 || levelCounts.get("X") !== 3) {
    throw new Error(
      "Snowdancer catalog must contain 11 level-1 and 3 level-X cards",
    );
  }
  for (let level = 2; level <= 9; level += 1) {
    if (levelCounts.get(level as CardLevel) !== 2) {
      throw new Error(
        `Snowdancer catalog must contain two level-${level} cards`,
      );
    }
  }
}

export async function importCards(
  options: ImportCardsOptions = {},
): Promise<ImportCardsResult> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const sourceRevisions =
    options.sourceRevisions ?? (await fetchSourceRevisions(fetchImpl));
  const metadataResponse = await fetchRequired(
    fetchImpl,
    SOURCE_METADATA_URL,
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
  });
  const assetBytes = new Map<string, Uint8Array>();
  for (const card of plan.cards) {
    assetBytes.set(
      card.id,
      await downloadAsset(fetchImpl, card.sourceImage, card.id),
    );
  }
  assetBytes.set(
    "sd-back",
    await downloadAsset(fetchImpl, plan.back.image, "card back"),
  );

  const iconSource = options.iconSource ?? DEFAULT_ICON_SOURCE;
  const iconPath = isAbsolute(iconSource)
    ? iconSource
    : resolve(projectRoot, iconSource);
  const iconBytes = new Uint8Array(await readFile(iconPath));
  const manifest = createManifest(plan, assetBytes, iconSource, iconBytes);
  await commitOutputs(projectRoot, plan, manifest, assetBytes, iconBytes);

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

function isSnowdancerRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "image" in value &&
    typeof value.image === "string" &&
    value.image.includes("/SD/")
  );
}

function parseSourceRecord(value: unknown, index: number): SourceCardRecord {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid Snowdancer source record at index ${index}`);
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.name !== "string" ||
    typeof record.expansion !== "string" ||
    typeof record.image !== "string" ||
    typeof record.level !== "string" ||
    typeof record.initiative !== "string"
  ) {
    throw new Error(`Invalid Snowdancer source record at index ${index}`);
  }
  return {
    name: record.name as string,
    expansion: record.expansion as string,
    image: record.image as string,
    level: record.level as string,
    initiative: record.initiative as string,
  };
}

function parsePlayableCard(record: SourceCardRecord): ParsedCard {
  const fileName = basename(record.image);
  const id = fileName.slice(3, -".jpeg".length);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`Unsafe Snowdancer card slug: ${id}`);
  }
  const level = parseCardLevel(record.level);
  const initiative = parseInitiative(record.initiative);
  return {
    id,
    name: toDisplayName(record.name),
    level,
    initiative,
    image: `SD/${fileName}`,
    sourceImage: record.image,
  };
}

function parseCardLevel(level: string): CardLevel {
  if (level === "X") {
    return "X";
  }
  if (/^[1-9]$/.test(level)) {
    return Number(level) as CardLevel;
  }
  throw new Error(`Unsupported Snowdancer card level: ${level}`);
}

function parseInitiative(initiative: string): number {
  if (!/^\d{1,2}$/.test(initiative)) {
    throw new Error(`Unsupported Snowdancer initiative: ${initiative}`);
  }
  return Number(initiative);
}

function toDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Snowdancer card display name cannot be empty");
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
      throw new Error(`Duplicate Snowdancer ${label}: ${value}`);
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

async function downloadAsset(
  fetchImpl: FetchImplementation,
  sourceImage: string,
  label: string,
): Promise<Uint8Array> {
  const url = new URL(sourceImage, SOURCE_IMAGE_BASE_URL).toString();
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
        url: SOURCE_METADATA_URL,
        revision: plan.sourceRevisions.metadata,
        sha256: plan.metadataChecksum,
      },
      images: {
        baseUrl: SOURCE_IMAGE_BASE_URL,
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
        id: "sd-back",
        source: plan.back.image,
        sha256: sha256(assetBytes.get("sd-back") as Uint8Array),
      },
    ],
    icon: { source: iconSource, sha256: sha256(iconBytes) },
  };
}

async function commitOutputs(
  projectRoot: string,
  plan: ImportPlan,
  manifest: SourceManifest,
  assetBytes: ReadonlyMap<string, Uint8Array>,
  iconBytes: Uint8Array,
): Promise<void> {
  const generatedFiles = [
    {
      relativePath: `${GENERATED_DATA_DIRECTORY}/SD.json`,
      contents: `${JSON.stringify(plan.character, null, 2)}\n`,
    },
    {
      relativePath: `${GENERATED_DATA_DIRECTORY}/source-manifest.json`,
      contents: `${JSON.stringify(manifest, null, 2)}\n`,
    },
    {
      relativePath: `${GENERATED_DATA_DIRECTORY}/index.ts`,
      contents: createCatalogIndex(),
    },
    ...plan.cards.map((card) => ({
      relativePath: `${GENERATED_CARD_DIRECTORY}/fh-${card.id}.jpeg`,
      contents: assetBytes.get(card.id) as Uint8Array,
    })),
    {
      relativePath: `${GENERATED_CARD_DIRECTORY}/${plan.back.outputPath}`,
      contents: assetBytes.get("sd-back") as Uint8Array,
    },
    { relativePath: GENERATED_ICON_PATH, contents: iconBytes },
  ];

  const stagingDirectory = await mkdtemp(join(projectRoot, ".import-cards-"));
  const installedFiles: Array<{ target: string; backup?: string }> = [];
  try {
    for (const [index, file] of generatedFiles.entries()) {
      const stagedPath = join(stagingDirectory, file.relativePath);
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, file.contents);

      const target = join(projectRoot, file.relativePath);
      await mkdir(dirname(target), { recursive: true });
      const backup = join(stagingDirectory, ".backups", `${index}.bak`);
      let previousFile = false;
      try {
        await mkdir(dirname(backup), { recursive: true });
        await rename(target, backup);
        previousFile = true;
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
      }

      try {
        await rename(stagedPath, target);
      } catch (error) {
        if (previousFile) {
          await rename(backup, target);
        }
        throw error;
      }
      installedFiles.push({
        target,
        backup: previousFile ? backup : undefined,
      });
    }
  } catch (error) {
    for (const installed of installedFiles.reverse()) {
      await rm(installed.target, { force: true });
      if (installed.backup) {
        await rename(installed.backup, installed.target);
      }
    }
    throw error;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

function createCatalogIndex(): string {
  return `import snowdancerData from "./SD.json" with { type: "json" };\nimport type { Character } from "../../character.js";\n\nconst snowdancer = snowdancerData as unknown as Character;\nexport const characters: Character[] = [snowdancer];\n\nexport function getCharacter(id: string): Character | undefined {\n  return characters.find((character) => character.id === id);\n}\n`;
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
  const result = await importCards();
  console.log(
    `Imported ${result.character.cards.length} Snowdancer cards and the local card back.`,
  );
}

if (
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? "")
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
