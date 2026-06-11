/**
 * Cliente API HTTP
 * Centraliza todas las llamadas al backend
 * Maneja autenticación, errores y reintentos
 */

import axios, { AxiosInstance, AxiosError } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4100/api'

/**
 * Crea instancia de axios con configuración base
 */
const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  // Interceptor: agregar token en cada request
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  // Interceptor: manejar errores globales
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      // Si es 401, limpiar token y redirigir a login
      if (error.response?.status === 401) {
        localStorage.removeItem('auth_token')
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }
  )

  return client
}

const apiClient = createApiClient()

/**
 * Servicio de Autenticación
 */
export const authService = {
  login: async (email: string, password: string) => {
    const { data } = await apiClient.post('/auth/login', { email, password })
    localStorage.setItem('auth_token', data.token)
    return data
  },

  logout: () => {
    localStorage.removeItem('auth_token')
  },

  getCurrentUser: async () => {
    const { data } = await apiClient.get('/auth/me')
    return data
  },
}

/**
 * Servicio de Escalas Salariales
 */
export const scaleService = {
  // Candidatos
  getCandidates: async (page = 1, limit = 20) => {
    const { data } = await apiClient.get('/admin/scale-candidates', {
      params: { page, limit },
    })
    return data
  },

  getCandidate: async (id: string) => {
    const { data } = await apiClient.get(`/admin/scale-candidates/${id}`)
    return data
  },

  approveCandidate: async (id: string, override = false) => {
    const { data } = await apiClient.post(
      `/admin/scale-candidates/${id}/approve`,
      { override }
    )
    return data
  },

  rejectCandidate: async (id: string, reason: string) => {
    const { data } = await apiClient.post(
      `/admin/scale-candidates/${id}/reject`,
      { reason }
    )
    return data
  },

  retriggerExtraction: async (id: string) => {
    const { data } = await apiClient.post(
      `/admin/scale-candidates/${id}/retrigger`
    )
    return data
  },

  uploadManual: async (file: File, calculatorKey: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('calculatorKey', calculatorKey)

    const { data } = await apiClient.post(
      '/admin/scale-candidates/upload',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return data
  },

  // Fuentes
  getSources: async () => {
    const { data } = await apiClient.get('/admin/scale-sources')
    return data
  },

  createSource: async (source: any) => {
    const { data } = await apiClient.post('/admin/scale-sources', source)
    return data
  },

  updateSource: async (id: string, updates: any) => {
    const { data } = await apiClient.patch(
      `/admin/scale-sources/${id}`,
      updates
    )
    return data
  },

  deleteSource: async (id: string) => {
    const { data } = await apiClient.delete(`/admin/scale-sources/${id}`)
    return data
  },

  runMonitor: async (sourceId?: string) => {
    const { data } = await apiClient.post(
      '/admin/scale-monitor/run',
      sourceId ? { sourceId } : {}
    )
    return data
  },

  // Historial
  getHistory: async (page = 1, limit = 20) => {
    const { data } = await apiClient.get('/admin/scale-history', {
      params: { page, limit },
    })
    return data
  },

  // Cambios CCT
  getNormativeChanges: async (page = 1, limit = 20) => {
    const { data } = await apiClient.get('/admin/cct-changes', {
      params: { page, limit },
    })
    return data
  },
}

export default apiClient
