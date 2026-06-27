# Ollama Agent Board

A visual local AI command surface for people who want to heavily use Ollama on their own PC. It turns a local model into a five-pass agent board, quick text forge, reusable workflow launcher, and saved run history.

Everything runs locally. The browser app talks to Ollama through a local proxy path, so private notes, drafts, and documents stay on the machine you run it on.

## What it does

- Finds locally installed Ollama models.
- Runs a visual five-phase agent loop: Intake, Strategy, Workbench, Review, Ship.
- Adds review buttons for every phase so you can inspect what each phase outputs and feeds forward.
- Shows a Matrix-style workbench while the agent is thinking, then writes the finished output into the same window.
- Provides reusable workflows for inbox triage, study guides, code review, and launch briefs.
- Runs quick actions against pasted text: summarize, extract tasks, rewrite, and explain.
- Shows local PC CPU, memory, and Ollama process load while models are running.
- Autosaves the current goal/source draft locally so refreshes do not wipe work.
- Adds context pressure, model-fit guardrails, and a run QA score before shipping output.
- Includes a Settings tab for model defaults, generation profile, Light/Dark/Purple themes, workbench display, history, imports, exports, diagnostics, and local data cleanup.
- Supports stopping long local model runs, copying output, resizing the workbench, and exporting markdown.
- Saves recent runs in browser storage, with a clear-history control.
- Includes a hardened production server that serves the app and proxies only the Ollama routes it needs.

## Prerequisites

Use the in-app Setup panel, or install these directly:

- [Ollama for Windows](https://ollama.com/download/windows) to run local models.
- [Node.js](https://nodejs.org/en/download) 20 or newer to run the app from source.
- [Git for Windows](https://git-scm.com/install/windows) to clone or contribute.
- At least one Ollama model, for example:

```bash
ollama pull llama3.2
```

Open a new terminal after installing Ollama or Node.js so the commands are on your PATH.

## Platform installers

Separate install/run folders are available for each target:

| Target | Folder | Start here |
| --- | --- | --- |
| Windows | `platforms/windows` | `powershell -ExecutionPolicy Bypass -File .\platforms\windows\install.ps1 -InstallMissing` |
| Linux | `platforms/linux` | `bash platforms/linux/install.sh` |
| DGX Spark / DGX OS | `platforms/dgx-os` | `bash platforms/dgx-os/install.sh` |

Linux and DGX OS keep their downloaded Node.js runtime inside the platform folder under `.runtime/`. The app still uses Ollama through the local HTTP API, so ARM64 and DGX systems can run local Ollama models without changing the React app code. An explicit ARM64-only profile is also available in `platforms/linux-arm64`.

## Quick Windows setup

```bash
git clone https://github.com/testedprofit/ollama-agent-board.git
cd ollama-agent-board
npm install
ollama pull llama3.2
npm run dev
```

Keep Ollama running, then open `http://localhost:5173`.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

If the app does not detect Ollama, run these checks:

```bash
ollama --version
ollama list
ollama serve
```

Then press Refresh in the app. If `ollama serve` says the address is already in use, Ollama is already running.

## Build and run the packaged app

```bash
npm run build
npm start
```

Open `http://localhost:4173`.

## Configuration

The app defaults to Ollama at `http://127.0.0.1:11434`.

```bash
OLLAMA_HOST=http://127.0.0.1:11434
PORT=4173
OLLAMA_PROXY_TIMEOUT_MS=180000
OLLAMA_BODY_LIMIT_BYTES=4194304
OLLAMA_ALLOW_REMOTE=0
```

If your system has `OLLAMA_HOST=0.0.0.0:11434`, the app normalizes that bind address to `http://127.0.0.1:11434` for local requests.

The proxy is local-only by default and only forwards:

- `GET /api/ollama/tags`
- `POST /api/ollama/generate`

Set `OLLAMA_ALLOW_REMOTE=1` only when you intentionally want to proxy a remote Ollama host.

## Production hardening

- Express disables `x-powered-by` and sends basic security headers.
- The production server exits clearly if `dist/index.html` is missing.
- The proxy rejects unsupported Ollama routes, oversized request bodies, credentialed `OLLAMA_HOST` values, and non-local hosts unless explicitly allowed.
- Browser requests have client-side timeouts and can be stopped from the UI.
- GitHub Actions runs install, lint, tests, and build on pushes and pull requests.

## How the local agent works

The board makes sequential non-streaming Ollama `/api/generate` calls. Each phase receives the user goal, source material, and prior phase output, then writes its own result back into the visual board. This keeps the implementation easy to inspect while still producing a useful agentic loop.

The Run agent prompt is built from a local operating template, so blunt goals still become structured work. Each phase receives task boundaries, source-handling rules, assumptions, acceptance criteria, and a phase-specific output contract.

## Verify locally

```bash
npm run lint
npm run test
npm run build
```

After `npm run build`, run the packaged server:

```bash
npm start
```

Health check:

```bash
curl http://localhost:4173/healthz
```

## Scripts

```bash
npm run dev      # Vite dev server with Ollama proxy
npm run build    # TypeScript check and production build
npm run start    # Serve dist with Express and Ollama proxy
npm run lint     # Oxlint
npm run test     # Vitest prompt-engine tests
```
