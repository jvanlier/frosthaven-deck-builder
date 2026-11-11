# Command reference

Run recipes from the repository root. `just` or `just --list` lists the available
commands. Node commands use the scripts in `package.json`.

| Command                         | Action                                                              |
|---------------------------------|---------------------------------------------------------------------|
| `just install`                  | Install dependencies from `package-lock.json` with `npm ci`.        |
| `just serve`                    | Start the development API and Vite client together.                 |
| `just check`                    | Run TypeScript checks, ESLint, and Prettier checks.                 |
| `just test`                     | Run Vitest once, without watch mode.                                |
| `just build [args…]`            | Build the production server and client; forward arguments to Vite.  |
| `just install-browsers [args…]` | Install Playwright Chromium and WebKit; accepts `--with-deps`.      |
| `just test-e2e [args…]`         | Run Playwright tests; forward arguments to Playwright.              |
| `just test-container`           | Run the disposable linux/arm64 Docker/Compose smoke test.           |
| `just import-cards`             | Refresh catalogs and local artwork from the pinned upstream source. |
| `just install-hooks`            | Install local Git hooks with prek.                                  |
| `just check-hooks`              | Run prek checks against all files.                                  |
| `just serve-mockup`             | Serve the static design mockup on port 8765; requires Python 3.     |

The production build writes the browser bundle to `dist/client` and the executable
Node server to `dist/server/index.js`.
