import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useMatch,
  useParams,
} from "react-router-dom";
import { preventUnloadIfPending, useAppData } from "./app-data";
import { CardGrid } from "./cards";
import { BuildList, StartingEditor } from "./build-editor";
import { CardDetailRoute, DeckRoute } from "./deck-view";
import { CharacterSelect } from "./character-select";
import { LevelUpRoute, levelUpDestination } from "./level-up";
import { OverviewRoute } from "./overview-view";
import { getCharacter } from "../shared/data/characters/index.js";
import type { Character } from "../shared/character.js";
import type { Build } from "../shared/schema/index.js";
import { replayBuild } from "../shared/rules/index.js";

const healthMessages = {
  loading: "Checking server…",
  healthy: "Server healthy",
  unavailable: "Server unavailable",
} as const;

type HealthState = keyof typeof healthMessages;

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
        <AppHeading />
        <p role="status" aria-live="polite">
          Loading your deck workspace…
        </p>
      </main>
    );
  }

  if (appData.data === null && appData.status === "error") {
    return (
      <main className="shell error-shell">
        <AppHeading />
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
      <AppHeader health={health} />
      <SaveFeedback />
      <Routes>
        <Route path="/" element={<CharacterSelect />} />
        <Route path="/about" element={<AboutView />} />
        {/* Test previews: dev server and the CI e2e build only. */}
        {import.meta.env.DEV || import.meta.env.MODE === "e2e" ? (
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
          path="/c/:characterId/b/:buildId/card/:cardId"
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
          element={<OverviewRoute />}
        />
        <Route path="*" element={<UnavailableView />} />
      </Routes>
      <BottomTabs />
    </div>
  );
}

function AppHeading() {
  return (
    <header className="hero app-heading">
      <p className="eyebrow">Frosthaven</p>
      <h1>Frosthaven Deck Builder</h1>
      <p className="intro">
        Plan your character&apos;s deck across every level.
      </p>
    </header>
  );
}

function AppHeader({ health }: { health: HealthState }) {
  const workspace = useWorkspace();
  const character = workspace.character;
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new ResizeObserver(() => {
      header
        .closest<HTMLElement>(".app-frame")
        ?.style.setProperty(
          "--header-height",
          `${header.getBoundingClientRect().height}px`,
        );
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const levelUpTo =
    workspace.build && character
      ? levelUpDestination(workspace.build, character)
      : null;
  const levelsNeedingAttention = new Set(
    workspace.build && character
      ? replayBuild(workspace.build, character)
          .levels.filter((state) => state.issues.length > 0)
          .map((state) => state.level)
      : [],
  );
  const highestLevel = workspace.levels.at(-1) ?? 1;
  const canPlanNext =
    levelUpTo?.endsWith(`/l/${highestLevel + 1}/level-up`) ?? false;
  return (
    <header className="app-header" ref={headerRef}>
      <div className="header-inner">
        <h1 className="visually-hidden">Frosthaven Deck Builder</h1>
        <Link
          className="brand"
          to={character ? `/c/${character.id}` : "/"}
          aria-label={
            character
              ? "Frosthaven Deck Builder builds"
              : "Frosthaven Deck Builder home"
          }
        >
          {character ? <img src={`/icons/${character.icon}`} alt="" /> : null}
          <span>
            <strong>
              {workspace.build?.name ?? character?.name ?? "Frosthaven"}
            </strong>
            <small>
              {workspace.build
                ? `${character!.name} · started at level ${workspace.build.startLevel}`
                : "Deck Builder"}
            </small>
          </span>
        </Link>
        <div className="header-level">
          {workspace.build ? (
            <nav className="level-switcher" aria-label="Level navigation">
              {workspace.levels.map((level) => (
                <Link
                  key={level}
                  to={workspaceDeckPath(workspace, level)}
                  aria-label={`Level ${level}`}
                  data-needs-attention={
                    levelsNeedingAttention.has(level) || undefined
                  }
                  title={
                    levelsNeedingAttention.has(level)
                      ? `Level ${level} needs attention`
                      : undefined
                  }
                  aria-current={level === workspace.level ? "page" : undefined}
                >
                  {level}
                </Link>
              ))}
              {canPlanNext && highestLevel < 9 ? (
                <Link
                  className="future-level"
                  to={levelUpTo!}
                  aria-label={`Plan level ${highestLevel + 1}`}
                >
                  +{highestLevel + 1}
                </Link>
              ) : null}
              {Array.from(
                { length: 9 - highestLevel },
                (_, index) => highestLevel + index + 1,
              )
                .filter((level) => !canPlanNext || level !== highestLevel + 1)
                .map((level) => (
                  <span className="future-level unavailable-level" key={level}>
                    {level}
                  </span>
                ))}
            </nav>
          ) : null}
        </div>
        <div className="header-utilities">
          <HealthIndicator state={health} />
          <Link to="/">Characters</Link>
          <Link to="/about">About</Link>
        </div>
      </div>
    </header>
  );
}

function StartingEditorRoute() {
  const { characterId, buildId, level } = useParams();
  const location = useLocation();
  const { data } = useAppData();
  const character = getCharacter(characterId ?? "");
  const build = data?.builds.find(
    (candidate) =>
      candidate.id === buildId && candidate.characterId === character?.id,
  );
  if (!character || !build || Number(level) !== build.startLevel) {
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
        <Link className="button-link" to="/">
          Choose a character
        </Link>
      </section>
    </main>
  );
}

function BottomTabs() {
  const workspace = useWorkspace();
  const character = workspace.character;
  if (!character) return null;
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
        end
        className={tabClassName}
      >
        <span aria-hidden="true">🂠</span> Deck
      </NavLink>
      <WorkspaceTab
        to={
          workspace.build
            ? levelUpDestination(workspace.build, character)
            : null
        }
        label="Level up"
        icon="⬆︎"
      />
      <WorkspaceTab
        to={workspace.build ? overviewPath(workspace) : null}
        label="Overview"
        icon="▦"
      />
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
  const location = useLocation();
  const editingLevel =
    label === "Level up" && location.pathname.endsWith("/level-up");
  if (to === null) {
    return (
      <span className="tab-disabled" aria-disabled="true">
        <span aria-hidden="true">{icon}</span> {label}
      </span>
    );
  }
  return (
    <NavLink
      to={to}
      aria-current={editingLevel ? "page" : undefined}
      className={({ isActive }) =>
        tabClassName({ isActive: isActive || editingLevel })
      }
    >
      <span aria-hidden="true">{icon}</span> {label}
    </NavLink>
  );
}

function tabClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? "tab active" : "tab";
}

interface Workspace {
  character: Character | undefined;
  build: Build | undefined;
  buildId: string | null;
  characterId: string | null;
  level: number | null;
  levels: number[];
}

function useWorkspace(): Workspace {
  const { data } = useAppData();
  const characterMatch = useMatch("/c/:characterId/*");
  const buildMatch = useMatch("/c/:characterId/b/:buildId/*");
  const characterId = characterMatch?.params.characterId ?? null;
  const character = getCharacter(characterId ?? "");
  const buildId = buildMatch?.params.buildId ?? null;
  const levelMatch = /^l\/(\d+)/.exec(buildMatch?.params["*"] ?? "");
  const level = levelMatch ? Number(levelMatch[1]) : null;
  const build =
    buildId === null
      ? undefined
      : data?.builds.find(
          (build) =>
            build.id === buildId && build.characterId === character?.id,
        );
  const levels = build
    ? [build.startLevel, ...build.levelUps.map(({ level: value }) => value)]
    : [];
  return { character, build, buildId, characterId, level, levels };
}

function workspaceDeckPath(workspace: Workspace, level: number): string {
  return `/c/${encodeURIComponent(workspace.characterId!)}/b/${encodeURIComponent(
    workspace.buildId!,
  )}/l/${level}`;
}

function overviewPath(workspace: Workspace): string {
  return `/c/${encodeURIComponent(workspace.characterId!)}/b/${encodeURIComponent(
    workspace.buildId!,
  )}/overview`;
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
    <p
      className={`health health-${state}`}
      role="status"
      aria-live="polite"
      title={healthMessages[state]}
    >
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
