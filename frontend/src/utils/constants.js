// Weekly worktime goal is user-configurable (see scheduleStore's
// weeklyTargetMinutes state) - this is only the fallback used before that's
// fetched from the backend. The daily goal is always weekly / 5, never
// stored independently.
export const DEFAULT_WEEKLY_TARGET_MINUTES = 42 * 60

// Used by the per-week rows in WeeklyBalanceModal.
export const RED_THRESHOLD_HOURS = 40
export const YELLOW_THRESHOLD_HOURS = 10

// "Overall balance" coloring (WeekSummary only): green is the
// target-to-+5h "sweet spot". Yellow on either side of that (any shortfall
// under 10h, or +5h to +10h over). Red once you're 10h+ away from target in
// either direction - excessive overtime and excessive shortfall both flag.
export const OVERALL_BALANCE_GREEN_MAX_OVER_HOURS = 5
export const OVERALL_BALANCE_RED_THRESHOLD_HOURS = 10

// "Worked this week" coloring: green is target to +2h over. Yellow for a
// shortfall up to 2h, or +2h to +5h over. Red beyond either of those.
export const WEEKLY_WORKED_GREEN_MAX_OVER_HOURS = 2
export const WEEKLY_WORKED_YELLOW_MAX_UNDER_HOURS = 2
export const WEEKLY_WORKED_YELLOW_MAX_OVER_HOURS = 5

// "Upcoming appointments" coloring: green once the overall balance already
// covers them. Yellow while they'd only push you up to 2h further behind,
// red beyond that.
export const UPCOMING_APPOINTMENTS_YELLOW_MAX_GAP_HOURS = 2

export const BUSINESS_DAYS_PER_WEEK = 5
export const DAILY_RED_THRESHOLD_HOURS = 1

// Task planned-vs-real coloring: green under an hour over (or under
// estimate entirely), yellow 1-3h over, red 3h+ over.
export const TASK_DIFF_YELLOW_THRESHOLD_MINUTES = 60
export const TASK_DIFF_RED_THRESHOLD_MINUTES = 180

// Timeline zoom - purely a display preference, never affects
// totals/goal-diff/break-law calculations. Full day by default.
export const DEFAULT_VIEW_FROM_HOUR = 0
export const DEFAULT_VIEW_TILL_HOUR = 24

// Fallback used before a given year's holiday allotment has been fetched
// from the backend (see scheduleStore's holidayYearSettings state).
export const DEFAULT_HOLIDAY_ALLOTMENT_DAYS = 25

// Swiss law (ArG Art. 15) minimum break requirements by daily work time.
// Sorted descending by minWorkHours so the first match is the applicable tier.
export const BREAK_RULES = [
  { minWorkHours: 9, requiredBreakMinutes: 60 },
  { minWorkHours: 7, requiredBreakMinutes: 30 },
  { minWorkHours: 5.5, requiredBreakMinutes: 15 },
]
