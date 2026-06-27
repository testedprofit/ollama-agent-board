import { describe, expect, it } from 'vitest'
import {
  calculateRunQualityScore,
  createRunQualityChecks,
  getContextSnapshot,
  getModelFitLabel,
} from './localQa'

describe('local QA helpers', () => {
  it('estimates context pressure with ready, watch, and tight bands', () => {
    expect(getContextSnapshot('short goal', 'short source', 4096)).toMatchObject({
      status: 'ready',
    })

    expect(getContextSnapshot('', 'x'.repeat(9800), 4096)).toMatchObject({
      status: 'watch',
    })

    expect(getContextSnapshot('', 'x'.repeat(14000), 4096)).toMatchObject({
      percent: 100,
      status: 'tight',
    })
  })

  it('labels model memory fit from model size and available RAM', () => {
    const stats = {
      memory: {
        freeBytes: 4_000_000_000,
        totalBytes: 16_000_000_000,
        usedPercent: 75,
      },
    }

    expect(getModelFitLabel({ size: 1_000_000_000 }, stats)).toBe('Looks OK')
    expect(getModelFitLabel({ size: 2_600_000_000 }, stats)).toBe('Watch RAM')
    expect(getModelFitLabel({ size: 3_300_000_000 }, stats)).toBe('Tight RAM')
  })

  it('builds actionable run quality checks and a weighted score', () => {
    const checks = createRunQualityChecks({
      connection: 'online',
      context: getContextSnapshot('ship this', 'useful source', 4096),
      output: 'x'.repeat(700),
      selectedModel: 'llama3.2',
      steps: ['intake', 'strategy', 'workbench', 'review', 'ship'].map((id) => ({
        id,
        result: `${id} result`,
        status: 'done',
      })),
      systemStats: {
        memory: {
          freeBytes: 8_000_000_000,
          totalBytes: 16_000_000_000,
          usedPercent: 50,
        },
      },
      totalPhaseCount: 5,
    })

    expect(checks.every((check) => check.status === 'pass')).toBe(true)
    expect(calculateRunQualityScore(checks)).toBe(100)
  })
})
