import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

// Read at module load, not inside createApiClient() below - import.meta.env
// isn't reliably populated once access is deferred inside a function body.
const API_URL = import.meta.env.VITE_API_URL ?? ''

// Shared by every API service except authApi (which must not redirect on a
// 401 - a failed login attempt is a normal 401, not an expired session).
// Centralizes withCredentials (needed for the auth cookie to round-trip) and
// bounces back to the login screen if a session expires mid-use.
export function createApiClient(path) {
  const apiClient = axios.create({
    baseURL: `${API_URL}${path}`,
    headers: {
      'Content-Type': 'application/json',
    },
    withCredentials: true,
  })

  apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error?.response?.status === 401) {
        const authStore = useAuthStore()
        authStore.clearSession()
        // Imported lazily, not at module top-level: router/index.js eagerly
        // imports PlannerView, which pulls in this same module - a
        // top-level `import router from '@/router'` here would form a
        // circular import and throw a temporal-dead-zone error on load.
        const { default: router } = await import('@/router')
        if (router.currentRoute.value.name !== 'login') {
          router.push({ name: 'login' })
        }
      }
      return Promise.reject(error)
    },
  )

  return apiClient
}
