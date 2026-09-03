import { createApiClient } from './httpClient'

const apiClient = createApiClient('/api/balanceadjustment')

export default {
  get() {
    return apiClient.get('/')
  },
  set(totalMinutes) {
    return apiClient.put('/', { totalMinutes })
  }
}
