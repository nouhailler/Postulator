import { useState } from 'react'
import { Trash2, ExternalLink, ChevronDown, ChevronUp, RefreshCw, Mail, Loader, CheckCircle } from 'lucide-react'
import { useAsync }   from '../hooks/useAsync.js'
import { fetchHistory, deleteMatch } from '../api/history.js'
import { sendMatchAlert } from '../api/alerts.js'
import styles from './HistoryPage.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function parseJson(str) {
  if (!str) return []
  try { return JSON.parse(str) } catch { return [] }
}

function ScoreBadge({ score }) {
  const v   = Math.round(score)
  const cls = v >= 80 ? styles.scoreTeal : v >= 60 ? styles.scoreBlue : styles.scoreGray
  return <span className={`${styles.score} ${cls}`}>{v}/100</span>
}

// ── Ligne détaillée (expandable) ─────────────────────────────────────────────

function HistoryRow({ entry, onDelete }) {
  const [expanded,    setExpanded]    = useState(false)
  const [sendingMail, setSendingMail] = useState(false)
  const [mailSent,    setMailSent]    = useState(false)
  const [mailError,   setMailError]   = useState(null)

  const skills    = parseJson(entry.cv_skills).slice(0, 8)
  const strengths = parseJson(entry.strengths)
  const gaps      = parseJson(entry.gaps)

  const handleSendAlert = async (e) => {
    e.stopPropagation()
    setSendingMail(true); setMailError(null)
    try {
      const res = await sendMatchAlert(entry.id)
      if (res.ok) { setMailSent(true); setTimeout(() => setMailSent(false), 4000) }
      else setMailError(res.error ?? 'Échec envoi email')
    } catch (err) {
      setMailError(err.detail ?? err.message ?? 'Erreur SMTP')
    } finally { setSendingMail(false) }
  }

  return (
    <>
      <tr
        className={`${styles.row} ${expanded ? styles.rowExpanded : ''}`}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Date */}
        <td className={styles.td}>
          <span className={styles.dateMain}>{formatDate(entry.analyzed_at).split(' ')[0]}</span>
          <span className={styles.dateTime}>{formatDate(entry.analyzed_at).split(' ').slice(1).join(' ')}</span>
        </td>

        {/* CV */}
        <td className={styles.td}>
          <span className={styles.cvName}>{entry.cv_name}</span>
          {skills.length > 0 && (
            <div className={styles.skillsRow}>
              {skills.map(s => <span key={s} className={styles.skill}>{s}</span>)}
              {parseJson(entry.cv_skills).length > 8 && (
                <span className={styles.skillMore}>+{parseJson(entry.cv_skills).length - 8}</span>
              )}
            </div>
          )}
        </td>

        {/* Offre */}
        <td className={styles.td}>
          <span className={styles.jobTitle}>{entry.job_title}</span>
          <span className={styles.jobCompany}>{entry.job_company}</span>
        </td>

        {/* Score */}
        <td className={`${styles.td} ${styles.tdCenter}`}>
          <ScoreBadge score={entry.score} />
        </td>

        {/* Actions */}
        <td className={`${styles.td} ${styles.tdRight}`} onClick={e => e.stopPropagation()}>
          <div className={styles.rowActions}>
            {/* Bouton alerte email */}
            <button
              className={`${styles.actionIcon} ${mailSent ? styles.actionSent : ''}`}
              onClick={handleSendAlert}
              disabled={sendingMail || mailSent}
              title={mailSent ? 'Email envoyé !' : 'Envoyer une alerte email pour ce match'}
            >
              {sendingMail
                ? <Loader size={12} className={styles.spin} strokeWidth={2} />
                : mailSent
                  ? <CheckCircle size={12} strokeWidth={2} />
                  : <Mail size={12} strokeWidth={2} />
              }
            </button>

            {entry.job_url && (
              <a href={entry.job_url} target="_blank" rel="noreferrer"
                className={styles.actionIcon} title="Voir l'offre originale">
                <ExternalLink size={13} strokeWidth={2} />
              </a>
            )}
            <button className={`${styles.actionIcon} ${styles.actionDelete}`}
              onClick={() => onDelete(entry.id)} title="Supprimer">
              <Trash2 size={12} strokeWidth={2} />
            </button>
            <span className={styles.expandIcon}>
              {expanded ? <ChevronUp size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />}
            </span>
          </div>

          {/* Message erreur email (inline sous les boutons) */}
          {mailError && (
            <p className={styles.mailError}>{mailError}</p>
          )}
        </td>
      </tr>

      {/* ── Détail expandable ── */}
      {expanded && (
        <tr className={styles.detailRow}>
          <td colSpan={5} className={styles.detailCell}>
            <div className={styles.detailGrid}>

              {entry.recommendation && (
                <div className={styles.detailFull}>
                  <p className={styles.detailLabel}>Synthèse Ollama</p>
                  <p className={styles.detailRec}>{entry.recommendation}</p>
                </div>
              )}

              {strengths.length > 0 && (
                <div>
                  <p className={styles.detailLabel} style={{ color: 'var(--tertiary)' }}>✦ Points forts</p>
                  <ul className={styles.detailList}>
                    {strengths.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}

              {gaps.length > 0 && (
                <div>
                  <p className={styles.detailLabel} style={{ color: 'var(--primary)' }}>◎ Points de développement</p>
                  <ul className={styles.detailList}>
                    {gaps.map((g, i) => <li key={i}>{g}</li>)}
                  </ul>
                </div>
              )}

              <div className={styles.detailMeta}>
                {entry.ollama_model && <span className={styles.metaChip}>🤖 {entry.ollama_model}</span>}
                {entry.job_source   && <span className={styles.metaChip}>📡 {entry.job_source}</span>}
                {entry.job_url && (
                  <a href={entry.job_url} target="_blank" rel="noreferrer" className={styles.metaLink}>
                    <ExternalLink size={11} strokeWidth={2} /> Voir l'offre originale
                  </a>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { data: history, loading, error, refetch } = useAsync(fetchHistory, [], { fallback: [] })

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette entrée de l\'historique ?')) return
    try { await deleteMatch(id); refetch() }
    catch (err) { console.error(err) }
  }

  const totalMatches = history?.length ?? 0
  const avgScore = totalMatches
    ? Math.round(history.reduce((sum, e) => sum + e.score, 0) / totalMatches)
    : 0
  const bestMatch = totalMatches
    ? history.reduce((best, e) => e.score > best.score ? e : best, history[0])
    : null

  return (
    <div className={styles.page}>

      <div className={styles.pageHeader}>
        <div>
          <h1 className={`${styles.pageTitle} font-headline tracking-tight`}>Historique des Matches</h1>
          <p className={styles.pageSub}>
            Résultats d'analyses CV ↔ offres sauvegardés — cliquez sur une ligne pour le détail.
          </p>
        </div>
        <button className="btn-ghost" onClick={refetch} disabled={loading}>
          <RefreshCw size={13} strokeWidth={2} />
        </button>
      </div>

      {totalMatches > 0 && (
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <p className={styles.statValue}>{totalMatches}</p>
            <p className={styles.statLabel}>Analyses sauvegardées</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statValue} style={{
              color: avgScore >= 80 ? 'var(--tertiary)' : avgScore >= 60 ? 'var(--primary)' : 'var(--outline)'
            }}>
              {avgScore}/100
            </p>
            <p className={styles.statLabel}>Score moyen</p>
          </div>
          {bestMatch && (
            <div className={`${styles.statCard} ${styles.statCardBest}`}>
              <p className={styles.statValue} style={{ color: 'var(--tertiary)' }}>
                {Math.round(bestMatch.score)}/100
              </p>
              <p className={styles.statLabel}>
                Meilleur match — {bestMatch.job_title} · {bestMatch.job_company}
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className={styles.errorBanner}>
          Impossible de charger l'historique. Vérifiez que le backend est démarré.
        </div>
      )}

      {!loading && totalMatches === 0 && !error ? (
        <div className={styles.empty}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>📋</p>
          <p>Aucune analyse sauvegardée pour l'instant.</p>
          <p style={{ fontSize: 12, color: 'var(--outline)', marginTop: 4 }}>
            Analysez un CV contre une offre dans <strong>CV Intelligence</strong>,
            puis cliquez sur "Sauvegarder dans l'historique".
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Date</th>
                <th className={styles.th}>CV</th>
                <th className={styles.th}>Offre</th>
                <th className={`${styles.th} ${styles.thCenter}`}>Score</th>
                <th className={`${styles.th} ${styles.thRight}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(history ?? []).map(entry => (
                <HistoryRow key={entry.id} entry={entry} onDelete={handleDelete} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
