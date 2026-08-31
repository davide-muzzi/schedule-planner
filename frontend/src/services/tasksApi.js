import axios from 'axios'

const apiClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api/tasks`,
  headers: {
    'Content-Type': 'application/json',
  },
})

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
  delete(id) {
    return apiClient.delete(`/${id}`)
  },
  deleteAll() {
    return apiClient.delete('/')
  },
}
