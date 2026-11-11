import { setLevelUp, type BuildMutationOptions } from "../../shared/builds.js";
import {
  applyDeckEdit,
  type RuleLevelState,
} from "../../shared/rules/index.js";
import {
  buildSchema,
  type Build,
  type CardNote,
  type LevelUp,
} from "../../shared/schema/index.js";

export interface LevelUpEditBaseline {
  levelUp: LevelUp;
  cardNotes: CardNote[];
}

export function captureLevelUpEdit(
  build: Build,
  levelUp: LevelUp,
): LevelUpEditBaseline {
  return {
    levelUp: {
      ...levelUp,
      added: [...levelUp.added],
      dropped: [...levelUp.dropped],
    },
    cardNotes: build.cardNotes
      .filter((note) => note.level === levelUp.level)
      .map((note) => ({ ...note })),
  };
}

export function chooseLevelUpPick(
  levelUp: LevelUp,
  cardId: string,
): Pick<LevelUp, "pick" | "added" | "dropped"> {
  const selectedPick = levelUp.pick;
  const added = [...levelUp.added];
  const oldIndex = selectedPick === null ? -1 : added.indexOf(selectedPick);
  const withoutPicks = added.filter(
    (id) => id !== selectedPick && id !== cardId,
  );
  if (selectedPick === cardId) {
    return {
      pick: null,
      added: withoutPicks,
      dropped: [...levelUp.dropped],
    };
  }
  if (oldIndex === -1) {
    withoutPicks.push(cardId);
  } else {
    withoutPicks.splice(Math.min(oldIndex, withoutPicks.length), 0, cardId);
  }
  return {
    pick: cardId,
    added: withoutPicks,
    dropped: [...levelUp.dropped],
  };
}

export function changeLevelUpDeck(
  levelUp: LevelUp,
  previousDeckIds: readonly string[],
  state: RuleLevelState,
  cardId: string,
  action: "add" | "remove",
): Pick<LevelUp, "pick" | "added" | "dropped"> {
  const desired = new Set(state.deck.map((card) => card.id));
  if (action === "add") {
    desired.add(cardId);
  } else {
    desired.delete(cardId);
  }
  const edit = applyDeckEdit(previousDeckIds, [...desired], {
    existing: {
      added: levelUp.added,
      dropped: levelUp.dropped,
    },
    validAdded: state.applied.added,
    validDropped: state.applied.dropped,
  });
  return {
    pick: levelUp.pick,
    added: edit.added,
    dropped: edit.dropped,
  };
}

/** Restore this edit's operations and touched notes onto the current build. */
export function resetLevelUpEdit(
  build: Build,
  baseline: LevelUpEditBaseline,
  changedNotes: ReadonlySet<string>,
  options: Pick<BuildMutationOptions, "now"> = {},
): Build {
  const level = baseline.levelUp.level;
  const resetLevel = setLevelUp(build, level, baseline.levelUp, options);
  if (changedNotes.size === 0) {
    return resetLevel;
  }
  const cardNotes = [
    ...resetLevel.cardNotes.filter(
      (note) => note.level !== level || !changedNotes.has(note.cardId),
    ),
    ...baseline.cardNotes
      .filter((note) => changedNotes.has(note.cardId))
      .map((note) => ({ ...note })),
  ];
  return buildSchema.parse({
    ...resetLevel,
    cardNotes,
    updatedAt: options.now?.() ?? new Date().toISOString(),
  });
}
