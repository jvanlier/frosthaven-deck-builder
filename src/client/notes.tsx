import { useId } from "react";
import type { Card } from "../shared/character.js";
import { effectiveCardNote } from "../shared/builds.js";
import {
  MAX_NOTE_LENGTH,
  type AppData,
  type Build,
} from "../shared/schema/index.js";

export function updateBuildData(
  data: AppData,
  buildId: string,
  updater: (build: Build) => Build,
): AppData {
  const build = data.builds.find((candidate) => candidate.id === buildId);
  if (!build) {
    return data;
  }
  const updated = updater(build);
  if (updated === build) {
    return data;
  }
  return {
    ...data,
    builds: data.builds.map((candidate) =>
      candidate.id === updated.id ? updated : candidate,
    ),
  };
}

/**
 * Edits a card's note at one level. The field is pre-filled with the note the
 * level inherits; typing records a new version at this level, and revert drops
 * that version so the older note applies again.
 */
export function CardNoteInput({
  build,
  card,
  level,
  disabled,
  onChange,
  onRevert,
}: {
  build: Build;
  card: Card;
  level: number;
  disabled: boolean;
  onChange: (text: string) => void;
  onRevert: () => void;
}) {
  const id = useId();
  const note = effectiveCardNote(build, card.id, level);
  const recordedHere = note?.level === level;
  const inherited = recordedHere
    ? effectiveCardNote(build, card.id, level - 1)
    : note;
  return (
    <div className="card-note-input">
      <div className="card-note-header">
        <label htmlFor={id}>Card note</label>
        {note && !recordedHere ? (
          <span
            className="card-note-level"
            title={`Recorded at level ${note.level}`}
          >
            from L{note.level}
          </span>
        ) : null}
        {recordedHere ? (
          <span
            className="card-note-level"
            data-current="true"
            title={`Recorded at level ${level}`}
          >
            L{level}
          </span>
        ) : null}
        {recordedHere && inherited ? (
          <button
            type="button"
            className="card-note-revert"
            disabled={disabled}
            onClick={onRevert}
            aria-label={`Revert ${card.name} note to level ${inherited.level}`}
            title={`Revert to level ${inherited.level} note`}
          >
            ↺
          </button>
        ) : null}
      </div>
      <textarea
        id={id}
        aria-label={`Card note for ${card.name}`}
        value={note?.text ?? ""}
        maxLength={MAX_NOTE_LENGTH}
        rows={3}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function formatNoteTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) {
    return timestamp;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
