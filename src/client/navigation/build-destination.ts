import type { Character } from "../../shared/character.js";
import type { Build } from "../../shared/schema/index.js";
import { canAppendLevel, replayBuild } from "../../shared/rules/index.js";
import { deckPath, levelUpPath, startEditorPath } from "./paths";

export function buildEntryPath(
  build: Build,
  levels: ReturnType<typeof replayBuild>["levels"],
): string {
  const firstIssue = levels.find((state) => state.issues.length > 0);
  if (build.levelUps.length === 0 && firstIssue) {
    return startEditorPath(build);
  }
  return deckPath(
    build.characterId,
    build.id,
    firstIssue?.level ?? levels.at(-1)!.level,
  );
}

export function levelUpDestination(
  build: Build,
  character: Character,
): string | null {
  const replay = replayBuild(build, character);
  const starting = replay.levels[0];
  if (starting?.issues.length) {
    return startEditorPath(build);
  }

  const unfinished = replay.levels
    .slice(1)
    .find((state) => state.issues.length);
  if (unfinished) {
    return levelUpPath(character.id, build.id, unfinished.level);
  }

  if (canAppendLevel(build, character)) {
    return levelUpPath(
      character.id,
      build.id,
      build.startLevel + build.levelUps.length + 1,
    );
  }
  return null;
}
