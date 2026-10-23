import type { ReactNode } from "react";
import type { Card } from "../shared/character.js";
import { CardTile } from "./cards";

export function CandidateGrid({
  cards,
  selection,
  selectedPick,
  pickLevel,
  added,
  canMutate,
  renderNote,
  onPick,
  onAdd,
}: {
  cards: Card[];
  selection: "pick" | "add";
  selectedPick: string | null;
  /** The level the selected pick is for, shown on its badge. */
  pickLevel: number;
  added?: Set<string>;
  canMutate: boolean;
  renderNote: (card: Card) => ReactNode;
  onPick: (card: Card) => void;
  onAdd?: (card: Card) => void;
}) {
  if (cards.length === 0) {
    return <p className="empty-inline">No eligible cards are available.</p>;
  }
  return (
    <div className="level-up-card-grid" role="list">
      {cards.map((card) => {
        const isPicked = selectedPick === card.id;
        const isAdded = added?.has(card.id) && !isPicked;
        const isUnpicked =
          selection === "pick" &&
          selectedPick !== null &&
          !isPicked &&
          !isAdded;
        const isNotInDeck = selection === "add" && !isAdded;
        return (
          <div className="level-up-candidate" role="listitem" key={card.id}>
            <CardTile
              card={card}
              actionLabel={
                selection === "pick"
                  ? isPicked
                    ? `Unpick ${card.name}`
                    : `Pick ${card.name}`
                  : isAdded
                    ? `Remove ${card.name} from deck`
                    : `Add ${card.name} to deck`
              }
              stateLabel={
                isPicked
                  ? `Level ${pickLevel} pick`
                  : isAdded
                    ? "Added from pool"
                    : isUnpicked
                      ? "Not in pool"
                      : isNotInDeck
                        ? "Not in deck"
                        : undefined
              }
              disabled={!canMutate}
              onAction={() =>
                selection === "pick" ? onPick(card) : onAdd?.(card)
              }
            />
            {renderNote(card)}
          </div>
        );
      })}
    </div>
  );
}
