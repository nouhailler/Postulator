import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, RefreshCw, Download, ExternalLink,
  ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown,
  Brain, Trash2, AlertTriangle, Globe, Sparkles, Loader, X, CheckCheck, Clock, Hourglass,
} from 'lucide-react'
import { useAsync }    from '../hooks/useAsync.js'
import { fetchJobs, fetchJob, updateJobStatus, deleteJob, purgeJobs, purgeJobsByCriteria } from '../api/jobs.js'
import { importCVFromStore } from '../api/cvs.js'
import { fetchCVList }       from '../api/cvStore.js'
import { scoreBatch, getScoreBatchStatus } from '../api/analysis.js'
import { mockJobs }    from '../data/mockData.js'
import JobDetailDrawer from '../components/jobs/JobDetailDrawer.jsx'
import styles          from './JobsPage.module.css'

// ── Constantes ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25
const SOURCES   = ['', 'indeed', 'linkedin', 'glassdoor', 'ziprecruiter', 'jobup', 'jobsch', 'jobteaser', 'adzuna']
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

// ── Modal Score en masse ─────────────────────────────────────────────────────

function ScoreBatchModal({ cvs, onConfirm, onCancel, loading, elapsed, provider }) {
  const [selCvId, setSelCvId] = useState(cvs?.[0]?.id ?? '')
  const [limit,   setLimit]   = useState(20)

  const providerLabel = provider === 'openrouter' ? 'OpenRouter' : 'Ollama'

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalIcon}>
          <Brain size={24} strokeWidth={2} style={{ color: 'var(--tertiary)' }} />
        </div>
        <h3 className={styles.modalTitle}>Score en masse</h3>
        <p className={styles.modalText}>
          Scorer plusieurs offres contre votre CV en une seule fois.
          Les scores seront visibles dans la colonne <strong>Score IA</strong>
          et dans les <strong>Alertes &amp; Activité</strong>.
        </p>
        <div className={styles.modalField}>
          <label className={styles.modalLabel} style={{ flexDirection: 'column', gap: 10 }}>
            <select
              value={selCvId}
              onChange={e => setSelCvId(e.target.value)}
              style={{ width: '100%', background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: 'var(--radius-md)', padding: '7px 10px', color: 'var(--on-surface)', fontSize: 13 }}>
              {(cvs ?? []).length === 0
                ? <option value="">— Aucun CV importé —</option>
                : (cvs ?? []).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.full_name ? `${c.full_name} — ${c.name}` : c.name}
                    </option>
                  ))
              }
            </select>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              Scorer les
              <input
                type="number" min={1} max={50}
                value={limit}
                onChange={e => setLimit(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                className={styles.modalInput}
              />
              premières offres (max 50)
            </span>
          </label>
        </div>
        <div className={styles.modalActions}>
          <button className="btn-ghost" onClick={onCancel} disabled={loading}>Annuler</button>
          <button
            className={styles.modalConfirmAI}
            onClick={() => onConfirm(parseInt(selCvId), limit)}
            disabled={loading || !selCvId}>
            {loading
              ? <><Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} strokeWidth={2} /> En cours…</>
              : <><Brain size={13} strokeWidth={2} /> Lancer le scoring</>}
          </button>
        </div>
        {loading && (
          <div className={styles.scoringStatusBar}>
            <Clock size={13} strokeWidth={2} className={styles.scoringStatusIcon} />
            <span className={styles.scoringStatusText}>
              {elapsed}s — {providerLabel} analyse les offres…
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Modal Réinitialiser ───────────────────────────────────────────────────────

const SOURCES_FILTER = ['', 'indeed', 'linkedin', 'glassdoor', 'ziprecruiter', 'jobup', 'jobsch', 'jobteaser', 'adzuna']

function ResetModal({ onConfirm, onConfirmCriteria, onCancel, loading }) {
  const [tab,        setTab]        = useState('criteria') // 'criteria' | 'recent'
  const [keepRecent, setKeepRecent] = useState(20)

  // Critères
  const [maxScore,    setMaxScore]    = useState('')
  const [minScore,    setMinScore]    = useState('')
  const [beforeDate,  setBeforeDate]  = useState('')
  const [afterDate,   setAfterDate]   = useState('')
  const [srcFilter,   setSrcFilter]   = useState('')
  const [statusFilter,setStatusFilter]= useState('')
  const [noScore,     setNoScore]     = useState(false)
  const [preview,     setPreview]     = useState(null)
  const [previewing,  setPreviewing]  = useState(false)

  const resetCriteria = () => {
    setMaxScore(''); setMinScore(''); setBeforeDate(''); setAfterDate('')
    setSrcFilter(''); setStatusFilter(''); setNoScore(false); setPreview(null)
  }

  const hasAnyCriteria = maxScore !== '' || minScore !== '' || beforeDate !== '' ||
    afterDate !== '' || srcFilter !== '' || statusFilter !== '' || noScore

  const buildCriteria = () => ({
    maxScore:     maxScore    !== '' ? parseFloat(maxScore)    : null,
    minScore:     minScore    !== '' ? parseFloat(minScore)    : null,
    beforeDate:   beforeDate  !== '' ? beforeDate               : null,
    afterDate:    afterDate   !== '' ? afterDate                : null,
    source:       srcFilter   !== '' ? srcFilter                : null,
    status:       statusFilter!== '' ? statusFilter             : null,
    noScore:      noScore     || null,
    keepSelected: true,
  })

  const handlePreview = async () => {
    setPreviewing(true); setPreview(null)
    try {
      const r = await purgeJobsByCriteria({ ...buildCriteria(), dryRun: true })
      setPreview(r)
    } catch { setPreview(null) }
    finally { setPreviewing(false) }
  }

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.purgeModal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.purgeHeader}>
          <div className={styles.purgeHeaderLeft}>
            <div className={styles.purgeHeaderIcon}>
              <Trash2 size={18} strokeWidth={2} />
            </div>
            <div>
              <h3 className={styles.purgeTitle}>Suppression en masse</h3>
              <p className={styles.purgeSub}>Les offres avec un statut actif (À postuler, Postulé, Entretien) sont toujours protégées.</p>
            </div>
          </div>
          <button className={styles.purgeCloseBtn} onClick={onCancel}><X size={16} strokeWidth={2} /></button>
        </div>

        {/* Onglets */}
        <div className={styles.resetTabs}>
          <button className={`${styles.resetTab} ${tab === 'criteria' ? styles.resetTabActive : ''}`}
            onClick={() => setTab('criteria')}>
            🎯 Par critères
          </button>
          <button className={`${styles.resetTab} ${tab === 'recent' ? styles.resetTabActive : ''}`}
            onClick={() => setTab('recent')}>
            📦 Garder les N plus récentes
          </button>
        </div>

        {/* ── Onglet critères ── */}
        {tab === 'criteria' && (
          <div className={styles.purgeBody}>
            <div className={styles.criteriaGrid}>

              {/* Score */}
              <div className={styles.criteriaSection}>
                <p className={styles.criteriaSectionTitle}>Score IA</p>
                <div className={styles.criteriaRow}>
                  <div className={styles.criteriaField}>
                    <label className={styles.criteriaLabel}>Score inférieur à (%)</label>
                    <input className={styles.criteriaInput} type="number" min={0} max={100} step={5}
                      placeholder="Ex : 50"
                      value={maxScore} onChange={e => { setMaxScore(e.target.value); setPreview(null) }} />
                    <p className={styles.criteriaHint}>Supprime les offres scorées sous ce seuil</p>
                  </div>
                  <div className={styles.criteriaField}>
                    <label className={styles.criteriaLabel}>Score supérieur à (%)</label>
                    <input className={styles.criteriaInput} type="number" min={0} max={100} step={5}
                      placeholder="Ex : 90"
                      value={minScore} onChange={e => { setMinScore(e.target.value); setPreview(null) }} />
                    <p className={styles.criteriaHint}>Supprime les offres scorées au-dessus</p>
                  </div>
                </div>
                <label className={styles.criteriaCheckLabel}>
                  <input type="checkbox" checked={noScore}
                    onChange={e => { setNoScore(e.target.checked); setPreview(null) }} />
                  Supprimer les offres sans score IA
                </label>
              </div>

              {/* Date */}
              <div className={styles.criteriaSection}>
                <p className={styles.criteriaSectionTitle}>Date de scraping</p>
                <div className={styles.criteriaRow}>
                  <div className={styles.criteriaField}>
                    <label className={styles.criteriaLabel}>Scrapées avant le</label>
                    <input className={styles.criteriaInput} type="date"
                      value={beforeDate} onChange={e => { setBeforeDate(e.target.value); setPreview(null) }} />
                    <p className={styles.criteriaHint}>Supprime les offres plus anciennes</p>
                  </div>
                  <div className={styles.criteriaField}>
                    <label className={styles.criteriaLabel}>Scrapées après le</label>
                    <input className={styles.criteriaInput} type="date"
                      value={afterDate} onChange={e => { setAfterDate(e.target.value); setPreview(null) }} />
                    <p className={styles.criteriaHint}>Supprime les offres plus récentes</p>
                  </div>
                </div>
              </div>

              {/* Source & Statut */}
              <div className={styles.criteriaSection}>
                <p className={styles.criteriaSectionTitle}>Source &amp; Statut</p>
                <div className={styles.criteriaRow}>
                  <div className={styles.criteriaField}>
                    <label className={styles.criteriaLabel}>Source</label>
                    <select className={styles.criteriaInput}
                      value={srcFilter} onChange={e => { setSrcFilter(e.target.value); setPreview(null) }}>
                      <option value="">Toutes les sources</option>
                      {SOURCES_FILTER.filter(s => s).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className={styles.criteriaField}>
                    <label className={styles.criteriaLabel}>Statut</label>
                    <select className={styles.criteriaInput}
                      value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPreview(null) }}>
                      <option value="">Tous les statuts</option>
                      <option value="new">À voir (non traités)</option>
                      <option value="rejected">Rejetés</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Prévisualisation */}
            {preview && (
              <div className={`${styles.previewBox} ${preview.would_delete === 0 ? styles.previewBoxEmpty : styles.previewBoxWarn}`}>
                {preview.would_delete === 0
                  ? <><CheckCheck size={13} strokeWidth={2} /> Aucune offre ne correspond à ces critères.</>
                  : <><AlertTriangle size={13} strokeWidth={2} /> <strong>{preview.would_delete} offre{preview.would_delete !== 1 ? 's' : ''}</strong> sera{preview.would_delete !== 1 ? 'ont' : ''} supprimée{preview.would_delete !== 1 ? 's' : ''}. Cette action est irréversible.</>
                }
              </div>
            )}

            <div className={styles.purgeActions}>
              <button className="btn-ghost" onClick={onCancel} disabled={loading}>Annuler</button>
              <button className="btn-ghost" onClick={resetCriteria} disabled={loading || !hasAnyCriteria}>
                Réinitialiser
              </button>
              <button className={styles.previewBtn}
                onClick={handlePreview}
                disabled={!hasAnyCriteria || previewing || loading}>
                {previewing
                  ? <><Loader size={12} className={styles.spin} strokeWidth={2} /> Calcul…</>
                  : <><Search size={12} strokeWidth={2} /> Simuler</>}
              </button>
              <button className={styles.modalConfirm}
                onClick={() => onConfirmCriteria(buildCriteria())}
                disabled={!hasAnyCriteria || loading}>
                {loading
                  ? <><Loader size={12} className={styles.spin} strokeWidth={2} /> Suppression…</>
                  : <><Trash2 size={12} strokeWidth={2} /> Supprimer</>}
              </button>
            </div>
          </div>
        )}

        {/* ── Onglet récentes ── */}
        {tab === 'recent' && (
          <div className={styles.purgeBody}>
            <p className={styles.modalText}>
              Conserve uniquement les <em>N</em> offres les plus récentes et supprime toutes les autres.<br />
              Les offres avec un statut actif sont toujours protégées.
            </p>
            <div className={styles.recentRow}>
              <span className={styles.recentLabel}>Garder les</span>
              <input
                type="number" min={0} max={500}
                value={keepRecent}
                onChange={e => setKeepRecent(Math.max(0, parseInt(e.target.value) || 0))}
                className={styles.recentInput}
              />
              <span className={styles.recentLabel}>offres les plus récentes</span>
              <span className={styles.recentHint}>(0 = tout supprimer)</span>
            </div>
            <div className={styles.purgeActions}>
              <button className="btn-ghost" onClick={onCancel} disabled={loading}>Annuler</button>
              <button className={styles.modalConfirm} onClick={() => onConfirm(keepRecent)} disabled={loading}>
                {loading
                  ? <><Loader size={12} className={styles.spin} strokeWidth={2} /> Suppression…</>
                  : <><Trash2 size={12} strokeWidth={2} /> Confirmer</>}
              </button>
            </div>
          </div>
        )}
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
  const [location,   setLocation]   = useState('')
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

  // Score en masse
  const [showScoreBatch,  setShowScoreBatch]  = useState(false)
  const [scoreBatching,   setScoreBatching]   = useState(false)
  const [scoreBatchMsg,   setScoreBatchMsg]   = useState(null)  // message rapide post-lancement
  const [scoringElapsed,  setScoringElapsed]  = useState(0)
  const [aiProvider,      setAiProvider]      = useState('ollama')

  const { data: cvList } = useAsync(fetchCVList, [], { fallback: [] })

  // Détecter le provider IA (OpenRouter ou Ollama) au montage
  useEffect(() => {
    fetch('/api/settings/openrouter')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.configured || data?.api_key) setAiProvider('openrouter')
      })
      .catch(() => {})
  }, [])

  const buildParams = () => ({
    q:          q         || undefined,
    source:     source    || undefined,
    status:     status    || undefined,
    location:   location  || undefined,
    is_remote:  remoteOnly || undefined,
    min_score:  minScore  || undefined,
    sort_by:    sortBy,
    sort_order: sortOrder,
    limit:      PAGE_SIZE,
    offset:     page * PAGE_SIZE,
  })

  const { data: apiJobs, loading, error, refetch } = useAsync(
    () => fetchJobs(buildParams()),
    [q, source, status, location, remoteOnly, minScore, sortBy, sortOrder, page],
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
          if (location  && !(j.location ?? '').toLowerCase().includes(location.toLowerCase())) return false
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

  const handleResetByCriteria = async ({ maxScore, minScore, beforeDate, afterDate, source, status, noScore }) => {
    setResetting(true)
    try {
      const result = await purgeJobsByCriteria({
        maxScore, minScore, beforeDate, afterDate, source, status, noScore,
        keepSelected: true, dryRun: false,
      })
      setShowReset(false)
      setResetMsg(`✓ ${result.deleted} offre${result.deleted !== 1 ? 's' : ''} supprimée${result.deleted !== 1 ? 's' : ''} · ${result.remaining} conservée${result.remaining !== 1 ? 's' : ''}`)
      setTimeout(() => setResetMsg(null), 5000)
      setPage(0); refetch()
    } catch (err) {
      console.error(err)
      setResetMsg(`Erreur : ${err.message}`)
      setTimeout(() => setResetMsg(null), 5000)
    }
    finally { setResetting(false) }
  }

  const handleScoreBatchConfirm = async (storedCvId, limit) => {
    setScoreBatching(true)
    setScoringElapsed(0)
    // Compteur de secondes écoulées
    const startTime = Date.now()
    const elapsedTimer = setInterval(() => {
      setScoringElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    try {
      // Convertir le StoredCV en CV legacy (upsert par nom — instantané si déjà fait)
      const legacyCv = await importCVFromStore(storedCvId)
      const res = await scoreBatch(legacyCv.id, limit, 'new')
      setShowScoreBatch(false)
      setScoreBatchMsg(res.message ?? `Scoring lancé pour ${res.total} offre(s)`)
      // Polling pour rafraîchir la liste quand c'est fini
      const poll = setInterval(async () => {
        try {
          const st = await getScoreBatchStatus()
          if (!st.running) {
            clearInterval(poll)
            clearInterval(elapsedTimer)
            setScoreBatching(false)
            setScoreBatchMsg(`✓ Score terminé : ${st.done}/${st.total} offres — résultats dans les Alertes`)
            setTimeout(() => setScoreBatchMsg(null), 10000)
            refetch()  // rafraîchir le tableau
          }
        } catch { clearInterval(poll); clearInterval(elapsedTimer); setScoreBatching(false) }
      }, 4000)
    } catch (err) {
      console.error(err)
      clearInterval(elapsedTimer)
      setScoreBatching(false)
      setScoreBatchMsg(`Erreur : ${err.detail ?? err.message}`)
      setTimeout(() => setScoreBatchMsg(null), 5000)
    }
  }

  return (
    <div className={styles.page}>

      {showReset && (
        <ResetModal
          onConfirm={handleReset}
          onConfirmCriteria={handleResetByCriteria}
          onCancel={() => setShowReset(false)}
          loading={resetting}
        />
      )}
      {showScoreBatch && (
        <ScoreBatchModal
          cvs={cvList ?? []}
          onConfirm={handleScoreBatchConfirm}
          onCancel={() => setShowScoreBatch(false)}
          loading={scoreBatching}
          elapsed={scoringElapsed}
          provider={aiProvider}
        />
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
          <button className={styles.purgeMassBtn} onClick={() => setShowReset(true)}>
            <Trash2 size={13} strokeWidth={2} /> Suppression en masse
          </button>
        </div>
      </div>

      {resetMsg  && <div className={styles.resetBanner}>{resetMsg}</div>}

      {/* Bannière scoring en cours — visible même modal fermée */}
      {scoreBatching && (
        <div className={styles.scoringBanner}>
          <Hourglass size={14} strokeWidth={2} className={styles.scoringBannerIcon} />
          <span className={styles.scoringBannerText}>
            Scoring en cours avec{' '}
            <strong>{aiProvider === 'openrouter' ? 'OpenRouter' : 'Ollama'}</strong>
            {' '}— {scoringElapsed}s écoulées…
          </span>
          <span className={styles.scoringBannerTimer}>{scoringElapsed}s</span>
        </div>
      )}

      {scoreBatchMsg && !scoreBatching && (
        <div className={`${styles.resetBanner} ${scoreBatchMsg.startsWith('Erreur') ? styles.errorBanner : ''}`}>
          {scoreBatchMsg}
        </div>
      )}
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
        <div className={styles.locationWrap}>
          <input
            className={styles.locationInput}
            type="text"
            placeholder="📍 Lieu…"
            value={location}
            onChange={e => applyFilter(() => setLocation(e.target.value))}
            title="Filtrer par ville ou pays (ex: Zürich, Switzerland, Paris…)"
          />
          {location && (
            <button className={styles.locationClear} onClick={() => applyFilter(() => setLocation(''))} title="Effacer">
              ×
            </button>
          )}
        </div>
        <select className={styles.select} value={status} onChange={e => applyFilter(() => setStatus(e.target.value))}>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        {/* Bouton Score en masse — entre le select statut et le champ score min */}
        <button
          className={styles.scoreBatchBtn}
          onClick={() => setShowScoreBatch(true)}
          disabled={scoreBatching}
          title="Scorer plusieurs offres en masse avec votre CV">
          {scoreBatching
            ? <Loader size={12} className={styles.spin} strokeWidth={2} />
            : <Brain size={12} strokeWidth={2} />}
          Scorer avec mon CV
        </button>
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
            setQ(''); setSource(''); setStatus(''); setLocation(''); setRemoteOnly(false); setMinScore('')
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
                      {/* Bouton résumé IA — visible seulement si ai_summary disponible */}
                      {job.ai_summary && (
                        <button
                          className={`${styles.actionIcon} ${styles.actionSummary}`}
                          title={(() => {
                            // Si c'est du JSON de score, afficher un résumé lisible
                            try {
                              const d = JSON.parse(job.ai_summary)
                              if (d.score != null || d.strengths) {
                                const parts = []
                                if (d.score != null) parts.push(`Score : ${Math.round(d.score)}%`)
                                if (d.strengths?.length) parts.push(`✓ ${d.strengths[0]}`)
                                if (d.gaps?.length) parts.push(`⚠ ${d.gaps[0]}`)
                                if (d.recommendation) parts.push(d.recommendation)
                                return parts.join('\n')
                              }
                            } catch {}
                            // Sinon c'est du texte libre — afficher les 3 premières lignes
                            return job.ai_summary.split('\n').filter(l => l.trim()).slice(0, 3).join('\n')
                          })()}
                          onClick={e => { e.stopPropagation(); handleRowClick(job) }}>
                          <Sparkles size={12} strokeWidth={2} />
                        </button>
                      )}
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
