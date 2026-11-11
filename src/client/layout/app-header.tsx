import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { levelUpDestination } from "../navigation/build-destination";
import { replayBuild } from "../../shared/rules/index.js";
import { HealthIndicator, type HealthState } from "./health";
import { useWorkspace, workspaceDeckPath } from "./workspace";

export function AppHeading() {
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

export function AppHeader({ health }: { health: HealthState }) {
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
