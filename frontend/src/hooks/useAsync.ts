/**
 * Hook genérico para manejar operaciones asincrónicas
 * Maneja loading, error y retry automático
 */

import { useState, useEffect, useCallback } from 'react'

interface UseAsyncState<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

interface UseAsyncOptions {
  onSuccess?: (data: any) => void
  onError?: (error: Error) => void
  retryCount?: number
}

export const useAsync = <T,>(
  asyncFunction: () => Promise<T>,
  immediate = true,
  deps: React.DependencyList = [],
  options: UseAsyncOptions = {}
): UseAsyncState<T> & {
  execute: () => Promise<void>
  retry: () => Promise<void>
} => {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: immediate,
    error: null,
  })

  const execute = useCallback(async () => {
    setState({ data: null, loading: true, error: null })

    let lastError: Error | null = null
    const maxRetries = options.retryCount ?? 2

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await asyncFunction()
        setState({ data: response, loading: false, error: null })
        options.onSuccess?.(response)
        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))

        // Esperar antes de reintentar (backoff exponencial)
        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          )
        }
      }
    }

    setState({ data: null, loading: false, error: lastError })
    options.onError?.(lastError!)
  }, [asyncFunction, options])

  const retry = useCallback(() => execute(), [execute])

  useEffect(() => {
    if (immediate) {
      execute()
    }
  }, deps)

  return { ...state, execute, retry }
}
