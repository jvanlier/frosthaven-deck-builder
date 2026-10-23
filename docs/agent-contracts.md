# Agent contracts and unattended-delivery clarifications

These decisions supplement `spec.md` and the issue scopes. They resolve implementation
ambiguities; they do not add new product scope. See [`../AGENTS.md`](../AGENTS.md) for the
single-ticket execution, TDD, review and authorized merge policy.

## 1. Ownership and shared boundaries

| Owner  | Boundary established by that issue                                                                                                                                                                                               |
|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| #4     | Node 22 pin, canonical npm/prek commands, CI, health app factory in `src/server/app.ts`, listening entry in `src/server/index.ts`, and `CardLevel`/`Card`/`Character` contracts in `src/shared/character.ts` matching spec §3.1. |
| #5     | Validated static catalog in `src/shared/data/characters/index.ts`, exporting `characters` and `getCharacter(id)`; imported `SD.json`, local assets and attribution. Reuse #4's character types.                                  |
| #6     | `src/shared/schema/index.ts`: `appDataSchema`, `putDataRequestSchema` and inferred document types; `src/shared/builds.ts`: pure build/card-note mutations and HTTP-compatible UUID generation.                                 |
| #7     | `src/shared/rules/index.ts`: deterministic replay, options, validation, explicit deck-edit normalization and append eligibility.                                                                                                  |
| #8     | Serialized disk store and HTTP API extending #4's app factory, consuming #5's catalog and #6's schemas.                                                                                                                          |
| #9     | App-data provider/hook, save state machine, routes and reusable accessible card/dialog primitives. All later UI issues consume these instead of duplicating state/sync.                                                          |
| #10–18 | Feature implementation and verification within their assigned issue boundaries, extending established modules rather than replacing them.                                                                                        |

An owning issue establishes these exports before it closes. Consumers may add compatible
helpers/refinements needed for their own ticket, but must not invent parallel schemas,
rules, save queues, note stores or catalog constants. A breaking change needed by a
consumer belongs in its own assigned PR with compatible consumer updates and tests;
never leave current main broken or implement an unrelated future ticket.

### Canonical commands and build

#4 establishes `npm run dev`, `typecheck`, `lint`, `format:check`, `test`, `test:e2e`
and `build`, plus `prek run --all-files`. Use `npm test -- --run` for non-watch Vitest.
Commit a Node 22 version pin and lockfile; select compatible stable package versions
without seeking human approval. Production output is `dist/client` and the executable
`dist/server/index.js`; its shared imports/data must work outside the source tree.

CI starts with a genuine Chromium smoke test in #4. #9 expands browser coverage to
Chromium desktop/mobile and WebKit mobile for current Chrome/Safari behavior. The
minimum layout check is a 320px-wide phone; also cover a typical phone and desktop.
Do not make a physical phone or human visual approval an acceptance prerequisite.

### Rules projection

In addition to the spec APIs, #7 exports `replayBuild(build, character)`. Its result
contains ordered `levels`; each state exposes `level`, derived `pool`/`deck`, current
`issues`, and applied starting picks/pick/adds/drops separately from stored operations.
This is the common projection for deck, overview and repairs.
`validateBuild` returns the flattened issues; options and append guards use the same
replay. Read/replay never modifies the stored build.

Issues have stable machine codes, `severity` (`incomplete`/`invalid`), `level`, a display
message and relevant `cardId`, starting-pick `forLevel`, and operation identity. Codes
cover `MISSING_PICK`, `DECK_TOO_SMALL`, `DECK_TOO_LARGE`, `UNKNOWN_CARD`, `PICK_TOO_HIGH`,
`PICK_ALREADY_IN_POOL`, `PICK_NOT_ADDED`, `ADD_NOT_IN_POOL`,
`ADD_ALREADY_IN_PREV_DECK`, `DROP_NOT_IN_PREV_DECK`, and `START_CARD_NOT_IN_POOL`.
A malformed operation gets its specific primary issue, while hand-size issues are
reported independently. UI fixes use codes/identity, never parse display strings.

