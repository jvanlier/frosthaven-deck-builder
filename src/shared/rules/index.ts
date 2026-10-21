import type { Card, CardLevel, Character } from "../character.js";
import type {
  Build,
  LevelUp,
  Motivation,
  Pick as BuildPick,
  MotivationKind,
} from "../schema/index.js";

export type IssueSeverity = "incomplete" | "invalid";

export type RuleIssueCode =
  | "MISSING_PICK"
  | "DECK_TOO_SMALL"
  | "DECK_TOO_LARGE"
  | "UNKNOWN_CARD"
  | "PICK_TOO_HIGH"
  | "PICK_ALREADY_IN_POOL"
  | "DUPLICATE_PICK"
  | "PICK_NOT_ADDED"
  | "ADD_NOT_IN_POOL"
  | "ADD_ALREADY_IN_PREV_DECK"
  | "DUPLICATE_ADD"
  | "DROP_NOT_IN_PREV_DECK"
  | "DUPLICATE_DROP"
  | "START_CARD_NOT_IN_POOL"
  | "DUPLICATE_START_CARD";

export type RuleOperationKind =
  "start-pick" | "start-deck" | "pick" | "add" | "drop";

export interface RuleOperationIdentity {
  kind: RuleOperationKind;
  index: number;
  cardId?: string | null;
  forLevel?: number;
}

export interface RuleIssue {
  code: RuleIssueCode;
  severity: IssueSeverity;
  level: number;
  message: string;
  cardId?: string;
  forLevel?: number;
  operation?: RuleOperationIdentity;
}

export interface AppliedStartingPick {
  forLevel: number;
  cardId: string;
}

export interface AppliedOperations {
  startingPicks: AppliedStartingPick[];
  pick: string | null;
  added: string[];
  dropped: string[];
}

export interface StoredOperations {
  startingPicks: BuildPick[];
  pick: string | null;
  added: string[];
  dropped: string[];
}

export interface ApplicableMotivationContext {
  kind: MotivationKind;
  /** The stored motivation level, which is the start level for initial picks. */
  level: number;
  /** The displayed slot level for an initial pick. */
  forLevel?: number;
}

export interface RuleLevelState {
  level: number;
  pool: Card[];
  deck: Card[];
  issues: RuleIssue[];
  stored: StoredOperations;
  applied: AppliedOperations;
  activeMotivations: Motivation[];
}

export interface ReplayResult {
  levels: RuleLevelState[];
  issues: RuleIssue[];
  startingPicks: AppliedStartingPick[];
}

export interface DeckEditConflict {
  cardId: string;
  existing: "added" | "dropped";
  requested: "added" | "dropped";
}

export interface DeckEdit {
  added: string[];
  dropped: string[];
  conflicts?: DeckEditConflict[];
}

export interface ApplyDeckEditOptions {
  /** Existing records that were loaded from storage and must not be lost. */
  existing: Pick<DeckEdit, "added" | "dropped">;
  /** Replay-derived valid records; all other existing records remain unresolved. */
  validAdded: readonly string[];
  validDropped: readonly string[];
}

const printedLevel = (level: CardLevel): number => (level === "X" ? 1 : level);

function compareCards(left: Card, right: Card): number {
  const effectiveDifference =
    printedLevel(left.level) - printedLevel(right.level);
  if (effectiveDifference !== 0) {
    return effectiveDifference;
  }

  // Level 1 is printed before X when both have the same effective level.
  const printedDifference =
    (left.level === "X" ? 1 : 0) - (right.level === "X" ? 1 : 0);
  if (printedDifference !== 0) {
    return printedDifference;
  }

  const initiativeDifference = left.initiative - right.initiative;
  if (initiativeDifference !== 0) {
    return initiativeDifference;
  }
  if (left.name !== right.name) {
    return left.name < right.name ? -1 : 1;
  }
  if (left.id !== right.id) {
    return left.id < right.id ? -1 : 1;
  }
  return 0;
}

export function sortedCards(cards: Iterable<Card>): Card[] {
  return [...cards].sort(compareCards);
}

function cardLevel(card: Card): number {
  return printedLevel(card.level);
}

function cardMap(character: Character): Map<string, Card> {
  return new Map(character.cards.map((card) => [card.id, card]));
}

function maxLevel(build: Build): number {
  return build.startLevel + build.levelUps.length;
}

function levelState(
  result: ReplayResult,
  level: number,
): RuleLevelState | undefined {
  return result.levels.find((candidate) => candidate.level === level);
}

