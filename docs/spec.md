# Frosthaven Deck Builder — Specification

Status: draft v2 · Owner: jvanlier

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
- **Attribution** goes in the README and an in-app "About" view:
  - Card artwork and text © Cephalofair Games, used for personal, non-commercial
    purposes.
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

Visual design and styling are out of scope for this document (next session). The
requirements below describe behavior and what must be visible, not layout or styling.

### 4.1 Hierarchy

Character → 1..n named builds → one deck per level (start level..9). There are no deck
variants within a level.

### 4.2 Character selection

- **F1** A character picker. v1 lists only Snowdancer and may auto-select it.

### 4.3 Builds

- **F2** Create, rename, copy and delete (with confirmation) builds.
- **F3** On creation the user chooses a **start level** (1–9). Levels below it don't
  exist in the build and are never asked for. The start level can't be changed later;
  copy the build instead.
- **F4** **Copy build** deep-copies everything: levels, picks, decks, motivations and
  guidance. The user names the copy.

### 4.4 Start level

- **F5** For start level N > 1: one pick slot per level 2..N ("Level 2 pick", …). Each
  slot offers only options valid per R2/R3 given the other slots.
- **F6** Select up to `handSize` cards from the pool for the starting deck, with a counter
  (`9 / 11`). Selecting more than `handSize` isn't possible.

### 4.5 Level-up (L → L+1): happy path

Available from the deck view of the highest existing level when L < 9. It is also used,
pre-filled, to **revise** an existing level-up (§4.6).

1. **Current deck at a glance.** All cards of deck L stay visible together for the
   whole flow, on phone and desktop. Tapping a card enlarges it.
2. **Pick a new pool card (R2).** Candidates:
   - **Newly unlocked**: the level L+1 cards, shown first and prominently.
   - **Earlier, not yet picked**: unpicked cards of level 2..L, in a secondary section.
3. **Added to deck by default.** The deck is now `handSize + 1`, and the app shows a
   clear instruction: **"Remove 1 card — 12 / 11"**.
4. **Drop one card.** Any of the 12 can be dropped. Dropping the newly picked card means
   "add to pool only".
5. **Done.**

**Swap more cards (secondary path).** Add any other pool card not in the deck, then drop
one, repeated as needed. Dropped cards stay in the pool and can return at any later
level.

**Optional motivation fields** sit next to the picked, added and dropped cards (§4.8).
The app never prompts for them and never blocks on them.

**Planning ahead.** Level-ups can be chained up to level 9 at any time.

### 4.6 Revising earlier choices

- **F7** Any level can be edited at any time: the start picks, the start deck, and any
  later pick, added card or dropped card. Editing a level-up reopens the §4.5 flow,
  pre-filled.
- **F8** Edits **propagate** to later levels, because later levels store only their own
  changes (§5.2). Later levels whose changes no longer apply are flagged **invalid**, with
  the specific problem. Each problem has a one-tap fix: remove that change, or choose a
  replacement.
- **F9** Only the highest level can be deleted. Deleting a level also deletes its
  motivations.

### 4.7 Views

- **F10 Deck view (build, level).** The main screen:
  - The deck's cards as images, sorted by card level, then initiative.
  - A level switcher (previous/next, and a direct choice among existing levels).
  - Badges: **incomplete**, **invalid**.
  - A **"Show guidance"** toggle that reveals each card's guidance with the card. A
    single card can also be expanded on tap.
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
  editable guidance for this build, and all of this build's motivations about this card.

### 4.8 Motivations

All optional, free text, stored per build:

| Kind      | Key                      | Meaning                                                                                                                            |
|-----------|--------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| `exclude` | build, start level, card | Why this card was never a good fit for the build. Available for every card of level ≤ start level that's not in the starting deck. |
| `add`     | build, level, card       | Why this card is the best choice: the pool pick and/or a card added to the deck at this level.                                     |
| `drop`    | build, level, card       | Why this is the worst card and has to go.                                                                                          |

- **F13** Where motivations can be entered:
  - inline wherever the subject appears (level-up flow, deck view changes, card detail),
  - in the starting-deck view, a collapsed "Not in deck" section with an optional note
    per card.
  - A missing motivation is shown as a subtle "add note" affordance, never as a warning.
- **F14 Motivations view** per build, to inspect and revise:
  - Grouped as *Not in starting deck*, then per level *Picked / Added* and *Dropped*.
  - Each entry shows a thumbnail and inline-editable text with its `updatedAt`.
  - Only motivations that currently apply are listed.
- **F15** If an edit means a motivation no longer applies (e.g. a different card is now
  dropped), keep it in storage but hide it. It reappears if the same change is made
  again.
- **F16** Text is plain text or Markdown, rendered safely (never raw HTML).

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
  startDeck: string[];                 // cardIds, ≤ handSize
  levelUps: LevelUp[];                 // levels startLevel+1..max, contiguous, sorted
  motivations: Motivation[];
  guidance: Record<string, Note>;      // cardId -> note
  createdAt: string; updatedAt: string; // ISO 8601
}

interface Pick { forLevel: number; cardId: string | null }  // null = not chosen yet

interface LevelUp {
  level: number;
  pick: string | null;                 // cardId added to the pool at this level
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
  `added = new \ prev`, `dropped = prev \ new`.

Validation issues per level:

| Issue                                                  | Severity   |
|--------------------------------------------------------|------------|
| Missing pick                                           | incomplete |
| Deck size < `handSize`                                 | incomplete |
| Deck size > `handSize`                                 | invalid    |
| Pick of level > L, or a card already in the pool       | invalid    |
| Added card not in `pool(L)`, or already in `deck(L−1)` | invalid    |
| Dropped card not in `deck(L−1)`                        | invalid    |
| Unknown cardId                                         | invalid    |

During replay, invalid operations are skipped so every deck stays well-defined. They are
reported, never silently deleted.

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
  oversized payloads (cap 1 MB) with `400`/`413`.
- **Client saves** are debounced (~1 s). A status indicator shows *Saved*, *Saving…* or
  *Error (retry)*. Warn on page unload while changes are unsaved.
- **On 409**: show "Changed on another device — reload". Never merge or overwrite
  silently.
- **Persistence on disk** (`DATA_DIR`, default `/data`):
  - `appdata.json`, written atomically: write a temp file, fsync, rename.
  - Before each save, the current file is copied to
    `backups/appdata-<timestamp>-r<revision>.json`. Only the latest 20 are kept.
  - Getting data off the Pi (the Pi runs on an SSD) is configured on the host, outside
    the app.
- No offline editing. If the server is unreachable, show an error state.

## 7. Technical approach

- **Language**: TypeScript end to end. The zod schema, card data and rules engine are
  shared by client and server.
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
- **Tests**: Vitest (rules engine, schema, storage write/backup/409 logic).
- **Repo layout**: one package.
  ```
  src/client/   src/server/   src/shared/{schema,rules,data}/
  public/cards/SD/   scripts/import-cards.ts
  Dockerfile   docker-compose.yml   docs/
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
  - Built and run on the Pi with `docker compose up -d --build`.
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
3. Level-up 3 → 4: deck 3 stays visible and the level 4 cards are shown first. Pick
   Biting Frost → "Remove 1 card — 12 / 11" → drop one → done. That takes ≤ 4 taps
   without typing.
4. Extra swaps: pick and drop, then bring back an earlier dropped pool card and drop
   another. The overview shows 2 added and 2 dropped at that level.
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
- Visual design (next session).
