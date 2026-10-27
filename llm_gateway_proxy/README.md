# LLM Gateway proxy

This image runs nginx in front of the LLM Gateway, forwards LibreChat's per-user `x-id-token`, and injects the current Kubernetes service account token as the `x-sa-token` header. Gateway response statuses and bodies are forwarded unchanged so token-limit errors reach the user.

## Required environment variables

- `TOKEN_PROXY_AZURE_AU_URL`
- `TOKEN_PROXY_AZURE_US_URL`
- `TOKEN_PROXY_AZURE_GLOBAL_URL`
- `TOKEN_PROXY_AZURE_FOUNDRY_AU_URL`
- `TOKEN_PROXY_VERTEXAI_URL`
- `TOKEN_PROXY_MCP_URL`
- `TOKEN_PROXY_ANTHROPIC_URL`
- `TOKEN_PROXY_BEDROCK_AU_URL`

## Optional environment variables

- `TOKEN_FILE_PATH` defaults to `/var/run/secrets/kubernetes.io/serviceaccount/token`
- `TOKEN_PROXY_SYNC_SECONDS` defaults to `30`

## Build

```sh
docker build -t llm-gateway-proxy ./llm_gateway_proxy
```

## Run

```sh
docker run --rm -p 8081:8081 \
  -e TOKEN_PROXY_AZURE_AU_URL="https://your-azure-au-endpoint" \
  -e TOKEN_PROXY_AZURE_US_URL="https://your-azure-us-endpoint" \
  -e TOKEN_PROXY_AZURE_GLOBAL_URL="https://your-azure-global-endpoint" \
  -e TOKEN_PROXY_AZURE_FOUNDRY_AU_URL="https://your-azure-foundry-au-endpoint" \
  -e TOKEN_PROXY_VERTEXAI_URL="https://your-vertexai-endpoint" \
  -e TOKEN_PROXY_ANTHROPIC_URL="https://your-anthropic-endpoint" \
  -e TOKEN_PROXY_BEDROCK_AU_URL="https://your-bedrock-au-endpoint" \
  -e TOKEN_PROXY_MCP_URL="https://your-mcp-endpoint" \
  -v /var/run/secrets/kubernetes.io/serviceaccount/token:/var/run/secrets/kubernetes.io/serviceaccount/token:ro \
  llm-gateway-proxy
```

The container reads the token from the mounted file, renders nginx config from `proxy.conf`, and reloads nginx whenever the token value changes.
