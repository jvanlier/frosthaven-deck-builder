import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CardTile } from "./cards";
import { useAppData } from "./app-data";
import { startEditorPath } from "./build-editor";
import { characters } from "../shared/data/characters/index.js";
import {
  appendLevelUp,
  motivationKey,
  setLevelUp,
  upsertMotivation,
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
  type LevelUp,
  type Motivation,
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
}: {
  build: Build;
  character: Character;
  level: number;
  levelUp: LevelUp;
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
    motivations: build.motivations
      .filter((motivation) => motivation.level === level)
      .map(cloneMotivation),
  });
  const changedMotivations = useRef(new Set<string>());
  const [swapOpen, setSwapOpen] = useState(false);
  const deckHeadingRef = useRef<HTMLHeadingElement>(null);

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
  const newlyUnlocked = cardsInGroups(
    pickCandidates,
    selectedCard,
    (card) => card.level === level,
  );
  const earlierPicks = cardsInGroups(
    pickCandidates,
    selectedCard,
    (card) => effectiveCardLevel(card) < level,
  ).filter(
    (card) => !newlyUnlocked.some((candidate) => candidate.id === card.id),
  );
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
  ]);

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
    if (typeof window === "undefined" || window.innerWidth > 650) {
      return;
    }
    const heading = deckHeadingRef.current;
    if (!heading) {
      return;
    }
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    heading.focus({ preventScroll: true });
    const header = document.querySelector<HTMLElement>(".app-header");
    const status = document.querySelector<HTMLElement>(".level-up-status");
    const stickyBottom =
      (header?.getBoundingClientRect().bottom ?? 0) +
      (status?.getBoundingClientRect().height ?? 0);
    const targetTop = Math.max(
      0,
      heading.getBoundingClientRect().top + window.scrollY - stickyBottom - 16,
    );
    window.scrollTo({
      top: targetTop,
      behavior: reducedMotion ? "auto" : "smooth",
    });
    requestAnimationFrame(() => {
      if (Math.abs(heading.getBoundingClientRect().top - 16) > 32) {
        window.scrollTo({ top: targetTop, behavior: "auto" });
      }
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

  function updateMotivation(
    card: Card,
    kind: "add" | "drop",
    text: string,
  ): void {
    if (!canMutate) {
      return;
    }
    changedMotivations.current.add(motivationKey(level, card.id, kind));
    mutateBuild((current) =>
      upsertMotivation(current, {
        level,
        cardId: card.id,
        kind,
        text,
      }),
    );
  }

  function motivationText(cardId: string, kind: "add" | "drop"): string {
    return (
      build.motivations.find(
        (motivation) =>
          motivation.level === level &&
          motivation.cardId === cardId &&
          motivation.kind === kind,
      )?.text ?? ""
    );
  }

  function resetEditor(): void {
    if (!canMutate) {
      return;
    }
    const entry = baseline.current;
    mutateBuild((current) => {
      const resetLevel = setLevelUp(current, level, entry.levelUp);
      if (changedMotivations.current.size === 0) {
        return resetLevel;
      }
      const baselineByKey = new Map(
        entry.motivations.map((motivation) => [
          motivationKey(motivation.level, motivation.cardId, motivation.kind),
          motivation,
        ]),
      );
      const motivations = [
        ...resetLevel.motivations.filter(
          (motivation) =>
            !changedMotivations.current.has(
              motivationKey(
                motivation.level,
                motivation.cardId,
                motivation.kind,
              ),
            ),
        ),
        ...[...changedMotivations.current]
          .map((key) => baselineByKey.get(key))
          .filter(
            (motivation): motivation is Motivation => motivation !== undefined,
          )
          .map(cloneMotivation),
      ];
      return buildSchema.parse({
        ...resetLevel,
        motivations,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  const handSize = character.handSize;
  const instruction =
    selectedPick === null
      ? `Pick a card for level ${level}`
      : state.deck.length > handSize
        ? `Remove ${state.deck.length - handSize} card${state.deck.length - handSize === 1 ? "" : "s"}`
        : "Choose your deck";
  const doneEnabled =
    selectedPick !== null &&
    state.deck.length === handSize &&
    state.issues.length === 0;

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
          <p className="level-up-instruction" role="status" aria-live="polite">
            {instruction}
          </p>
        </div>
        <strong className="level-up-counter" aria-live="polite">
          {state.deck.length} / {handSize} cards
        </strong>
        <div className="level-up-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={resetEditor}
            disabled={!canMutate}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => navigate(deckPath(character.id, build.id, level))}
            disabled={!doneEnabled}
          >
            Done
          </button>
        </div>
      </section>

      {state.issues.length > 0 ? (
        <section
          className="deck-issues"
          aria-labelledby="level-up-issues-heading"
        >
          <h2 id="level-up-issues-heading">Needs attention</h2>
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

      <div className="level-up-groups">
        <section
          className="editor-section level-up-group"
          aria-labelledby="newly-unlocked-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">First choice</p>
              <h2 id="newly-unlocked-heading">Newly unlocked</h2>
            </div>
            <span className="editor-count">Level {level}</span>
          </div>
          <CandidateGrid
            cards={newlyUnlocked}
            selection="pick"
            selectedPick={selectedPick}
            added={activeAdded}
            canMutate={canMutate}
            motivationText={motivationText}
            onPick={choosePick}
            onAdd={toggleExtra}
            onMotivation={updateMotivation}
          />
        </section>

        <section
          className="editor-section level-up-group"
          aria-labelledby="earlier-picks-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Skipped options</p>
              <h2 id="earlier-picks-heading">Earlier, not yet picked</h2>
            </div>
          </div>
          {earlierPicks.length > 0 ? (
            <CandidateGrid
              cards={earlierPicks}
              selection="pick"
              selectedPick={selectedPick}
              added={activeAdded}
              canMutate={canMutate}
              motivationText={motivationText}
              onPick={choosePick}
              onAdd={toggleExtra}
              onMotivation={updateMotivation}
            />
          ) : (
            <p className="empty-inline">
              All earlier eligible cards have already been picked.
            </p>
          )}
        </section>

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
            <span className="editor-count">
              {state.deck.length} / {handSize}
            </span>
          </div>
          <div className="level-up-card-grid">
            {visibleDeck.map((card) => {
              const isNew = newCards.has(card.id);
              const isDropped = droppedCards.has(card.id);
              return (
                <div className="level-up-deck-card" key={card.id}>
                  <CardTile
                    card={card}
                    actionLabel={
                      isDropped
                        ? `Keep ${card.name}`
                        : isNew
                          ? `Keep ${card.name} new`
                          : `Drop ${card.name}`
                    }
                    stateLabel={
                      isDropped
                        ? "Dropped"
                        : isNew
                          ? "NEW — undo in its section"
                          : "In deck"
                    }
                    disabled={!canMutate || isNew}
                    onAction={() => toggleDrop(card)}
                  />
                  {isDropped ? (
                    <MotivationInput
                      card={card}
                      kind="drop"
                      value={motivationText(card.id, "drop")}
                      disabled={!canMutate}
                      onChange={(text) => updateMotivation(card, "drop", text)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section
          className="editor-section level-up-group swap-group"
          aria-labelledby="swap-heading"
        >
          <details
            open={swapOpen}
            onToggle={(event) => setSwapOpen(event.currentTarget.open)}
          >
            <summary id="swap-heading">Swap more cards from the pool</summary>
            <p className="section-description">
              Add another pool card, then remove a card from your deck.
            </p>
            <CandidateGrid
              cards={swapCandidates}
              selection="add"
              selectedPick={selectedPick}
              added={activeAdded}
              canMutate={canMutate}
              motivationText={motivationText}
              onPick={choosePick}
              onAdd={toggleExtra}
              onMotivation={updateMotivation}
            />
          </details>
        </section>
      </div>
    </main>
  );
}

function CandidateGrid({
  cards,
  selection,
  selectedPick,
  added,
  canMutate,
  motivationText,
  onPick,
  onAdd,
  onMotivation,
}: {
  cards: Card[];
  selection: "pick" | "add";
  selectedPick: string | null;
  added: Set<string>;
  canMutate: boolean;
  motivationText: (cardId: string, kind: "add" | "drop") => string;
  onPick: (card: Card) => void;
  onAdd: (card: Card) => void;
  onMotivation: (card: Card, kind: "add" | "drop", text: string) => void;
}) {
  if (cards.length === 0) {
    return <p className="empty-inline">No eligible cards are available.</p>;
  }
  return (
    <div className="level-up-card-grid" role="list">
      {cards.map((card) => {
        const isPicked = selectedPick === card.id;
        const isAdded = added.has(card.id) && !isPicked;
        return (
          <div className="level-up-candidate" role="listitem" key={card.id}>
            <CardTile
              card={card}
              actionLabel={
                selection === "pick"
                  ? isPicked
                    ? `Unpick ${card.name}`
                    : `Pick ${card.name}`
                  : isAdded
                    ? `Remove ${card.name} from deck`
                    : `Add ${card.name} to deck`
              }
              stateLabel={isPicked ? "Picked" : isAdded ? "Added" : undefined}
              disabled={!canMutate}
              onAction={() =>
                selection === "pick" ? onPick(card) : onAdd(card)
              }
            />
            {((isPicked || isAdded) && selection !== "pick") ||
            (isPicked && selection === "pick") ? (
              <MotivationInput
                card={card}
                kind="add"
                value={motivationText(card.id, "add")}
                disabled={!canMutate}
                onChange={(text) => onMotivation(card, "add", text)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MotivationInput({
  card,
  kind,
  value,
  disabled,
  onChange,
}: {
  card: Card;
  kind: "add" | "drop";
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
}) {
  const label =
    kind === "drop" ? `Why drop ${card.name}?` : `Why add ${card.name}?`;
  return (
    <label className="motivation-input">
      {label}
      <textarea
        value={value}
        maxLength={20_000}
        rows={3}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function cardsInGroups(
  cards: Card[],
  selected: Card | undefined,
  predicate: (card: Card) => boolean,
): Card[] {
  const candidates = cards.filter(predicate);
  if (
    selected &&
    predicate(selected) &&
    !candidates.some((card) => card.id === selected.id)
  ) {
    return [selected, ...candidates];
  }
  return candidates;
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

function cloneMotivation(motivation: Motivation): Motivation {
  return { ...motivation };
}

function effectiveCardLevel(card: Card): number {
  return card.level === "X" ? 1 : card.level;
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
