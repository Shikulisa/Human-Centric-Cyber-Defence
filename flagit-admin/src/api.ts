// api.ts - UPDATED with better error handling
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE,
  timeout: 30000, // 30 second timeout for exports
})

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error)
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout - server is taking too long to respond')
    }
    if (!error.response) {
      throw new Error('Network error - cannot connect to server')
    }
    throw error
  }
)

export function setToken(jwt?: string) {
  if (jwt)
    api.defaults.headers.common['Authorization'] = `Bearer ${jwt}`
  else
    delete api.defaults.headers.common['Authorization']
}

export default api