import type { Card } from "../character.js";
import type { BuildOperationIdentity } from "../builds.js";
import type { Pick as BuildPick } from "../schema/index.js";

export type {
  BuildOperationIdentity as RuleOperationIdentity,
  BuildOperationKind as RuleOperationKind,
} from "../builds.js";

export type IssueSeverity = "incomplete" | "invalid";

export type RuleIssueCode =
  | "MISSING_PICK"
  | "DECK_TOO_SMALL"
  | "DECK_TOO_LARGE"
  | "FORM_IMBALANCE"
  | "UNKNOWN_CARD"
  | "PICK_TOO_HIGH"
  | "PICK_ALREADY_IN_POOL"
  | "DUPLICATE_PICK"
  | "PICK_NOT_ADDED"
  | "ADD_NOT_IN_POOL"
  | "ADD_ALREADY_IN_PREV_DECK"
  | "DUPLICATE_ADD"
  | "DROP_NOT_IN_PREV_DECK"
  | "DUPLICATE_DROP"
  | "START_CARD_NOT_IN_POOL"
  | "DUPLICATE_START_CARD";

export interface RuleIssue {
  code: RuleIssueCode;
  severity: IssueSeverity;
  level: number;
  message: string;
  cardId?: string;
  forLevel?: number;
  operation?: BuildOperationIdentity;
}

export interface AppliedStartingPick {
  forLevel: number;
  cardId: string;
}

export interface AppliedOperations {
  startingPicks: AppliedStartingPick[];
  pick: string | null;
  added: string[];
  dropped: string[];
}

export interface StoredOperations {
  startingPicks: BuildPick[];
  pick: string | null;
  added: string[];
  dropped: string[];
}

export interface RuleLevelState {
  level: number;
  pool: Card[];
  deck: Card[];
  issues: RuleIssue[];
  stored: StoredOperations;
  applied: AppliedOperations;
}

export interface ReplayResult {
  levels: RuleLevelState[];
  issues: RuleIssue[];
  startingPicks: AppliedStartingPick[];
}

export interface DeckEditConflict {
  cardId: string;
  existing: "added" | "dropped";
  requested: "added" | "dropped";
}

export interface DeckEdit {
  added: string[];
  dropped: string[];
  conflicts?: DeckEditConflict[];
}

export interface ApplyDeckEditOptions {
  /** Existing records that were loaded from storage and must not be lost. */
  existing: Pick<DeckEdit, "added" | "dropped">;
  /** Replay-derived valid records; all other existing records remain unresolved. */
  validAdded: readonly string[];
  validDropped: readonly string[];
}
