import { useMatch } from "react-router-dom";
import { useAppData } from "../app-data";
import { deckPath } from "../navigation/paths";
import { getCharacter } from "../../shared/data/characters/index.js";
import type { Character } from "../../shared/character.js";
import type { Build } from "../../shared/schema/index.js";

interface Workspace {
  character: Character | undefined;
  build: Build | undefined;
  buildId: string | null;
  characterId: string | null;
  level: number | null;
  levels: number[];
}

export function useWorkspace(): Workspace {
  const { data } = useAppData();
  const characterMatch = useMatch("/c/:characterId/*");
  const buildMatch = useMatch("/c/:characterId/b/:buildId/*");
  const characterId = characterMatch?.params.characterId ?? null;
  const character = getCharacter(characterId ?? "");
  const buildId = buildMatch?.params.buildId ?? null;
  const levelMatch = /^l\/(\d+)/.exec(buildMatch?.params["*"] ?? "");
  const level = levelMatch ? Number(levelMatch[1]) : null;
  const build =
    buildId === null
      ? undefined
      : data?.builds.find(
          (build) =>
            build.id === buildId && build.characterId === character?.id,
        );
  const levels = build
    ? [build.startLevel, ...build.levelUps.map(({ level: value }) => value)]
    : [];
  return { character, build, buildId, characterId, level, levels };
}

export function workspaceDeckPath(workspace: Workspace, level: number): string {
  return deckPath(workspace.characterId!, workspace.buildId!, level);
}
