import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CardGrid, CardImage, compareCardLevelsDescending } from "./cards";
import { useAppData } from "./app-data";
import { formatNoteTimestamp } from "./notes";
import { RepairIssues } from "./repairs";
import { startEditorPath } from "./build-editor";
import { levelUpPath } from "./level-up";
import { characters } from "../shared/data/characters/index.js";
import {
  cardNoteHistory,
  deleteHighestLevel,
  effectiveCardNote,
} from "../shared/builds.js";
import { replayBuild, type RuleLevelState } from "../shared/rules/index.js";
import type { Card, Character } from "../shared/character.js";
import type { Build } from "../shared/schema/index.js";

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
  const { canMutate, updateData } = useAppData();
  const [showNotes, setShowNotes] = useState(false);
  const [showDropped, setShowDropped] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const navigate = useNavigate();
  const cardById = new Map(character.cards.map((card) => [card.id, card]));
  const isStartLevel = state.level === build.startLevel;
  const droppedCards = state.applied.dropped.flatMap((cardId) => {
    const card = cardById.get(cardId);
    return card ? [card] : [];
  });
  const visibleCards = [
    ...state.deck,
    ...(showDropped && !isStartLevel ? droppedCards : []),
  ].sort(compareCardLevelsDescending);
  // Pick and pool badges belong to the editors; the view only marks drops.
  const stateLabel = (card: Card): string | undefined =>
    state.applied.dropped.includes(card.id) ? "Dropped" : undefined;

  useEffect(() => {
    rememberLastPosition({
      characterId: character.id,
      buildId: build.id,
      level: state.level,
    });
  }, [build.id, character.id, state.level]);

  const openCardDetail = (card: Card) => {
    navigate(cardDetailPath(character.id, build.id, card.id));
  };
  const highestLevel = build.levelUps.at(-1)?.level;
  const canDeleteLevel =
    canMutate && highestLevel === state.level && state.level > build.startLevel;
  const survivingLevel = build.levelUps.at(-2)?.level ?? build.startLevel;

  function confirmDeleteLevel(): void {
    if (!canDeleteLevel) {
      return;
    }
    updateData((current) => ({
      ...current,
      builds: current.builds.map((candidate) =>
        candidate.id === build.id ? deleteHighestLevel(candidate) : candidate,
      ),
    }));
    setDeleteDialogOpen(false);
    navigate(deckPath(character.id, build.id, survivingLevel));
  }

  return (
    <main className="page-content deck-view" aria-labelledby="deck-heading">
      <section className="page-intro deck-intro">
        <h1 id="deck-heading" className="visually-hidden">
          Deck: {build.name}
        </h1>
        <div className="deck-toggles">
          <label className="deck-toggle">
            <input
              type="checkbox"
              checked={showNotes}
              onChange={(event) => setShowNotes(event.target.checked)}
            />
            Show card note
          </label>
          {!isStartLevel ? (
            <label className="deck-toggle">
              <input
                type="checkbox"
                checked={showDropped}
                onChange={(event) => setShowDropped(event.target.checked)}
              />
              Show dropped cards
            </label>
          ) : null}
        </div>
        <Link
          className="button-link secondary-button"
          to={
            state.level === build.startLevel
              ? startEditorPath(build)
              : levelUpPath(character.id, build.id, state.level)
          }
        >
          {state.level === build.startLevel
            ? "Edit starting deck"
            : "Edit this level"}
        </Link>
      </section>

      <RepairIssues build={build} character={character} state={state} />

      <section
        className="editor-section deck-cards"
        aria-labelledby="deck-cards-heading"
      >
        <h2 id="deck-cards-heading" className="visually-hidden">
          Your deck
        </h2>
        {visibleCards.length > 0 ? (
          <div className="deck-card-list">
            {visibleCards.map((card) => {
              const note = showNotes
                ? effectiveCardNote(build, card.id, state.level)
                : undefined;
              return (
                <div className="deck-card-item" key={card.id}>
                  <CardGrid
                    cards={[card]}
                    actionLabel={(candidate) =>
                      `Open ${candidate.name} details`
                    }
                    stateLabel={stateLabel}
                    onAction={openCardDetail}
                  />
                  {showNotes ? (
                    <div className="card-note">
                      {note?.text ? (
                        <>
                          <span
                            className="card-note-level"
                            title={`Recorded at level ${note.level}`}
                          >
                            L{note.level}
                          </span>
                          <p className="plain-text">{note.text}</p>
                        </>
                      ) : (
                        <p>
                          <em>No card note</em>
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-inline">
            No cards are currently applied to this deck. Open the starting deck
            editor to choose a hand.
          </p>
        )}
      </section>

      {highestLevel === state.level && state.level > build.startLevel ? (
        <section className="deck-toolbar" aria-label="Deck actions">
          <button
            type="button"
            className="danger-button"
            disabled={!canMutate}
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete level {state.level}
          </button>
        </section>
      ) : null}
      <DeleteLevelDialog
        level={state.level}
        open={deleteDialogOpen}
        canConfirm={canDeleteLevel}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDeleteLevel}
      />
    </main>
  );
}

export function CardDetailRoute() {
  const { characterId, buildId, cardId } = useParams();
  const { data } = useAppData();
  const build = data?.builds.find((candidate) => candidate.id === buildId);
  const card = character.cards.find((candidate) => candidate.id === cardId);

  if (characterId !== character.id || !build || !card) {
    return <UnavailableDeckView />;
  }

  return <CardDetailView build={build} character={character} card={card} />;
}

function CardDetailView({
  build,
  character,
  card,
}: {
  build: Build;
  character: Character;
  card: Card;
}) {
  const history = cardNoteHistory(build, card.id);
  const position = readLastPosition();
  const backLevel =
    position?.buildId === build.id && position.characterId === character.id
      ? position.level
      : build.startLevel;

  return (
    <main
      className="page-content card-detail"
      aria-labelledby="card-detail-heading"
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
        <p className="eyebrow">{build.name}</p>
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
          <section className="content-card" aria-labelledby="notes-heading">
            <h3 id="notes-heading">Card notes</h3>
            {history.length > 0 ? (
              <ol className="card-note-history">
                {history.map((note) => (
                  <li key={note.level}>
                    <span className="card-note-level">Level {note.level}</span>
                    {note.text ? (
                      <p className="plain-text">{note.text}</p>
                    ) : (
                      <p>
                        <em>Note cleared</em>
                      </p>
                    )}
                    <time dateTime={note.updatedAt}>
                      Updated {formatNoteTimestamp(note.updatedAt)}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No card notes have been recorded yet.</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function DeleteLevelDialog({
  level,
  open,
  canConfirm,
  onClose,
  onConfirm,
}: {
  level: number;
  open: boolean;
  canConfirm: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    } else if (!open && dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="form-dialog"
      aria-labelledby="delete-level-heading"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (canConfirm) {
            onConfirm();
          }
        }}
      >
        <h2 id="delete-level-heading">Delete level {level}?</h2>
        <p>
          This removes the level&apos;s choices and the card notes recorded at
          level {level}. Notes from earlier levels remain saved.
        </p>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="danger-button"
            disabled={!canConfirm}
          >
            Delete level
          </button>
        </div>
      </form>
    </dialog>
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
        <Link className="button-link" to={`/c/${character.id}`}>
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
  cardId: string,
): string {
  return `/c/${encodeURIComponent(characterId)}/b/${encodeURIComponent(buildId)}/card/${encodeURIComponent(cardId)}`;
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

function formatCardLevel(card: Card): string {
  return String(card.level);
}
