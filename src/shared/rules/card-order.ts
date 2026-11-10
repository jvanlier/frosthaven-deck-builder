import type { Card, CardLevel } from "../character.js";

const printedLevel = (level: CardLevel): number => (level === "X" ? 1 : level);

// Replay ordering is ascending and deterministic; UI ordering is separate.
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

  const initiativeDifference =
    parseInt(String(left.initiative), 10) -
    parseInt(String(right.initiative), 10);
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

export function cardLevel(card: Card): number {
  return printedLevel(card.level);
}
