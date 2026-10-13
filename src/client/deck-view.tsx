import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CardGrid, CardImage } from "./cards";
import { useAppData } from "./app-data";
import { startEditorPath } from "./build-editor";
import { characters } from "../shared/data/characters/index.js";
import { replayBuild, type RuleLevelState } from "../shared/rules/index.js";
import type { Card, Character } from "../shared/character.js";
import type { Build, Motivation } from "../shared/schema/index.js";

export const LAST_POSITION_STORAGE_KEY =
  "frosthaven-deck-builder:last-position";

const character = characters[0]!;

interface LastPosition {
  characterId: string;
  buildId: string;
  level: number;
}

export function DeckRoute() {
  const { characterId, buildId, level } = useParams();
  const { data } = useAppData();
  const build = data?.builds.find((candidate) => candidate.id === buildId);
  const parsedLevel = level === undefined ? Number.NaN : Number(level);
  const projection = build ? replayBuild(build, character) : undefined;
  const state = projection?.levels.find(
    (candidate) => candidate.level === parsedLevel,
  );

  if (characterId !== character.id || !build || !state) {
    return <UnavailableDeckView />;
  }

  return <DeckView build={build} character={character} state={state} />;
}

export function DeckView({
  build,
  character,
  state,
}: {
  build: Build;
  character: Character;
  state: RuleLevelState;
}) {
  const [showGuidance, setShowGuidance] = useState(false);
  const navigate = useNavigate();
  const cardById = new Map(character.cards.map((card) => [card.id, card]));
  const levels = [
    build.startLevel,
    ...build.levelUps.map((levelUp) => levelUp.level),
  ];
  const levelIndex = levels.indexOf(state.level);
  const previousLevel = levels[levelIndex - 1];
  const nextLevel = levels[levelIndex + 1];
  const invalid = state.issues.some((issue) => issue.severity === "invalid");
  const incomplete = state.issues.some(
    (issue) => issue.severity === "incomplete",
  );

  useEffect(() => {
    rememberLastPosition({
      characterId: character.id,
      buildId: build.id,
      level: state.level,
    });
  }, [build.id, character.id, state.level]);

  const openCardDetail = (card: Card) => {
    navigate(cardDetailPath(character.id, build.id, state.level, card.id));
  };

  return (
    <main className="page-content deck-view" aria-labelledby="deck-heading">
      <section className="page-intro deck-intro">
        <div>
          <p className="eyebrow">
            {character.name} · {build.name}
          </p>
          <h1 id="deck-heading">Deck: {build.name}</h1>
          <p>
            Level {state.level} · {state.pool.length} cards in the pool ·{" "}
            {state.deck.length} / {character.handSize} cards in the hand
          </p>
        </div>
        <div className="deck-badges" aria-label="Deck status">
          {incomplete ? (
            <span className="status-badge incomplete">Incomplete</span>
          ) : null}
          {invalid ? (
            <span className="status-badge invalid">Invalid</span>
          ) : null}
          {!incomplete && !invalid ? (
            <span className="status-badge complete">Complete</span>
          ) : null}
        </div>
      </section>

      <nav
        className="deck-level-navigation"
        aria-label="Previous and next deck levels"
      >
        <LevelNavigationLink
          direction="Previous"
          level={previousLevel}
          build={build}
          character={character}
        />
        <span aria-current="page">Level {state.level}</span>
        <LevelNavigationLink
          direction="Next"
          level={nextLevel}
          build={build}
          character={character}
        />
      </nav>

      {state.issues.length > 0 ? (
        <section className="deck-issues" aria-labelledby="deck-issues-heading">
          <h2 id="deck-issues-heading">Needs attention</h2>
          <ul className="issue-list">
            {state.issues.map((issue, index) => (
              <li
                className={`issue-${issue.severity}`}
                key={`${issue.code}-${issue.cardId ?? index}-${issue.operation?.index ?? ""}`}
              >
                {issue.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="deck-toolbar" aria-label="Deck actions">
        {state.level === build.startLevel ? (
          <Link
            className="button-link secondary-button"
            to={startEditorPath(build)}
          >
            Edit starting deck
          </Link>
        ) : null}
        <label className="guidance-toggle">
          <input
            type="checkbox"
            checked={showGuidance}
            onChange={(event) => setShowGuidance(event.target.checked)}
          />
          Show guidance
        </label>
      </section>

      <section
        className="editor-section deck-cards"
        aria-labelledby="deck-cards-heading"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Derived from the rules engine</p>
            <h2 id="deck-cards-heading">Your deck</h2>
          </div>
          <span className="editor-count">
            {state.deck.length} / {character.handSize} cards
          </span>
        </div>
        {state.deck.length > 0 ? (
          <div className="deck-card-list">
            {state.deck.map((card) => (
              <div className="deck-card-item" key={card.id}>
                <CardGrid
                  cards={[card]}
                  actionLabel={(candidate) => `Open ${candidate.name} details`}
                  stateLabel={() => "In deck"}
                  onAction={openCardDetail}
                />
                {showGuidance && build.guidance[card.id] ? (
                  <div className="guidance-note">
                    <strong>Guidance</strong>
                    <p className="plain-text">{build.guidance[card.id].text}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-inline">
            No cards are currently applied to this deck. Open the starting deck
            editor to choose a hand.
          </p>
        )}
      </section>

      <ChangesSection build={build} state={state} cardById={cardById} />
    </main>
  );
}

export function CardDetailRoute() {
  const { characterId, buildId, level, cardId } = useParams();
  const { data } = useAppData();
  const build = data?.builds.find((candidate) => candidate.id === buildId);
  const parsedLevel = level === undefined ? Number.NaN : Number(level);
  const card = character.cards.find((candidate) => candidate.id === cardId);
  const state = build
    ? replayBuild(build, character).levels.find(
        (candidate) => candidate.level === parsedLevel,
      )
    : undefined;

  if (characterId !== character.id || !build || !card || !state) {
    return <UnavailableDeckView />;
  }

  return (
    <CardDetailView
      build={build}
      character={character}
      card={card}
      state={state}
    />
  );
}

function CardDetailView({
  build,
  character,
  card,
  state,
}: {
  build: Build;
  character: Character;
  card: Card;
  state: RuleLevelState;
}) {
  const guidance = build.guidance[card.id];
  const motivations = state.activeMotivations.filter(
    (motivation) => motivation.cardId === card.id,
  );

  return (
    <main
      className="page-content card-detail"
      aria-labelledby="card-detail-heading"
    >
      <div className="editor-toolbar">
        <Link
          className="button-link secondary-button"
          to={deckPath(character.id, build.id, state.level)}
        >
          Back to level {state.level} deck
        </Link>
      </div>
      <section className="page-intro">
        <p className="eyebrow">
          {build.name} · Level {state.level}
        </p>
        <h1 id="card-detail-heading">Card detail</h1>
      </section>
      <section
        className="card-detail-layout"
        aria-labelledby="card-name-heading"
      >
        <div className="card-detail-image-wrap">
          <CardImage
            className="card-detail-image"
            card={card}
            alt={`${card.name}, level ${formatCardLevel(card)}`}
          />
        </div>
        <div className="card-detail-copy">
          <h2 id="card-name-heading">{card.name}</h2>
          <p className="card-meta">
            Level {formatCardLevel(card)} · Initiative {card.initiative}
          </p>
          <section className="content-card" aria-labelledby="guidance-heading">
            <h3 id="guidance-heading">Guidance</h3>
            {guidance ? (
              <p className="plain-text">{guidance.text}</p>
            ) : (
              <p>No guidance has been recorded for this card yet.</p>
            )}
          </section>
          {motivations.length > 0 ? (
            <section
              className="content-card"
              aria-labelledby="motivations-heading"
            >
              <h3 id="motivations-heading">Applicable motivations</h3>
              <ul className="motivation-list">
                {motivations.map((motivation) => (
                  <li key={`${motivation.level}-${motivation.kind}`}>
                    <strong>{motivationLabel(motivation)}</strong>
                    <p className="plain-text">{motivation.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function ChangesSection({
  build,
  state,
  cardById,
}: {
  build: Build;
  state: RuleLevelState;
  cardById: Map<string, Card>;
}) {
  const picked = state.applied.pick;
  const added = state.applied.added.filter((cardId) => cardId !== picked);
  const changes = [
    ...(state.level === build.startLevel
      ? state.applied.startingPicks.map((pick) => ({
          label: `Level ${pick.forLevel} pick`,
          cardId: pick.cardId,
          kind: "add" as const,
        }))
      : []),
    ...(picked === null
      ? []
      : [{ label: "Picked", cardId: picked, kind: "add" as const }]),
    ...added.map((cardId) => ({
      label: "Added",
      cardId,
      kind: "add" as const,
    })),
    ...state.applied.dropped.map((cardId) => ({
      label: "Dropped",
      cardId,
      kind: "drop" as const,
    })),
  ];

  return (
    <section
      className="editor-section change-section"
      aria-labelledby="changes-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Recorded choices</p>
          <h2 id="changes-heading">
            {state.level === build.startLevel
              ? "Starting choices"
              : `Level ${state.level} changes`}
          </h2>
        </div>
        <span className="editor-count">{changes.length} changes</span>
      </div>
      {changes.length > 0 ? (
        <ul className="change-list">
          {changes.map((change) => {
            const card = cardById.get(change.cardId);
            if (!card) {
              return null;
            }
            const motivation = findMotivation(
              state.activeMotivations,
              change.cardId,
              change.kind,
            );
            return (
              <li key={`${change.label}-${change.cardId}`}>
                <CardImage
                  className="change-thumbnail"
                  card={card}
                  alt={`${card.name}, level ${formatCardLevel(card)}`}
                />
                <div>
                  <strong>
                    {change.label}: {card.name}
                  </strong>
                  {motivation ? (
                    <p className="plain-text">{motivation.text}</p>
                  ) : (
                    <p className="change-note-empty">No motivation recorded.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty-inline">
          No card changes are recorded at this level.
        </p>
      )}
    </section>
  );
}

function LevelNavigationLink({
  direction,
  level,
  build,
  character,
}: {
  direction: "Previous" | "Next";
  level: number | undefined;
  build: Build;
  character: Character;
}) {
  if (level === undefined) {
    return (
      <span className="level-navigation-disabled" aria-disabled="true">
        {direction} level
      </span>
    );
  }
  return (
    <Link to={deckPath(character.id, build.id, level)}>
      {direction} level ({level})
    </Link>
  );
}

export function UnavailableDeckView() {
  return (
    <main className="page-content narrow-content">
      <section className="empty-card">
        <p className="eyebrow">Deck view</p>
        <h1>This deck view is unavailable</h1>
        <p>
          That character, build or level does not exist. Your saved data is
          unchanged.
        </p>
        <Link className="button-link" to="/">
          Back to builds
        </Link>
      </section>
    </main>
  );
}

export function deckPath(
  characterId: string,
  buildId: string,
  level: number,
): string {
  return `/c/${encodeURIComponent(characterId)}/b/${encodeURIComponent(buildId)}/l/${level}`;
}

export function cardDetailPath(
  characterId: string,
  buildId: string,
  level: number,
  cardId: string,
): string {
  return `${deckPath(characterId, buildId, level)}/card/${encodeURIComponent(cardId)}`;
}

export function rememberLastPosition(position: LastPosition): void {
  try {
    window.localStorage.setItem(
      LAST_POSITION_STORAGE_KEY,
      JSON.stringify(position),
    );
  } catch {
    // Position resume is a convenience; blocked storage must not block deck use.
  }
}

export function readLastPosition(): LastPosition | null {
  try {
    const raw = window.localStorage.getItem(LAST_POSITION_STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isLastPosition(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isLastPosition(value: unknown): value is LastPosition {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.characterId === "string" &&
    typeof candidate.buildId === "string" &&
    typeof candidate.level === "number" &&
    Number.isInteger(candidate.level) &&
    candidate.level >= 1 &&
    candidate.level <= 9
  );
}

function findMotivation(
  motivations: Motivation[],
  cardId: string,
  kind: "add" | "drop",
): Motivation | undefined {
  return motivations.find(
    (motivation) => motivation.cardId === cardId && motivation.kind === kind,
  );
}

function motivationLabel(motivation: Motivation): string {
  if (motivation.kind === "drop") {
    return "Drop motivation";
  }
  if (motivation.kind === "exclude") {
    return "Exclusion motivation";
  }
  return "Add motivation";
}

function formatCardLevel(card: Card): string {
  return String(card.level);
}
