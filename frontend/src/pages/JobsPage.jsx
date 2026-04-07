import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, RefreshCw, Download, ExternalLink,
  ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown,
  Brain, Trash2, AlertTriangle, Globe,
} from 'lucide-react'
import { useAsync }    from '../hooks/useAsync.js'
import { fetchJobs, fetchJob, updateJobStatus, deleteJob, purgeJobs } from '../api/jobs.js'
import { mockJobs }    from '../data/mockData.js'
import JobDetailDrawer from '../components/jobs/JobDetailDrawer.jsx'
import styles          from './JobsPage.module.css'

// ── Constantes ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25
const SOURCES   = ['', 'indeed', 'linkedin', 'glassdoor', 'ziprecruiter', 'google']
const STATUSES  = ['', 'new', 'to_apply', 'applied', 'interview', 'rejected']

const STATUS_LABELS = {
  '': 'Tous', new: 'À voir', to_apply: 'À postuler',
  applied: 'Postulé', interview: 'Entretien', rejected: 'Rejeté',
}
const STATUS_COLORS = {
  new: 'var(--outline)', to_apply: 'var(--primary)',
  applied: 'var(--tertiary)', interview: '#00af9d', rejected: 'var(--error)',
}

const SORT_COLS = [
  { key: 'scraped_at',   label: 'Scrapée'    },
  { key: 'published_at', label: 'Publiée'    },
  { key: 'ai_score',     label: 'Score IA'   },
  { key: 'title',        label: 'Offre'      },
  { key: 'company',      label: 'Entreprise' },
]

// ── Sous-composants ───────────────────────────────────────────────────────────

function SortIcon({ colKey, sortBy, sortOrder }) {
  if (sortBy !== colKey) return <ArrowUpDown size={11} strokeWidth={2} style={{ opacity: 0.35 }} />
  return sortOrder === 'desc'
    ? <ArrowDown size={11} strokeWidth={2.5} style={{ color: 'var(--primary)' }} />
    : <ArrowUp   size={11} strokeWidth={2.5} style={{ color: 'var(--primary)' }} />
}

function ScorePill({ score }) {
  if (score == null) return <span className={styles.scoreNone}>—</span>
  const v   = Math.round(score)
  const cls = v >= 80 ? styles.scoreTeal : v >= 60 ? styles.scoreBlue : styles.scoreGray
  return <span className={`${styles.scorePill} ${cls}`}>{v}%</span>
}

function StatusDot({ status }) {
  return (
    <span className={styles.statusWrap}>
      <span className={styles.statusDot} style={{ background: STATUS_COLORS[status] ?? 'var(--outline)' }} />
      <span className={styles.statusText}>{STATUS_LABELS[status] ?? status}</span>
    </span>
  )
}

function RemoteBadge({ isRemote }) {
  if (!isRemote) return null
  return <span className={styles.remoteBadge}>Remote</span>
}

/**
 * Lien web entreprise — URL directe si disponible, sinon Google Search.
 */
function CompanyLink({ companyUrl, company }) {
  const href  = companyUrl || `https://www.google.com/search?q=${encodeURIComponent(company)}`
  const label = companyUrl ? _shortDomain(companyUrl) : 'Google →'
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`${styles.companyLink} ${companyUrl ? styles.companyLinkDirect : styles.companyLinkGoogle}`}
      onClick={e => e.stopPropagation()}
      title={companyUrl ? companyUrl : `Rechercher "${company}" sur Google`}
    >
      <Globe size={11} strokeWidth={2} className={styles.companyLinkIcon} />
      <span className={styles.companyLinkText}>{label}</span>
    </a>
  )
}

