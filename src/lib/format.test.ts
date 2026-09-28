import { expect, it } from 'vitest'
import { formatContext, formatPrice } from './format'

it('formats prices per million tokens', () => {
  expect(formatPrice({ promptPrice: 0, completionPrice: 0 })).toBe('free')
  expect(formatPrice({ promptPrice: null, completionPrice: 1 })).toBe('price varies')
  expect(formatPrice({ promptPrice: 0.075, completionPrice: 0.3 })).toBe('$0.075 in · $0.3 out /M')
  expect(formatPrice({ promptPrice: 3, completionPrice: 15 })).toBe('$3 in · $15 out /M')
})

it('formats context windows', () => {
  expect(formatContext(null)).toBe('')
  expect(formatContext(131072)).toBe('131K ctx')
  expect(formatContext(1_000_000)).toBe('1M ctx')
  expect(formatContext(1_048_576)).toBe('1M ctx')
})
