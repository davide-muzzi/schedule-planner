import { defineStore } from 'pinia'
import authApi from '@/services/authApi'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    username: null,
    // Whether an initial /me check has resolved yet - lets the router guard
    // tell "not logged in" apart from "haven't checked yet" on first load.
    checked: false,
  }),
  getters: {
    isAuthenticated: (state) => state.username !== null,
  },
  actions: {
    async checkSession() {
      try {
        const { data } = await authApi.me()
        this.username = data.username
      } catch {
        this.username = null
      } finally {
        this.checked = true
      }
    },
    async login(username, password) {
      const { data } = await authApi.login(username, password)
      this.username = data.username
      this.checked = true
    },
    async logout() {
      try {
        await authApi.logout()
      } finally {
        this.clearSession()
      }
    },
    clearSession() {
      this.username = null
      this.checked = true
    },
  },
})
