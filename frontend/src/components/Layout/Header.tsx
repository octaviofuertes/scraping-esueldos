/**
 * Header/Navbar de la aplicación
 */

import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthContext } from '@contexts/AuthContext'
import styles from './Header.module.css'

export const Header: React.FC = () => {
  const { user, logout } = useAuthContext()
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        {/* Logo */}
        <Link to="/admin" className={styles.logo}>
          <h1>📊 Escalas Salariales</h1>
        </Link>

        {/* Navegación */}
        <nav className={styles.nav}>
          <Link
            to="/admin"
            className={`${styles.navLink} ${
              isActive('/admin') ? styles.active : ''
            }`}
          >
            Candidatos
          </Link>
          <Link
            to="/admin/sources"
            className={`${styles.navLink} ${
              isActive('/admin/sources') ? styles.active : ''
            }`}
          >
            Fuentes
          </Link>
          <Link
            to="/admin/history"
            className={`${styles.navLink} ${
              isActive('/admin/history') ? styles.active : ''
            }`}
          >
            Historial
          </Link>
          <Link
            to="/admin/upload"
            className={`${styles.navLink} ${
              isActive('/admin/upload') ? styles.active : ''
            }`}
          >
            Cargar PDF
          </Link>
        </nav>

        {/* Usuario */}
        <div className={styles.userSection}>
          <span className={styles.userEmail}>{user?.email}</span>
          <button onClick={logout} className={styles.logoutBtn}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  )
}
