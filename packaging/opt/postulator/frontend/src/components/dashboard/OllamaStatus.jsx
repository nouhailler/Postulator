/**
 * OllamaStatus.jsx
 * Indicateurs de disponibilité : Ollama local + OpenRouter (si configuré).
 */
import { useEffect, useState } from 'react'
import { pingOllama } from '../../api/analysis.js'
import styles from './OllamaStatus.module.css'

export default function OllamaStatus() {
  const [ollamaStatus, setOllamaStatus] = useState('checking') // checking | online | offline
  const [orInfo,       setOrInfo]       = useState(null)       // null | { model: string }

  useEffect(() => {
    let cancelled = false

    async function checkOllama() {
      try {
        const res = await pingOllama()
        if (!cancelled) setOllamaStatus(res.status === 'online' ? 'online' : 'offline')
      } catch {
        if (!cancelled) setOllamaStatus('offline')
      }
    }

    async function checkOpenRouter() {
      try {
        const res = await fetch('/api/settings/openrouter').then(r => r.json())
        if (!cancelled && res?.configured) {
          setOrInfo({ model: res.model || '' })
        } else if (!cancelled) {
          setOrInfo(null)
        }
      } catch {
        if (!cancelled) setOrInfo(null)
      }
    }

    checkOllama()
    checkOpenRouter()
    const id = setInterval(() => { checkOllama(); checkOpenRouter() }, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const ollamaLabel = ollamaStatus === 'online'  ? 'Ollama active'
                    : ollamaStatus === 'offline' ? 'Ollama offline'
                    : 'Checking…'

  const orModelShort = orInfo?.model
    ? orInfo.model.split('/').pop().split(':')[0].slice(0, 16)
    : null

  return (
    <div className={styles.statusRow}>
      {/* Ollama */}
      <div className={`${styles.pill} ${styles[ollamaStatus]}`}>
        {ollamaStatus === 'online' && <div className={styles.shimmer} />}
        <span className={styles.dot} />
        <span className={styles.label}>{ollamaLabel}</span>
      </div>

      {/* OpenRouter — affiché seulement si configuré */}
      {orInfo && (
        <div className={`${styles.pill} ${styles.orActive}`}>
          <div className={styles.shimmer} />
          <span className={styles.dot} />
          <span className={styles.label}>
            OpenRouter
            {orModelShort && (
              <span className={styles.modelChip}>{orModelShort}</span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
