/**
 * src/components/layout/OllamaBanner.jsx
 * Bannière subtile affichée sous le TopBar quand Ollama traite.
 * Affiche le nom de la tâche + un compteur de secondes.
 */
import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useOllamaStatus } from '../../contexts/OllamaStatusContext.jsx'
import styles from './OllamaBanner.module.css'

export default function OllamaBanner() {
  const { status } = useOllamaStatus()
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (status) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [status])

  if (!status) return null

  return (
    <div className={styles.banner}>
      <div className={styles.inner}>
        <Sparkles size={12} strokeWidth={2} className={styles.icon} />
        <span className={styles.label}>
          Ollama · <strong>{status.label}</strong>
        </span>
        <span className={styles.dots}>
          <span /><span /><span />
        </span>
        <span className={styles.timer}>{elapsed}s</span>
      </div>
    </div>
  )
}
