# Set up a development environment

Install Node 22 (pinned in `.nvmrc`), [just](https://just.systems/), and
[prek](https://prek.j178.dev/) using the package managers recommended for your
platform. If you use nvm, select the pinned Node version first:

```sh
nvm use
```

From the repository root, install dependencies from the committed lockfile and
install the local Git hooks:

```sh
just install
just install-hooks
```

Install the Playwright browsers before running browser tests:

```sh
just install-browsers
```

On Linux, include Playwright's system packages if they are not already installed:

```sh
just install-browsers --with-deps
```

Start the client and API together, then open `http://127.0.0.1:5173`:

```sh
just serve
```

Continue with [developing and verifying changes](development.md).
