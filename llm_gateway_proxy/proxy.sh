#!/bin/sh
set -eu

TOKEN_FILE_PATH="${TOKEN_FILE_PATH:-/var/run/secrets/kubernetes.io/serviceaccount/token}"
TOKEN_PROXY_TEMPLATE_PATH="${TOKEN_PROXY_TEMPLATE_PATH:-/etc/nginx/templates/proxy.conf.template}"
TOKEN_PROXY_OUTPUT_PATH="${TOKEN_PROXY_OUTPUT_PATH:-/etc/nginx/conf.d/default.conf}"
TOKEN_PROXY_SYNC_SECONDS="${TOKEN_PROXY_SYNC_SECONDS:-30}"
REQUIRED_ENV_VARS="TOKEN_PROXY_AZURE_AU_URL TOKEN_PROXY_AZURE_US_URL TOKEN_PROXY_AZURE_GLOBAL_URL TOKEN_PROXY_AZURE_FOUNDRY_AU_URL TOKEN_PROXY_VERTEXAI_URL TOKEN_PROXY_ANTHROPIC_URL TOKEN_PROXY_BEDROCK_AU_URL TOKEN_PROXY_MCP_URL"

log() {
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '%s [llm-gateway-proxy] %s\n' "$timestamp" "$*"
}

require_env() {
  env_var="$1"
  env_value="$(printenv "$env_var" || true)"

  if [ -n "$env_value" ]; then
    return
  fi

  log "Missing required env var: $env_var"
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

  if [ -n "$TOKEN_PROXY_TOKEN" ]; then
    log "Rendering nginx config (service account token detected, length=${#TOKEN_PROXY_TOKEN})."
  else
    log "Rendering nginx config (service account token unavailable)."
  fi

  envsubst '${TOKEN_PROXY_TOKEN} ${TOKEN_PROXY_AZURE_AU_URL} ${TOKEN_PROXY_AZURE_US_URL} ${TOKEN_PROXY_AZURE_GLOBAL_URL} ${TOKEN_PROXY_AZURE_FOUNDRY_AU_URL} ${TOKEN_PROXY_VERTEXAI_URL} ${TOKEN_PROXY_ANTHROPIC_URL} ${TOKEN_PROXY_BEDROCK_AU_URL} ${TOKEN_PROXY_MCP_URL} ${NGINX_RESOLVER}' \
    < "$TOKEN_PROXY_TEMPLATE_PATH" \
    > "$TOKEN_PROXY_OUTPUT_PATH"

  log "Wrote rendered config to $TOKEN_PROXY_OUTPUT_PATH."
}

for env_var in $REQUIRED_ENV_VARS; do
  require_env "$env_var"
  log "Validated required env var: $env_var."
done

log "Starting proxy with sync interval ${TOKEN_PROXY_SYNC_SECONDS}s."
log "Configured upstreams: AzureAU=$TOKEN_PROXY_AZURE_AU_URL AzureUS=$TOKEN_PROXY_AZURE_US_URL AzureGlobal=$TOKEN_PROXY_AZURE_GLOBAL_URL AzureFoundryAU=$TOKEN_PROXY_AZURE_FOUNDRY_AU_URL VertexAI=$TOKEN_PROXY_VERTEXAI_URL AnthropicGlobal=$TOKEN_PROXY_ANTHROPIC_URL BedrockAU=$TOKEN_PROXY_BEDROCK_AU_URL MCP=$TOKEN_PROXY_MCP_URL"

# Derive the DNS resolver from the pod's /etc/resolv.conf so the nginx resolver
# directive works on any Kubernetes cluster without hardcoding an IP address.
# Falls back to 127.0.0.11 (Docker's embedded DNS) for local dev environments.
NGINX_RESOLVER="$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf 2>/dev/null || true)"
if [ -z "$NGINX_RESOLVER" ]; then
  log "WARNING: could not determine DNS resolver from /etc/resolv.conf; defaulting to 127.0.0.11"
  NGINX_RESOLVER="127.0.0.11"
fi
# nginx requires IPv6 addresses in the resolver directive to be bracketed
# (e.g. [fd00::10]), otherwise it parses the colon as a port separator and
# fails to start. IPv4 addresses must NOT be bracketed.
case "$NGINX_RESOLVER" in
  *:*) NGINX_RESOLVER="[$NGINX_RESOLVER]" ;;
esac
log "Resolved DNS nameserver for nginx resolver directive: $NGINX_RESOLVER"
export NGINX_RESOLVER

render_config
if nginx -t; then
  log "nginx config test succeeded."
else
  log "nginx config test failed."
  exit 1
fi

(
  previous_token="$(read_token)"

  while true; do
    sleep "$TOKEN_PROXY_SYNC_SECONDS"

    current_token="$(read_token)"
    if [ "$current_token" = "$previous_token" ]; then
      continue
    fi

    log "Service account token change detected; re-rendering nginx config."

    previous_token="$current_token"
    render_config

    if nginx -t; then
      nginx -s reload
      log "Reloaded nginx after token update."

      continue
    fi

    log "Rendered nginx config is invalid; keeping current worker config."
  done
) &

log "Launching nginx in foreground."
exec nginx -g 'daemon off;'
