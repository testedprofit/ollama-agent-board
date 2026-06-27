# Linux ARM64 Install

Use this folder for Linux ARM64 machines.

The install script keeps Node.js inside this folder:

```text
platforms/linux-arm64/.runtime/
```

Ollama is installed with the official Linux installer when `ollama` is not already available. The installer detects ARM64, creates the usual system integration when supported, and downloads the matching Ollama payload. Node.js archives are verified against the official `SHASUMS256.txt` before extraction.

## Install

```bash
bash platforms/linux-arm64/install.sh
```

Use another model:

```bash
MODEL=qwen2.5:7b bash platforms/linux-arm64/install.sh
```

Skip pulling a model:

```bash
PULL_MODEL=0 bash platforms/linux-arm64/install.sh
```

Use the direct ARM64 Ollama package instead of the installer:

```bash
OLLAMA_INSTALL_MODE=direct-arm64 bash platforms/linux-arm64/install.sh
```

## Run

```bash
bash platforms/linux-arm64/run.sh
```

Open `http://localhost:5173`.

To listen on another interface:

```bash
HOST=0.0.0.0 PORT=5173 bash platforms/linux-arm64/run.sh
```

Only expose the dev server on a trusted local network.
