# List available commands.
default:
    @just --list

# Install dependencies from the lockfile.
install:
    npm ci

# Run type checking, linting, and formatting checks.
check:
    npm run typecheck
    npm run lint
    npm run format:check

# Run unit tests once.
test:
    npm test -- --run

# Serve the development client and API.
serve:
    npm run dev

# Build the production client and server.
build *args:
    npm run build -- {{ args }}

# Run browser tests (install browsers first).
test-e2e *args:
    npm run test:e2e -- {{ args }}

# Install Chromium and WebKit; accepts --with-deps on Linux.
install-browsers *args:
    npx playwright install {{ args }} chromium webkit

# Run the disposable arm64 container smoke test.
test-container:
    npm run test:container

# Refresh local catalogs and artwork from the pinned source.
import-cards:
    npm run import:cards

# Install local Git hooks (requires prek).
install-hooks:
    prek install

# Run Git hooks against all files.
check-hooks:
    prek run --all-files

# Serve the static design mockup at http://localhost:8765.
serve-mockup:
    python3 -m http.server 8765 --directory docs/mockup
