import axios from 'axios'

const apiClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/holidayyearsettings`,
  headers: {
    'Content-Type': 'application/json'
  }
})

export default {
  get(year) {
    return apiClient.get(`/${year}`)
  },
  set(year, allotmentDays, adjustmentDays) {
    return apiClient.put(`/${year}`, { allotmentDays, adjustmentDays })
  }
}
