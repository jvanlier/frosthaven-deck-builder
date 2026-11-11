import { useEffect, useRef, useState } from "react";
import { ImportDataError, parseImportFile, useAppData } from "../app-data";
import type { AppData } from "../../shared/schema/index.js";

export function DataBackupControls() {
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
