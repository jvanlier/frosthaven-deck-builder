# Maintainability refactor plan

## Goal

Improve module boundaries and reduce large files while preserving application
behavior. Keep existing URLs, query parameters, UI copy, DOM structure, styling,
keyboard and focus interactions, timestamps, save ordering, conflict recovery,
and the distinction between stored and applied operations.

Prefer modules that own a complete responsibility behind a small interface.
Avoid splitting cohesive implementations merely to meet a line-count limit.

## Session 1: client boundaries and build management

1. Move URL builders into `src/client/navigation/paths.ts`. Separate build-entry
   and level-up destination decisions into `navigation/build-destination.ts`.
   Move last-position storage into `navigation/last-position.ts`. Screen modules
   should not import other screens for navigation utilities.
2. Split `build-editor.tsx` into build management, build dialogs, backup controls,
   and the starting editor. Extract the unavailable-deck presentation so build
   management does not depend on the deck screen. Preserve component identities,
   modal behavior, route validation, and rendering structure.
3. Move the existing `updateBuildData` helper out of `notes.tsx` into a focused
   document-update module and reuse it where build updates currently duplicate
   its logic. Preserve existing mutation guards and the data each updater uses.
4. Remove the unused starting-route placeholders, unused rule-function aliases,
   and unused UUID generator option aliases after checking repository references.
5. Verify the client import graph has no circular dependencies. Run formatting,
   typecheck, lint, unit tests, browser tests, and the production build. Record
   results and any environment limitations below.

This session does not redesign editor operations, synchronization state, replay
rules, stylesheet organization, or browser test organization.

## Session 2: editor operations and rules internals

1. Extract pure operations for starting-pick selection and hand adjustment,
   level-up pick replacement, hand reconciliation, and current-edit reset.
   Keep scrolling, focus, and step navigation in React. Use the existing build
   mutations and preserve unresolved stored operations.
2. Separate rules types, replay, candidate options, deck-edit reconciliation, and
   ordering behind an explicit public API. Keep closely related replay logic
   together until a further split has a clear benefit.
3. Consolidate duplicate operation identity types. Keep UI and replay sorting
   policies explicit because their ordering differs.
4. Reduce `App.tsx` to application composition by extracting layout, workspace
   resolution, save feedback, health handling, informational pages, and test
   previews. Share route lookup while retaining each route's validation.
5. Use existing regression coverage for invalid downstream operations, reset
   during saves, note inheritance, route handling, focus, and mobile scrolling.
   Add focused tests only where an extracted behavior lacks useful coverage.

## Session 3: adapters, tooling, styles, and tests

1. Separate the save controller's HTTP transport, backup-file operations, and
   React adapter. Keep synchronization state private and cohesive behind the
   current controller interface.
2. Separate importer parsing and validation, downloads, output generation, and
   transactional installation. Preserve pinned revisions, checksums, staging,
   rollback, and recovery behavior.
3. Split styles by responsibility while preserving specificity and source order.
4. Split browser tests by behavior and share fixture data and ordinary API stub
   setup. Keep timing, conflict, and failure scenarios explicit in their tests.
5. Share supported-character validation without removing validation at import,
   HTTP, or storage boundaries. Preserve acceptance of structurally valid but
   game-invalid builds.
6. Run the relevant regression suites and canonical checks. Prioritize the
   client and importer over splitting the already encapsulated storage module.

## Session 1 result

Completed on branch `refactor-client-boundaries`.

- Extracted navigation paths, destination decisions, and last-position storage.
- Replaced the 1,046-line `build-editor.tsx` with a 221-line build list,
  169-line build-dialog module, 177-line backup module, and 420-line starting
  editor. Extracted the shared unavailable-deck presentation.
- Moved and reused `updateBuildData` in build management, starting setup,
  level-up editing, deck deletion, and repairs. Kept each caller's existing
  mutation guards and snapshot-versus-current-build choices.
- Removed unused starting-route placeholders, rule aliases, and UUID option
  aliases after checking repository references.
- Checked all 25 client/shared modules reachable through client imports: no
  circular imports. Compared the moved build dialogs and backup components
  against their original implementations: unchanged.

### Checks

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `prek run --all-files` — passed.
- `npm test -- --run` — 130 tests passed across 12 files.
- `npm run test:e2e -- --workers=4 --reporter=dot` — 315 tests passed across
  desktop Chromium, phone Chromium, and phone WebKit.
- `npm run build` — passed.
- `git diff --check` — passed.

Sessions 2 and 3 remain planned. No dependencies were added or upgraded.
