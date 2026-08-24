// Pure data-shaping for the Overview page - everything here takes plain
// entries/derived data in and returns plain data out, same "pure function
// over store.entries" shape as date.js, so OverviewView can compose these in
// computed()s without stuffing page-specific aggregates into the store.
import { getMonday, addDays, addWeeks, toISODate, durationHours } from './date'
import { ENTRY_TYPES } from './entryTypeColors'

function workingHoursByDate(entries) {
  const map = new Map()
  for (const e of entries) {
    if (e.entryType === 'Working' && !e.allDay) {
      map.set(e.date, (map.get(e.date) || 0) + durationHours(e.startTime, e.endTime))
    }
  }
  return map
}

export function hoursTrackedInYear(entries, year) {
  let sum = 0
  for (const [date, hours] of workingHoursByDate(entries)) {
    if (new Date(date + 'T00:00:00').getFullYear() === year) sum += hours
  }
  return sum
}

export function daysWithEntriesInYear(entries, year) {
  let count = 0
  for (const date of workingHoursByDate(entries).keys()) {
    if (new Date(date + 'T00:00:00').getFullYear() === year) count++
  }
  return count
}

// weeklyBalances (store getter) filtered to weeks whose Monday falls in
// `year` - weeklyBalances already only contains weeks with at least one
// Working entry, so this doubles as "tracked weeks this year".
export function weeksInYear(weeklyBalances, year) {
  return weeklyBalances.filter((w) => w.monday.getFullYear() === year)
}

export function averagePerTrackedWeek(weeklyBalances, year) {
  const weeks = weeksInYear(weeklyBalances, year)
  if (weeks.length === 0) return 0
  return weeks.reduce((sum, w) => sum + w.workedHours, 0) / weeks.length
}

// The last `count` calendar weeks ending at the week containing `today`,
// continuous and gap-free (0h for untracked weeks) - unlike weeklyBalances,
// which simply omits weeks with no Working entries.
export function lastNWeeksSeries(weeklyBalances, count, today = new Date()) {
  const byWeek = new Map(weeklyBalances.map((w) => [toISODate(w.monday), w.workedHours]))
  const currentMonday = getMonday(today)
  const series = []
  for (let i = count - 1; i >= 0; i--) {
    const monday = addWeeks(currentMonday, -i)
    series.push({ monday, hours: byWeek.get(toISODate(monday)) || 0 })
  }
  return series
}

// Same series, but diffHours (worked - dailyTargetHours*dayCount) instead of
// raw worked hours - only weeks that actually appear in weeklyBalances count
// (no fabricated 0-diff weeks for untracked stretches).
export function lastNWeeksDiffSeries(weeklyBalances, count) {
  return [...weeklyBalances]
    .sort((a, b) => a.monday - b.monday)
    .slice(-count)
    .map((w) => ({ monday: w.monday, diffHours: w.diffHours }))
}

// Average Working hours per weekday (Mon-Fri), scoped to `year`. Index 0 =
// Monday .. index 4 = Friday.
export function averageByWeekday(entries, year) {
  const sums = [0, 0, 0, 0, 0]
  const counts = [0, 0, 0, 0, 0]
  for (const [dateStr, hours] of workingHoursByDate(entries)) {
    const date = new Date(dateStr + 'T00:00:00')
    if (date.getFullYear() !== year) continue
    const day = date.getDay() // 0=Sun..6=Sat
    if (day >= 1 && day <= 5) {
      sums[day - 1] += hours
      counts[day - 1] += 1
    }
  }
  return sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : 0))
}

// The single Working day with the most hours logged, scoped to `year` - null
// if there isn't one. workLocation is taken from whichever entry that day
// contributed the most hours, since a day can mix locations.
export function longestDay(entries, year) {
  const byDate = new Map()
  for (const e of entries) {
    if (e.entryType !== 'Working' || e.allDay) continue
    if (new Date(e.date + 'T00:00:00').getFullYear() !== year) continue
    const hours = durationHours(e.startTime, e.endTime)
    if (!byDate.has(e.date)) byDate.set(e.date, { totalHours: 0, entries: [] })
    const bucket = byDate.get(e.date)
    bucket.totalHours += hours
    bucket.entries.push({ hours, workLocation: e.workLocation })
  }

  let best = null
  for (const [date, bucket] of byDate) {
    if (!best || bucket.totalHours > best.totalHours) {
      const topEntry = bucket.entries.reduce((a, b) => (b.hours > a.hours ? b : a))
      best = { date, totalHours: bucket.totalHours, workLocation: topEntry.workLocation }
    }
  }
  return best
}

// Total hours per entry type, scoped to `year`. All-day entries (Vacation,
// PublicHoliday) have no start/end time to measure, so they're credited a
// full day's worth via `dailyTargetHours` - otherwise they'd silently vanish
// from the breakdown despite clearly taking up a working day. Types with no
// hours at all are dropped rather than shown as an empty legend row.
export function timeBreakdownByType(entries, year, dailyTargetHours) {
  const totals = Object.fromEntries(ENTRY_TYPES.map((t) => [t, 0]))
  for (const e of entries) {
    if (new Date(e.date + 'T00:00:00').getFullYear() !== year) continue
    if (!(e.entryType in totals)) continue
    totals[e.entryType] += e.allDay ? dailyTargetHours : durationHours(e.startTime, e.endTime)
  }

  const grandTotal = Object.values(totals).reduce((sum, h) => sum + h, 0)
  return ENTRY_TYPES.map((type) => ({
    type,
    hours: totals[type],
    pct: grandTotal > 0 ? (totals[type] / grandTotal) * 100 : 0,
  }))
    .filter((t) => t.hours > 0.001)
    .sort((a, b) => b.hours - a.hours)
}

// Tracking-streak bucket: 0 = no Working entry at all (rendered as a
// distinct empty cell, not bucket 1), 1 = 0-5.5h, 2 = 5.5-7h, 3 = 7-9h,
// 4 = 9h+. A value sitting exactly on a boundary (5.5, 7, 9) always rounds
// up into the next bucket.
export function streakLevelForHours(hours) {
  if (hours <= 0) return 0
  if (hours < 5.5) return 1
  if (hours < 7) return 2
  if (hours < 9) return 3
  return 4
}

export const STREAK_LEVEL_LABELS = ['No entry', '0–5.5h', '5.5–7h', '7–9h', '9h+']

// A GitHub-contributions-style grid: one column per calendar week (oldest
// first), each holding all 7 days Mon-Sun, covering the last `weeks` weeks
// ending at the week containing `today`.
export function trackingStreakGrid(entries, weeks, today = new Date()) {
  const map = workingHoursByDate(entries)
  const startMonday = addWeeks(getMonday(today), -(weeks - 1))

  const columns = []
  for (let w = 0; w < weeks; w++) {
    const monday = addWeeks(startMonday, w)
    const days = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(monday, d)
      const iso = toISODate(date)
      const hours = map.get(iso) || 0
      days.push({ date, iso, hours, level: streakLevelForHours(hours) })
    }
    columns.push({ monday, days })
  }
  return columns
}
