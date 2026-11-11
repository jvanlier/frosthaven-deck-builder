export const LAST_POSITION_STORAGE_KEY =
  "frosthaven-deck-builder:last-position";

interface LastPosition {
  characterId: string;
  buildId: string;
  level: number;
}

export function rememberLastPosition(position: LastPosition): void {
  try {
    window.localStorage.setItem(
      LAST_POSITION_STORAGE_KEY,
      JSON.stringify(position),
    );
  } catch {
    // Position resume is a convenience; blocked storage must not block deck use.
  }
}

export function readLastPosition(): LastPosition | null {
  try {
    const raw = window.localStorage.getItem(LAST_POSITION_STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isLastPosition(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isLastPosition(value: unknown): value is LastPosition {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.characterId === "string" &&
    typeof candidate.buildId === "string" &&
    typeof candidate.level === "number" &&
    Number.isInteger(candidate.level) &&
    candidate.level >= 1 &&
    candidate.level <= 9
  );
}
