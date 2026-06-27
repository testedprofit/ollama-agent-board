export type ConnectionState = 'checking' | 'online' | 'offline'

export type AgentStepStatus = 'idle' | 'active' | 'done' | 'error'

export type AgentStepLike = {
  id: string
  status: AgentStepStatus
  result: string
}

export type OllamaModelLike = {
  size?: number
}

export type SystemStatsLike = {
  memory: {
    freeBytes: number
    totalBytes: number
    usedPercent: number
  }
}

export type ContextSnapshot = {
  estimatedTokens: number
  percent: number
  status: 'ready' | 'watch' | 'tight'
}

export type RunQualityCheck = {
  detail: string
  label: string
  status: 'pass' | 'warn' | 'fail'
}

export function estimateTokensFromText(value: string): number {
  return Math.ceil(value.trim().length / 4)
}

export function getContextSnapshot(
  objective: string,
  sourceText: string,
  contextTokens: number,
): ContextSnapshot {
  const estimatedTokens =
    estimateTokensFromText(objective) + estimateTokensFromText(sourceText) + 600
  const percent = Math.min(100, Math.round((estimatedTokens / contextTokens) * 100))
  const status = percent >= 92 ? 'tight' : percent >= 72 ? 'watch' : 'ready'

  return {
    estimatedTokens,
    percent,
    status,
  }
}

export function getContextStatusLabel(status: ContextSnapshot['status']): string {
  if (status === 'tight') {
    return 'Tight'
  }

  if (status === 'watch') {
    return 'Watch'
  }

  return 'Ready'
}

export function getModelFitLabel(
  activeModel?: OllamaModelLike,
  systemStats?: SystemStatsLike | null,
) {
  if (!activeModel?.size || !systemStats) {
    return 'Unknown'
  }

  const freePercentAfterLoad =
    ((systemStats.memory.freeBytes - activeModel.size) / systemStats.memory.totalBytes) *
    100

  if (freePercentAfterLoad < 6) {
    return 'Tight RAM'
  }

  if (freePercentAfterLoad < 14) {
    return 'Watch RAM'
  }

  return 'Looks OK'
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

export function createRunQualityChecks({
  connection,
  context,
  output,
  selectedModel,
  steps,
  systemStats,
  totalPhaseCount,
}: {
  connection: ConnectionState
  context: ContextSnapshot
  output: string
  selectedModel: string
  steps: AgentStepLike[]
  systemStats: SystemStatsLike | null
  totalPhaseCount: number
}): RunQualityCheck[] {
  const completedSteps = steps.filter((step) => step.status === 'done').length
  const failedSteps = steps.filter((step) => step.status === 'error').length
  const reviewStep = steps.find((step) => step.id === 'review')
  const trimmedOutput = output.trim()

  return [
    {
      label: 'Runtime',
      status: connection === 'online' && selectedModel ? 'pass' : 'fail',
      detail:
        connection === 'online' && selectedModel
          ? `${selectedModel} is selected.`
          : 'Choose a reachable local model before running.',
    },
    {
      label: 'Context',
      status:
        context.status === 'ready'
          ? 'pass'
          : context.status === 'watch'
            ? 'warn'
            : 'fail',
      detail: `${context.estimatedTokens.toLocaleString()} estimated tokens, ${context.percent}% of the window.`,
    },
    {
      label: 'Phase chain',
      status: failedSteps > 0 ? 'fail' : completedSteps === totalPhaseCount ? 'pass' : 'warn',
      detail:
        failedSteps > 0
          ? `${failedSteps} phase${failedSteps === 1 ? '' : 's'} need attention.`
          : `${completedSteps}/${totalPhaseCount} phases complete.`,
    },
    {
      label: 'Review pass',
      status: reviewStep?.status === 'done' ? 'pass' : trimmedOutput ? 'warn' : 'fail',
      detail:
        reviewStep?.status === 'done'
          ? 'The review phase has checked the workbench output.'
          : trimmedOutput
            ? 'Quick output exists, but the full review phase has not run.'
            : 'Run the board or a quick action to create output.',
    },
    {
      label: 'Output',
      status: trimmedOutput.length >= 600 ? 'pass' : trimmedOutput.length > 0 ? 'warn' : 'fail',
      detail:
        trimmedOutput.length > 0
          ? `${trimmedOutput.length.toLocaleString()} output characters.`
          : 'No generated output yet.',
    },
    {
      label: 'Headroom',
      status:
        !systemStats || systemStats.memory.usedPercent < 86
          ? 'pass'
          : systemStats.memory.usedPercent < 94
            ? 'warn'
            : 'fail',
      detail: systemStats
        ? `${formatPercent(systemStats.memory.usedPercent)} memory in use.`
        : 'System stats are still sampling.',
    },
  ]
}

export function calculateRunQualityScore(checks: RunQualityCheck[]): number {
  if (checks.length === 0) {
    return 0
  }

  const points = checks.reduce((total, check) => {
    if (check.status === 'pass') {
      return total + 1
    }

    if (check.status === 'warn') {
      return total + 0.55
    }

    return total
  }, 0)

  return Math.round((points / checks.length) * 100)
}
