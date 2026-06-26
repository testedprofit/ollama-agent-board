import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = Number(process.env.PORT ?? 4173)
const root = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(root, 'dist')
const allowedOllamaPaths = new Map([
  ['/tags', new Set(['GET'])],
  ['/generate', new Set(['POST'])],
])
const proxyTimeoutMs = Number(process.env.OLLAMA_PROXY_TIMEOUT_MS ?? 180000)
const maxProxyBodyBytes = Number(process.env.OLLAMA_BODY_LIMIT_BYTES ?? 4 * 1024 * 1024)

function normalizeOllamaHost(value = 'http://127.0.0.1:11434') {
  const withProtocol = /^https?:\/\//.test(value) ? value : `http://${value}`
  const url = new URL(withProtocol)

  if (url.username || url.password) {
    throw new Error('OLLAMA_HOST must not include credentials.')
  }

  if (url.hostname === '0.0.0.0' || url.hostname === '::' || url.hostname === '[::]') {
    url.hostname = '127.0.0.1'
  }

  const allowRemote = process.env.OLLAMA_ALLOW_REMOTE === '1'
  const isLoopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname.startsWith('127.') ||
    url.hostname === '::1' ||
    url.hostname === '[::1]'

  if (!allowRemote && !isLoopback) {
    throw new Error(
      `Refusing non-local OLLAMA_HOST (${url.hostname}). Set OLLAMA_ALLOW_REMOTE=1 to override.`,
    )
  }

  return url.toString().replace(/\/$/, '')
}

let ollamaHost

try {
  ollamaHost = normalizeOllamaHost(process.env.OLLAMA_HOST)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('Missing production build. Run `npm run build` before `npm start`.')
  process.exit(1)
}

function isAllowedProxyRequest(pathname, method = 'GET') {
  return allowedOllamaPaths.get(pathname)?.has(method.toUpperCase()) ?? false
}

async function fetchWithTimeout(target, request) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), proxyTimeoutMs)

  try {
    return await fetch(target, {
      method: request.method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : JSON.stringify(request.body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

app.disable('x-powered-by')

app.use((_request, response, next) => {
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  )
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  next()
})

app.get('/healthz', (_request, response) => {
  response.json({
    ok: true,
    app: 'ollama-agent-board',
  })
})

app.use(express.json({ limit: maxProxyBodyBytes }))

app.use('/api/ollama', async (request, response) => {
  const requestUrl = new URL(request.url, 'http://local-proxy')

  if (!isAllowedProxyRequest(requestUrl.pathname, request.method)) {
    response.status(404).json({ error: 'Unsupported Ollama proxy route' })
    return
  }

  const target = new URL(`/api${requestUrl.pathname}${requestUrl.search}`, ollamaHost)

  try {
    const upstream = await fetchWithTimeout(target, request)

    response.status(upstream.status)
    upstream.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding'].includes(key)) {
        response.setHeader(key, value)
      }
    })

    const buffer = Buffer.from(await upstream.arrayBuffer())
    response.send(buffer)
  } catch (error) {
    const timedOut =
      error instanceof Error && error.name === 'AbortError'
        ? true
        : String(error).includes('aborted')

    response.status(timedOut ? 504 : 502).json({
      error: timedOut ? 'Ollama request timed out' : 'Ollama is not reachable',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
})

app.use((error, _request, response, next) => {
  if (error?.type === 'entity.too.large') {
    response.status(413).json({ error: 'Request body is too large' })
    return
  }

  next(error)
})

app.use(express.static(distDir))

app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(distDir, 'index.html'))
})

app.listen(port, () => {
  console.log(`Ollama Agent Board running at http://localhost:${port}`)
  console.log(`Proxying Ollama from ${ollamaHost}`)
})
