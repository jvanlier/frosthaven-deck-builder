import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CardTile, compareCardLevelsDescending } from "./cards";
import { CandidateGrid } from "./candidate-grid";
import { CardNoteInput } from "./notes";
import { useAppData } from "./app-data";
import { RepairIssues } from "./repairs";
import { startEditorPath } from "./build-editor";
import { characters } from "../shared/data/characters/index.js";
import {
  appendLevelUp,
  removeCardNote,
  setCardNote,
  setLevelUp,
} from "../shared/builds.js";
import {
  addOptions,
  applyDeckEdit,
  canAppendLevel,
  pickOptions,
  replayBuild,
} from "../shared/rules/index.js";
import {
  buildSchema,
  type Build,
  type CardNote,
  type LevelUp,
} from "../shared/schema/index.js";
import type { Card, Character } from "../shared/character.js";

const character = characters[0]!;

export function levelUpPath(
  characterId: string,
  buildId: string,
  level: number,
): string {
  return `/c/${encodeURIComponent(characterId)}/b/${encodeURIComponent(buildId)}/l/${level}/level-up`;
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

export function LevelUpRoute() {
  const { characterId, buildId, level } = useParams();
  const location = useLocation();
  const { data, canMutate, updateData, flush } = useAppData();
  const build = data?.builds.find((candidate) => candidate.id === buildId);
  const targetLevel = level === undefined ? Number.NaN : Number(level);
  const existingLevelUp = build?.levelUps.find(
    (candidate) => candidate.level === targetLevel,
  );
  const expectedNextLevel = build
    ? build.startLevel + build.levelUps.length + 1
    : Number.NaN;
  const shouldAppend =
    characterId === character.id &&
    build !== undefined &&
    existingLevelUp === undefined &&
    targetLevel === expectedNextLevel &&
    canMutate &&
    canAppendLevel(build, character);
  const appendRequested = useRef<number | null>(null);

  useEffect(() => {
    if (!shouldAppend || !build || appendRequested.current === targetLevel) {
      return;
    }
    appendRequested.current = targetLevel;
    updateData((current) => ({
      ...current,
      builds: current.builds.map((candidate) =>
        candidate.id === build.id ? appendLevelUp(candidate) : candidate,
      ),
    }));
    void flush().catch(() => undefined);
  }, [build, flush, shouldAppend, targetLevel, updateData]);

  if (characterId !== character.id || !build) {
    return <UnavailableLevelUpView />;
  }
  if (existingLevelUp) {
    return (
      <LevelUpEditor
        key={`${build.id}:${targetLevel}`}
        build={build}
        character={character}
        level={targetLevel}
        levelUp={existingLevelUp}
        focusCardId={new URLSearchParams(location.search).get("focus")}
      />
    );
  }
  if (shouldAppend || appendRequested.current === targetLevel) {
    return (
      <main className="page-content narrow-content">
        <p role="status" aria-live="polite">
          Preparing level {targetLevel}…
        </p>
      </main>
    );
  }
  return <UnavailableLevelUpView />;
}

function LevelUpEditor({
  build,
  character,
  level,
  levelUp,
  focusCardId,
}: {
  build: Build;
  character: Character;
  level: number;
  levelUp: LevelUp;
  focusCardId: string | null;
}) {
  const { canMutate, updateData } = useAppData();
  const navigate = useNavigate();
  const replay = replayBuild(build, character);
  const state = replay.levels.find((candidate) => candidate.level === level);
  const previousState = replay.levels.find(
    (candidate) => candidate.level === level - 1,
  );
  const baseline = useRef({
    levelUp: cloneLevelUp(levelUp),
    cardNotes: build.cardNotes
      .filter((note) => note.level === level)
      .map(cloneCardNote),
  });
  const changedNotes = useRef(new Set<string>());
  const deckHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!focusCardId) {
      return;
    }
    if (focusCardId === "deck") {
      document.getElementById("your-deck-heading")?.focus();
      return;
    }
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>(".card-action"),
    ];
    const button =
      focusCardId === "pick"
        ? document.querySelector<HTMLButtonElement>(
            ".level-up-candidate .card-action",
          )
        : buttons.find((candidate) => candidate.dataset.cardId === focusCardId);
    button?.focus();
  }, [focusCardId, level]);

  if (!state || !previousState) {
    return <UnavailableLevelUpView />;
  }
  const editorState = state;

  const previousDeckIds = previousState.deck.map((card) => card.id);
  const selectedPick = levelUp.pick;
  const pickCandidates = pickOptions(build, character, level);
  const selectedCard = selectedPick
    ? character.cards.find((card) => card.id === selectedPick)
    : undefined;
  const availableCards = uniqueCards([
    ...pickCandidates,
    ...(selectedCard ? [selectedCard] : []),
  ]).sort(compareCardLevelsDescending);
  const swapCandidates = addOptions(build, character, level).filter(
    (card) => card.id !== selectedPick,
  );
  const activeAdded = new Set(state.applied.added);
  const activeDropped = new Set(state.applied.dropped);
  const newCards = activeAdded;
  const droppedCards = new Set(levelUp.dropped);
  const visibleDeck = uniqueCards([
    ...previousState.deck,
    ...state.deck.filter((card) => newCards.has(card.id)),
  ]).sort(compareCardLevelsDescending);

  function mutateBuild(mutator: (current: Build) => Build): void {
    updateData((current) => {
      const existing = current.builds.find(
        (candidate) => candidate.id === build.id,
      );
      if (!existing) {
        return current;
      }
      const changed = mutator(existing);
      if (changed === existing) {
        return current;
      }
      return {
        ...current,
        builds: current.builds.map((candidate) =>
          candidate.id === build.id ? changed : candidate,
        ),
      };
    });
  }

  function scrollToDeckOnSmallScreen(): void {
    if (typeof window === "undefined" || window.innerWidth >= 1240) {
      return;
    }
    const heading = deckHeadingRef.current;
    if (!heading) {
      return;
    }
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // Picking adds the note field and card before the deck, so calculate the
    // destination after React has committed the new layout. Keep the whole
    // heading between the sticky editor controls and fixed bottom navigation.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // The action can come from a modal dialog. Wait until its close effect
        // has run before moving focus out of the dialog.
        heading.focus({ preventScroll: true });
        const headingBox = heading.getBoundingClientRect();
        const stickyBottom = Math.max(
          0,
          ...Array.from(
            document.querySelectorAll<HTMLElement>(
              ".app-header, .save-feedback, .level-up-status",
            ),
          ).map((element) => element.getBoundingClientRect().bottom),
        );
        const bottomTabs = document.querySelector<HTMLElement>(".bottom-tabs");
        const visibleBottom = Math.min(
          window.innerHeight,
          bottomTabs?.getBoundingClientRect().top ?? window.innerHeight,
        );
        const safeTop = stickyBottom + 16;
        const safeBottom = visibleBottom - 16;
        if (safeBottom <= safeTop) {
          return;
        }

        let targetTop = window.scrollY;
        if (headingBox.top < safeTop) {
          targetTop += headingBox.top - safeTop;
        } else if (headingBox.bottom > safeBottom) {
          targetTop += headingBox.bottom - safeBottom;
        }
        if (targetTop === window.scrollY) {
          return;
        }
        window.scrollTo({
          top: Math.max(0, targetTop),
          behavior: reducedMotion ? "auto" : "smooth",
        });
      });
    });
  }

  function changeLevelUp(next: Pick<LevelUp, "pick" | "added" | "dropped">) {
    if (!canMutate) {
      return;
    }
    mutateBuild((current) => setLevelUp(current, level, next));
  }

  function choosePick(card: Card): void {
    if (!canMutate) {
      return;
    }
    const added = [...levelUp.added];
    const oldIndex = selectedPick === null ? -1 : added.indexOf(selectedPick);
    const withoutPicks = added.filter(
      (cardId) => cardId !== selectedPick && cardId !== card.id,
    );
    if (selectedPick === card.id) {
      changeLevelUp({
        pick: null,
        added: withoutPicks,
        dropped: [...levelUp.dropped],
      });
      return;
    }
    if (oldIndex === -1) {
      withoutPicks.push(card.id);
    } else {
      withoutPicks.splice(Math.min(oldIndex, withoutPicks.length), 0, card.id);
    }
    changeLevelUp({
      pick: card.id,
      added: withoutPicks,
      dropped: [...levelUp.dropped],
    });
    scrollToDeckOnSmallScreen();
  }

  function changeDeck(card: Card, action: "add" | "remove"): void {
    if (!canMutate) {
      return;
    }
    const desired = new Set(editorState.deck.map((candidate) => candidate.id));
    if (action === "add") {
      desired.add(card.id);
    } else {
      desired.delete(card.id);
    }
    const edit = applyDeckEdit(previousDeckIds, [...desired], {
      existing: {
        added: levelUp.added,
        dropped: levelUp.dropped,
      },
      validAdded: editorState.applied.added,
      validDropped: editorState.applied.dropped,
    });
    changeLevelUp({
      pick: levelUp.pick,
      added: edit.added,
      dropped: edit.dropped,
    });
  }

  function toggleExtra(card: Card): void {
    const selected = activeAdded.has(card.id) && card.id !== selectedPick;
    changeDeck(card, selected ? "remove" : "add");
  }

  function toggleDrop(card: Card): void {
    if (newCards.has(card.id)) {
      return;
    }
    changeDeck(card, activeDropped.has(card.id) ? "add" : "remove");
  }

  function updateNote(card: Card, text: string): void {
    if (!canMutate) {
      return;
    }
    changedNotes.current.add(card.id);
    mutateBuild((current) => setCardNote(current, card.id, level, text));
  }

  function revertNote(card: Card): void {
    if (!canMutate) {
      return;
    }
    changedNotes.current.add(card.id);
    mutateBuild((current) => removeCardNote(current, card.id, level));
  }

  function renderNote(card: Card) {
    return (
      <CardNoteInput
        build={build}
        card={card}
        level={level}
        disabled={!canMutate}
        onChange={(text) => updateNote(card, text)}
        onRevert={() => revertNote(card)}
      />
    );
  }

  function resetEditor(): void {
    if (!canMutate) {
      return;
    }
    const entry = baseline.current;
    const changed = changedNotes.current;
    mutateBuild((current) => {
      const resetLevel = setLevelUp(current, level, entry.levelUp);
      if (changed.size === 0) {
        return resetLevel;
      }
      const cardNotes = [
        ...resetLevel.cardNotes.filter(
          (note) => note.level !== level || !changed.has(note.cardId),
        ),
        ...entry.cardNotes
          .filter((note) => changed.has(note.cardId))
          .map(cloneCardNote),
      ];
      return buildSchema.parse({
        ...resetLevel,
        cardNotes,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  const handSize = character.handSize;

  return (
    <main
      className="page-content level-up-editor"
      aria-labelledby="level-up-heading"
    >
      <section className="level-up-status" aria-label="Level-up status">
        <div>
          <p className="eyebrow">
            Level {level} · {build.name}
          </p>
          <h1 id="level-up-heading">Level up</h1>
          {selectedPick === null ? (
            <p
              className="level-up-instruction"
              role="status"
              aria-live="polite"
            >
              {
                state.issues.find((issue) => issue.code === "MISSING_PICK")
                  ?.message
              }
            </p>
          ) : null}
        </div>
        <strong
          className="level-up-counter"
          data-tone={state.deck.length === handSize ? "complete" : "incomplete"}
          aria-live="polite"
        >
          {state.deck.length} / {handSize} cards
        </strong>
        <div className="level-up-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={resetEditor}
            disabled={!canMutate}
          >
            Reset (current edit)
          </button>
          <button
            type="button"
            onClick={() => navigate(deckPath(character.id, build.id, level))}
          >
            Done
          </button>
        </div>
      </section>

      <RepairIssues
        build={build}
        character={character}
        state={{
          ...state,
          issues: state.issues.filter(
            (issue) =>
              issue.code !== "MISSING_PICK" &&
              issue.code !== "DECK_TOO_SMALL" &&
              issue.code !== "DECK_TOO_LARGE",
          ),
        }}
      />

      <div className="level-up-groups">
        <div className="level-up-picks">
          <section
            className="editor-section level-up-group"
            aria-labelledby="available-cards-heading"
          >
            <div className="section-heading">
              <h2 id="available-cards-heading">Available cards</h2>
            </div>
            <CandidateGrid
              cards={availableCards}
              selection="pick"
              selectedPick={selectedPick}
              pickLevel={level}
              added={activeAdded}
              canMutate={canMutate}
              renderNote={renderNote}
              onPick={choosePick}
              onAdd={toggleExtra}
            />
          </section>
        </div>
        <div className="level-up-hand">
          <section
            className="editor-section level-up-group level-up-deck"
            aria-labelledby="your-deck-heading"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Current hand</p>
                <h2 id="your-deck-heading" ref={deckHeadingRef} tabIndex={-1}>
                  Your deck
                </h2>
              </div>
            </div>
            <div className="level-up-card-grid">
              {visibleDeck.map((card) => {
                const isNew = newCards.has(card.id);
                const isDropped = droppedCards.has(card.id);
                const isPick = card.id === selectedPick;
                return (
                  <div className="level-up-deck-card" key={card.id}>
                    <CardTile
                      card={card}
                      actionLabel={
                        isDropped
                          ? `Keep ${card.name}`
                          : isPick
                            ? `Unpick ${card.name}`
                            : isNew
                              ? `Remove ${card.name} from deck`
                              : `Drop ${card.name}`
                      }
                      stateLabel={
                        isDropped
                          ? "Dropped"
                          : isPick
                            ? `Level ${level} pick`
                            : isNew
                              ? "Added from pool"
                              : "In deck"
                      }
                      disabled={!canMutate}
                      onAction={() =>
                        isPick
                          ? choosePick(card)
                          : isNew
                            ? toggleExtra(card)
                            : toggleDrop(card)
                      }
                    />
                    {renderNote(card)}
                  </div>
                );
              })}
            </div>
          </section>

          <section
            className="editor-section level-up-group swap-group"
            aria-labelledby="swap-heading"
          >
            <div className="section-heading">
              <h2 id="swap-heading">Other pool cards</h2>
            </div>
            <CandidateGrid
              cards={swapCandidates}
              selection="add"
              selectedPick={selectedPick}
              pickLevel={level}
              added={activeAdded}
              canMutate={canMutate}
              renderNote={renderNote}
              onPick={choosePick}
              onAdd={toggleExtra}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

function uniqueCards(cards: Card[]): Card[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.id)) {
      return false;
    }
    seen.add(card.id);
    return true;
  });
}

function cloneLevelUp(levelUp: LevelUp): LevelUp {
  return {
    ...levelUp,
    added: [...levelUp.added],
    dropped: [...levelUp.dropped],
  };
}

function cloneCardNote(note: CardNote): CardNote {
  return { ...note };
}

function deckPath(characterId: string, buildId: string, level: number): string {
  return `/c/${encodeURIComponent(characterId)}/b/${encodeURIComponent(buildId)}/l/${level}`;
}

export function UnavailableLevelUpView() {
  return (
    <main className="page-content narrow-content">
      <section className="empty-card">
        <p className="eyebrow">Level up</p>
        <h1>This level-up editor is unavailable</h1>
        <p>
          The requested level is not ready to edit. Your saved data is
          unchanged.
        </p>
        <Link className="button-link" to={`/c/${character.id}`}>
          Back to builds
        </Link>
      </section>
    </main>
  );
}
