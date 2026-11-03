#!/bin/bash
# Deloitte Custom File
#
# Usage: ./quickstart.sh [--overwrite=true|false] [--first-build] [--skip-docker]
# Defaults: --overwrite=true, --first-build (off), --skip-docker (off)
#
# Args:
#   overwrite (default: true): Replace existing .env and Caddyfile; false keeps them.
#   first-build (default: off): Build docker images before starting (~10 minutes).
#   skip-docker (default: off): Only prepare files; don't touch containers (npm runs).
#
# You are prompted for your token without it being echoed. Passing the token as an argument
# (./quickstart.sh [options] <token>) still works for non-interactive use, but it can end up in
# your shell history.
#
# 1. Writes the token into the personal secrets (.secrets/.personal-secrets)
# 2. Copies .env.deloitte to .env (skipped when --overwrite=false and .env exists)
# 3. Populates .env from .secrets/.personal-secrets and .secrets/.shared-secrets
# 4. Sets DOMAIN_CLIENT, DOMAIN_SERVER, ADMIN_PANEL_URL and VITE_API_BASE_URL from `hostname`
#    and generates Caddyfile from Caddyfile.deloitte.example for this host
# 5. Force-recreates the api container, then starts everything else with `docker compose up -d`
#    (images are only built with --first-build, which runs `docker compose build` before starting
#    and can take ~10 minutes; otherwise build commands are printed at the end).
#    Skipped entirely with --skip-docker (only the files are prepared, for npm runs)

set -euo pipefail

cd "$(dirname "$0")"

TOKEN_URL="https://login.microsoftonline.com/36da45f1-dd2c-4d1f-af13-5abe46b99921/oauth2/v2.0/authorize?client_id=498ce9fd-195b-40c5-82f1-8fc4a6d00d88&response_type=id_token&redirect_uri=https%3A%2F%2Fjwt.ms&scope=openid%20profile%20email%20https%3A%2F%2Fgraph.microsoft.com%2FUser.Read&response_mode=fragment&state=random_state&nonce=random_nonce"
SECRETS_DIR=".secrets"
PERSONAL_FILE="$SECRETS_DIR/.personal-secrets"
SHARED_FILE="$SECRETS_DIR/.shared-secrets"
SOURCE_ENV=".env.deloitte"
CADDY_EXAMPLE="Caddyfile.deloitte.example"
CADDY_FILE="Caddyfile"
TARGET_ENV=".env"
TOKEN_KEYS=(ANTHROPIC_API_KEY LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION RAG_OPENAI_API_KEY)

OVERWRITE=true
FIRST_BUILD=false
SKIP_DOCKER=false
TOKEN=""

die() {
  echo "ERROR: $*" >&2
  exit 1
}

usage() {
  echo "Usage: $0 [--overwrite=true|false] [--first-build] [--skip-docker]" >&2
}

for arg in "$@"; do
  case "$arg" in
    --overwrite=true) OVERWRITE=true ;;
    --overwrite=false) OVERWRITE=false ;;
    --first-build) FIRST_BUILD=true ;;
    --skip-docker) SKIP_DOCKER=true ;;
    --overwrite=*) usage; die "--overwrite must be 'true' or 'false'" ;;
    -*) usage; die "Unknown option: $arg" ;;
    *) [ -z "$TOKEN" ] || die "Only one token argument is allowed"; TOKEN="$arg" ;;
  esac
done

if [ "$SKIP_DOCKER" = true ] && [ "$FIRST_BUILD" = true ]; then
  usage
  die "--skip-docker and --first-build cannot be combined"
fi

if [ -n "$TOKEN" ]; then
  echo "WARNING: passing the token as an argument can save it in your shell history." >&2
  echo "         Run without an argument to be prompted securely instead." >&2
elif [ -t 0 ]; then
  echo "Fetch an ID token here (sign in, then copy the whole id_token value):"
  echo "  $TOKEN_URL"
  # -n switches the terminal out of line mode: a long token would otherwise be cut at the 1024-byte line limit.
  IFS= read -rs -n 8192 -p "Paste your token (input is hidden), then press Enter: " TOKEN
  echo
