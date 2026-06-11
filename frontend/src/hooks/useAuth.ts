/**
 * Hook para autenticación
 * Maneja login, logout y estado del usuario
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '@services/api'
import type { User } from '@types/index'

interface UseAuthReturn {
  user: User | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  // Cargar usuario actual al montar
  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = localStorage.getItem('auth_token')
        if (!token) {
          setLoading(false)
          return
        }

        const data = await authService.getCurrentUser()
        setUser(data.user)
      } catch (err) {
        localStorage.removeItem('auth_token')
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true)
      setError(null)

      try {
        const data = await authService.login(email, password)
        setUser(data.user)
        navigate('/admin')
      } catch (err: any) {
        const message =
          err.response?.data?.error || 'Error al iniciar sesión'
        setError(message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [navigate]
  )

  const logout = useCallback(() => {
    authService.logout()
    setUser(null)
    navigate('/login')
  }, [navigate])

  return { user, loading, error, login, logout }
}
