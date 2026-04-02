import { useCallback, useState } from 'react'
import { useAsync } from '../hooks/useAsync.js'
import { fetchJobs, updateJobStatus } from '../api/jobs.js'
import styles from './BoardPage.module.css'

// ── Configuration des colonnes Kanban ────────────────────────────────────────

const COLUMNS = [
  { id: 'new',       label: 'À voir',     color: '#88929b', emoji: '👁' },
  { id: 'to_apply',  label: 'À postuler', color: '#7bd0ff', emoji: '📋' },
  { id: 'applied',   label: 'Postulé',    color: '#3cddc7', emoji: '✉' },
  { id: 'interview', label: 'Entretien',  color: '#00af9d', emoji: '🗓' },
  { id: 'rejected',  label: 'Rejeté',     color: '#ffb4ab', emoji: '✕' },
]

// ── Carte Kanban ──────────────────────────────────────────────────────────────

function KanbanCard({ job, onMove }) {
  const score = job.ai_score ? Math.round(job.ai_score) : null
  const colIndex = COLUMNS.findIndex(c => c.id === job.status)

  return (
    <div
      className={styles.card}
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('job_id', String(job.id))
        e.dataTransfer.setData('from_status', job.status)
      }}
    >
      <div className={styles.cardPill} style={{ background: COLUMNS[colIndex]?.color ?? 'var(--outline)' }} />
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <div className={styles.cardInitials}>{getInitials(job.company)}</div>
          {score !== null && (
            <span className={styles.cardScore} style={{ color: score >= 80 ? 'var(--tertiary)' : 'var(--primary)' }}>
              {score}%
            </span>
          )}
        </div>
        <p className={styles.cardTitle}>{job.title}</p>
        <p className={styles.cardCompany}>{job.company}</p>
        {job.location && <p className={styles.cardLocation}>{job.location}</p>}
        <div className={styles.cardFooter}>
          <span className={styles.cardSource}>{job.source}</span>
          <div className={styles.cardMoves}>
            {colIndex > 0 && (
              <button className={styles.moveBtn} onClick={() => onMove(job.id, COLUMNS[colIndex - 1].id)} title={`← ${COLUMNS[colIndex - 1].label}`}>←</button>
            )}
            {colIndex < COLUMNS.length - 1 && (
              <button className={styles.moveBtn} onClick={() => onMove(job.id, COLUMNS[colIndex + 1].id)} title={`${COLUMNS[colIndex + 1].label} →`}>→</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Colonne Kanban ────────────────────────────────────────────────────────────

function KanbanColumn({ col, jobs, onMove, dragOverCol, onDragOver, onDrop }) {
  return (
    <div
      className={`${styles.column} ${dragOverCol === col.id ? styles.columnOver : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver(col.id) }}
      onDrop={e => { e.preventDefault(); onDrop(e, col.id) }}
      onDragLeave={() => onDragOver(null)}
    >
      <div className={styles.colHeader}>
        <div className={styles.colDot} style={{ background: col.color }} />
        <span className={styles.colLabel}>{col.label}</span>
        <span className={styles.colCount}>{jobs.length}</span>
      </div>
      <div className={styles.colBody}>
        {jobs.length === 0 && (
          <div className={styles.colEmpty}>
            <span style={{ fontSize: 20 }}>{col.emoji}</span>
            <p>Glissez des offres ici</p>
          </div>
        )}
        {jobs.map(job => <KanbanCard key={job.id} job={job} onMove={onMove} />)}
      </div>
    </div>
  )
}

function getInitials(company = '') {
  return company.split(/[\s\-&]+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

// ── Mock jobs pour le fallback (backend offline) ──────────────────────────────

const MOCK_JOBS = [
  { id: 1, title: 'Senior Frontend Engineer', company: 'Stripe',      location: 'Remote',        source: 'LinkedIn',  status: 'new',       ai_score: 96 },
  { id: 2, title: 'AI Platform Engineer',     company: 'Vercel',      location: 'Remote',        source: 'Indeed',    status: 'new',       ai_score: 92 },
  { id: 3, title: 'ML Infra Developer',       company: 'HuggingFace', location: 'Paris',         source: 'HF Jobs',   status: 'new',       ai_score: 88 },
  { id: 4, title: 'Backend Python Engineer',  company: 'Scaleway',    location: 'Paris',         source: 'LinkedIn',  status: 'to_apply',  ai_score: 85 },
  { id: 5, title: 'DevOps / SRE Engineer',    company: 'OVHcloud',    location: 'Lyon / Remote', source: 'Glassdoor', status: 'to_apply',  ai_score: 83 },
  { id: 6, title: 'Developer Advocate – AI',  company: 'Mistral AI',  location: 'Paris',         source: 'Indeed',    status: 'applied',   ai_score: 81 },
  { id: 7, title: 'Tech Lead React',          company: 'BlaBlaCar',   location: 'Paris',         source: 'LinkedIn',  status: 'interview', ai_score: 79 },
  { id: 8, title: 'Fullstack JS Developer',   company: 'Deezer',      location: 'Paris',         source: 'Indeed',    status: 'rejected',  ai_score: 62 },
]

// ── Page principale ───────────────────────────────────────────────────────────

export default function BoardPage() {
  const [dragOverCol, setDragOverCol] = useState(null)
  const [filter, setFilter]           = useState('')

  const { data: apiJobs, loading, error, refetch } = useAsync(
    () => fetchJobs({ limit: 200 }),
    [],
    { fallback: null }
  )

  const jobs = apiJobs ?? MOCK_JOBS

  function getColJobs(colId) {
    return jobs.filter(j => {
      const matchStatus = j.status === colId
      const matchFilter = !filter || [j.title, j.company, j.location ?? '']
        .join(' ').toLowerCase().includes(filter.toLowerCase())
      return matchStatus && matchFilter
    })
  }

  const handleMove = useCallback(async (jobId, newStatus) => {
    try {
      await updateJobStatus(jobId, newStatus)
      refetch()
    } catch (err) {
      console.error('[BoardPage] move failed', err)
    }
  }, [refetch])

  const handleDrop = useCallback(async (e, targetStatus) => {
    const jobId = parseInt(e.dataTransfer.getData('job_id'), 10)
    const fromStatus = e.dataTransfer.getData('from_status')
    setDragOverCol(null)
    if (!jobId || fromStatus === targetStatus) return
    await handleMove(jobId, targetStatus)
  }, [handleMove])

  const totalJobs = jobs.length
  const applied   = jobs.filter(j => j.status === 'applied' || j.status === 'interview').length

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={`${styles.pageTitle} font-headline tracking-tight`}>Pipeline Kanban</h1>
          <p className={styles.pageSub}>
            {totalJobs} offres · {applied} candidatures actives — glissez-déposez pour changer le statut.
          </p>
        </div>
        <div className={styles.headerActions}>
          <input
            className={styles.filterInput}
            type="text"
            placeholder="Filtrer…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button className="btn-ghost" onClick={refetch} disabled={loading}>↺</button>
        </div>
      </div>

      {error && (
        <div className={styles.offlineBanner}>
          ◎ Backend hors ligne — données de démonstration affichées.
        </div>
      )}

      <div className={styles.board}>
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.id}
            col={col}
            jobs={getColJobs(col.id)}
            onMove={handleMove}
            dragOverCol={dragOverCol}
            onDragOver={setDragOverCol}
            onDrop={handleDrop}
          />
        ))}
      </div>
    </div>
  )
}
