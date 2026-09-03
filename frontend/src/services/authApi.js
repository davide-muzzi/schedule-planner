import axios from 'axios'

const apiClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api/auth`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

export default {
  me() {
    return apiClient.get('/me')
  },
  login(username, password) {
    return apiClient.post('/login', { username, password })
  },
  logout() {
    return apiClient.post('/logout')
  },
}
