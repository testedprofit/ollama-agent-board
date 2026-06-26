import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import {
  Activity,
  Boxes,
  Brain,
  CheckCircle2,
  ClipboardList,
  Cpu,
  Download,
  FileText,
  Layers3,
  Loader2,
  Play,
  RefreshCcw,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import '@xyflow/react/dist/style.css'
import './App.css'

type ConnectionState = 'checking' | 'online' | 'offline'
type PhaseStatus = 'idle' | 'active' | 'done' | 'error'
type QuickTask = 'summarize' | 'tasks' | 'rewrite' | 'explain'

type AgentPhase = {
  id: string
  title: string
  role: string
  prompt: string
  demo: string
  icon: LucideIcon
  accent: string
}

type AgentStep = {
  id: string
  status: PhaseStatus
  result: string
  duration?: number
}

type AgentNodeData = AgentPhase & {
  status: PhaseStatus
  result: string
}

type AgentNodeType = Node<AgentNodeData, 'agent'>

type OllamaModel = {
  name: string
  modified_at?: string
  size?: number
}

type TagsResponse = {
  models?: OllamaModel[]
}

type GenerateResponse = {
  response?: string
}

type SavedRun = {
  id: string
  createdAt: string
  objective: string
  model: string
  output: string
}

type Template = {
  title: string
  objective: string
  sourceText: string
  icon: LucideIcon
}

const matrixStreams = [
  '010110100101101001011010010110100101101001011010010110',
  '101101001011010010110100101101001011010010110100101101',
  '001101101001110010010110010110100101101001011010010110',
  '110010101101001101010010101001101011010110010100100101',
  '011001101010100110010101001011010110110100101001010110',
  '100101011010011010100101110010110100001101001011101001',
]

const agentPhases: AgentPhase[] = [
  {
    id: 'intake',
    title: 'Intake',
    role: 'Goal mapper',
    prompt:
      'Restate the user goal, define the outcome, identify missing context, and name the best first move.',
    demo:
      'Outcome: a private local AI workspace. Missing context: target model and first data source. First move: confirm Ollama is online and choose a lightweight workflow.',
    icon: ClipboardList,
    accent: '#0f8b8d',
  },
  {
    id: 'strategy',
    title: 'Strategy',
    role: 'Planner',
    prompt:
      'Break the goal into a sequence of useful local AI actions. Prefer concrete steps and simple checkpoints.',
    demo:
      'Plan: ingest the material, extract decisions, draft the artifact, critique it, then export the final version as markdown.',
    icon: Brain,
    accent: '#6d5dfc',
  },
  {
    id: 'workbench',
    title: 'Workbench',
    role: 'Maker',
    prompt:
      'Produce the highest leverage draft or structured output for this stage. Be specific and practical.',
    demo:
      'Drafted a reusable board with saved runs, quick text actions, and a five-node local agent loop.',
    icon: Boxes,
    accent: '#d85a3a',
  },
  {
    id: 'review',
    title: 'Review',
    role: 'Critic',
    prompt:
      'Review the prior output for risk, gaps, unclear assumptions, and what should happen next.',
    demo:
      'Risk: users may not have a model pulled yet. Add clear offline states and a demo run so the interface still teaches itself.',
    icon: SearchCheck,
    accent: '#2d7d46',
  },
  {
    id: 'ship',
    title: 'Ship',
    role: 'Closer',
    prompt:
      'Return a concise final answer with next actions, reusable artifacts, and any command the user should run.',
    demo:
      'Ready to use: start Ollama, pull a model, run the app, pick a workflow, then export the generated run notes.',
    icon: ShieldCheck,
    accent: '#a15c00',
  },
]

const templates: Template[] = [
  {
    title: 'Inbox triage',
    objective:
      'Turn a messy inbox dump into priority buckets, reply drafts, and follow-up actions.',
    sourceText:
      'Paste emails, chat exports, or notes here. The local agent will separate urgent work, waiting items, FYI material, and draft replies.',
    icon: Layers3,
  },
  {
    title: 'Study system',
    objective:
      'Convert source material into a study guide, quiz, flashcards, and a short memory plan.',
    sourceText:
      'Paste a chapter, article, or lecture transcript here. Ask the agent to preserve formulas, names, examples, and dates.',
    icon: Sparkles,
  },
  {
    title: 'Code review',
    objective:
      'Review code for bugs, missing tests, performance issues, and a minimal patch plan.',
    sourceText:
      'Paste a diff, file, or error log here. Keep the review grounded in exact lines and reproducible behavior.',
    icon: SquareTerminal,
  },
  {
    title: 'Launch brief',
    objective:
      'Turn raw product notes into positioning, risks, launch tasks, and customer-facing copy.',
    sourceText:
      'Paste notes, customer comments, roadmap bullets, or a rough product idea. The agent will turn it into a launch-ready brief.',
    icon: Zap,
  },
]

const quickTaskLabels: Record<QuickTask, string> = {
  summarize: 'Summarize',
  tasks: 'Extract tasks',
  rewrite: 'Rewrite',
  explain: 'Explain',
}

const defaultObjective =
  'Build a useful personal AI system that runs locally with Ollama, protects private data, and turns messy input into finished work.'

const sampleText =
  'Local AI is most useful when it becomes a daily work surface: summarize documents, plan projects, review drafts, extract tasks, and keep private data on the machine. The product should feel visual, fast, and useful before a user reads docs.'

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

function createInitialSteps(): AgentStep[] {
  return agentPhases.map((phase) => ({
    id: phase.id,
    status: 'idle',
    result: '',
  }))
}

function loadStoredRuns(): SavedRun[] {
  try {
    const stored = localStorage.getItem('ollama-agent-board:runs')
    if (!stored) {
      return []
    }
    const parsed = JSON.parse(stored) as SavedRun[]
    return Array.isArray(parsed) ? parsed.slice(0, 8) : []
  } catch {
    return []
  }
}

function formatBytes(size?: number): string {
  if (!size) {
    return 'local model'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = size
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function buildPhasePrompt(
  phase: AgentPhase,
  objective: string,
  sourceText: string,
  priorOutput: string,
): string {
  return [
    'You are one worker inside a local AI agent board powered by Ollama.',
    'Keep the answer useful, concrete, and concise. Use markdown bullets when helpful.',
    `Current phase: ${phase.title} (${phase.role}).`,
    `Phase instruction: ${phase.prompt}`,
    `User objective: ${objective}`,
    sourceText ? `Source material:\n${sourceText}` : 'Source material: none provided.',
    priorOutput ? `Prior agent output:\n${priorOutput}` : 'Prior agent output: none yet.',
    'Return only the work for this phase.',
  ].join('\n\n')
}

function buildQuickPrompt(task: QuickTask, sourceText: string, objective: string): string {
  const material = sourceText.trim() || objective.trim()
  const actionMap: Record<QuickTask, string> = {
    summarize:
      'Summarize this material into a crisp executive brief with important details preserved.',
    tasks:
      'Extract a prioritized task list with owners, dependencies, and uncertainty called out when unknown.',
    rewrite: 'Rewrite this material so it is clearer, more direct, and ready to send.',
    explain:
      'Explain this material in plain language, then include the assumptions and edge cases.',
  }

  return [
    'You are running locally through Ollama. Do not mention cloud services.',
    actionMap[task],
    `Material:\n${material}`,
  ].join('\n\n')
}

async function generateWithOllama(model: string, prompt: string): Promise<string> {
  const response = await fetch('/api/ollama/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.35,
        num_ctx: 4096,
      },
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Ollama returned ${response.status}`)
  }

  const data = (await response.json()) as GenerateResponse
  return data.response?.trim() || 'The model returned an empty response.'
}

function createRunMarkdown(run: SavedRun): string {
  return [
    `# ${run.objective}`,
    '',
    `Model: ${run.model}`,
    `Created: ${new Date(run.createdAt).toLocaleString()}`,
    '',
    run.output,
    '',
  ].join('\n')
}

function AgentNode({ data }: NodeProps<AgentNodeType>) {
  const Icon = data.icon
  const statusLabel =
    data.status === 'active'
      ? 'Running'
      : data.status === 'done'
        ? 'Done'
        : data.status === 'error'
          ? 'Needs attention'
          : 'Ready'

  return (
    <div
      className={`agent-node agent-node-${data.status}`}
      style={{ '--node-accent': data.accent } as CSSProperties}
    >
      <Handle className="node-handle" type="target" position={Position.Left} />
      <div className="agent-node-top">
        <span className="agent-node-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
        <span className="agent-node-status">{statusLabel}</span>
      </div>
      <div>
        <strong>{data.title}</strong>
        <span>{data.role}</span>
      </div>
      <p>{data.result || data.prompt}</p>
      <Handle className="node-handle" type="source" position={Position.Right} />
    </div>
  )
}

function MatrixThinkingOverlay() {
  return (
    <div className="matrix-thinking-overlay" aria-live="polite" aria-label="Agent is thinking">
      <div className="matrix-grid-glow" aria-hidden="true"></div>
      <div className="matrix-rain" aria-hidden="true">
        {Array.from({ length: 38 }, (_, index) => {
          const stream = matrixStreams[index % matrixStreams.length]
          const style = {
            '--matrix-left': `${(index * 2.75) % 100}%`,
            '--matrix-duration': `${4.4 + (index % 8) * 0.42}s`,
            '--matrix-delay': `${(index % 13) * -0.34}s`,
            '--matrix-size': `${13 + (index % 5)}px`,
          } as CSSProperties

          return (
            <span
              className={`matrix-column ${index % 3 === 0 ? 'matrix-column-rise' : ''}`}
              key={`${stream}-${index}`}
              style={style}
            >
              {stream}
            </span>
          )
        })}
      </div>
      <div className="matrix-thinking-label">
        <span>AGENT IS THINKING</span>
        <small>local model running</small>
      </div>
    </div>
  )
}

const nodeTypes = {
  agent: AgentNode,
}

function App() {
  const [models, setModels] = useState<OllamaModel[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [connection, setConnection] = useState<ConnectionState>('checking')
  const [objective, setObjective] = useState(defaultObjective)
  const [sourceText, setSourceText] = useState(sampleText)
  const [steps, setSteps] = useState<AgentStep[]>(createInitialSteps)
  const [history, setHistory] = useState<SavedRun[]>(loadStoredRuns)
  const [consoleLines, setConsoleLines] = useState<string[]>([
    'Waiting for a local Ollama model.',
  ])
  const [quickTask, setQuickTask] = useState<QuickTask>('summarize')
  const [quickOutput, setQuickOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isAgentThinking, setIsAgentThinking] = useState(false)

  const activeModel = models.find((model) => model.name === selectedModel)
  const completedSteps = steps.filter((step) => step.status === 'done').length
  const isOnline = connection === 'online'

  const appendConsole = (message: string) => {
    setConsoleLines((current) =>
      [`${timeFormatter.format(new Date())} - ${message}`, ...current].slice(0, 10),
    )
  }

  const refreshModels = async () => {
    setConnection('checking')
    try {
      const response = await fetch('/api/ollama/tags')
      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`)
      }
      const data = (await response.json()) as TagsResponse
      const nextModels = data.models ?? []
      setModels(nextModels)
      setSelectedModel((current) => current || nextModels[0]?.name || '')
      setConnection(nextModels.length > 0 ? 'online' : 'offline')
      appendConsole(
        nextModels.length > 0
          ? `Found ${nextModels.length} Ollama model${nextModels.length === 1 ? '' : 's'}.`
          : 'Ollama is reachable, but no models were found.',
      )
    } catch {
      setModels([])
      setSelectedModel('')
      setConnection('offline')
      appendConsole('Ollama is offline or not reachable at localhost:11434.')
    }
  }

  useEffect(() => {
    void refreshModels()
  }, [])

  useEffect(() => {
    localStorage.setItem('ollama-agent-board:runs', JSON.stringify(history))
  }, [history])

  const nodes = useMemo<AgentNodeType[]>(
    () =>
      agentPhases.map((phase, index) => {
        const step = steps.find((candidate) => candidate.id === phase.id)
        return {
          id: phase.id,
          type: 'agent',
          position: {
            x: index % 2 === 0 ? 40 : 380,
            y: 26 + index * 102,
          },
          data: {
            ...phase,
            status: step?.status ?? 'idle',
            result: step?.result ?? '',
          },
        }
      }),
    [steps],
  )

  const edges = useMemo<Edge[]>(
    () =>
      agentPhases.slice(0, -1).map((phase, index) => {
        const nextPhase = agentPhases[index + 1]
        const step = steps.find((candidate) => candidate.id === phase.id)
        const edgeDone = step?.status === 'done'
        return {
          id: `${phase.id}-${nextPhase.id}`,
          source: phase.id,
          target: nextPhase.id,
          animated: step?.status === 'active',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edgeDone ? phase.accent : '#94a3b8',
          },
          style: {
            stroke: edgeDone ? phase.accent : '#94a3b8',
            strokeWidth: edgeDone ? 3 : 2,
          },
        }
      }),
    [steps],
  )

  const runAgent = async () => {
    if (!selectedModel) {
      appendConsole('Pull a model with `ollama pull llama3.2` before running the board.')
      setConnection('offline')
      return
    }

    setIsRunning(true)
    setIsAgentThinking(true)
    setSteps(createInitialSteps())
    setQuickOutput('')
    appendConsole(`Started local agent run on ${selectedModel}.`)

    let accumulated = ''
    const runStartedAt = new Date().toISOString()

    try {
      for (const phase of agentPhases) {
        const phaseStarted = performance.now()
        setSteps((current) =>
          current.map((step) =>
            step.id === phase.id ? { ...step, status: 'active', result: '' } : step,
          ),
        )
        appendConsole(`${phase.title} phase is running.`)

        const result = await generateWithOllama(
          selectedModel,
          buildPhasePrompt(phase, objective, sourceText, accumulated),
        )
        accumulated = `${accumulated}\n\n## ${phase.title}\n${result}`.trim()

        setSteps((current) =>
          current.map((step) =>
            step.id === phase.id
              ? {
                  ...step,
                  status: 'done',
                  result,
                  duration: Math.round(performance.now() - phaseStarted),
                }
              : step,
          ),
        )
      }

      setHistory((current) =>
        [
          {
            id: crypto.randomUUID(),
            createdAt: runStartedAt,
            objective,
            model: selectedModel,
            output: accumulated,
          },
          ...current,
        ].slice(0, 8),
      )
      appendConsole('Agent run completed and saved locally.')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The local agent run failed.'
      setSteps((current) =>
        current.map((step) =>
          step.status === 'active'
            ? { ...step, status: 'error', result: message }
            : step,
        ),
      )
      appendConsole(message)
    } finally {
      setIsAgentThinking(false)
      setIsRunning(false)
    }
  }

  const runQuickTask = async () => {
    if (!selectedModel) {
      appendConsole('Choose an Ollama model before running a quick action.')
      return
    }

    setQuickOutput('')
    setIsRunning(true)
    appendConsole(`${quickTaskLabels[quickTask]} quick action started.`)

    try {
      const result = await generateWithOllama(
        selectedModel,
        buildQuickPrompt(quickTask, sourceText, objective),
      )
      setQuickOutput(result)
      appendConsole(`${quickTaskLabels[quickTask]} quick action completed.`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The quick action failed.'
      setQuickOutput(message)
      appendConsole(message)
    } finally {
      setIsRunning(false)
    }
  }

  const loadTemplate = (template: Template) => {
    setObjective(template.objective)
    setSourceText(template.sourceText)
    appendConsole(`${template.title} template loaded.`)
  }

  const loadDemoRun = () => {
    const demoOutput = agentPhases
      .map((phase) => `## ${phase.title}\n${phase.demo}`)
      .join('\n\n')
    setSteps(
      agentPhases.map((phase) => ({
        id: phase.id,
        status: 'done',
        result: phase.demo,
        duration: 300,
      })),
    )
    setQuickOutput(demoOutput)
    appendConsole('Demo run loaded.')
  }

  const exportLatestRun = () => {
    const latestRun =
      history[0] ??
      ({
        id: 'current',
        createdAt: new Date().toISOString(),
        objective,
        model: selectedModel || 'demo',
        output:
          quickOutput ||
          steps
            .map((step) => {
              const phase = agentPhases.find((candidate) => candidate.id === step.id)
              return `## ${phase?.title ?? step.id}\n${step.result || 'No output yet.'}`
            })
            .join('\n\n'),
      } satisfies SavedRun)

    const blob = new Blob([createRunMarkdown(latestRun)], {
      type: 'text/markdown;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'ollama-agent-run.md'
    link.click()
    URL.revokeObjectURL(url)
    appendConsole('Markdown export created.')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">
            <Workflow size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Ollama Agent Board</p>
            <h1>Local AI command surface</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className={`status-pill status-${connection}`}>
            {connection === 'checking' ? (
              <Loader2 size={15} aria-hidden="true" />
            ) : (
              <Activity size={15} aria-hidden="true" />
            )}
            <span>
              {connection === 'checking'
                ? 'Checking'
                : isOnline
                  ? 'Ollama online'
                  : 'Ollama offline'}
            </span>
          </div>
          <button className="icon-button" type="button" onClick={refreshModels}>
            <RefreshCcw size={17} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="control-panel">
          <section className="panel-section">
            <div className="section-title">
              <Cpu size={18} aria-hidden="true" />
              <h2>Model</h2>
            </div>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              disabled={models.length === 0}
            >
              {models.length === 0 ? (
                <option>No local models found</option>
              ) : (
                models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name}
                  </option>
                ))
              )}
            </select>
            <div className="model-meta">
              <span>{activeModel ? formatBytes(activeModel.size) : 'Start Ollama'}</span>
              <span>
                {completedSteps}/{agentPhases.length} phases
              </span>
            </div>
          </section>

          <section className="panel-section">
            <div className="section-title">
              <Sparkles size={18} aria-hidden="true" />
              <h2>Goal</h2>
            </div>
            <textarea
              className="goal-input"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
            />
            <div className="button-row">
              <button
                className="primary-button"
                type="button"
                onClick={runAgent}
                disabled={isRunning}
              >
                {isRunning ? (
                  <Loader2 size={17} aria-hidden="true" />
                ) : (
                  <Play size={17} aria-hidden="true" />
                )}
                <span>{isRunning ? 'Running' : 'Run agent'}</span>
              </button>
              <button className="ghost-button" type="button" onClick={loadDemoRun}>
                <Zap size={17} aria-hidden="true" />
                <span>Demo</span>
              </button>
            </div>
          </section>

          <section className="panel-section">
            <div className="section-title">
              <Layers3 size={18} aria-hidden="true" />
              <h2>Templates</h2>
            </div>
            <div className="template-list">
              {templates.map((template) => {
                const Icon = template.icon
                return (
                  <button
                    className="template-button"
                    type="button"
                    key={template.title}
                    onClick={() => loadTemplate(template)}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span>{template.title}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </aside>

        <section className="canvas-panel">
          <div className="canvas-toolbar">
            <div>
              <p className="eyebrow">Agent loop</p>
              <h2>Five local model passes</h2>
            </div>
            <button className="ghost-button" type="button" onClick={exportLatestRun}>
              <Download size={17} aria-hidden="true" />
              <span>Export</span>
            </button>
          </div>
          <div className="flow-shell">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.5}
              maxZoom={1.35}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={22} size={1} color="#cbd5e1" />
              <Controls showInteractive={false} />
            </ReactFlow>
            {isAgentThinking ? <MatrixThinkingOverlay /> : null}
          </div>
        </section>

        <aside className="output-panel">
          <section className="panel-section">
            <div className="section-title">
              <FileText size={18} aria-hidden="true" />
              <h2>Source</h2>
            </div>
            <textarea
              className="source-input"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
            />
            <div className="quick-actions">
              {(Object.keys(quickTaskLabels) as QuickTask[]).map((task) => (
                <button
                  key={task}
                  type="button"
                  className={quickTask === task ? 'mode-button active' : 'mode-button'}
                  onClick={() => setQuickTask(task)}
                >
                  {quickTaskLabels[task]}
                </button>
              ))}
            </div>
            <button
              className="primary-button full-width"
              type="button"
              onClick={runQuickTask}
              disabled={isRunning}
            >
              <Sparkles size={17} aria-hidden="true" />
              <span>Run quick action</span>
            </button>
          </section>

          <section className="panel-section output-section">
            <div className="section-title">
              <CheckCircle2 size={18} aria-hidden="true" />
              <h2>Output</h2>
            </div>
            <div className="output-box">
              {quickOutput ||
                steps
                  .filter((step) => step.result)
                  .map((step) => {
                    const phase = agentPhases.find((candidate) => candidate.id === step.id)
                    return `${phase?.title ?? step.id}: ${step.result}`
                  })
                  .join('\n\n') ||
                'Run the board or a quick action to generate local output.'}
            </div>
          </section>

          <section className="panel-section">
            <div className="section-title">
              <SquareTerminal size={18} aria-hidden="true" />
              <h2>Console</h2>
            </div>
            <div className="console-list">
              {consoleLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </section>

          <section className="panel-section history-section">
            <div className="section-title">
              <Activity size={18} aria-hidden="true" />
              <h2>Runs</h2>
            </div>
            {history.length === 0 ? (
              <p className="muted">No saved runs yet.</p>
            ) : (
              <div className="run-list">
                {history.map((run) => (
                  <button
                    type="button"
                    className="run-button"
                    key={run.id}
                    onClick={() => setQuickOutput(run.output)}
                  >
                    <strong>{run.objective}</strong>
                    <span>
                      {run.model} - {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  )
}

export default App
