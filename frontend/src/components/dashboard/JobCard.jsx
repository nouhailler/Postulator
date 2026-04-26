import { useState, useEffect } from 'react'
import { X, ExternalLink, Brain, MapPin, Clock, Zap } from 'lucide-react'
import styles from './JobCard.module.css'

// ── Score badge ───────────────────────────────────────────────────────────────

function scoreMeta(score) {
  if (score >= 90) return { cls: styles.scoreTeal, label: `${score}%` }
  if (score >= 80) return { cls: styles.scoreBlue, label: `${score}%` }
  return { cls: styles.scoreDefault, label: `${score}%` }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function JobModal({ job, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const { cls: scoreCls } = scoreMeta(job.score)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        {/* Close */}
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={15} strokeWidth={2} />
        </button>

        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalLogo}>{job.initials}</div>
          <div className={styles.modalMeta}>
            <h2 className={styles.modalTitle}>{job.title}</h2>
            <p className={styles.modalCompany}>{job.company}</p>
            <div className={styles.modalInfo}>
              {job.location && job.location !== 'Non précisé' && (
                <span className={styles.modalInfoItem}>
                  <MapPin size={10} strokeWidth={2} /> {job.location}
                </span>
              )}
              {job.is_remote && (
                <span className={styles.modalRemote}>Remote</span>
              )}
              <span className={styles.modalInfoItem}>
                <Clock size={10} strokeWidth={2} /> il y a {job.postedAt}
              </span>
            </div>
          </div>
          <div className={`${styles.modalScore} ${scoreCls}`}>
            {job.score}%
          </div>
        </div>

        {/* AI Summary */}
        {job.ai_summary ? (
          <div className={styles.modalAI}>
            <div className={styles.modalAITitle}>
              <Brain size={11} strokeWidth={2} style={{ color: 'var(--tertiary)' }} />
              Analyse IA
            </div>
            <p className={styles.modalAIText}>{job.ai_summary}</p>
          </div>
        ) : (
          <div className={styles.modalNoAI}>
            <Zap size={11} strokeWidth={2} />
            Aucune analyse IA disponible — lancez un scoring sur cette offre.
          </div>
        )}

        {/* Tags */}
        {job.tags?.length > 0 && (
          <div className={styles.modalTags}>
            {job.tags.map(t => <span key={t} className="chip">{t}</span>)}
          </div>
        )}

        {/* Footer */}
        <div className={styles.modalFooter}>
          <span className={styles.sourceChip}>{job.source}</span>
          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className={styles.applyBtn}
            >
              Voir l'offre <ExternalLink size={12} strokeWidth={2} />
            </a>
          ) : (
            <span className={styles.noUrl}>URL non disponible</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

export default function JobCard({ job }) {
  const [modalOpen, setModalOpen] = useState(false)
  const { cls: scoreCls, label: scoreLabel } = scoreMeta(job.score)

  return (
    <>
      <div className={styles.card} onClick={() => setModalOpen(true)}>
        <span className={`${styles.score} ${scoreCls}`}>{scoreLabel}</span>
        <div className={styles.logo}>{job.initials}</div>
        <p className={styles.title}>{job.title}</p>
        <p className={styles.company}>{job.company} · {job.location}</p>
        <div className={styles.tags}>
          {job.tags.map(tag => (
            <span key={tag} className="chip">{tag}</span>
          ))}
        </div>
        <div className={styles.footer}>
          <span className={styles.source}>{job.source}</span>
          <span className={styles.age}>il y a {job.postedAt}</span>
        </div>
      </div>

      {modalOpen && (
        <JobModal job={job} onClose={() => setModalOpen(false)} />
      )}
    </>
  )
}
