/**
 * Aplicación principal
 * Define rutas y estructura general
 */

import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuthContext } from '@contexts/AuthContext'
import { ProtectedRoute } from '@components/ProtectedRoute'
import { Header } from '@components/Layout/Header'
import { LoginPage } from '@pages/LoginPage'
import { CandidatesPage } from '@pages/CandidatesPage'
import './App.css'

/**
 * Layout para páginas autenticadas
 */
const AuthenticatedLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <>
    <Header />
    <main className="mainContent">{children}</main>
  </>
)

/**
 * Router principal
 */
const AppRoutes: React.FC = () => {
  const { isLoading } = useAuthContext()

  if (isLoading) {
    return (
      <div className="loadingContainer">
        <div>Cargando...</div>
      </div>
    )
  }

  return (
    <Routes>
      {/* Ruta pública */}
      <Route path="/login" element={<LoginPage />} />

      {/* Rutas protegidas */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <CandidatesPage />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      {/* Placeholder para otras páginas */}
      <Route
        path="/admin/sources"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <div style={{ padding: '2rem' }}>
                <h1>Fuentes (en desarrollo)</h1>
              </div>
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/history"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <div style={{ padding: '2rem' }}>
                <h1>Historial (en desarrollo)</h1>
              </div>
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/upload"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <div style={{ padding: '2rem' }}>
                <h1>Cargar PDF (en desarrollo)</h1>
              </div>
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      {/* Redirecciones */}
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  )
}

/**
 * Componente principal
 */
export const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  )
}
