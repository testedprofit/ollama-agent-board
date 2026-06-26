# Security

Ollama Agent Board is designed to run against a local Ollama instance.

## Safe defaults

- The proxy only forwards the Ollama routes used by the app.
- Remote Ollama hosts are blocked unless `OLLAMA_ALLOW_REMOTE=1` is set intentionally.
- Real `.env` files are ignored by git. Commit `.env.example` only.
- The package is marked private to prevent accidental npm publication.

## Do not commit

- API keys, tokens, passwords, cookies, credentials, or production environment files.
- Private documents, customer data, proprietary internal materials, or unpublished operating playbooks.
- Private network addresses, hostnames, logs, or screenshots unless they are intentionally public.

## Before publishing changes

Run:

```bash
npm run lint
npm run test
npm run build
npm audit --audit-level=moderate
```

Then scan the diff for secrets and private material before pushing.
