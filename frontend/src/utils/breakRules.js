import { timeToDecimalHours } from './date'
import { BREAK_RULES } from './constants'

// Returns null if no warning is needed, otherwise the shortfall details.
export function computeBreakWarning(entries) {
  const workingBlocks = entries
    .filter((e) => e.entryType === 'Working' && !e.allDay && e.startTime && e.endTime)
    .map((e) => ({ start: timeToDecimalHours(e.startTime), end: timeToDecimalHours(e.endTime) }))
    .sort((a, b) => a.start - b.start)

  if (workingBlocks.length === 0) return null

  const workHours = workingBlocks.reduce((sum, b) => sum + (b.end - b.start), 0)

  const rule = BREAK_RULES.find((r) => workHours > r.minWorkHours)
  if (!rule) return null

  let breakHours = 0
  for (let i = 1; i < workingBlocks.length; i++) {
    breakHours += Math.max(0, workingBlocks[i].start - workingBlocks[i - 1].end)
  }
  const actualBreakMinutes = Math.round(breakHours * 60)

  if (actualBreakMinutes >= rule.requiredBreakMinutes) return null

  return { workHours, requiredBreakMinutes: rule.requiredBreakMinutes, actualBreakMinutes }
}