function issue(
  code: RuleIssueCode,
  severity: IssueSeverity,
  level: number,
  message: string,
  details: Omit<RuleIssue, "code" | "severity" | "level" | "message"> = {},
): RuleIssue {
  return { code, severity, level, message, ...details };
}

function unknownCardIssue(
  cardId: string,
  level: number,
  operation: RuleOperationIdentity,
): RuleIssue {
  return issue("UNKNOWN_CARD", "invalid", level, `Unknown card: ${cardId}`, {
    cardId,
    operation,
  });
}

function sizeIssues(
  level: number,
  deckSize: number,
  handSize: number,
): RuleIssue[] {
  if (deckSize < handSize) {
    return [
      issue(
        "DECK_TOO_SMALL",
        "incomplete",
        level,
        `Deck has ${deckSize} cards; ${handSize} are required`,
      ),
    ];
  }
  if (deckSize > handSize) {
    return [
      issue(
        "DECK_TOO_LARGE",
        "invalid",
        level,
        `Deck has ${deckSize} cards; ${handSize} are allowed`,
      ),
    ];
  }
  return [];
}

function startingPool(character: Character): Set<string> {
  return new Set(
    character.cards
      .filter((card) => cardLevel(card) === 1)
      .map((card) => card.id),
  );
}

function replayStartingState(
  build: Build,
  character: Character,
  cards: Map<string, Card>,
): {
  poolIds: Set<string>;
  deckIds: Set<string>;
  issues: RuleIssue[];
  applied: AppliedStartingPick[];
} {
  const poolIds = startingPool(character);
  const applied: AppliedStartingPick[] = [];
  const issues: RuleIssue[] = [];

  for (const [index, pick] of build.startPicks.entries()) {
    const operation: RuleOperationIdentity = {
      kind: "start-pick",
      index,
      cardId: pick.cardId,
      forLevel: pick.forLevel,
    };
    if (pick.cardId === null) {
      issues.push(
        issue(
          "MISSING_PICK",
          "incomplete",
          build.startLevel,
          `Level ${pick.forLevel} pick has not been chosen`,
          { forLevel: pick.forLevel, operation },
        ),
      );
      continue;
    }

    const card = cards.get(pick.cardId);
    if (!card) {
      issues.push(unknownCardIssue(pick.cardId, build.startLevel, operation));
      continue;
    }
    if (cardLevel(card) > pick.forLevel) {
      issues.push(
        issue(
          "PICK_TOO_HIGH",
          "invalid",
          build.startLevel,
          `${card.name} cannot be picked at level ${pick.forLevel}`,
          {
            cardId: card.id,
            forLevel: pick.forLevel,
            operation,
          },
        ),
      );
      continue;
    }
    if (poolIds.has(card.id)) {
      issues.push(
        issue(
          "PICK_ALREADY_IN_POOL",
          "invalid",
          build.startLevel,
          `${card.name} is already in the pool`,
          { cardId: card.id, forLevel: pick.forLevel, operation },
        ),
      );
      continue;
    }

    poolIds.add(card.id);
    applied.push({ forLevel: pick.forLevel, cardId: card.id });
  }

  const deckIds = new Set<string>();
  for (const [index, cardId] of build.startDeck.entries()) {
    const operation: RuleOperationIdentity = {
      kind: "start-deck",
      index,
      cardId,
    };
    const card = cards.get(cardId);
    if (!card) {
      issues.push(unknownCardIssue(cardId, build.startLevel, operation));
      continue;
    }
    if (!poolIds.has(cardId)) {
      issues.push(
        issue(
          "START_CARD_NOT_IN_POOL",
          "invalid",
          build.startLevel,
          `${card.name} is not in the starting pool`,
          { cardId, operation },
        ),
      );
      continue;
    }
    if (deckIds.has(cardId)) {
      issues.push(
        issue(
          "DUPLICATE_START_CARD",
          "invalid",
          build.startLevel,
          `${card.name} occurs more than once in the starting deck`,
          { cardId, operation },
        ),
      );
      continue;
    }
    deckIds.add(cardId);
  }

  issues.push(
    ...sizeIssues(build.startLevel, deckIds.size, character.handSize),
  );
  return { poolIds, deckIds, issues, applied };
}

