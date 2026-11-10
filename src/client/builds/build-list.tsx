import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAppData } from "../app-data";
import { updateBuildData } from "../build-data";
import { DataBackupControls } from "../backup/data-backup-controls";
import { UnavailableDeckView } from "../unavailable-deck-view";
import { startEditorPath } from "../navigation/paths";
import { buildEntryPath } from "../navigation/build-destination";
import { ConfirmDialog, NameDialog } from "./build-dialogs";
import {
  copyBuild,
  createBuild,
  deleteBuild,
  renameBuild,
} from "../../shared/builds.js";
import { getCharacter } from "../../shared/data/characters/index.js";
import { replayBuild } from "../../shared/rules/index.js";
import type { Character } from "../../shared/character.js";
import type { Build } from "../../shared/schema/index.js";

export function BuildList() {
  const { characterId } = useParams();
  const character = getCharacter(characterId ?? "");
  return character ? (
    <CharacterBuildList key={character.id} character={character} />
  ) : (
    <UnavailableDeckView />
  );
}

function CharacterBuildList({ character }: { character: Character }) {
  const { data, canMutate, updateData } = useAppData();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"create" | "copy" | "rename" | null>(
    null,
  );
  const [selectedBuild, setSelectedBuild] = useState<Build | null>(null);
  const [buildToDelete, setBuildToDelete] = useState<Build | null>(null);
  const builds =
    data?.builds.filter((build) => build.characterId === character.id) ?? [];

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
    updateData((current) =>
      updateBuildData(current, renamed.id, () => renamed),
    );
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
    navigate(`/c/${character.id}`);
  }

  return (
    <main className="page-content" aria-labelledby="builds-heading">
      <section className="page-intro build-list-intro">
        <div>
          <p className="eyebrow">{character.name}</p>
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
