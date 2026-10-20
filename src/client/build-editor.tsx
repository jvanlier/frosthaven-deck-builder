import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CardGrid, CardTile } from "./cards";
import { deckPath } from "./deck-view";
import { MotivationInput } from "./notes";
import { ImportDataError, parseImportFile, useAppData } from "./app-data";
import {
  copyBuild,
  createBuild,
  deleteBuild,
  renameBuild,
  setStartDeck,
  setStartPick,
  upsertMotivation,
} from "../shared/builds.js";
import { characters } from "../shared/data/characters/index.js";
import {
  pickOptions,
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
          {builds.map((build) => (
            <li key={build.id}>
              <div className="build-list-item">
                <Link to={startEditorPath(build)}>
                  <strong>{build.name}</strong>
                  <span>Starting level {build.startLevel}</span>
                </Link>
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
          ))}
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
        Export includes every build, motivation and guidance note. Import first
        validates a backup, then replaces all saved data after confirmation.
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

  const motivationCount =
    candidate?.builds.reduce(
      (total, build) => total + build.motivations.length,
      0,
    ) ?? 0;
  const guidanceCount =
    candidate?.builds.reduce(
      (total, build) => total + Object.keys(build.guidance).length,
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
          <li>{motivationCount} motivations</li>
          <li>{guidanceCount} guidance notes</li>
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
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const firstIncompleteSlot = build.startPicks.findIndex(
    (pick) => pick.cardId === null,
  );
  const focusedSlot =
    focusForLevel === undefined
      ? -1
      : build.startPicks.findIndex((pick) => pick.forLevel === focusForLevel);
  const activeSlot =
    editingSlot ??
    (focusedSlot !== -1
      ? focusedSlot
      : firstIncompleteSlot === -1
        ? Math.max(build.startPicks.length - 1, 0)
        : firstIncompleteSlot);

  useEffect(() => {
    if (focusForLevel === undefined) {
      return;
    }
    const section = document.querySelector<HTMLElement>(
      `[data-pick-level="${focusForLevel}"]`,
    );
    const target =
      section?.querySelector<HTMLButtonElement>(".card-action") ??
      section?.querySelector<HTMLElement>("h3");
    target?.focus();
  }, [focusForLevel]);

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
    updateBuild(
      setStartPick(build, forLevel, current?.cardId === cardId ? null : cardId),
    );
    setEditingSlot(null);
  };

  const toggleDeckCard = (card: Card) => {
    if (!canMutate || !startPoolIds.has(card.id)) {
      return;
    }
    const isSelected = selectedDeck.has(card.id);
    if (!isSelected && handFull) {
      return;
    }
    const nextDeck = isSelected
      ? build.startDeck.filter((cardId) => cardId !== card.id)
      : [...build.startDeck, card.id];
    updateBuild(setStartDeck(build, nextDeck));
  };

  const updateMotivation = (
    card: Card,
    kind: "exclude" | "add",
    text: string,
    forLevel?: number,
  ) => {
    if (!canMutate) {
      return;
    }
    updateBuild(
      upsertMotivation(build, {
        kind,
        cardId: card.id,
        text,
        forLevel,
        level: forLevel ?? build.startLevel,
      }),
    );
  };

  const motivationText = (cardId: string, kind: "exclude" | "add") =>
    build.motivations.find(
      (motivation) =>
        motivation.level === build.startLevel &&
        motivation.cardId === cardId &&
        motivation.kind === kind,
    )?.text ?? "";

  const pickCards = (forLevel: number): Card[] => {
    const selected = build.startPicks.find(
      (pick) => pick.forLevel === forLevel,
    )?.cardId;
    const options = pickOptions(build, character, forLevel);
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
  );

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

      {build.startPicks.length > 0 ? (
        <section
          className="editor-section"
          aria-labelledby="starting-picks-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Prosperity picks</p>
              <h2 id="starting-picks-heading">Starting picks</h2>
            </div>
            <span className="editor-count">
              {build.startPicks.filter((pick) => pick.cardId !== null).length} /{" "}
              {build.startPicks.length} picked
            </span>
          </div>
          <div className="pick-list">
            {build.startPicks.map((pick, index) => {
              const selected = pick.cardId
                ? character.cards.find((card) => card.id === pick.cardId)
                : undefined;
              const isActive = index === activeSlot;
              return (
                <article
                  className={`pick-section${isActive ? " active" : ""}`}
                  data-pick-level={pick.forLevel}
                  key={pick.forLevel}
                >
                  <div className="pick-heading">
                    <h3 tabIndex={-1}>Level {pick.forLevel} pick</h3>
                    {selected && !isActive ? (
                      <button
                        type="button"
                        onClick={() => setEditingSlot(index)}
                        disabled={!canMutate}
                      >
                        Change pick
                      </button>
                    ) : null}
                  </div>
                  {selected && !isActive ? (
                    <p className="selected-pick">
                      Picked: <strong>{selected.name}</strong>
                    </p>
                  ) : !isActive ? (
                    <p className="pick-waiting">
                      Complete the earlier pick to see legal choices.
                    </p>
                  ) : (
                    <CardGrid
                      cards={pickCards(pick.forLevel)}
                      actionLabel={(card) =>
                        pick.cardId === card.id
                          ? `Unpick ${card.name}`
                          : `Pick ${card.name}`
                      }
                      stateLabel={(card) =>
                        pick.cardId === card.id ? "Picked" : undefined
                      }
                      disabled={!canMutate}
                      onAction={(card) => choosePick(pick.forLevel, card.id)}
                    />
                  )}
                  {isActive &&
                  pick.cardId === null &&
                  pickCards(pick.forLevel).length === 0 ? (
                    <p className="issue-message">
                      No legal cards are available for this pick.
                    </p>
                  ) : null}
                  {selected ? (
                    <MotivationInput
                      card={selected}
                      kind="add"
                      label={`Why add ${selected.name}?`}
                      value={motivationText(selected.id, "add")}
                      disabled={!canMutate}
                      onChange={(text) =>
                        updateMotivation(selected, "add", text, pick.forLevel)
                      }
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section
        className="starting-hand"
        aria-labelledby="starting-hand-heading"
      >
        <h2 id="starting-hand-heading" className="visually-hidden">
          Choose your deck
        </h2>
        <div className="starting-hand-status">
          <ul
            className="issue-list"
            aria-label="Starting build status"
            aria-live="polite"
          >
            {startState.issues.length > 0 ? (
              startState.issues.map((issue, index) => (
                <li
                  className={`issue-${issue.severity}`}
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
          <button
            type="button"
            className="secondary-button repair-button"
            onClick={() =>
              navigate(deckPath(character.id, build.id, build.startLevel))
            }
          >
            Done
          </button>
        </div>
        <div className="card-grid" role="list">
          {eligibleCards.map((card) => {
            const selected = selectedDeck.has(card.id);
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
                      : selected
                        ? `Remove ${card.name} from starting deck`
                        : `Add ${card.name} to starting deck`
                  }
                  stateLabel={
                    selected
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
                {selected ? (
                  <MotivationInput
                    card={card}
                    kind="add"
                    label={`Why include ${card.name}?`}
                    value={motivationText(card.id, "add")}
                    disabled={!canMutate}
                    onChange={(text) => updateMotivation(card, "add", text)}
                  />
                ) : excluded ? (
                  <MotivationInput
                    card={card}
                    kind="exclude"
                    value={motivationText(card.id, "exclude")}
                    disabled={!canMutate}
                    onChange={(text) => updateMotivation(card, "exclude", text)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
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

export function startEditorPath(build: Build, focusForLevel?: number): string {
  const path = `/c/${encodeURIComponent(build.characterId)}/b/${encodeURIComponent(build.id)}/l/${build.startLevel}/start`;
  return focusForLevel === undefined ? path : `${path}?focus=${focusForLevel}`;
}

function effectiveCardLevel(card: Card): number {
  return card.level === "X" ? 1 : card.level;
}
