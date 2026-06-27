import { execFile } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const modelProcessPattern = /ollama|llama/i
const cpuCount = Math.max(os.cpus().length, 1)
const mib = 1024 * 1024

let previousCpuSnapshot
let previousModelCpuSnapshot

function round(value, digits = 1) {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, round(value)))
}

function parseFiniteNumber(value) {
  const parsed = Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : null
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

function summarizeGpuAdapters(adapters, provider) {
  const percentValues = adapters
    .map((adapter) => adapter.percent)
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
  const usedValues = adapters
    .map((adapter) => adapter.memoryUsedBytes)
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
  const totalValues = adapters
    .map((adapter) => adapter.memoryTotalBytes)
    .filter((value) => typeof value === 'number' && Number.isFinite(value))

  return {
    adapters,
    detected: adapters.length > 0,
    memoryTotalBytes:
      totalValues.length > 0 ? totalValues.reduce((total, value) => total + value, 0) : null,
    memoryUsedBytes:
      usedValues.length > 0 ? usedValues.reduce((total, value) => total + value, 0) : null,
    names: [...new Set(adapters.map((adapter) => adapter.name).filter(Boolean))].sort(),
    percent: percentValues.length > 0 ? clampPercent(Math.max(...percentValues)) : null,
    provider,
  }
}

async function readNvidiaGpuStats() {
  const { stdout } = await execFileAsync(
    'nvidia-smi',
    [
      '--query-gpu=name,utilization.gpu,memory.used,memory.total',
      '--format=csv,noheader,nounits',
    ],
    {
      maxBuffer: 1024 * 1024,
      timeout: 3000,
      windowsHide: true,
    },
  )
  const adapters = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = 'NVIDIA GPU', percent, memoryUsedMiB, memoryTotalMiB] = line
        .split(',')
        .map((value) => value.trim())
      const parsedMemoryUsed = parseFiniteNumber(memoryUsedMiB)
      const parsedMemoryTotal = parseFiniteNumber(memoryTotalMiB)

      return {
        memoryTotalBytes:
          parsedMemoryTotal === null ? null : Math.max(0, parsedMemoryTotal) * mib,
        memoryUsedBytes:
          parsedMemoryUsed === null ? null : Math.max(0, parsedMemoryUsed) * mib,
        name,
        percent: parseFiniteNumber(percent),
      }
    })

  if (adapters.length === 0) {
    throw new Error('nvidia-smi did not report a GPU.')
  }

  return summarizeGpuAdapters(adapters, 'nvidia-smi')
}

async function readWindowsGpuStats() {
  const command = [
    '$counter = $null;',
    "try { $counter = Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction Stop } catch { }",
    '$percent = $null;',
    'if ($null -ne $counter) {',
    '$sum = ($counter.CounterSamples | Measure-Object -Property CookedValue -Sum).Sum;',
    'if ($null -ne $sum) { $percent = [Math]::Min(100, [Math]::Max(0, [double]$sum)) }',
    '}',
    '$controllers = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue |',
    'ForEach-Object {',
    '[pscustomobject]@{',
    'Name = $_.Name;',
    'AdapterRAM = if ($null -eq $_.AdapterRAM) { $null } else { [int64]$_.AdapterRAM }',
    '}',
    '});',
    '[pscustomobject]@{ Percent = $percent; Controllers = $controllers } | ConvertTo-Json -Depth 4 -Compress',
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
  const parsed = JSON.parse(stdout.trim() || '{}')
  const controllers = normalizeProcessRows(parsed.Controllers)
  const aggregatePercent = parseFiniteNumber(parsed.Percent)
  const adapters = controllers.map((controller, index) => {
    const memoryTotalBytes = parseFiniteNumber(controller.AdapterRAM)

    return {
      memoryTotalBytes:
        memoryTotalBytes === null || memoryTotalBytes <= 0 ? null : memoryTotalBytes,
      memoryUsedBytes: null,
      name: String(controller.Name || `Windows GPU ${index + 1}`),
      percent: null,
    }
  })
  const summary = summarizeGpuAdapters(
    adapters.length > 0
      ? adapters
      : [
          {
            memoryTotalBytes: null,
            memoryUsedBytes: null,
            name: 'Windows GPU engine',
            percent: aggregatePercent,
          },
        ],
    'windows-counter',
  )

  return {
    ...summary,
    detected: summary.detected || aggregatePercent !== null,
    percent: aggregatePercent === null ? summary.percent : clampPercent(aggregatePercent),
  }
}

async function readGpuStats() {
  try {
    return await readNvidiaGpuStats()
  } catch (nvidiaError) {
    if (process.platform === 'win32') {
      try {
        return await readWindowsGpuStats()
      } catch (windowsError) {
        return {
          adapters: [],
          detected: false,
          error: windowsError instanceof Error ? windowsError.message : String(windowsError),
          memoryTotalBytes: null,
          memoryUsedBytes: null,
          names: [],
          percent: null,
          provider: 'unavailable',
        }
      }
    }

    return {
      adapters: [],
      detected: false,
      error: nvidiaError instanceof Error ? nvidiaError.message : String(nvidiaError),
      memoryTotalBytes: null,
      memoryUsedBytes: null,
      names: [],
      percent: null,
      provider: 'unavailable',
    }
  }
}

export async function readSystemStats() {
  const cpuSnapshot = readCpuSnapshot()
  const totalBytes = os.totalmem()
  const freeBytes = os.freemem()
  const usedBytes = Math.max(0, totalBytes - freeBytes)
  const loadAverage = os.loadavg()
  const [modelProcesses, gpuStats] = await Promise.all([
    readModelProcesses(),
    readGpuStats(),
  ])

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
    gpu: gpuStats,
    ollama: modelProcesses,
  }
}
