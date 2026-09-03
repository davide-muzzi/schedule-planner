import { createApiClient } from './httpClient'

const apiClient = createApiClient('/api/holidayyearsettings')

export default {
  get(year) {
    return apiClient.get(`/${year}`)
  },
  set(year, allotmentDays, adjustmentDays) {
    return apiClient.put(`/${year}`, { allotmentDays, adjustmentDays })
  }
}
