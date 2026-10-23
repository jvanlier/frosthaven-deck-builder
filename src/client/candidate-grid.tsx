import type { ReactNode } from "react";
import type { Card } from "../shared/character.js";
import { CardTile } from "./cards";

export function CandidateGrid({
  cards,
  selection,
  selectedPick,
  added,
  canMutate,
  renderNote,
  onPick,
  onAdd,
}: {
  cards: Card[];
  selection: "pick" | "add";
  selectedPick: string | null;
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
        const isExcluded =
          selection === "pick" &&
          selectedPick !== null &&
          !isPicked &&
          !isAdded;
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
                  ? "Level-up pick"
                  : isAdded
                    ? "Added from pool"
                    : isExcluded
                      ? "Excluded"
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
