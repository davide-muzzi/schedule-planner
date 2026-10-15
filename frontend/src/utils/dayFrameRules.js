import { timeToDecimalHours } from './date'
import { MAX_DAILY_SPAN_HOURS, MIN_REST_HOURS } from './constants'

// First start and last end of the day's Working entries (decimal hours), or
// null if there's no timed Working entry.
function workingFrame(entries) {
  let start = Infinity
  let end = -Infinity
  for (const e of entries) {
    if (e.entryType !== 'Working' || e.allDay || !e.startTime || !e.endTime) continue
    const s = timeToDecimalHours(e.startTime)
    const t = timeToDecimalHours(e.endTime)
    start = Math.min(start, s)
    end = Math.max(end, t <= s ? 24 : t)
  }
  return start === Infinity ? null : { start, end }
}

// Tagesrahmen: returns { start, end, hours } if first start to last end
// (breaks included) exceeds the daily max, otherwise null.
export function computeDailySpanViolation(entries) {
  const frame = workingFrame(entries)
  if (!frame) return null
  const hours = frame.end - frame.start
  // Compared in whole minutes so decimal drift can't flag exactly 14h.
  return Math.round(hours * 60) > MAX_DAILY_SPAN_HOURS * 60 ? { ...frame, hours } : null
}

// Ruhezeit: returns { previousEnd, start, hours } if the gap between the
// previous day's last Working end and today's first Working start is below
// the minimum, otherwise null. Nothing worked on either day means no check.
export function computeRestViolation(entries, previousDayEntries) {
  const today = workingFrame(entries)
  const previous = workingFrame(previousDayEntries)
  if (!today || !previous) return null
  const hours = 24 - previous.end + today.start
  return Math.round(hours * 60) < MIN_REST_HOURS * 60 ? { previousEnd: previous.end, start: today.start, hours } : null
}
