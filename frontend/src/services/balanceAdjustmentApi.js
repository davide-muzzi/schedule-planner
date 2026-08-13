import axios from 'axios'

const apiClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/balanceadjustment`,
  headers: {
    'Content-Type': 'application/json'
  }
})

export default {
  get() {
    return apiClient.get('/')
  },
  set(totalMinutes) {
    return apiClient.put('/', { totalMinutes })
  }
}
