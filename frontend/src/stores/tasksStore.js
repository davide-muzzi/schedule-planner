import { defineStore } from 'pinia'
import tasksApi from '@/services/tasksApi'
import { extractErrorMessage } from '@/utils/apiError'
import { deriveTaskStatus, subtasksOf, taskUpdatePayload } from '@/utils/taskStats'

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

    // Re-derives Backlog/Ready/InProgress for every top-level (non-Done) task
    // from its link/timing and writes back whatever changed. Subtasks are
    // never linked directly, so a Group's own status change cascades to its
    // subtasks via applyStatusToSubtasks instead of being derived per-subtask.
    async syncTaskStatuses(entries) {
      const topLevel = this.tasks.filter((t) => t.parentTaskId == null && t.status !== 'Done')

      for (const task of topLevel) {
        const desired = deriveTaskStatus(entries, task.id)
        if (desired === task.status) continue
        try {
          await this.updateTask(task.id, taskUpdatePayload(task, { status: desired }))
          if (task.taskType === 'Group') await this.applyStatusToSubtasks(task.id, desired)
        } catch {
          // store.error is already set; the caller's error banner picks it up
        }
      }
    },

    // Sets `status` on every non-Done subtask of the given group - used both
    // by syncTaskStatuses above and by a group's manual Done/reopen actions.
    // Subtasks already marked Done independently are left alone.
    async applyStatusToSubtasks(groupId, status) {
      const subtasks = subtasksOf(this.tasks, groupId).filter((t) => t.status !== 'Done')
      for (const sub of subtasks) {
        try {
          await this.updateTask(sub.id, taskUpdatePayload(sub, { status }))
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
