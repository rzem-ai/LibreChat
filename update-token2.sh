#!/bin/bash
# Usage: ./update-token2.sh <new_jwt_token>
# Updates LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION, ANTHROPIC_API_KEY, and RAG_OPENAI_API_KEY in .env,
# then restarts the affected containers.

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <new_jwt_token>"
  exit 1
fi

NEW_TOKEN="$1"
ENV_FILE="$(dirname "$0")/.env"

sed -i.bak \
  "s|^LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION=.*|LLM_GATEWAY_LOCAL_IDENTITY_TOKEN_SESSION=${NEW_TOKEN}|" \
  "$ENV_FILE" && rm -f "${ENV_FILE}.bak"

sed -i.bak \
  "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${NEW_TOKEN}|" \
  "$ENV_FILE" && rm -f "${ENV_FILE}.bak"

sed -i.bak \
  "s|^RAG_OPENAI_API_KEY=.*|RAG_OPENAI_API_KEY=${NEW_TOKEN}|" \
  "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
 
# sed -i.bak \
#   "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=${NEW_TOKEN}|" \
#   "$ENV_FILE" && rm -f "${ENV_FILE}.bak"

echo "Token updated in .env"

cd "$(dirname "$0")"
docker-compose down && docker-compose up -d
echo "Done — containers restarted."
