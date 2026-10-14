import { Link, useParams } from "react-router-dom";
import { useAppData } from "./app-data";
import { deckPath } from "./deck-view";
import {
  buildOverviewModel,
  type OverviewCell,
  type OverviewGroup,
  type OverviewLevel,
} from "./overview";
import { characters } from "../shared/data/characters/index.js";
import type { Character } from "../shared/character.js";
import type { Build, Motivation } from "../shared/schema/index.js";

const character = characters[0]!;

export function OverviewRoute() {
  const { characterId, buildId } = useParams();
  const { data } = useAppData();
  const build = data?.builds.find((candidate) => candidate.id === buildId);
  if (characterId !== character.id || !build) {
    return <UnavailableOverviewView />;
  }
  return <OverviewView build={build} character={character} />;
}

export function OverviewView({
  build,
  character,
}: {
  build: Build;
  character: Character;
}) {
  const model = buildOverviewModel(build, character);

  return (
    <main
      className="page-content overview-view"
      aria-labelledby="overview-heading"
    >
      <section className="page-intro">
        <p className="eyebrow">
          {character.name} · {build.name}
        </p>
        <h1 id="overview-heading">Build overview</h1>
        <p>
          Compare every card across the levels in this build. Choose a level
          heading to open its deck.
        </p>
      </section>
      <OverviewLegend />
      <div className="overview-scroll" tabIndex={0}>
        <table className="overview-matrix">
          <caption className="visually-hidden">
            {build.name} card pool and deck by level
          </caption>
          <thead>
            <tr>
              <th scope="col">Card</th>
              {model.levels.map((level) => (
                <th scope="col" key={level.level}>
                  <Link
                    to={deckPath(character.id, build.id, level.level)}
                    aria-label={`Open level ${level.level} deck`}
                  >
                    Level {level.level}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.groups.map((group) => (
              <OverviewGroupRows
                key={group.level}
                group={group}
                levels={model.levels}
                build={build}
              />
            ))}
            <OverviewSummaryRow levels={model.levels} character={character} />
          </tbody>
        </table>
      </div>
    </main>
  );
}

function OverviewGroupRows({
  group,
  levels,
  build,
}: {
  group: OverviewGroup;
  levels: OverviewLevel[];
  build: Build;
}) {
  return (
    <>
      <tr className="overview-group-row">
        <th scope="rowgroup" colSpan={levels.length + 1}>
          Level {group.level}
        </th>
      </tr>
      {group.cards.map((card) => (
        <tr key={card.id}>
          <th scope="row" className="overview-card-name">
            <span>{card.name}</span>
            <small>Initiative {card.initiative}</small>
          </th>
          {levels.map((level) => {
            const cell = level.cells.find(
              (candidate) => candidate.card.id === card.id,
            );
            return cell ? (
              <OverviewCellView
                key={`${level.level}-${card.id}`}
                cell={cell}
                level={level.level}
                build={build}
              />
            ) : (
              <td key={`${level.level}-${card.id}`}>—</td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function OverviewCellView({
  cell,
  level,
  build,
}: {
  cell: OverviewCell;
  level: number;
  build: Build;
}) {
  const markerLabel = cell.marker ? markerText(cell.marker) : "";
  const membershipLabel = membershipText(cell.membership);
  const noteLabel =
    cell.motivations.length === 0
      ? ""
      : `${cell.motivations.length} motivation${
          cell.motivations.length === 1 ? "" : "s"
        }`;
  const label = [membershipLabel, markerLabel, noteLabel]
    .filter(Boolean)
    .join("; ");

  return (
    <td>
      <span
        className={`overview-cell overview-${cell.membership}`}
        aria-label={`${cell.card.name}: ${label}`}
        title={`${cell.card.name}: ${label}`}
      >
        <span aria-hidden="true">
          {markerSymbol(cell.marker, cell.membership)}
        </span>
        <span className="visually-hidden">{label}</span>
        {cell.motivations.length > 0 ? (
          <span className="overview-motivation-links">
            {cell.motivations.map((motivation) => (
              <Link
                key={`${motivation.level}-${motivation.cardId}-${motivation.kind}`}
                className="overview-motivation-link"
                to={motivationPath(build, motivation, level)}
                aria-label={`Open ${cell.card.name} ${motivation.kind} motivation`}
              >
                <span aria-hidden="true">✎</span>
                <span className="visually-hidden">{motivation.kind} note</span>
              </Link>
            ))}
          </span>
        ) : null}
      </span>
    </td>
  );
}

function OverviewSummaryRow({
  levels,
  character,
}: {
  levels: OverviewLevel[];
  character: Character;
}) {
  return (
    <tr className="overview-summary-row">
      <th scope="row">Pick · swaps</th>
      {levels.map((level) => (
        <td key={level.level}>
          <span>{summaryText(level, character)}</span>
        </td>
      ))}
    </tr>
  );
}

function OverviewLegend() {
  return (
    <div className="overview-legend" aria-label="Overview legend">
      <span>
        <span className="overview-cell overview-deck" aria-hidden="true">
          ●
        </span>{" "}
        In deck
      </span>
      <span>
        <span className="overview-cell overview-pool" aria-hidden="true">
          ○
        </span>{" "}
        In pool, not deck
      </span>
      <span>
        <span className="overview-cell overview-not-in-pool" aria-hidden="true">
          ·
        </span>{" "}
        Not in pool
      </span>
      <span>★ picked · + added · − dropped · ✎ motivation</span>
    </div>
  );
}

function summaryText(level: OverviewLevel, character: Character): string {
  if (level.summary.startingPicks.length > 0) {
    const names = level.summary.startingPicks
      .map((cardId) => character.cards.find((card) => card.id === cardId)?.name)
      .filter((name): name is string => name !== undefined)
      .join(", ");
    return names ? `Starting picks: ${names}` : "Starting picks";
  }
  if (level.summary.pick === null) {
    return "Starting deck";
  }
  const pickName =
    character.cards.find((card) => card.id === level.summary.pick)?.name ??
    level.summary.pick;
  const details = [`Pick: ${pickName}`, `${level.summary.addedCount} added`];
  if (level.summary.extraAddedCount > 0) {
    details.push(
      `${level.summary.extraAddedCount} extra swap${level.summary.extraAddedCount === 1 ? "" : "s"}`,
    );
  }
  details.push(`${level.summary.droppedCount} dropped`);
  return details.join(" · ");
}

function membershipText(membership: OverviewCell["membership"]): string {
  switch (membership) {
    case "deck":
      return "In deck";
    case "pool":
      return "In pool, not in deck";
    case "not-in-pool":
      return "Not in pool";
  }
}

function markerText(marker: OverviewCell["marker"]): string {
  switch (marker) {
    case "picked":
      return "Picked here";
    case "added":
      return "Added here";
    case "dropped":
      return "Dropped here";
    default:
      return "";
  }
}

function markerSymbol(
  marker: OverviewCell["marker"],
  membership: OverviewCell["membership"],
): string {
  if (marker === "picked") {
    return "★";
  }
  if (marker === "added") {
    return "+";
  }
  if (marker === "dropped") {
    return "−";
  }
  return membership === "deck" ? "●" : membership === "pool" ? "○" : "·";
}

function motivationPath(
  build: Build,
  motivation: Motivation,
  level: number,
): string {
  const params = new URLSearchParams({
    level: String(level),
    cardId: motivation.cardId,
    kind: motivation.kind,
  });
  return `/c/${encodeURIComponent(build.characterId)}/b/${encodeURIComponent(
    build.id,
  )}/motivations?${params.toString()}`;
}

export function UnavailableOverviewView() {
  return (
    <main className="page-content narrow-content">
      <section className="empty-card">
        <p className="eyebrow">Overview</p>
        <h1>This overview is unavailable</h1>
        <p>Choose an existing build to compare its cards by level.</p>
        <Link className="button-link" to={`/c/${character.id}`}>
          Back to builds
        </Link>
      </section>
    </main>
  );
}
