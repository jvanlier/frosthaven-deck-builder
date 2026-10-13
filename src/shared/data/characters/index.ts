import snowdancerData from "./SD.json" with { type: "json" };
import type { Character } from "../../character.js";

const snowdancer = snowdancerData as unknown as Character;
export const characters: Character[] = [snowdancer];

export function getCharacter(id: string): Character | undefined {
  return characters.find((character) => character.id === id);
}
