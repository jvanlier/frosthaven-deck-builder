import type { Build } from "../../shared/schema/index.js";

export function deckPath(
  characterId: string,
  buildId: string,
  level: number,
): string {
  return `/c/${encodeURIComponent(characterId)}/b/${encodeURIComponent(buildId)}/l/${level}`;
}

export function startEditorPath(build: Build, focusForLevel?: number): string {
  const path = `${deckPath(build.characterId, build.id, build.startLevel)}/start`;
  return focusForLevel === undefined ? path : `${path}?focus=${focusForLevel}`;
}

export function levelUpPath(
  characterId: string,
  buildId: string,
  level: number,
): string {
  return `${deckPath(characterId, buildId, level)}/level-up`;
}

export function cardDetailPath(
  characterId: string,
  buildId: string,
  cardId: string,
): string {
  return `/c/${encodeURIComponent(characterId)}/b/${encodeURIComponent(buildId)}/card/${encodeURIComponent(cardId)}`;
}

export function overviewPath(characterId: string, buildId: string): string {
  return `/c/${encodeURIComponent(characterId)}/b/${encodeURIComponent(buildId)}/overview`;
}
