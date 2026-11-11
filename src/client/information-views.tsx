import { Link } from "react-router-dom";

export function AboutView() {
  return (
    <main
      className="page-content narrow-content"
      aria-labelledby="about-heading"
    >
      <section className="page-intro">
        <p className="eyebrow">About</p>
        <h1 id="about-heading">Local, personal deck planning</h1>
        <p>
          Frosthaven Deck Builder keeps your planning document on your own
          server and uses local artwork at runtime.
        </p>
      </section>
      <section className="content-card" aria-labelledby="credits-heading">
        <h2 id="credits-heading">Attribution</h2>
        <p>
          Card artwork, text and class icons © Cephalofair Games, used for
          personal, non-commercial purposes.
        </p>
        <p>
          Card data and images are sourced via cmlenius/gloomhaven-card-browser.
        </p>
      </section>
    </main>
  );
}

export function UnavailableView() {
  return (
    <main
      className="page-content narrow-content"
      aria-labelledby="unavailable-heading"
    >
      <section className="empty-card">
        <p className="eyebrow">Coming next</p>
        <h1 id="unavailable-heading">
          This planning view is not available yet
        </h1>
        <p>
          Your saved data is safe. This route will become available when its
          editor is ready.
        </p>
        <Link className="button-link" to="/">
          Choose a character
        </Link>
      </section>
    </main>
  );
}