function levelUpState(
  levelUp: LevelUp,
  level: number,
  previousPool: Set<string>,
  previousDeck: Set<string>,
  cards: Map<string, Card>,
  handSize: number,
): {
  poolIds: Set<string>;
  deckIds: Set<string>;
  issues: RuleIssue[];
  applied: AppliedOperations;
} {
  const poolIds = new Set(previousPool);
  const deckIds = new Set(previousDeck);
  const issues: RuleIssue[] = [];
  const applied: AppliedOperations = {
    startingPicks: [],
    pick: null,
    added: [],
    dropped: [],
  };

  const pickOperation: RuleOperationIdentity = {
    kind: "pick",
    index: 0,
    cardId: levelUp.pick,
  };
  if (levelUp.pick === null) {
    issues.push(
      issue(
        "MISSING_PICK",
        "incomplete",
        level,
        `Level ${level} pick has not been chosen`,
        { operation: pickOperation },
      ),
    );
  } else {
    const card = cards.get(levelUp.pick);
    if (!card) {
      issues.push(unknownCardIssue(levelUp.pick, level, pickOperation));
    } else if (cardLevel(card) > level) {
      issues.push(
        issue(
          "PICK_TOO_HIGH",
          "invalid",
          level,
          `${card.name} cannot be picked at level ${level}`,
          { cardId: card.id, operation: pickOperation },
        ),
      );
    } else if (poolIds.has(card.id)) {
      issues.push(
        issue(
          "PICK_ALREADY_IN_POOL",
          "invalid",
          level,
          `${card.name} is already in the pool`,
          { cardId: card.id, operation: pickOperation },
        ),
      );
    } else {
      poolIds.add(card.id);
      applied.pick = card.id;
    }
  }

  const dropped = new Set<string>();
  for (const [index, cardId] of levelUp.dropped.entries()) {
    const operation: RuleOperationIdentity = {
      kind: "drop",
      index,
      cardId,
    };
    if (dropped.has(cardId)) {
      issues.push(
        issue(
          "DUPLICATE_DROP",
          "invalid",
          level,
          `Card ${cardId} is dropped more than once`,
          { cardId, operation },
        ),
      );
      continue;
    }
    dropped.add(cardId);
    const card = cards.get(cardId);
    if (!card) {
      issues.push(unknownCardIssue(cardId, level, operation));
      continue;
    }
    if (!previousDeck.has(cardId)) {
      issues.push(
        issue(
          "DROP_NOT_IN_PREV_DECK",
          "invalid",
          level,
          `${card.name} is not in the preceding deck`,
          { cardId, operation },
        ),
      );
      continue;
    }
    deckIds.delete(cardId);
    applied.dropped.push(cardId);
  }

  const added = new Set<string>();
  for (const [index, cardId] of levelUp.added.entries()) {
    const operation: RuleOperationIdentity = {
      kind: "add",
      index,
      cardId,
    };
    if (added.has(cardId)) {
      issues.push(
        issue(
          "DUPLICATE_ADD",
          "invalid",
          level,
          `Card ${cardId} is added more than once`,
          { cardId, operation },
        ),
      );
      continue;
    }
    added.add(cardId);
    const card = cards.get(cardId);
    if (!card) {
      issues.push(unknownCardIssue(cardId, level, operation));
      continue;
    }
    if (!poolIds.has(cardId)) {
      issues.push(
        issue(
          "ADD_NOT_IN_POOL",
          "invalid",
          level,
          `${card.name} is not in the pool`,
          { cardId, operation },
        ),
      );
      continue;
    }
    if (previousDeck.has(cardId)) {
      issues.push(
        issue(
          "ADD_ALREADY_IN_PREV_DECK",
          "invalid",
          level,
          `${card.name} is already in the preceding deck`,
          { cardId, operation },
        ),
      );
      continue;
    }
    if (deckIds.has(cardId)) {
      issues.push(
        issue(
          "DUPLICATE_ADD",
          "invalid",
          level,
          `${card.name} is already in this deck`,
          { cardId, operation },
        ),
      );
      continue;
    }
    deckIds.add(cardId);
    applied.added.push(cardId);
  }

  if (applied.pick !== null && !applied.added.includes(applied.pick)) {
    issues.push(
      issue(
        "PICK_NOT_ADDED",
        "invalid",
        level,
        `Picked card ${applied.pick} must be added to the deck`,
        {
          cardId: applied.pick,
          operation: pickOperation,
        },
      ),
    );
  }
  issues.push(...sizeIssues(level, deckIds.size, handSize));
  return { poolIds, deckIds, issues, applied };
}

function activeMotivations(
  build: Build,
  character: Character,
  state: RuleLevelState,
  startingPicks: AppliedStartingPick[],
): Motivation[] {
  return build.motivations.filter((motivation) =>
    applicableMotivationContextsForState(
      build,
      character,
      state,
      startingPicks,
      motivation.cardId,
    ).some(
      (context) =>
        context.level === motivation.level && context.kind === motivation.kind,
    ),
  );
}

