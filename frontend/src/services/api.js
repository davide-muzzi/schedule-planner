import axios from 'axios'

const apiClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/scheduleentries`,
  headers: {
    'Content-Type': 'application/json'
  }
})

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