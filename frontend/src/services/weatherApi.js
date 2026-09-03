import { createApiClient } from './httpClient'

const apiClient = createApiClient('/api/weather')

export default {
  get(lat, lon) {
    const params = {}
    if (lat != null) params.lat = lat
    if (lon != null) params.lon = lon
    return apiClient.get('/', { params })
  }
}
