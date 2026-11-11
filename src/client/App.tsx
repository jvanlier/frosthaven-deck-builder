import { useEffect } from "react";
import { Route, Routes, useLocation, useParams } from "react-router-dom";
import { preventUnloadIfPending, useAppData } from "./app-data";
import { BuildList } from "./builds/build-list";
import { StartingEditor } from "./starting/starting-editor";
import { CardDetailRoute, DeckRoute } from "./deck-view";
import { CharacterSelect } from "./character-select";
import { LevelUpRoute } from "./level-up";
import { OverviewRoute } from "./overview-view";
import { AboutView, UnavailableView } from "./information-views";
import { AppHeader, AppHeading } from "./layout/app-header";
import { BottomTabs } from "./layout/bottom-tabs";
import { HealthIndicator, useHealth } from "./layout/health";
import { SaveFeedback } from "./layout/save-feedback";
import { CardPreview, SaveFeedbackPreview } from "./test-previews";
import { getCharacter } from "../shared/data/characters/index.js";

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
