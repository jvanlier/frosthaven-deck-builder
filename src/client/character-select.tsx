import { useState } from "react";
import { Link } from "react-router-dom";
import { useAppData } from "./app-data";
import { DataBackupControls } from "./build-editor";
import { deckPath, readLastPosition } from "./deck-view";
import {
  characterGroups,
  getCharacter,
} from "../shared/data/characters/index.js";

export function CharacterSelect() {
  const { data } = useAppData();
  const [position] = useState(readLastPosition);
  const lastBuild =
    position &&
    data?.builds.find(
      (build) =>
        build.id === position.buildId &&
        build.characterId === position.characterId &&
        (build.startLevel === position.level ||
          build.levelUps.some(({ level }) => level === position.level)),
    );
  const lastCharacter = getCharacter(lastBuild?.characterId ?? "");

  return (
    <main className="page-content" aria-labelledby="characters-heading">
      <section className="page-intro">
        <p className="eyebrow">Frosthaven Deck Builder</p>
        <h1 id="characters-heading">Choose your character</h1>
        <p>
          Plan decks for all Frosthaven and Gloomhaven Mercenary Pack classes,
          from your starting hand to level 9.
        </p>
        {lastBuild && lastCharacter && position ? (
          <Link
            className="button-link"
            to={deckPath(
              position.characterId,
              position.buildId,
              position.level,
            )}
          >
            Resume {lastCharacter.name} · {lastBuild.name} · Level{" "}
            {position.level}
          </Link>
        ) : null}
      </section>
      {characterGroups.map((group, index) => (
        <section key={group.name} aria-labelledby={`character-group-${index}`}>
          <h2 id={`character-group-${index}`}>{group.name}</h2>
          <ul
            className="character-grid"
            aria-label={`${group.name} characters`}
          >
            {[...group.characters]
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((character) => {
                const buildCount =
                  data?.builds.filter(
                    (build) => build.characterId === character.id,
                  ).length ?? 0;
                return (
                  <li key={character.id}>
                    <Link
                      className="character-choice"
                      to={`/c/${character.id}`}
                    >
                      <img src={`/icons/${character.icon}`} alt="" />
                      <strong>{character.name}</strong>
                      <span>
                        {character.handSize}-card hand · {buildCount}{" "}
                        {buildCount === 1 ? "build" : "builds"}
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
      <DataBackupControls />
    </main>
  );
}