Pool/deck arrays are unique and deterministic. Deck sorting uses effective level,
printed 1 before X, initiative, then stable name/ID tie-breakers; overview row groups
use printed level. Missing/invalid choices are not mistaken for applied changes.
Card notes do not depend on replay: a card's note at level L is its version recorded at
the highest level ≤ L (`effectiveCardNote`). Use the tuple key `cardNoteKey(cardId,
level)` rather than concatenating unvalidated IDs with separators.

### App-data provider

#9 establishes one `AppDataProvider` and `useAppData()` contract:

- `data`: loaded `AppData` or null; no editing before a successful load.
- `status`: loading, saved, saving, error or conflict; saved is not a permanent header
  indicator. `canMutate` is false during loading/error/conflict and confirmed replacement.
- `updateData(updater)`: apply a synchronous immutable update to the latest local
  document; gate it on `canMutate`, validate structure and retain later edits during saves.
- `flush()`: settle all pending changes with acknowledged revisions, or reject explicitly
  on failure/conflict. It is used for export/import, not a manual Save button.
- `replaceData(candidate)`: after import validation/confirmation, flush prior edits,
  pause mutations and stage the candidate in the same save queue using the current
  acknowledged revision (ignore the imported revision). Publish the replacement as
  visible `data` and update navigation only after server acknowledgement. On failure,
  preserve the original visible data and the staged import for Retry/recovery download.
  No separate import save queue or browser-persisted draft store.
- Retry, explicit reload and pending-data download actions. Downloads use the staged
  import when replacement is pending. Reload cannot silently discard memory; the UI
  obtains confirmation where pending changes exist.

The provider owns the debounce/in-flight/acknowledgement queue. Form/card components
may hold transient presentation/input state, but never an alternative document or
save queue. Note inputs use the shared upsert helper; scoped Reset is a targeted update
against the latest document, not assignment of an old whole-document snapshot.

UUID generation must work on plain HTTP on the LAN: use `crypto.randomUUID` when
available and a standards-correct UUID-v4 fallback based on `crypto.getRandomValues`.
Never fall back to `Math.random`. Test with `randomUUID` unavailable; localhost-only
browser tests otherwise hide this secure-context limitation.

## 2. No hidden downstream acceptance dependencies

- #10 implements starting picks/hand and the exclusion section. Its portion of scenario
  1 is creating/selecting the hand and listing exclusions. Exclusion-note editing is #14;
  copying existing notes can be tested with fixtures before the notes UI exists.
- #11 provides a read-only card image/detail and guidance display using fixture notes.
  Guidance editing/global motivations are #14, new level-up flows are #12, repairs and
  highest-level deletion are #13, and the matrix is #15. Hide/disable unavailable feature
  links rather than shipping buttons that navigate to errors. Activate them in their
  owning issues; fixtures may provide future-shaped stored data for current tests.
- #12 implements scenario 4's swaps, inline notes and stored diff. Assert 2 added/2
  dropped via the data and flow; overview rendering/navigation is #15's acceptance.
- #13 tests hidden-note retention against stored data and shared applicability, without
  requiring #14's later notes screen. #14 implements that screen independently.
- #18 requires the other 14 implementation tickets completed, not itself closed before
  its PR can merge. It audits the already-established suite, not a new test pipeline.

None of these clarifications remove a product acceptance requirement; they assign each
requirement to a ticket that can actually satisfy it with merged prerequisites.

## 3. Editor completion, Reset and invalid choices

- A later level is unfinished precisely when its validation has an incomplete/invalid
  issue. A full valid level is complete even if Done was not clicked; no completion flag
  or durable editor-session state exists. Done only navigates back to its deck.
- The Level up tab resumes the highest unfinished later level. If the starting level is
  unfinished, open its starting editor; if earlier history is broken, show its problems
  and route to repair. Otherwise append only from the highest valid history below 9.
