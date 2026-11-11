import { getCharacter } from "./data/characters/index.js";
import type { AppData } from "./schema/index.js";

export function hasSupportedCharacters(data: AppData): boolean {
  return data.builds.every(
    (build) => getCharacter(build.characterId) !== undefined,
  );
}
