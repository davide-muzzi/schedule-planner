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

// Mon-Fri as Date objects, given a Monday
export function getBusinessWeekDays(monday) {
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i))
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

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatDayHeading(date) {
  const weekday = WEEKDAY_LABELS[date.getDay()]
  const day = date.getDate()
  const month = date.toLocaleString(undefined, { month: 'short' })
  return `${weekday}, ${month} ${day}`
}

export function formatWeekRange(monday) {
  const friday = addDays(monday, 4)
  const sameMonth = monday.getMonth() === friday.getMonth()
  const startLabel = monday.toLocaleString(undefined, { month: 'short', day: 'numeric' })
  const endLabel = sameMonth
    ? friday.getDate()
    : friday.toLocaleString(undefined, { month: 'short', day: 'numeric' })
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
  const abs = Math.abs(hours)
  const h = Math.floor(abs)
  const m = Math.round((abs - h) * 60)
  if (m === 0) return `${sign}${h}h`
  return `${sign}${h}h ${m}m`
}
