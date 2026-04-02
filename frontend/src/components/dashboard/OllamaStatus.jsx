/**
 * OllamaStatus.jsx
 * Indicateur de disponibilité du serveur Ollama local.
 * Ping toutes les 30s via GET /api/analysis/ollama/ping
 */
import { useEffect, useState } from 'react'
import { pingOllama } from '../../api/analysis.js'
import styles from './OllamaStatus.module.css'

export default function OllamaStatus() {
  const [status, setStatus] = useState('checking')  // checking | online | offline

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const res = await pingOllama()
        if (!cancelled) setStatus(res.status === 'online' ? 'online' : 'offline')
      } catch {
        if (!cancelled) setStatus('offline')
      }
    }

    check()
    const id = setInterval(check, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const label = status === 'online'
    ? 'Ollama active'
    : status === 'offline'
      ? 'Ollama offline'
      : 'Checking…'

  return (
    <div className={`${styles.wrap} ${styles[status]}`}>
      {status === 'online' && <div className={styles.shimmer} />}
      <span className={styles.dot} />
      <span className={styles.label}>{label}</span>
    </div>
  )
}
