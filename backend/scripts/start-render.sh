#!/bin/sh
set -eu

python -m alembic upgrade head
python -m scripts.seed_catalog
if [ "${UO_DEMO_ENABLED:-false}" = true ]; then
  : "${UO_DEMO_PASSWORD:?Render must provide a demo institution password}"
  printf '%s\n' "$UO_DEMO_PASSWORD" | python -m scripts.setup_uo_demo --password-stdin
fi
exec python -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-10000}" --workers 1
