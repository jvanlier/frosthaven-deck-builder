import { NavLink, useLocation } from "react-router-dom";
import { levelUpDestination } from "../navigation/build-destination";
import { overviewPath } from "../navigation/paths";
import { useWorkspace, workspaceDeckPath } from "./workspace";

export function BottomTabs() {
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
        to={
          workspace.build
            ? overviewPath(workspace.characterId!, workspace.buildId!)
            : null
        }
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