fi

if [ -z "$TOKEN" ]; then
  usage
  echo "ERROR: No token provided. Fetch one here (sign in, then copy the whole id_token value, paste it here - note it will NOT be visible, just hit enter):" >&2
  echo "  $TOKEN_URL" >&2
  exit 1
fi

# Replace KEY=... lines in <target> with the values from <source> (KEY=VALUE lines);
# keys not present in <target> are appended. Values are read from a file, never
# interpolated, so special characters (|, &, \, quotes) are preserved verbatim.
apply_secrets() {
  local target="$1" source="$2" tmp
  tmp="$(mktemp "$target.XXXXXX")"
  awk '
    NR == FNR {
      if ($0 ~ /^[A-Za-z_][A-Za-z0-9_]*=/) {
        i = index($0, "=")
        k = substr($0, 1, i - 1)
        vals[k] = $0
        order[++n] = k
      }
      next
    }
    {
      if ($0 ~ /^[A-Za-z_][A-Za-z0-9_]*=/) {
        k = substr($0, 1, index($0, "=") - 1)
        if (k in vals) { print vals[k]; done[k] = 1; next }
      }
      print
    }
    END {
      for (j = 1; j <= n; j++) if (!(order[j] in done)) print vals[order[j]]
    }
  ' "$source" "$target" > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$target"
}

# Echo the value of KEY from FILE (everything after the first '='), empty if absent.
secret_value() {
  local key="$1" file="$2" line
  line="$(grep -m1 "^${key}=" "$file" || true)"
  printf '%s' "${line#*=}"
}

# Ensure every key listed in <file>.example exists in <file> with a non-empty value.
validate_secrets() {
  local file="$1" example="$1.example" key missing=()
  [ -f "$file" ] || die "$file not found. Copy $example to $file and fill it in."
  [ -f "$example" ] || die "$example not found."
  while IFS= read -r key || [ -n "$key" ]; do
    key="${key%%=*}"
    [ -z "$key" ] && continue
    [ -n "$(secret_value "$key" "$file")" ] || missing+=("$key")
  done < "$example"
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "ERROR: Missing secrets in $file:" >&2
    printf '  - %s\n' "${missing[@]}" >&2
    exit 1
  fi
}

umask 077

echo "[1/5] Updating token in $PERSONAL_FILE"
if [ ! -f "$PERSONAL_FILE" ]; then
  mkdir -p "$SECRETS_DIR"
  : > "$PERSONAL_FILE"
  echo "      Created empty $PERSONAL_FILE"
fi
token_tmp="$(mktemp)"
trap 'rm -f "$token_tmp"' EXIT
for key in "${TOKEN_KEYS[@]}"; do
  printf '%s=%s\n' "$key" "$TOKEN" >> "$token_tmp"
done
apply_secrets "$PERSONAL_FILE" "$token_tmp"

echo "[2/5] Preparing $TARGET_ENV from $SOURCE_ENV"
[ -f "$SOURCE_ENV" ] || die "$SOURCE_ENV not found."
validate_secrets "$PERSONAL_FILE"
validate_secrets "$SHARED_FILE"
WORK_ENV="$TARGET_ENV"
env_tmp=""
if [ "$OVERWRITE" = true ] || [ ! -f "$TARGET_ENV" ]; then
  env_tmp="$(mktemp "$TARGET_ENV.XXXXXX")"
  trap 'rm -f "$token_tmp" "$env_tmp"' EXIT
  cp "$SOURCE_ENV" "$env_tmp"
  chmod 600 "$env_tmp"
  WORK_ENV="$env_tmp"
  echo "      Prepared new $TARGET_ENV (written once secrets and URLs are applied)"
else
  echo "      Keeping existing $TARGET_ENV (--overwrite=false)"
fi

