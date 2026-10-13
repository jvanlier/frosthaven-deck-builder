# Frosthaven Deck Builder

A local, single-user Frosthaven Snowdancer deck planning app. The runtime is
intended for a Raspberry Pi on a trusted LAN or VPN; it does not provide
authentication, TLS, or offline editing.

## Development

Use Node 22 (`.nvmrc`) and install dependencies from the committed lockfile:

```sh
nvm use
npm ci
```

The quick staged-file checks use [prek](https://prek.j178.dev/). Install it
with the package manager recommended for your platform, then install the local
hooks:

```sh
prek install
```

Run the development client and API together:

```sh
npm run dev
```

The canonical checks are:

```sh
prek run --all-files
npm run typecheck
npm run lint
npm run format:check
npm test -- --run
npm run test:e2e
npm run build
```

Install the Playwright Chromium and WebKit browsers before the first browser test:

```sh
npx playwright install chromium webkit
```

On Linux machines that also need Playwright's system packages, use
`npx playwright install --with-deps chromium webkit` instead.

The production build writes the browser bundle to `dist/client` and the
Node server to `dist/server/index.js`.

### Catalog import

The committed Snowdancer catalog and all runtime artwork are local. To refresh
those generated files from the pinned upstream source, run:

```sh
npm run import:cards
```

The importer validates the complete 30-card catalog before downloading assets
and writes the catalog, card back, class icon, and a source manifest only after
the transaction is ready. `src/shared/data/characters/source-manifest.json`
records the upstream revisions and SHA-256 checksums used for the committed
files. Do not add an external runtime asset dependency.

Behavior-changing pull requests follow test-first delivery: record the initial
failing test command and its expected reason, then record the passing targeted
and canonical checks after implementation. Do not replace a real smoke test
with an empty or `passWithNoTests` assertion.

## Attribution

Card artwork, text, and class icons are © Cephalofair Games and are used for
personal, non-commercial purposes. Card data and images are sourced through
[cmlenius/gloomhaven-card-browser](https://github.com/cmlenius/gloomhaven-card-browser).
If Cephalofair Games requests it, the images will be removed or this repository
will be made private.
