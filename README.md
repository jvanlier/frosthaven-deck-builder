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

Development saves builds and backups in `./data/` (gitignored), creating it on
first save. Set `DATA_DIR` to override this location. The production server and
Docker image still default to `/data`.

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

On Linux machines that also need Playwright's system packages, if they're not installed yet, use
`npx playwright install --with-deps chromium webkit` instead.

The production build writes the browser bundle to `dist/client` and the
Node server to `dist/server/index.js`.

### Raspberry Pi deployment

The repository includes a multi-stage `node:22-alpine` image and a one-service Compose
configuration. The runtime image contains only production dependencies and the built
server/client assets, runs as the non-root `node` user, and stores application data in
`/data`.

On the Pi, create the bind mount first and give it to the runtime user (UID/GID 1000):

```sh
mkdir -p data
sudo chown -R 1000:1000 data
chmod 700 data
docker compose up -d --build
```

Do not run the container as root or make the data directory world-writable. If an
existing mount is root-owned, stop the service, correct its ownership, and start it
again. The default `PORT=8080` and `DATA_DIR=/data` can be changed in a `.env` file;
`./data` remains the host-side bind mount. For example, `PORT=8088` publishes and uses
port 8088, while `DATA_DIR=/data` is the normal container path.

Check the service and health endpoint with `docker compose ps` and
`curl http://127.0.0.1:8080/api/health`. Inspect startup or storage errors with
`docker compose logs --follow app`. Keep the published port reachable only from the
trusted LAN/VPN: do not configure router port forwarding or expose it directly to the
internet. The app intentionally provides no authentication or TLS.

For an upgrade, copy the host data directory to a host-level backup, then run
`docker compose up -d --build` again. Host-level backups are the operator's
responsibility; include `data/appdata.json` and `data/backups/` and keep them off the Pi.
For example, stop writes before making a tar archive and start the service again:

```sh
docker compose stop
tar -C . -czf frosthaven-data-$(date +%Y%m%d).tar.gz data
docker compose start
```

To recover an exported JSON file, use the app's import action. To recover a predecessor
backup, stop the service, copy the selected `data/backups/appdata-*.json` over
`data/appdata.json`, restore ownership with `sudo chown 1000:1000 data/appdata.json`,
and start the service. Preserve the existing directory as a separate host backup before
replacing anything.

The disposable arm64 packaging check can be run where Docker and Compose are available:

```sh
npm run test:container
```

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
