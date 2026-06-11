/**
 * Contexto de Autenticación
 * Proporciona acceso al estado y funciones de autenticación
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import { authService } from '@services/api'
import type { User, AuthResponse } from '@types/index'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: React.ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restaurar sesión si hay token guardado
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const token = localStorage.getItem('auth_token')
        if (token) {
          const data = await authService.getCurrentUser()
          setUser(data.user)
        }
      } catch (error) {
        localStorage.removeItem('auth_token')
      } finally {
        setIsLoading(false)
      }
    }

    restoreSession()
  }, [])

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    try {
      const data: AuthResponse = await authService.login(email, password)
      setUser(data.user)
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    authService.logout()
    setUser(null)
  }

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  }

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}

/**
 * Hook para usar el contexto de autenticación
 */
export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuthContext debe usarse dentro de AuthProvider')
  }
  return context
}