echo "[3/5] Populating $TARGET_ENV with secrets"
apply_secrets "$WORK_ENV" "$PERSONAL_FILE"
apply_secrets "$WORK_ENV" "$SHARED_FILE"

echo "[4/5] Setting host URLs in $TARGET_ENV and preparing $CADDY_FILE"
HOST_NAME="$(hostname)"
HOST_NAME="${HOST_NAME%.local}"
BASE_URL="https://${HOST_NAME}.local"
urls_tmp="$(mktemp)"
trap 'rm -f "$token_tmp" "$env_tmp" "$urls_tmp"' EXIT
printf '%s\n' \
  "DOMAIN_CLIENT=$BASE_URL" \
  "DOMAIN_SERVER=$BASE_URL" \
  "ADMIN_PANEL_URL=$BASE_URL/admin" \
  "VITE_API_BASE_URL=$BASE_URL" > "$urls_tmp"
apply_secrets "$WORK_ENV" "$urls_tmp"
if [ -n "$env_tmp" ]; then
  mv "$env_tmp" "$TARGET_ENV"
  echo "      Created $TARGET_ENV"
fi
CADDY_CHANGED=false
if [ "$OVERWRITE" = true ] || [ ! -f "$CADDY_FILE" ]; then
  [ -f "$CADDY_EXAMPLE" ] || die "$CADDY_EXAMPLE not found."
  sed "s/YOURHOSTNAME/${HOST_NAME}/g" "$CADDY_EXAMPLE" > "$CADDY_FILE"
  CADDY_CHANGED=true
  echo "      Created $CADDY_FILE for ${HOST_NAME}.local"
elif ! grep -q "^${HOST_NAME}\.local" "$CADDY_FILE"; then
  echo "WARNING: $CADDY_FILE has no '${HOST_NAME}.local' site block, so $BASE_URL won't be served." >&2
  echo "         Re-run with --overwrite=true or add one (see $CADDY_EXAMPLE)." >&2
else
  echo "      Keeping existing $CADDY_FILE (--overwrite=false)"
fi

if [ "$SKIP_DOCKER" = true ]; then
  echo "[5/5] Skipping containers (--skip-docker)"
else
  echo "[5/5] Starting containers"
  if [ "$FIRST_BUILD" = true ]; then
    echo "      Building images for the first time -- this can take ~10 minutes..."
    docker compose build
  fi
  docker compose up -d --force-recreate api
  docker compose up -d
  [ "$CADDY_CHANGED" = false ] || docker compose restart caddy

  if [ "$FIRST_BUILD" = true ]; then
    BUILD_NOTE="Images were built for the first time (--first-build)."
  else
    BUILD_NOTE="NO images were rebuilt: api, admin-panel and rag_api are running their existing images."
  fi
  echo
  echo "The api container was force-recreated and all other containers were started."
  echo "$BUILD_NOTE"
  cat <<'EOF'

If you have pulled new code or packages, rebuild what changed using the guidance below.

  api (main app container)
    Code changes only:
      docker compose build api && docker compose up -d --force-recreate api
    Package/dependency changes:
      docker compose build --no-cache api && docker compose up -d --force-recreate api

  admin-panel:
    Code changes only:
      docker compose build admin-panel && docker compose up -d --force-recreate admin-panel
    Without cache:
      docker compose build --no-cache admin-panel && docker compose up -d --force-recreate admin-panel

  rag-api:
    Code changes only:
      docker compose build rag_api && docker compose up -d --force-recreate rag_api
    Package/dependency changes:
      docker compose build --no-cache rag_api && docker compose up -d --force-recreate rag_api

Changes to .env or the .secrets files alone need no build; re-run this script instead.
EOF
fi
APP_TITLE="$(secret_value APP_TITLE "$TARGET_ENV")"
APP_TITLE="${APP_TITLE%\"}"
APP_TITLE="${APP_TITLE#\"}"
echo
echo "${APP_TITLE:-LibreChat}: $BASE_URL"
echo "Admin panel: $BASE_URL/admin"
