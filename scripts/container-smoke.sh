#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PROJECT="frosthaven-smoke-$$"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
OVERRIDE_FILE=$(mktemp)
HOST_DATA_DIR=$(mktemp -d)
PORT=${SMOKE_PORT:-18080}
export HOST_IP=127.0.0.1
export PORT
export DATA_DIR=/data
IMAGE="frosthaven-deck-builder:smoke-$$"
BASE_URL="http://127.0.0.1:${PORT}"
HOST_UID=$(id -u)
HOST_GID=$(id -g)
response_file=""

cleanup() {
  if command -v docker >/dev/null 2>&1 && docker image inspect "$IMAGE" >/dev/null 2>&1; then
    docker run --rm --user 0 --volume "$HOST_DATA_DIR:/data" "$IMAGE" \
      chown -R "$HOST_UID:$HOST_GID" /data 2>/dev/null || true
  fi
  chmod u+rwx "$HOST_DATA_DIR" 2>/dev/null || true
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" down --remove-orphans 2>/dev/null || true
  rm -f "$OVERRIDE_FILE" "$response_file"
  rm -rf "$HOST_DATA_DIR"
}
trap cleanup EXIT

for required_file in Dockerfile .dockerignore docker-compose.yml; do
  if [[ ! -f "$ROOT_DIR/$required_file" ]]; then
    echo "Missing required packaging file: $required_file" >&2
    exit 1
  fi
done

cat >"$OVERRIDE_FILE" <<EOF
services:
  app:
    image: $IMAGE
    volumes:
      - "${HOST_DATA_DIR}:/data"
EOF

cd "$ROOT_DIR"
compose_config=$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" config --format json)
[[ "$(jq -r '.services.app.ports | length' <<<"$compose_config")" == "1" ]]
[[ "$(jq -r '.services.app.ports[0].host_ip' <<<"$compose_config")" == "127.0.0.1" ]]
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" build app
docker run --rm --user 0 --volume "$HOST_DATA_DIR:/data" "$IMAGE" chown 1000:1000 /data
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" up -d --force-recreate app

wait_for_health() {
  local container_id=""
  local health_status="missing"
  for _ in $(seq 1 60); do
    container_id=$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" ps -q --all app || true)
    if [[ -n "$container_id" ]] && curl --fail --silent "$BASE_URL/api/health" >/dev/null; then
      health_status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_id" || true)
      if [[ "$health_status" == "healthy" ]]; then
        return 0
      fi
    fi
    sleep 1
  done
  echo "Container did not become healthy (status: $health_status)" >&2
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" ps --all >&2 || true
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" logs >&2 || true
  if [[ -n "$container_id" ]]; then
    docker inspect "$container_id" >&2 || true
  fi
  return 1
}

wait_for_health
echo "Container healthcheck passed"
runtime_user=$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app id -un)
runtime_uid=$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app id -u)
echo "Container runtime user: ${runtime_user@Q} (${runtime_uid@Q})"
[[ "$runtime_user" == "node" ]]
[[ "$runtime_uid" == "1000" ]]
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  test -f /app/dist/server/index.js
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  test -f /app/dist/shared/data/characters/SD.json
echo "Built server and catalog are present"
curl --fail --silent "$BASE_URL/" | grep -Fq "Frosthaven"
curl --fail --silent "$BASE_URL/cards/SD/fh-snowball.jpeg" >/dev/null
curl --fail --silent "$BASE_URL/icons/SD.png" >/dev/null
echo "Built frontend and local assets are reachable"

DATA='{"schemaVersion":1,"revision":0,"builds":[]}'
REQUEST="{\"baseRevision\":0,\"data\":$DATA}"
response_file=$(mktemp)
status=$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
  --request PUT "$BASE_URL/api/data" \
  --header 'content-type: application/json' \
  --data "$REQUEST")
echo "Initial data write: HTTP $status $(cat "$response_file")"
[[ "$status" == "200" ]]
grep -Fq '"revision":1' "$response_file"
DATA='{"schemaVersion":1,"revision":1,"builds":[]}'
REQUEST="{\"baseRevision\":1,\"data\":$DATA}"
status=$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
  --request PUT "$BASE_URL/api/data" \
  --header 'content-type: application/json' \
  --data "$REQUEST")
echo "Backup-triggering data write: HTTP $status $(cat "$response_file")"
[[ "$status" == "200" ]]
grep -Fq '"revision":2' "$response_file"
rm -f "$response_file"
[[ "$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  find /data/backups -maxdepth 1 -type f -name 'appdata-*.json' | wc -l)" -eq 1 ]]
[[ "$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  stat -c '%u:%g' /data/appdata.json)" == "1000:1000" ]]
backup_file=$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  find /data/backups -maxdepth 1 -type f -name 'appdata-*.json' -print -quit)
[[ "$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  stat -c '%u:%g' "$backup_file")" == "1000:1000" ]]

# Recreating the service must retain both appdata.json and its predecessor backup.
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" up -d --force-recreate app
wait_for_health
curl --fail --silent "$BASE_URL/api/data" | grep -Fq '"revision":2'
[[ "$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  find /data/backups -maxdepth 1 -type f -name 'appdata-*.json' | wc -l)" -eq 1 ]]

# A mount without directory write permission must fail explicitly rather than reset data.
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" down --remove-orphans
docker run --rm --user 0 --volume "$HOST_DATA_DIR:/data" "$IMAGE" chmod a-w /data
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" up -d app
wait_for_health
current_data_checksum=$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  sha256sum /data/appdata.json | awk '{print $1}')
predecessor_checksum=$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  sha256sum "$backup_file" | awk '{print $1}')
status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request PUT "$BASE_URL/api/data" \
  --header 'content-type: application/json' \
  --data '{"baseRevision":2,"data":{"schemaVersion":1,"revision":2,"builds":[]}}' || true)
[[ "$status" == "500" ]]
[[ "$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  sha256sum /data/appdata.json | awk '{print $1}')" == "$current_data_checksum" ]]
[[ "$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  sha256sum "$backup_file" | awk '{print $1}')" == "$predecessor_checksum" ]]

echo "Container smoke test passed"
