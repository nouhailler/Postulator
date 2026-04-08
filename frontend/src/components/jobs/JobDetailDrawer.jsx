import { useEffect, useRef } from 'react'
import { X, ExternalLink, Brain, MapPin, Building2, Clock, Loader, Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import styles from './JobDetailDrawer.module.css'

const STATUS_LABELS = {
  new: 'À voir', to_apply: 'À postuler', applied: 'Postulé',
  interview: 'Entretien', rejected: 'Rejeté',
}
const STATUS_COLORS = {
  new: 'var(--outline)', to_apply: 'var(--primary)', applied: 'var(--tertiary)',
  interview: '#00af9d', rejected: 'var(--error)',
}

// ── Parser le JSON du score IA ────────────────────────────────────────────────
function parseScoreData(raw) {
  if (!raw) return null
  // Le score peut être stocké comme string JSON ou comme objet
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ── Panneau score IA formaté ──────────────────────────────────────────────────
function ScorePanel({ scoreData, score }) {
  if (!scoreData && score == null) return null

  const scoreColor = score == null ? 'var(--outline)'
    : score >= 80 ? 'var(--tertiary)'
    : score >= 60 ? 'var(--primary)'
    : '#f9c74f'

  const strengths    = scoreData?.strengths    ?? []
  const gaps         = scoreData?.gaps         ?? []
  const recommendation = scoreData?.recommendation ?? null

  return (
    <div className={styles.scorePanel}>
      {/* Score global */}
      <div className={styles.scorePanelHeader}>
        <div className={styles.scorePanelIcon}>
          <Brain size={14} strokeWidth={2} style={{ color: scoreColor }} />
        </div>
        <span className={styles.scorePanelTitle}>Analyse IA du match</span>
        {score != null && (
          <span className={styles.scorePanelValue} style={{ color: scoreColor }}>
            {Math.round(score)}%
          </span>
        )}
      </div>

      {/* Points forts */}
      {strengths.length > 0 && (
        <div className={styles.scorePanelSection}>
          <p className={styles.scorePanelSectionLabel}>
            <TrendingUp size={11} strokeWidth={2} style={{ color: 'var(--tertiary)' }} />
            Points forts
          </p>
          <ul className={styles.scorePanelList}>
            {strengths.map((s, i) => (
              <li key={i} className={`${styles.scorePanelItem} ${styles.scorePanelStrength}`}>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lacunes */}
      {gaps.length > 0 && (
        <div className={styles.scorePanelSection}>
          <p className={styles.scorePanelSectionLabel}>
            <TrendingDown size={11} strokeWidth={2} style={{ color: '#f9c74f' }} />
            Points d'attention
          </p>
          <ul className={styles.scorePanelList}>
            {gaps.map((g, i) => (
              <li key={i} className={`${styles.scorePanelItem} ${styles.scorePanelGap}`}>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommandation */}
      {recommendation && (
        <div className={styles.scorePanelReco}>
          <Minus size={10} strokeWidth={2} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
          <p className={styles.scorePanelRecoText}>{recommendation}</p>
        </div>
      )}
    </div>
  )
}

// ── Panneau résumé IA (ai_summary) ────────────────────────────────────────────
function SummaryPanel({ summary }) {
  if (!summary) return null
  const lines = summary.split('\n').filter(l => l.trim())
  return (
    <div className={styles.summaryPanel}>
      <div className={styles.summaryPanelHeader}>
        <Sparkles size={13} strokeWidth={2} style={{ color: 'var(--tertiary)' }} />
        <span className={styles.summaryPanelTitle}>Résumé IA du poste</span>
      </div>
      <ul className={styles.summaryList}>
        {lines.map((line, i) => {
          const clean = line.replace(/^[•\-\*]\s*/, '').trim()
          if (!clean) return null
          return (
            <li key={i} className={styles.summaryItem}>{clean}</li>
          )
        })}
      </ul>
    </div>
  )
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

export default function JobDetailDrawer({ job, loadingDescription = false, onClose, onScore, onStatusChange }) {
  const drawerRef = useRef()

  useEffect(() => {
    const handleKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = job ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [job])

  if (!job) return null

  const salary     = formatSalary(job.salary_min, job.salary_max, job.salary_currency)
  const score      = job.ai_score != null ? Math.round(job.ai_score) : null
  const scoreColor = score == null   ? 'var(--outline)'
                   : score >= 80     ? 'var(--tertiary)'
                   : score >= 60     ? 'var(--primary)'
                   :                   '#f9c74f'

  const initials = (job.company ?? '?')
    .split(/[\s\-&]+/).slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '').join('')

  // Parser le score détaillé — peut être dans ai_summary (JSON) ou ailleurs
  // On essaie d'abord de parser ai_summary comme JSON de score
  let scoreData = null
  let summaryText = null

  if (job.ai_summary) {
    const parsed = parseScoreData(job.ai_summary)
    if (parsed && (parsed.score != null || parsed.strengths || parsed.gaps)) {
      // C'est un JSON de score
      scoreData = parsed
    } else {
      // C'est du texte libre (résumé bullet points)
      summaryText = job.ai_summary
    }
  }

  const hasScoreInfo = scoreData || score != null
  const hasAiContent = scoreData || summaryText

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
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', textDecoration: 'none' }}
            onClick={e => { if (!job.url) { e.preventDefault(); alert('URL non disponible.') } }}
          >
            <ExternalLink size={13} strokeWidth={2} />
            Voir l'offre
          </a>
        </div>

        {/* ── Panneau score IA (strengths / gaps / recommandation) ── */}
        {scoreData && (
          <div className={styles.aiSection}>
            <ScorePanel scoreData={scoreData} score={score} />
          </div>
        )}

        {/* ── Résumé IA bullet points ── */}
        {summaryText && (
          <div className={styles.aiSection}>
            <SummaryPanel summary={summaryText} />
          </div>
        )}

        {/* ── Description brute ── */}
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
