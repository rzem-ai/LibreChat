#!/bin/sh
set -eu

TOKEN_FILE_PATH="${TOKEN_FILE_PATH:-/var/run/secrets/kubernetes.io/serviceaccount/token}"
TOKEN_PROXY_TEMPLATE_PATH="${TOKEN_PROXY_TEMPLATE_PATH:-/etc/nginx/templates/proxy.conf.template}"
TOKEN_PROXY_OUTPUT_PATH="${TOKEN_PROXY_OUTPUT_PATH:-/etc/nginx/conf.d/default.conf}"
TOKEN_PROXY_SYNC_SECONDS="${TOKEN_PROXY_SYNC_SECONDS:-30}"
REQUIRED_ENV_VARS="TOKEN_PROXY_AZURE_AU_URL TOKEN_PROXY_AZURE_US_URL TOKEN_PROXY_VERTEXAI_URL TOKEN_PROXY_MCP_URL"

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

    printf ''
    return
  fi

  tr -d '\r\n' < "$TOKEN_FILE_PATH"
}

render_config() {
  export TOKEN_PROXY_TOKEN="$(read_token)"

  envsubst '${TOKEN_PROXY_TOKEN} ${TOKEN_PROXY_AZURE_AU_URL} ${TOKEN_PROXY_AZURE_US_URL} ${TOKEN_PROXY_VERTEXAI_URL} ${TOKEN_PROXY_MCP_URL}' \
    < "$TOKEN_PROXY_TEMPLATE_PATH" \
    > "$TOKEN_PROXY_OUTPUT_PATH"
}

for env_var in $REQUIRED_ENV_VARS; do
  require_env "$env_var"
done


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


    previous_token="$current_token"
    render_config

    if nginx -t; then
      nginx -s reload

      continue
    fi

    echo "Rendered nginx config is invalid; keeping current worker config" >&2
  done
) &

exec nginx -g 'daemon off;'