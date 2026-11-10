import { Link, useParams } from "react-router-dom";
import { getCharacter } from "../shared/data/characters/index.js";

export function UnavailableDeckView() {
  const { characterId } = useParams();
  const character = getCharacter(characterId ?? "");
  return (
    <main className="page-content narrow-content">
      <section className="empty-card">
        <p className="eyebrow">Deck view</p>
        <h1>This deck view is unavailable</h1>
        <p>
          That character, build or level does not exist. Your saved data is
          unchanged.
        </p>
        <Link
          className="button-link"
          to={character ? `/c/${character.id}` : "/"}
        >
          {character ? "Back to builds" : "Choose a character"}
        </Link>
      </section>
    </main>
  );
}
