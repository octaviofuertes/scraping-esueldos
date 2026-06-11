/**
 * Página de Candidatos
 * Listado de escalas salariales detectadas pendientes de revisión
 */

import React, { useState } from 'react'
import { scaleService } from '@services/api'
import { useAsync } from '@hooks/useAsync'
import { Table } from '@components/Table/Table'
import type { SalaryScaleCandidate } from '@types/index'
import styles from './CandidatesPage.module.css'

export const CandidatesPage: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  const { data, loading, error, execute } = useAsync(
    () => scaleService.getCandidates(page, ITEMS_PER_PAGE),
    true,
    [page]
  )

  const candidates = data?.candidates || []
  const total = data?.total || 0

  const handleApprove = async (id: string) => {
    if (confirm('¿Aprobar esta escala?')) {
      try {
        await scaleService.approveCandidate(id)
        execute() // Recargar lista
      } catch (err) {
        alert('Error al aprobar')
      }
    }
  }

  const handleReject = async (id: string) => {
    const reason = prompt('Motivo del rechazo:')
    if (reason) {
      try {
        await scaleService.rejectCandidate(id, reason)
        execute() // Recargar lista
      } catch (err) {
        alert('Error al rechazar')
      }
    }
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      DETECTED: '🔍',
      PENDING_REVIEW: '⏳',
      APPROVED: '✅',
      REJECTED: '❌',
      IGNORED: '⊘',
    }
    return statusMap[status] || status
  }

  const columns = [
    {
      key: 'id' as const,
      label: 'ID',
      width: '120px',
      render: (value: string) => value.substring(0, 8) + '...',
    },
    {
      key: 'calculatorKey' as const,
      label: 'Convenio',
      render: (value: string) => value.toUpperCase(),
    },
    {
      key: 'status' as const,
      label: 'Estado',
      render: (value: string) => getStatusBadge(value),
    },
    {
      key: 'aiConfidence' as const,
      label: 'Confianza IA',
      render: (value: number) => `${Math.round(value * 100)}%`,
    },
    {
      key: 'createdAt' as const,
      label: 'Fecha',
      render: (value: string) => new Date(value).toLocaleDateString('es-AR'),
    },
  ]

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Candidatos a Revisar</h1>
        <button
          className={styles.refreshBtn}
          onClick={() => execute()}
          disabled={loading}
        >
          🔄 Actualizar
        </button>
      </div>

      {candidates.length > 0 && (
        <Table
          columns={columns}
          data={candidates}
          loading={loading}
          error={error?.message}
          onRowClick={(item) => setSelectedId(item.id)}
        />
      )}

      {/* Panel de detalle */}
      {selectedId && (
        <CandidateDetail
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onApprove={() => {
            handleApprove(selectedId)
            setSelectedId(null)
          }}
          onReject={() => {
            handleReject(selectedId)
            setSelectedId(null)
          }}
        />
      )}

      {/* Paginación */}
      {total > ITEMS_PER_PAGE && (
        <div className={styles.pagination}>
          <button
            disabled={page === 1}
            onClick={() => setPage(1)}
          >
            Primera
          </button>
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span>
            Página {page} de {Math.ceil(total / ITEMS_PER_PAGE)}
          </span>
          <button
            disabled={page >= Math.ceil(total / ITEMS_PER_PAGE)}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
          <button
            disabled={page >= Math.ceil(total / ITEMS_PER_PAGE)}
            onClick={() => setPage(Math.ceil(total / ITEMS_PER_PAGE))}
          >
            Última
          </button>
        </div>
      )}
    </div>
  )
}

interface CandidateDetailProps {
  id: string
  onClose: () => void
  onApprove: () => void
  onReject: () => void
}

const CandidateDetail: React.FC<CandidateDetailProps> = ({
  id,
  onClose,
  onApprove,
  onReject,
}) => {
  const { data: candidate, loading } = useAsync(
    () => scaleService.getCandidate(id),
    true,
    [id]
  )

  if (loading || !candidate) {
    return <div className={styles.modal}>Cargando detalles...</div>
  }

  const categories = candidate.extractedDataJson?.categories || []

  const formatNumber = (val: number | null | undefined): string => {
    if (val == null) return '—'
    return '$ ' + val.toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Detalle del Candidato</h2>
          <button onClick={onClose} className={styles.closeBtn}>
            ✕
          </button>
        </div>

        <div className={styles.modalContent}>
          {/* Info general */}
          <section className={styles.section}>
            <h3>Información General</h3>
            <p>
              <strong>Confianza IA:</strong> {Math.round(candidate.aiConfidence * 100)}%
            </p>
            <p>
              <strong>URL:</strong>{' '}
              <a href={candidate.documentUrl} target="_blank" rel="noreferrer">
                {candidate.documentUrl}
              </a>
            </p>
          </section>

          {/* Categorías */}
          {categories.length > 0 && (
            <section className={styles.section}>
              <h3>Categorías Detectadas ({categories.length})</h3>
              <div className={styles.categoriesGrid}>
                {categories.map((cat, i) => (
                  <div key={i} className={styles.categoryCard}>
                    <h4>{cat.categoryName}</h4>
                    <p>
                      <strong>Básico:</strong> {formatNumber(cat.baseSalary)}
                    </p>
                    <p>
                      <strong>No Rem:</strong>{' '}
                      {formatNumber(cat.nonRemunerativeAmount)}
                    </p>
                    <p>
                      <strong>Hora:</strong> {formatNumber(cat.hourlyRate)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Diferencias */}
          {candidate.diffJson?.categoriesModified?.length > 0 && (
            <section className={styles.section}>
              <h3>Cambios vs Versión Anterior</h3>
              <div className={styles.diffTable}>
                {candidate.diffJson.categoriesModified.map((diff, i) => (
                  <div key={i} className={styles.diffRow}>
                    <strong>{diff.categoryName}</strong>
                    <span>
                      {formatNumber(diff.previousBaseSalary)} →{' '}
                      {formatNumber(diff.newBaseSalary)}
                    </span>
                    <span
                      className={
                        diff.diffAmount! > 0 ? styles.positive : styles.negative
                      }
                    >
                      {diff.diffAmount! > 0 ? '+' : ''}
                      {formatNumber(diff.diffAmount)} ({diff.diffPct}%)
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Acciones */}
        <div className={styles.modalFooter}>
          <button onClick={onClose} className={styles.cancelBtn}>
            Cancelar
          </button>
          <button onClick={onReject} className={styles.rejectBtn}>
            Rechazar
          </button>
          <button onClick={onApprove} className={styles.approveBtn}>
            Aprobar
          </button>
        </div>
      </div>
    </div>
  )
}
