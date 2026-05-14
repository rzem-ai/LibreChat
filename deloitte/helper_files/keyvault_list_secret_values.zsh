#!/usr/bin/env zsh
set -euo pipefail

KEY_VAULT_NAME=""
OUTPUT_FILE_PATH="secrets.json"
HTTPS_PROXY_VALUE=""
HTTP_PROXY_VALUE=""
THROTTLE_LIMIT=10

usage() {
  cat <<'EOF'
Usage:
  ./deloitte/helper_files/keyvault_list_secret_values.zsh --vault-name <KEY_VAULT_NAME> [options]

Options:
  --output-file <path>       Output JSON file path (default: secrets.json)
  --https-proxy <url>        Optional HTTPS proxy URL
  --http-proxy <url>         Optional HTTP proxy URL
  --throttle-limit <number>  Parallel retrieval limit (default: 10)
  -h, --help                 Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault-name)
      KEY_VAULT_NAME="${2:-}"
      shift 2
      ;;
    --output-file)
      OUTPUT_FILE_PATH="${2:-}"
      shift 2
      ;;
    --https-proxy)
      HTTPS_PROXY_VALUE="${2:-}"
      shift 2
      ;;
    --http-proxy)
      HTTP_PROXY_VALUE="${2:-}"
      shift 2
      ;;
    --throttle-limit)
      THROTTLE_LIMIT="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$KEY_VAULT_NAME" ]]; then
  echo "Missing required argument: --vault-name" >&2
  usage
  exit 1
fi

if ! [[ "$THROTTLE_LIMIT" == <-> ]] || (( THROTTLE_LIMIT < 1 )); then
  echo "--throttle-limit must be an integer greater than 0" >&2
  exit 1
fi

if [[ -n "$HTTPS_PROXY_VALUE" ]]; then
  export HTTPS_PROXY="$HTTPS_PROXY_VALUE"
fi

if [[ -n "$HTTP_PROXY_VALUE" ]]; then
  export HTTP_PROXY="$HTTP_PROXY_VALUE"
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI (az) is required but was not found in PATH." >&2
  exit 1
fi

check_azure_login() {
  az account show --output none >/dev/null 2>&1 || return 1
  az keyvault show --name "$KEY_VAULT_NAME" --output none >/dev/null 2>&1
}

if ! check_azure_login; then
  echo "Not logged in or no access to vault '$KEY_VAULT_NAME'. Logging in now..."
  az login --allow-no-subscriptions --output none >/dev/null
else
  echo "Already logged in and vault is accessible."
fi

if ! secret_names_raw="$(az keyvault secret list --vault-name "$KEY_VAULT_NAME" --query "[].name" --output tsv)"; then
  echo "Failed to list secrets for vault '$KEY_VAULT_NAME'." >&2
  exit 1
fi

typeset -a secret_names
if [[ -n "$secret_names_raw" ]]; then
  secret_names=("${(@f)secret_names_raw}")
else
  secret_names=()
  echo "No secrets found in '$KEY_VAULT_NAME'."
fi

echo "Retrieving ${#secret_names[@]} secrets in parallel..."

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

fetch_secret() {
  local secret_name="$1"
  local output_file="$2"
  local secret_value=""

  if secret_value="$(az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$secret_name" --query "value" --output tsv 2>/dev/null)"; then
    python3 - "$secret_name" "$secret_value" > "$output_file" <<'PY'
import json
import sys

print(json.dumps({"name": sys.argv[1], "value": sys.argv[2]}))
PY
    echo "Retrieved: '$secret_name'"
  else
    echo "Warning: Failed to retrieve secret: $secret_name" >&2
    return 1
  fi
}

integer index=0
for secret_name in "${secret_names[@]}"; do
  index=$((index + 1))
  fetch_secret "$secret_name" "$tmp_dir/$index.json" &

  while (( $(jobs -pr | wc -l | tr -d ' ') >= THROTTLE_LIMIT )); do
    wait -n || true
  done
done

wait || true

typeset -a secret_files
secret_files=("$tmp_dir"/*.json(N))
echo "Successfully retrieved ${#secret_files[@]} secrets"

output_directory="${OUTPUT_FILE_PATH:h}"
if [[ -n "$output_directory" && ! -d "$output_directory" ]]; then
  echo "Creating directory: $output_directory"
  mkdir -p "$output_directory"
fi

python3 - "$OUTPUT_FILE_PATH" "${secret_files[@]}" <<'PY'
import json
import sys

output_file = sys.argv[1]
secret_files = sys.argv[2:]
secrets = []

for path in secret_files:
  with open(path, "r", encoding="utf-8") as handle:
    secrets.append(json.loads(handle.read()))

with open(output_file, "w", encoding="utf-8") as handle:
  json.dump(secrets, handle, indent=2)
  handle.write("\n")
PY

echo "Secrets have been written to $OUTPUT_FILE_PATH"