function _shortDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return hostname.length > 22 ? hostname.slice(0, 20) + '…' : hostname
  } catch {
    return url.slice(0, 20)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Date + heure précises — jamais "Aujourd'hui". */
function formatScrapedAt(iso) {
  if (!iso) return '—'
  const d    = new Date(iso)
  const date = d.toLocaleDateString('fr-FR',  { day: '2-digit', month: '2-digit' })
  const time = d.toLocaleTimeString('fr-FR',  { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}

/** Format relatif pour la date de publication de l'offre. */
function formatPublishedAt(iso) {
  if (!iso) return '—'
  const d    = new Date(iso)
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return 'Hier'
  if (diff < 7)   return `il y a ${diff}j`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function formatSalary(min, max, cur) {
  if (!min && !max) return null
  const fmt = n => (n / 1000).toFixed(0) + 'k'
  const c   = cur ?? '€'
  if (min && max) return `${fmt(min)}–${fmt(max)} ${c}`
  if (min)        return `≥ ${fmt(min)} ${c}`
  return          `≤ ${fmt(max)} ${c}`
}

function isoToCSV(iso) {
  if (!iso) return ''
  const d   = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function exportCSV(jobs) {
  const header = 'num,id,title,company,company_url,location,source,remote,salary,score,status,published_at,scraped_at,url'
  const rows = jobs.map((j, idx) => [
    idx + 1,                                              // ← numéro
    j.id,
    `"${(j.title    ?? '').replace(/"/g, '""')}"`,
    `"${(j.company  ?? '').replace(/"/g, '""')}"`,
    j.company_url ?? '',
    `"${(j.location ?? '').replace(/"/g, '""')}"`,
    j.source,
    j.is_remote ? 'oui' : 'non',
    formatSalary(j.salary_min, j.salary_max, j.salary_currency) ?? '',
    j.ai_score != null ? Math.round(j.ai_score) : '',
    j.status,
    isoToCSV(j.published_at),
    isoToCSV(j.scraped_at),
    j.url,
  ].join(','))
  const blob = new Blob([[header, ...rows].join('\n'), { type: 'text/csv;charset=utf-8;' }])
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `postulator-jobs-${Date.now()}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ── Modal Réinitialiser ───────────────────────────────────────────────────────

function ResetModal({ onConfirm, onCancel, loading }) {
  const [keepRecent, setKeepRecent] = useState(20)
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalIcon}>
          <AlertTriangle size={24} strokeWidth={2} style={{ color: 'var(--error)' }} />
        </div>
        <h3 className={styles.modalTitle}>Réinitialiser les offres</h3>
        <p className={styles.modalText}>
          Cette action va supprimer les offres en base.
          Les offres que vous avez sélectionnées (statut ≠ "À voir") seront toujours conservées.
        </p>
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>
            Garder les{' '}
            <input
              type="number" min={0} max={200}
              value={keepRecent}
              onChange={e => setKeepRecent(Math.max(0, parseInt(e.target.value) || 0))}
              className={styles.modalInput}
            />
            {' '}offres les plus récentes (0 = tout supprimer)
          </label>
        </div>
        <div className={styles.modalActions}>
          <button className="btn-ghost" onClick={onCancel} disabled={loading}>Annuler</button>
          <button className={styles.modalConfirm} onClick={() => onConfirm(keepRecent)} disabled={loading}>
            {loading ? 'Suppression…' : 'Confirmer la réinitialisation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function JobsPage() {
  const navigate = useNavigate()

  const [q,          setQ]          = useState('')
  const [source,     setSource]     = useState('')
  const [status,     setStatus]     = useState('')
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [minScore,   setMinScore]   = useState('')
  const [page,       setPage]       = useState(0)
  // Tri par défaut : scraped_at DESC — mêmes nouvelles en tête après scraping
  const [sortBy,    setSortBy]    = useState('scraped_at')
  const [sortOrder, setSortOrder] = useState('desc')
  const [selectedJob,   setSelectedJob]   = useState(null)
  const [loadingDrawer, setLoadingDrawer] = useState(false)
  const [showReset,  setShowReset]  = useState(false)
  const [resetting,  setResetting]  = useState(false)
  const [resetMsg,   setResetMsg]   = useState(null)

  const buildParams = () => ({
    q:          q         || undefined,
    source:     source    || undefined,
    status:     status    || undefined,
    is_remote:  remoteOnly || undefined,
    min_score:  minScore  || undefined,
    sort_by:    sortBy,
    sort_order: sortOrder,
    limit:      PAGE_SIZE,
    offset:     page * PAGE_SIZE,
  })

  const { data: apiJobs, loading, error, refetch } = useAsync(
    () => fetchJobs(buildParams()),
    [q, source, status, remoteOnly, minScore, sortBy, sortOrder, page],
    { fallback: null, refetchInterval: 10_000 }
  )

  const isOffline     = !!error
  const allJobs       = apiJobs ?? mockJobs
  const displayedJobs = isOffline
    ? (() => {
        let list = allJobs.filter(j => {
          if (q         && ![j.title, j.company, j.location ?? ''].join(' ').toLowerCase().includes(q.toLowerCase())) return false
          if (source    && j.source !== source)  return false
          if (status    && j.status !== status)  return false
          if (remoteOnly && !j.is_remote)        return false
          if (minScore  && (j.ai_score ?? 0) < Number(minScore)) return false
          return true
        })
        list = [...list].sort((a, b) => {
          const va = a[sortBy] ?? '', vb = b[sortBy] ?? ''
          if (va < vb) return sortOrder === 'desc' ? 1 : -1
          if (va > vb) return sortOrder === 'desc' ? -1 : 1
          return 0
        })
        return list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
      })()
    : allJobs

  const totalCount = isOffline ? allJobs.length : (apiJobs?.length ?? 0)
  const hasNext    = displayedJobs.length === PAGE_SIZE
  const hasPrev    = page > 0

  // Numéro global de la première ligne de la page courante (base 1)
  const pageOffset = page * PAGE_SIZE

  const applyFilter = fn => { fn(); setPage(0) }

  function handleSort(colKey) {
    if (sortBy === colKey) setSortOrder(o => o === 'desc' ? 'asc' : 'desc')
    else { setSortBy(colKey); setSortOrder('desc') }
    setPage(0)
  }

  const handleRowClick = useCallback(async (summaryJob) => {
    setSelectedJob(summaryJob)
    if (isOffline) return
    setLoadingDrawer(true)
    try { const full = await fetchJob(summaryJob.id); setSelectedJob(full) }
    catch (err) { console.error(err) }
    finally { setLoadingDrawer(false) }
  }, [isOffline])

  const handleStatusChange = useCallback(async (jobId, newStatus) => {
    setSelectedJob(prev => prev ? { ...prev, status: newStatus } : null)
    try { await updateJobStatus(jobId, newStatus); refetch() }
    catch (err) { console.error(err) }
  }, [refetch])

  const handleDelete = useCallback(async (jobId) => {
    if (!window.confirm('Supprimer cette offre ?')) return
    try {
      await deleteJob(jobId)
      if (selectedJob?.id === jobId) setSelectedJob(null)
      refetch()
    } catch (err) { console.error(err) }
  }, [selectedJob, refetch])

  const handleScore = useCallback((job) => {
    navigate(`/analysis?job_id=${job.id}`)
  }, [navigate])

  const handleReset = async (keepRecent) => {
    setResetting(true)
    try {
      const result = await purgeJobs({ keepRecent, keepSelected: true })
      setShowReset(false)
      setResetMsg(`✓ ${result.deleted} offre${result.deleted !== 1 ? 's' : ''} supprimée${result.deleted !== 1 ? 's' : ''} · ${result.remaining} conservée${result.remaining !== 1 ? 's' : ''}`)
      setTimeout(() => setResetMsg(null), 5000)
      setPage(0); refetch()
    } catch (err) { console.error(err) }
    finally { setResetting(false) }
  }

  return (
    <div className={styles.page}>

      {showReset && (
        <ResetModal onConfirm={handleReset} onCancel={() => setShowReset(false)} loading={resetting} />
      )}

      {/* En-tête */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={`${styles.pageTitle} font-headline tracking-tight`}>Offres</h1>
          <p className={styles.pageSub}>
            {totalCount} offre{totalCount !== 1 ? 's' : ''}
            {isOffline ? ' (démonstration)' : ''}
            {' · '} triées par{' '}
            <strong>{SORT_COLS.find(c => c.key === sortBy)?.label ?? sortBy}</strong>
            {' '}{sortOrder === 'desc' ? '↓' : '↑'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className="btn-ghost" onClick={() => exportCSV(displayedJobs)} title="Exporter CSV">
            <Download size={13} strokeWidth={2} /> CSV
          </button>
          <button className="btn-ghost" onClick={refetch} disabled={loading} title="Rafraîchir">
            <RefreshCw size={13} strokeWidth={2} className={loading ? styles.spin : ''} />
          </button>
          <button className={styles.resetBtn} onClick={() => setShowReset(true)}>
            <Trash2 size={13} strokeWidth={2} /> Réinitialiser
          </button>
        </div>
      </div>

      {resetMsg  && <div className={styles.resetBanner}>{resetMsg}</div>}
      {isOffline && <div className={styles.offlineBanner}>◎ Backend hors ligne — données de démonstration.</div>}

      {/* Filtres */}
      <div className={styles.filtersBar}>
        <div className={styles.searchWrap}>
          <Search size={13} className={styles.searchIcon} strokeWidth={2} />
          <input className={styles.searchInput} type="text" placeholder="Titre, entreprise…"
            value={q} onChange={e => applyFilter(() => setQ(e.target.value))} />
        </div>
        <select className={styles.select} value={source} onChange={e => applyFilter(() => setSource(e.target.value))}>
          {SOURCES.map(s => <option key={s} value={s}>{s || 'Toutes sources'}</option>)}
        </select>
        <select className={styles.select} value={status} onChange={e => applyFilter(() => setStatus(e.target.value))}>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <input className={styles.selectSmall} type="number" placeholder="Score min %"
          min={0} max={100} value={minScore} onChange={e => applyFilter(() => setMinScore(e.target.value))} />
        <label className={styles.toggleLabel}>
          <div className={`${styles.toggle} ${remoteOnly ? styles.toggleOn : ''}`}
            onClick={() => applyFilter(() => setRemoteOnly(p => !p))} role="switch">
            <span className={styles.toggleThumb} />
          </div>
          Remote
        </label>
      </div>

      {/* Tableau */}
      {displayedJobs.length === 0 && !loading ? (
        <div className={styles.empty}>
          <p>Aucune offre ne correspond aux critères.</p>
          <button className="btn-ghost" onClick={() => {
            setQ(''); setSource(''); setStatus(''); setRemoteOnly(false); setMinScore('')
          }}>Réinitialiser les filtres</button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {/* ── Numéro ── */}
                <th className={`${styles.th} ${styles.thNum}`}
                  title="Numéro d'ordre — identique dans le select 'Offre cible' de CV Matching">
                  #
                </th>
                {/* Offre */}
                <th className={`${styles.th} ${styles.thSortable} ${styles.thOffre}`}
                  onClick={() => handleSort('title')}>
                  Offre <SortIcon colKey="title" sortBy={sortBy} sortOrder={sortOrder} />
                </th>
                {/* Entreprise */}
                <th className={`${styles.th} ${styles.thSortable}`} onClick={() => handleSort('company')}>
                  Entreprise <SortIcon colKey="company" sortBy={sortBy} sortOrder={sortOrder} />
                </th>
                {/* Lien web */}
                <th className={`${styles.th} ${styles.thLien}`} title="Site web de l'entreprise ou recherche Google">
                  Lien web
                </th>
                <th className={styles.th}>Lieu</th>
                <th className={styles.th}>Source</th>
                <th className={`${styles.th} ${styles.thCenter} ${styles.thSortable}`}
                  onClick={() => handleSort('ai_score')}>
                  Score IA <SortIcon colKey="ai_score" sortBy={sortBy} sortOrder={sortOrder} />
                </th>
                <th className={styles.th}>Statut</th>
                <th className={`${styles.th} ${styles.thSortable} ${sortBy === 'scraped_at' ? styles.thSortActive : ''}`}
                  onClick={() => handleSort('scraped_at')} title="Date et heure exactes du scraping">
                  Scrapée <SortIcon colKey="scraped_at" sortBy={sortBy} sortOrder={sortOrder} />
                </th>
                <th className={`${styles.th} ${styles.thSortable} ${sortBy === 'published_at' ? styles.thSortActive : ''}`}
                  onClick={() => handleSort('published_at')}>
                  Publiée <SortIcon colKey="published_at" sortBy={sortBy} sortOrder={sortOrder} />
                </th>
                <th className={`${styles.th} ${styles.thRight}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedJobs.map((job, idx) => (
                <tr
                  key={job.id}
                  className={`${styles.row} ${selectedJob?.id === job.id ? styles.rowSelected : ''}`}
                  onClick={() => handleRowClick(job)}
                >
                  {/* ── Numéro d'ordre global (continue d'une page à l'autre) ── */}
                  <td className={`${styles.td} ${styles.tdNum}`}>
                    {pageOffset + idx + 1}
                  </td>

                  {/* Titre sur 2 lignes */}
                  <td className={`${styles.td} ${styles.tdOffre}`}>
                    <a href={job.url} target="_blank" rel="noreferrer"
                      className={styles.jobTitleLink} onClick={e => e.stopPropagation()}>
                      {job.title}
                    </a>
                    {job.is_remote && <RemoteBadge isRemote />}
                  </td>

                  {/* Entreprise */}
                  <td className={styles.td}>
                    <span className={styles.company}>{job.company}</span>
                  </td>

                  {/* Lien web */}
                  <td className={`${styles.td} ${styles.tdLien}`} onClick={e => e.stopPropagation()}>
                    <CompanyLink companyUrl={job.company_url} company={job.company} />
                  </td>

                  <td className={`${styles.td} ${styles.tdMuted}`}>{job.location ?? '—'}</td>
                  <td className={`${styles.td} ${styles.tdSource}`}>{job.source}</td>
                  <td className={`${styles.td} ${styles.thCenter}`}>
                    <ScorePill score={job.ai_score} />
                  </td>
                  <td className={styles.td}><StatusDot status={job.status} /></td>
                  <td className={`${styles.td} ${styles.tdTimestamp} ${sortBy === 'scraped_at' ? styles.tdSortActive : ''}`}>
                    {formatScrapedAt(job.scraped_at)}
                  </td>
                  <td className={`${styles.td} ${styles.tdMuted} ${sortBy === 'published_at' ? styles.tdSortActive : ''}`}>
                    {formatPublishedAt(job.published_at)}
                  </td>
                  <td className={`${styles.td} ${styles.thRight}`} onClick={e => e.stopPropagation()}>
                    <div className={styles.rowActions}>
                      <button className={styles.actionIcon} title="Scorer avec mon CV"
                        onClick={() => handleScore(job)}>
                        <Brain size={12} strokeWidth={2} />
                      </button>
                      <a href={job.url} target="_blank" rel="noreferrer"
                        className={styles.actionIcon} title="Voir l'offre">
                        <ExternalLink size={13} strokeWidth={2} />
                      </a>
                      <button className={`${styles.actionIcon} ${styles.actionDelete}`}
                        title="Supprimer" onClick={() => handleDelete(job.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(hasPrev || hasNext) && (
        <div className={styles.pagination}>
          <button className="btn-ghost" onClick={() => setPage(p => p - 1)} disabled={!hasPrev}>
            <ChevronLeft size={14} strokeWidth={2} /> Précédent
          </button>
          <span className={styles.pageInfo}>Page {page + 1}</span>
          <button className="btn-ghost" onClick={() => setPage(p => p + 1)} disabled={!hasNext}>
            Suivant <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      <JobDetailDrawer
        job={selectedJob}
        loadingDescription={loadingDrawer}
        onClose={() => setSelectedJob(null)}
        onScore={handleScore}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}
