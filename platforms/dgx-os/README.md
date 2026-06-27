# DGX OS Install

Use this folder for NVIDIA DGX Spark or DGX OS systems.

This profile keeps app dependencies separate:

- Node.js is downloaded into `platforms/dgx-os/.runtime/`.
- Ollama remains a system runtime.
- The app production server proxies only local Ollama routes by default.

DGX OS is Ubuntu-based, so this script uses apt for small OS tools and the official Ollama Linux installer when `ollama` is missing. The installer detects ARM64 and keeps Ollama aligned with the supported Linux install path. Node.js archives are verified against the official `SHASUMS256.txt` before extraction.

## Install

```bash
bash platforms/dgx-os/install.sh
```

Use another model:

```bash
MODEL=qwen2.5:14b bash platforms/dgx-os/install.sh
```

Skip pulling a model:

```bash
PULL_MODEL=0 bash platforms/dgx-os/install.sh
```

Use the direct ARM64 Ollama package instead of the installer:

```bash
OLLAMA_INSTALL_MODE=direct-arm64 bash platforms/dgx-os/install.sh
```

## Run

Production mode, recommended for a DGX box on your local network:

```bash
bash platforms/dgx-os/run.sh
```

Open `http://<dgx-hostname-or-ip>:4173`.

Development mode:

```bash
MODE=dev bash platforms/dgx-os/run.sh
```

Only expose the app on a trusted local network. The app still refuses remote Ollama hosts unless `OLLAMA_ALLOW_REMOTE=1`.
