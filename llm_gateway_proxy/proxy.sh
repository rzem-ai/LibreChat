#!/bin/sh
set -eu

TOKEN_FILE_PATH="${TOKEN_FILE_PATH:-/var/run/secrets/kubernetes.io/serviceaccount/token}"
TOKEN_PROXY_TEMPLATE_PATH="${TOKEN_PROXY_TEMPLATE_PATH:-/etc/nginx/templates/proxy.conf.template}"
TOKEN_PROXY_OUTPUT_PATH="${TOKEN_PROXY_OUTPUT_PATH:-/etc/nginx/conf.d/default.conf}"
TOKEN_PROXY_SYNC_SECONDS="${TOKEN_PROXY_SYNC_SECONDS:-30}"
REQUIRED_ENV_VARS="TOKEN_PROXY_AZURE_AU_URL TOKEN_PROXY_AZURE_US_URL TOKEN_PROXY_VERTEXAI_URL TOKEN_PROXY_MCP_URL"

log() { printf '%s [proxy] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

require_env() {
  env_var="$1"
  env_value="$(printenv "$env_var" || true)"

  if [ -n "$env_value" ]; then
    return
  fi

  echo "Missing required env var: $env_var" >&2
  exit 1
}

read_token() {
  if [ ! -r "$TOKEN_FILE_PATH" ]; then
    log "WARN  token file not readable: $TOKEN_FILE_PATH — requests will be forwarded without x-sa-token" >&2
    printf ''
    return
  fi

  tr -d '\r\n' < "$TOKEN_FILE_PATH"
}

render_config() {
  export TOKEN_PROXY_TOKEN="$(read_token)"

  token_len="${#TOKEN_PROXY_TOKEN}"
  if [ "$token_len" -eq 0 ]; then
    log "WARN  token is empty — rendering config with no token; proxy will reject authenticated routes until a token is available" >&2
  else
    log "INFO  token refreshed (length=${token_len})"
  fi

  envsubst '${TOKEN_PROXY_TOKEN} ${TOKEN_PROXY_AZURE_AU_URL} ${TOKEN_PROXY_AZURE_US_URL} ${TOKEN_PROXY_VERTEXAI_URL} ${TOKEN_PROXY_MCP_URL}' \
    < "$TOKEN_PROXY_TEMPLATE_PATH" \
    > "$TOKEN_PROXY_OUTPUT_PATH"
}

for env_var in $REQUIRED_ENV_VARS; do
  require_env "$env_var"
done

log "INFO  starting proxy (sync_interval=${TOKEN_PROXY_SYNC_SECONDS}s, token_file=${TOKEN_FILE_PATH})"
render_config
nginx -t

(
  previous_token="$(read_token)"

  while true; do
    sleep "$TOKEN_PROXY_SYNC_SECONDS"

    current_token="$(read_token)"
    if [ "$current_token" = "$previous_token" ]; then
      continue
    fi

    log "INFO  token changed — reloading nginx config"
    previous_token="$current_token"
    render_config

    if nginx -t; then
      nginx -s reload
      log "INFO  nginx reloaded successfully"
      continue
    fi

    log "ERROR rendered nginx config is invalid; keeping current worker config" >&2
  done
) &

exec nginx -g 'daemon off;'
