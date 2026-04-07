import { useEffect } from 'react'
import { X, Brain, Radio, CheckCircle, Shield, Mail, Sparkles, Target } from 'lucide-react'
import { useAsync }          from '../../hooks/useAsync.js'
import { fetchHistory }      from '../../api/history.js'
import { fetchScrapeLogs }   from '../../api/scrapers.js'
import { fetchAlertStatus }  from '../../api/alerts.js'
import { getScoreBatchStatus } from '../../api/analysis.js'
import { useNavigate }       from 'react-router-dom'
import styles from './Drawer.module.css'

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return `il y a ${diff}s`
  if (diff < 3600)  return `il y a ${Math.floor(diff/60)}min`
  if (diff < 86400) return `il y a ${Math.floor(diff/3600)}h`
  return `il y a ${Math.floor(diff/86400)}j`
}

function scoreColor(s) {
  if (s == null) return 'var(--outline)'
  return s >= 80 ? 'var(--tertiary)' : s >= 60 ? 'var(--primary)' : 'var(--outline)'
}

function ScorePillInline({ score }) {
  if (score == null) return <span style={{ color: 'var(--outline)', fontSize: 11 }}>—</span>
  const v = Math.round(score)
  const bg = v >= 80 ? 'rgba(60,221,199,0.12)' : v >= 60 ? 'rgba(123,208,255,0.12)' : 'rgba(255,255,255,0.06)'
  const color = v >= 80 ? 'var(--tertiary)' : v >= 60 ? 'var(--primary)' : 'var(--outline)'
  return (
    <span style={{
      background: bg, color, borderRadius: 4, padding: '1px 6px',
      fontFamily: 'var(--font-headline)', fontSize: 11, fontWeight: 800,
    }}>
      {v}%
    </span>
  )
}

export default function AlertsDrawer({ open, onClose }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  const { data: history }     = useAsync(fetchHistory,                        [open], { fallback: [] })
  const { data: logs }        = useAsync(() => fetchScrapeLogs({ limit: 8 }), [open], { fallback: [] })
  const { data: alertStatus } = useAsync(fetchAlertStatus,                    [open], { fallback: null })
  // Résultats du dernier score en masse — rechargé à chaque ouverture
  const { data: batchStatus } = useAsync(getScoreBatchStatus,                 [open], { fallback: null })

  const threshold   = alertStatus?.score_threshold ?? 80
  const emailActive = alertStatus?.email_configured
  const highMatches = (history ?? []).filter(e => e.score >= threshold).slice(0, 5)
  const recentLogs  = (logs ?? []).slice(0, 6)

  // Résultats du batch score : trier par score décroissant, garder les 10 premiers
  const batchResults = (batchStatus?.results ?? [])
    .filter(r => r.score != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 10)
  const hasBatch = batchStatus && (batchStatus.done > 0 || batchStatus.running)

  if (!open) return null

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <aside className={`${styles.drawer} ${styles.drawerRight}`}>
        <div className={styles.header}>
          <h2 className={styles.title}>Alertes &amp; Activité</h2>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} strokeWidth={2} /></button>
        </div>

        {/* Statut email */}
        <section className={styles.section} style={{ paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={12} strokeWidth={2} style={{ color: emailActive ? 'var(--tertiary)' : 'var(--outline)' }} />
              <span style={{ fontSize: 12, color: emailActive ? 'var(--tertiary)' : 'var(--outline)' }}>
                {emailActive ? `Alertes email actives (≥ ${threshold}%)` : 'Alertes email désactivées'}
              </span>
            </div>
            {!emailActive && (
              <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}
                onClick={() => { onClose(); navigate('/settings') }}>
                Configurer
              </button>
            )}
          </div>
        </section>

        {/* ── Score en masse — résultats ── */}
        {hasBatch && (
          <section className={styles.section}>
            <p className={styles.sectionLabel}>
              <Target size={11} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              Score en masse
              {batchStatus.running && (
                <span style={{ color: 'var(--primary)', marginLeft: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>
                  en cours… {batchStatus.done}/{batchStatus.total}
                </span>
              )}
              {!batchStatus.running && batchStatus.cv_name && (
                <span style={{ color: 'var(--outline)', marginLeft: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>
                  {batchStatus.cv_name} · {batchStatus.done} offres
                  {batchStatus.finished_at && ` · ${timeAgo(batchStatus.finished_at)}`}
                </span>
              )}
            </p>

            {batchResults.length === 0 && !batchStatus.running && (
              <p className={styles.empty}>Aucun résultat disponible.</p>
            )}

            {batchResults.map((r, i) => (
              <div key={r.job_id ?? i} className={styles.alertItem}>
                <div className={styles.alertIcon} style={{ background: 'rgba(60,221,199,0.06)' }}>
                  <Brain size={14} strokeWidth={2} style={{ color: scoreColor(r.score) }} />
                </div>
                <div className={styles.alertBody}>
                  <p className={styles.alertTitle} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.job_title}
                    </span>
                    <ScorePillInline score={r.score} />
                  </p>
                  <p className={styles.alertMeta}>{r.job_company}</p>
                </div>
              </div>
            ))}

            {/* Offres avec erreur */}
            {batchStatus.errors > 0 && (
              <p style={{ fontSize: 10, color: 'var(--error)', marginTop: 4 }}>
                {batchStatus.errors} offre{batchStatus.errors > 1 ? 's' : ''} en erreur
              </p>
            )}
          </section>
        )}

        {/* Matches ≥ seuil */}
        <section className={styles.section}>
          <p className={styles.sectionLabel}>
            Meilleurs matches IA
            <span style={{ color: 'var(--primary)', marginLeft: 4, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              ≥ {threshold}%
            </span>
          </p>
          {highMatches.length === 0
            ? <p className={styles.empty}>Aucun match ≥ {threshold}% pour l'instant.<br />Analysez des offres dans CV Intelligence.</p>
            : highMatches.map(e => (
              <div key={e.id} className={styles.alertItem}>
                <div className={styles.alertIcon} style={{ background: 'rgba(60,221,199,0.1)' }}>
                  <Brain size={14} style={{ color: 'var(--tertiary)' }} strokeWidth={2} />
                </div>
                <div className={styles.alertBody}>
                  <p className={styles.alertTitle}>{e.job_title} · {e.job_company}</p>
                  <p className={styles.alertMeta}>
                    {e.cv_name} ·{' '}
                    <span style={{ color: scoreColor(e.score), fontWeight: 700 }}>{Math.round(e.score)}/100</span>
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
                <div className={styles.alertIcon} style={{
                  background: l.proxy_used ? 'rgba(60,221,199,0.08)' : 'rgba(123,208,255,0.08)'
                }}>
                  {l.proxy_used
                    ? <Shield size={14} style={{ color: 'var(--tertiary)' }} strokeWidth={2} />
                    : l.status === 'success'
                      ? <CheckCircle size={14} style={{ color: 'var(--primary)' }} strokeWidth={2} />
                      : <Radio size={14} style={{ color: 'var(--outline)' }} strokeWidth={2} />
                  }
                </div>
                <div className={styles.alertBody}>
                  <p className={styles.alertTitle}>
                    {l.source}
                    {l.proxy_used && <span style={{ fontSize: 10, color: 'var(--tertiary)', marginLeft: 6 }}>🛡️ proxy</span>}
                    {' '}— {l.jobs_new ?? 0} nouvelles offres
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