function applicableMotivationContextsForState(
  build: Build,
  character: Character,
  state: RuleLevelState,
  startingPicks: AppliedStartingPick[],
  cardId: string,
): ApplicableMotivationContext[] {
  const card = cardMap(character).get(cardId);
  if (!card) {
    return [];
  }

  const contexts: ApplicableMotivationContext[] = [];
  if (state.level === build.startLevel) {
    const initialPick = startingPicks.find((pick) => pick.cardId === cardId);
    if (initialPick) {
      contexts.push({
        kind: "add",
        level: build.startLevel,
        forLevel: initialPick.forLevel,
      });
    } else if (state.deck.some((candidate) => candidate.id === cardId)) {
      contexts.push({ kind: "add", level: build.startLevel });
    }
    if (
      cardLevel(card) <= build.startLevel &&
      !state.deck.some((candidate) => candidate.id === cardId)
    ) {
      contexts.push({ kind: "exclude", level: build.startLevel });
    }
    return contexts;
  }

  if (state.applied.pick === cardId || state.applied.added.includes(cardId)) {
    contexts.push({ kind: "add", level: state.level });
  }
  if (state.applied.dropped.includes(cardId)) {
    contexts.push({ kind: "drop", level: state.level });
  }
  if (
    state.applied.pick &&
    cardLevel(card) <= state.level &&
    !state.pool.some((candidate) => candidate.id === cardId)
  ) {
    contexts.push({ kind: "exclude", level: state.level });
  }
  return contexts;
}

export function replayBuild(build: Build, character: Character): ReplayResult {
  const cards = cardMap(character);
  const starting = replayStartingState(build, character, cards);
  const levels: RuleLevelState[] = [
    {
      level: build.startLevel,
      pool: sortedCards(
        [...starting.poolIds].flatMap((cardId) => {
          const card = cards.get(cardId);
          return card ? [card] : [];
        }),
      ),
      deck: sortedCards(
        [...starting.deckIds].flatMap((cardId) => {
          const card = cards.get(cardId);
          return card ? [card] : [];
        }),
      ),
      issues: starting.issues,
      stored: {
        startingPicks: build.startPicks.map((pick) => ({ ...pick })),
        pick: null,
        added: [],
        dropped: [],
      },
      applied: {
        startingPicks: starting.applied,
        pick: null,
        added: [],
        dropped: [],
      },
      activeMotivations: [],
    },
  ];

  let previousPool = starting.poolIds;
  let previousDeck = starting.deckIds;
  for (const levelUp of build.levelUps) {
    const transition = levelUpState(
      levelUp,
      levelUp.level,
      previousPool,
      previousDeck,
      cards,
      character.handSize,
    );
    const state: RuleLevelState = {
      level: levelUp.level,
      pool: sortedCards(
        [...transition.poolIds].flatMap((cardId) => {
          const card = cards.get(cardId);
          return card ? [card] : [];
        }),
      ),
      deck: sortedCards(
        [...transition.deckIds].flatMap((cardId) => {
          const card = cards.get(cardId);
          return card ? [card] : [];
        }),
      ),
      issues: transition.issues,
      stored: {
        startingPicks: [],
        pick: levelUp.pick,
        added: [...levelUp.added],
        dropped: [...levelUp.dropped],
      },
      applied: transition.applied,
      activeMotivations: [],
    };
    levels.push(state);
    previousPool = transition.poolIds;
    previousDeck = transition.deckIds;
  }

  for (const state of levels) {
    state.activeMotivations = activeMotivations(
      build,
      character,
      state,
      starting.applied,
    );
  }

  return {
    levels,
    issues: levels.flatMap((state) => state.issues),
    startingPicks: starting.applied,
  };
}

export function applicableMotivationContexts(
  build: Build,
  character: Character,
  level: number,
  cardId: string,
): ApplicableMotivationContext[] {
  const result = replayBuild(build, character);
  const state = levelState(result, level);
  return state
    ? applicableMotivationContextsForState(
        build,
        character,
        state,
        result.startingPicks,
        cardId,
      )
    : [];
}

export function validateBuild(build: Build, character: Character): RuleIssue[] {
  return replayBuild(build, character).issues;
}

export function pool(
  build: Build,
  character: Character,
  requestedLevel?: number,
): Card[] {
  const result = replayBuild(build, character);
  const target = requestedLevel ?? maxLevel(build);
  const state = levelState(result, Math.max(build.startLevel, target));
  return state?.pool ?? result.levels.at(-1)?.pool ?? [];
}

export function deck(
  build: Build,
  character: Character,
  requestedLevel?: number,
): Card[] {
  const result = replayBuild(build, character);
  const target = requestedLevel ?? maxLevel(build);
  const state = levelState(result, Math.max(build.startLevel, target));
  return state?.deck ?? result.levels.at(-1)?.deck ?? [];
}

