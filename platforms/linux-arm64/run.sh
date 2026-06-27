#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNTIME_DIR="$SCRIPT_DIR/.runtime"
NODE_VERSION="${NODE_VERSION:-24.18.0}"
NODE_ARCH="${NODE_ARCH:-linux-arm64}"
NODE_DIR="$RUNTIME_DIR/node-v$NODE_VERSION-$NODE_ARCH"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-5173}"

if [[ -x "$NODE_DIR/bin/node" ]]; then
  export PATH="$NODE_DIR/bin:$PATH"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is missing. Run: bash platforms/linux-arm64/install.sh"
  exit 1
fi

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama is missing. Run: bash platforms/linux-arm64/install.sh"
  exit 1
fi

if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  mkdir -p "$RUNTIME_DIR"
  nohup ollama serve > "$RUNTIME_DIR/ollama.log" 2>&1 &
  sleep 3
fi

cd "$ROOT_DIR"
if [[ ! -d node_modules ]]; then
  npm install
fi

export OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
npm run dev -- --host "$HOST" --port "$PORT"
