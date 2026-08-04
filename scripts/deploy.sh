#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 ghcr.io/owner/image@sha256:digest" >&2
  exit 2
fi

image_ref="$1"
if [[ ! "$image_ref" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]]; then
  echo "Deployment requires an immutable lowercase GHCR image digest." >&2
  exit 2
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_dir="$(cd -- "$script_dir/.." && pwd)"
deploy_dir="${BLOG_DEPLOY_DIR:-/opt/cocynoric-blog}"
backup_dir="${BLOG_BACKUP_DIR:-$deploy_dir/backups}"
deploy_timeout="${BLOG_DEPLOY_TIMEOUT:-120}"

if [[ "$deploy_dir" != /* || "$backup_dir" != /* ]]; then
  echo "BLOG_DEPLOY_DIR and BLOG_BACKUP_DIR must be absolute paths." >&2
  exit 2
fi
if [[ ! "$deploy_timeout" =~ ^[1-9][0-9]*$ ]]; then
  echo "BLOG_DEPLOY_TIMEOUT must be a positive number of seconds." >&2
  exit 2
fi

command -v docker >/dev/null || { echo "docker is not installed." >&2; exit 1; }
docker compose version >/dev/null

umask 077
mkdir -p -- "$deploy_dir/data" "$backup_dir"

environment_file="$deploy_dir/.env"
deployment_file="$deploy_dir/.deploy.env"
previous_deployment_file="$deploy_dir/.deploy.env.previous"
compose_file="$deploy_dir/compose.yaml"

if [[ ! -f "$environment_file" ]]; then
  echo "Missing $environment_file. Copy .env.example there and configure it first." >&2
  exit 1
fi

install -m 0644 "$repository_dir/compose.yaml" "$compose_file"

compose() {
  local command=(docker compose --project-directory "$deploy_dir" --env-file "$environment_file")
  if [[ -f "$deployment_file" ]]; then
    command+=(--env-file "$deployment_file")
  fi
  command+=(-f "$compose_file")
  "${command[@]}" "$@"
}

echo "Pulling $image_ref before stopping the current container..."
docker pull "$image_ref"

container_id="$(compose ps -q blog)"
was_running=false
if [[ -n "$container_id" && "$(docker inspect --format '{{.State.Running}}' "$container_id")" == "true" ]]; then
  was_running=true
  echo "Stopping the current container for a consistent data backup..."
  compose stop --timeout 40 blog
fi

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
backup_file="$backup_dir/data-$timestamp.tar.gz"
echo "Backing up persistent data to $backup_file..."
if ! tar --create --gzip --file "$backup_file" --directory "$deploy_dir/data" .; then
  echo "Data backup failed." >&2
  if [[ "$was_running" == true ]]; then
    echo "Restarting the previous container..." >&2
    compose start blog
  fi
  exit 1
fi

if [[ -f "$deployment_file" ]]; then
  cp -- "$deployment_file" "$previous_deployment_file"
elif [[ -n "$container_id" ]]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "$container_id")"
  printf 'BLOG_IMAGE=%s\n' "$previous_image" >"$previous_deployment_file"
fi

deployment_tmp="$(mktemp "$deploy_dir/.deploy.env.XXXXXX")"
printf 'BLOG_IMAGE=%s\n' "$image_ref" >"$deployment_tmp"
chmod 0600 "$deployment_tmp"
mv -- "$deployment_tmp" "$deployment_file"

echo "Starting the new image and waiting for its health check..."
if ! compose up --detach --remove-orphans --wait --wait-timeout "$deploy_timeout"; then
  echo "Deployment failed. The new container was not healthy." >&2
  echo "Data backup: $backup_file" >&2
  if [[ -f "$previous_deployment_file" ]]; then
    echo "Previous image reference: $(cut -d= -f2- "$previous_deployment_file")" >&2
  fi
  echo "Automatic rollback is intentionally disabled because startup may migrate persistent data." >&2
  exit 1
fi

echo "Deployment succeeded: $image_ref"
echo "Data backup: $backup_file"
