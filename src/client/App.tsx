import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useAppData } from "./app-data";
import { CardGrid } from "./cards";
import { characters } from "../shared/data/characters/index.js";
import type { Character } from "../shared/character.js";

const healthMessages = {
  loading: "Checking server…",
  healthy: "Server healthy",
  unavailable: "Server unavailable",
} as const;

type HealthState = keyof typeof healthMessages;
const character = characters[0]!;

export default function App() {
  const appData = useAppData();
  const health = useHealth();

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!appData.hasPendingChanges) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [appData.hasPendingChanges]);

  if (appData.data === null && appData.status === "loading") {
    return (
      <main className="shell loading-shell">
        <AppHeading character={character} />
        <p role="status" aria-live="polite">
          Loading your deck workspace…
        </p>
      </main>
    );
  }

  if (appData.data === null && appData.status === "error") {
    return (
      <main className="shell error-shell">
        <AppHeading character={character} />
        <section className="feedback-card" aria-labelledby="load-error-heading">
          <h1 id="load-error-heading">Your workspace is unavailable</h1>
          <p>
            The server could not load your deck data. Editing is paused until
            the connection is restored.
          </p>
          <button
            type="button"
            onClick={() => void appData.retry().catch(() => undefined)}
          >
            Retry
          </button>
        </section>
        <HealthIndicator state={health} />
      </main>
    );
  }

  return (
    <div className="app-frame">
      <AppHeader character={character} health={health} />
      <SaveFeedback />
      <Routes>
        <Route path="/" element={<BuildList />} />
        <Route path="/about" element={<AboutView />} />
        {import.meta.env.DEV ? (
          <Route path="/__test/cards" element={<CardPreview />} />
        ) : null}
        <Route path="/c/:characterId" element={<BuildList />} />
        <Route path="*" element={<UnavailableView />} />
      </Routes>
      <BottomTabs />
    </div>
  );
}

function AppHeading({ character }: { character: Character }) {
  return (
    <header className="hero app-heading">
      <img className="class-icon" src={`/${character.icon}`} alt="" />
      <p className="eyebrow">{character.name} · Frosthaven</p>
      <h1>Frosthaven Deck Builder</h1>
      <p className="intro">
        Plan your character&apos;s deck across every level.
      </p>
    </header>
  );
}

function AppHeader({
  character,
  health,
}: {
  character: Character;
  health: HealthState;
}) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <h1 className="visually-hidden">Frosthaven Deck Builder</h1>
        <Link
          className="brand"
          to="/"
          aria-label="Frosthaven Deck Builder home"
        >
          <img src={`/${character.icon}`} alt="" />
          <span>
            <strong>{character.name}</strong>
            <small>Deck Builder</small>
          </span>
        </Link>
        <div className="header-level">
          <span className="eyebrow">Current workspace</span>
          <strong>Builds</strong>
        </div>
        <HealthIndicator state={health} />
      </div>
    </header>
  );
}

function BuildList() {
  const { data } = useAppData();
  const builds = data?.builds ?? [];

  return (
    <main className="page-content" aria-labelledby="builds-heading">
      <section className="page-intro">
        <p className="eyebrow">Snowdancer</p>
        <h1 id="builds-heading">Your builds</h1>
        <p>
          Choose a build to plan its deck from the starting level to level 9.
        </p>
      </section>
      {builds.length === 0 ? (
        <section className="empty-card" aria-labelledby="empty-heading">
          <h2 id="empty-heading">No builds yet</h2>
          <p>
            Build creation and starting-deck editing will appear here. Your
            workspace is ready for the first build.
          </p>
        </section>
      ) : (
        <ul className="build-list">
          {builds.map((build) => (
            <li key={build.id}>
              <Link
                to={`/c/${build.characterId}/b/${build.id}/l/${build.startLevel}`}
              >
                <strong>{build.name}</strong>
                <span>Starting level {build.startLevel}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function CardPreview() {
  const [selected, setSelected] = useState<string | null>(null);
  const previewCards = [
    character.cards[0]!,
    {
      ...character.cards[1]!,
      id: "missing-preview-card",
      image: "SD/missing.jpeg",
    },
  ];

  return (
    <main className="page-content" aria-labelledby="card-preview-heading">
      <section className="page-intro">
        <p className="eyebrow">Component preview</p>
        <h1 id="card-preview-heading">Card actions</h1>
        <p>Cards have separate actions and explicit enlarge controls.</p>
        {selected ? <p role="status">Selected {selected}</p> : null}
      </section>
      <CardGrid
        cards={previewCards}
        actionLabel={(card) => `Open ${card.name}`}
        onAction={(card) => setSelected(card.name)}
      />
    </main>
  );
}

function AboutView() {
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

function UnavailableView() {
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
          Back to builds
        </Link>
      </section>
    </main>
  );
}

function BottomTabs() {
  const location = useLocation();
  const isAbout = location.pathname === "/about";
  return (
    <nav className="bottom-tabs" aria-label="Primary navigation">
      <NavLink to="/" end className={tabClassName}>
        <span aria-hidden="true">▦</span> Deck
      </NavLink>
      <NavLink to="/level-up" className={tabClassName}>
        <span aria-hidden="true">↗</span> Level up
      </NavLink>
      <NavLink to="/overview" className={tabClassName}>
        <span aria-hidden="true">▤</span> Overview
      </NavLink>
      <NavLink to="/motivations" className={tabClassName}>
        <span aria-hidden="true">✎</span> Notes
      </NavLink>
      {isAbout ? (
        <span className="tab-current">About</span>
      ) : (
        <Link to="/about">About</Link>
      )}
    </nav>
  );
}

function tabClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? "tab active" : "tab";
}

function SaveFeedback() {
  const appData = useAppData();
  if (appData.status === "saving") {
    return (
      <div className="save-feedback saving" role="status" aria-live="polite">
        Saving…
      </div>
    );
  }
  if (appData.status === "conflict") {
    return (
      <section
        className="save-feedback conflict"
        role="alert"
        aria-labelledby="conflict-heading"
      >
        <strong id="conflict-heading">
          Changed on another device — reload
        </strong>
        <p>Download your pending data before choosing whether to discard it.</p>
        <div className="feedback-actions">
          <button type="button" onClick={appData.downloadPendingData}>
            Download pending JSON
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Discard pending changes and reload?")) {
                void appData
                  .reload({ discardPending: true })
                  .catch(() => undefined);
              }
            }}
          >
            Reload
          </button>
        </div>
      </section>
    );
  }
  if (appData.status === "error") {
    return (
      <section
        className="save-feedback error"
        role="alert"
        aria-labelledby="save-error-heading"
      >
        <strong id="save-error-heading">
          Error saving — editing is paused
        </strong>
        <button
          type="button"
          onClick={() => void appData.retry().catch(() => undefined)}
        >
          Retry
        </button>
      </section>
    );
  }
  return null;
}

function HealthIndicator({ state }: { state: HealthState }) {
  return (
    <p className={`health health-${state}`} role="status" aria-live="polite">
      {healthMessages[state]}
    </p>
  );
}

function useHealth(): HealthState {
  const [health, setHealth] = useState<HealthState>("loading");

  useEffect(() => {
    let mounted = true;
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Health check failed");
        }
        return response.json();
      })
      .then((body: unknown) => {
        if (mounted) {
          setHealth(isHealthyResponse(body) ? "healthy" : "unavailable");
        }
      })
      .catch(() => {
        if (mounted) {
          setHealth("unavailable");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return health;
}

function isHealthyResponse(body: unknown): body is { status: "ok" } {
  return (
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    body.status === "ok"
  );
}
