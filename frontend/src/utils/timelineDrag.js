import { timeToDecimalHours } from './date'

// An entry's on-timeline range in decimal hours. `end` is floored to at
// least 15 minutes past `start` purely so a very short entry stays visually
// clickable/draggable on the timeline - a display floor, not the entry's
// real stored duration. Callers that need the exact real duration (e.g.
// comparing against another entry's real boundary) should read
// timeToDecimalHours off startTime/endTime directly instead.
export function entryRange(entry) {
  const start = timeToDecimalHours(entry.startTime) ?? 0
  const rawEnd = timeToDecimalHours(entry.endTime) ?? start
  return { start, end: Math.max(rawEnd, start + 0.25) }
}

// Whole-entry move/drop magnet: which half of a hovered entry the cursor is
// over decides which edge of the moving/dropped block gets pinned to that
// entry's boundary - left half pins the block's end to the hovered entry's
// start, right half pins its start to the hovered entry's end. Returns null
// when the cursor isn't currently over any entry in `timedEntries`.
export function moveMagnetTarget(rawHours, duration, excludeId, timedEntries) {
  for (const other of timedEntries) {
    if (other.id === excludeId) continue
    const { start, end } = entryRange(other)
    if (rawHours > start && rawHours < end) {
      const mid = (start + end) / 2
      return rawHours < mid ? { start: start - duration, end: start } : { start: end, end: end + duration }
    }
  }
  return null
}
