import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import type { Card, Character } from "../shared/character.js";
import type { Build, CardNote } from "../shared/schema/index.js";

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
                  {levelStatus(level) ? (
                    <span
                      className={`overview-column-status overview-${levelStatus(level)?.toLowerCase()}`}
                      role="status"
                      aria-label={`Level ${level.level} column ${levelStatus(level)?.toLowerCase()}`}
                    >
                      {levelStatus(level)}
                    </span>
                  ) : null}
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
}: {
  group: OverviewGroup;
  levels: OverviewLevel[];
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
              <OverviewCellView key={`${level.level}-${card.id}`} cell={cell} />
            ) : (
              <td key={`${level.level}-${card.id}`}>—</td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function OverviewCellView({ cell }: { cell: OverviewCell }) {
  const markerLabel = cell.marker
    ? markerText(cell.marker, cell.markerForLevel)
    : "";
  const membershipLabel = membershipText(cell.membership);
  const noteLabel = cell.note ? "card note" : "";
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
        {cell.note ? <OverviewNote card={cell.card} note={cell.note} /> : null}
      </span>
    </td>
  );
}

/**
 * Shows a recorded card note on hover or focus, and toggles it on tap. The
 * tooltip is portalled into the page's main landmark with fixed positioning so
 * the scrolling matrix cannot clip it; it follows the button while scrolling.
 */
function OverviewNote({ card, note }: { card: Card; note: CardNote }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pinned, setPinned] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();

  const show = () =>
    setAnchor(buttonRef.current?.getBoundingClientRect() ?? null);
  const hide = () => {
    setAnchor(null);
    setPinned(false);
  };

  const open = anchor !== null;
  useEffect(() => {
    if (!open) {
      return;
    }
    // Follow the button: focusing it may scroll the matrix into view.
    const reposition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) {
        setAnchor(rect);
      }
    };
    // Touch browsers may not focus buttons, so blur alone cannot close a tap.
    const closeOutside = (event: PointerEvent) => {
      if (!buttonRef.current?.contains(event.target as Node)) {
        setAnchor(null);
        setPinned(false);
      }
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  const width = Math.min(280, window.innerWidth - 16);
  const placeAbove = anchor ? anchor.bottom + 200 > window.innerHeight : false;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="overview-note-button"
        aria-label={`Card note for ${card.name} at level ${note.level}`}
        aria-expanded={open}
        aria-describedby={anchor ? tooltipId : undefined}
        onMouseEnter={show}
        onMouseLeave={() => {
          if (!pinned) {
            hide();
          }
        }}
        onFocus={show}
        onBlur={hide}
        onClick={() => {
          if (pinned) {
            hide();
          } else {
            setPinned(true);
            show();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            hide();
          }
        }}
      >
        <span aria-hidden="true">✎</span>
      </button>
      {anchor
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className="overview-note-tooltip plain-text"
              style={{
                width,
                left: Math.max(
                  8,
                  Math.min(
                    anchor.left + anchor.width / 2 - width / 2,
                    window.innerWidth - width - 8,
                  ),
                ),
                ...(placeAbove
                  ? { bottom: window.innerHeight - anchor.top + 6 }
                  : { top: anchor.bottom + 6 }),
              }}
            >
              {note.text}
            </div>,
            buttonRef.current?.closest("main") ?? document.body,
          )
        : null}
    </>
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
      <span>★ picked · + added · − dropped · ✎ card note</span>
    </div>
  );
}

function levelStatus(level: OverviewLevel): "Invalid" | "Incomplete" | null {
  if (level.state.issues.some((issue) => issue.severity === "invalid")) {
    return "Invalid";
  }
  if (level.state.issues.some((issue) => issue.severity === "incomplete")) {
    return "Incomplete";
  }
  return null;
}

function summaryText(level: OverviewLevel, character: Character): string {
  if (level.summary.isStartingLevel) {
    const names = level.summary.startingPicks
      .map((pick) => {
        const name = character.cards.find(
          (card) => card.id === pick.cardId,
        )?.name;
        return name ? `Level ${pick.forLevel}: ${name}` : undefined;
      })
      .filter((name): name is string => name !== undefined)
      .join(", ");
    return names ? `Starting picks: ${names}` : "Starting deck";
  }
  const pickName =
    level.summary.pick === null
      ? "No applied pick"
      : (character.cards.find((card) => card.id === level.summary.pick)?.name ??
        level.summary.pick);
  const details = [
    level.summary.pick === null ? pickName : `Pick: ${pickName}`,
    `${level.summary.addedCount} added`,
  ];
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

function markerText(marker: OverviewCell["marker"], forLevel?: number): string {
  switch (marker) {
    case "picked":
      return forLevel === undefined
        ? "Picked here"
        : `Picked at level ${forLevel}`;
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
