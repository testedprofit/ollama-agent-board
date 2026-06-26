import {
  type ChangeEvent,
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
  Copy,
  Cpu,
  Database,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Gauge,
  GitBranch,
  HardDrive,
  History,
  Layers3,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Play,
  Plus,
  RefreshCcw,
  SearchCheck,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquareTerminal,
  Trash2,
  Upload,
  Wrench,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import '@xyflow/react/dist/style.css'
import './App.css'
import {
  buildPhasePrompt,
  buildQuickPrompt,
  defaultObjective,
  quickTaskLabels,
  sampleText,
  type QuickTask,
} from './lib/agentPrompt'

type ConnectionState = 'checking' | 'online' | 'offline'
type PhaseStatus = 'idle' | 'active' | 'done' | 'error'
type AppView = 'board' | 'settings'

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

type OllamaErrorResponse = {
  detail?: string
  error?: string
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

type Prerequisite = {
  id: string
  title: string
  description: string
  href: string
  linkLabel: string
  command?: string
  commandLabel?: string
  icon: LucideIcon
  status: 'online' | 'offline' | 'checking' | 'neutral'
  statusLabel: string
}

type AppSettings = {
  autoSelectModel: boolean
  contextTokens: number
  defaultWorkbenchScale: number
  matrixRain: boolean
  requestTimeoutSeconds: number
  saveRunHistory: boolean
  startWorkbenchExpanded: boolean
  temperature: number
  historyLimit: number
}

type GenerationOptions = Pick<
  AppSettings,
  'contextTokens' | 'requestTimeoutSeconds' | 'temperature'
>

type WorkbenchPhaseId = 'final' | string

type AgentWorkbenchWindowProps = {
  isExpanded: boolean
  isThinking: boolean
  matrixRain: boolean
  onScaleChange: (scale: number) => void
  onSelectPhase: (phaseId: WorkbenchPhaseId) => void
  onToggleExpanded: () => void
  output: string
  scale: number
  selectedPhaseId: WorkbenchPhaseId
  steps: AgentStep[]
}

type PhaseProgressRailProps = {
  steps: AgentStep[]
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
      'Clarify the brief, restate the goal as a useful work order, infer a sane outcome from sparse input, identify material missing context, and name the first safe move.',
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
      'Break the goal into useful local AI actions with checkpoints, stop conditions, acceptance criteria, and a small reviewable path.',
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
      'Use the available evidence to produce the highest leverage artifact for this stage: specific, practical, structured, and ready for downstream review.',
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
      'Review the prior output for accuracy, evidence, risk, gaps, unclear assumptions, and what should be fixed before use.',
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
      'Return a concise final answer with reusable artifacts, verification notes, safety status, and the next safe prompt or action.',
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

const setupLinks = {
  gitWindows: 'https://git-scm.com/install/windows',
  nodeDownload: 'https://nodejs.org/en/download',
  ollamaWindows: 'https://ollama.com/download/windows',
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

const historyStorageKey = 'ollama-agent-board:runs'
const selectedModelStorageKey = 'ollama-agent-board:selected-model'
const settingsStorageKey = 'ollama-agent-board:settings'
const modelRefreshTimeoutMs = 10000
const defaultAppSettings: AppSettings = {
  autoSelectModel: true,
  contextTokens: 4096,
  defaultWorkbenchScale: 1,
  historyLimit: 8,
  matrixRain: true,
  requestTimeoutSeconds: 180,
  saveRunHistory: true,
  startWorkbenchExpanded: false,
  temperature: 0.35,
}

function createInitialSteps(): AgentStep[] {
  return agentPhases.map((phase) => ({
    id: phase.id,
    status: 'idle',
    result: '',
  }))
}

function isSavedRun(value: unknown): value is SavedRun {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<SavedRun>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.objective === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.output === 'string'
  )
}

function loadStoredRuns(): SavedRun[] {
  try {
    const stored = localStorage.getItem(historyStorageKey)
    if (!stored) {
      return []
    }
    const parsed = JSON.parse(stored) as unknown
    return Array.isArray(parsed) ? parsed.filter(isSavedRun).slice(0, 8) : []
  } catch {
    return []
  }
}

function loadPreferredModel(): string {
  try {
    return localStorage.getItem(selectedModelStorageKey) ?? ''
  } catch {
    return ''
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(max, Math.max(min, parsed))
}

function sanitizeSettings(value: unknown): AppSettings {
  const candidate = isRecord(value) ? value : {}
  const contextTokens = Math.round(
    clampNumber(candidate.contextTokens, defaultAppSettings.contextTokens, 1024, 32768),
  )
  const historyLimit = Math.round(
    clampNumber(candidate.historyLimit, defaultAppSettings.historyLimit, 1, 30),
  )
  const requestTimeoutSeconds = Math.round(
    clampNumber(
      candidate.requestTimeoutSeconds,
      defaultAppSettings.requestTimeoutSeconds,
      30,
      600,
    ),
  )

  return {
    autoSelectModel:
      typeof candidate.autoSelectModel === 'boolean'
        ? candidate.autoSelectModel
        : defaultAppSettings.autoSelectModel,
    contextTokens,
    defaultWorkbenchScale: clampNumber(
      candidate.defaultWorkbenchScale,
      defaultAppSettings.defaultWorkbenchScale,
      0.82,
      1.28,
    ),
    historyLimit,
    matrixRain:
      typeof candidate.matrixRain === 'boolean'
        ? candidate.matrixRain
        : defaultAppSettings.matrixRain,
    requestTimeoutSeconds,
    saveRunHistory:
      typeof candidate.saveRunHistory === 'boolean'
        ? candidate.saveRunHistory
        : defaultAppSettings.saveRunHistory,
    startWorkbenchExpanded:
      typeof candidate.startWorkbenchExpanded === 'boolean'
        ? candidate.startWorkbenchExpanded
        : defaultAppSettings.startWorkbenchExpanded,
    temperature: clampNumber(
      candidate.temperature,
      defaultAppSettings.temperature,
      0,
      1,
    ),
  }
}

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(settingsStorageKey)
    return sanitizeSettings(stored ? JSON.parse(stored) : defaultAppSettings)
  } catch {
    return defaultAppSettings
  }
}

function saveStoredRuns(history: SavedRun[]): boolean {
  try {
    localStorage.setItem(historyStorageKey, JSON.stringify(history))
    return true
  } catch {
    return false
  }
}

function savePreferredModel(model: string): void {
  try {
    if (model) {
      localStorage.setItem(selectedModelStorageKey, model)
    } else {
      localStorage.removeItem(selectedModelStorageKey)
    }
  } catch {
    // Browser privacy modes can disable localStorage. The app still works without it.
  }
}

function saveSettings(settings: AppSettings): boolean {
  try {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the DOM copy path for embedded or restricted browsers.
  }

  const activeElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.left = '-9999px'
  textArea.style.position = 'fixed'
  textArea.style.top = '0'

  document.body.appendChild(textArea)
  textArea.focus()
  textArea.select()
  textArea.setSelectionRange(0, textArea.value.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textArea)
    activeElement?.focus({ preventScroll: true })
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

function createRequestSignal(timeoutMs: number, externalSignal?: AbortSignal) {
  const controller = new AbortController()
  let didTimeout = false
  const abortFromExternal = () => controller.abort()
  const timeoutId = window.setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)

  if (externalSignal?.aborted) {
    abortFromExternal()
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeoutId)
      externalSignal?.removeEventListener('abort', abortFromExternal)
    },
    didTimeout: () => didTimeout,
    wasExternalAbort: () => Boolean(externalSignal?.aborted),
  }
}

