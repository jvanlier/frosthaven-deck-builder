import {
  setStartDeck,
  setStartPick,
  type BuildMutationOptions,
} from "../../shared/builds.js";
import type { Build } from "../../shared/schema/index.js";

export function chooseStartingPick(
  build: Build,
  forLevel: number,
  cardId: string,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const current = build.startPicks.find((pick) => pick.forLevel === forLevel);
  const next = setStartPick(
    build,
    forLevel,
    current?.cardId === cardId ? null : cardId,
    options,
  );
  // Replacing/unpicking a pool card also removes it from the hand, unless
  // another slot still owns it. Leave unrelated invalid entries and notes alone.
  const nextDeck = build.startDeck.filter(
    (id) =>
      id !== current?.cardId ||
      next.startPicks.some((pick) => pick.cardId === id),
  );
  if (current?.cardId !== cardId && !nextDeck.includes(cardId)) {
    nextDeck.push(cardId);
  }
  return setStartDeck(next, nextDeck, options);
}

/** Selection comes from replay; stored hand entries may be invalid. */
export function toggleStartingDeckCard(
  build: Build,
  cardId: string,
  isSelected: boolean,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const nextDeck = isSelected
    ? build.startDeck.filter((id) => id !== cardId)
    : [...build.startDeck, cardId];
  return setStartDeck(build, nextDeck, options);
}
