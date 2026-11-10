import type { Card, Character } from "../character.js";
import type { Build, LevelUp } from "../schema/index.js";
import { cardLevel, sortedCards } from "./card-order.js";
import type {
  AppliedOperations,
  AppliedStartingPick,
  IssueSeverity,
  ReplayResult,
  RuleIssue,
  RuleIssueCode,
  RuleLevelState,
  RuleOperationIdentity,
} from "./types.js";

// Internal lookups shared with candidate options, outside the public API.
export function cardMap(character: Character): Map<string, Card> {
  return new Map(character.cards.map((card) => [card.id, card]));
}

export function maxLevel(build: Build): number {
  return build.startLevel + build.levelUps.length;
}

export function levelState(
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
  deckIds: Set<string>,
  cards: Map<string, Card>,
  handSize: number,
): RuleIssue[] {
  const deckSize = deckIds.size;
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
  const deck = [...deckIds].map((id) => cards.get(id));
  const melee = deck.filter((card) => card?.form === "melee").length;
  const ranged = deck.filter((card) => card?.form === "ranged").length;
  if (melee + ranged > 0 && (melee !== 7 || ranged !== 7)) {
    return [
      issue(
        "FORM_IMBALANCE",
        "invalid",
        level,
        `Geminate requires 7 melee and 7 ranged cards; this deck has ${melee} melee and ${ranged} ranged cards`,
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
    ...sizeIssues(build.startLevel, deckIds, cards, character.handSize),
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
  issues.push(...sizeIssues(level, deckIds, cards, handSize));
  return { poolIds, deckIds, issues, applied };
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
    };
    levels.push(state);
    previousPool = transition.poolIds;
    previousDeck = transition.deckIds;
  }

  return {
    levels,
    issues: levels.flatMap((state) => state.issues),
    startingPicks: starting.applied,
  };
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

export function canAppendLevel(build: Build, character: Character): boolean {
  if (maxLevel(build) >= 9) {
    return false;
  }
  return replayBuild(build, character).issues.length === 0;
}