- Reset captures entry choices and the card notes recorded at this level when the editor opens. For a
  newly appended level, that baseline is the newly saved null-pick/empty-diff state.
  Reset does not delete the level. On reload/reopen, the persisted current state becomes
  the new baseline; there is no persisted undo history.
- Reset restores only fields and card notes the session changed. Preserve names, other
  levels/builds and unrelated notes. The restoration is another autosaved
  mutation and remains correct with an in-flight older request.
- Pick/unpick and pool-add toggles never change card notes. A pick is
  excluded from the extra-swap candidates to avoid representing it twice. New deck cards
  are undone only in their originating candidate group.
- Opening an invalid level or editing another choice must not normalize away invalid
  stored records. Keep unresolved entries verbatim while normalizing the valid editable
  subset; only targeted repair/replacement removes an offending record. A temporary
  hand-size issue alone does not lock otherwise valid card operations.
- “One-tap replacement” means one tap opens the focused selection editor, not that a
  replacement is silently chosen. Missing adds can be restored directly; removing a
  pick also removes its paired add, without removing unrelated operations or notes.

## 4. Storage transactions and uncertain acknowledgements

#8 distinguishes failures before replacement from failures after replacement:

1. Under the write queue, validate existing storage and check the current revision.
2. Durably create the required predecessor backup before touching the current document.
   Retry of the same predecessor revision may reuse a verified identical backup; never
   overwrite a conflicting backup. Use deterministic revision/timestamp retention.
3. Prepare and fsync the same-directory temp file. Complete required backup pruning to
   the latest 20 before replacement so pruning errors are still pre-commit failures.
4. Rename the temp file over `appdata.json`, then fsync its directory before returning
   200. Linux directory fsync is required; ignore only explicitly unsupported-platform
   errors where appropriate, never real I/O/permission failures.

Validation, backup, temp-write/fsync, pruning or rename failures before replacement
leave the preceding `appdata.json` intact and report failure. Once rename succeeds,
subsequent directory-fsync/process/network failures may mean the save committed without
acknowledgement. Do not promise rollback or automatically overwrite the new revision.
Keep the predecessor backup, report/log uncertainty, and reread authoritative disk state
for the next request rather than trusting a stale cached revision.

The client retains pending memory and pauses on an uncertain/error response. Retry
with the old base revision may return 409, which follows the existing export/explicit
reload flow. No automatic retry with a newly fetched revision, silent acknowledgement,
merge or forced overwrite. Inject tests for pre-rename failure, directory-fsync failure
after rename, and a lost response after a durable save.

GET responses use `Cache-Control: no-store`; static/frontend fallback never masks an
API error. Return consistent JSON errors without leaking file paths. Payload limits
apply before parsing and shared structural validation is used on both boundaries.

## 5. Automated verification and delivery endpoint

#17 verifies linux/arm64 via disposable Docker/Compose builds and smoke runs (native
arm64 or supported emulation). Check non-root execution, local assets, mount ownership,
health, API writes, restart/recreation persistence and backups. Test publication binds
only to loopback, using a disposable Compose override/temporary directory as needed;
never reuse the owner's data mount or running service. No actual home Pi, SSH credentials,
VPN configuration or live user data is needed to close the issue.

#18 uses Playwright keyboard/focus/modal/state-label assertions, reduced-motion and
viewport tests, screenshots/agent browser inspection, plus automated accessibility
checks (e.g. axe). Record what was verified and any limitations; do not claim exhaustive
human/device/WCAG certification. No manual user sign-off gate is required.

The release delivers tested deployable packaging and instructions. Installing it on a
home Pi is explicitly a separate task. Agents never modify networking, production
secrets, existing personal data or repository protections to unblock themselves.

The maintainer owns dispatch, concurrency and the loop. An assigned implementation
agent may use a reviewer pass for that same ticket, ready/squash-merge its verified PR,
confirm closure/main CI and stop. It must not take the next ticket, implement open
prerequisites, or build an automatic agent runner.
