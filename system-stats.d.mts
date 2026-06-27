export type SystemStatsSnapshot = {
  sampledAt: string
  platform: {
    arch: string
    os: string
    uptimeSeconds: number
  }
  cpu: {
    cores: number
    loadAverage: number[]
    percent: number | null
  }
  memory: {
    freeBytes: number
    totalBytes: number
    usedBytes: number
    usedPercent: number
  }
  ollama: {
    cpuPercent: number | null
    detected: boolean
    error?: string
    memoryBytes: number
    names: string[]
    pids: number[]
    processCount: number
  }
}

export function readSystemStats(): Promise<SystemStatsSnapshot>
