import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { preventUnloadIfPending, useAppData } from "./app-data";
import { CardGrid } from "./cards";
import { BuildList, StartingEditor } from "./build-editor";
import {
  CardDetailRoute,
  DeckRoute,
  deckPath,
  readLastPosition,
} from "./deck-view";
import { LevelUpRoute, levelUpDestination } from "./level-up";
import { characters } from "../shared/data/characters/index.js";
import type { Character } from "../shared/character.js";
import type { Build } from "../shared/schema/index.js";

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
    const warnBeforeUnload = (event: BeforeUnloadEvent) =>
      preventUnloadIfPending(event, appData.hasPendingChanges);
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
        <Route path="/" element={<HomeRoute />} />
        <Route path="/about" element={<AboutView />} />
        {import.meta.env.DEV ? (
          <>
            <Route path="/__test/cards" element={<CardPreview />} />
            <Route
              path="/c/:characterId/b/:buildId/l/:level/__test/save-feedback"
              element={<SaveFeedbackPreview />}
            />
          </>
        ) : null}
        <Route path="/c/:characterId" element={<BuildList />} />
        <Route
          path="/c/:characterId/b/:buildId/l/:level/start"
          element={<StartingEditorRoute />}
        />
        <Route
          path="/c/:characterId/b/:buildId/l/:level/card/:cardId"
          element={<CardDetailRoute />}
        />
        <Route
          path="/c/:characterId/b/:buildId/l/:level"
          element={<DeckRoute />}
        />
        <Route
          path="/c/:characterId/b/:buildId/l/:level/level-up"
          element={<LevelUpRoute />}
        />
        <Route
          path="/c/:characterId/b/:buildId/overview"
          element={<UnavailableView />}
        />
        <Route
          path="/c/:characterId/b/:buildId/motivations"
          element={<UnavailableView />}
        />
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
  const workspace = useWorkspace();
  return (
    <header className="app-header">
      <div className="header-inner">
        <h1 className="visually-hidden">Frosthaven Deck Builder</h1>
        <Link
          className="brand"
          to={`/c/${character.id}`}
          aria-label="Frosthaven Deck Builder builds"
        >
          <img src={`/${character.icon}`} alt="" />
          <span>
            <strong>{character.name}</strong>
            <small>Deck Builder</small>
          </span>
        </Link>
        <div className="header-level">
          <span className="eyebrow">
            {workspace.build?.name ?? "Current workspace"}
          </span>
          <strong>
            {workspace.level !== null
              ? `Level ${workspace.level}`
              : workspace.build
                ? "Build workspace"
                : "Builds"}
          </strong>
          {workspace.build ? (
            <nav className="level-switcher" aria-label="Level navigation">
              {workspace.levels.map((level) => (
                <Link
                  key={level}
                  to={workspaceDeckPath(workspace, level)}
                  aria-current={level === workspace.level ? "page" : undefined}
                >
                  {level}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
        <HealthIndicator state={health} />
      </div>
    </header>
  );
}

function HomeRoute() {
  const { data } = useAppData();
  const navigate = useNavigate();
  const [checkedResume, setCheckedResume] = useState(false);

  useEffect(() => {
    if (data === null || checkedResume) {
      return;
    }
    const position = readLastPosition();
    const build = position
      ? data.builds.find(
          (candidate) =>
            candidate.id === position.buildId &&
            candidate.characterId === position.characterId,
        )
      : undefined;
    const levelExists =
      build !== undefined &&
      (build.startLevel === position?.level ||
        build.levelUps.some((levelUp) => levelUp.level === position?.level));
    if (position && build && levelExists) {
      setCheckedResume(true);
      navigate(
        deckPath(position.characterId, position.buildId, position.level),
        { replace: true },
      );
      return;
    }
    setCheckedResume(true);
  }, [checkedResume, data, navigate]);

  if (!checkedResume) {
    return (
      <main className="page-content" aria-labelledby="resume-heading">
        <p id="resume-heading" role="status" aria-live="polite">
          Opening your last deck…
        </p>
      </main>
    );
  }
  return <BuildList />;
}

function StartingEditorRoute() {
  const { characterId, buildId, level } = useParams();
  const location = useLocation();
  const { data } = useAppData();
  const build = data?.builds.find((candidate) => candidate.id === buildId);
  if (
    characterId !== character.id ||
    !build ||
    Number(level) !== build.startLevel
  ) {
    return <UnavailableView />;
  }
  const focusValue = new URLSearchParams(location.search).get("focus");
  const focusForLevel = focusValue === null ? undefined : Number(focusValue);
  return (
    <StartingEditor
      build={build}
      character={character}
      focusForLevel={
        Number.isInteger(focusForLevel) ? focusForLevel : undefined
      }
    />
  );
}

function CardPreview() {
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

function SaveFeedbackPreview() {
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
        <Link className="button-link" to={`/c/${character.id}`}>
          Back to builds
        </Link>
      </section>
    </main>
  );
}

function BottomTabs() {
  const location = useLocation();
  const workspace = useWorkspace();
  const isAbout = location.pathname === "/about";
  const hasWorkspace = workspace.build !== undefined;
  const deckLevel = workspace.level ?? workspace.build?.startLevel ?? 1;
  return (
    <nav className="bottom-tabs" aria-label="Primary navigation">
      <NavLink
        to={
          hasWorkspace
            ? workspaceDeckPath(workspace, deckLevel)
            : `/c/${character.id}`
        }
        end={!hasWorkspace}
        className={tabClassName}
      >
        <span aria-hidden="true">▦</span> Deck
      </NavLink>
      <WorkspaceTab
        to={
          workspace.build
            ? levelUpDestination(workspace.build, character)
            : null
        }
        label="Level up"
        icon="↗"
      />
      <WorkspaceTab to={null} label="Overview" icon="▤" />
      <WorkspaceTab to={null} label="Notes" icon="✎" />
      {isAbout ? (
        <span className="tab-current">About</span>
      ) : (
        <Link to="/about">About</Link>
      )}
    </nav>
  );
}

function WorkspaceTab({
  to,
  label,
  icon,
}: {
  to: string | null;
  label: string;
  icon: string;
}) {
  if (to === null) {
    return (
      <span className="tab-disabled" aria-disabled="true">
        <span aria-hidden="true">{icon}</span> {label}
      </span>
    );
  }
  return (
    <NavLink to={to} className={tabClassName}>
      <span aria-hidden="true">{icon}</span> {label}
    </NavLink>
  );
}

function tabClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? "tab active" : "tab";
}

interface Workspace {
  build: Build | undefined;
  buildId: string | null;
  characterId: string | null;
  level: number | null;
  levels: number[];
}

function useWorkspace(): Workspace {
  const location = useLocation();
  const { data } = useAppData();
  const match = /^\/c\/([^/]+)\/b\/([^/]+)(?:\/l\/(\d+))?/.exec(
    location.pathname,
  );
  const characterId = match ? decodeURIComponent(match[1]!) : null;
  const buildId = match ? decodeURIComponent(match[2]!) : null;
  const level = match?.[3] === undefined ? null : Number(match[3]);
  const build =
    buildId === null
      ? undefined
      : data?.builds.find(({ id }) => id === buildId);
  const levels = build
    ? [build.startLevel, ...build.levelUps.map(({ level: value }) => value)]
    : [];
  return { build, buildId, characterId, level, levels };
}

function workspaceDeckPath(workspace: Workspace, level: number): string {
  return `/c/${encodeURIComponent(workspace.characterId!)}/b/${encodeURIComponent(
    workspace.buildId!,
  )}/l/${level}`;
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
