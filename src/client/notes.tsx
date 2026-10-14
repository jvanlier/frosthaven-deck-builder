import type { Card } from "../shared/character.js";
import { MAX_NOTE_LENGTH } from "../shared/schema/index.js";

export type EditableMotivationKind = "exclude" | "add" | "drop";

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
      ? `Why exclude ${card.name}?`
      : kind === "drop"
        ? `Why drop ${card.name}?`
        : `Why add ${card.name}?`;
  return (
    <label className="motivation-input">
      {label ?? defaultLabel}
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
