# Platform Installers

Use the folder that matches the machine running Ollama Agent Board.

| Platform | Folder | Best for |
| --- | --- | --- |
| Windows | `platforms/windows` | Windows PCs with Ollama Desktop or winget. |
| Linux | `platforms/linux` | Ubuntu/Debian-style Linux on x64 or ARM64. |
| Linux ARM64 | `platforms/linux-arm64` | ARM-only profile for ARM workstations. |
| DGX OS | `platforms/dgx-os` | NVIDIA DGX Spark or DGX OS systems running Ubuntu-based DGX OS on ARM64. |

Each folder is intentionally separate:

- It has its own README.
- It has its own install and run scripts.
- Linux and DGX OS use a local portable Node.js runtime under that platform folder.
- Ollama models remain managed by Ollama unless you explicitly change `OLLAMA_MODELS`.

The app talks to Ollama through `OLLAMA_HOST`, defaulting to `http://127.0.0.1:11434`.
