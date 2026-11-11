# Back up and restore data

These commands assume the repository's Compose setup and its `./data` host bind
mount. Run them from the repository root.

## Back up the host data

Host-level backups are the operator's responsibility. Include `data/appdata.json`
and `data/backups/`, and keep a copy on a separate host or backup device.

Stop writes before making an archive, then start the service again:

```sh
docker compose stop
tar -C . -czf frosthaven-data-$(date +%Y%m%d).tar.gz data
docker compose start
```

Copy the archive to your separate backup location.

## Restore an exported JSON file

Use the app's import action to recover an exported JSON file.

## Restore a predecessor backup

Preserve the existing data directory as a separate host backup before replacing
anything. Stop the service:

```sh
docker compose stop
```

Choose a file from `data/backups/appdata-*.json` and copy it over
`data/appdata.json`. Restore ownership and start the service:

```sh
sudo chown 1000:1000 data/appdata.json
docker compose start
```

Check the [service health and logs](deployment.md#check-the-service).
