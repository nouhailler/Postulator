import { useState, useEffect } from 'react'
import { X, ExternalLink, Brain, MapPin, Clock, Zap, Building2 } from 'lucide-react'
import styles from './JobCard.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreMeta(score) {
  if (score >= 90) return { cls: styles.scoreTeal, barCls: styles.barTeal,  label: `${score}%`, hint: 'Excellent match' }
  if (score >= 80) return { cls: styles.scoreBlue, barCls: styles.barBlue,  label: `${score}%`, hint: 'Bon match' }
  return              { cls: styles.scoreDefault, barCls: styles.barDefault, label: `${score}%`, hint: 'Match partiel' }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function JobModal({ job, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const { cls: scoreCls, barCls, hint } = scoreMeta(job.score)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        {/* ── Bouton fermer ── */}
        <button className={styles.closeBtn} onClick={onClose} title="Fermer (Échap)">
          <X size={14} strokeWidth={2.5} />
        </button>

        {/* ── Bandeau score ── */}
        <div className={`${styles.scoreBanner} ${scoreCls}`}>
          <div className={styles.scoreBannerLeft}>
            <span className={styles.scoreBig}>{job.score}%</span>
            <span className={styles.scoreHint}>{hint}</span>
          </div>
          <div className={styles.scoreBarWrap}>
            <div className={`${styles.scoreBar} ${barCls}`} style={{ width: `${job.score}%` }} />
          </div>
        </div>

        {/* ── En-tête ── */}
        <div className={styles.modalHeader}>
          <div className={styles.modalLogo}>{job.initials}</div>
          <div className={styles.modalMeta}>
            <h2 className={styles.modalTitle}>{job.title}</h2>
            <p className={styles.modalCompany}>
              <Building2 size={11} strokeWidth={2} style={{ opacity: 0.5 }} />
              {job.company}
            </p>
          </div>
        </div>

        {/* ── Infos contextuelles ── */}
        <div className={styles.modalPills}>
          {job.location && job.location !== 'Non précisé' && (
            <span className={styles.pill}>
              <MapPin size={10} strokeWidth={2} /> {job.location}
            </span>
          )}
          {job.is_remote && (
            <span className={`${styles.pill} ${styles.pillRemote}`}>Remote</span>
          )}
          <span className={styles.pill}>
            <Clock size={10} strokeWidth={2} /> il y a {job.postedAt}
          </span>
          <span className={`${styles.pill} ${styles.pillSource}`}>{job.source}</span>
        </div>

        {/* ── Séparateur ── */}
        <div className={styles.divider} />

        {/* ── Analyse IA ── */}
        {job.ai_summary ? (
          <div className={styles.modalAI}>
            <div className={styles.modalAITitle}>
              <Brain size={12} strokeWidth={2} />
              Analyse IA
            </div>
            <p className={styles.modalAIText}>{job.ai_summary}</p>
          </div>
        ) : (
          <div className={styles.modalNoAI}>
            <Zap size={13} strokeWidth={2} />
            <span>Aucune analyse IA disponible — lancez un scoring sur cette offre.</span>
          </div>
        )}

        {/* ── Tags techniques ── */}
        {job.tags?.length > 0 && (
          <div className={styles.modalTagsWrap}>
            <p className={styles.modalTagsLabel}>Technologies</p>
            <div className={styles.modalTags}>
              {job.tags.map(t => <span key={t} className="chip">{t}</span>)}
            </div>
          </div>
        )}

        {/* ── Footer : bouton action ── */}
        <div className={styles.modalFooter}>
          {job.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className={styles.applyBtn}
            >
              Voir l'offre complète
              <ExternalLink size={13} strokeWidth={2} />
            </a>
          ) : (
            <span className={styles.noUrl}>URL de l'offre non disponible</span>
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
