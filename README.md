# Ollama Agent Board

A visual local AI command surface for people who want to heavily use Ollama on their own PC. It turns a local model into a five-pass agent board, quick text forge, reusable workflow launcher, and saved run history.

Everything runs locally. The browser app talks to Ollama through a local proxy path, so private notes, drafts, and documents stay on the machine you run it on.

## What it does

- Finds locally installed Ollama models.
- Runs a visual five-phase agent loop: Intake, Strategy, Workbench, Review, Ship.
- Provides reusable workflows for inbox triage, study guides, code review, and launch briefs.
- Runs quick actions against pasted text: summarize, extract tasks, rewrite, and explain.
- Saves recent runs in browser storage and exports markdown.
- Includes a production server that serves the app and proxies local Ollama calls.

## Requirements

- Node.js 20 or newer
- Ollama running locally
- At least one model pulled, for example:

```bash
ollama pull llama3.2
```

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

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
```

If your system has `OLLAMA_HOST=0.0.0.0:11434`, the app normalizes that bind address to `http://127.0.0.1:11434` for local requests.

## How the local agent works

The board makes sequential non-streaming Ollama `/api/generate` calls. Each phase receives the user goal, source material, and prior phase output, then writes its own result back into the visual board. This keeps the implementation easy to inspect while still producing a useful agentic loop.

The Run agent prompt is built from a local operating template, so blunt goals still become structured work. It uses two structured passes:

- Operating checks: Responsibility split, Brief clarity, Quality check, Safety check.
- Prompt blueprint: Define, Direct, Data, Design.

Each phase receives task boundaries, source-handling rules, assumptions, acceptance criteria, and a phase-specific output contract.

## Scripts

```bash
npm run dev      # Vite dev server with Ollama proxy
npm run build    # TypeScript check and production build
npm run start    # Serve dist with Express and Ollama proxy
npm run lint     # Oxlint
```
