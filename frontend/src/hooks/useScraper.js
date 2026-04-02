/**
 * src/hooks/useScraper.js
 * Gère le lancement d'un scraping et le polling Celery.
 * Supporte le mode standard et le mode proxy résidentiel.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchTaskStatus, runScraper, runScraperWithProxies } from '../api/scrapers.js'

export function useScraper() {
  const [taskId,    setTaskId]    = useState(null)
  const [status,    setStatus]    = useState('idle')
  const [result,    setResult]    = useState(null)
  const [launching, setLaunching] = useState(false)
  const [error,     setError]     = useState(null)
  const [proxyMode, setProxyMode] = useState(false)  // indique si la tâche courante utilise des proxies
  const pollRef = useRef(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const startPolling = useCallback((id) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetchTaskStatus(id)
        setStatus(res.status)
        if (res.status === 'success' || res.status === 'error') {
          setResult(res)
          stopPolling()
        }
      } catch (err) {
        setError(err)
        stopPolling()
      }
    }, 3000)
  }, [stopPolling])

  /** Lance un scraping standard */
  const launch = useCallback(async (payload) => {
    setLaunching(true); setError(null); setResult(null); setStatus('queued'); setProxyMode(false)
    try {
      const res = await runScraper(payload)
      setTaskId(res.task_id); setStatus(res.status); startPolling(res.task_id)
    } catch (err) {
      setError(err); setStatus('error')
    } finally { setLaunching(false) }
  }, [startPolling])

  /** Lance un scraping avec proxies résidentiels */
  const launchWithProxies = useCallback(async (payload) => {
    setLaunching(true); setError(null); setResult(null); setStatus('queued'); setProxyMode(true)
    try {
      const res = await runScraperWithProxies(payload)
      setTaskId(res.task_id); setStatus(res.status); startPolling(res.task_id)
    } catch (err) {
      setError(err); setStatus('error')
    } finally { setLaunching(false) }
  }, [startPolling])

  const reset = useCallback(() => {
    stopPolling()
    setTaskId(null); setStatus('idle'); setResult(null); setError(null); setProxyMode(false)
  }, [stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  return { launch, launchWithProxies, taskId, status, result, launching, error, reset, proxyMode }
}
