import type { IncomingMessage } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeOllamaHost(value = 'http://127.0.0.1:11434'): string {
  const withProtocol = /^https?:\/\//.test(value) ? value : `http://${value}`
  const url = new URL(withProtocol)

  if (url.hostname === '0.0.0.0' || url.hostname === '::') {
    url.hostname = '127.0.0.1'
  }

  return url.toString().replace(/\/$/, '')
}

const ollamaHost = normalizeOllamaHost(process.env.OLLAMA_HOST)

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

function ollamaDevProxy(): Plugin {
  return {
    name: 'ollama-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ollama', async (request, response) => {
        const requestPath = request.url ?? '/'
        const target = new URL(`/api${requestPath}`, ollamaHost)

        try {
          const upstream = await fetch(target, {
            method: request.method,
            headers: {
              'Content-Type':
                typeof request.headers['content-type'] === 'string'
                  ? request.headers['content-type']
                  : 'application/json',
            },
            body:
              request.method === 'GET' || request.method === 'HEAD'
                ? undefined
                : await readRequestBody(request),
          })

          response.statusCode = upstream.status
          upstream.headers.forEach((value, key) => {
            if (!['content-encoding', 'transfer-encoding'].includes(key)) {
              response.setHeader(key, value)
            }
          })

          response.end(Buffer.from(await upstream.arrayBuffer()))
        } catch (error) {
          response.statusCode = 502
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              error: 'Ollama is not reachable',
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
