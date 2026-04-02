import styles from './JobCard.module.css'

// Couleur du badge selon le score
function scoreMeta(score) {
  if (score >= 90) return { cls: styles.scoreTeal, label: `${score}%` }
  if (score >= 80) return { cls: styles.scoreBlue, label: `${score}%` }
  return { cls: styles.scoreDefault, label: `${score}%` }
}

export default function JobCard({ job }) {
  const { cls: scoreCls, label: scoreLabel } = scoreMeta(job.score)

  return (
    <div className={styles.card}>
      {/* Score badge IA en haut à droite */}
      <span className={`${styles.score} ${scoreCls}`}>{scoreLabel}</span>

      {/* Logo / initiales */}
      <div className={styles.logo}>{job.initials}</div>

      {/* Titre */}
      <p className={styles.title}>{job.title}</p>

      {/* Entreprise · Lieu */}
      <p className={styles.company}>{job.company} · {job.location}</p>

      {/* Tech tags */}
      <div className={styles.tags}>
        {job.tags.map(tag => (
          <span key={tag} className="chip">{tag}</span>
        ))}
      </div>

      {/* Footer : source + ancienneté */}
      <div className={styles.footer}>
        <span className={styles.source}>{job.source}</span>
        <span className={styles.age}>il y a {job.postedAt}</span>
      </div>
    </div>
  )
}
