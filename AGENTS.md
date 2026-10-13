# Single-ticket autonomous implementation

## Scope and authority

- Work on **only the assigned GitHub issue**. The maintainer dispatches agents and
  manages the loop; do not choose/start the next issue or build agent-dispatch automation.
- Read the issue, its native blocked-by relationships, `docs/spec.md`,
  `docs/implementation-plan.md`, and `docs/agent-contracts.md` before changing code.
- Start from current `origin/main` on a task branch such as `issue-<number>-<slug>`.
  Reuse a related unmerged task branch/PR when resuming. Never commit directly to main.
- If a prerequisite is open, stop with a blocker report. Do not implement prerequisites
  or bypass their dependency relationships to finish the assigned ticket.
- Product decisions and cross-ticket boundaries in the documents are settled. Choose
  minor implementation details autonomously using existing code, the standard library,
  native platform features, and installed dependencies before adding code/dependencies.
- No routine human approval is required for in-scope implementation, dependency versions
  compatible with Node 22, tests, or UI details consistent with the mockup. Do not expand
  scope or silently change a settled product decision.

## TDD and validation

1. Write behavior/acceptance/error tests first; run them and verify the expected failure.
2. Implement the minimum needed to pass, then refactor while tests stay green.
3. Record the failing command/reason and passing commands/results in the PR description.
   Failing intermediate commits do not need to be pushed.
4. Reuse shared schemas, rules and mutations. Do not remove/shorten error handling,
   trust-boundary validation, security checks or accessibility to simplify implementation.
5. Documentation-only edits need no artificial tests. Config/container changes require
   executable validation/smoke evidence. Do not invent results or waive required checks.

After #4, use these canonical commands (that ticket must establish them):

```sh
npm ci
prek run --all-files
npm run typecheck
npm run lint
npm run format:check
npm test -- --run
npm run test:e2e
npm run build
```

Run relevant targeted tests during red/green iterations and the complete established
pipeline before merging. Browser tests use isolated temporary data, not personal data.
The repository's Node 22 pin is authoritative; do not use a newer ambient Node version
as the sole validation environment. Test runtime functionality over plain HTTP too.

## PR, review and merge

- Create the PR as a **draft**, with `Fixes #<assigned issue>`, acceptance coverage,
  red → green evidence, and a concise change summary.
- Run a **separate read-only automated review pass** against the final diff, issue and
  test evidence. Prefer a fresh reviewer context where available; an explicit separate
  review phase is required even without a second agent. Do not require a human GitHub
  approval. Address every unresolved finding with regression tests and rerun verification.
- Record review findings and their resolution (or no findings) on the PR. Any subsequent
  code change invalidates prior final-review/check evidence and requires re-verification.
- The owner authorizes agents to mark their assigned PR ready and **squash-merge** once
  review findings are resolved and all applicable checks succeed for the exact current
  head SHA. Fetch/update against current main and verify the merge candidate; rerun
  checks/review after resolving conflicts or making changes.
- Inspect actual workflow runs/check conclusions, not only `gh pr checks` exit status.
  Missing, pending, failed, cancelled or unexpectedly skipped required checks are not
  success. Never use admin bypass, disable checks, force-push main or weaken validation.
- Before #4 establishes CI, a documentation-only planning PR may merge after executable
  document/link/dependency validation and the separate review pass. Feature PR #4 must
  have a real successful GitHub Actions run before it merges.
- Use the current-head SHA guard for merging. Verify the PR merged, the assigned issue
  closed through its closing reference, and resulting main CI (once available). Leave
  completion evidence and then **stop**; do not take another ticket. If resulting main
  CI fails, reopen the assigned issue, report the failure and leave it unresolved rather
  than declaring success or dispatching dependent work.

## Operational boundaries and failure handling

- Delivery ends at verified Docker/Compose packaging, automated arm64 tests and operating
  instructions. No live Pi deployment, SSH access, network/firewall changes, production
  secrets, or modification/deletion of existing personal data is authorized.
- Use disposable test directories/volumes and loopback-bound test servers. Preserve any
  pre-existing user files, unrelated changes and other agents' branches/worktrees.
- Infrastructure, credential, permission or unavailable-tool failures may still block
  execution. Retry only safe transient failures a bounded number of times (at most 3);
  never bypass gates or claim success. Report the command, failure, remaining requirement
  and resumable branch/PR on the assigned issue, leave it open, and stop.
