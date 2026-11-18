#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i 's/^TICKLOCK_MODE=.*/TICKLOCK_MODE=public/' .env || true
  echo "Created .env from .env.example (set ADMIN_KEY inside .env before public exposure)."
fi

mkdir -p data

docker compose up -d --build

for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8642/api/health; then
    echo ""
    echo "Tick Lock 3D is live on port 8642."
    exit 0
  fi
  sleep 1
done

echo "Warning: container started, check logs with 'docker compose logs -f'."
exit 1
