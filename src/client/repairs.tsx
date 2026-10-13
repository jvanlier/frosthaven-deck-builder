import { useNavigate } from "react-router-dom";
import {
  removeBuildOperation,
  restorePickedCard,
  type BuildOperationIdentity,
} from "../shared/builds.js";
import type { Character } from "../shared/character.js";
import type { Build } from "../shared/schema/index.js";
import type { RuleIssue, RuleLevelState } from "../shared/rules/index.js";
import { useAppData } from "./app-data";
import { startEditorPath } from "./build-editor";

export function RepairIssues({
  build,
  character,
  state,
}: {
  build: Build;
  character: Character;
  state: RuleLevelState;
}) {
  const { canMutate, updateData } = useAppData();
  const navigate = useNavigate();

  if (state.issues.length === 0) {
    return null;
  }

  function updateBuild(mutator: (build: Build) => Build): void {
    if (!canMutate) {
      return;
    }
    updateData((current) => ({
      ...current,
      builds: current.builds.map((candidate) =>
        candidate.id === build.id ? mutator(candidate) : candidate,
      ),
    }));
  }

  function openEditor(issue: RuleIssue): void {
    if (state.level === build.startLevel) {
      navigate(startEditorPath(build));
      return;
    }
    const focus = issue.cardId
      ? `?focus=${encodeURIComponent(issue.cardId)}`
      : issue.code === "MISSING_PICK"
        ? "?focus=pick"
        : "?focus=deck";
    navigate(
      `/c/${encodeURIComponent(character.id)}/b/${encodeURIComponent(build.id)}/l/${state.level}/level-up${focus}`,
    );
  }

  function removeOperation(issue: RuleIssue): void {
    const operation = issue.operation;
    if (!operation || !canRemoveOperation(operation)) {
      openEditor(issue);
      return;
    }
    updateBuild((current) =>
      removeBuildOperation(current, state.level, operation),
    );
  }

  function restorePick(issue: RuleIssue): void {
    if (!issue.cardId || issue.operation?.kind !== "pick") {
      openEditor(issue);
      return;
    }
    updateBuild((current) =>
      restorePickedCard(current, state.level, issue.cardId!),
    );
  }

  return (
    <section className="deck-issues" aria-labelledby="repair-issues-heading">
      <h2 id="repair-issues-heading">Needs attention</h2>
      <ul className="issue-list repair-list">
        {state.issues.map((issue, index) => {
          const cardName = issue.cardId
            ? (character.cards.find((card) => card.id === issue.cardId)?.name ??
              issue.cardId)
            : undefined;
          const action = repairAction(issue, cardName);
          return (
            <li
              className={`issue-${issue.severity}`}
              key={`${issue.code}-${issue.cardId ?? index}-${issue.operation?.index ?? ""}`}
            >
              <span>{issue.message}</span>
              <button
                type="button"
                className="secondary-button repair-button"
                disabled={!canMutate}
                onClick={() => {
                  if (action.kind === "remove") {
                    removeOperation(issue);
                  } else if (action.kind === "restore") {
                    restorePick(issue);
                  } else {
                    openEditor(issue);
                  }
                }}
              >
                {action.label}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function canRemoveOperation(operation: BuildOperationIdentity): boolean {
  if (operation.kind === "pick" || operation.kind === "start-pick") {
    return operation.cardId !== null && operation.cardId !== undefined;
  }
  return (
    operation.kind === "add" ||
    operation.kind === "drop" ||
    operation.kind === "start-deck"
  );
}

function repairAction(
  issue: RuleIssue,
  cardName: string | undefined,
): { kind: "remove" | "restore" | "edit"; label: string } {
  if (issue.code === "PICK_NOT_ADDED" && issue.cardId) {
    return { kind: "restore", label: `Restore ${cardName} to deck` };
  }
  if (issue.operation && canRemoveOperation(issue.operation)) {
    const subject = cardName ?? "card";
    const prefix =
      issue.operation.kind === "drop"
        ? "dropped"
        : issue.operation.kind === "start-deck"
          ? "starting"
          : issue.operation.kind === "start-pick"
            ? "starting pick"
            : issue.operation.kind === "pick"
              ? "pick"
              : "added";
    return { kind: "remove", label: `Remove ${prefix} card ${subject}` };
  }
  return {
    kind: "edit",
    label:
      issue.operation?.kind === "start-pick" ||
      issue.operation?.kind === "start-deck"
        ? "Edit starting choices"
        : `Edit level ${issue.level}`,
  };
}
