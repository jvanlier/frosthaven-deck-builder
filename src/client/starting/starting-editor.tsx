import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CardTile, compareCardLevelsDescending } from "../cards";
import { CandidateGrid } from "../candidate-grid";
import { RepairIssues } from "../repairs";
import { CardNoteInput } from "../notes";
import { useAppData } from "../app-data";
import { updateBuildData } from "../build-data";
import { deckPath, startEditorPath } from "../navigation/paths";
import { removeCardNote, setCardNote } from "../../shared/builds.js";
import { chooseStartingPick, toggleStartingDeckCard } from "./operations";
import {
  startingPickOptions,
  replayBuild,
  sortedCards,
} from "../../shared/rules/index.js";
import type { Card, Character } from "../../shared/character.js";
import type { Build } from "../../shared/schema/index.js";

export function StartingEditor({
  build,
  character,
  focusForLevel,
}: {
  build: Build;
  character: Character;
  focusForLevel?: number;
}) {
  const { updateData, canMutate } = useAppData();
  const navigate = useNavigate();
  const projection = replayBuild(build, character);
  const startState = projection.levels[0]!;
  const startPoolIds = new Set(startState.pool.map((card) => card.id));
  const selectedDeck = new Set(startState.deck.map((card) => card.id));
  const handFull = selectedDeck.size >= character.handSize;
  const picks = [...build.startPicks].reverse();
  const validPickLevels = new Set(
    picks
      .filter((pick) =>
        startingPickOptions(build, character, pick.forLevel).some(
          (card) => card.id === pick.cardId,
        ),
      )
      .map((pick) => pick.forLevel),
  );
  const firstUnfinished = picks.find(
    (pick) => !validPickLevels.has(pick.forLevel),
  );
  const [editingLevel, setEditingLevel] = useState<number | null>(
    focusForLevel ?? firstUnfinished?.forLevel ?? null,
  );
  const activeLevel = focusForLevel ?? editingLevel;
  const activePick = picks.find((pick) => pick.forLevel === activeLevel);
  const showHand = !activePick;
  const [handVisited, setHandVisited] = useState(!firstUnfinished);
  const stepHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    stepHeading.current?.focus({ preventScroll: true });
  }, [activeLevel]);

  const openStep = (level: number | null) => {
    if (level === null) {
      setHandVisited(true);
    }
    setEditingLevel(level);
    // Clear repair deep-link focus when moving to another setup step.
    if (focusForLevel !== undefined) {
      navigate(startEditorPath(build), { replace: true });
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const updateBuild = (nextBuild: Build) => {
    updateData((current) =>
      updateBuildData(current, nextBuild.id, () => nextBuild),
    );
  };

  const choosePick = (forLevel: number, cardId: string) => {
    if (!canMutate) {
      return;
    }
    updateBuild(chooseStartingPick(build, forLevel, cardId));
  };

  const toggleDeckCard = (card: Card) => {
    if (!canMutate || !startPoolIds.has(card.id)) {
      return;
    }
    const isSelected = selectedDeck.has(card.id);
    const pickedSlot = picks.find((pick) => pick.cardId === card.id);
    if (isSelected && pickedSlot) {
      openStep(pickedSlot.forLevel);
      return;
    }
    if (!isSelected && handFull) {
      return;
    }
    updateBuild(toggleStartingDeckCard(build, card.id, isSelected));
  };

  const renderNote = (card: Card) => (
    <CardNoteInput
      build={build}
      card={card}
      level={build.startLevel}
      disabled={!canMutate}
      onChange={(text) => {
        if (canMutate) {
          updateBuild(setCardNote(build, card.id, build.startLevel, text));
        }
      }}
      onRevert={() => {
        if (canMutate) {
          updateBuild(removeCardNote(build, card.id, build.startLevel));
        }
      }}
    />
  );

  const pickCards = (forLevel: number): Card[] => {
    const selected = build.startPicks.find(
      (pick) => pick.forLevel === forLevel,
    )?.cardId;
    const options = startingPickOptions(build, character, forLevel).sort(
      compareCardLevelsDescending,
    );
    if (selected && !options.some((card) => card.id === selected)) {
      const selectedCard = character.cards.find((card) => card.id === selected);
      if (selectedCard) {
        return [selectedCard, ...options];
      }
    }
    return options;
  };

  const eligibleCards = sortedCards(
    character.cards.filter(
      (card) => effectiveCardLevel(card) <= build.startLevel,
    ),
  ).sort(compareCardLevelsDescending);
  const nextPick = activePick
    ? (picks.find(
        (pick) =>
          pick.forLevel < activePick.forLevel &&
          !validPickLevels.has(pick.forLevel),
      ) ??
      picks.find(
        (pick) =>
          pick.forLevel !== activePick.forLevel &&
          !validPickLevels.has(pick.forLevel),
      ))
    : undefined;

  return (
    <main
      className="page-content starting-editor"
      aria-labelledby="starting-heading"
    >
      <h1
        id="starting-heading"
        className="visually-hidden"
        aria-label={`Starting deck: ${build.name}`}
      >
        Starting deck
      </h1>

      <section
        className="starting-hand-status starting-setup-status"
        aria-label="Starting setup"
      >
        {picks.length > 0 ? (
          <strong
            className="level-up-counter"
            data-tone={firstUnfinished ? "incomplete" : "complete"}
            aria-live="polite"
          >
            {validPickLevels.size} / {picks.length} level-up cards picked
          </strong>
        ) : null}
        {showHand ? (
          <ul
            className="issue-list"
            aria-label="Starting build status"
            aria-live="polite"
          >
            {startState.issues.some((issue) => issue.severity !== "invalid") ? (
              startState.issues
                .filter((issue) => issue.severity !== "invalid")
                .map((issue, index) => (
                  <li
                    className={`issue-${issue.severity}`}
                    data-issue-code={issue.code}
                    key={`${issue.code}-${issue.cardId ?? index}`}
                  >
                    {issue.code === "DECK_TOO_SMALL" ||
                    issue.code === "DECK_TOO_LARGE"
                      ? `${selectedDeck.size} / ${character.handSize} cards`
                      : issue.message}
                  </li>
                ))
            ) : (
              <li className="starting-hand-ready">
                {selectedDeck.size} / {character.handSize} cards
              </li>
            )}
          </ul>
        ) : null}
        <div className="level-up-actions">
          {!showHand ? (
            <button
              type="button"
              className="secondary-button"
              disabled={
                !canMutate ||
                !activePick ||
                !validPickLevels.has(activePick.forLevel)
              }
              onClick={() => openStep(nextPick?.forLevel ?? null)}
            >
              {nextPick
                ? "Next pick"
                : handVisited
                  ? "Return to hand"
                  : "Build starting hand"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              navigate(deckPath(character.id, build.id, build.startLevel))
            }
          >
            Done
          </button>
        </div>
      </section>

      {picks.length > 0 ? (
        <>
          <nav className="starting-stepper" aria-label="Starting setup steps">
            {picks.map((pick, index) => (
              <button
                key={pick.forLevel}
                type="button"
                className="secondary-button"
                aria-label={`Level ${pick.forLevel} pick${validPickLevels.has(pick.forLevel) ? ", complete" : pick.cardId ? ", needs attention" : ""}`}
                aria-current={
                  activeLevel === pick.forLevel ? "step" : undefined
                }
                disabled={
                  !canMutate ||
                  picks
                    .slice(0, index)
                    .some((earlier) => !validPickLevels.has(earlier.forLevel))
                }
                onClick={() => openStep(pick.forLevel)}
              >
                {pick.forLevel}
                {validPickLevels.has(pick.forLevel)
                  ? " ✓"
                  : pick.cardId
                    ? " !"
                    : ""}
              </button>
            ))}
            <button
              type="button"
              className="secondary-button"
              aria-label={`Starting hand${startState.issues.length === 0 ? ", complete" : ""}`}
              aria-current={showHand ? "step" : undefined}
              disabled={!!firstUnfinished}
              onClick={() => openStep(null)}
            >
              Hand{startState.issues.length === 0 ? " ✓" : ""}
            </button>
          </nav>
          {activePick ? (
            <section
              className="editor-section"
              data-pick-level={activePick.forLevel}
              aria-labelledby="starting-picks-heading"
            >
              <h2 id="starting-picks-heading" ref={stepHeading} tabIndex={-1}>
                Level {activePick.forLevel} pick
              </h2>
              {activePick.cardId &&
              !validPickLevels.has(activePick.forLevel) ? (
                <p className="issue-message" role="alert">
                  This pick is no longer available. Choose a replacement; your
                  other choices are preserved.
                </p>
              ) : null}
              {pickCards(activePick.forLevel).length > 0 ? (
                <CandidateGrid
                  cards={pickCards(activePick.forLevel)}
                  selection="pick"
                  selectedPick={activePick.cardId}
                  pickLevel={activePick.forLevel}
                  canMutate={canMutate}
                  renderNote={renderNote}
                  onPick={(card) => choosePick(activePick.forLevel, card.id)}
                />
              ) : null}
              {pickCards(activePick.forLevel).length === 0 ? (
                <p className="issue-message">
                  No legal cards are available for this pick.
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {showHand ? (
        <section
          className="starting-hand"
          aria-labelledby="starting-hand-heading"
        >
          <h2
            id="starting-hand-heading"
            ref={showHand ? stepHeading : undefined}
            tabIndex={-1}
            className={picks.length ? undefined : "visually-hidden"}
          >
            {picks.length
              ? `Complement your picks · Level ${build.startLevel} hand`
              : "Choose your deck"}
          </h2>
          {character.id === "GE" ? (
            <p className="section-description">
              Choose 7 melee-form and 7 ranged-form cards.
            </p>
          ) : null}
          <RepairIssues
            build={build}
            character={character}
            state={{
              ...startState,
              issues: startState.issues.filter(
                (issue) => issue.severity === "invalid",
              ),
            }}
          />
          <div className="card-grid" role="list">
            {eligibleCards.map((card) => {
              const selected = selectedDeck.has(card.id);
              const pickedSlot = picks.find((pick) => pick.cardId === card.id);
              const inPool = startPoolIds.has(card.id);
              const notInDeck = !selected && (handFull || !inPool);
              return (
                <div
                  className="starting-deck-card"
                  data-not-in-deck={notInDeck}
                  role="listitem"
                  key={card.id}
                >
                  <CardTile
                    card={card}
                    actionLabel={
                      !inPool
                        ? `${card.name} is not in the starting pool`
                        : selected && pickedSlot
                          ? `Change level ${pickedSlot.forLevel} pick for ${card.name}`
                          : selected
                            ? `Remove ${card.name} from starting deck`
                            : `Add ${card.name} to starting deck`
                    }
                    stateLabel={
                      selected && pickedSlot
                        ? `Level ${pickedSlot.forLevel} pick`
                        : selected
                          ? "In starting deck"
                          : !inPool
                            ? "Not in pool"
                            : notInDeck
                              ? "Not in deck"
                              : undefined
                    }
                    disabled={!canMutate || !inPool || (!selected && handFull)}
                    onAction={() => toggleDeckCard(card)}
                  />
                  {renderNote(card)}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function effectiveCardLevel(card: Card): number {
  return card.level === "X" ? 1 : card.level;
}
