export const WEEKLY_TARGET_HOURS = 42
export const RED_THRESHOLD_HOURS = 40
export const YELLOW_THRESHOLD_HOURS = 10

export const BUSINESS_DAYS_PER_WEEK = 5
export const DAILY_TARGET_HOURS = WEEKLY_TARGET_HOURS / BUSINESS_DAYS_PER_WEEK
export const DAILY_RED_THRESHOLD_HOURS = 1

// Swiss law (ArG Art. 15) minimum break requirements by daily work time.
// Sorted descending by minWorkHours so the first match is the applicable tier.
export const BREAK_RULES = [
  { minWorkHours: 9, requiredBreakMinutes: 60 },
  { minWorkHours: 7, requiredBreakMinutes: 30 },
  { minWorkHours: 5.5, requiredBreakMinutes: 15 },
]
