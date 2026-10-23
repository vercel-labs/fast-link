#!/usr/bin/env bash
set -euo pipefail

# Slow Azure downloads can exhaust the job before browser tests start.
# Keep the hosted runner's official Ubuntu archive and security fallbacks.
if [[ -f /etc/apt/apt-mirrors.txt ]]; then
  sudo sed -i '/azure\.archive\.ubuntu\.com/d' /etc/apt/apt-mirrors.txt
fi

pnpm exec playwright install --with-deps "$@"
