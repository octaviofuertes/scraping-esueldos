/**
 * Componente de tabla genérica
 * Reutilizable para cualquier tipo de datos
 */

import React from 'react'
import styles from './Table.module.css'

interface Column<T> {
  key: keyof T
  label: string
  render?: (value: any, item: T) => React.ReactNode
  width?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  error?: string | null
  onRowClick?: (item: T) => void
}

export const Table = <T extends { id: string }>({
  columns,
  data,
  loading,
  error,
  onRowClick,
}: TableProps<T>): React.ReactElement => {
  if (loading) {
    return <div className={styles.message}>Cargando...</div>
  }

  if (error) {
    return <div className={styles.error}>Error: {error}</div>
  }

  if (data.length === 0) {
    return <div className={styles.message}>No hay datos para mostrar</div>
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                style={{ width: col.width }}
                className={styles.th}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={item.id}
              className={styles.row}
              onClick={() => onRowClick?.(item)}
              style={{ cursor: onRowClick ? 'pointer' : 'default' }}
            >
              {columns.map((col) => (
                <td key={String(col.key)} className={styles.td}>
                  {col.render
                    ? col.render(item[col.key], item)
                    : String(item[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
