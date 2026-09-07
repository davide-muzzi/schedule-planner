import { createApiClient } from './httpClient'

const apiClient = createApiClient('/api/tasks')

export default {
  getAll() {
    return apiClient.get('/')
  },
  getById(id) {
    return apiClient.get(`/${id}`)
  },
  create(task) {
    return apiClient.post('/', task)
  },
  update(id, task) {
    return apiClient.put(`/${id}`, task)
  },
  delete(id, cascadeSubtasks = false) {
    return apiClient.delete(`/${id}`, { params: { cascadeSubtasks } })
  },
  deleteAll() {
    return apiClient.delete('/')
  },
}
