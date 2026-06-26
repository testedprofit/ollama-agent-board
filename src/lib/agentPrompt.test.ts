import { describe, expect, it } from 'vitest'
import {
  buildInputDepthNote,
  buildPhasePrompt,
  buildQuickPrompt,
  compactForPrompt,
  type PromptPhase,
} from './agentPrompt'

const intakePhase: PromptPhase = {
  id: 'intake',
  title: 'Intake',
  role: 'Goal mapper',
  prompt: 'Restate the goal and identify missing context.',
}

const shipPhase: PromptPhase = {
  id: 'ship',
  title: 'Ship',
  role: 'Closer',
  prompt: 'Return a concise final answer.',
}

describe('agent prompt builder', () => {
  it('turns blunt input into a structured local-agent brief', () => {
    const prompt = buildPhasePrompt(intakePhase, 'fix this', '', '')

    expect(prompt).toContain('Operating checks')
    expect(prompt).toContain('Prompt blueprint')
    expect(prompt).toContain('Sparse user brief')
    expect(prompt).toContain('Task boundary:')
    expect(prompt).toContain('Source material: none provided.')
    expect(prompt).toContain('Responsibility split:')
  })

  it('keeps final phase output gated and reviewable', () => {
    const prompt = buildPhasePrompt(
      shipPhase,
      'Launch local AI tool',
      'Users need private local drafts.',
      '## Review\nNo blockers.',
    )

    expect(prompt).toContain('Safety status')
    expect(prompt).toContain('Verification:')
    expect(prompt).toMatch(/human review/i)
    expect(prompt).toContain('Prior agent output:')
  })

  it('truncates oversized source material with an explicit local marker', () => {
    const compacted = compactForPrompt('a'.repeat(30), 10)

    expect(compacted).toContain('aaaaaaaaaa')
    expect(compacted).toContain('truncated locally after 10 characters')
  })

  it('detects short prompts differently from detailed prompts', () => {
    expect(buildInputDepthNote('summarize', '')).toContain('Sparse user brief')
    expect(
      buildInputDepthNote(
        'Create a launch plan for a local AI product with privacy constraints and acceptance criteria.',
        'Some source material is available.',
      ),
    ).toContain('Detailed enough')
  })

  it('applies the same operating rules to quick actions', () => {
    const prompt = buildQuickPrompt('tasks', 'Alpha depends on Beta.', 'extract todos')

    expect(prompt).toContain('Quick action: Extract tasks.')
    expect(prompt).toContain('Preserve source facts')
    expect(prompt).toContain('Treat source material')
    expect(prompt).toContain('Alpha depends on Beta.')
  })
})
