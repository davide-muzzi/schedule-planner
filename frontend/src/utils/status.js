// Shared "how good is this number" classifiers - green/yellow/red, mapped to
// var(--ok)/var(--warn)/var(--bad) via a `status-{color}` class wherever
// they're used. Same thresholds WeekSummary.vue already applies to its
// "Overall balance" and "Worked this week" cells, pulled out here so
// Overview's charts can match that exact color-coding instead of inventing
// their own.
import {
  OVERALL_BALANCE_GREEN_MAX_OVER_HOURS,
  OVERALL_BALANCE_RED_THRESHOLD_HOURS,
  WEEKLY_WORKED_GREEN_MAX_OVER_HOURS,
  WEEKLY_WORKED_YELLOW_MAX_UNDER_HOURS,
  WEEKLY_WORKED_YELLOW_MAX_OVER_HOURS,
} from './constants'

// Same thresholds as WeekSummary's "Overall balance" cell.
export function overallBalanceStatus(diffHours) {
  if (diffHours <= -OVERALL_BALANCE_RED_THRESHOLD_HOURS) return 'red'
  if (diffHours < 0) return 'yellow'
  if (diffHours <= OVERALL_BALANCE_GREEN_MAX_OVER_HOURS) return 'green'
  if (diffHours < OVERALL_BALANCE_RED_THRESHOLD_HOURS) return 'yellow'
  return 'red'
}

// Same thresholds as WeekSummary's "Worked this week" cell.
export function weeklyWorkedStatus(workedHours, targetHours) {
  const diff = workedHours - targetHours
  if (diff < -WEEKLY_WORKED_YELLOW_MAX_UNDER_HOURS) return 'red'
  if (diff < 0) return 'yellow'
  if (diff <= WEEKLY_WORKED_GREEN_MAX_OVER_HOURS) return 'green'
  if (diff <= WEEKLY_WORKED_YELLOW_MAX_OVER_HOURS) return 'yellow'
  return 'red'
}
