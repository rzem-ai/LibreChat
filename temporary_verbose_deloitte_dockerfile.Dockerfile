# DEBUG-ONLY: Verbose Dockerfile for troubleshooting local builds behind corporate TLS interception.
# Not referenced by docker-compose.yml / docker-compose.override.yml.
# Manual usage example:
#   docker build -f temporary_verbose_deloitte_dockerfile.Dockerfile --progress=plain --no-cache .
# v0.8.6-rc1

# Base node image
FROM node:20-alpine AS node

RUN apk upgrade --no-cache
RUN apk add --no-cache jemalloc
RUN apk add --no-cache python3 py3-pip uv
RUN apk add --no-cache ca-certificates

# Add Zscaler/Deloitte root certs early so npm/node and all later steps trust them
COPY deloitte/certificates/deloitte.crt /usr/local/share/ca-certificates/deloitte.crt
COPY deloitte/certificates/zscaler_root_ca.crt /usr/local/share/ca-certificates/zscaler_root_ca.crt
RUN update-ca-certificates

# NODE_EXTRA_CA_CERTS only supports a single file path, so bundle both certs together
RUN cat /usr/local/share/ca-certificates/deloitte.crt \
    /usr/local/share/ca-certificates/zscaler_root_ca.crt \
    > /etc/ssl/certs/combined-ca-bundle.crt

# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/combined-ca-bundle.crt

# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.9.5-python3.12-alpine /usr/local/bin/uv /usr/local/bin/uvx /bin/
RUN uv --version

# Set configurable max-old-space-size with default
ARG NODE_MAX_OLD_SPACE_SIZE=6144
ARG NPM_CI_TIMEOUT_SECONDS=1500
ARG NPM_CI_ATTEMPTS=2

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node api/package.json ./api/package.json
COPY --chown=node:node client/package.json ./client/package.json
COPY --chown=node:node packages/data-provider/package.json ./packages/data-provider/package.json
COPY --chown=node:node packages/data-schemas/package.json ./packages/data-schemas/package.json
COPY --chown=node:node packages/api/package.json ./packages/api/package.json

RUN set -eux; \
    echo "==> Preparing app directories"; \
    touch .env; \
    mkdir -p /app/client/public/images /app/logs /app/uploads; \
    echo "==> Configuring npm retries"; \
    npm config set fetch-retry-maxtimeout 600000; \
    npm config set fetch-retries 5; \
    npm config set fetch-retry-mintimeout 15000

RUN set -eux; \
    echo "==> Starting npm ci at $(date)"; \
    attempt=1; \
    until timeout "$NPM_CI_TIMEOUT_SECONDS" npm ci --no-audit --loglevel verbose; do \
        status=$?; \
        echo "==> npm ci failed with exit code $status at $(date)"; \
        if [ "$attempt" -ge "$NPM_CI_ATTEMPTS" ]; then \
            echo "==> Reached max attempts ($NPM_CI_ATTEMPTS); exiting"; \
            exit "$status"; \
        fi; \
        attempt=$((attempt + 1)); \
        echo "==> Retrying npm ci: attempt ${attempt}/${NPM_CI_ATTEMPTS}"; \
        npm cache clean --force || true; \
        sleep 10; \
    done; \
    echo "==> npm ci completed at $(date)"

COPY --chown=node:node . .

RUN set -eux; \
    echo "==> Starting frontend build at $(date)"; \
    NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" npm run frontend; \
    echo "==> Frontend build completed at $(date)"; \
    echo "==> Pruning production dependencies"; \
    npm prune --production; \
    echo "==> Cleaning npm cache"; \
    npm cache clean --force; \
    echo "==> Final build step completed at $(date)"

# Optional build metadata surfaced in Settings -> About for support triage.
# Declared here (after the heavy install/build steps) so that commit/date
# changing on every CI run does not bust the cache for dependency install
# and frontend build layers. When unset, the backend falls back to local
# git resolution (if .git is present), and finally to empty values.
ARG BUILD_COMMIT=
ARG BUILD_BRANCH=
ARG BUILD_DATE=
ENV BUILD_COMMIT=${BUILD_COMMIT}
ENV BUILD_BRANCH=${BUILD_BRANCH}
ENV BUILD_DATE=${BUILD_DATE}

# Node API setup
EXPOSE 3080
ENV HOST=0.0.0.0
CMD ["npm", "run", "backend"]

# Optional: for client with nginx routing
# FROM nginx:stable-alpine AS nginx-client
# WORKDIR /usr/share/nginx/html
# COPY --from=node /app/client/dist /usr/share/nginx/html
# COPY client/nginx.conf /etc/nginx/conf.d/default.conf
# ENTRYPOINT ["nginx", "-g", "daemon off;"]