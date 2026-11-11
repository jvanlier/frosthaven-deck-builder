# Develop and verify changes

Complete the [environment setup](setup.md) first. Run commands from the repository
root; use `just` to list available recipes.

## Start development

```sh
just serve
```

Open `http://127.0.0.1:5173`. To use a different data directory:

```sh
DATA_DIR=./scratch-data just serve
```

See [runtime configuration](configuration.md) for defaults.

If you reinstall dependencies while the server is running, stop and restart
`just serve`, then reload the browser. This clears stale Vite dependency state
that can otherwise produce a blank page with `504 Outdated Optimize Dep` errors.

## Verify a change

Run the canonical checks:

```sh
just check-hooks
just check
just test
just test-e2e
just build
```

Browser tests require the [Playwright setup](setup.md). To run a specific browser
suite or pass other Playwright options:

```sh
just test-e2e --project=chromium
```

For a behavior-changing pull request, write and run the failing test first.
Record the initial failing command and expected reason, then the passing targeted
and canonical checks after implementation. Do not replace a real smoke test with
an empty or `passWithNoTests` assertion.

For packaging changes, also run the [container smoke test](deployment.md#verify-packaging).
See the [command reference](commands.md) for all recipes.
