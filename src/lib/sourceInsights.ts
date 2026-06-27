export type ChartType = 'bar' | 'line' | 'donut'

export type ChartPoint = {
  label: string
  value: number
}

export type ChartDataset = {
  labelName: string
  max: number
  min: number
  points: ChartPoint[]
  sourceType: 'csv' | 'tsv' | 'json' | 'text'
  title: string
  total: number
  valueName: string
}

const maxChartPoints = 16

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().replace(/[$,%]/g, '').replace(/,/g, '')
  if (!normalized) {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function cleanLabel(value: unknown, fallback: string): string {
  if (value === null || value === undefined) {
    return fallback
  }

  const normalized = String(value).trim()
  return normalized || fallback
}

function summarizeDataset(
  points: ChartPoint[],
  sourceType: ChartDataset['sourceType'],
  labelName: string,
  valueName: string,
): ChartDataset | null {
  const safePoints = points
    .filter((point) => Number.isFinite(point.value))
    .slice(0, maxChartPoints)

  if (safePoints.length < 2) {
    return null
  }

  const values = safePoints.map((point) => point.value)
  const total = values.reduce((sum, value) => sum + value, 0)
  const max = Math.max(...values)
  const min = Math.min(...values)

  return {
    labelName,
    max,
    min,
    points: safePoints,
    sourceType,
    title: `${valueName} by ${labelName}`,
    total,
    valueName,
  }
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"' && nextCharacter === '"') {
      current += '"'
      index += 1
      continue
    }

    if (character === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  cells.push(current.trim())
  return cells
}

function detectDelimiter(lines: string[]): string | null {
  const delimiters = ['\t', ',', '|', ';']
  const sample = lines.slice(0, 8)
  let bestDelimiter: string | null = null
  let bestScore = 0

  for (const delimiter of delimiters) {
    const counts = sample.map((line) => splitDelimitedLine(line, delimiter).length)
    const usefulCounts = counts.filter((count) => count >= 2)
    const score = usefulCounts.reduce((sum, count) => sum + count, 0)

    if (usefulCounts.length >= 2 && score > bestScore) {
      bestScore = score
      bestDelimiter = delimiter
    }
  }

  return bestDelimiter
}

function parseDelimitedChart(text: string): ChartDataset | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return null
  }

  const delimiter = detectDelimiter(lines)
  if (!delimiter) {
    return null
  }

  const rows = lines
    .map((line) => splitDelimitedLine(line, delimiter))
    .filter((row) => row.length >= 2)

  if (rows.length < 2) {
    return null
  }

  const firstRow = rows[0]
  const secondRow = rows[1]
  const firstRowNumericCount = firstRow.filter((cell) => parseNumber(cell) !== null).length
  const secondRowNumericCount = secondRow.filter((cell) => parseNumber(cell) !== null).length
  const hasHeader = firstRowNumericCount < secondRowNumericCount
  const headers = hasHeader
    ? firstRow.map((cell, index) => cell || `Column ${index + 1}`)
    : firstRow.map((_, index) => `Column ${index + 1}`)
  const dataRows = hasHeader ? rows.slice(1) : rows

  let valueIndex = -1
  let bestNumericCount = 0
  for (let index = 0; index < headers.length; index += 1) {
    const numericCount = dataRows.filter((row) => parseNumber(row[index]) !== null).length
    if (numericCount > bestNumericCount) {
      bestNumericCount = numericCount
      valueIndex = index
    }
  }

  if (valueIndex === -1 || bestNumericCount < 2) {
    return null
  }

  const labelIndex =
    headers.findIndex((_, index) => index !== valueIndex) === -1
      ? 0
      : headers.findIndex((_, index) => index !== valueIndex)

  const points = dataRows.flatMap((row, index) => {
    const value = parseNumber(row[valueIndex])
    if (value === null) {
      return []
    }

    return [
      {
        label: cleanLabel(row[labelIndex], `Row ${index + 1}`),
        value,
      },
    ]
  })

  return summarizeDataset(
    points,
    delimiter === '\t' ? 'tsv' : 'csv',
    headers[labelIndex] ?? 'Label',
    headers[valueIndex] ?? 'Value',
  )
}

function parseJsonChart(text: string): ChartDataset | null {
  try {
    const parsed = JSON.parse(text) as unknown

    if (Array.isArray(parsed)) {
      const objects = parsed.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )

      if (objects.length >= 2) {
        const keys = Object.keys(objects[0])
        const valueName =
          keys.find((key) => objects.filter((item) => parseNumber(item[key]) !== null).length >= 2) ??
          ''
        const labelName =
          keys.find(
            (key) =>
              key !== valueName &&
              objects.some((item) => typeof item[key] === 'string' && item[key]),
          ) ?? keys.find((key) => key !== valueName) ?? 'Item'

        if (valueName) {
          const points = objects.flatMap((item, index) => {
            const value = parseNumber(item[valueName])
            if (value === null) {
              return []
            }

            return [
              {
                label: cleanLabel(item[labelName], `Item ${index + 1}`),
                value,
              },
            ]
          })

          return summarizeDataset(points, 'json', labelName, valueName)
        }
      }
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const points = Object.entries(parsed as Record<string, unknown>).flatMap(
        ([label, rawValue]) => {
          const value = parseNumber(rawValue)
          return value === null ? [] : [{ label, value }]
        },
      )

      return summarizeDataset(points, 'json', 'Key', 'Value')
    }
  } catch {
    return null
  }

  return null
}

function parseTextValueChart(text: string): ChartDataset | null {
  const points = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line, index) => {
      const labelValueMatch = line.match(/^(.+?)[\s,:|\t]+(-?\$?[\d,.]+%?)$/)
      if (labelValueMatch) {
        const value = parseNumber(labelValueMatch[2])
        return value === null
          ? []
          : [
              {
                label: cleanLabel(labelValueMatch[1], `Item ${index + 1}`),
                value,
              },
            ]
      }

      const numericValue = parseNumber(line)
      return numericValue === null
        ? []
        : [
            {
              label: `Point ${index + 1}`,
              value: numericValue,
            },
          ]
    })

  return summarizeDataset(points, 'text', 'Label', 'Value')
}

export function parseChartDataset(text: string): ChartDataset | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  return parseJsonChart(trimmed) ?? parseDelimitedChart(trimmed) ?? parseTextValueChart(trimmed)
}

export function chartDatasetToCsv(dataset: ChartDataset): string {
  const escapeCell = (value: string | number) => {
    const text = String(value)
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  return [
    [dataset.labelName, dataset.valueName].map(escapeCell).join(','),
    ...dataset.points.map((point) =>
      [point.label, point.value].map(escapeCell).join(','),
    ),
  ].join('\n')
}

export function formatChartDatasetForClipboard(dataset: ChartDataset): string {
  return [
    `# Chart data: ${dataset.title}`,
    '',
    `Source: ${dataset.sourceType.toUpperCase()}`,
    `Rows: ${dataset.points.length}`,
    `Total: ${dataset.total}`,
    `Range: ${dataset.min} to ${dataset.max}`,
    '',
    chartDatasetToCsv(dataset),
  ].join('\n')
}
