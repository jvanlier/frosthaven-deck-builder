import type { Card } from "../shared/character.js";
import { CardTile } from "./cards";
import { MotivationInput } from "./notes";

export function CandidateGrid({
  cards,
  level,
  selection,
  selectedPick,
  added,
  canMutate,
  motivationText,
  onPick,
  onAdd,
  onMotivation,
}: {
  cards: Card[];
  level: number;
  selection: "pick" | "add";
  selectedPick: string | null;
  added?: Set<string>;
  canMutate: boolean;
  motivationText: (cardId: string, kind: "add" | "exclude") => string;
  onPick: (card: Card) => void;
  onAdd?: (card: Card) => void;
  onMotivation: (card: Card, kind: "add" | "exclude", text: string) => void;
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
        // A picked card always gets its reason, even when it is lower-level.
        // Other lower-level cards remain available for a later starting slot.
        const showMotivation =
          isPicked || selection !== "pick" || card.level === level;
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
                  ? "Picked"
                  : isAdded
                    ? "Added"
                    : isExcluded
                      ? "Excluded"
                      : undefined
              }
              disabled={!canMutate}
              onAction={() =>
                selection === "pick" ? onPick(card) : onAdd?.(card)
              }
            />
            {showMotivation &&
            (isPicked || (isAdded && selection !== "pick")) ? (
              <MotivationInput
                card={card}
                kind="add"
                value={motivationText(card.id, "add")}
                disabled={!canMutate}
                onChange={(text) => onMotivation(card, "add", text)}
              />
            ) : isExcluded && showMotivation ? (
              <MotivationInput
                card={card}
                kind="exclude"
                value={motivationText(card.id, "exclude")}
                disabled={!canMutate}
                onChange={(text) => onMotivation(card, "exclude", text)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
