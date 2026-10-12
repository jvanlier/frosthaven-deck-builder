# Frosthaven Deck Builder — Specification

Status: draft v1 · Owner: jvanlier

## 1. Purpose

A personal web app for planning Frosthaven character "decks" (the hand of ability
cards you bring into a scenario) across levels 1–9, and for recording *why* each card
was picked, dropped or never used.

Single user. Works on phone and desktop with shared persistent storage across devices.
No authentication, authorization or multi-user support in v1 (see §9).

## 2. Game rules the app enforces

Sources: [Frosthaven Rule Book](https://pikdonker.github.io/frosthaven-rule-book/)
(p.4–5 Creating a Character, p.34 Ability Cards, p.62–63 Level Up, p.65 Create a
Character, p.70 Character Respeccing), [Frosthaven FAQ](https://cephalofairgames.github.io/frosthaven-faq/).

### 2.1 Terminology

| Term     | Meaning                                                              | App term |
|----------|----------------------------------------------------------------------|----------|
| **Pool** | All ability cards the character owns and may choose from.            | Pool     |
| **Hand** | The cards brought into a scenario. Size = the character's hand size. | Deck     |

In this spec, **deck** means the hand of `handSize` cards picked from the pool for a
given level. The UI uses "Deck" for this. The pool is shown as a separate concept.

### 2.2 Rules

- **R1 Starting pool.** At level 1 the pool contains all level 1 and all level X cards.
  Level X cards count as level 1 for all purposes.
- **R2 One card per level-up.** Each level-up from L−1 to L adds **exactly one** card to
  the pool. That card must be of level ≤ L and not already in the pool. Example: at
  level 3 you may take either level 3 card, or the level 2 card you skipped.
- **R3 Picks are permanent.** Pool additions can't be undone within a build. (The
  optional *Respeccing* variant is out of scope; to explore alternatives, fork the build
  instead. See §4.6.)
- **R4 Starting above level 1.** A character created at level N starts at level 1 and
  levels up immediately (prosperity leveling) to N. So it still makes N−1 pool picks,
  one per level 2..N, and each pick follows R2 for its own level.
- **R5 Deck size.** A deck has exactly `handSize` cards, all from the current pool.
  Level-up doesn't increase hand size.
- **R6 Deck changes are free.** In the game the hand can be re-chosen before every
  scenario, so changing a deck never violates a rule. That's why "swap out more than one
  card" at level-up is allowed (§4.4).

Consequence (for validation and display): at level L the pool has
`|L1| + |LX| + (L−1)` cards, and for K ≥ 2 at most `L − K + 1` pool cards can be of
level ≥ K.
Validating R2 per level enforces this automatically.

## 3. Content: characters and cards

### 3.1 Supported characters

v1: **Snowdancer** only (class code `SD`), hand size **11**. Character data lives in a
static, data-driven file so more classes can be added later without code changes.

```ts
type CardLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | "X";

interface Card {
  id: string;          // slug, e.g. "cold-snap"
  name: string;        // "Cold Snap"
  level: CardLevel;
  initiative: number;
  image: string;       // path relative to image base URL
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
  - Metadata: `data/character-abilities/frosthaven.json` (filter on `/SD/` in `image`;
    skip the `sd-back` entry with level `-`).
  - Images: `https://raw.githubusercontent.com/cmlenius/gloomhaven-card-browser/images/images/{image}`,
    e.g. `.../character-ability-cards/frosthaven/SD/fh-cold-snap.jpeg`.
- A one-off script (`scripts/import-cards`) generates `src/data/characters/SD.json`.
  The output is committed, and the script is re-run only when needed.
- **Images are hot-linked, not committed.** The artwork is © Cephalofair Games and this
  is personal use. Store the image path in card data. Keep the base URL in one constant
  so it can be swapped for a mirror or cache later.
- Card back (`fh-sd-back.jpeg`) can serve as a placeholder while images load.

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

### 4.1 Character selection

- **F1** Show a character picker. v1 lists only Snowdancer. With one character, the app
  may auto-select it, but the picker must still exist.

### 4.2 Builds

- **F2** A character has 1+ named builds. Create, rename and delete (with confirmation).
- **F3** On creation the user picks the build's **start level** (1–9). Levels below the
  start level don't exist in that build and are never asked for.
- **F4** **Fork build at level L.** Copies all level entries `< L` (picks, decks,
  motivations) into a new named build. This is the only way to "change" a locked pick
  (R3), and is also useful for comparing alternative plans.

### 4.3 Initial deck (start level)

- **F5** If start level N > 1, the user first makes the pool picks for levels 2..N. Each
  pick is shown as its own slot ("Level 2 pick", "Level 3 pick", …) with only valid
  options per R2/R4. Each pick can have a motivation (§4.7, kind `add`).
- **F6** The user then picks `handSize` cards from the pool at level N. Show a counter
  (e.g. `9 / 11`) and disallow selecting more than `handSize`.
- **F7** After the deck is complete, prompt (non-blocking) for an **exclusion
  motivation** for every card of level ≤ N that isn't in the deck. That covers pool cards
  left out and, for N > 1, cards not picked into the pool. List these cards with an
  empty text field each. The user can skip and fill them in later.

### 4.4 Level-up (L → L+1) — optimized happy path

Available when level L exists in the build and L < 9. Creates level L+1, which starts
as a copy of deck L.

1. **Current deck at a glance.** A compact strip or grid showing all `handSize` cards of
   deck L, visible for the whole flow without scrolling on phone and desktop. Tapping a
   card enlarges it.
2. **Pick new pool card (R2).** Show candidates:
   - **Newly unlocked**: the level L+1 cards, shown first and prominently.
   - **Earlier, not yet picked**: unpicked cards of level 2..L, in a secondary section.
   Choosing one is required. Optional "Why this card?" field (motivation kind `add`).
3. **Add to deck.** By default the picked card goes into the deck, making it
   `handSize + 1`. The app shows a clear instruction: **"Remove 1 card — your deck has
   12/11."**
4. **Drop one card.** The user taps one of the 12 cards (including the new one, which
   means "add to pool only, keep deck as-is"). Optional "Why does this card go?" field
   (motivation kind `drop`).
5. **Done.** Save is enabled only when the deck has exactly `handSize` cards.

**Extra swaps (secondary path).** A "Swap more cards" action lets the user add any other
pool card not currently in the deck, then remove one, repeated as needed. Each
added/dropped card gets its own motivation field. Dropped cards stay in the pool and can
come back at any later level.

**Planning ahead.** Level-ups can be chained to build levels up to 9 before they are
reached in the campaign (see lock state, §4.5).

### 4.5 Lock state (permanence)

- **F8** Each level entry is `planned` or `locked`. Locking means "I actually reached
  this level in the campaign". The user locks a level explicitly ("Mark level as
  reached"). Levels lock in order: the start level first, then L only if L−1 is locked.
- **F9** A locked level's pool pick(s) can't be changed (R3). Its **deck can still be
  edited** (R6).
- **F10** A planned level's pick can be changed. Then re-validate all later levels. Any
  later level whose pick is now invalid (e.g. same card picked twice) or whose deck
  references a card no longer in the pool is flagged **invalid**. The user must resolve
  it, either by editing or by deleting that level and everything after it.
- **F11** Only the highest level of a build can be deleted, and only if it's planned.
  Deleting cascades to its motivations.

### 4.6 Views

- **F12 Deck view (character, build, level).** The main screen. Shows the `handSize`
  cards as images, sorted by level then initiative. Includes:
  - level switcher (prev/next and direct select among existing levels),
  - badges: `locked`/`planned`, `invalid`,
  - a **"Show guidance"** toggle that reveals each card's guidance text below or over it.
    Individual cards can also be expanded on tap.
  - this level's changes: picked card, added and dropped cards, with their motivations.
- **F13 Build overview (all levels at once).** A matrix: rows = cards (grouped by card
  level), columns = build levels. Each cell shows one of: *in deck* ●, *in pool, not in
  deck* ○, *not in pool* (blank). It also marks *picked into pool here* (★), *added* (+)
  and *dropped* (−). Cells with a motivation show an indicator, and tapping one opens it.
  A per-level summary row shows the pick and the swap count. Tapping a column header
  opens that level's deck view.
- **F14 Pool view** per level (secondary). All pool cards, with deck membership shown.

### 4.7 Motivations

Three kinds, all free text (plain text or Markdown, rendered safely, never raw HTML):

| Kind      | Attached to              | Question                                                      |
|-----------|--------------------------|---------------------------------------------------------------|
| `exclude` | build, start level, card | Why was this card never a good fit for the build?             |
| `add`     | build, level, card       | Why is this card the best choice? (pool pick and/or deck add) |
| `drop`    | build, level, card       | Why is this the worst card, why does it have to go?           |

- **F15** Motivations can be entered inline during deck creation and level-up, and edited
  at any time afterwards.
- **F16 Motivations view** per build. Grouped as: *Never picked* (exclude), then per
  level *Added* / *Dropped*. Each entry shows the card thumbnail and inline-editable text.
  Filter: "only missing motivations". Store and show `updatedAt` so the user can see
  when an opinion was last revised.
- **F17 Card detail** (from any view): large image, guidance, and all motivations about
  this card across the build's levels.
- **F18** If a change means a motivation no longer applies (e.g. a different card is now
  dropped), keep it in storage but hide it. It reappears if the same change is made
  again. No UI for orphaned motivations in v1.

### 4.8 Card guidance

- **F19** One free-text guidance note per card per character: how to use it, when to
  play top/bottom, combos. It's shared across all builds, since card advice usually
  doesn't depend on the build.
- **F20** Editable from card detail. Shown in deck view behind the "Show guidance"
  toggle (F12).

### 4.9 Remember last position

- **F21** Store `{ characterId, buildId, level }` in `localStorage` on navigation. On app
  start, open that deck view. Fall back to the build list if the build or level no longer
  exists. Per device, not synced.

### 4.10 Backup

- **F22** Export all user data as a JSON file, and import it (replaces all data, after
  confirmation and schema validation). This is a cheap safety net for the single-document
  storage model.

## 5. Data model (user data)

All user data is one JSON document.

```ts
interface AppData {
  schemaVersion: 1;
  revision: number;                 // incremented by server on every save
  builds: Build[];
  motivations: Motivation[];
  guidance: Record<string, Record<string, Guidance>>; // characterId -> cardId -> note
}

interface Build {
  id: string;                       // uuid
  characterId: string;              // "SD"
  name: string;
  startLevel: number;               // 1..9
  levels: LevelEntry[];             // contiguous, startLevel..max, sorted
  createdAt: string; updatedAt: string; // ISO 8601
}

interface LevelEntry {
  level: number;                    // 1..9
  status: "planned" | "locked";
  // Pool picks made to reach this level. Start level N: picks for 2..N (empty if N=1).
  // Any later level: exactly one pick, for this level.
  picks: { forLevel: number; cardId: string }[];
  deck: string[];                   // cardIds, length === handSize when complete
}

interface Motivation {
  buildId: string;
  level: number;
  cardId: string;
  kind: "exclude" | "add" | "drop";
  text: string;
  updatedAt: string;
}                                   // unique key: (buildId, level, cardId, kind)

interface Guidance { text: string; updatedAt: string }
```

Derived (never stored): pool at level L = L1 ∪ LX ∪ all picks up to L. Added at L =
`deck[L] \ deck[L−1]`. Dropped at L = `deck[L−1] \ deck[L]`.

### 5.1 Rules engine

A pure, UI-independent TypeScript module with unit tests. It exposes:
`poolAt(build, level)`, `pickOptions(build, level)`, `validateBuild(build) → Issue[]`,
`diff(build, level) → { added, dropped }`. Every rule in §2 and F8–F11 must have tests.

## 6. Storage and sync

- **Server is the source of truth.** The whole `AppData` document is loaded on start and
  saved as a whole (it's small: well under 100 KB).
- **Saves** are debounced (~1 s) after changes. A status indicator shows *Saved*,
  *Saving…* or *Unsaved / error (retry)*. Warn on page unload while changes are unsaved.
- **Concurrency**: optimistic. `PUT` sends the last known `revision`. If the server's
  revision is newer it responds `409`, and the app shows "Changed on another device —
  reload" without merging. Overwriting newer data silently is not allowed.
- **Server-side validation**: reject payloads that aren't valid JSON matching the schema
  (shape/types, size cap e.g. 1 MB). This applies even without auth.
- Offline editing is out of scope. If the backend is unreachable, show an error state.

## 7. Technical approach (recommended)

- **Frontend**: Vite + React + TypeScript SPA, responsive (phone-first for the deck view).
  Routing via URL so views are linkable: `/c/:characterId/b/:buildId/l/:level`,
  `/…/overview`, `/…/motivations`.
- **Hosting + API**: Cloudflare Pages (static) + one Pages Function `GET/PUT /api/data`
  storing the document in Workers KV. Free tier, no server to maintain. Auth can be added
  later with Cloudflare Access without code changes.
  - Alternative if preferred: any host with a tiny JSON endpoint (e.g. Firebase/Supabase).
    The app only depends on the `GET/PUT /api/data` contract.
- **Tests**: Vitest for the rules engine and data validation.
- **Accessibility**: card images have `alt` = card name + level. All actions are keyboard
  reachable, and selection state is never conveyed by color alone.

## 8. Acceptance scenarios

1. Create build "Freeze control", start level 1 → choose 11 of 14 cards → prompted for 3
   exclusion motivations → deck view shows 11 cards.
2. Create build at start level 3 → asked for a level 2 pick (options: Birds in a Tempest,
   Tornado) and a level 3 pick (options: the remaining level 2 card plus Cold Snap and
   Polar Vortex) → choose 11 of 16 pool cards.
3. Level-up 3 → 4: current deck visible, level 4 cards shown first, earlier unpicked
   cards shown secondary. Pick Biting Frost → "Remove 1 card (12/11)" → drop one → save.
   Takes ≤ 4 taps excluding motivation typing.
4. Level-up with extra swaps: pick + drop, then bring back a previously dropped pool card
   and drop another → overview shows 2 adds and 2 drops at that level.
5. Locked level: the pick can't be changed, the deck can still be edited. "Fork at level"
   creates a copy to explore an alternative.
6. Changing a planned level's pick to a card already picked later flags the later level
   as invalid.
7. Reopening the app on the same device opens the last viewed build and level.
8. Data created on desktop is visible on phone after reload. Concurrent edits produce a
   409 conflict message instead of data loss.
9. "Show guidance" reveals guidance under every card in the deck view.

## 9. Out of scope (v1)

Authentication / multi-user · characters other than Snowdancer · respeccing variant ·
perks, attack modifier decks, items, enhancements · offline editing · motivation/guidance
history · build-specific guidance overrides.

## 10. Open questions

- Should guidance also allow a per-build override (F19 currently makes it global per
  card)?
- Should there be an "unlock latest level" escape hatch for mis-clicks, or is fork
  enough?
- Confirm hosting choice (Cloudflare Pages + KV recommended).
