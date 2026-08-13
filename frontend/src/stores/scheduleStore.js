import { defineStore } from 'pinia'
import api from '@/services/api'
import balanceAdjustmentApi from '@/services/balanceAdjustmentApi'
import workGoalSettingsApi from '@/services/workGoalSettingsApi'
import { getMonday, toISODate, durationHours } from '@/utils/date'
import { DEFAULT_WEEKLY_TARGET_MINUTES, BUSINESS_DAYS_PER_WEEK } from '@/utils/constants'

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
  }),

  getters: {
    weeklyTargetHours: (state) => state.weeklyTargetMinutes / 60,
    dailyTargetHours: (state) => state.weeklyTargetMinutes / 60 / BUSINESS_DAYS_PER_WEEK,

    // Running balance across every week that has at least one entry: each
    // such week contributes +weeklyTargetHours to "expected", and its
    // Working-entry hours contribute to "actual". Weeks with zero entries
    // are skipped entirely (no expectation is added for them). This is not
    // scoped to the currently-viewed week - it's a running total across the
    // whole dataset. Weekend entries count too, since the planner now shows
    // a card for Sat/Sun whenever one has an entry - nothing is hidden.
    // Each all-day Vacation entry credits dailyTargetHours off "expected",
    // so a full vacation week nets to a 0 diff instead of looking like a
    // 42h shortfall.
    overallBalance(state) {
      const weeks = new Map()
      let vacationCreditHours = 0
      for (const entry of state.entries) {
        const weekKey = toISODate(getMonday(new Date(entry.date + 'T00:00:00')))
        if (!weeks.has(weekKey)) weeks.set(weekKey, 0)
        if (entry.entryType === 'Working' && !entry.allDay) {
          weeks.set(weekKey, weeks.get(weekKey) + durationHours(entry.startTime, entry.endTime))
        }
        if (entry.entryType === 'Vacation' && entry.allDay) {
          vacationCreditHours += this.dailyTargetHours
        }
      }

      const actualHours = [...weeks.values()].reduce((sum, h) => sum + h, 0)
      const expectedHours = weeks.size * this.weeklyTargetHours - vacationCreditHours
      const manualAdjustmentHours = state.manualAdjustmentMinutes / 60
      return {
        actualHours,
        expectedHours,
        manualAdjustmentHours,
        diffHours: actualHours - expectedHours + manualAdjustmentHours,
      }
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

    clearError() {
      this.error = null
    },
  },
})
