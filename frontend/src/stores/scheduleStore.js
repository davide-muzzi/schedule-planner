import { defineStore } from 'pinia'
import api from '@/services/api'
import balanceAdjustmentApi from '@/services/balanceAdjustmentApi'
import workGoalSettingsApi from '@/services/workGoalSettingsApi'
import { getMonday, toISODate, durationHours } from '@/utils/date'
import { DEFAULT_WEEKLY_TARGET_MINUTES, BUSINESS_DAYS_PER_WEEK } from '@/utils/constants'

const DISPLAY_NAME_STORAGE_KEY = 'schedulePlanner.displayName'

function extractErrorMessage(err) {
  const data = err?.response?.data
  if (typeof data === 'string' && data.trim()) return data
  if (data?.message) return data.message
  if (data?.title) return data.title
  return err?.message || 'Something went wrong talking to the server.'
}

export const useScheduleStore = defineStore('schedule', {
  state: () => ({
    entries: [],
    loading: false,
    error: null,
    manualAdjustmentMinutes: 0,
    weeklyTargetMinutes: DEFAULT_WEEKLY_TARGET_MINUTES,
    // Purely cosmetic, never used in any calculation - kept in localStorage
    // rather than the backend, unlike the goal/adjustment values.
    displayName: localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) || '',
  }),

  getters: {
    weeklyTargetHours: (state) => state.weeklyTargetMinutes / 60,
    dailyTargetHours: (state) => state.weeklyTargetMinutes / 60 / BUSINESS_DAYS_PER_WEEK,
    greeting: (state) => (state.displayName ? `Good day, ${state.displayName}!` : 'Good day!'),

    // Running balance across every individual day that has a Working entry:
    // each such day contributes +dailyTargetHours to "expected", and its
    // Working-entry hours contribute to "actual". Days with no Working entry
    // contribute nothing either way - not scoped to the currently-viewed
    // week, this is a running total across the whole dataset. A Vacation (or
    // any non-Working) day simply isn't a Working day, so it's automatically
    // excluded from "expected" with no special-casing needed - a full
    // vacation week nets to a 0 diff for free, the same way an entirely
    // untouched day never demands a share of the goal in the first place.
    overallBalance(state) {
      const days = new Map()
      for (const entry of state.entries) {
        if (entry.entryType === 'Working' && !entry.allDay) {
          days.set(entry.date, (days.get(entry.date) || 0) + durationHours(entry.startTime, entry.endTime))
        }
      }

      const actualHours = [...days.values()].reduce((sum, h) => sum + h, 0)
      const expectedHours = days.size * this.dailyTargetHours
      const manualAdjustmentHours = state.manualAdjustmentMinutes / 60
      return {
        actualHours,
        expectedHours,
        manualAdjustmentHours,
        diffHours: actualHours - expectedHours + manualAdjustmentHours,
      }
    },

    // Same day-based logic as overallBalance, but broken out per week instead
    // of collapsed into one running total - one row per week that has at
    // least one Working entry, sorted oldest first. Each week's "expected" is
    // its own day count x dailyTargetHours, not a flat weeklyTargetHours.
    weeklyBalances(state) {
      const days = new Map()
      for (const entry of state.entries) {
        if (entry.entryType === 'Working' && !entry.allDay) {
          days.set(entry.date, (days.get(entry.date) || 0) + durationHours(entry.startTime, entry.endTime))
        }
      }

      const weeks = new Map()
      for (const [dateStr, hours] of days) {
        const monday = getMonday(new Date(dateStr + 'T00:00:00'))
        const weekKey = toISODate(monday)
        if (!weeks.has(weekKey)) weeks.set(weekKey, { monday, workedHours: 0, dayCount: 0 })
        const week = weeks.get(weekKey)
        week.workedHours += hours
        week.dayCount += 1
      }

      return [...weeks.values()]
        .sort((a, b) => a.monday - b.monday)
        .map((week) => ({
          monday: week.monday,
          workedHours: week.workedHours,
          diffHours: week.workedHours - week.dayCount * this.dailyTargetHours,
        }))
    },

    // Total hours tied up in upcoming Appointment entries (today or later),
    // across the whole dataset - not scoped to the currently-viewed week,
    // same as overallBalance, so it's directly comparable to it: "how much
    // time will future appointments cost me" vs. "how much of a buffer have
    // I already built up".
    futureAppointmentHours(state) {
      const todayIso = toISODate(new Date())
      return state.entries
        .filter((e) => e.entryType === 'Appointment' && !e.allDay && e.date >= todayIso)
        .reduce((sum, e) => sum + durationHours(e.startTime, e.endTime), 0)
    },

    // Rolling cutoff - entries dated before this are what "older than 1
    // year" would remove. Used for the Settings danger-zone preview.
    oldEntriesCutoffDate() {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 365)
      return cutoff
    },

    oldEntriesCount(state) {
      const cutoffIso = toISODate(this.oldEntriesCutoffDate)
      return state.entries.filter((e) => e.date < cutoffIso).length
    },
  },

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const res = await api.getAll()
        this.entries = res.data
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    async createEntry(entry) {
      this.error = null
      try {
        const res = await api.create(entry)
        this.entries.push(res.data)
        return res.data
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    async updateEntry(id, entry) {
      this.error = null
      try {
        const res = await api.update(id, entry)
        const idx = this.entries.findIndex((e) => e.id === id)
        if (idx !== -1) this.entries[idx] = res.data
        return res.data
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    async deleteEntry(id) {
      this.error = null
      try {
        await api.delete(id)
        this.entries = this.entries.filter((e) => e.id !== id)
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    async fetchAdjustment() {
      try {
        const res = await balanceAdjustmentApi.get()
        this.manualAdjustmentMinutes = res.data.totalMinutes
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    async applyAdjustment(deltaMinutes) {
      this.error = null
      const newTotal = this.manualAdjustmentMinutes + deltaMinutes
      try {
        const res = await balanceAdjustmentApi.set(newTotal)
        this.manualAdjustmentMinutes = res.data.totalMinutes
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    async fetchWorkGoal() {
      try {
        const res = await workGoalSettingsApi.get()
        this.weeklyTargetMinutes = res.data.weeklyTargetMinutes
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    async setWorkGoal(weeklyTargetMinutes) {
      this.error = null
      try {
        const res = await workGoalSettingsApi.set(weeklyTargetMinutes)
        this.weeklyTargetMinutes = res.data.weeklyTargetMinutes
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    setDisplayName(name) {
      this.displayName = name
      localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, name)
    },

    async clearOldEntries() {
      this.error = null
      try {
        await api.deleteBulk(365)
        const cutoffIso = toISODate(this.oldEntriesCutoffDate)
        this.entries = this.entries.filter((e) => e.date >= cutoffIso)
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    async clearAllData() {
      this.error = null
      try {
        await api.deleteBulk(null)
        this.entries = []
        // A correction referencing now-deleted history doesn't mean anything
        // anymore - reset it too. The weekly goal setting is a preference,
        // not schedule data, so it's left untouched.
        await balanceAdjustmentApi.set(0)
        this.manualAdjustmentMinutes = 0
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    clearError() {
      this.error = null
    },
  },
})
