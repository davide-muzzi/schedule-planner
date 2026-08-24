const DAY_MS = 24 * 60 * 60 * 1000

// Monday of the week containing `date` (local time, time-of-day stripped)
export function getMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() // 0 = Sunday, 1 = Monday, ...
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS)
}

export function addWeeks(date, weeks) {
  return addDays(date, weeks * 7)
}

export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isSameDate(a, b) {
  return toISODate(a) === toISODate(b)
}

export function isWeekend(date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

// ISO-8601 week number (weeks start Monday, week 1 contains the year's
// first Thursday) - used for the sidebar's "week N" display.
export function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / DAY_MS + 1) / 7)
}


export function formatWeekRange(monday) {
  const friday = addDays(monday, 4)
  const startLabel = monday.toLocaleString('en-GB', { month: 'short', day: 'numeric' })
  const endLabel = friday.toLocaleString('en-GB', { month: 'short', day: 'numeric' })
  return `${startLabel} – ${endLabel}, ${friday.getFullYear()}`
}

// "HH:mm:ss" -> decimal hours (e.g. "09:30:00" -> 9.5)
export function timeToDecimalHours(timeStr) {
  if (!timeStr) return null
  const [h, m, s] = timeStr.split(':').map(Number)
  return h + m / 60 + (s || 0) / 3600
}

export function durationHours(startTime, endTime) {
  const start = timeToDecimalHours(startTime)
  const end = timeToDecimalHours(endTime)
  if (start === null || end === null) return 0
  return Math.max(0, end - start)
}

export function formatHours(hours) {
  const sign = hours < 0 ? '-' : ''
  // Round to whole minutes first, then split - rounding h and m separately
  // (e.g. h = floor(1.999999999), m = round((1.999999999 - 1) * 60)) can
  // let floating-point drift round m up to 60 without ever carrying into h,
  // showing "1h 60m" instead of "2h 0m".
  const totalMinutes = Math.round(Math.abs(hours) * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (m === 0) return `${sign}${h}h`
  return `${sign}${h}h ${m}m`
}
