#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUNTIME_DIR="$SCRIPT_DIR/.runtime"
NODE_VERSION="${NODE_VERSION:-24.18.0}"
NODE_ARCH="${NODE_ARCH:-linux-arm64}"
NODE_DIR="$RUNTIME_DIR/node-v$NODE_VERSION-$NODE_ARCH"
MODEL="${MODEL:-llama3.2}"
PULL_MODEL="${PULL_MODEL:-1}"
OLLAMA_INSTALL_MODE="${OLLAMA_INSTALL_MODE:-installer}"

ARCH="$(uname -m)"
if [[ "$ARCH" != "aarch64" && "$ARCH" != "arm64" && "${ALLOW_NON_ARM64:-0}" != "1" ]]; then
  echo "This installer is for Linux ARM64. Detected: $ARCH"
  echo "Set ALLOW_NON_ARM64=1 only if you know this is the correct package."
  exit 1
fi

install_os_tools() {
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl git tar xz-utils zstd
  else
    echo "Install these tools first: ca-certificates curl git tar xz-utils zstd"
  fi
}

ensure_tools() {
  local missing=0
  for tool in curl git tar xz; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      missing=1
    fi
  done

  if [[ "$missing" == "1" ]]; then
    install_os_tools
  fi
}

install_node() {
  mkdir -p "$RUNTIME_DIR"

  if [[ ! -x "$NODE_DIR/bin/node" ]]; then
    local archive_name="node-v$NODE_VERSION-$NODE_ARCH.tar.xz"
    local archive="$RUNTIME_DIR/$archive_name"
    local sums="$RUNTIME_DIR/SHASUMS256-v$NODE_VERSION.txt"
    local url="https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$NODE_ARCH.tar.xz"
    echo "Downloading Node.js $NODE_VERSION for $NODE_ARCH..."
    curl -fL "$url" -o "$archive"
    curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$sums"

    local expected_line
    expected_line="$(grep "  $archive_name$" "$sums" || true)"
    if [[ -z "$expected_line" ]]; then
      echo "Could not find checksum for $archive_name."
      exit 1
    fi

    if command -v sha256sum >/dev/null 2>&1; then
      printf '%s\n' "$expected_line" | (cd "$RUNTIME_DIR" && sha256sum -c -)
    elif command -v shasum >/dev/null 2>&1; then
      printf '%s\n' "$expected_line" | (cd "$RUNTIME_DIR" && shasum -a 256 -c -)
    else
      echo "sha256sum or shasum is required to verify Node.js."
      exit 1
    fi

    tar -xJf "$archive" -C "$RUNTIME_DIR"
  fi

  export PATH="$NODE_DIR/bin:$PATH"
  node --version
  npm --version
}

install_ollama() {
  if command -v ollama >/dev/null 2>&1; then
    echo "Ollama detected."
    return
  fi

  if [[ "$OLLAMA_INSTALL_MODE" == "direct-arm64" ]]; then
    echo "Installing Ollama Linux ARM64 package..."
    if command -v zstd >/dev/null 2>&1; then
      curl -fsSL https://ollama.com/download/ollama-linux-arm64.tar.zst | zstd -d | sudo tar -xf - -C /usr
    else
      echo "zstd is required for direct ARM64 package install. Rerun without OLLAMA_INSTALL_MODE or install zstd."
      exit 1
    fi
  else
    echo "Installing Ollama Linux ARM64 package with the official installer..."
    curl -fsSL https://ollama.com/install.sh | sh
  fi
}

start_ollama() {
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl enable ollama >/dev/null 2>&1 || true
    sudo systemctl start ollama >/dev/null 2>&1 || true
  fi

  if ! curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "Starting Ollama with ollama serve..."
    mkdir -p "$RUNTIME_DIR"
    nohup ollama serve > "$RUNTIME_DIR/ollama.log" 2>&1 &
    sleep 3
  fi
}

ensure_tools
install_node
install_ollama
start_ollama

cd "$ROOT_DIR"
npm install

if [[ "$PULL_MODEL" == "1" ]]; then
  ollama pull "$MODEL"
fi

echo ""
echo "Install complete."
echo "Run: bash platforms/linux-arm64/run.sh"
