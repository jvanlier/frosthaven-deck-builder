import type { Card } from "../shared/character.js";
import {
  MAX_NOTE_LENGTH,
  type AppData,
  type Build,
} from "../shared/schema/index.js";

export type EditableMotivationKind = "exclude" | "add" | "drop";

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

export function MotivationInput({
  card,
  kind,
  value,
  disabled,
  onChange,
  label,
}: {
  card: Card;
  kind: EditableMotivationKind;
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
  label?: string;
}) {
  const defaultLabel =
    kind === "exclude"
      ? `Why not ${card.name}?`
      : kind === "drop"
        ? `Why drop ${card.name}?`
        : `Why add ${card.name}?`;
  return (
    <label className="motivation-input" data-kind={kind}>
      <span title={label ?? defaultLabel}>{label ?? defaultLabel}</span>
      <textarea
        value={value}
        maxLength={MAX_NOTE_LENGTH}
        rows={3}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function GuidanceInput({
  card,
  value,
  disabled,
  onChange,
}: {
  card: Card;
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
}) {
  return (
    <label className="guidance-input">
      Guidance for {card.name}
      <textarea
        value={value}
        maxLength={MAX_NOTE_LENGTH}
        rows={6}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