export function pickOptions(
  build: Build,
  character: Character,
  level: number,
): Card[] {
  if (!Number.isInteger(level) || level < 2 || level > 9) {
    return [];
  }
  const result = replayBuild(build, character);
  const cards = cardMap(character);
  const poolBefore = new Set<string>();

  if (level <= build.startLevel) {
    for (const card of character.cards) {
      if (cardLevel(card) === 1) {
        poolBefore.add(card.id);
      }
    }
    for (const pick of result.startingPicks) {
      if (pick.forLevel < level) {
        poolBefore.add(pick.cardId);
      }
    }
  } else {
    const previous = levelState(result, level - 1);
    if (previous) {
      for (const card of previous.pool) {
        poolBefore.add(card.id);
      }
    } else {
      for (const card of result.levels.at(-1)?.pool ?? []) {
        poolBefore.add(card.id);
      }
    }
  }

  return sortedCards(
    character.cards.filter(
      (card) => cardLevel(card) <= level && !poolBefore.has(card.id),
    ),
  ).filter((card) => cards.has(card.id));
}

export function addOptions(
  build: Build,
  character: Character,
  requestedLevel?: number,
): Card[] {
  const target = requestedLevel ?? maxLevel(build);
  const result = replayBuild(build, character);
  const current = levelState(result, Math.max(build.startLevel, target));
  const previous =
    target <= build.startLevel
      ? undefined
      : (levelState(result, target - 1) ?? result.levels.at(-1));
  const excluded = new Set(
    (
      previous?.deck ??
      (target <= build.startLevel
        ? (levelState(result, build.startLevel)?.deck ?? [])
        : [])
    ).map((card) => card.id),
  );
  if (current?.applied.pick) {
    excluded.add(current.applied.pick);
  }
  const availablePool =
    current?.pool ??
    result.levels.at(-1)?.pool ??
    pool(build, character, target);
  return availablePool.filter((card) => !excluded.has(card.id));
}

export function applyDeckEdit(
  previousDeck: readonly string[],
  nextDeck: readonly string[],
  options?: ApplyDeckEditOptions,
): DeckEdit {
  const previous = new Set(previousDeck);
  const next = new Set(nextDeck);
  const added = nextDeck.filter((cardId) => !previous.has(cardId));
  const dropped = previousDeck.filter((cardId) => !next.has(cardId));

  if (!options) {
    return { added, dropped };
  }

  const validAdded = new Set(options.validAdded);
  const validDropped = new Set(options.validDropped);
  const unresolvedAdded = options.existing.added.filter(
    (cardId) => !validAdded.has(cardId),
  );
  const unresolvedDropped = options.existing.dropped.filter(
    (cardId) => !validDropped.has(cardId),
  );
  const unresolvedAddedSet = new Set(unresolvedAdded);
  const unresolvedDroppedSet = new Set(unresolvedDropped);
  const conflicts: DeckEditConflict[] = [];

  for (const cardId of added) {
    if (unresolvedDroppedSet.has(cardId)) {
      conflicts.push({
        cardId,
        existing: "dropped",
        requested: "added",
      });
    }
  }
  for (const cardId of dropped) {
    if (unresolvedAddedSet.has(cardId)) {
      conflicts.push({
        cardId,
        existing: "added",
        requested: "dropped",
      });
    }
  }

  const conflictIds = new Set(conflicts.map((conflict) => conflict.cardId));
  const result: DeckEdit = {
    added: [
      ...unresolvedAdded,
      ...added.filter(
        (cardId) => !unresolvedAddedSet.has(cardId) && !conflictIds.has(cardId),
      ),
    ],
    dropped: [
      ...unresolvedDropped,
      ...dropped.filter(
        (cardId) =>
          !unresolvedDroppedSet.has(cardId) && !conflictIds.has(cardId),
      ),
    ],
  };
  if (conflicts.length > 0) {
    result.conflicts = conflicts;
  }
  return result;
}

export const normalizeDeckEdit = applyDeckEdit;

export function canAppendLevel(build: Build, character: Character): boolean {
  if (maxLevel(build) >= 9) {
    return false;
  }
  return replayBuild(build, character).issues.length === 0;
}

export const isAppendAllowed = canAppendLevel;

export function applicableMotivations(
  build: Build,
  character: Character,
  level?: number,
): Motivation[] {
  const result = replayBuild(build, character);
  const state = levelState(result, level ?? build.startLevel);
  return state?.activeMotivations ?? [];
}

export const getApplicableMotivations = applicableMotivations;
