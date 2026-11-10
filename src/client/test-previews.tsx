import { useState } from "react";
import { useAppData } from "./app-data";
import { CardGrid } from "./cards";
import { getCharacter } from "../shared/data/characters/index.js";

export function CardPreview() {
  const character = getCharacter("SD")!;
  const [selected, setSelected] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const previewCards = [
    character.cards[0]!,
    {
      ...character.cards[1]!,
      id: "missing-preview-card",
      image: "SD/missing.jpeg",
    },
    { ...character.cards[2]!, id: "paused-preview-card" },
  ];

  return (
    <main className="page-content" aria-labelledby="card-preview-heading">
      <section className="page-intro">
        <p className="eyebrow">Component preview</p>
        <h1 id="card-preview-heading">Card actions</h1>
        <p>Cards have separate actions and explicit enlarge controls.</p>
        {selected ? <p role="status">Selected {selected}</p> : null}
        <button type="button" onClick={() => setPaused((value) => !value)}>
          Toggle paused card
        </button>
      </section>
      <CardGrid
        cards={previewCards}
        actionLabel={(card) => `Open ${card.name}`}
        stateLabel={(card) =>
          card.id === "paused-preview-card" && paused ? "Paused" : undefined
        }
        disabled={(card) => card.id === "paused-preview-card" && paused}
        onAction={(card) => setSelected(card.name)}
      />
    </main>
  );
}

export function SaveFeedbackPreview() {
  const { data, canMutate, updateData } = useAppData();

  return (
    <main
      className="page-content"
      aria-labelledby="save-feedback-preview-heading"
    >
      <section className="page-intro">
        <p className="eyebrow">Component preview</p>
        <h1 id="save-feedback-preview-heading">Save feedback</h1>
        <button
          type="button"
          disabled={!canMutate || data === null}
          onClick={() => {
            if (data !== null) {
              updateData((current) => ({
                ...current,
                revision: current.revision + 1,
              }));
            }
          }}
        >
          Trigger pending save
        </button>
      </section>
      <div aria-hidden="true" style={{ minHeight: "150vh" }} />
    </main>
  );
}
