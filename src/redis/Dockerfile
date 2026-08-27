# Valkey is Redis protocol-compatible. LibreChat's ioredis clients work unchanged.
FROM valkey/valkey:9.1.1-alpine
USER root
RUN addgroup -g 1000 -S valkey && adduser -u 1000 -S -G valkey valkey \
    && mkdir -p /data \
    && chown -R valkey:valkey /data
USER valkey
