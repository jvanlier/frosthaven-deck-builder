import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CardTile, compareCardLevelsDescending } from "./cards";
import { CandidateGrid } from "./candidate-grid";
import { RepairIssues } from "./repairs";
import { deckPath } from "./deck-view";
import { CardNoteInput } from "./notes";
import { ImportDataError, parseImportFile, useAppData } from "./app-data";
import {
  copyBuild,
  createBuild,
  deleteBuild,
  renameBuild,
  setStartDeck,
  removeCardNote,
  setCardNote,
  setStartPick,
} from "../shared/builds.js";
import { characters } from "../shared/data/characters/index.js";
import {
  startingPickOptions,
  replayBuild,
  sortedCards,
} from "../shared/rules/index.js";
import type { Card, Character } from "../shared/character.js";
import type { AppData, Build } from "../shared/schema/index.js";

const character = characters[0]!;

export function BuildList() {
  const { data, canMutate, updateData } = useAppData();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"create" | "copy" | "rename" | null>(
    null,
  );
  const [selectedBuild, setSelectedBuild] = useState<Build | null>(null);
  const [buildToDelete, setBuildToDelete] = useState<Build | null>(null);
  const builds = data?.builds ?? [];

  const openCreate = () => {
    setSelectedBuild(null);
    setDialog("create");
  };
  const openCopy = (build: Build) => {
    setSelectedBuild(build);
    setDialog("copy");
  };
  const openRename = (build: Build) => {
    setSelectedBuild(build);
    setDialog("rename");
  };

  function addBuild(build: Build): void {
    if (!canMutate) {
      return;
    }
    updateData((current) => ({
      ...current,
      builds: [...current.builds, build],
    }));
    navigate(startEditorPath(build));
  }

  function renameSelected(name: string): void {
    if (!canMutate || !selectedBuild) {
      return;
    }
    const renamed = renameBuild(selectedBuild, name);
    updateData((current) => ({
      ...current,
      builds: current.builds.map((build) =>
        build.id === renamed.id ? renamed : build,
      ),
    }));
    setDialog(null);
  }

  function copySelected(name: string): void {
    if (!canMutate || !selectedBuild) {
      return;
    }
    const copied = copyBuild(selectedBuild, name);
    addBuild(copied);
    setDialog(null);
  }

  function confirmDelete(): void {
    if (!canMutate || !buildToDelete) {
      return;
    }
    updateData((current) => ({
      ...current,
      builds: deleteBuild(current.builds, buildToDelete.id),
    }));
    setBuildToDelete(null);
    navigate("/");
  }

  return (
    <main className="page-content" aria-labelledby="builds-heading">
      <section className="page-intro build-list-intro">
        <div>
          <p className="eyebrow">Snowdancer</p>
          <h1 id="builds-heading">Your builds</h1>
          <p>
            Choose a build to plan its deck from the starting level to level 9.
          </p>
        </div>
        <button type="button" onClick={openCreate} disabled={!canMutate}>
          Create build
        </button>
      </section>
      <DataBackupControls />
      {builds.length === 0 ? (
        <section className="empty-card" aria-labelledby="empty-heading">
          <h2 id="empty-heading">No builds yet</h2>
          <p>
            Create a build to choose a starting level, make your starting picks,
            and assemble a hand.
          </p>
        </section>
      ) : (
        <ul className="build-list">
          {builds.map((build) => {
            const levels = replayBuild(build, character).levels;
            const firstIssue = levels.find((state) => state.issues.length > 0);
            return (
              <li key={build.id}>
                <div className="build-list-item">
                  <Link to={buildEntryPath(build, levels)}>
                    <strong>{build.name}</strong>
                    <span>
                      Level: start {build.startLevel} · latest{" "}
                      {levels.at(-1)!.level}
                    </span>
                  </Link>
                  {firstIssue ? (
                    <span className="build-attention">Needs attention</span>
                  ) : null}
                  <div
                    className="build-actions"
                    aria-label={`${build.name} actions`}
                  >
                    <button
                      type="button"
                      onClick={() => openRename(build)}
                      disabled={!canMutate}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => openCopy(build)}
                      disabled={!canMutate}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => setBuildToDelete(build)}
                      disabled={!canMutate}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <NameDialog
        open={dialog === "create"}
        title="Create build"
        initialName=""
        submitLabel="Create build"
        canSubmit={canMutate}
        onClose={() => setDialog(null)}
        onSubmit={(name, startLevel) => {
          const build = createBuild({
            characterId: character.id,
            name,
            startLevel: startLevel ?? 1,
          });
          addBuild(build);
          setDialog(null);
        }}
        includeStartLevel
      />
      <NameDialog
        open={dialog === "copy"}
        title="Copy build"
        initialName={selectedBuild ? `${selectedBuild.name} copy` : ""}
        submitLabel="Copy build"
        canSubmit={canMutate}
        onClose={() => setDialog(null)}
        onSubmit={copySelected}
      />
      <NameDialog
        open={dialog === "rename"}
        title="Rename build"
        initialName={selectedBuild?.name ?? ""}
        submitLabel="Rename build"
        canSubmit={canMutate}
        onClose={() => setDialog(null)}
        onSubmit={renameSelected}
      />
      <ConfirmDialog
        open={buildToDelete !== null}
        title="Delete build?"
        message={
          buildToDelete
            ? `Delete ${buildToDelete.name}? This removes its saved deck choices and notes.`
            : ""
        }
        canConfirm={canMutate}
        onClose={() => setBuildToDelete(null)}
        onConfirm={confirmDelete}
      />
    </main>
  );
}

function DataBackupControls() {
  const { canMutate, downloadData, replaceData } = useAppData();
  const [candidate, setCandidate] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function exportData(): Promise<void> {
    setError(null);
    try {
      await downloadData();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The data could not be exported.",
      );
    }
  }

  async function selectImport(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    setError(null);
    try {
      setCandidate(await parseImportFile(file));
    } catch (cause) {
      setCandidate(null);
      setError(
        cause instanceof ImportDataError
          ? cause.message
          : "The backup could not be read.",
      );
    }
  }

  async function confirmImport(): Promise<void> {
    if (candidate === null || !canMutate) {
      return;
    }
    const replacementCandidate = candidate;
    setCandidate(null);
    setError(null);
    setImporting(true);
    try {
      await replaceData(replacementCandidate);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The imported data could not be saved.",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <section
      className="content-card backup-panel"
      aria-labelledby="backup-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Portable data</p>
          <h2 id="backup-heading">Data backup</h2>
        </div>
        <div className="backup-actions">
          <button
            type="button"
            onClick={() => void exportData()}
            disabled={!canMutate}
          >
            Export JSON
          </button>
          <label className="button-link secondary-button" htmlFor="import-json">
            Import JSON backup
            <input
              id="import-json"
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              disabled={!canMutate}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void selectImport(file);
              }}
            />
          </label>
        </div>
      </div>
      <p>
        Export includes every build and card note. Import first validates a
        backup, then replaces all saved data after confirmation.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <ImportConfirmationDialog
        candidate={candidate}
        canConfirm={canMutate && !importing}
        onCancel={() => {
          setCandidate(null);
          setError(null);
        }}
        onConfirm={() => void confirmImport()}
      />
    </section>
  );
}

function ImportConfirmationDialog({
  candidate,
  canConfirm,
  onCancel,
  onConfirm,
}: {
  candidate: AppData | null;
  canConfirm: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (candidate !== null && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    } else if (candidate === null && dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [candidate]);

  const cardNoteCount =
    candidate?.builds.reduce(
      (total, build) => total + build.cardNotes.length,
      0,
    ) ?? 0;

  return (
    <dialog
      ref={dialogRef}
      className="form-dialog"
      aria-labelledby="replace-data-heading"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="dialog-form">
        <h2 id="replace-data-heading">Replace saved data?</h2>
        <p>This will replace all data currently saved on the server.</p>
        <ul>
          <li>{candidate?.builds.length ?? 0} builds</li>
          <li>{cardNoteCount} card notes</li>
        </ul>
        <p>
          The backup&apos;s revision is ignored. The current server revision is
          used when saving the replacement.
        </p>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={!canConfirm}>
            Replace data
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function StartingRoute() {
  const { characterId, buildId, level } = useParams();
  const { data } = useAppData();
  const build = data?.builds.find((candidate) => candidate.id === buildId);
  if (
    characterId !== character.id ||
    !build ||
    Number(level) !== build.startLevel
  ) {
    return <UnavailableStartingView />;
  }
  return <StartingDeckPlaceholder build={build} />;
}

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
    updateData((current) => ({
      ...current,
      builds: current.builds.map((candidate) =>
        candidate.id === nextBuild.id ? nextBuild : candidate,
      ),
    }));
  };

  const choosePick = (forLevel: number, cardId: string) => {
    if (!canMutate) {
      return;
    }
    const current = build.startPicks.find((pick) => pick.forLevel === forLevel);
    const next = setStartPick(
      build,
      forLevel,
      current?.cardId === cardId ? null : cardId,
    );
    // Replacing/unpicking a pool card also removes it from the hand, unless
    // another slot still owns it. Leave unrelated invalid entries and notes alone.
    const nextDeck = build.startDeck.filter(
      (id) =>
        id !== current?.cardId ||
        next.startPicks.some((pick) => pick.cardId === id),
    );
    if (current?.cardId !== cardId && !nextDeck.includes(cardId)) {
      nextDeck.push(cardId);
    }
    updateBuild(setStartDeck(next, nextDeck));
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
    const nextDeck = isSelected
      ? build.startDeck.filter((cardId) => cardId !== card.id)
      : [...build.startDeck, card.id];
    updateBuild(setStartDeck(build, nextDeck));
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
              aria-label="Starting hand"
              aria-current={showHand ? "step" : undefined}
              disabled={!!firstUnfinished}
              onClick={() => openStep(null)}
            >
              Hand
            </button>
          </nav>
          <details className="starting-pick-summary" open={showHand}>
            <summary>Level-up card picks</summary>
            <ul>
              {picks
                .filter((pick) => pick.cardId)
                .map((pick) => (
                  <li key={pick.forLevel}>
                    <span>
                      Level {pick.forLevel}:{" "}
                      <strong>
                        {character.cards.find((card) => card.id === pick.cardId)
                          ?.name ?? pick.cardId}
                      </strong>
                      {!validPickLevels.has(pick.forLevel)
                        ? " — choose a replacement"
                        : ""}
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!canMutate}
                      onClick={() => openStep(pick.forLevel)}
                    >
                      Change level {pick.forLevel} pick
                    </button>
                  </li>
                ))}
            </ul>
          </details>
          {activePick ? (
            <section
              className="editor-section"
              data-pick-level={activePick.forLevel}
              aria-labelledby="starting-picks-heading"
            >
              <h2 id="starting-picks-heading" ref={stepHeading} tabIndex={-1}>
                Level {activePick.forLevel} pick
              </h2>
              <p>Choose one card of level {activePick.forLevel} or lower.</p>
              {activePick.cardId &&
              !validPickLevels.has(activePick.forLevel) ? (
                <p className="issue-message" role="alert">
                  This pick is no longer available. Choose a replacement; your
                  other choices are preserved.
                </p>
              ) : null}
              {Array.from(
                new Set(
                  pickCards(activePick.forLevel).map((card) =>
                    effectiveCardLevel(card),
                  ),
                ),
              ).map((level) => (
                <section
                  className="starting-candidate-group"
                  key={level}
                  aria-label={`Level ${level} cards`}
                >
                  <h3>Level {level} cards</h3>
                  <CandidateGrid
                    cards={pickCards(activePick.forLevel).filter(
                      (card) => effectiveCardLevel(card) === level,
                    )}
                    selection="pick"
                    selectedPick={activePick.cardId}
                    pickLevel={activePick.forLevel}
                    canMutate={canMutate}
                    renderNote={renderNote}
                    onPick={(card) => choosePick(activePick.forLevel, card.id)}
                  />
                </section>
              ))}
              {pickCards(activePick.forLevel).length === 0 ? (
                <p className="issue-message">
                  No legal cards are available for this pick.
                </p>
              ) : null}
              <details className="starting-unavailable">
                <summary>Show unavailable cards</summary>
                <ul>
                  {character.cards
                    .filter(
                      (card) =>
                        effectiveCardLevel(card) > 1 &&
                        effectiveCardLevel(card) <= build.startLevel &&
                        !pickCards(activePick.forLevel).some(
                          (option) => option.id === card.id,
                        ),
                    )
                    .sort(compareCardLevelsDescending)
                    .map((card) => (
                      <li key={card.id}>
                        {card.name} · Level {card.level} —{" "}
                        {picks.some(
                          (pick) =>
                            pick.forLevel > activePick.forLevel &&
                            pick.cardId === card.id,
                        )
                          ? "Already picked"
                          : "No remaining pick can select this card"}
                      </li>
                    ))}
                </ul>
              </details>
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
          {picks.length ? (
            <p>
              Your picked cards stay in the hand. Click one to change its pick.
              Add or remove complementary level 1 and X cards here.
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
              const excluded = !selected && (handFull || !inPool);
              return (
                <div
                  className="starting-deck-card"
                  data-excluded={excluded}
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
                            : excluded
                              ? "Excluded"
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

function NameDialog({
  open,
  title,
  initialName,
  submitLabel,
  onClose,
  onSubmit,
  canSubmit,
  includeStartLevel = false,
}: {
  open: boolean;
  title: string;
  initialName: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string, startLevel?: number) => void;
  canSubmit: boolean;
  includeStartLevel?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initialName);
  const [startLevel, setStartLevel] = useState("1");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
      if (dialogRef.current && !dialogRef.current.open) {
        dialogRef.current.showModal();
      }
    } else if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [open, initialName]);

  return (
    <dialog
      ref={dialogRef}
      className="form-dialog"
      aria-labelledby={`${title.replaceAll(" ", "-")}-heading`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) {
            setError("Saving is paused. Retry the save before editing.");
            return;
          }
          try {
            onSubmit(name, includeStartLevel ? Number(startLevel) : undefined);
          } catch {
            setError("Enter a name from 1 to 100 characters.");
          }
        }}
      >
        <h2 id={`${title.replaceAll(" ", "-")}-heading`}>{title}</h2>
        <label>
          Build name
          <input
            autoFocus
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            disabled={!canSubmit}
          />
        </label>
        {includeStartLevel ? (
          <label>
            Start level
            <select
              value={startLevel}
              onChange={(event) => setStartLevel(event.target.value)}
              disabled={!canSubmit}
            >
              {Array.from({ length: 9 }, (_, index) => (
                <option value={index + 1} key={index + 1}>
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit}>
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function ConfirmDialog({
  open,
  title,
  message,
  canConfirm,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
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
      aria-labelledby="delete-build-heading"
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
        <h2 id="delete-build-heading">{title}</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            Delete build
          </button>
        </div>
      </form>
    </dialog>
  );
}

function StartingDeckPlaceholder({ build }: { build: Build }) {
  return (
    <main className="page-content narrow-content">
      <section className="empty-card">
        <p className="eyebrow">Starting level {build.startLevel}</p>
        <h1>Deck view is not available yet</h1>
        <p>
          The starting editor is available while the full deck view is being
          built.
        </p>
        <Link className="button-link" to={startEditorPath(build)}>
          Open starting editor
        </Link>
      </section>
    </main>
  );
}

function UnavailableStartingView() {
  return (
    <main className="page-content narrow-content">
      <section className="empty-card">
        <p className="eyebrow">Build not found</p>
        <h1>This starting editor is unavailable</h1>
        <p>Choose an existing build or create a new one.</p>
        <Link className="button-link" to={`/c/${character.id}`}>
          Back to builds
        </Link>
      </section>
    </main>
  );
}

function buildEntryPath(
  build: Build,
  levels: ReturnType<typeof replayBuild>["levels"],
): string {
  const firstIssue = levels.find((state) => state.issues.length > 0);
  if (build.levelUps.length === 0 && firstIssue) {
    return startEditorPath(build);
  }
  return deckPath(
    build.characterId,
    build.id,
    firstIssue?.level ?? levels.at(-1)!.level,
  );
}

export function startEditorPath(build: Build, focusForLevel?: number): string {
  const path = `/c/${encodeURIComponent(build.characterId)}/b/${encodeURIComponent(build.id)}/l/${build.startLevel}/start`;
  return focusForLevel === undefined ? path : `${path}?focus=${focusForLevel}`;
}

function effectiveCardLevel(card: Card): number {
  return card.level === "X" ? 1 : card.level;
}
