# Runtime and storage

The app is a local, single-user planner intended to run on a Linux host on a
trusted LAN or VPN. It provides no authentication, TLS, or offline editing.
The browser uses a local API to save builds; character catalogs and artwork are
served locally too.

Development keeps builds and backups in a gitignored `./data/` directory. The
production server defaults to `/data`, which Compose mounts from the host's
`./data` directory. This keeps saved data outside the container so it survives
rebuilds and recreation. See [configuration](configuration.md) for overrides.

The multi-stage `node:22-alpine` image contains only production dependencies and
the built server and client assets. It runs as the non-root `node` user.

Application data lives in `appdata.json`, with predecessor backups under
`backups/`. Those backups share the data mount; an independent copy on another host or backup device is
still needed for host or disk failure. See [backup and restore](backup-and-restore.md).
