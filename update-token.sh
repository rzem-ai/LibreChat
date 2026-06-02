#!/bin/bash
# Usage: ./update-token.sh <new_jwt_token>
# Updates LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION, ANTHROPIC_API_KEY, RAG_OPENAI_API_KEY, and OPENAI_API_KEY in .env,
# then restarts the affected containers.

set -e

if [ -z "${1:-}" ]; then
  read -r -s -p "Enter new JWT token: " NEW_TOKEN
  echo
else
  NEW_TOKEN="$1"
fi

ENV_FILE="$(dirname "$0")/.env"

sed -i '' \
  "s|^LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION=.*|LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION=${NEW_TOKEN}|" \
  "$ENV_FILE"

sed -i '' \
  "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${NEW_TOKEN}|" \
  "$ENV_FILE"

sed -i '' \
  "s|^RAG_OPENAI_API_KEY=.*|RAG_OPENAI_API_KEY=${NEW_TOKEN}|" \
  "$ENV_FILE"
 
sed -i '' \
  "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=${NEW_TOKEN}|" \
  "$ENV_FILE"

echo "Token updated in .env"

cd "$(dirname "$0")"
echo "Starting any stopped containers..."
docker compose up -d
echo "Restarting token-dependent containers..."
docker compose restart api gateway-proxy
docker compose up -d --force-recreate rag_api
echo "Done — all containers running."