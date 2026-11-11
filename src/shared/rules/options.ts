import type { Card, Character } from "../character.js";
import type { Build } from "../schema/index.js";
import { cardLevel, sortedCards } from "./card-order.js";
import { cardMap, levelState, maxLevel, pool, replayBuild } from "./replay.js";

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

/** Starting setup works downward: higher slots reserve cards, lower slots do not. */
export function startingPickOptions(
  build: Build,
  character: Character,
  forLevel: number,
): Card[] {
  if (!build.startPicks.some((pick) => pick.forLevel === forLevel)) {
    return [];
  }
  const reserved = new Set(
    build.startPicks
      .filter((pick) => pick.forLevel > forLevel)
      .map((pick) => pick.cardId),
  );
  return sortedCards(character.cards).filter(
    (card) =>
      cardLevel(card) > 1 &&
      cardLevel(card) <= forLevel &&
      !reserved.has(card.id),
  );
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
