import type { Card, CardLevel, Character } from "../shared/character.js";
import { replayBuild, type RuleLevelState } from "../shared/rules/index.js";
import type { Build, CardNote } from "../shared/schema/index.js";

export type OverviewMembership = "deck" | "pool" | "not-in-pool";
export type OverviewMarker = "picked" | "added" | "dropped";

export interface OverviewCell {
  card: Card;
  membership: OverviewMembership;
  marker?: OverviewMarker;
  markerForLevel?: number;
  /** The non-empty note recorded for this card at exactly this level. */
  note?: CardNote;
}

export interface OverviewLevelSummary {
  level: number;
  pick: string | null;
  startingPicks: { cardId: string; forLevel: number }[];
  isStartingLevel: boolean;
  addedCount: number;
  extraAddedCount: number;
  droppedCount: number;
}

export interface OverviewLevel {
  level: number;
  cells: OverviewCell[];
  summary: OverviewLevelSummary;
  state: RuleLevelState;
}

export interface OverviewGroup {
  level: CardLevel;
  cards: Card[];
}

export interface OverviewModel {
  groups: OverviewGroup[];
  levels: OverviewLevel[];
}

/**
 * Projects the replayed build into the card-by-level matrix used by the
 * overview. Membership and markers intentionally come from applied replay
 * operations, so invalid stored operations remain visible to repair screens but
 * cannot make the matrix claim a card is in a pool or deck.
 */
export function buildOverviewModel(
  build: Build,
  character: Character,
): OverviewModel {
  const replay = replayBuild(build, character);
  const groups = groupCards(character.cards);
  const levels = replay.levels.map((state) => ({
    level: state.level,
    cells: character.cards.map((card) => makeCell(card, state, build)),
    summary: makeSummary(state, build),
    state,
  }));

  return { groups, levels };
}

function makeCell(
  card: Card,
  state: RuleLevelState,
  build: Build,
): OverviewCell {
  const deckIds = new Set(state.deck.map((candidate) => candidate.id));
  const poolIds = new Set(state.pool.map((candidate) => candidate.id));
  const marker = markerFor(card.id, state, build);
  const markerForLevel =
    state.level === build.startLevel
      ? state.applied.startingPicks.find((pick) => pick.cardId === card.id)
          ?.forLevel
      : undefined;
  return {
    card,
    membership: deckIds.has(card.id)
      ? "deck"
      : poolIds.has(card.id)
        ? "pool"
        : "not-in-pool",
    marker,
    markerForLevel,
    note: build.cardNotes.find(
      (note) =>
        note.cardId === card.id && note.level === state.level && note.text,
    ),
  };
}

function markerFor(
  cardId: string,
  state: RuleLevelState,
  build: Build,
): OverviewMarker | undefined {
  if (state.level === build.startLevel) {
    return state.applied.startingPicks.some((pick) => pick.cardId === cardId)
      ? "picked"
      : undefined;
  }
  if (state.applied.pick === cardId) {
    return "picked";
  }
  if (state.applied.added.includes(cardId)) {
    return "added";
  }
  if (state.applied.dropped.includes(cardId)) {
    return "dropped";
  }
  return undefined;
}

function makeSummary(
  state: RuleLevelState,
  build: Build,
): OverviewLevelSummary {
  const isStartingLevel = state.level === build.startLevel;
  const extraAdded = isStartingLevel
    ? []
    : state.applied.added.filter((cardId) => cardId !== state.applied.pick);
  return {
    level: state.level,
    pick: state.applied.pick,
    startingPicks: state.applied.startingPicks.map((pick) => ({
      cardId: pick.cardId,
      forLevel: pick.forLevel,
    })),
    isStartingLevel,
    addedCount: isStartingLevel ? 0 : state.applied.added.length,
    extraAddedCount: extraAdded.length,
    droppedCount: isStartingLevel ? 0 : state.applied.dropped.length,
  };
}

function groupCards(cards: Card[]): OverviewGroup[] {
  const groups = new Map<CardLevel, Card[]>();
  for (const card of cards) {
    const group = groups.get(card.level) ?? [];
    group.push(card);
    groups.set(card.level, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => compareLevels(left, right))
    .map(([level, group]) => ({
      level,
      cards: [...group].sort(compareCards),
    }));
}

function compareLevels(left: CardLevel, right: CardLevel): number {
  const effectiveDifference = effectiveLevel(left) - effectiveLevel(right);
  if (effectiveDifference !== 0) {
    return effectiveDifference;
  }
  return left === right ? 0 : left === "X" ? 1 : -1;
}

function compareCards(left: Card, right: Card): number {
  const initiativeDifference =
    parseInt(String(left.initiative), 10) -
    parseInt(String(right.initiative), 10);
  if (initiativeDifference !== 0) {
    return initiativeDifference;
  }
  const nameDifference = left.name.localeCompare(right.name);
  return nameDifference !== 0
    ? nameDifference
    : left.id.localeCompare(right.id);
}

function effectiveLevel(level: CardLevel): number {
  return level === "X" ? 1 : level;
}
