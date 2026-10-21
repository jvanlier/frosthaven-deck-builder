import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CardDialog, CardGrid, CardImage } from "./cards";
import { useAppData } from "./app-data";
import {
  GuidanceInput,
  MotivationInput,
  formatNoteTimestamp,
  updateBuildData,
} from "./notes";
import { RepairIssues } from "./repairs";
import { startEditorPath } from "./build-editor";
import { levelUpPath } from "./level-up";
import { characters } from "../shared/data/characters/index.js";
import {
  deleteHighestLevel,
  upsertMotivation,
  upsertNote,
} from "../shared/builds.js";
import {
  applicableMotivationContexts,
  replayBuild,
  type ApplicableMotivationContext,
  type RuleLevelState,
} from "../shared/rules/index.js";
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
  const { canMutate, updateData } = useAppData();
  const [showGuidance, setShowGuidance] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const navigate = useNavigate();
  const cardById = new Map(character.cards.map((card) => [card.id, card]));
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
        <div className="deck-badges" aria-label="Deck status">
          {incomplete ? (
            <span className="status-badge incomplete">Incomplete</span>
          ) : null}
          {invalid ? (
            <span className="status-badge invalid">Invalid</span>
          ) : null}
        </div>
        <label className="guidance-toggle">
          <input
            type="checkbox"
            checked={showGuidance}
            onChange={(event) => setShowGuidance(event.target.checked)}
          />
          Show guidance
        </label>
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
        {state.deck.length > 0 ? (
          <div className="deck-card-list">
            {state.deck.map((card) => (
              <div className="deck-card-item" key={card.id}>
                <CardGrid
                  cards={[card]}
                  actionLabel={(candidate) => `Open ${candidate.name} details`}
                  stateLabel={() =>
                    state.applied.added.includes(card.id) ? "NEW" : undefined
                  }
                  onAction={openCardDetail}
                />
                {showGuidance ? (
                  <div className="guidance-note">
                    <strong>Guidance</strong>
                    <p className="plain-text">
                      {build.guidance[card.id]?.text ??
                        "No guidance recorded for this card yet."}
                    </p>
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
  const { canMutate, updateData } = useAppData();
  const guidance = build.guidance[card.id];
  const contexts = applicableMotivationContexts(
    build,
    character,
    state.level,
    card.id,
  );

  function updateGuidance(text: string): void {
    if (!canMutate) {
      return;
    }
    updateData((current) =>
      updateBuildData(current, build.id, (currentBuild) =>
        upsertNote(currentBuild, card.id, text),
      ),
    );
  }

  function updateMotivation(
    context: ApplicableMotivationContext,
    text: string,
  ): void {
    if (!canMutate) {
      return;
    }
    updateData((current) =>
      updateBuildData(current, build.id, (currentBuild) =>
        upsertMotivation(currentBuild, {
          kind: context.kind,
          cardId: card.id,
          text,
          level: state.level,
          forLevel: context.forLevel,
        }),
      ),
    );
  }

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
            <GuidanceInput
              card={card}
              value={guidance?.text ?? ""}
              disabled={!canMutate}
              onChange={updateGuidance}
            />
            {!guidance ? <p>No guidance has been recorded yet.</p> : null}
          </section>
          {contexts.length > 0 ? (
            <section
              className="content-card"
              aria-labelledby="motivations-heading"
            >
              <h3 id="motivations-heading">Applicable motivations</h3>
              <ul className="motivation-list">
                {contexts.map((context) => {
                  const motivation = state.activeMotivations.find(
                    (candidate) =>
                      candidate.cardId === card.id &&
                      candidate.kind === context.kind,
                  );
                  return (
                    <li
                      key={`${context.kind}-${context.forLevel ?? "current"}`}
                    >
                      <strong>{motivationLabel(context)}</strong>
                      {motivation ? (
                        <time dateTime={motivation.updatedAt}>
                          Updated {formatNoteTimestamp(motivation.updatedAt)}
                        </time>
                      ) : null}
                      <MotivationInput
                        card={card}
                        kind={context.kind}
                        label={`Motivation for ${card.name} (${motivationLabel(context)})`}
                        value={motivation?.text ?? ""}
                        disabled={!canMutate}
                        onChange={(text) => updateMotivation(context, text)}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
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
          This removes the level&apos;s choices and motivations. Build guidance
          remains saved.
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
          forLevel: pick.forLevel,
        }))
      : []),
    ...(picked === null
      ? []
      : [
          {
            label: "Picked",
            cardId: picked,
            kind: "add" as const,
            forLevel: undefined,
          },
        ]),
    ...added.map((cardId) => ({
      label: "Added",
      cardId,
      kind: "add" as const,
      forLevel: undefined,
    })),
    ...state.applied.dropped.map((cardId) => ({
      label: "Dropped",
      cardId,
      kind: "drop" as const,
      forLevel: undefined,
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
              <ChangeListItem
                key={`${change.label}-${change.cardId}`}
                build={build}
                state={state}
                card={card}
                label={change.label}
                motivation={motivation}
                kind={change.kind}
                forLevel={change.forLevel}
              />
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

function ChangeListItem({
  build,
  state,
  card,
  label,
  motivation,
  kind,
  forLevel,
}: {
  build: Build;
  state: RuleLevelState;
  card: Card;
  label: string;
  motivation: Motivation | undefined;
  kind: "add" | "drop";
  forLevel?: number;
}) {
  const { canMutate, updateData } = useAppData();
  const [enlarged, setEnlarged] = useState(false);
  const enlargeButtonRef = useRef<HTMLButtonElement>(null);
  const detailPath = cardDetailPath(
    build.characterId,
    build.id,
    state.level,
    card.id,
  );
  const closeDialog = () => {
    setEnlarged(false);
    requestAnimationFrame(() => enlargeButtonRef.current?.focus());
  };

  function updateMotivation(text: string): void {
    if (!canMutate) {
      return;
    }
    updateData((current) =>
      updateBuildData(current, build.id, (currentBuild) =>
        upsertMotivation(currentBuild, {
          kind,
          cardId: card.id,
          text,
          level: state.level,
          forLevel,
        }),
      ),
    );
  }

  return (
    <li>
      <div className="change-card-media">
        <Link
          className="change-card-link"
          to={detailPath}
          aria-label={`Open ${card.name} details`}
        >
          <CardImage
            className="change-thumbnail"
            card={card}
            alt={`${card.name}, level ${formatCardLevel(card)}`}
          />
        </Link>
        <button
          ref={enlargeButtonRef}
          className="enlarge-button"
          type="button"
          onClick={() => setEnlarged(true)}
          aria-label={`Enlarge ${card.name}`}
        >
          <span aria-hidden="true">⌕</span> Enlarge
        </button>
      </div>
      <div>
        <Link className="change-card-name" to={detailPath}>
          <strong>
            {label}: {card.name}
          </strong>
        </Link>
        {motivation ? (
          <>
            <p className="plain-text">{motivation.text}</p>
            <time dateTime={motivation.updatedAt}>
              Updated {formatNoteTimestamp(motivation.updatedAt)}
            </time>
          </>
        ) : (
          <p className="change-note-empty">No motivation recorded.</p>
        )}
        <MotivationInput
          card={card}
          kind={kind}
          label={`Motivation for ${card.name}`}
          value={motivation?.text ?? ""}
          disabled={!canMutate}
          onChange={updateMotivation}
        />
      </div>
      <CardDialog card={card} open={enlarged} onClose={closeDialog} />
    </li>
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

function motivationLabel(context: ApplicableMotivationContext): string {
  if (context.kind === "drop") {
    return "Drop motivation";
  }
  if (context.kind === "exclude") {
    return "Exclusion motivation";
  }
  if (context.forLevel !== undefined) {
    return `Level ${context.forLevel} pick motivation`;
  }
  return "Add motivation";
}

function formatCardLevel(card: Card): string {
  return String(card.level);
}
