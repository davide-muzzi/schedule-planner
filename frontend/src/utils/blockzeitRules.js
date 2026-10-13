import { timeToDecimalHours } from './date'
import { BLOCKZEITEN, BETRIEBSZEIT } from './constants'

// Absences that excuse a Blockzeit entirely - touching it at all is enough.
const EXEMPT_TYPES = ['Vacation', 'PublicHoliday', 'OvertimeCompensation']

function rangeOf(entry) {
  if (entry.allDay) return { start: 0, end: 24 }
  if (!entry.startTime || !entry.endTime) return null
  const start = timeToDecimalHours(entry.startTime)
  const end = timeToDecimalHours(entry.endTime)
  return { start, end: end <= start ? 24 : end }
}

function overlaps(range, block) {
  return range.start < block.end && range.end > block.start
}

// Parts of `block` not covered by any of `ranges`.
function uncoveredGaps(block, ranges) {
  const sorted = ranges.filter((r) => overlaps(r, block)).sort((a, b) => a.start - b.start)
  const gaps = []
  let cursor = block.start
  for (const r of sorted) {
    if (r.start > cursor) gaps.push({ start: cursor, end: Math.min(r.start, block.end) })
    cursor = Math.max(cursor, r.end)
    if (cursor >= block.end) break
  }
  if (cursor < block.end) gaps.push({ start: cursor, end: block.end })
  // Ignore sub-minute slivers from rounding.
  return gaps.filter((g) => g.end - g.start >= 1 / 60)
}

// Returns one item per Blockzeit that isn't fully worked:
// { block, gaps, hasAppointment }. Empty array if everything's fine.
// Weekends and days with nothing planned are skipped.
export function computeBlockzeitWarnings(date, entries) {
  const day = date.getDay()
  if (day === 0 || day === 6 || entries.length === 0) return []

  const withRanges = entries.map((e) => ({ type: e.entryType, range: rangeOf(e) })).filter((e) => e.range)
  const working = withRanges.filter((e) => e.type === 'Working').map((e) => e.range)

  const warnings = []
  for (const block of BLOCKZEITEN) {
    if (withRanges.some((e) => EXEMPT_TYPES.includes(e.type) && overlaps(e.range, block))) continue
    const gaps = uncoveredGaps(block, working)
    if (gaps.length === 0) continue
    const hasAppointment = withRanges.some((e) => e.type === 'Appointment' && overlaps(e.range, block))
    warnings.push({ block, gaps, hasAppointment })
  }
  return warnings
}

// Returns the Working time ranges that fall outside Betriebszeit - on a
// weekend that's the whole entry. Empty array if everything's fine.
export function computeBetriebszeitViolations(date, entries) {
  const day = date.getDay()
  const isWeekend = day === 0 || day === 6
  const violations = []
  for (const e of entries) {
    if (e.entryType !== 'Working' || e.allDay) continue
    const range = rangeOf(e)
    if (!range) continue
    if (isWeekend) {
      violations.push(range)
      continue
    }
    if (range.start < BETRIEBSZEIT.start) violations.push({ start: range.start, end: Math.min(range.end, BETRIEBSZEIT.start) })
    if (range.end > BETRIEBSZEIT.end) violations.push({ start: Math.max(range.start, BETRIEBSZEIT.end), end: range.end })
  }
  return violations.sort((a, b) => a.start - b.start)
}
