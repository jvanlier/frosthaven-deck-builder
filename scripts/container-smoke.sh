#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PROJECT="frosthaven-smoke-$$"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
OVERRIDE_FILE=$(mktemp)
DATA_DIR=$(mktemp -d)
PORT=${SMOKE_PORT:-18080}
IMAGE="frosthaven-deck-builder:smoke-$$"
BASE_URL="http://127.0.0.1:${PORT}"
HOST_UID=$(id -u)
HOST_GID=$(id -g)

cleanup() {
  if command -v docker >/dev/null 2>&1 && docker image inspect "$IMAGE" >/dev/null 2>&1; then
    docker run --rm --user 0 --volume "$DATA_DIR:/data" "$IMAGE" \
      chown -R "$HOST_UID:$HOST_GID" /data 2>/dev/null || true
  fi
  chmod u+rwx "$DATA_DIR" 2>/dev/null || true
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" down --remove-orphans 2>/dev/null || true
  rm -f "$OVERRIDE_FILE"
  rm -rf "$DATA_DIR"
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
    ports:
      - "127.0.0.1:${PORT}:8080"
    volumes:
      - "${DATA_DIR}:/data"
    environment:
      PORT: "8080"
      DATA_DIR: /data
EOF

cd "$ROOT_DIR"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" build app
docker run --rm --user 0 --volume "$DATA_DIR:/data" "$IMAGE" chown 1000:1000 /data
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
[[ "$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app id -un)" == "node" ]]
[[ "$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app id -u)" == "1000" ]]
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  test -f /app/dist/server/index.js
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" exec -T app \
  test -f /app/dist/shared/data/characters/SD.json
curl --fail --silent "$BASE_URL/" | grep -Fq "Frosthaven"
curl --fail --silent "$BASE_URL/cards/SD/fh-snowball.jpeg" >/dev/null
curl --fail --silent "$BASE_URL/icons/SD.png" >/dev/null

DATA='{"schemaVersion":1,"revision":0,"builds":[]}'
curl --fail --silent --request PUT "$BASE_URL/api/data" \
  --header 'content-type: application/json' \
  --data "$DATA" | grep -Fq '"revision":1'
DATA='{"schemaVersion":1,"revision":1,"builds":[]}'
curl --fail --silent --request PUT "$BASE_URL/api/data" \
  --header 'content-type: application/json' \
  --data "$DATA" | grep -Fq '"revision":2'
[[ "$(find "$DATA_DIR/backups" -maxdepth 1 -type f -name 'appdata-*.json' | wc -l)" -eq 1 ]]
[[ "$(stat -c '%u:%g' "$DATA_DIR/appdata.json")" == "1000:1000" ]]
backup_file=$(find "$DATA_DIR/backups" -maxdepth 1 -type f -name 'appdata-*.json' -print -quit)
[[ "$(stat -c '%u:%g' "$backup_file")" == "1000:1000" ]]

# Recreating the service must retain both appdata.json and its predecessor backup.
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" up -d --force-recreate app
wait_for_health
curl --fail --silent "$BASE_URL/api/data" | grep -Fq '"revision":2'
[[ "$(find "$DATA_DIR/backups" -maxdepth 1 -type f -name 'appdata-*.json' | wc -l)" -eq 1 ]]

# A mount without directory write permission must fail explicitly rather than reset data.
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" down --remove-orphans
docker run --rm --user 0 --volume "$DATA_DIR:/data" "$IMAGE" chmod a-w /data
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" up -d app
wait_for_health
status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request PUT "$BASE_URL/api/data" \
  --header 'content-type: application/json' \
  --data '{"schemaVersion":1,"revision":2,"builds":[]}' || true)
[[ "$status" == "500" ]]

echo "Container smoke test passed"
