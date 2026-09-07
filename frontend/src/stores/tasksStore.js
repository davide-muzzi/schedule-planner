import { defineStore } from 'pinia'
import tasksApi from '@/services/tasksApi'
import { extractErrorMessage } from '@/utils/apiError'
import { earliestLinkedEntryDateTime } from '@/utils/taskStats'

export const useTasksStore = defineStore('tasks', {
  state: () => ({
    tasks: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const res = await tasksApi.getAll()
        this.tasks = res.data
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    async createTask(task) {
      this.error = null
      try {
        const res = await tasksApi.create(task)
        this.tasks.push(res.data)
        return res.data
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    async updateTask(id, task) {
      this.error = null
      try {
        const res = await tasksApi.update(id, task)
        const idx = this.tasks.findIndex((t) => t.id === id)
        if (idx !== -1) this.tasks[idx] = res.data
        return res.data
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    // cascadeSubtasks only matters when id is a Group with subtasks: true
    // deletes them along with it, false (default) unlinks them back to
    // standalone tasks instead - mirrors the backend's own default.
    async deleteTask(id, cascadeSubtasks = false) {
      this.error = null
      try {
        await tasksApi.delete(id, cascadeSubtasks)
        if (cascadeSubtasks) {
          this.tasks = this.tasks.filter((t) => t.id !== id && t.parentTaskId !== id)
        } else {
          this.tasks = this.tasks
            .filter((t) => t.id !== id)
            .map((t) => (t.parentTaskId === id ? { ...t, parentTaskId: null } : t))
        }
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    async deleteAllTasks() {
      this.error = null
      try {
        await tasksApi.deleteAll()
        this.tasks = []
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    // For every Backlog/Planned task whose earliest linked Working entry has
    // already started, flips it to In Progress - a one-shot check run on
    // load rather than a live ticker, since this is a personal app you check
    // in on rather than leave open and watch.
    async syncAutoStatuses(entries) {
      const dueTasks = this.tasks.filter((t) => {
        if (t.status !== 'Backlog' && t.status !== 'Planned') return false
        const earliest = earliestLinkedEntryDateTime(entries, t.id)
        return earliest !== null && earliest <= new Date()
      })

      for (const task of dueTasks) {
        try {
          // Spread the full task rather than listing fields, so a future
          // field addition can't silently go missing from this PUT the way
          // color did before this comment was added.
          await this.updateTask(task.id, { ...task, status: 'InProgress' })
        } catch {
          // store.error is already set; the caller's error banner picks it up
        }
      }
    },

    clearError() {
      this.error = null
    },
  },
})
