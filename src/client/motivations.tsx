import { useEffect } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAppData } from "./app-data";
import { CardImage } from "./cards";
import { cardDetailPath, deckPath, readLastPosition } from "./deck-view";
import { MotivationInput, formatNoteTimestamp, updateBuildData } from "./notes";
import { upsertMotivation } from "../shared/builds.js";
import { characters } from "../shared/data/characters/index.js";
import {
  applicableMotivationContexts,
  replayBuild,
  type RuleLevelState,
} from "../shared/rules/index.js";
import type { Card, Character } from "../shared/character.js";
import type { Build, Motivation } from "../shared/schema/index.js";

const character = characters[0]!;

export function MotivationsRoute() {
  const { characterId, buildId } = useParams();
  const { data } = useAppData();
  const build = data?.builds.find((candidate) => candidate.id === buildId);
  if (characterId !== character.id || !build) {
    return <UnavailableMotivationsView />;
  }
  return <MotivationsView build={build} character={character} />;
}

export function MotivationsView({
  build,
  character,
}: {
  build: Build;
  character: Character;
}) {
  const { canMutate, updateData } = useAppData();
  const location = useLocation();
  const entries = motivationEntries(build, character);
  const position = readLastPosition();
  const backLevel =
    position?.buildId === build.id && position.characterId === character.id
      ? position.level
      : (build.levelUps.at(-1)?.level ?? build.startLevel);
  const cardById = new Map(character.cards.map((card) => [card.id, card]));

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const level = params.get("level");
    const cardId = params.get("cardId");
    const kind = params.get("kind");
    if (!level || !cardId || !kind) {
      return;
    }
    const target = Array.from(
      document.querySelectorAll<HTMLElement>("[data-motivation-entry]"),
    ).find(
      (entry) =>
        entry.dataset.motivationLevel === level &&
        entry.dataset.motivationCardId === cardId &&
        entry.dataset.motivationKind === kind,
    );
    const textarea = target?.querySelector<HTMLTextAreaElement>("textarea");
    if (textarea) {
      textarea.focus();
      target?.scrollIntoView({ block: "center" });
    }
  }, [location.search]);

  function updateMotivation(entry: MotivationEntry, text: string): void {
    if (!canMutate) {
      return;
    }
    updateData((current) =>
      updateBuildData(current, build.id, (currentBuild) =>
        upsertMotivation(currentBuild, {
          kind: entry.motivation.kind,
          cardId: entry.motivation.cardId,
          text,
          level: entry.state.level,
          forLevel: entry.forLevel,
        }),
      ),
    );
  }

  const grouped = new Map<string, MotivationEntry[]>();
  for (const entry of entries) {
    const existing = grouped.get(entry.group) ?? [];
    existing.push(entry);
    grouped.set(entry.group, existing);
  }

  return (
    <main
      className="page-content motivations-view"
      aria-labelledby="motivations-heading"
    >
      <div className="editor-toolbar">
        <Link
          className="button-link secondary-button"
          to={deckPath(character.id, build.id, backLevel)}
        >
          Back to level {backLevel} deck
        </Link>
      </div>
      <section className="page-intro">
        <p className="eyebrow">
          {character.name} · {build.name}
        </p>
        <h1 id="motivations-heading">Build motivations</h1>
        <p>
          Review only the reasons that currently apply. Hidden motivations stay
          saved and return when their choice applies again.
        </p>
      </section>
      {grouped.size === 0 ? (
        <section className="empty-card">
          <h2>No motivations yet</h2>
          <p>
            Add an optional reason wherever a card is excluded, picked, added or
            dropped.
          </p>
        </section>
      ) : (
        <div className="motivation-groups">
          {[...grouped.entries()]
            .sort(([left], [right]) => compareGroups(left, right))
            .map(([group, groupEntries]) => (
              <section className="editor-section motivation-group" key={group}>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Optional notes</p>
                    <h2>{group}</h2>
                  </div>
                  <span className="editor-count">{groupEntries.length}</span>
                </div>
                <ul className="motivation-list motivation-entry-list">
                  {groupEntries.map((entry) => {
                    const card = cardById.get(entry.motivation.cardId);
                    if (!card) {
                      return null;
                    }
                    return (
                      <MotivationEntryView
                        key={`${entry.motivation.level}-${entry.motivation.cardId}-${entry.motivation.kind}`}
                        entry={entry}
                        card={card}
                        canMutate={canMutate}
                        onChange={(text) => updateMotivation(entry, text)}
                      />
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
      )}
    </main>
  );
}

function MotivationEntryView({
  entry,
  card,
  canMutate,
  onChange,
}: {
  entry: MotivationEntry;
  card: Card;
  canMutate: boolean;
  onChange: (text: string) => void;
}) {
  return (
    <li
      className="motivation-entry"
      data-motivation-entry="true"
      data-motivation-level={entry.motivation.level}
      data-motivation-card-id={entry.motivation.cardId}
      data-motivation-kind={entry.motivation.kind}
    >
      <Link
        className="motivation-thumbnail-link"
        to={cardDetailPath(
          entry.build.characterId,
          entry.build.id,
          entry.state.level,
          card.id,
        )}
        aria-label={`Open ${card.name} details`}
      >
        <CardImage
          className="change-thumbnail"
          card={card}
          alt={`${card.name}, level ${formatCardLevel(card)}`}
        />
      </Link>
      <div className="motivation-entry-content">
        <strong>{entry.label}</strong>
        <time dateTime={entry.motivation.updatedAt}>
          Updated {formatNoteTimestamp(entry.motivation.updatedAt)}
        </time>
        <MotivationInput
          card={card}
          kind={entry.motivation.kind}
          label={`Motivation for ${entry.label}`}
          value={entry.motivation.text}
          disabled={!canMutate}
          onChange={onChange}
        />
      </div>
    </li>
  );
}

interface MotivationEntry {
  build: Build;
  state: RuleLevelState;
  motivation: Motivation;
  group: string;
  label: string;
  forLevel?: number;
}

function motivationEntries(
  build: Build,
  character: Character,
): MotivationEntry[] {
  const replay = replayBuild(build, character);
  return replay.levels.flatMap((state) =>
    state.activeMotivations.map((motivation) => {
      const initialPick =
        state.level === build.startLevel && motivation.kind === "add"
          ? state.applied.startingPicks.find(
              (pick) => pick.cardId === motivation.cardId,
            )
          : undefined;
      const context = applicableMotivationContexts(
        build,
        character,
        state.level,
        motivation.cardId,
      ).find(
        (candidate) =>
          candidate.kind === motivation.kind &&
          candidate.level === motivation.level,
      );
      const forLevel = context?.forLevel;
      const group =
        motivation.kind === "exclude"
          ? "Not in starting deck"
          : `Level ${state.level} · ${motivation.kind === "drop" ? "Dropped" : "Picked / Added"}`;
      const label = initialPick
        ? `Level ${initialPick.forLevel} pick: ${motivationCardName(character, motivation.cardId)}`
        : `${motivation.kind === "drop" ? "Dropped" : motivation.kind === "add" ? "Added" : "Excluded"}: ${motivationCardName(character, motivation.cardId)}`;
      return { build, state, motivation, group, label, forLevel };
    }),
  );
}

function compareGroups(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left === "Not in starting deck") {
    return right === left ? 0 : -1;
  }
  if (right === "Not in starting deck") {
    return 1;
  }
  const leftMatch = /^Level (\d+) · (.+)$/.exec(left);
  const rightMatch = /^Level (\d+) · (.+)$/.exec(right);
  if (!leftMatch || !rightMatch) {
    return left.localeCompare(right);
  }
  const levelDifference = Number(leftMatch[1]) - Number(rightMatch[1]);
  if (levelDifference !== 0) {
    return levelDifference;
  }
  return leftMatch[2] === "Picked / Added" ? -1 : 1;
}

function motivationCardName(character: Character, cardId: string): string {
  return character.cards.find((card) => card.id === cardId)?.name ?? cardId;
}

function formatCardLevel(card: Card): string {
  return String(card.level);
}

export function UnavailableMotivationsView() {
  return (
    <main className="page-content narrow-content">
      <section className="empty-card">
        <p className="eyebrow">Notes</p>
        <h1>This motivations view is unavailable</h1>
        <p>Choose an existing build to review its optional notes.</p>
        <Link className="button-link" to={`/c/${character.id}`}>
          Back to builds
        </Link>
      </section>
    </main>
  );
}
