import { timeToDecimalHours } from './date'
import { BREAK_RULES, MAX_CONTINUOUS_WORK_HOURS } from './constants'

// All comparisons run on whole minutes - decimal hours drift (e.g. 06:22-11:52
// comes out as 5.500000000000001h), which would flag a day sitting exactly on
// a legal threshold as being over it.
const toMinutes = (time) => Math.round(timeToDecimalHours(time) * 60)

// Working entries that touch or overlap form one uninterrupted stretch -
// splitting a block into several back-to-back entries must not count as
// taking a break, so they're merged before any rule is applied.
function workingStretches(entries) {
  const blocks = entries
    .filter((e) => e.entryType === 'Working' && !e.allDay && e.startTime && e.endTime)
    .map((e) => ({ start: toMinutes(e.startTime), end: toMinutes(e.endTime) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start)

  const stretches = []
  for (const block of blocks) {
    const last = stretches[stretches.length - 1]
    if (last && block.start <= last.end) {
      last.end = Math.max(last.end, block.end)
    } else {
      stretches.push({ ...block })
    }
  }
  return stretches
}

// Returns null if no warning is needed, otherwise the shortfall details
// (times in decimal hours):
// - daily: total work time vs. total break time (ArG Art. 15), null if fine
// - longStretches: continuous stretches longer than MAX_CONTINUOUS_WORK_HOURS
//   without a break in between (ArGV 1 Art. 18 Abs. 3)
export function computeBreakWarning(entries) {
  const stretches = workingStretches(entries)
  if (stretches.length === 0) return null

  const workMinutes = stretches.reduce((sum, s) => sum + (s.end - s.start), 0)

  let daily = null
  const rule = BREAK_RULES.find((r) => workMinutes > r.minWorkHours * 60)
  if (rule) {
    let actualBreakMinutes = 0
    for (let i = 1; i < stretches.length; i++) {
      actualBreakMinutes += stretches[i].start - stretches[i - 1].end
    }
    if (actualBreakMinutes < rule.requiredBreakMinutes) {
      daily = { workHours: workMinutes / 60, requiredBreakMinutes: rule.requiredBreakMinutes, actualBreakMinutes }
    }
  }

  const longStretches = stretches
    .filter((s) => s.end - s.start > MAX_CONTINUOUS_WORK_HOURS * 60)
    .map((s) => ({ start: s.start / 60, end: s.end / 60, hours: (s.end - s.start) / 60 }))

  if (!daily && longStretches.length === 0) return null

  return { daily, longStretches }
}
