import { useEffect } from 'react'
import { X, Brain, Radio, CheckCircle } from 'lucide-react'
import { useAsync } from '../../hooks/useAsync.js'
import { fetchHistory } from '../../api/history.js'
import { fetchScrapeLogs } from '../../api/scrapers.js'
import styles from './Drawer.module.css'

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)   return `il y a ${diff}s`
  if (diff < 3600) return `il y a ${Math.floor(diff/60)}min`
  if (diff < 86400) return `il y a ${Math.floor(diff/3600)}h`
  return `il y a ${Math.floor(diff/86400)}j`
}

function scoreColor(s) {
  return s >= 80 ? 'var(--tertiary)' : s >= 60 ? 'var(--primary)' : 'var(--outline)'
}

export default function AlertsDrawer({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  const { data: history } = useAsync(fetchHistory, [], { fallback: [] })
  const { data: logs }    = useAsync(() => fetchScrapeLogs({ limit: 10 }), [], { fallback: [] })

  const highMatches = (history ?? []).filter(e => e.score >= 80).slice(0, 5)
  const recentLogs  = (logs ?? []).slice(0, 8)

  if (!open) return null

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <aside className={`${styles.drawer} ${styles.drawerRight}`}>
        <div className={styles.header}>
          <h2 className={styles.title}>Alertes & Activité</h2>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} strokeWidth={2} /></button>
        </div>

        {/* Matches > 80% */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Meilleurs matches IA</p>
          {highMatches.length === 0
            ? <p className={styles.empty}>Aucun match ≥ 80% pour l'instant.</p>
            : highMatches.map(e => (
              <div key={e.id} className={styles.alertItem}>
                <div className={styles.alertIcon} style={{ background: 'rgba(60,221,199,0.1)' }}>
                  <Brain size={14} style={{ color: 'var(--tertiary)' }} strokeWidth={2} />
                </div>
                <div className={styles.alertBody}>
                  <p className={styles.alertTitle}>{e.job_title} · {e.job_company}</p>
                  <p className={styles.alertMeta}>
                    CV : {e.cv_name} · <span style={{ color: scoreColor(e.score), fontWeight: 700 }}>{Math.round(e.score)}/100</span>
                    <span className={styles.alertTime}>{timeAgo(e.analyzed_at)}</span>
                  </p>
                </div>
              </div>
            ))
          }
        </section>

        {/* Logs scraping récents */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Scraping récent</p>
          {recentLogs.length === 0
            ? <p className={styles.empty}>Aucun scraping effectué.</p>
            : recentLogs.map(l => (
              <div key={l.id} className={styles.alertItem}>
                <div className={styles.alertIcon} style={{ background: 'rgba(123,208,255,0.08)' }}>
                  {l.status === 'success'
                    ? <CheckCircle size={14} style={{ color: 'var(--primary)' }} strokeWidth={2} />
                    : <Radio size={14} style={{ color: 'var(--outline)' }} strokeWidth={2} />
                  }
                </div>
                <div className={styles.alertBody}>
                  <p className={styles.alertTitle}>
                    {l.source} — {l.jobs_new ?? 0} nouvelles offres
                  </p>
                  <p className={styles.alertMeta}>
                    {l.jobs_found ?? 0} trouvées · {l.status}
                    <span className={styles.alertTime}>{timeAgo(l.started_at)}</span>
                  </p>
                </div>
              </div>
            ))
          }
        </section>
      </aside>
    </>
  )
}
