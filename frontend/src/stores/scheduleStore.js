import { defineStore } from 'pinia'
import api from '@/services/api'
import { getMonday, toISODate, durationHours } from '@/utils/date'
import { WEEKLY_TARGET_HOURS } from '@/utils/constants'

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
  }),

  getters: {
    // Running balance across every week that has at least one entry: each
    // such week contributes +WEEKLY_TARGET_HOURS to "expected", and its
    // Working-entry hours contribute to "actual". Weeks with zero entries
    // are skipped entirely (no expectation is added for them). This is not
    // scoped to the currently-viewed week - it's a running total across the
    // whole dataset. Weekend entries count too, since the planner now shows
    // a card for Sat/Sun whenever one has an entry - nothing is hidden.
    overallBalance(state) {
      const weeks = new Map()
      for (const entry of state.entries) {
        const weekKey = toISODate(getMonday(new Date(entry.date + 'T00:00:00')))
        if (!weeks.has(weekKey)) weeks.set(weekKey, 0)
        if (entry.entryType === 'Working' && !entry.allDay) {
          weeks.set(weekKey, weeks.get(weekKey) + durationHours(entry.startTime, entry.endTime))
        }
      }

      const actualHours = [...weeks.values()].reduce((sum, h) => sum + h, 0)
      const expectedHours = weeks.size * WEEKLY_TARGET_HOURS
      return { actualHours, expectedHours, diffHours: actualHours - expectedHours }
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

    clearError() {
      this.error = null
    },
  },
})
