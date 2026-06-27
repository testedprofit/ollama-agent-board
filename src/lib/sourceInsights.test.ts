import { describe, expect, it } from 'vitest'
import {
  chartDatasetToCsv,
  formatChartDatasetForClipboard,
  parseChartDataset,
} from './sourceInsights'

describe('parseChartDataset', () => {
  it('detects a simple CSV table', () => {
    const dataset = parseChartDataset('month,users,revenue\nJan,120,600\nFeb,160,900\nMar,140,820')

    expect(dataset?.sourceType).toBe('csv')
    expect(dataset?.labelName).toBe('month')
    expect(dataset?.valueName).toBe('users')
    expect(dataset?.points).toEqual([
      { label: 'Jan', value: 120 },
      { label: 'Feb', value: 160 },
      { label: 'Mar', value: 140 },
    ])
  })

  it('detects JSON arrays of objects', () => {
    const dataset = parseChartDataset(
      JSON.stringify([
        { product: 'Alpha', sales: 12 },
        { product: 'Beta', sales: 18 },
        { product: 'Gamma', sales: 9 },
      ]),
    )

    expect(dataset?.sourceType).toBe('json')
    expect(dataset?.labelName).toBe('product')
    expect(dataset?.valueName).toBe('sales')
    expect(dataset?.max).toBe(18)
  })

  it('detects label value text', () => {
    const dataset = parseChartDataset('North: 22\nSouth: 31\nWest: 18')

    expect(dataset?.sourceType).toBe('text')
    expect(dataset?.points.map((point) => point.label)).toEqual([
      'North',
      'South',
      'West',
    ])
  })

  it('exports chart data as csv and markdown-friendly text', () => {
    const dataset = parseChartDataset('A,10\nB,20\nC,30')

    expect(dataset).not.toBeNull()
    expect(chartDatasetToCsv(dataset!)).toContain('Column 1,Column 2')
    expect(formatChartDatasetForClipboard(dataset!)).toContain('# Chart data:')
  })
})
