import type { IncomingMessage } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const allowedOllamaPaths = new Map([
  ['/tags', new Set(['GET'])],
  ['/generate', new Set(['POST'])],
])
const maxProxyBodyBytes = Number(process.env.OLLAMA_BODY_LIMIT_BYTES ?? 4 * 1024 * 1024)
const proxyTimeoutMs = Number(process.env.OLLAMA_PROXY_TIMEOUT_MS ?? 180000)

function normalizeOllamaHost(value = 'http://127.0.0.1:11434'): string {
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

const ollamaHost = normalizeOllamaHost(process.env.OLLAMA_HOST)

function isAllowedProxyRequest(pathname: string, method = 'GET'): boolean {
  return allowedOllamaPaths.get(pathname)?.has(method.toUpperCase()) ?? false
}

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let receivedBytes = 0
    let rejected = false

    request.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length

      if (receivedBytes > maxProxyBodyBytes) {
        rejected = true
        reject(new Error(`Request body exceeds ${maxProxyBodyBytes} bytes.`))
        request.destroy()
        return
      }

      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', (error) => {
      if (!rejected) {
        reject(error)
      }
    })
  })
}

async function fetchWithTimeout(target: URL, request: IncomingMessage, body?: Buffer) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), proxyTimeoutMs)

  try {
    return await fetch(target, {
      method: request.method,
      headers: {
        Accept: 'application/json',
        'Content-Type':
          typeof request.headers['content-type'] === 'string'
            ? request.headers['content-type']
            : 'application/json',
      },
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : body,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

function ollamaDevProxy(): Plugin {
  return {
    name: 'ollama-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ollama', async (request, response) => {
        const requestUrl = new URL(request.url ?? '/', 'http://local-proxy')

        if (!isAllowedProxyRequest(requestUrl.pathname, request.method)) {
          response.statusCode = 404
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ error: 'Unsupported Ollama proxy route' }))
          return
        }

        const target = new URL(`/api${requestUrl.pathname}${requestUrl.search}`, ollamaHost)

        try {
          const body =
            request.method === 'GET' || request.method === 'HEAD'
              ? undefined
              : await readRequestBody(request)
          const upstream = await fetchWithTimeout(target, request, body)

          response.statusCode = upstream.status
          upstream.headers.forEach((value, key) => {
            if (!['content-encoding', 'transfer-encoding'].includes(key)) {
              response.setHeader(key, value)
            }
          })

          response.end(Buffer.from(await upstream.arrayBuffer()))
        } catch (error) {
          const timedOut =
            error instanceof Error && error.name === 'AbortError'
              ? true
              : String(error).includes('aborted')
          const tooLarge =
            error instanceof Error && error.message.includes('Request body exceeds')
          response.statusCode = tooLarge ? 413 : timedOut ? 504 : 502
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              error: tooLarge
                ? 'Request body is too large'
                : timedOut
                  ? 'Ollama request timed out'
                  : 'Ollama is not reachable',
              detail: error instanceof Error ? error.message : String(error),
            }),
          )
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [ollamaDevProxy(), react()],
  server: {
    port: 5173,
  },
})
