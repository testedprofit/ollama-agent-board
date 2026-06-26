import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = Number(process.env.PORT ?? 4173)
const ollamaHost = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434'
const root = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(root, 'dist')

app.use(express.json({ limit: '4mb' }))

app.use('/api/ollama', async (request, response) => {
  const target = new URL(`/api${request.path}`, ollamaHost)

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : JSON.stringify(request.body),
    })

    response.status(upstream.status)
    upstream.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding'].includes(key)) {
        response.setHeader(key, value)
      }
    })

    const buffer = Buffer.from(await upstream.arrayBuffer())
    response.send(buffer)
  } catch (error) {
    response.status(502).json({
      error: 'Ollama is not reachable',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
})

app.use(express.static(distDir))

app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(distDir, 'index.html'))
})

app.listen(port, () => {
  console.log(`Ollama Agent Board running at http://localhost:${port}`)
  console.log(`Proxying Ollama from ${ollamaHost}`)
})
