import { createApiClient } from './httpClient'

const apiClient = createApiClient('/api/scheduleentries')

export default {
  getAll() {
    return apiClient.get('/')
  },
  getById(id) {
    return apiClient.get(`/${id}`)
  },
  create(entry) {
    return apiClient.post('/', entry)
  },
  update(id, entry) {
    return apiClient.put(`/${id}`, entry)
  },
  delete(id) {
    return apiClient.delete(`/${id}`)
  },
  deleteBulk(olderThanDays) {
    return apiClient.delete('/', { params: olderThanDays != null ? { olderThanDays } : {} })
  }
}