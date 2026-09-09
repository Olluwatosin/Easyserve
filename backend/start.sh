#!/bin/sh
# Container entrypoint: migrate, then serve.
#
# This exists because passing the whole thing as a one-line `dockerCommand` in
# render.yaml does not survive Render's command handling — the `&&` and the
# quoted '*' get folded into a single argv element and the container exits 127.
# A script sidesteps every quoting question.
set -e

echo "==> Running database migrations"
alembic upgrade head

echo "==> Starting uvicorn"
# PORT and WEB_CONCURRENCY are supplied by the platform; the defaults keep this
# runnable locally. --proxy-headers is safe because the app is only reachable
# through a trusted proxy in every environment that sets these.
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-1}" \
  --proxy-headers \
  --forwarded-allow-ips '*'
