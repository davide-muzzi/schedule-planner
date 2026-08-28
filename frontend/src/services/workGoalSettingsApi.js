import axios from 'axios'

const apiClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api/workgoalsettings`,
  headers: {
    'Content-Type': 'application/json'
  }
})

export default {
  get() {
    return apiClient.get('/')
  },
  set(weeklyTargetMinutes) {
    return apiClient.put('/', { weeklyTargetMinutes })
  }
}
