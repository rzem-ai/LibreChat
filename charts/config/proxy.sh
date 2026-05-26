#!/bin/sh
set -eu

TOKEN_FILE_PATH="${TOKEN_FILE_PATH:-/var/run/secrets/kubernetes.io/serviceaccount/token}"
TOKEN_PROXY_TEMPLATE_PATH="${TOKEN_PROXY_TEMPLATE_PATH:-/etc/nginx/templates/proxy.conf}"
TOKEN_PROXY_OUTPUT_PATH="${TOKEN_PROXY_OUTPUT_PATH:-/etc/nginx/conf.d/default.conf}"
TOKEN_PROXY_SYNC_SECONDS="${TOKEN_PROXY_SYNC_SECONDS:-30}"
TOKEN_PROXY_NGINX_PID_PATH="${TOKEN_PROXY_NGINX_PID_PATH:-/tmp/nginx/nginx.pid}"

required_env_vars="TOKEN_PROXY_AZURE_AU_URL TOKEN_PROXY_AZURE_US_URL TOKEN_PROXY_VERTEXAI_URL TOKEN_PROXY_MCP_URL"

for env_var in $required_env_vars; do
  if [ -z "$(printenv "$env_var" || true)" ]; then
    echo "Missing required env var: $env_var" >&2
    exit 1
  fi
done

read_token() {
  if [ -r "$TOKEN_FILE_PATH" ]; then
    tr -d '\r\n' < "$TOKEN_FILE_PATH"
    return
  fi

  echo ""
}

render_config() {
  TOKEN_PROXY_TOKEN="$(read_token)" \
    envsubst '${TOKEN_PROXY_TOKEN} ${TOKEN_PROXY_AZURE_AU_URL} ${TOKEN_PROXY_AZURE_US_URL} ${TOKEN_PROXY_VERTEXAI_URL} ${TOKEN_PROXY_MCP_URL}' \
    < "$TOKEN_PROXY_TEMPLATE_PATH" > "$TOKEN_PROXY_OUTPUT_PATH"
}

mkdir -p "$(dirname "$TOKEN_PROXY_OUTPUT_PATH")" "$(dirname "$TOKEN_PROXY_NGINX_PID_PATH")"

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
      nginx -g "pid ${TOKEN_PROXY_NGINX_PID_PATH};" -s reload
    else
      echo "Rendered nginx config is invalid; keeping current worker config" >&2
    fi
  done
) &

exec nginx -g "pid ${TOKEN_PROXY_NGINX_PID_PATH}; daemon off;"
