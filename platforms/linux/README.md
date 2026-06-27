# Linux Install

Use this folder for Linux machines. The scripts auto-detect `x86_64` and `aarch64` / `arm64`.

The install script keeps Node.js inside this folder:

```text
platforms/linux/.runtime/
```

Ollama install behavior:

- The default path uses the official Ollama Linux installer, which detects x64 and ARM64.
- ARM64 can use the direct package path with `OLLAMA_INSTALL_MODE=direct-arm64`.
- Existing Ollama installs are reused.
- Node.js archives are verified against the official `SHASUMS256.txt` before extraction.

## Install

```bash
bash platforms/linux/install.sh
```

Use another model:

```bash
MODEL=qwen2.5:7b bash platforms/linux/install.sh
```

Skip pulling a model:

```bash
PULL_MODEL=0 bash platforms/linux/install.sh
```

Use the direct ARM64 Ollama package instead of the installer:

```bash
OLLAMA_INSTALL_MODE=direct-arm64 bash platforms/linux/install.sh
```

## Run

```bash
bash platforms/linux/run.sh
```

Open `http://localhost:5173`.

To listen on another interface:

```bash
HOST=0.0.0.0 PORT=5173 bash platforms/linux/run.sh
```

Only expose the dev server on a trusted local network.
