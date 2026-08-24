import axios from 'axios'

const apiClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/weather`,
  headers: {
    'Content-Type': 'application/json'
  }
})

export default {
  get(lat, lon) {
    const params = {}
    if (lat != null) params.lat = lat
    if (lon != null) params.lon = lon
    return apiClient.get('/', { params })
  }
}
