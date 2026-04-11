#!/bin/sh
set -e
# Fix permissions on Docker-mounted volumes (runs as root before dropping to node)
mkdir -p /app/data/recognition-images/web-images /app/data/recognition-images/catalog-pages
chown -R node:node /app/data/recognition-images 2>/dev/null || true
# Drop privileges and run the application as node user
exec su-exec node "$@"
