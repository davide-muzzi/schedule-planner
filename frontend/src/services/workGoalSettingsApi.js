import { createApiClient } from './httpClient'

const apiClient = createApiClient('/api/workgoalsettings')

export default {
  get() {
    return apiClient.get('/')
  },
  set(weeklyTargetMinutes) {
    return apiClient.put('/', { weeklyTargetMinutes })
  }
}
