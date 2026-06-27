import { execFile } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const modelProcessPattern = /ollama|llama/i
const cpuCount = Math.max(os.cpus().length, 1)

let previousCpuSnapshot
let previousModelCpuSnapshot

function round(value, digits = 1) {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, round(value)))
}

function readCpuSnapshot() {
  return os.cpus().reduce(
    (total, cpu) => {
      const times = cpu.times
      const cpuTotal = times.user + times.nice + times.sys + times.idle + times.irq

      return {
        idle: total.idle + times.idle,
        total: total.total + cpuTotal,
      }
    },
    { idle: 0, total: 0 },
  )
}

function calculateSystemCpuPercent(currentSnapshot) {
  const previousSnapshot = previousCpuSnapshot
  previousCpuSnapshot = currentSnapshot

  if (!previousSnapshot) {
    return null
  }

  const idleDelta = currentSnapshot.idle - previousSnapshot.idle
  const totalDelta = currentSnapshot.total - previousSnapshot.total

  if (totalDelta <= 0) {
    return null
  }

  return clampPercent((1 - idleDelta / totalDelta) * 100)
}

function calculateModelCpuPercent(cpuSeconds) {
  const currentSnapshot = {
    cpuSeconds,
    sampledAt: Date.now(),
  }
  const previousSnapshot = previousModelCpuSnapshot
  previousModelCpuSnapshot = currentSnapshot

  if (!previousSnapshot || cpuSeconds < previousSnapshot.cpuSeconds) {
    return null
  }

  const elapsedSeconds = (currentSnapshot.sampledAt - previousSnapshot.sampledAt) / 1000
  const cpuDelta = cpuSeconds - previousSnapshot.cpuSeconds

  if (elapsedSeconds <= 0) {
    return null
  }

  return clampPercent((cpuDelta / elapsedSeconds / cpuCount) * 100)
}

function normalizeProcessRows(value) {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function aggregateProcesses(processes, cpuPercentFallback = null) {
  const processCount = processes.length
  const cpuSeconds = processes.reduce((total, process) => total + process.cpuSeconds, 0)
  const memoryBytes = processes.reduce((total, process) => total + process.memoryBytes, 0)
  const names = [...new Set(processes.map((process) => process.name).filter(Boolean))].sort()
  const pids = processes
    .map((process) => process.pid)
    .filter((pid) => Number.isFinite(pid))
    .sort((a, b) => a - b)
  const sampledCpuPercent = calculateModelCpuPercent(cpuSeconds)

  return {
    detected: processCount > 0,
    cpuPercent: sampledCpuPercent ?? cpuPercentFallback,
    memoryBytes,
    names,
    pids,
    processCount,
  }
}

async function readWindowsModelProcesses() {
  const command = [
    '$items = @(Get-Process -ErrorAction SilentlyContinue |',
    "Where-Object { $_.ProcessName -match '(?i)(ollama|llama)' } |",
    'ForEach-Object {',
    '[pscustomobject]@{',
    'Id = $_.Id;',
    'Name = $_.ProcessName;',
    'CpuSeconds = if ($null -eq $_.CPU) { 0 } else { [double]$_.CPU };',
    'WorkingSetBytes = [int64]$_.WorkingSet64',
    '}',
    '});',
    "if ($items.Count -eq 0) { '[]' } else { $items | ConvertTo-Json -Compress }",
  ].join(' ')

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      maxBuffer: 1024 * 1024,
      timeout: 3000,
      windowsHide: true,
    },
  )

  const parsed = JSON.parse(stdout.trim() || '[]')
  const processes = normalizeProcessRows(parsed).map((process) => ({
    cpuSeconds: Number(process.CpuSeconds) || 0,
    memoryBytes: Number(process.WorkingSetBytes) || 0,
    name: String(process.Name ?? ''),
    pid: Number(process.Id),
  }))

  return aggregateProcesses(processes)
}

async function readPosixModelProcesses() {
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,comm=,pcpu=,rss='], {
    maxBuffer: 1024 * 1024,
    timeout: 3000,
  })

  let fallbackCpuPercent = 0
  const processes = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, name, pcpu, rss] = line.split(/\s+/)
      return {
        cpuSeconds: 0,
        memoryBytes: (Number(rss) || 0) * 1024,
        name,
        pcpu: Number(pcpu) || 0,
        pid: Number(pid),
      }
    })
    .filter((process) => modelProcessPattern.test(process.name))

  fallbackCpuPercent = clampPercent(
    processes.reduce((total, process) => total + process.pcpu, 0) / cpuCount,
  )

  return aggregateProcesses(processes, fallbackCpuPercent)
}

async function readModelProcesses() {
  try {
    return process.platform === 'win32'
      ? await readWindowsModelProcesses()
      : await readPosixModelProcesses()
  } catch (error) {
    return {
      detected: false,
      cpuPercent: null,
      error: error instanceof Error ? error.message : String(error),
      memoryBytes: 0,
      names: [],
      pids: [],
      processCount: 0,
    }
  }
}

export async function readSystemStats() {
  const cpuSnapshot = readCpuSnapshot()
  const totalBytes = os.totalmem()
  const freeBytes = os.freemem()
  const usedBytes = Math.max(0, totalBytes - freeBytes)
  const loadAverage = os.loadavg()
  const modelProcesses = await readModelProcesses()

  return {
    sampledAt: new Date().toISOString(),
    platform: {
      arch: process.arch,
      os: process.platform,
      uptimeSeconds: round(os.uptime(), 0),
    },
    cpu: {
      cores: cpuCount,
      loadAverage,
      percent: calculateSystemCpuPercent(cpuSnapshot),
    },
    memory: {
      freeBytes,
      totalBytes,
      usedBytes,
      usedPercent: clampPercent((usedBytes / totalBytes) * 100),
    },
    ollama: modelProcesses,
  }
}
