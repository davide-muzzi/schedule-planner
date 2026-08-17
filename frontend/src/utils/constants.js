// Weekly worktime goal is user-configurable (see scheduleStore's
// weeklyTargetMinutes state) - this is only the fallback used before that's
// fetched from the backend. The daily goal is always weekly / 5, never
// stored independently.
export const DEFAULT_WEEKLY_TARGET_MINUTES = 42 * 60

export const RED_THRESHOLD_HOURS = 40
export const YELLOW_THRESHOLD_HOURS = 10

export const BUSINESS_DAYS_PER_WEEK = 5
export const DAILY_RED_THRESHOLD_HOURS = 1

// Timeline zoom - purely a display preference (like displayName), never
// affects totals/goal-diff/break-law calculations. Full day by default.
export const DEFAULT_VIEW_FROM_HOUR = 0
export const DEFAULT_VIEW_TILL_HOUR = 24

// Swiss law (ArG Art. 15) minimum break requirements by daily work time.
// Sorted descending by minWorkHours so the first match is the applicable tier.
export const BREAK_RULES = [
  { minWorkHours: 9, requiredBreakMinutes: 60 },
  { minWorkHours: 7, requiredBreakMinutes: 30 },
  { minWorkHours: 5.5, requiredBreakMinutes: 15 },
]