async function readResponseError(response: Response): Promise<string> {
  const text = await response.text()

  if (!text) {
    return `Ollama returned ${response.status}`
  }

  try {
    const parsed = JSON.parse(text) as OllamaErrorResponse
    return [parsed.error, parsed.detail].filter(Boolean).join(' - ') || text
  } catch {
    return text
  }
}

async function fetchOllamaJson<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  const requestSignal = createRequestSignal(timeoutMs, externalSignal)

  try {
    const response = await fetch(path, {
      ...init,
      signal: requestSignal.signal,
    })

    if (!response.ok) {
      throw new Error(await readResponseError(response))
    }

    return (await response.json()) as T
  } catch (error) {
    if (requestSignal.signal.aborted) {
      if (requestSignal.didTimeout()) {
        throw new Error(
          `Ollama request timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
        )
      }

      if (requestSignal.wasExternalAbort()) {
        throw new Error('Request stopped by user.')
      }
    }

    throw error
  } finally {
    requestSignal.cleanup()
  }
}

async function generateWithOllama(
  model: string,
  prompt: string,
  generationOptions: GenerationOptions,
  signal?: AbortSignal,
): Promise<string> {
  const data = await fetchOllamaJson<GenerateResponse>(
    '/api/ollama/generate',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: generationOptions.temperature,
          num_ctx: generationOptions.contextTokens,
        },
      }),
    },
    generationOptions.requestTimeoutSeconds * 1000,
    signal,
  )

  return data.response?.trim() || 'The model returned an empty response.'
}

async function fetchOllamaModels(): Promise<OllamaModel[]> {
  const data = await fetchOllamaJson<TagsResponse>(
    '/api/ollama/tags',
    {
      method: 'GET',
    },
    modelRefreshTimeoutMs,
  )

  return data.models ?? []
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

function downloadTextFile(fileName: string, contents: string, type: string): void {
  const blob = new Blob([contents], {
    type,
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function composeAgentOutput(steps: AgentStep[]): string {
  return steps
    .filter((step) => step.result)
    .map((step) => {
      const phase = agentPhases.find((candidate) => candidate.id === step.id)
      return `## ${phase?.title ?? step.id}\n${step.result}`
    })
    .join('\n\n')
}

function getPhaseStatusLabel(status: PhaseStatus): string {
  if (status === 'active') {
    return 'Running'
  }

  if (status === 'done') {
    return 'Done'
  }

  if (status === 'error') {
    return 'Needs attention'
  }

  return 'Ready'
}

function AgentNode({ data }: NodeProps<AgentNodeType>) {
  const Icon = data.icon
  const statusLabel = getPhaseStatusLabel(data.status)

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

function PhaseProgressRail({ steps }: PhaseProgressRailProps) {
  return (
    <div className="phase-progress-rail" aria-label="Agent run progress">
      {agentPhases.map((phase, index) => {
        const step = steps.find((candidate) => candidate.id === phase.id)
        const status = step?.status ?? 'idle'
        return (
          <div className={`phase-progress-item phase-progress-${status}`} key={phase.id}>
            <span className="phase-progress-index">{index + 1}</span>
            <div>
              <strong>{phase.title}</strong>
              <span>{getPhaseStatusLabel(status)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MatrixRain() {
  return (
    <>
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
    </>
  )
}

function AgentWorkbenchWindow({
  isExpanded,
  isThinking,
  matrixRain,
  onScaleChange,
  onSelectPhase,
  onToggleExpanded,
  output,
  scale,
  selectedPhaseId,
  steps,
}: AgentWorkbenchWindowProps) {
  const [copied, setCopied] = useState(false)
  const activeStep = steps.find((step) => step.status === 'active')
  const selectedStep =
    selectedPhaseId === 'final'
      ? undefined
      : steps.find((step) => step.id === selectedPhaseId)
  const selectedPhase =
    selectedPhaseId === 'final'
      ? undefined
      : agentPhases.find((phase) => phase.id === selectedPhaseId)
  const activePhase = activeStep
    ? agentPhases.find((phase) => phase.id === activeStep.id)
    : undefined
  const completedCount = steps.filter((step) => step.status === 'done').length
  const statusText = isThinking
    ? 'AGENT IS THINKING'
    : output
      ? 'AGENT OUTPUT'
      : 'AGENT WORKBENCH'
  const selectedTitle =
    selectedPhaseId === 'final' ? 'Final run' : selectedPhase?.title ?? 'Workbench'
  const selectedSubtitle = isThinking
    ? `${activePhase?.title ?? 'Agent'} is writing into the window`
    : output
      ? 'Run output is ready'
      : 'Agents write here as they work'
  const selectedOutput =
    selectedPhaseId === 'final'
      ? output || 'Run the agent and the completed output will appear here.'
      : selectedStep?.result ||
        (selectedStep?.status === 'active'
          ? `${selectedPhase?.role ?? 'Agent'} is thinking through this phase.`
          : selectedPhase?.prompt ?? 'Select an agent phase to inspect its output.')

  const copyWorkbenchOutput = async () => {
    if (await copyTextToClipboard(selectedOutput)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } else {
      setCopied(false)
    }
  }

  const updateScale = (nextScale: number) => {
    onScaleChange(Math.min(1.28, Math.max(0.82, nextScale)))
  }

  return (
    <section
      className={`agent-workbench-window ${isThinking ? 'agent-workbench-thinking' : ''} ${
        isExpanded ? 'agent-workbench-expanded' : ''
      }`}
      style={{ '--workbench-scale': scale } as CSSProperties}
      aria-live="polite"
    >
      {matrixRain ? <MatrixRain /> : null}
      <div className="workbench-content">
        <header className="workbench-header">
          <div className="workbench-title-block">
            <span className="workbench-live-dot" aria-hidden="true"></span>
            <div>
              <p className="eyebrow">{statusText}</p>
              <h3>{selectedTitle}</h3>
            </div>
          </div>
          <div className="workbench-tools">
            <button
              className="workbench-tool-button"
              type="button"
              onClick={copyWorkbenchOutput}
              aria-label="Copy workbench output"
              title="Copy output"
            >
              <Copy size={15} aria-hidden="true" />
            </button>
            <button
              className="workbench-tool-button"
              type="button"
              onClick={() => updateScale(scale - 0.08)}
              aria-label="Scale workbench down"
              title="Scale down"
            >
              <Minus size={15} aria-hidden="true" />
            </button>
            <input
              aria-label="Workbench scale"
              className="workbench-scale"
              type="range"
              min="82"
              max="128"
              value={Math.round(scale * 100)}
              onChange={(event) => updateScale(Number(event.target.value) / 100)}
            />
            <button
              className="workbench-tool-button"
              type="button"
              onClick={() => updateScale(scale + 0.08)}
              aria-label="Scale workbench up"
              title="Scale up"
            >
              <Plus size={15} aria-hidden="true" />
            </button>
            <button
              className="workbench-tool-button"
              type="button"
              onClick={onToggleExpanded}
              aria-label={isExpanded ? 'Restore workbench window' : 'Expand workbench window'}
              title={isExpanded ? 'Restore window' : 'Expand window'}
            >
              {isExpanded ? (
                <Minimize2 size={15} aria-hidden="true" />
              ) : (
                <Maximize2 size={15} aria-hidden="true" />
              )}
            </button>
          </div>
        </header>

        <div className="workbench-status-row">
          <span>{selectedSubtitle}</span>
          <span>
            {completedCount}/{agentPhases.length} phases
          </span>
        </div>

        <div className="workbench-phase-rail" aria-label="Agent phase output">
          <button
            className={selectedPhaseId === 'final' ? 'workbench-phase active' : 'workbench-phase'}
            type="button"
            aria-pressed={selectedPhaseId === 'final'}
            onClick={() => onSelectPhase('final')}
          >
            Final
          </button>
          {agentPhases.map((phase) => {
            const step = steps.find((candidate) => candidate.id === phase.id)
            return (
              <button
                className={`workbench-phase workbench-phase-${step?.status ?? 'idle'} ${
                  selectedPhaseId === phase.id ? 'active' : ''
                }`}
                type="button"
                key={phase.id}
                aria-pressed={selectedPhaseId === phase.id}
                onClick={() => onSelectPhase(phase.id)}
              >
                {phase.title}
              </button>
            )
          })}
        </div>

        <div className="workbench-output-window">
          <pre>{selectedOutput}</pre>
        </div>

        {copied ? <span className="workbench-copy-note">Copied</span> : null}
      </div>
    </section>
  )
}

const nodeTypes = {
  agent: AgentNode,
}

function App() {
  const initialSettings = useMemo(loadSettings, [])
  const [models, setModels] = useState<OllamaModel[]>([])
  const [selectedModel, setSelectedModel] = useState(loadPreferredModel)
  const [settings, setSettings] = useState(initialSettings)
  const [activeView, setActiveView] = useState<AppView>('board')
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
  const [selectedWorkbenchPhaseId, setSelectedWorkbenchPhaseId] =
    useState<WorkbenchPhaseId>('final')
  const [workbenchScale, setWorkbenchScale] = useState(
    initialSettings.defaultWorkbenchScale,
  )
  const [isWorkbenchExpanded, setIsWorkbenchExpanded] = useState(
    initialSettings.startWorkbenchExpanded,
  )
  const [copiedSetupCommand, setCopiedSetupCommand] = useState('')
  const [copiedSettingsAction, setCopiedSettingsAction] = useState('')
  const activeRunController = useRef<AbortController | null>(null)
  const settingsFileInputRef = useRef<HTMLInputElement | null>(null)

  const activeModel = models.find((model) => model.name === selectedModel)
  const completedSteps = steps.filter((step) => step.status === 'done').length
  const isOnline = connection === 'online'
  const agentOutput = composeAgentOutput(steps)
  const workbenchOutput = agentOutput || quickOutput
  const activeStep = steps.find((step) => step.status === 'active')
  const activePhase = activeStep
    ? agentPhases.find((phase) => phase.id === activeStep.id)
    : undefined
  const progressPercent = Math.round((completedSteps / agentPhases.length) * 100)
  const goalCharacterCount = objective.trim().length
  const sourceCharacterCount = sourceText.trim().length
  const runButtonDisabled = isRunning || !selectedModel
  const quickActionDisabled = isRunning || !selectedModel
  const runButtonLabel = !selectedModel ? 'Model required' : isRunning ? 'Running' : 'Run agent'
  const quickActionLabel = !selectedModel ? 'Choose model' : 'Run quick action'
  const boardCommandTitle = isRunning
    ? `${activePhase?.title ?? 'Agent'} running`
    : workbenchOutput
      ? 'Output ready'
      : isOnline && selectedModel
        ? 'Ready for local work'
        : 'Waiting for model'
  const commandTitle =
    activeView === 'settings' ? 'Settings and local controls' : boardCommandTitle
  const commandState =
    activeView === 'settings'
      ? `${settings.historyLimit} run memory`
      : isRunning
        ? activePhase?.role ?? 'Agent'
        : completedSteps === agentPhases.length
          ? 'Complete'
          : `${completedSteps}/${agentPhases.length} phases`
  const latestRunLabel = history[0]
    ? new Date(history[0].createdAt).toLocaleDateString()
    : 'No saved runs'
  const commandMetrics =
    activeView === 'settings'
      ? [
          {
            label: 'Temp',
            value: settings.temperature.toFixed(2),
          },
          {
            label: 'Context',
            value: settings.contextTokens.toLocaleString(),
          },
          {
            label: 'Timeout',
            value: `${settings.requestTimeoutSeconds}s`,
          },
        ]
      : [
          {
            label: 'Model',
            value: selectedModel || 'Select one',
          },
          {
            label: 'Progress',
            value: `${progressPercent}%`,
          },
          {
            label: 'Saved',
            value: latestRunLabel,
          },
        ]
  const prerequisites = useMemo<Prerequisite[]>(
    () => [
      {
        id: 'ollama',
        title: 'Ollama',
        description: 'Local model runtime used by the board.',
        href: setupLinks.ollamaWindows,
        linkLabel: 'Download',
        command: 'ollama --version',
        commandLabel: 'Copy check',
        icon: Cpu,
        status:
          connection === 'checking' ? 'checking' : isOnline ? 'online' : 'offline',
        statusLabel:
          connection === 'checking' ? 'Checking' : isOnline ? 'Detected' : 'Install needed',
      },
      {
        id: 'model',
        title: 'Local model',
        description: 'Pull at least one model before running agents.',
        href: 'https://ollama.com/library',
        linkLabel: 'Browse',
        command: 'ollama pull llama3.2',
        commandLabel: 'Copy pull',
        icon: Download,
        status: selectedModel ? 'online' : 'offline',
        statusLabel: selectedModel ? 'Ready' : 'Pull one',
      },
      {
        id: 'node',
        title: 'Node.js',
        description: 'Needed when running the app from source.',
        href: setupLinks.nodeDownload,
        linkLabel: 'Download',
        command: 'npm install && npm run dev',
        commandLabel: 'Copy run',
        icon: Wrench,
        status: 'neutral',
        statusLabel: 'Source setup',
      },
      {
        id: 'git',
        title: 'Git',
        description: 'Needed to clone or contribute to the repository.',
        href: setupLinks.gitWindows,
        linkLabel: 'Download',
        command: 'git clone https://github.com/testedprofit/ollama-agent-board.git',
        commandLabel: 'Copy clone',
        icon: GitBranch,
        status: 'neutral',
        statusLabel: 'Optional',
      },
    ],
    [connection, isOnline, selectedModel],
  )

  const appendConsole = useCallback((message: string) => {
    setConsoleLines((current) =>
      [`${timeFormatter.format(new Date())} - ${message}`, ...current].slice(0, 10),
    )
  }, [])

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings((current) => sanitizeSettings({ ...current, ...patch }))
  }

  const copySetupCommand = async (item: Prerequisite) => {
    if (!item.command) {
      return
    }

    if (await copyTextToClipboard(item.command)) {
      setCopiedSetupCommand(item.id)
      window.setTimeout(() => {
        setCopiedSetupCommand((current) => (current === item.id ? '' : current))
      }, 1800)
      appendConsole(`${item.title} command copied.`)
    } else {
      appendConsole('Clipboard copy failed. Use the setup command from the guide.')
    }
  }

  const refreshModels = useCallback(async () => {
    setConnection('checking')
    try {
      const nextModels = await fetchOllamaModels()
      setModels(nextModels)
      setSelectedModel((current) => {
        if (nextModels.some((model) => model.name === current)) {
          return current
        }

        const preferredModel = loadPreferredModel()
        if (nextModels.some((model) => model.name === preferredModel)) {
        return preferredModel
      }

        return settings.autoSelectModel ? nextModels[0]?.name || '' : ''
      })
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
  }, [appendConsole, settings.autoSelectModel])

  useEffect(() => {
    void refreshModels()
  }, [refreshModels])

  useEffect(() => {
    if (!settings.saveRunHistory) {
      try {
        localStorage.removeItem(historyStorageKey)
      } catch {
        // Storage can be unavailable in privacy modes.
      }
      return
    }

    if (history.length > settings.historyLimit) {
      setHistory((current) => current.slice(0, settings.historyLimit))
      return
    }

    if (!saveStoredRuns(history)) {
      appendConsole('Browser storage is unavailable; run history was not saved.')
    }
  }, [appendConsole, history, settings.historyLimit, settings.saveRunHistory])

  useEffect(() => {
    savePreferredModel(selectedModel)
  }, [selectedModel])

  useEffect(() => {
    if (!saveSettings(settings)) {
      appendConsole('Browser storage is unavailable; settings were not saved.')
    }
  }, [appendConsole, settings])

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
    if (isRunning) {
      return
    }

    if (!selectedModel) {
      appendConsole('Pull a model with `ollama pull llama3.2` before running the board.')
      setConnection('offline')
      return
    }

    const controller = new AbortController()
    activeRunController.current = controller
    setIsRunning(true)
    setIsAgentThinking(true)
    setSelectedWorkbenchPhaseId('intake')
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
        setSelectedWorkbenchPhaseId(phase.id)

        const result = await generateWithOllama(
          selectedModel,
          buildPhasePrompt(phase, objective, sourceText, accumulated),
          settings,
          controller.signal,
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

      if (settings.saveRunHistory) {
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
          ].slice(0, settings.historyLimit),
        )
      }
      setSelectedWorkbenchPhaseId('final')
      appendConsole(
        settings.saveRunHistory
          ? 'Agent run completed and saved locally.'
          : 'Agent run completed. History saving is off.',
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The local agent run failed.'
      const stoppedByUser = message === 'Request stopped by user.'
      setSteps((current) =>
        current.map((step) =>
          step.status === 'active'
            ? {
                ...step,
                status: stoppedByUser ? 'idle' : 'error',
                result: stoppedByUser ? 'Stopped by user.' : message,
              }
            : step,
        ),
      )
      setSelectedWorkbenchPhaseId('final')
      appendConsole(stoppedByUser ? 'Agent run stopped by user.' : message)
    } finally {
      if (activeRunController.current === controller) {
        activeRunController.current = null
      }
      setIsAgentThinking(false)
      setIsRunning(false)
    }
  }

  const stopActiveRun = () => {
    if (!activeRunController.current) {
      return
    }

    activeRunController.current.abort()
    appendConsole('Stop requested. Waiting for the current Ollama request to close.')
  }

  const runQuickTask = async () => {
    if (isRunning) {
      return
    }

    if (!selectedModel) {
      appendConsole('Choose an Ollama model before running a quick action.')
      return
    }

    const controller = new AbortController()
    activeRunController.current = controller
    setQuickOutput('')
    setIsRunning(true)
    setIsAgentThinking(true)
    setSelectedWorkbenchPhaseId('final')
    appendConsole(`${quickTaskLabels[quickTask]} quick action started.`)

    try {
      const result = await generateWithOllama(
        selectedModel,
        buildQuickPrompt(quickTask, sourceText, objective),
        settings,
        controller.signal,
      )
      setQuickOutput(result)
      setSelectedWorkbenchPhaseId('final')
      appendConsole(`${quickTaskLabels[quickTask]} quick action completed.`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The quick action failed.'
      const stoppedByUser = message === 'Request stopped by user.'
      setQuickOutput(stoppedByUser ? 'Stopped by user.' : message)
      appendConsole(stoppedByUser ? 'Quick action stopped by user.' : message)
    } finally {
      if (activeRunController.current === controller) {
        activeRunController.current = null
      }
      setIsAgentThinking(false)
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
    setSelectedWorkbenchPhaseId('final')
    appendConsole('Demo run loaded.')
  }

  const exportLatestRun = () => {
    const currentOutput = workbenchOutput.trim()
    const latestRun = history[0]

    if (!currentOutput && !latestRun) {
      appendConsole('Run the agent or a quick action before exporting.')
      return
    }

    const markdown = currentOutput
      ? [
          `# ${objective.trim() || 'Ollama Agent Board Output'}`,
          '',
          selectedModel ? `Model: ${selectedModel}` : '',
          `Created: ${new Date().toLocaleString()}`,
          '',
          currentOutput,
          '',
        ]
          .filter((line) => line !== '')
          .join('\n')
      : createRunMarkdown(latestRun as SavedRun)

    downloadTextFile('ollama-agent-run.md', markdown, 'text/markdown;charset=utf-8')
    appendConsole('Markdown export created.')
  }

  const clearHistory = () => {
    setHistory([])
    try {
      localStorage.removeItem(historyStorageKey)
    } catch {
      // Storage can be unavailable in privacy modes.
    }
    appendConsole('Run history cleared.')
  }

  const setRunHistoryEnabled = (enabled: boolean) => {
    updateSettings({ saveRunHistory: enabled })

    if (!enabled) {
      clearHistory()
      appendConsole('Run history saving turned off.')
    } else {
      appendConsole('Run history saving turned on.')
    }
  }

  const resetSettings = () => {
    setSettings(defaultAppSettings)
    setWorkbenchScale(defaultAppSettings.defaultWorkbenchScale)
    setIsWorkbenchExpanded(defaultAppSettings.startWorkbenchExpanded)
    appendConsole('Settings reset.')
  }

  const exportSettings = () => {
    downloadTextFile(
      'ollama-agent-board-settings.json',
      JSON.stringify(
        {
          app: 'ollama-agent-board',
          exportedAt: new Date().toISOString(),
          settings,
        },
        null,
        2,
      ),
      'application/json;charset=utf-8',
    )
    appendConsole('Settings export created.')
  }

  const importSettings = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const importedSettings =
        isRecord(parsed) && 'settings' in parsed ? parsed.settings : parsed
      const nextSettings = sanitizeSettings(importedSettings)
      setSettings(nextSettings)
      setWorkbenchScale(nextSettings.defaultWorkbenchScale)
      setIsWorkbenchExpanded(nextSettings.startWorkbenchExpanded)
      appendConsole('Settings imported.')
    } catch {
      appendConsole('Settings import failed. Choose a valid settings JSON file.')
    }
  }

  const copyDiagnostics = async () => {
    const diagnostics = [
      'Ollama Agent Board diagnostics',
      `Connection: ${connection}`,
      `Selected model: ${selectedModel || 'none'}`,
      `Models found: ${models.length}`,
      `Temperature: ${settings.temperature.toFixed(2)}`,
      `Context tokens: ${settings.contextTokens}`,
      `Timeout seconds: ${settings.requestTimeoutSeconds}`,
      `History: ${settings.saveRunHistory ? `${history.length}/${settings.historyLimit}` : 'off'}`,
      `Workbench scale: ${Math.round(workbenchScale * 100)}%`,
      `Matrix animation: ${settings.matrixRain ? 'on' : 'off'}`,
    ].join('\n')

    if (await copyTextToClipboard(diagnostics)) {
      setCopiedSettingsAction('diagnostics')
      window.setTimeout(() => {
        setCopiedSettingsAction((current) =>
          current === 'diagnostics' ? '' : current,
        )
      }, 1800)
      appendConsole('Diagnostics copied.')
    } else {
      appendConsole('Diagnostics copy failed.')
    }
  }

  const clearPreferredModel = () => {
    setSelectedModel('')
    try {
      localStorage.removeItem(selectedModelStorageKey)
    } catch {
      // Storage can be unavailable in privacy modes.
    }
    appendConsole('Preferred model cleared.')
  }

  const clearLocalData = () => {
    setHistory([])
    setQuickOutput('')
    setSteps(createInitialSteps())
    setSelectedWorkbenchPhaseId('final')
    try {
      localStorage.removeItem(historyStorageKey)
      localStorage.removeItem(selectedModelStorageKey)
    } catch {
      // Storage can be unavailable in privacy modes.
    }
    setSelectedModel('')
    appendConsole('Local board data cleared.')
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
          <div className="view-tabs" role="tablist" aria-label="Main view">
            <button
              className={activeView === 'board' ? 'view-tab active' : 'view-tab'}
              type="button"
              role="tab"
              aria-selected={activeView === 'board'}
              onClick={() => setActiveView('board')}
            >
              <Workflow size={15} aria-hidden="true" />
              <span>Board</span>
            </button>
            <button
              className={activeView === 'settings' ? 'view-tab active' : 'view-tab'}
              type="button"
              role="tab"
              aria-selected={activeView === 'settings'}
              onClick={() => setActiveView('settings')}
            >
              <Settings size={15} aria-hidden="true" />
              <span>Settings</span>
            </button>
          </div>
          <div className="topbar-chip" title={selectedModel || 'No local model selected'}>
            <Cpu size={15} aria-hidden="true" />
            <span>{selectedModel || 'No model'}</span>
          </div>
          <div className="topbar-chip">
            <Gauge size={15} aria-hidden="true" />
            <span>{commandState}</span>
          </div>
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

      <main className={activeView === 'settings' ? 'workspace settings-workspace' : 'workspace'}>
        <section
          className={`command-strip command-strip-${connection}`}
          aria-label="Run cockpit"
          style={{ '--run-progress': `${progressPercent}%` } as CSSProperties}
        >
          <div className="command-strip-main">
            <p className="eyebrow">Run cockpit</p>
            <h2>{commandTitle}</h2>
          </div>
          <div className="command-metrics">
            {commandMetrics.map((metric) => (
              <div className="command-metric" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
          <div className="command-progress-track" aria-hidden="true">
            <span></span>
          </div>
        </section>

        {activeView === 'settings' ? (
          <section className="settings-page" aria-label="Settings tab">
            <aside className="panel-section settings-sidebar">
              <div className="section-title">
                <Settings size={18} aria-hidden="true" />
                <h2>Settings</h2>
              </div>
              <div className="settings-status-list">
                <div className="settings-status-item">
                  <span>Ollama</span>
                  <strong>{isOnline ? 'Online' : connection}</strong>
                </div>
                <div className="settings-status-item">
                  <span>Models</span>
                  <strong>{models.length}</strong>
                </div>
                <div className="settings-status-item">
                  <span>Runs</span>
                  <strong>
                    {settings.saveRunHistory ? `${history.length}/${settings.historyLimit}` : 'Off'}
                  </strong>
                </div>
              </div>
              <div className="settings-nav" aria-label="Settings sections">
                <a href="#runtime-settings">
                  <SlidersHorizontal size={15} aria-hidden="true" />
                  <span>Runtime</span>
                </a>
                <a href="#agent-memory-settings">
                  <History size={15} aria-hidden="true" />
                  <span>Agent memory</span>
                </a>
                <a href="#workbench-settings">
                  <Eye size={15} aria-hidden="true" />
                  <span>Workbench</span>
                </a>
                <a href="#data-settings">
                  <Database size={15} aria-hidden="true" />
                  <span>Data</span>
                </a>
              </div>
            </aside>

            <section className="settings-content">
              <section className="settings-panel" id="runtime-settings">
                <div className="settings-panel-header">
                  <div>
                    <p className="eyebrow">Runtime</p>
                    <h2>Model and generation</h2>
                  </div>
                  <button className="ghost-button" type="button" onClick={refreshModels}>
                    <RefreshCcw size={16} aria-hidden="true" />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className="settings-grid">
                  <label className="settings-field">
                    <span>Default model</span>
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
                  </label>

                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings.autoSelectModel}
                      onChange={(event) =>
                        updateSettings({ autoSelectModel: event.target.checked })
                      }
                    />
                    <span className="toggle-switch" aria-hidden="true"></span>
                    <span>
                      <strong>Auto-select model</strong>
                      <small>Use the first local model when no preference is saved.</small>
                    </span>
                  </label>

                  <label className="settings-field">
                    <span>Temperature</span>
                    <div className="settings-range-row">
                      <input
                        className="settings-range"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={settings.temperature}
                        onChange={(event) =>
                          updateSettings({ temperature: Number(event.target.value) })
                        }
                      />
                      <strong>{settings.temperature.toFixed(2)}</strong>
                    </div>
                  </label>

                  <label className="settings-field">
                    <span>Context window</span>
                    <select
                      value={settings.contextTokens}
                      onChange={(event) =>
                        updateSettings({ contextTokens: Number(event.target.value) })
                      }
                    >
                      {[2048, 4096, 8192, 16384, 32768].map((size) => (
                        <option key={size} value={size}>
                          {size.toLocaleString()} tokens
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="settings-field">
                    <span>Request timeout</span>
                    <div className="settings-range-row">
                      <input
                        className="settings-range"
                        type="range"
                        min="30"
                        max="600"
                        step="30"
                        value={settings.requestTimeoutSeconds}
                        onChange={(event) =>
                          updateSettings({
                            requestTimeoutSeconds: Number(event.target.value),
                          })
                        }
                      />
                      <strong>{settings.requestTimeoutSeconds}s</strong>
                    </div>
                  </label>

                  <div className="settings-readonly">
                    <span>Proxy route</span>
                    <code>/api/ollama</code>
                  </div>
                </div>
              </section>

              <section className="settings-panel" id="agent-memory-settings">
                <div className="settings-panel-header">
                  <div>
                    <p className="eyebrow">Agent memory</p>
                    <h2>Run history</h2>
                  </div>
                  <History size={20} aria-hidden="true" />
                </div>

                <div className="settings-grid">
                  <label className="settings-toggle settings-toggle-wide">
                    <input
                      type="checkbox"
                      checked={settings.saveRunHistory}
                      onChange={(event) => setRunHistoryEnabled(event.target.checked)}
                    />
                    <span className="toggle-switch" aria-hidden="true"></span>
                    <span>
                      <strong>Save run history</strong>
                      <small>Store recent outputs in this browser only.</small>
                    </span>
                  </label>

                  <label className="settings-field">
                    <span>History limit</span>
                    <select
                      value={settings.historyLimit}
                      disabled={!settings.saveRunHistory}
                      onChange={(event) =>
                        updateSettings({ historyLimit: Number(event.target.value) })
                      }
                    >
                      {[4, 8, 12, 20, 30].map((limit) => (
                        <option key={limit} value={limit}>
                          {limit} runs
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="settings-stat">
                    <span>Stored runs</span>
                    <strong>{history.length}</strong>
                  </div>

                  <div className="settings-stat">
                    <span>Latest run</span>
                    <strong>{latestRunLabel}</strong>
                  </div>
                </div>

                <div className="settings-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={exportLatestRun}
                    disabled={!workbenchOutput.trim() && history.length === 0}
                  >
                    <Download size={16} aria-hidden="true" />
                    <span>Export output</span>
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={clearHistory}
                    disabled={history.length === 0}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    <span>Clear runs</span>
                  </button>
                </div>
              </section>

              <section className="settings-panel" id="workbench-settings">
                <div className="settings-panel-header">
                  <div>
                    <p className="eyebrow">Workbench</p>
                    <h2>Display and motion</h2>
                  </div>
                  <Eye size={20} aria-hidden="true" />
                </div>

                <div className="settings-grid">
                  <label className="settings-toggle settings-toggle-wide">
                    <input
                      type="checkbox"
                      checked={settings.matrixRain}
                      onChange={(event) =>
                        updateSettings({ matrixRain: event.target.checked })
                      }
                    />
                    <span className="toggle-switch" aria-hidden="true"></span>
                    <span>
                      <strong>Matrix thinking animation</strong>
                      <small>Show neon code rain while a local agent is working.</small>
                    </span>
                  </label>

                  <label className="settings-toggle settings-toggle-wide">
                    <input
                      type="checkbox"
                      checked={settings.startWorkbenchExpanded}
                      onChange={(event) => {
                        updateSettings({ startWorkbenchExpanded: event.target.checked })
                        setIsWorkbenchExpanded(event.target.checked)
                      }}
                    />
                    <span className="toggle-switch" aria-hidden="true"></span>
                    <span>
                      <strong>Expanded workbench</strong>
                      <small>Keep the main output window expanded by default.</small>
                    </span>
                  </label>

                  <label className="settings-field settings-field-wide">
                    <span>Default workbench scale</span>
                    <div className="settings-range-row">
                      <input
                        className="settings-range"
                        type="range"
                        min="82"
                        max="128"
                        value={Math.round(settings.defaultWorkbenchScale * 100)}
                        onChange={(event) => {
                          const nextScale = Number(event.target.value) / 100
                          updateSettings({ defaultWorkbenchScale: nextScale })
                          setWorkbenchScale(nextScale)
                        }}
                      />
                      <strong>{Math.round(settings.defaultWorkbenchScale * 100)}%</strong>
                    </div>
                  </label>

                  <div className="settings-stat">
                    <span>Current scale</span>
                    <strong>{Math.round(workbenchScale * 100)}%</strong>
                  </div>
                </div>
              </section>

              <section className="settings-panel" id="data-settings">
                <div className="settings-panel-header">
                  <div>
                    <p className="eyebrow">Data</p>
                    <h2>Local storage and setup</h2>
                  </div>
                  <HardDrive size={20} aria-hidden="true" />
                </div>

                <div className="settings-actions settings-actions-grid">
                  <button className="ghost-button" type="button" onClick={exportSettings}>
                    <Download size={16} aria-hidden="true" />
                    <span>Export settings</span>
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => settingsFileInputRef.current?.click()}
                  >
                    <Upload size={16} aria-hidden="true" />
                    <span>Import settings</span>
                  </button>
                  <button className="ghost-button" type="button" onClick={copyDiagnostics}>
                    <Copy size={16} aria-hidden="true" />
                    <span>
                      {copiedSettingsAction === 'diagnostics'
                        ? 'Copied'
                        : 'Copy diagnostics'}
                    </span>
                  </button>
                  <button className="ghost-button" type="button" onClick={clearPreferredModel}>
                    <Cpu size={16} aria-hidden="true" />
                    <span>Clear model</span>
                  </button>
                  <button className="ghost-button" type="button" onClick={resetSettings}>
                    <RefreshCcw size={16} aria-hidden="true" />
                    <span>Reset settings</span>
                  </button>
                  <button className="danger-button" type="button" onClick={clearLocalData}>
                    <Trash2 size={16} aria-hidden="true" />
                    <span>Clear local data</span>
                  </button>
                </div>

                <input
                  ref={settingsFileInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="application/json,.json"
                  onChange={importSettings}
                />

                <div className="settings-link-grid">
                  {prerequisites.map((item) => {
                    const Icon = item.icon
                    return (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        key={item.id}
                      >
                        <Icon size={16} aria-hidden="true" />
                        <span>{item.title}</span>
                        <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    )
                  })}
                </div>
              </section>
            </section>
          </section>
        ) : (
          <>
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
              aria-label="Ollama model"
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
            <div className="readiness-list" aria-label="Run readiness">
              <div className={`readiness-item readiness-${connection}`}>
                <span>Ollama</span>
                <strong>
                  {connection === 'checking'
                    ? 'Checking'
                    : isOnline
                      ? 'Online'
                      : 'Offline'}
                </strong>
              </div>
              <div className={`readiness-item ${selectedModel ? 'readiness-online' : 'readiness-offline'}`}>
                <span>Model</span>
                <strong>{selectedModel ? 'Selected' : 'Required'}</strong>
              </div>
              <div className={`readiness-item ${goalCharacterCount > 0 ? 'readiness-online' : 'readiness-offline'}`}>
                <span>Goal</span>
                <strong>{goalCharacterCount > 0 ? 'Ready' : 'Empty'}</strong>
              </div>
            </div>
          </section>

          <section className="panel-section setup-section">
            <div className="section-title">
              <Wrench size={18} aria-hidden="true" />
              <h2>Setup</h2>
            </div>
            <div className="setup-list">
              {prerequisites.map((item) => {
                const Icon = item.icon
                return (
                  <article
                    className={`setup-item setup-item-${item.status}`}
                    key={item.id}
                  >
                    <div className="setup-item-main">
                      <span className="setup-icon">
                        <Icon size={17} aria-hidden="true" />
                      </span>
                      <div>
                        <div className="setup-title-row">
                          <strong>{item.title}</strong>
                          <span>{item.statusLabel}</span>
                        </div>
                        <p>{item.description}</p>
                      </div>
                    </div>
                    <div className="setup-actions">
                      <a
                        className="setup-link-button"
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={14} aria-hidden="true" />
                        <span>{item.linkLabel}</span>
                      </a>
                      {item.command ? (
                        <button
                          className="setup-copy-button"
                          type="button"
                          onClick={() => copySetupCommand(item)}
                        >
                          <Copy size={14} aria-hidden="true" />
                          <span>
                            {copiedSetupCommand === item.id
                              ? 'Copied'
                              : item.commandLabel ?? 'Copy'}
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
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
              aria-label="Agent goal"
              onChange={(event) => setObjective(event.target.value)}
            />
            <div className="field-meta">
              <span>{goalCharacterCount.toLocaleString()} chars</span>
              <span>{goalCharacterCount > 0 ? 'Ready' : 'Needs goal'}</span>
            </div>
            <div className="button-row">
              <button
                className={`primary-button ${isRunning ? 'is-loading' : ''}`}
                type="button"
                onClick={runAgent}
                disabled={runButtonDisabled}
              >
                {isRunning ? (
                  <Loader2 size={17} aria-hidden="true" />
                ) : (
                  <Play size={17} aria-hidden="true" />
                )}
                <span>{runButtonLabel}</span>
              </button>
              {isRunning ? (
                <button className="danger-button" type="button" onClick={stopActiveRun}>
                  <Square size={15} aria-hidden="true" />
                  <span>Stop</span>
                </button>
              ) : null}
              <button
                className="ghost-button"
                type="button"
                onClick={loadDemoRun}
                disabled={isRunning}
              >
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
                    <span>
                      <strong>{template.title}</strong>
                      <small>{template.objective}</small>
                    </span>
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
            <div className="canvas-toolbar-actions">
              <span className={`phase-chip phase-chip-${activeStep?.status ?? 'idle'}`}>
                {isRunning ? activePhase?.title ?? 'Running' : commandState}
              </span>
              <button className="ghost-button" type="button" onClick={exportLatestRun}>
                <Download size={17} aria-hidden="true" />
                <span>Export</span>
              </button>
            </div>
          </div>
          <PhaseProgressRail steps={steps} />
          <div className="flow-shell">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              aria-label="Five-phase local agent flow"
              fitView
              minZoom={0.5}
              maxZoom={1.35}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={22} size={1} color="#cbd5e1" />
              <Controls showInteractive={false} />
            </ReactFlow>
            <AgentWorkbenchWindow
              isExpanded={isWorkbenchExpanded}
              isThinking={isAgentThinking}
              matrixRain={settings.matrixRain}
              onScaleChange={setWorkbenchScale}
              onSelectPhase={setSelectedWorkbenchPhaseId}
              onToggleExpanded={() => setIsWorkbenchExpanded((current) => !current)}
              output={workbenchOutput}
              scale={workbenchScale}
              selectedPhaseId={selectedWorkbenchPhaseId}
              steps={steps}
            />
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
              aria-label="Source material"
              onChange={(event) => setSourceText(event.target.value)}
            />
            <div className="field-meta">
              <span>{sourceCharacterCount.toLocaleString()} chars</span>
              <span>{quickTaskLabels[quickTask]}</span>
            </div>
            <div className="quick-actions">
              {(Object.keys(quickTaskLabels) as QuickTask[]).map((task) => (
                <button
                  key={task}
                  type="button"
                  className={quickTask === task ? 'mode-button active' : 'mode-button'}
                  aria-pressed={quickTask === task}
                  onClick={() => setQuickTask(task)}
                >
                  {quickTaskLabels[task]}
                </button>
              ))}
            </div>
            <button
              className={`primary-button full-width ${isRunning ? 'is-loading' : ''}`}
              type="button"
              onClick={runQuickTask}
              disabled={quickActionDisabled}
            >
              <Sparkles size={17} aria-hidden="true" />
              <span>{quickActionLabel}</span>
            </button>
          </section>

          <section className="panel-section output-section">
            <div className="section-title">
              <CheckCircle2 size={18} aria-hidden="true" />
              <h2>Output</h2>
            </div>
            <div className="output-box">
              {workbenchOutput || 'Run the board or a quick action to generate local output.'}
            </div>
          </section>

          <section className="panel-section">
            <div className="section-title">
              <SquareTerminal size={18} aria-hidden="true" />
              <h2>Console</h2>
            </div>
            <div className="console-list">
              {consoleLines.map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
          </section>

          <section className="panel-section history-section">
            <div className="section-title section-title-with-action">
              <div className="section-title-label">
                <Activity size={18} aria-hidden="true" />
                <h2>Runs</h2>
              </div>
              {history.length > 0 ? (
                <button
                  className="mini-icon-button"
                  type="button"
                  onClick={clearHistory}
                  aria-label="Clear run history"
                  title="Clear run history"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              ) : null}
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
                    onClick={() => {
                      setQuickOutput(run.output)
                      setSelectedWorkbenchPhaseId('final')
                    }}
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
          </>
        )}
      </main>
    </div>
  )
}

export default App
