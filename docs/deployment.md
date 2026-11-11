# Deploy on Linux

Use a Linux host with Docker and Compose installed, and a checkout of this repository.
Keep the published port reachable only from your trusted LAN or VPN. Do not
configure router port forwarding or expose the app directly to the internet;
it provides no authentication or TLS. See [runtime and storage](runtime.md).

## Start the service

The Compose file defaults to `platform: linux/arm64`, suitable for a Raspberry Pi
with a 64-bit OS or another ARM64 host. On an x86-64 host, change this setting in
`docker-compose.yml` to `platform: linux/amd64` before building.

From the repository root, create the bind mount and give it to the runtime user
(UID/GID 1000):

```sh
mkdir -p data
sudo chown -R 1000:1000 data
chmod 700 data
docker compose up -d --build
```

Do not run the container as root or make the data directory world-writable. If an
existing mount is root-owned, stop the service, correct its ownership, and start
it again.

To override the default port or container data path, set `PORT` and `DATA_DIR`
in `.env` before starting Compose. See [configuration](configuration.md).

## Check the service

```sh
docker compose ps
curl http://127.0.0.1:8080/api/health
docker compose logs --follow app
```

Use your configured port if it differs from 8080. The logs show startup and
storage errors.

## Upgrade

[Back up the host data directory](backup-and-restore.md) before upgrading. After
updating the checkout, rebuild and restart:

```sh
docker compose up -d --build
```

## Verify packaging

Where Docker and Compose are available, run the disposable arm64 packaging check:

```sh
just test-container
```

This requires [development dependencies](setup.md) and native arm64 or supported
emulation.
