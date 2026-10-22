# Frosthaven Deck Builder — Specification

Status: v5 · single-ticket autonomous delivery agreed · Owner: jvanlier

Implementation sequence and GitHub issues: [`implementation-plan.md`](implementation-plan.md).
Resolved agent-facing contracts and edge cases: [`agent-contracts.md`](agent-contracts.md).
Mandatory test-first, review and authorized merge policy: [`../AGENTS.md`](../AGENTS.md).

## 1. Purpose

A personal web app for planning Frosthaven character "decks" (the hand of ability cards
brought into a scenario) across levels 1–9, and for recording *why* cards were picked,
dropped or left out, plus per-build guidance on how to play each card.

Single user, personal use. Self-hosted on a Raspberry Pi on the home network, reached
only via VPN, used from phone and desktop with shared server-side storage. No
authentication, authorization or multi-user support.

## 2. Game rules

Sources: [Frosthaven Rule Book](https://pikdonker.github.io/frosthaven-rule-book/)
(p.4–5 Creating a Character, p.34 Ability Cards, p.62–63 Level Up, p.65 Create a
Character), [Frosthaven FAQ](https://cephalofairgames.github.io/frosthaven-faq/).

### 2.1 Terminology

| Term     | Meaning                                                                       |
|----------|-------------------------------------------------------------------------------|
| **Pool** | All ability cards the character owns at a level and may choose from.          |
| **Deck** | The hand: the `handSize` cards brought into a scenario, chosen from the pool. |

### 2.2 Rules the app enforces

- **R1 Starting pool.** At level 1 the pool contains all level 1 and all level X cards.
  Level X cards count as level 1 for all purposes.
- **R2 One pick per level.** Reaching level L adds exactly one card to the pool. It must
  be of level ≤ L and not already in the pool. Example: at level 3 the pick is either
  level 3 card or the level 2 card skipped earlier.
- **R3 Starting above level 1.** A character created at level N levels up from 1 to N
  immediately (prosperity leveling), so it makes one pick for each level 2..N, each
  following R2 for its own level.
- **R4 Deck size.** A deck has exactly `handSize` cards, all from the pool at that level.

### 2.3 Rules deliberately *not* enforced

- **Permanence of picks.** By the rules as written, a level-up pick is permanent. The app
  allows revising any pick or deck at any level, at any time. Enforcing permanence is
  left to the player at the table.
- **Deck changes** are free in the game (the hand is re-chosen before every scenario).
  Swapping more than one card at a level-up is therefore normal, not a rule violation.

### 2.4 Enforcement style

**Soft enforcement:**
- Pick and add options only ever offer cards that are valid at that moment.
- An incomplete deck (fewer than `handSize` cards) can be saved. It gets an
  **incomplete** badge.
- A level whose stored changes became invalid because of an edit at an earlier level is
  flagged **invalid** (§5.2). It stays saved until fixed.

## 3. Content: characters and cards

### 3.1 Supported characters

v1: **Snowdancer** only (class code `SD`), hand size **11**. Character data is static and
data-driven, so more classes can be added without code changes.

```ts
type CardLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | "X";

interface Card {
  id: string;          // slug, e.g. "cold-snap"
  name: string;        // "Cold Snap"
  level: CardLevel;
  initiative: number;
  image: string;       // path under /cards, e.g. "SD/fh-cold-snap.jpeg"
}

interface Character {
  id: string;          // "SD"
  name: string;        // "Snowdancer"
  handSize: number;    // 11 (not in source data, set manually)
  icon: string;        // class icon path under /icons, e.g. "SD.png" (set manually)
  cards: Card[];
}
```

### 3.2 Card data and artwork

- Source: <https://www.gloomhavencards.com/fh/characters/SD>, a client-rendered app
  backed by [cmlenius/gloomhaven-card-browser](https://github.com/cmlenius/gloomhaven-card-browser).
  - Metadata: `data/character-abilities/frosthaven.json` (`main` branch). Filter on
    `/SD/` in `image` and skip the `sd-back` entry (level `-`).
  - Images: `https://raw.githubusercontent.com/cmlenius/gloomhaven-card-browser/images/images/{image}`.
- A one-off script `scripts/import-cards.ts`:
  - downloads metadata and images,
  - writes `src/shared/data/characters/SD.json` and `public/cards/SD/*.jpeg` (including
    the card back, used as an image placeholder).
  - The output is **committed**, so the app has no runtime dependency on external hosts.
- **Class icon**: `public/icons/SD.png`, a white-on-transparent glyph so it can be tinted.
  It isn't part of the card data source; copy it from `docs/mockup/snowdancer-icon.png`.
- **Attribution** goes in the README and an in-app "About" view:
  - Card artwork, text and class icons © Cephalofair Games, used for personal,
    non-commercial purposes.
  - Card data and images sourced via cmlenius/gloomhaven-card-browser.
  - The repo is public. If Cephalofair asks, remove the images (or make the repo
    private).

### 3.3 Snowdancer card list (30 cards)

11 × level 1, 3 × level X, 2 × each level 2–9. Starting pool = 14 cards.

| Level | Cards (initiative)                                                                                                                                                                                              |
|-------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1     | Blizzard (71), Chilling Impact (31), Cold Therapy (20), Cross Winds (32), Enticing Breeze (76), Frigid Growth (70), Gathering Force (89), Lifting Gust (27), Nature's Breath (90), Snowball (23), Whiteout (21) |
| X     | Blinding Vortex (31), The Spirit's Call (45), White Winds (11)                                                                                                                                                  |
| 2     | Birds in a Tempest (18), Tornado (59)                                                                                                                                                                           |
| 3     | Cold Snap (86), Polar Vortex (61)                                                                                                                                                                               |
| 4     | Biting Frost (16), Zephyr Barrier (40)                                                                                                                                                                          |
| 5     | Shifting Snow (17), Whipping Gale (79)                                                                                                                                                                          |
| 6     | Frozen Brand (33), Refreshing Flurry (95)                                                                                                                                                                       |
| 7     | Freezing Storm (81), Storm Wall (30)                                                                                                                                                                            |
| 8     | Surging Blow (73), The Endless White (05)                                                                                                                                                                       |
| 9     | Snowblind (83), Winds of Change (15)                                                                                                                                                                            |

## 4. Functional requirements

The requirements below describe behavior and what must be visible. The visual direction
is set by the design mockup (§4.12).

### 4.1 Hierarchy

Character → 1..n named builds → one deck per level (start level..9). There are no deck
variants within a level.

### 4.2 Character selection

- **F1** A character picker. v1 lists only Snowdancer and may auto-select it.

### 4.3 Builds

- **F2** Create, rename, copy and delete (with confirmation) builds.
- **F3** On creation the user chooses a **start level** (1–9). Levels below it don't
  exist in the build and are never asked for. The start level can't be changed later;
  create a new build to use a different start level.
- **F4** **Copy build** deep-copies everything: start level, levels, picks, decks,
  motivations and guidance. The user names the copy. Its build ID and build timestamps
  are new; copied note timestamps are preserved until those notes are edited.

### 4.4 Start level

- **F5** For start level N > 1: choose starting pool cards from the highest pick
  slot down (N..2), then assemble the starting hand. Only the active slot shows
  candidates, grouped by card level, highest first. A slot L offers unpicked cards
  of levels 2..L, excluding cards reserved in higher slots. Spending a slot closes
  access to its level's remaining cards, even when a lower-level card was chosen.
  Lower-slot choices never constrain revisions to higher slots. Conflicting lower
  choices stay saved and are flagged for replacement; nothing is silently reset.
  A compact stepper and editable pick summary replace future-slot placeholders.
  One status bar at the top of the editor stays sticky beneath the app header.
  It shows a “n / total level-up cards picked” badge (green when complete, amber
  otherwise), the hand count during hand assembly, and the current next/finish
  action. There is no separate hand status bar or “Build your starting hand” heading.
  The “Level-up card picks” disclosure has a bordered container and indented
  contents, so its collapsed scope is clear without repeating the status count.
  Each new pick enters the starting hand. In hand assembly, clicking a selected
  picked card opens its pick slot instead of removing it; only starter cards can
  be freely added or removed here. Revising a pick offers Return to hand once all
  slots are valid, preserving starter selections and notes. Conflicts guide the
  user through the affected lower slots before returning. This is an editor
  interaction constraint, not an additional game rule.
  Picking shows an inline motivation overlay on that card,
  even for a lower-level choice. Unselected cards at the slot's level get inline
  exclusion notes because no lower slot can acquire them; lower-level alternatives
  are only grayed out, without exclusion inputs, until their last eligible slot.
  These overlays share the normal level-up component and saved motivations.
  Next advances explicitly, while reload resumes at the
  highest unfinished or invalid slot. Done is available at every setup step,
  including incomplete or invalid builds, and returns to the deck for later
  continuation. Validation and attention indicators remain visible. Autosave
  continues throughout; Done is not a save operation.
- **F6** Select up to `handSize` cards from the pool for the starting deck, with a counter
  (`9 / 11`). Selecting more than `handSize` isn't possible. The grid also shows
  eligible-but-unpicked cards outside the starting pool, gray and unselectable; their
  exclusion notes are immediately editable. Cards already in the pool but left out of
  the hand show exclusion notes once the hand reaches `handSize`.

### 4.5 Level-up (L → L+1): happy path

Available from the deck view of the highest existing level when L < 9. It is also used,
pre-filled, to **revise** an existing level-up (§4.6).

The screen has a sticky **status bar** and groups of cards, each separated by a visible
divider. On wide screens the candidate groups and the deck sit side by side; on narrow
screens they're stacked, and picking a card scrolls to the deck.

- **Status bar** (always visible): the current instruction with the deck counter, Reset
  and Done. Done is only enabled with a valid pick, exactly `handSize` cards and no
  validation issues at this level.
- Every change, including unfinished or temporarily overfull level-ups and inline notes,
  autosaves. There is no separate draft model. Done finishes editing; it is not a save
  button. Reset restores this editor's choices and notes to their entry state, without
  reverting unrelated build data. Reset changes also autosave. The entry snapshot is
  in memory only; reload/reopen establishes a new baseline from the persisted state.
  For a newly appended level, Reset retains its null-pick/empty-diff level rather than
  deleting it. A full valid level counts as complete even before Done is clicked.
- **Your deck**: the cards of deck L plus the cards added in this flow.
- **Pick** and **Swap more** candidates (below).

All cards in the flow are shown at full readable size (§4.12), so the whole deck is not
necessarily on screen at once.

1. **Pick a new pool card (R2).** Candidates:
   - **Newly unlocked**: the level L+1 cards, shown first and prominently.
   - **Earlier, not yet picked**: unpicked cards of level 2..L, in a secondary section.
   - The picked card stays in place, marked *Picked*. Tapping it again un-picks it, and
     tapping another candidate changes the pick.
2. **Added to deck.** The pick always enters the deck, marked **NEW**. The deck is now
   `handSize + 1`, and the status bar shows **"Remove 1 card — 12 / 11"**.
3. **Drop one card.** Tap a deck card to drop it, and tap it again to keep it. Dropped
   cards stay in place, marked *Dropped*.
   - Cards that are **NEW** (picked or added in this flow) can't be dropped. Undo them
     where they were chosen instead.
   - So a pick always enters the deck at its own level. It can be dropped at a later
     level.
4. **Done.**

**Swap more cards (secondary path).** A collapsible "Swap more cards from the pool"
section lists every pool card that isn't in deck L. It behaves like the pick sections:
- Tapping a card adds it to the deck (NEW) and marks it *Added* in place. Tapping it
  again removes it.
- Then drop a card from the deck, repeated as needed.
- The section stays open until the user closes it.
- Dropped cards stay in the pool and can return at any later level.

**Optional motivation fields** (§4.8) are shown **on the card they're about**, as a note
box over the lower part of the card:
- "Why X?" on the picked card and on each *Added* card in the candidate sections.
- "Why drop X?" on each dropped deck card.

NEW cards in the deck don't get a second note box. The app never prompts for these notes
and never blocks on them. Typed text is kept while the user keeps editing in the flow.

**Enlarge.** Every card has an enlarge button (🔍) that shows the card at near full screen
height, with the card's current action (e.g. *Drop this card*) and Close. In this flow, a
tap on a card always performs its action; enlarging is never a long-press.

**Planning ahead.** Level-ups can be chained up to level 9 without waiting for actual
play. Appending a new level requires every existing level to be complete and valid.
Existing levels always remain viewable and repairable. An unfinished appended level
is saved and can be reopened; the Level up tab resumes it rather than appending another.
“Unfinished” means a stored level with validation issues, not a separate completion flag.
An unfinished starting level opens its starting editor; broken earlier history routes to
its reported problems instead of appending.

### 4.6 Revising earlier choices

- **F7** Any level can be edited at any time: the start picks, the start deck, and any
  later pick, added card or dropped card. Editing a level-up reopens the §4.5 flow,
  pre-filled.
- **F8** Edits **propagate** to later levels, because later levels store only their own
  changes (§5.2). Later levels whose changes no longer apply are flagged **invalid**, with
  the specific problem. Each problem has a one-tap fix: remove that change, or choose a
  replacement.
- **F9** Only the highest level above the start level can be deleted, with confirmation.
  Deleting a level also deletes its motivations, but retains build guidance. Removing
  the starting level requires deleting the build.

### 4.7 Views

- **F10 Deck view (build, level).** The main screen:
  - The deck's cards as images, sorted by card level, then initiative.
  - A level switcher (previous/next, and a direct choice among existing levels).
  - Badges: **incomplete**, **invalid**.
  - A **"Show guidance"** toggle that reveals each card's guidance with the card. Tapping
    a card opens card detail (F12).
  - This level's changes (pick, added, dropped) with their motivations.
  - Entry points: level up, edit this level, overview, motivations.
- **F11 Build overview.** A matrix:
  - Rows = all cards, grouped by card level. Columns = the build's levels.
  - Each cell shows one of: *in deck*, *in pool but not in deck*, *not in pool*.
  - Markers for *picked here*, *added here* and *dropped here*, plus an indicator for
    cells that have a motivation. Tapping the indicator opens the motivation.
  - A per-level summary shows the pick and the number of swaps.
  - Tapping a column header opens that deck view.
- **F12 Card detail.** Opens from anything that shows the card. Shows a large image,
  editable guidance for this build, and currently applicable motivations about this card.

### 4.8 Motivations

All optional, free text, stored per build:

| Kind      | Key                      | Meaning                                                                                                                            |
|-----------|--------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| `exclude` | build, start level, card | Why this card was never a good fit for the build. Available for every card of level ≤ start level that's not in the starting deck. |
| `add`     | build, level, card       | Why include this card in the starting hand, or why it is the best pool pick and/or addition to the deck at this level.             |
| `drop`    | build, level, card       | Why this is the worst card and has to go.                                                                                          |

- **F13** Where motivations can be entered:
  - inline wherever the subject appears: in the level-up flow, on the card itself (§4.5);
    in the deck view's changes; in card detail.
  - in the starting-deck view, an optional "Why include [card]?" note over each selected
    card, using the same on-card layout as level-up notes. "Why exclude [card]?" notes
    appear on excluded cards in that same grid (§4.4), with amber text and translucent
    amber boxes distinct from inclusion notes. There is no separate expandable list.
  - A missing motivation is shown as a subtle "add note" affordance, never as a warning.
- **F14 Motivations view** per build, to inspect and revise:
  - Grouped as *Not in starting deck*, then per level *Picked / Added* and *Dropped*.
  - Each entry shows a thumbnail and inline-editable text with its `updatedAt`.
  - Only motivations that currently apply are listed.
- **F15** If an edit means a motivation no longer applies (e.g. a different card is now
  dropped), keep it in storage but hide it. It reappears if the same change is made
  again.
- Initial-pick `add` motivations are keyed to the build's start level, even when the
  pick slot is for an earlier level; labels retain the slot's level (e.g. "Level 2 pick").
  Initial picks need not be in the starting deck for their pick motivations to apply.
  A picked card's inclusion field and pick field edit the same `add` motivation, not
  separate notes. Other starting-hand `add` motivations apply only while the card is
  included; removing it hides the note without deleting it, and reselecting restores it.
- `exclude` motivations include eligible-but-unpicked cards outside the starting pool,
  not just cards in the pool.
- **F16** v1 text is plain text with preserved line breaks, safely escaped. No Markdown
  rendering or raw HTML.

### 4.9 Card guidance

- **F17** One free-text guidance note per **build × card**: how to use it, when to play
  top/bottom, combos. Edited in card detail, shown in the deck view behind "Show
  guidance" (F10). Rendering follows F16.

### 4.10 Remember last position

- **F18** Store `{ characterId, buildId, level }` in `localStorage` on navigation, per
  device and not synced. On app start, open that deck view. Fall back to the build list
  if the build or level no longer exists.

### 4.11 Backup

- **F19** Export all user data as a JSON file. Import replaces all data, after
  confirmation and schema validation.

### 4.12 Visual design

The visual direction is the clickable mockup in [`docs/mockup/`](mockup/README.md). It's a
design reference with sample data, not code to reuse. Its key decisions:

- **Look:** dark, icy, image-first.
  - Header: the character's class icon (from `Character.icon`), the build name and the
    level switcher. Never show a class abbreviation like "SD".
  - Bottom tabs: Deck, Level up, Overview, Notes.
- **One card size everywhere** cards are shown as cards (deck view, level-up, swap):
  - 220 px wide on desktop, two per row on phones. Readable without extra action.
  - Thumbnails in lists (changes, motivations) are the only exception.
- **Enlarge** is always an explicit button (🔍) on the card, never a long-press.
- **Groups of cards** (e.g. the sections of the level-up flow) are separated by a visible
  divider.
- **No permanent save indicator** in the header (§6).

## 5. Data model

### 5.1 Stored (user data, one JSON document)

```ts
interface AppData {
  schemaVersion: 1;
  revision: number;                    // set by the server, +1 per save
  builds: Build[];
}

interface Build {
  id: string;                          // uuid
  characterId: string;                 // "SD"
  name: string;
  startLevel: number;                  // 1..9
  startPicks: Pick[];                  // one per level 2..startLevel (empty if 1)
  startDeck: string[];                 // cardIds; UI limits to handSize, invalid stored data remains repairable
  levelUps: LevelUp[];                 // levels startLevel+1..max, contiguous, sorted
  motivations: Motivation[];
  guidance: Record<string, Note>;      // cardId -> note
  createdAt: string; updatedAt: string; // ISO 8601
}

interface Pick { forLevel: number; cardId: string | null }  // null = not chosen yet

interface LevelUp {
  level: number;
  pick: string | null;                 // pool pick; valid completed levels also include it in `added`
  added: string[];                     // cardIds entering the deck vs. previous level
  dropped: string[];                   // cardIds leaving the deck vs. previous level
}

interface Motivation {
  level: number;
  cardId: string;
  kind: "exclude" | "add" | "drop";
  text: string;
  updatedAt: string;
}                                      // unique per build: (level, cardId, kind)

interface Note { text: string; updatedAt: string }
```

### 5.2 Derived (never stored), the rules engine

Decks are computed by replaying changes:

- `pool(start)` = L1 ∪ LX ∪ `startPicks`. `pool(L)` = `pool(L−1)` ∪ {`pick(L)`}.
- `deck(start)` = `startDeck`. `deck(L)` = (`deck(L−1)` \ `dropped(L)`) ∪ `added(L)`.
- Editing a deck in the UI stores the normalized diff against the previous level's deck:
  `added = new \ prev`, `dropped = prev \ new`. If existing records are invalid, normalize
  only the valid editable subset and retain unresolved records until targeted repair.

Validation issues per level:

| Issue                                                  | Severity   |
|--------------------------------------------------------|------------|
| Missing pick                                           | incomplete |
| Deck size < `handSize`                                 | incomplete |
| Deck size > `handSize`                                 | invalid    |
| Pick of level > L, or a card already in the pool       | invalid    |
| Pick not in `added(L)` (a pick always enters the deck) | invalid    |
| Added card not in `pool(L)`, or already in `deck(L−1)` | invalid    |
| Dropped card not in `deck(L−1)`                        | invalid    |
| Unknown cardId                                         | invalid    |
| Starting-deck card not in the starting pool            | invalid    |

During replay, invalid operations are skipped individually so every pool and deck stays
well-defined. They are reported, never silently deleted. A valid pick still enters the
pool when its corresponding add is missing; the missing add is reported separately.
Starting picks replay in slot order. Earlier slots determine later options; editing an
earlier slot never silently rewrites a later pick.

Structural validation rejects malformed documents, duplicate identifiers/array entries,
non-contiguous levels and invalid field types. It does not reject game-rule-invalid
choices (including unknown card IDs), incomplete decks or temporary overfull decks.
These remain stored for the rules engine to report and the user to repair. Unsupported
character IDs are rejected at the API/import boundary.

The engine is a pure TypeScript module in `src/shared/` with unit tests covering every
rule in §2.2 and every issue above. It exposes at least `pool`, `deck`, `pickOptions`,
`addOptions`, `validateBuild` and `applyDeckEdit`.

## 6. Storage, API and sync

- **Server is the source of truth.** The whole `AppData` document is loaded on start and
  saved as a whole (it's small, well under 100 KB).
- **API**
  - `GET /api/data` → `200 AppData`. Returns an empty document with `revision: 0` if no
    file exists yet.
  - `PUT /api/data` with body `{ baseRevision, data }`:
    - If `baseRevision` equals the stored revision: `200 { revision }`.
    - Otherwise: `409 { revision }`.
  - `GET /api/health` → `200`.
- **Server-side validation**: the same zod schema as the client. Reject malformed or
  oversized payloads (cap 1 MiB) with `400`/`413`.
- **Client saves** are debounced (~1 s) after every change, with no save button. Nothing
  is shown while everything is saved; a small status appears only for *Saving…* and
  *Error (retry)*. Warn on page unload while changes are unsaved. Saves are serialized;
  edits made during a request stay queued and use the acknowledged revision next.
- **On a save/connection failure**: preserve pending data in memory, pause mutation
  controls and offer Retry. Do not persist offline edits in browser storage.
- **On 409**: show "Changed on another device — reload", pause mutation controls and
  offer a JSON download of pending data before explicitly reloading. Never merge,
  overwrite, discard changes or reload silently.
- **Import**: validate and confirm replacement, then save using the current acknowledged
  server revision. The imported revision is never used as the concurrency token.
- **Persistence on disk** (`DATA_DIR`, default `/data`):
  - `appdata.json`, written atomically: write a temp file, fsync, rename.
  - Before each save, the current file is copied to
    `backups/appdata-<timestamp>-r<revision>.json`. Only the latest 20 are kept.
  - Serialize revision checks and disk writes within the single server process so two
    concurrent requests with the same base revision cannot both succeed.
  - Corrupt storage, failed writes and failed backup creation produce explicit errors;
    never reset corrupt data to an empty document or silently skip a backup.
  - Finish required backup pruning and temp-file fsync before rename. Failures before
    replacement preserve the preceding file. Once rename succeeds, a directory-fsync,
    process or response failure can leave an unacknowledged committed save; retain its
    predecessor backup and never promise rollback. Reread disk for subsequent revisions.
    Client Retry with the old revision can then produce the standard 409 recovery flow.
  - Getting data off the Pi (the Pi runs on an SSD) is configured on the host, outside
    the app.
- No offline editing. If the server is unreachable, show an error state.

## 7. Technical approach

- **Language**: TypeScript end to end. The zod schema, card data and rules engine are
  shared by client and server. UUID generation must work on plain LAN HTTP, using
  `crypto.getRandomValues` for a UUID-v4 fallback when `crypto.randomUUID` is unavailable.
- **Frontend**: Vite + React + TypeScript, React Router. Routes:
  - `/` (resume last position or build list)
  - `/c/:characterId` (builds)
  - `/c/:characterId/b/:buildId/l/:level` (deck view)
  - `…/b/:buildId/l/:level/level-up`
  - `…/b/:buildId/overview`
  - `…/b/:buildId/motivations`
  - `/about`
- **Backend**: Hono on Node (`@hono/node-server`). It serves the `/api/*` routes above
  and the built static frontend (with SPA fallback to `index.html`).
- **Tests and TDD**: Vitest (rules, schemas, build operations and API/storage integration)
  and Playwright (user flows). Every behavior-changing issue requires failing tests
  first, verification of the expected failure, minimal implementation, then refactoring
  with green tests. PR descriptions record red → green evidence; documentation-only
  changes do not require artificial tests.
- **Feedback from the first implementation PR**: GitHub Actions on pull requests and
  pushes to `main`, running prek checks, typechecking, Vitest, browser smoke tests and
  production builds. Never substitute `passWithNoTests` for a real initial smoke test.
  Add coverage continuously rather than waiting for the release issue.
- **Quick local checks**: prek with pinned hooks for whitespace/final-newline fixes,
  merge conflicts, YAML/JSON validity, and ESLint/Prettier on staged source files.
  Generated artwork/data, lockfile formatting and the throwaway mockup are excluded
  from inappropriate source checks. Full tests and builds run in CI, not commit hooks.
- **Repo layout**: one package.
  ```
  src/client/   src/server/   src/shared/{schema,rules,data}/
  public/cards/SD/   public/icons/SD.png   scripts/import-cards.ts
  Dockerfile   docker-compose.yml   docs/ (spec, design mockup)
  ```
- **Deployment (Raspberry Pi, arm64)**
  - **`Dockerfile`**, multi-stage, on `node:22-alpine`:
    - The build stage runs `npm ci` and `npm run build`, producing `dist/client` and
      `dist/server`.
    - The runtime stage gets production deps and `dist` only, runs as the non-root
      `node` user, and has `EXPOSE 8080`, `VOLUME /data` and a `HEALTHCHECK` on
      `/api/health`.
    - It runs `CMD ["node", "dist/server/index.js"]`.
  - **`docker-compose.yml`**: one service, `restart: unless-stopped`, port mapping (e.g.
    `8080:8080`), and the volume `./data:/data`. Env vars: `PORT`, `DATA_DIR`.
  - The user can build and run on the Pi with `docker compose up -d --build`.
  - Delivery acceptance uses automated arm64 container/Compose verification and operating
    instructions. Actual home Pi deployment, SSH access and network changes are a separate
    task, not an implementation-agent prerequisite.
  - Reachable only on the LAN/VPN, so no TLS or auth in the app.
- **Accessibility**:
  - Card images have `alt` = card name and level.
  - All actions are keyboard reachable.
  - State (in deck / dropped / invalid) is never conveyed by color alone.

## 8. Acceptance scenarios

1. Create build "Freeze control" at start level 1 and choose 11 of 14 cards. A
   collapsed "Not in deck" section offers optional notes for the other 3.
2. Create a build at start level 3:
   - The level 2 slot offers Birds in a Tempest and Tornado.
   - The level 3 slot offers the other level 2 card, Cold Snap and Polar Vortex.
   - Then choose 11 of 16 pool cards.
3. Level-up 3 → 4: the status bar stays visible and the level 4 cards are shown first.
   Pick Biting Frost → "Remove 1 card — 12 / 11" → drop one → done. That takes ≤ 4
   taps without typing. Biting Frost is marked NEW in the deck and can't be dropped.
4. Extra swaps: pick and drop, then bring back an earlier dropped pool card from "Swap
   more" and drop another.
   - The returned card stays in the swap section, marked *Added*, with its "Why…?" note
     on the card. The section stays open.
   - The overview shows 2 added and 2 dropped at that level.
5. With levels 3–6 planned, change the level 4 pick:
   - Levels 5–6 update automatically.
   - If level 5 picked the card now picked at level 4, level 5 is flagged invalid with a
     fix action.
6. Edit the starting deck to drop a card that level 5 also drops. Level 5 is flagged
   invalid. After the "remove change" fix, that drop's motivation is hidden, not deleted.
7. Save a starting deck with 9 / 11 cards. It shows **incomplete** and is still stored.
8. "Show guidance" reveals this build's guidance for every card in the deck view. A copy
   of the build has the same guidance, which can then be edited independently.
9. Reopen the app on the same device: it opens the last viewed build and level.
10. Data edited on desktop shows on phone after reload. A stale save from another device
    gets the 409 message, and no data is lost.
11. After 25 saves, `data/backups/` holds exactly the 20 most recent backups.

## 9. Out of scope (v1)

- Authentication / multi-user / TLS.
- Characters other than Snowdancer.
- Situational deck variants (planned later).
- Changing a build's start level.
- Perks, attack modifiers, items, enhancements.
- Offline editing.
- Motivation/guidance history.
- Re-basing a copied build onto a different start level.
- Markdown formatting, offline persistence, custom blocked-label automation.
- Hosted agent-dispatch infrastructure or automatic ticket-selection loops.
- Live Pi deployment, SSH/network changes and manual user-sign-off gates.
