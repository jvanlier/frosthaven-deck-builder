import { useEffect, useRef, useState } from "react";

export function NameDialog({
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

export function ConfirmDialog({
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
