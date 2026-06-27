# Windows Install

Use this folder when running Ollama Agent Board on Windows.

## Install

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\platforms\windows\install.ps1 -InstallMissing
```

The script can install missing prerequisites with winget:

- Git for Windows
- Node.js LTS
- Ollama

If winget is unavailable, install them manually:

- https://git-scm.com/install/windows
- https://nodejs.org/en/download
- https://ollama.com/download/windows

Open a new terminal after installing prerequisites.

## Run

```powershell
powershell -ExecutionPolicy Bypass -File .\platforms\windows\run.ps1
```

Open `http://localhost:5173`.

## Model

Default model pull:

```powershell
ollama pull llama3.2
```

Use another model:

```powershell
powershell -ExecutionPolicy Bypass -File .\platforms\windows\install.ps1 -Model qwen2.5:7b
```
