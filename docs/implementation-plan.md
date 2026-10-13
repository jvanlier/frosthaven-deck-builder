# Frosthaven Deck Builder — Implementation plan

Status: agreed; GitHub issues created. No production implementation is included in this
planning change.

- Product specification: [`spec.md`](spec.md).
- Visual reference: [`mockup/README.md`](mockup/README.md), not production code.
- Tracking issue: [#3](https://github.com/jvanlier/frosthaven-deck-builder/issues/3).
- Execution/merge policy: [`../AGENTS.md`](../AGENTS.md).
- Shared ownership and resolved edge cases: [`agent-contracts.md`](agent-contracts.md).

**One assigned ticket per agent.** The maintainer manages dispatch and the loop. Agents
may finish, review and merge their own verified PRs, but do not select the next ticket.

## 1. Delivery order and dependencies

Every row is a native sub-issue of #3. Each prerequisite is also a native GitHub
**blocked-by** relationship, not just a reference in the issue body.

| Key | Issue                                                                                                                  | Native blocked by  |
|-----|------------------------------------------------------------------------------------------------------------------------|--------------------|
| A   | [#4 — Scaffold, GitHub Actions CI and quick prek checks](https://github.com/jvanlier/frosthaven-deck-builder/issues/4) | None: start here   |
| B   | [#5 — Snowdancer catalog, artwork and attribution](https://github.com/jvanlier/frosthaven-deck-builder/issues/5)       | #4                 |
| C   | [#6 — Shared schemas and build/note mutations](https://github.com/jvanlier/frosthaven-deck-builder/issues/6)           | #4                 |
| D   | [#7 — Rules engine, replay and normalized deck edits](https://github.com/jvanlier/frosthaven-deck-builder/issues/7)    | #5, #6             |
| E   | [#8 — API, atomic storage and rotating backups](https://github.com/jvanlier/frosthaven-deck-builder/issues/8)          | #5, #6             |
| F   | [#9 — App shell, autosave and accessible card UI](https://github.com/jvanlier/frosthaven-deck-builder/issues/9)        | #5, #8             |
| G   | [#10 — Build management and starting editor](https://github.com/jvanlier/frosthaven-deck-builder/issues/10)            | #7, #9             |
| H   | [#11 — Deck view, navigation and resume](https://github.com/jvanlier/frosthaven-deck-builder/issues/11)                | #10                |
| I   | [#12 — Level-up editor and extra swaps](https://github.com/jvanlier/frosthaven-deck-builder/issues/12)                 | #11                |
| J   | [#13 — Downstream repairs and level deletion](https://github.com/jvanlier/frosthaven-deck-builder/issues/13)           | #12                |
| K   | [#14 — Motivations, guidance and card detail](https://github.com/jvanlier/frosthaven-deck-builder/issues/14)           | #12                |
| L   | [#15 — Build overview matrix](https://github.com/jvanlier/frosthaven-deck-builder/issues/15)                           | #11, #14           |
| M   | [#16 — JSON export/import and recovery](https://github.com/jvanlier/frosthaven-deck-builder/issues/16)                 | #9                 |
| N   | [#17 — Raspberry Pi Docker deployment](https://github.com/jvanlier/frosthaven-deck-builder/issues/17)                  | #8, #9             |
| O   | [#18 — Release acceptance and accessibility gate](https://github.com/jvanlier/frosthaven-deck-builder/issues/18)       | #13, #15, #16, #17 |

After A, catalog and schema work can proceed in parallel; then rules and server work.
After F, backup and deployment work can proceed alongside the main user-flow sequence.
After I, repairs and notes can proceed in parallel. These are scheduling opportunities
for the maintainer, not instructions for an agent to take multiple tickets.

The API explicitly depends on the catalog because it validates supported character IDs.
Do not duplicate catalog constants to evade this dependency.

### Blocked-state behavior

GitHub displays its native Blocked indicator while an issue has open prerequisites.
`issueDependenciesSummary.blockedBy` counts open blockers; `totalBlockedBy` includes
closed history. A completed prerequisite can stay linked without continuing to block
work. Reopening it blocks dependent work again. No manual `blocked` label or custom
label-maintenance workflow is needed.

Close an implementation issue only after its acceptance criteria are met and its tested
PR is merged. Use PR closing references so dependent tickets become ready when the
required implementation is actually available. The parent tracks sub-issue completion;
it is not a prerequisite for its children.

## 2. Mandatory test-first workflow

Every implementation issue includes specific **Tests to write first**, acceptance
criteria and the following definition of done:

1. Write automated tests before behavior-changing implementation.
2. Run them and verify the expected failure: red must demonstrate missing/incorrect
   behavior, not an unrelated setup error.
3. Implement the minimum needed for green; reuse shared schemas, rules and helpers.
4. Refactor with tests remaining green.
5. Record the failing command/reason and passing commands/results in the PR description.
   There is no requirement to push failing intermediate commits.
6. Run quick prek checks and the relevant unit/integration/browser tests; established
   CI checks must pass before merge. Preserve error handling, trust-boundary validation,
   security checks and accessibility.

Use task branches and draft PRs. Run a separate read-only automated review pass and
resolve its findings. Agents are authorized to mark their assigned PR ready and
squash-merge when all applicable checks pass for the exact final head SHA, using a SHA
guard and without bypasses or human approval. Confirm merge, assigned-issue closure and
main CI, then stop. Missing/pending/failed/cancelled or unexpectedly skipped checks are
not success. An infrastructure/authentication failure is an explicit blocker, not a
reason to weaken the gate.

Documentation-only changes do not need artificial tests; executable configuration and
container changes still require smoke-check evidence. The pre-CI documentation PR may
merge after executable document/link/dependency checks and the separate review pass.
The bootstrap implementation PR itself must establish and pass real GitHub Actions CI.

### Feedback from the first PR

Issue A establishes a runnable minimal app, health integration test and browser smoke
test, not placeholder assertions or `passWithNoTests`.

- GitHub Actions on every pull request and push to `main`.
- Node 22, committed npm lockfile and `npm ci`.
- Pinned action SHAs, read-only permissions, caching, timeouts and cancellation of
  superseded runs.
- prek checks, formatting/linting, typechecking, Vitest, Playwright smoke coverage and
  a production build. Browser failures retain diagnostic artifacts.
- `.pre-commit-config.yaml`: pinned whitespace/final-newline fixes, merge-conflict,
  YAML/JSON checks and ESLint/Prettier for staged source files, using installed npm
  tools without implicit downloads.
- Generated content, lockfile formatting and the throwaway mockup are excluded from
  inappropriate source checks. No full test suite or production build in commit hooks.
- Document `prek install` and all local verification commands.

Each later ticket adds tests to this pipeline. O completes the existing suite and
release audit; it does not introduce CI or the first browser tests.

## 3. Resolved design decisions

### Builds and editing

- A copy preserves its immutable start level, all choices and notes. Its UUID and build
  timestamps are new; note timestamps stay unchanged until those notes are edited.
  Starting at a different level requires creating a new build, not re-basing a copy.
- Every choice and inline note autosaves. Underfull and temporarily overfull level-ups
  remain stored; there is no separate draft model.
- Done exits a level-up only with a valid pick, exactly the hand size and no current-level
  validation issues. It is not a special save action.
- Reset restores only the current editor's choices and notes to its entry state, using
  the regular mutation/save queue; it cannot revert unrelated data.
- Append a new level only when every existing level is complete and valid. Existing
  levels remain viewable and repairable. The Level up tab resumes unfinished work.
- Completion is derived from validation, not a stored Done flag. Reset's baseline is
  scoped to the current session; reopening uses the persisted current state. Reset of a
  new level retains that level with its initial null-pick/empty-diff state.
- Assign downstream acceptance to its owning ticket: starting exclusion-note editing
  belongs to K, and overview swap counts to L, not to G/I's merge gates. See the contracts
  for precise feature boundaries and safe temporary entry-point behavior.

### Notes

- Plain text only, safely escaped with preserved line breaks. No Markdown/raw HTML.
- Initial-pick motivations use the build's start level as their key, while labels retain
  the pick slot's level. A starting pick need not be in the starting hand for its pick
  motivation to apply.
- Exclusion notes cover every card of effective level ≤ start level absent from the
  starting hand, including eligible-but-unpicked cards outside the pool.
- Notes that stop applying remain stored and hidden; they reappear if the same choice
  returns. Deleting the highest level deletes that level's motivations, not guidance.

### Validation, replay and repairs

- Shared strict Zod schemas validate document structure separately from game rules.
  Incomplete/overfull hands, unknown card IDs and stale choices remain repairable.
  Unsupported character IDs are rejected at API/import boundaries.
- Bound identifiers to 100 characters, trimmed names to 1–100, notes to 20,000 and
  documents to 1 MiB. Collection bounds must not hard-code Snowdancer's card count.
- Replay invalid operations individually: report and skip them without deleting stored
  choices. Starting-deck cards outside the starting pool are invalid too.
- Earlier starting-pick slots determine later options; earlier edits flag conflicts
  rather than silently rewriting later picks. Valid picks enter the pool even if their
  required add is missing; report the missing add separately.
- Normalize deliberate deck edits, not invalid stored records merely being viewed.
  Repairs remove only the targeted change or open its replacement editor, preserving
  unrelated operations and hidden notes.

### Persistence, conflicts and imports

- Server remains the source of truth. Serialize revision checks, required backup and
  atomic disk writes within the single server process.
- Serialize client saves. Edits made during a request remain queued and use its
  acknowledged revision after success.
- On connection/save failure, retain pending data in memory, pause mutations and offer
  Retry. No offline persistence or continued offline editing.
- On 409, pause writes, offer pending-data JSON download and require an explicit reload.
  Never silently merge, overwrite, discard changes or reload.
- Official exports flush pending saves; recovery downloads can capture unsaved memory.
  Validate imports before mutation, settle pending saves, confirm replacement, and use
  the current server revision—not the imported revision—as the concurrency token.
- Missing storage alone initializes an empty document. Corrupt storage, backup failure
  and write failure produce explicit errors instead of resets or skipped backups.
- Pre-replacement failures preserve the old file. Post-rename fsync/response failures
  can leave a committed but unacknowledged revision; retain the backup, reread disk and
  use the existing pending-memory/Retry/409 recovery flow without promising rollback.

### Implementation and deployment

- Node 22, TypeScript, React/Vite/React Router, Hono, Zod, Vitest and Playwright.
- Plain CSS, native dialogs and minimal React state; no additional UI/state framework.
- Local runtime artwork, icons and fonts/resources; no dependency on upstream hosts.
- One npm package, built frontend plus executable `dist/server/index.js`.
- Non-root `node:22-alpine` image, `/data` SSD bind mount, health check and automated
  arm64 container verification. Document mount ownership rather than using root/world-
  writable access. Completion is deployable packaging and instructions, not live Pi
  installation, SSH credentials, networking changes or edits to personal data.
- Browser/keyboard/accessibility verification is executable and agent-run, with evidence;
  there is no physical-device or manual human approval gate. No agent-dispatch service is
  being built; each agent stops after its single assigned ticket.
- Single user, Snowdancer only, LAN/VPN only. No auth, TLS, offline persistence,
  additional classes, deck variants, re-basing, Markdown or note-history UI in v1.

## 4. Acceptance coverage

| Spec scenarios                                                      | Primary implementation coverage |
|---------------------------------------------------------------------|---------------------------------|
| 1, 2, 7: starting decks/picks and incomplete saves                  | G, D                            |
| 3, 4: ≤4-tap level-up, extra swaps and overview counts              | I, L                            |
| 5, 6: earlier edits, invalid later changes and retained motivations | D, J, K                         |
| 8: guidance and independent copies                                  | C, K                            |
| 9: same-device resume with safe fallback                            | H                               |
| 10: server sync and stale two-device saves                          | E, F                            |
| 11: exactly 20 newest backups after 25 saves                        | E                               |
| Full release audit                                                  | O                               |

Additional tests cover structural trust boundaries, corrupt/failed storage, scoped Reset,
queued autosaves, safe note rendering, imports, mobile/keyboard/dialog behavior, and
non-root arm64 packaging. All issues require their relevant coverage as they land;
release verification closes any remaining gaps with failing regression tests first.
