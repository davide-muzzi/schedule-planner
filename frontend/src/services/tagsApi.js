import { createApiClient } from './httpClient'

const apiClient = createApiClient('/api/tags')

export default {
  getAll() {
    return apiClient.get('/')
  },
  create(tag) {
    return apiClient.post('/', tag)
  },
  update(id, tag) {
    return apiClient.put(`/${id}`, tag)
  },
  delete(id) {
    return apiClient.delete(`/${id}`)
  },
}
