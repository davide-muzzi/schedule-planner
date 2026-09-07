import { defineStore } from 'pinia'
import tagsApi from '@/services/tagsApi'
import { extractErrorMessage } from '@/utils/apiError'
import { useTasksStore } from './tasksStore'

export const useTagsStore = defineStore('tags', {
  state: () => ({
    tags: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const res = await tagsApi.getAll()
        this.tags = res.data
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    async createTag(tag) {
      this.error = null
      try {
        const res = await tagsApi.create(tag)
        this.tags.push(res.data)
        return res.data
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    // A cached task's tags array holds its own copies of tag objects (from
    // its own GET /api/tasks response), not shared references with this
    // store's - a rename here has to be propagated into those copies too,
    // the same reasoning as deleteTag below.
    async updateTag(id, tag) {
      this.error = null
      try {
        const res = await tagsApi.update(id, tag)
        const idx = this.tags.findIndex((t) => t.id === id)
        if (idx !== -1) this.tags[idx] = res.data
        const tasksStore = useTasksStore()
        tasksStore.tasks = tasksStore.tasks.map((task) =>
          task.tags?.some((t) => t.id === id)
            ? { ...task, tags: task.tags.map((t) => (t.id === id ? res.data : t)) }
            : task,
        )
        return res.data
      } catch (err) {
        this.error = extractErrorMessage(err)
        throw err
      }
    },

    // Deleting a tag cascades its TaskTag rows server-side, but locally
    // cached tasks still hold the now-stale tag object until they're
    // stripped of it here too.
    async deleteTag(id) {
      this.error = null
      try {
        await tagsApi.delete(id)
        this.tags = this.tags.filter((t) => t.id !== id)
        const tasksStore = useTasksStore()
        tasksStore.tasks = tasksStore.tasks.map((task) =>
          task.tags?.some((t) => t.id === id) ? { ...task, tags: task.tags.filter((t) => t.id !== id) } : task,
        )
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
