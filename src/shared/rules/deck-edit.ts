import type {
  ApplyDeckEditOptions,
  DeckEdit,
  DeckEditConflict,
} from "./types.js";

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
