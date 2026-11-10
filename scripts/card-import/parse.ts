import { basename } from "node:path";
import type { Card, CardLevel } from "../../src/shared/character";
import {
  snowdancer,
  geminateMeleeCards,
  type CharacterDefinition,
} from "../characters";
import type {
  ImportPlan,
  ParsedCard,
  ParsedCardBack,
  ParsedSourceRecords,
  SourceCardRecord,
  SourceRevisions,
} from "./types";

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
