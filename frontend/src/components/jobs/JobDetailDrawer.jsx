import { useEffect, useRef } from 'react'
import { X, ExternalLink, Brain, MapPin, Building2, Clock, Loader } from 'lucide-react'
import styles from './JobDetailDrawer.module.css'

const STATUS_LABELS = {
  new: 'À voir', to_apply: 'À postuler', applied: 'Postulé',
  interview: 'Entretien', rejected: 'Rejeté',
}
const STATUS_COLORS = {
  new: 'var(--outline)', to_apply: 'var(--primary)', applied: 'var(--tertiary)',
  interview: '#00af9d', rejected: 'var(--error)',
}

/** Rendu Markdown minimal sans dépendance */
function SimpleMarkdown({ text }) {
  if (!text) return (
    <p style={{ color: 'var(--outline)', fontSize: 13, fontStyle: 'italic' }}>
      Aucune description disponible pour cette offre.
    </p>
  )

  const lines    = text.split('\n')
  const elements = []
  let key = 0

  for (const line of lines) {
    const k = key++
    if (line.startsWith('### '))     elements.push(<h3 key={k} className={styles.mdH3}>{line.slice(4)}</h3>)
    else if (line.startsWith('## ')) elements.push(<h2 key={k} className={styles.mdH2}>{line.slice(3)}</h2>)
    else if (line.startsWith('# '))  elements.push(<h2 key={k} className={styles.mdH2}>{line.slice(2)}</h2>)
    else if (line.startsWith('- ') || line.startsWith('* '))
      elements.push(<li key={k} className={styles.mdLi}>{renderInline(line.slice(2))}</li>)
    else if (line.trim() === '')     elements.push(<div key={k} style={{ height: 8 }} />)
    else                             elements.push(<p key={k} className={styles.mdP}>{renderInline(line)}</p>)
  }
  return <div className={styles.mdRoot}>{elements}</div>
}

function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*')  && part.endsWith('*'))  return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

function formatSalary(min, max, currency) {
  if (!min && !max) return null
  const fmt = n => (n / 1000).toFixed(0) + 'k'
  const cur = currency ?? '€'
  if (min && max) return `${fmt(min)} – ${fmt(max)} ${cur}`
  if (min) return `≥ ${fmt(min)} ${cur}`
  return `≤ ${fmt(max)} ${cur}`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Drawer latéral — détail complet d'une offre
 * @param {{
 *   job: object|null,
 *   loadingDescription: boolean,
 *   onClose: () => void,
 *   onScore: (job) => void,
 *   onStatusChange: (id, status) => void
 * }}
 */
export default function JobDetailDrawer({ job, loadingDescription = false, onClose, onScore, onStatusChange }) {
  const drawerRef = useRef()

  // Fermer avec Escape
  useEffect(() => {
    const handleKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Bloquer le scroll body
  useEffect(() => {
    document.body.style.overflow = job ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [job])

  if (!job) return null

  const salary     = formatSalary(job.salary_min, job.salary_max, job.salary_currency)
  const score      = job.ai_score != null ? Math.round(job.ai_score) : null
  const scoreColor = score == null        ? 'var(--outline)'
                   : score >= 80          ? 'var(--tertiary)'
                   : score >= 60          ? 'var(--primary)'
                   :                        'var(--outline)'

  const initials = (job.company ?? '?')
    .split(/[\s\-&]+/).slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '').join('')

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />

      <aside ref={drawerRef} className={styles.drawer}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.initials}>{initials}</div>
            <div>
              <p className={styles.company}>{job.company}</p>
              <p className={styles.source}>{job.source}</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fermer">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* ── Titre + score ── */}
        <div className={styles.titleRow}>
          <h2 className={`${styles.title} font-headline tracking-tight`}>{job.title}</h2>
          {score != null && (
            <span className={styles.scoreBadge} style={{ color: scoreColor, borderColor: scoreColor }}>
              {score}%
            </span>
          )}
        </div>

        {/* ── Métadonnées ── */}
        <div className={styles.meta}>
          {job.location && (
            <span className={styles.metaItem}><MapPin size={11} strokeWidth={2} /> {job.location}</span>
          )}
          {job.job_type && (
            <span className={styles.metaItem}><Building2 size={11} strokeWidth={2} /> {job.job_type}</span>
          )}
          {job.published_at && (
            <span className={styles.metaItem}><Clock size={11} strokeWidth={2} /> {formatDate(job.published_at)}</span>
          )}
          {job.is_remote   && <span className={styles.remoteBadge}>Remote</span>}
          {salary          && <span className={styles.salaryBadge}>{salary}</span>}
        </div>

        {/* ── Statut Kanban ── */}
        <div className={styles.statusRow}>
          <span className={styles.statusRowLabel}>Statut pipeline :</span>
          <div className={styles.statusChips}>
            {Object.keys(STATUS_LABELS).map(s => (
              <button
                key={s}
                className={`${styles.statusChip} ${job.status === s ? styles.statusChipActive : ''}`}
                style={job.status === s ? { borderColor: STATUS_COLORS[s], color: STATUS_COLORS[s] } : {}}
                onClick={() => onStatusChange(job.id, s)}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Actions ── */}
        <div className={styles.actions}>
          <button
            className="btn-primary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => onScore(job)}
          >
            <Brain size={13} strokeWidth={2.5} />
            Scorer avec mon CV
          </button>

          {/* Voir l'offre → ouvre un nouvel onglet */}
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', textDecoration: 'none' }}
            onClick={e => {
              // S'assurer que l'URL est valide avant d'ouvrir
              if (!job.url) { e.preventDefault(); alert('URL non disponible pour cette offre.') }
            }}
          >
            <ExternalLink size={13} strokeWidth={2} />
            Voir l'offre
          </a>
        </div>

        {/* ── Description ── */}
        <div className={styles.descSection}>
          <div className={styles.descLabelRow}>
            <p className={styles.descLabel}>Description</p>
            {loadingDescription && (
              <span className={styles.descLoading}>
                <Loader size={11} strokeWidth={2} className={styles.descSpinner} />
                Chargement…
              </span>
            )}
          </div>
          <div className={styles.descBody}>
            {loadingDescription && !job.description
              ? <div className={styles.descSkeleton}>
                  <div className={styles.skeletonLine} style={{ width: '80%' }} />
                  <div className={styles.skeletonLine} style={{ width: '65%' }} />
                  <div className={styles.skeletonLine} style={{ width: '90%' }} />
                  <div className={styles.skeletonLine} style={{ width: '55%' }} />
                </div>
              : <SimpleMarkdown text={job.description} />
            }
          </div>
        </div>

      </aside>
    </>
  )
}
