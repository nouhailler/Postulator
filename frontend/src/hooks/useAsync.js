/**
 * src/hooks/useAsync.js
 * Hook générique pour gérer les appels async :
 *   { data, loading, error, refetch }
 *
 * Usage :
 *   const { data, loading, error } = useAsync(fetchOverview, [], { refetchInterval: 30000 })
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * @param {Function} asyncFn   — fonction async qui retourne la donnée
 * @param {Array}    deps      — dépendances (re-appel si elles changent)
 * @param {Object}   options
 *   @param {number}  options.refetchInterval   — polling en ms (0 = désactivé)
 *   @param {boolean} options.enabled           — false = ne lance pas l'appel
 *   @param {*}       options.fallback          — valeur par défaut de data
 */
export function useAsync(asyncFn, deps = [], options = {}) {
  const { refetchInterval = 0, enabled = true, fallback = null } = options

  const [data, setData] = useState(fallback)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const execute = useCallback(async () => {
    if (!enabled) return
    // Annule l'appel précédent si toujours en cours
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)
    try {
      const result = await asyncFn()
      setData(result)
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err)
        console.error('[useAsync]', err)
      }
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  // Appel initial + re-appel sur changement de deps
  useEffect(() => {
    execute()
    return () => abortRef.current?.abort()
  }, [execute])

  // Polling optionnel
  useEffect(() => {
    if (!refetchInterval || !enabled) return
    const id = setInterval(execute, refetchInterval)
    return () => clearInterval(id)
  }, [execute, refetchInterval, enabled])

  return { data, loading, error, refetch: execute }
}
