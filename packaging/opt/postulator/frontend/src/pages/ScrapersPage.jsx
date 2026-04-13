import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Play, RefreshCw, RotateCcw, Radio,
  CheckCircle, XCircle, Loader, Shield,
  ChevronDown, ChevronUp, AlertCircle, Wifi, WifiOff,
  AlertTriangle, X, Info, Server, Clock, Hash,
  Search, BookOpen, Sparkles,
} from 'lucide-react'
import { useScraper }      from '../hooks/useScraper.js'
import { useAsync }        from '../hooks/useAsync.js'
import { fetchScrapeLogs, fetchScrapeLogDetail } from '../api/scrapers.js'
import { summarizeJobs, getSummarizeStatus } from '../api/analysis.js'
import ESCO_DICT from '../data/esco_dictionary.json'
import styles from './ScrapersPage.module.css'

// ── Constantes ────────────────────────────────────────────────────────────────

const ALL_SOURCES = [
  // International
  { id: 'indeed',       label: 'Indeed',       group: 'international' },
  { id: 'linkedin',     label: 'LinkedIn',     group: 'international' },
  { id: 'glassdoor',   label: 'Glassdoor',    group: 'international' },
  { id: 'ziprecruiter', label: 'ZipRecruiter', group: 'international' },
  { id: 'adzuna',      label: 'Adzuna',       group: 'international', apiRequired: true },
  { id: 'jobteaser',   label: 'RemoteOK',     group: 'international' },
  // Suisse
  { id: 'jobup',       label: 'Jobup.ch',     group: 'swiss' },
  { id: 'jobsch',      label: 'Jobs.ch',      group: 'swiss' },
]

const JOB_TYPES = [
  { id: 'fulltime',   label: 'CDI / Fulltime' },
  { id: 'contract',   label: 'Freelance / Contract' },
  { id: 'parttime',   label: 'Temps partiel' },
  { id: 'internship', label: 'Stage' },
]

const COUNTRIES = [
  { value: 'France',               label: '🇫🇷 France',               favorite: true },
  { value: 'Switzerland',          label: '🇨🇭 Suisse',               favorite: true },
  { value: 'Germany',              label: '🇩🇪 Allemagne' },
  { value: 'Belgium',              label: '🇧🇪 Belgique' },
  { value: 'Spain',                label: '🇪🇸 Espagne' },
  { value: 'Netherlands',          label: '🇳🇱 Pays-Bas' },
  { value: 'Italy',                label: '🇮🇹 Italie' },
  { value: 'Portugal',             label: '🇵🇹 Portugal' },
  { value: 'Sweden',               label: '🇸🇪 Suède' },
  { value: 'Denmark',              label: '🇩🇰 Danemark' },
  { value: 'Norway',               label: '🇳🇴 Norvège' },
  { value: 'Finland',              label: '🇫🇮 Finlande' },
  { value: 'Austria',              label: '🇦🇹 Autriche' },
  { value: 'Poland',               label: '🇵🇱 Pologne' },
  { value: 'Czech Republic',       label: '🇨🇿 République Tchèque' },
  { value: 'Ireland',              label: '🇮🇪 Irlande' },
  { value: 'United Kingdom',       label: '🇬🇧 Royaume-Uni' },
  { value: 'Luxembourg',           label: '🇱🇺 Luxembourg' },
  { value: 'United States',        label: '🇺🇸 États-Unis' },
  { value: 'Canada',               label: '🇨🇦 Canada' },
  { value: 'Australia',            label: '🇦🇺 Australie' },
  { value: 'Singapore',            label: '🇸🇬 Singapour' },
  { value: 'Japan',                label: '🇯🇵 Japon' },
  { value: 'United Arab Emirates', label: '🇦🇪 Émirats arabes unis' },
]

const CITY_SUGGESTIONS = {
  'France':        ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse', 'Nantes', 'Lille', 'Strasbourg', 'Montpellier', 'Nice'],
  'Switzerland':   ['Zürich', 'Genève', 'Basel', 'Bern', 'Lausanne', 'Zug', 'Lugano', 'St. Gallen', 'Winterthur', 'Lucerne'],
  'Germany':       ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Köln', 'Stuttgart', 'Düsseldorf', 'Leipzig'],
  'Belgium':       ['Bruxelles', 'Anvers', 'Gand', 'Liège'],
  'United Kingdom':['London', 'Manchester', 'Birmingham', 'Edinburgh', 'Bristol'],
  'Netherlands':   ['Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven'],
  'Spain':         ['Madrid', 'Barcelona', 'Valencia', 'Séville', 'Bilbao'],
  'Italy':         ['Milan', 'Rome', 'Turin', 'Florence', 'Bologne'],
  'Luxembourg':    ['Luxembourg'],
  'Austria':       ['Vienne', 'Graz', 'Salzbourg', 'Linz'],
  'Canada':        ['Toronto', 'Montréal', 'Vancouver', 'Calgary', 'Ottawa'],
  'United States': ['New York', 'San Francisco', 'Los Angeles', 'Chicago', 'Boston', 'Seattle', 'Austin'],
  'Australia':     ['Sydney', 'Melbourne', 'Brisbane', 'Perth'],
  'Singapore':     ['Singapore'],
}

const STATUS_META = {
  idle:    { color: 'var(--outline)',  label: 'Prêt' },
  queued:  { color: 'var(--primary)', label: 'En attente…' },
  running: { color: 'var(--primary)', label: 'Scraping en cours…' },
  success: { color: 'var(--tertiary)',label: 'Terminé avec succès' },
  error:   { color: 'var(--error)',   label: 'Erreur' },
}

const DEFAULT_PROXIES = ``

// ── Helpers ───────────────────────────────────────────────────────────────────

function countValidProxies(text) {
  return text.split('\n').filter(line => {
    const parts = line.trim().split(':')
    return parts.length === 4 && parts.every(p => p.trim().length > 0)
  }).length
}

function parseProxyLines(text) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && l.split(':').length === 4)
}

function buildLocation(country, city) {
  const c = city.trim()
  const p = country.trim()
  if (!p) return null
  if (c) return `${c}, ${p}`
  return p
}

// ── Hook recherche ESCO (dictionnaire local embarqué — offline, instantané) ──
function useESCOSearch(query) {
  const results = useMemo(() => {
    if (!query || query.length < 2) return []
    const q = query.toLowerCase().trim()
    const matched = []

    // Chercher dans les métiers
    for (const label of ESCO_DICT.occupations) {
      if (label.toLowerCase().includes(q)) {
        matched.push({ label, type: 'occupation', uri: '' })
        if (matched.length >= 8) break
      }
    }

    // Chercher dans les compétences
    const skillMatches = []
    for (const label of ESCO_DICT.skills) {
      if (label.toLowerCase().includes(q)) {
        skillMatches.push({ label, type: 'skill', uri: '' })
        if (skillMatches.length >= 6) break
      }
    }

    return [...matched, ...skillMatches]
  }, [query])

  return { results, loading: false, error: null }
}

// ── Champ ESCO ────────────────────────────────────────────────────────────────
function ESCOField({ value, onChange, onSelect }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value || '')
  const { results, loading, error } = useESCOSearch(query)
  const ref = useRef(null)

  // Fermer au clic extérieur
  useEffect(() => {
    const handle = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  useEffect(() => { if (results.length > 0) setOpen(true) }, [results])

  const handleChange = (e) => {
    setQuery(e.target.value)
    onChange(e.target.value)
    if (!e.target.value) setOpen(false)
  }

  const handlePick = (item) => {
    setQuery(item.label)
    onChange(item.label)
    onSelect(item)
    setOpen(false)
  }

  return (
    <div className={styles.escoWrap} ref={ref}>
      <div className={styles.escoInputWrap}>
        <BookOpen size={13} strokeWidth={2} className={styles.escoIcon} />
        <input
          className={styles.escoInput}
          type="text"
          placeholder="Tapez au moins 2 caractères… (ex: supply chain, python, manager)"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <Loader size={12} className={styles.spin} strokeWidth={2} style={{ color: 'var(--tertiary)', flexShrink: 0, marginRight: 10 }} />}
      </div>
      {open && results.length > 0 && (
        <div className={styles.escoDropdown}>
          {results.map((item, i) => (
            <button key={i} className={styles.escoItem} onMouseDown={() => handlePick(item)}>
              <span className={`${styles.escoTag} ${item.type === 'occupation' ? styles.escoTagOcc : styles.escoTagSkill}`}>
                {item.type === 'occupation' ? 'Métier' : 'Compétence'}
              </span>
              <span className={styles.escoItemLabel}>{item.label}</span>
            </button>
          ))}
          <div className={styles.escoFooter}>
            <span>ESCO — European Skills, Competences, Qualifications and Occupations</span>
          </div>
        </div>
      )}
      {error && (
        <p style={{ fontSize: 10, color: 'var(--error)', marginTop: 4 }}>
          ⚠️ Service ESCO indisponible — utilisez le mode Libre.
        </p>
      )}
    </div>
  )
}

// ── Modale avertissement IP ───────────────────────────────────────────────────

function NoProxyWarningModal({ onConfirm, onCancel }) {
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <AlertTriangle size={22} strokeWidth={2} style={{ color: '#f9c74f', flexShrink: 0 }} />
          <h2 className={styles.modalTitle}>Scraping sans proxy — Attention</h2>
          <button className={styles.modalClose} onClick={onCancel}><X size={16} strokeWidth={2} /></button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.modalText}>
            Vous êtes sur le point de lancer un scraping <strong>sans proxy</strong>.
          </p>
          <div className={styles.modalWarningBox}>
            <AlertTriangle size={14} strokeWidth={2} style={{ color: '#f9c74f', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className={styles.modalWarningTitle}>Risques associés</p>
              <ul className={styles.modalWarningList}>
                <li>Votre <strong>adresse IP réelle</strong> sera visible par les plateformes scrapées.</li>
                <li>En cas de détection, votre IP peut être <strong>temporairement ou définitivement bannie</strong> d'Indeed, LinkedIn et autres sources.</li>
                <li>Des CAPTCHAs peuvent bloquer la session en cours.</li>
              </ul>
            </div>
          </div>
          <p className={styles.modalAdvice}>
            <Shield size={12} strokeWidth={2} style={{ color: 'var(--tertiary)', flexShrink: 0 }} />
            Il est recommandé d'utiliser le <strong>scraping avec proxy</strong> pour protéger votre IP.
          </p>
        </div>
        <div className={styles.modalFooter}>
          <button className="btn-ghost" onClick={onCancel}>Annuler — utiliser des proxies</button>
          <button className={styles.modalConfirmBtn} onClick={onConfirm}>
            <AlertTriangle size={13} strokeWidth={2} />
            Je comprends, lancer sans proxy
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Drawer détail log ─────────────────────────────────────────────────────────

function LogDetailDrawer({ log, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!log) return
    setLoading(true)
    fetchScrapeLogDetail(log.id)
      .then(d => setDetail(d))
      .catch(() => setDetail(log))  // fallback sur la donnée partielle
      .finally(() => setLoading(false))
  }, [log?.id])

  if (!log) return null

  const proxiesTried = (() => {
    try { return detail?.proxies_tried ? JSON.parse(detail.proxies_tried) : [] }
    catch { return [] }
  })()

  const statusColor = {
    success: 'var(--tertiary)', error: 'var(--error)', running: 'var(--primary)'
  }[log.status] ?? 'var(--outline)'

  const fmt = (dt) => dt ? new Date(dt).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '—'

  return (
    <div className={styles.drawerOverlay} onClick={onClose}>
      <div className={styles.drawerPanel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitle}>
            <span className={styles.drawerDot} style={{ background: statusColor }} />
            <span style={{ fontFamily: 'var(--font-headline)', fontSize: 15, fontWeight: 800, color: 'var(--on-surface)', textTransform: 'capitalize' }}>
              {log.source}
            </span>
            <span style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>
              {log.status}
            </span>
          </div>
          <button className={styles.drawerClose} onClick={onClose}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Loader size={20} className={styles.spin} strokeWidth={1.5} style={{ color: 'var(--primary)' }} />
          </div>
        ) : (
          <div className={styles.drawerBody}>

            {/* Métriques */}
            <div className={styles.drawerGrid}>
              <div className={styles.drawerStat}>
                <span className={styles.drawerStatLabel}><Hash size={10} strokeWidth={2} /> ID</span>
                <span className={styles.drawerStatValue}>{log.id}</span>
              </div>
              <div className={styles.drawerStat}>
                <span className={styles.drawerStatLabel}><Search size={10} strokeWidth={2} /> Trouvées</span>
                <span className={styles.drawerStatValue}>{log.jobs_found ?? 0}</span>
              </div>
              <div className={styles.drawerStat}>
                <span className={styles.drawerStatLabel}>Nouvelles</span>
                <span className={styles.drawerStatValue} style={{ color: 'var(--tertiary)' }}>+{log.jobs_new ?? 0}</span>
              </div>
              <div className={styles.drawerStat}>
                <span className={styles.drawerStatLabel}>Doublons</span>
                <span className={styles.drawerStatValue}>{log.jobs_duplicate ?? 0}</span>
              </div>
              <div className={styles.drawerStat}>
                <span className={styles.drawerStatLabel}><Clock size={10} strokeWidth={2} /> Durée</span>
                <span className={styles.drawerStatValue}>
                  {log.duration_sec != null ? `${log.duration_sec.toFixed(1)}s` : '—'}
                </span>
              </div>
              <div className={styles.drawerStat}>
                <span className={styles.drawerStatLabel}>Démarré</span>
                <span className={styles.drawerStatValue} style={{ fontSize: 10 }}>{fmt(log.started_at)}</span>
              </div>
              <div className={styles.drawerStat}>
                <span className={styles.drawerStatLabel}>Terminé</span>
                <span className={styles.drawerStatValue} style={{ fontSize: 10 }}>{fmt(log.finished_at)}</span>
              </div>
            </div>

            {/* Proxy utilisé */}
            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}>
                <Shield size={12} strokeWidth={2} style={{ color: 'var(--tertiary)' }} /> Proxy utilisé
              </div>
              {log.proxy_used ? (
                <div className={styles.proxyChip}>
                  <Shield size={10} strokeWidth={2} style={{ color: 'var(--tertiary)', flexShrink: 0 }} />
                  <code>{log.proxy_used}</code>
                </div>
              ) : (
                <p className={styles.drawerNone}>Aucun proxy — IP réelle utilisée</p>
              )}
            </div>

            {/* Tous les proxies tentés */}
            {proxiesTried.length > 0 && (
              <div className={styles.drawerSection}>
                <div className={styles.drawerSectionTitle}>
                  <Server size={12} strokeWidth={2} style={{ color: 'var(--outline)' }} /> Proxies tentés ({proxiesTried.length})
                </div>
                <div className={styles.proxyList}>
                  {proxiesTried.map((p, i) => (
                    <div key={i} className={`${styles.proxyChip} ${i > 0 ? styles.proxyChipRetry : ''}`}>
                      <Shield size={10} strokeWidth={2} style={{ color: i > 0 ? '#f9c74f' : 'var(--tertiary)', flexShrink: 0 }} />
                      <code>{p}</code>
                      {i > 0 && <span className={styles.retryTag}>retry</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Erreur */}
            {log.error_message && (
              <div className={styles.drawerSection}>
                <div className={styles.drawerSectionTitle}>
                  <AlertCircle size={12} strokeWidth={2} style={{ color: 'var(--error)' }} /> Erreur
                </div>
                <pre className={styles.drawerError}>{log.error_message}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function StatusBadge({ status, proxyMode }) {
  const meta = STATUS_META[status] ?? STATUS_META.idle
  return (
    <span className={styles.statusBadge} style={{ color: meta.color }}>
      {(status === 'queued' || status === 'running') && <Loader size={11} className={styles.spin} strokeWidth={2} />}
      {status === 'success' && <CheckCircle size={11} strokeWidth={2} />}
      {status === 'error'   && <XCircle    size={11} strokeWidth={2} />}
      {meta.label}
      {proxyMode && status !== 'idle' && (
        <span className={styles.proxyIndicator}><Shield size={9} strokeWidth={2} /> Proxy</span>
      )}
    </span>
  )
}

function LogRow({ log, onClick }) {
  const duration = log.duration_sec != null ? `${log.duration_sec.toFixed(1)}s` : '—'
  const d = new Date(log.started_at)
  const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  const dotColors = { success: 'var(--tertiary)', error: 'var(--error)', running: 'var(--primary)' }

  return (
    <tr className={`${styles.logRow} ${styles.logRowClickable}`} onClick={() => onClick(log)} title="Cliquer pour voir le détail">
      <td className={styles.logCell}>
        <div className={styles.logSourceCell}>
          <span className={styles.logDot} style={{ background: dotColors[log.status] ?? 'var(--outline)' }} />
          <span className={styles.sourceLabel}>{log.source}</span>
          {log.proxy_used && (
            <span className={styles.proxyBadge} title={`Proxy utilisé : ${log.proxy_used}`}>
              <Shield size={9} strokeWidth={2} /> {log.proxy_used}
            </span>
          )}
        </div>
      </td>
      <td className={styles.logCell}>
        <span style={{ fontSize: 11, color: log.status === 'success' ? 'var(--tertiary)' : log.status === 'error' ? 'var(--error)' : 'var(--primary)' }}>
          {log.status}
        </span>
        {log.error_message && (
          <span title={log.error_message} style={{ marginLeft: 4, cursor: 'help' }}>
            <AlertCircle size={10} strokeWidth={2} style={{ color: 'var(--error)', verticalAlign: 'middle' }} />
          </span>
        )}
      </td>
      <td className={styles.logCell} style={{ textAlign: 'right' }}>
        <span className={styles.logNum}>{log.jobs_found ?? 0}</span>
      </td>
      <td className={styles.logCell} style={{ textAlign: 'right' }}>
        <span className={styles.logNew}>+{log.jobs_new ?? 0}</span>
      </td>
      <td className={styles.logCell} style={{ textAlign: 'right', color: 'var(--outline)', fontSize: 11 }}>
        {duration}
      </td>
      <td className={styles.logCell} style={{ textAlign: 'right', color: 'var(--outline)', fontSize: 11 }}>
        {dateStr} {timeStr}
      </td>
    </tr>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function ScrapersPage() {
  const [keywords,   setKeywords]   = useState('')
  const [country,    setCountry]    = useState('Switzerland')
  const [city,       setCity]       = useState('')
  const [sources,    setSources]    = useState(['indeed'])
  const [jobTypes,   setJobTypes]   = useState([])
  const [results,    setResults]    = useState(10)
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [daysOld,    setDaysOld]    = useState('5')

  // Mode de saisie des mots-clés : 'free' | 'esco'
  const [kwMode,     setKwMode]     = useState('free')
  const [escoItem,   setEscoItem]   = useState(null)  // item ESCO sélectionné

  // Proxy
  const [proxyOpen, setProxyOpen] = useState(true)
  const [proxyText, setProxyText] = useState(DEFAULT_PROXIES)
  const validProxyCount = countValidProxies(proxyText)

  // Toggle résumé IA post-scraping
  const [autoSummarize, setAutoSummarize] = useState(false)
  const [summarizing,   setSummarizing]   = useState(false)
  const [summarizeMsg,  setSummarizeMsg]  = useState(null)  // {done, total, errors}

  // Modale
  const [showNoProxyModal, setShowNoProxyModal] = useState(false)

  // Drawer détail log
  const [selectedLog, setSelectedLog] = useState(null)

  const { launch, launchWithProxies, status, result, launching, error, reset, proxyMode } = useScraper()
  const { data: logs, refetch: refetchLogs } = useAsync(() => fetchScrapeLogs({ limit: 30 }), [], { fallback: [] })

  useEffect(() => {
    if (status === 'success') {
      refetchLogs()
      // Déclencher le résumé IA si le toggle est actif
      if (autoSummarize) {
        setSummarizing(true)
        setSummarizeMsg(null)
        summarizeJobs(10)
          .then(() => {
            // Polling jusqu'à la fin
            const poll = setInterval(async () => {
              try {
                const st = await getSummarizeStatus()
                if (!st.running) {
                  clearInterval(poll)
                  setSummarizing(false)
                  setSummarizeMsg({ done: st.done, total: st.total, errors: st.errors })
                  setTimeout(() => setSummarizeMsg(null), 8000)
                }
              } catch { clearInterval(poll); setSummarizing(false) }
            }, 3000)
          })
          .catch(() => setSummarizing(false))
      }
    }
  }, [status])
  useEffect(() => { setCity('') }, [country])

  const toggleSource = id => setSources(p => p.includes(id) ? p.filter(s => s !== id) : [...p, id])
  const toggleType   = id => setJobTypes(p => p.includes(id) ? p.filter(t => t !== id) : [...p, id])

  const locationValue   = buildLocation(country, city)
  const citySuggestions = CITY_SUGGESTIONS[country] ?? []

  // Mots-clés effectifs : selon le mode
  const effectiveKeywords = kwMode === 'esco' && escoItem ? escoItem.label : keywords

  const basePayload = () => ({
    keywords:           effectiveKeywords.trim(),
    location:           locationValue,
    sources,
    job_types:          jobTypes,
    results_per_source: results,
    remote_only:        remoteOnly,
    hours_old:          daysOld ? parseInt(daysOld, 10) * 24 : null,
  })

  const isRunning      = status === 'queued' || status === 'running'
  const canLaunch      = effectiveKeywords.trim().length > 0 && sources.length > 0 && !isRunning
  const canLaunchProxy = canLaunch && validProxyCount > 0

  const handleLaunchNoProxy = () => { if (canLaunch) setShowNoProxyModal(true) }
  const handleConfirmNoProxy = async () => { setShowNoProxyModal(false); await launch(basePayload()) }
  const handleLaunchWithProxies = async () => {
    if (!canLaunchProxy) return
    await launchWithProxies({ ...basePayload(), proxies: parseProxyLines(proxyText) })
  }

  return (
    <div className={styles.page}>

      {/* Modales / Drawers */}
      {showNoProxyModal && (
        <NoProxyWarningModal onConfirm={handleConfirmNoProxy} onCancel={() => setShowNoProxyModal(false)} />
      )}
      {selectedLog && (
        <LogDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}

      {/* En-tête */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={`${styles.pageTitle} font-headline tracking-tight`}>Scrapers</h1>
          <p className={styles.pageSub}>
            Interrogez jusqu'à {ALL_SOURCES.length} sources · scraping en arrière-plan via Celery.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Radio size={14} strokeWidth={1.8} style={{ color: 'var(--outline)' }} />
          <span style={{ fontSize: 12, color: 'var(--outline)' }}>{ALL_SOURCES.length} sources</span>
        </div>
      </div>

      {/* ── Formulaire ── */}
      <div className={styles.formCard}>
        <p className={styles.formTitle}>Nouvelle recherche</p>

        {/* Mots-clés — toggle libre / ESCO */}
        <div className={styles.fieldFull} style={{ marginBottom: 14 }}>
          <div className={styles.kwHeader}>
            <label className={styles.label} style={{ marginBottom: 0 }}>Mots-clés *</label>
            <div className={styles.kwModeToggle}>
              <button
                className={`${styles.kwModeBtn} ${kwMode === 'free' ? styles.kwModeBtnActive : ''}`}
                onClick={() => setKwMode('free')}
                title="Saisie libre">
                <Search size={11} strokeWidth={2} /> Libre
              </button>
              <button
                className={`${styles.kwModeBtn} ${kwMode === 'esco' ? styles.kwModeBtnActive : ''}`}
                onClick={() => setKwMode('esco')}
                title="Recherche dans le dictionnaire ESCO">
                <BookOpen size={11} strokeWidth={2} /> ESCO
              </button>
            </div>
          </div>

          {kwMode === 'free' ? (
            <input className={styles.input} type="text"
              placeholder="Ex : développeur Python senior, supply chain manager…"
              value={keywords} onChange={e => setKeywords(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canLaunchProxy && handleLaunchWithProxies()} />
          ) : (
            <>
              <ESCOField
                value={escoItem?.label ?? ''}
                onChange={(v) => { if (!v) setEscoItem(null) }}
                onSelect={(item) => { setEscoItem(item) }}
              />
              {escoItem && (
                <div className={styles.escoSelected}>
                  <span className={`${styles.escoTag} ${escoItem.type === 'occupation' ? styles.escoTagOcc : styles.escoTagSkill}`}>
                    {escoItem.type === 'occupation' ? 'Métier' : 'Compétence'}
                  </span>
                  <span className={styles.escoSelectedLabel}>{escoItem.label}</span>
                  <button className={styles.escoRemove} onClick={() => setEscoItem(null)}>
                    <X size={11} strokeWidth={2} />
                  </button>
                </div>
              )}
              <p className={styles.escoHint}>
                <Info size={10} strokeWidth={2} /> Tapez au moins 2 caractères pour rechercher dans le dictionnaire européen des métiers et compétences ESCO.
              </p>
            </>
          )}
        </div>

        <div className={styles.formGrid}>
          {/* Localisation */}
          <div className={styles.locationBlock}>
            <label className={styles.label}>Localisation</label>
            <div className={styles.locationRow}>
              <div className={styles.countrySelectWrap}>
                <select className={styles.countrySelect} value={country} onChange={e => setCountry(e.target.value)}>
                  <option value="">🌍 Monde entier</option>
                  <optgroup label="⭐ Mes pays favoris">
                    {COUNTRIES.filter(c => c.favorite).map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Autres pays">
                    {COUNTRIES.filter(c => !c.favorite).map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <input
                className={styles.cityInput}
                type="text"
                placeholder={citySuggestions[0] ? `Ex : ${citySuggestions[0]}` : 'Ville (optionnel)'}
                value={city}
                onChange={e => setCity(e.target.value)}
                list="city-suggestions"
              />
              <datalist id="city-suggestions">
                {citySuggestions.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            {locationValue ? (
              <p className={styles.locationPreview}>
                → Envoyé au scraper : <strong>{locationValue}</strong>
                {sources.includes('indeed') && country && (
                  <span className={styles.locationNote}> · Indeed {country === 'Switzerland' ? 'ch' : country === 'France' ? 'fr' : '…'}.indeed.com</span>
                )}
              </p>
            ) : (
              <p className={styles.locationPreviewEmpty}>
                → Sans pays sélectionné : résultats mondiaux (souvent US en pratique)
              </p>
            )}
          </div>

          {/* Résultats par source */}
          <div>
            <label className={styles.label}>
              Résultats par source&nbsp;<span className={styles.labelHint}>({results})</span>
            </label>
            <input className={styles.range} type="range" min={5} max={200} step={5}
              value={results} onChange={e => setResults(Number(e.target.value))} />
            <div className={styles.rangeLabels}><span>5</span><span>200</span></div>
          </div>

          {/* Jours */}
          <div>
            <label className={styles.label}>Offres publiées depuis (jours)</label>
            <input
              className={styles.input}
              type="number"
              placeholder="Ex : 5 (vide = toutes)"
              min={1}
              max={30}
              value={daysOld}
              onChange={e => setDaysOld(e.target.value)}
            />
          </div>
        </div>

        {/* Sources */}
        <div className={styles.fieldGroup}>
          <div className={styles.sourcesHeader}>
            <label className={styles.label} style={{ marginBottom: 0 }}>Sources *</label>
            <div className={styles.sourcePresets}>
              <button type="button" className={styles.presetBtn}
                onClick={() => setSources(['indeed'])}
                title="Indeed uniquement">
                Indeed seul
              </button>
              <button type="button" className={styles.presetBtn}
                onClick={() => setSources(['jobup', 'jobsch', 'jobteaser', 'indeed'])}
                title="Toutes les sources suisses + Indeed CH">
                🇨🇭 Tout Suisse
              </button>
              <button type="button" className={styles.presetBtn}
                onClick={() => setSources(ALL_SOURCES.map(s => s.id))}
                title="Toutes les sources">
                Tout
              </button>
            </div>
          </div>

          {/* Groupe International */}
          <div className={styles.sourceGroup}>
            <span className={styles.sourceGroupLabel}>🌍 International</span>
            <div className={styles.chips}>
              {ALL_SOURCES.filter(s => s.group === 'international').map(s => (
                <button key={s.id} type="button"
                  className={`${styles.chip} ${sources.includes(s.id) ? styles.chipActive : ''}`}
                  onClick={() => toggleSource(s.id)}
                  title={s.id === 'adzuna' ? 'API officielle — clés ADZUNA_APP_ID/KEY requises dans .env' : s.label}>
                  {s.label}
                  {s.apiRequired && <span className={styles.chipApiTag}>API</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Groupe Suisse */}
          <div className={styles.sourceGroup}>
            <span className={styles.sourceGroupLabel}>🇨🇭 Suisse uniquement</span>
            <div className={styles.chips}>
              {ALL_SOURCES.filter(s => s.group === 'swiss').map(s => (
                <button key={s.id} type="button"
                  className={`${styles.chip} ${sources.includes(s.id) ? styles.chipActive : styles.chipSwiss}`}
                  onClick={() => toggleSource(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {sources.includes('adzuna') && (
            <div className={styles.adzunaHint}>
              <p>
                <strong>Adzuna</strong> utilise une API officielle (pas de scraping). Pays supportés nativement :
                🇬🇧 UK · 🇺🇸 US · 🇩🇪 DE · 🇫🇷 FR · 🇦🇺 AU · 🇨🇦 CA · 🇳🇱 NL · 🇦🇹 AT · 🇧🇪 BE · 🇮🇹 IT · 🇵🇱 PL · 🇸🇬 SG
              </p>
              <p className={styles.adzunaFallback}>
                ⚠️ <strong>Suisse non supportée nativement</strong> — fallback automatique sur <strong>Allemagne (DE)</strong> avec filtre Switzerland.
                Pour de meilleurs résultats suisses, utilisez <strong>Indeed + Jobup.ch + Jobs.ch</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Types */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Type de contrat</label>
          <div className={styles.chips}>
            {JOB_TYPES.map(t => (
              <button key={t.id} type="button"
                className={`${styles.chip} ${jobTypes.includes(t.id) ? styles.chipActive : ''}`}
                onClick={() => toggleType(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Remote + toggle résumé IA + bouton sans proxy */}
        <div className={styles.formFooter}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className={styles.toggleLabel}>
              <div className={`${styles.toggle} ${remoteOnly ? styles.toggleOn : ''}`}
                onClick={() => setRemoteOnly(p => !p)} role="switch" aria-checked={remoteOnly}>
                <span className={styles.toggleThumb} />
              </div>
              Remote uniquement
            </label>
            <label className={styles.toggleLabel} title="Après chaque scraping, Ollama génère un résumé de 10 lignes pour les 10 premières offres récupérées">
              <div className={`${styles.toggle} ${autoSummarize ? styles.toggleAI : ''}`}
                onClick={() => setAutoSummarize(p => !p)} role="switch" aria-checked={autoSummarize}>
                <span className={styles.toggleThumb} />
              </div>
              <Sparkles size={11} strokeWidth={2} style={{ color: autoSummarize ? 'var(--tertiary)' : 'var(--outline)', flexShrink: 0 }} />
              <span style={{ color: autoSummarize ? 'var(--tertiary)' : undefined }}>Résumé IA</span>
            </label>
          </div>
          <div className={styles.actionBtns}>
            {status !== 'idle' && (
              <button className="btn-ghost" onClick={reset} disabled={isRunning}>
                <RotateCcw size={13} strokeWidth={2} /> Réinitialiser
              </button>
            )}
            <button
              className={`btn-ghost ${styles.btnNoProxy} ${!canLaunch ? styles.btnDisabled : ''}`}
              onClick={handleLaunchNoProxy}
              disabled={!canLaunch}
              title="Scraping sans proxy — votre IP sera visible"
            >
              {isRunning && !proxyMode
                ? <Loader size={13} className={styles.spin} strokeWidth={2.5} />
                : <AlertTriangle size={13} strokeWidth={2} style={{ color: '#f9c74f' }} />
              }
              Sans proxy
            </button>
          </div>
        </div>

        {/* ── Zone proxy ── */}
        <div className={styles.proxySeparator} />
        <div className={styles.proxySection}>
          <button
            className={`${styles.proxyToggleBtn} ${proxyOpen ? styles.proxyToggleBtnOpen : ''}`}
            onClick={() => setProxyOpen(o => !o)}
          >
            <div className={styles.proxyToggleLeft}>
              <Shield size={14} strokeWidth={2} className={styles.proxyShieldIcon} />
              <div>
                <span className={styles.proxyToggleLabel}>
                  Lancer le scraping avec Proxy
                  <span className={styles.proxyRecommended}>Recommandé</span>
                </span>
                <span className={styles.proxyToggleSub}>
                  Rotation automatique de proxies résidentiels · Votre IP reste cachée · Anti-blocage renforcé
                </span>
              </div>
            </div>
            <div className={styles.proxyToggleRight}>
              {validProxyCount > 0 && (
                <span className={styles.proxyCountBadge}>
                  <Wifi size={10} strokeWidth={2} /> {validProxyCount} proxy{validProxyCount > 1 ? 's' : ''}
                </span>
              )}
              {proxyOpen
                ? <ChevronUp  size={14} strokeWidth={2} style={{ color: 'var(--outline)' }} />
                : <ChevronDown size={14} strokeWidth={2} style={{ color: 'var(--outline)' }} />
              }
            </div>
          </button>

          {proxyOpen && (
            <div className={styles.proxyPanel}>
              <div className={styles.proxyHeader}>
                <div>
                  <p className={styles.proxyPanelTitle}>Proxies résidentiels</p>
                  <p className={styles.proxyPanelSub}>
                    Format requis : <code>IP:PORT:USERNAME:PASSWORD</code> — un proxy par ligne.
                  </p>
                </div>
                <div className={styles.proxyStats}>
                  {validProxyCount > 0
                    ? <span className={styles.proxyValid}><Wifi size={11} strokeWidth={2} />{validProxyCount} valide{validProxyCount > 1 ? 's' : ''}</span>
                    : <span className={styles.proxyInvalid}><WifiOff size={11} strokeWidth={2} /> Aucun proxy valide</span>
                  }
                </div>
              </div>
              <textarea
                className={styles.proxyTextarea}
                value={proxyText}
                onChange={e => setProxyText(e.target.value)}
                placeholder={`31.59.20.176:6754:username:password\n...`}
                rows={8}
                spellCheck={false}
              />
              <button
                className={`${styles.proxyLaunchBtn} ${!canLaunchProxy ? styles.btnDisabled : ''}`}
                onClick={handleLaunchWithProxies}
                disabled={!canLaunchProxy}
              >
                {isRunning && proxyMode
                  ? <><Loader size={14} className={styles.spin} strokeWidth={2} /> Scraping avec proxy…</>
                  : <><Shield size={14} strokeWidth={2} /> Lancer le scraping avec {validProxyCount} proxy{validProxyCount > 1 ? 's' : ''}</>
                }
              </button>
              {!effectiveKeywords.trim() && (
                <p className={styles.proxyWarning}>⚠️ Renseignez les mots-clés avant de lancer.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Progression ── */}
      {status !== 'idle' && (
        <div className={styles.progressCard}>
          <div className={styles.progressHeader}>
            <StatusBadge status={status} proxyMode={proxyMode} />
            {result && status === 'success' && (
              <span className={styles.resultSummary}>{result.message ?? `Terminé — task ${result.task_id?.slice(0, 8)}`}</span>
            )}
            {error && <span style={{ fontSize: 12, color: 'var(--error)' }}>{error.detail ?? error.message}</span>}
          </div>
          {isRunning && (
            <div className={styles.neuralTrack}>
              <div className="neural-trace" style={{ height: 3, borderRadius: 2 }} />
            </div>
          )}
          {status === 'success' && result?.sources && (
            <div className={styles.resultGrid}>
              {result.sources.map(s => (
                <div key={s.source} className={styles.resultItem}>
                  <span className={styles.resultSource}>{s.source}</span>
                  {s.proxy && <span className={styles.resultProxy} title={s.proxy}><Shield size={9} strokeWidth={2} /></span>}
                  <span className={styles.resultNew}>+{s.new ?? 0}</span>
                  <span className={styles.resultFound}>{s.found ?? 0} trouvés</span>
                  {s.error && <span className={styles.resultError} title={s.error}>⚠</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Indicateur résumé IA ── */}
      {(summarizing || summarizeMsg) && (
        <div className={styles.summarizeBar}>
          {summarizing
            ? <Loader size={11} className={styles.spin} strokeWidth={2} style={{ color: 'var(--tertiary)', flexShrink: 0 }} />
            : <Sparkles size={11} strokeWidth={2} style={{ color: 'var(--tertiary)', flexShrink: 0 }} />
          }
          <span style={{ fontSize: 11, color: 'var(--tertiary)' }}>
            {summarizing
              ? `Ollama génère les résumés IA… (max 10 offres)`
              : `✓ Résumés IA : ${summarizeMsg.done}/${summarizeMsg.total} offre${summarizeMsg.done !== 1 ? 's' : ''}${summarizeMsg.errors > 0 ? ` — ${summarizeMsg.errors} échec${summarizeMsg.errors > 1 ? 's' : ''}` : ''} — visible dans le bouton ⋮ de chaque offre`
            }
          </span>
          {!summarizing && <span style={{ fontSize: 10, color: 'var(--outline)', marginLeft: 4 }}>Seulement 10 offres analysées</span>}
        </div>
      )}

      {/* ── Audit Trail ── */}
      <div className={styles.logsSection}>
        <div className={styles.logsHeader}>
          <div>
            <h2 className={`${styles.logsTitle} font-headline tracking-tight`}>Audit Trail</h2>
            <p className={styles.logsSub}>Cliquez sur une ligne pour voir les détails (proxy IP, erreur…)</p>
          </div>
          <button className="btn-ghost" onClick={refetchLogs} style={{ padding: '4px 10px' }}>
            <RefreshCw size={12} strokeWidth={2} />
          </button>
        </div>
        {!logs?.length ? (
          <div className={styles.emptyLogs}>Aucun log. Lancez un scraping pour commencer.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Source · Proxy</th>
                  <th className={styles.th}>Statut</th>
                  <th className={styles.th} style={{ textAlign: 'right' }}>Trouvées</th>
                  <th className={styles.th} style={{ textAlign: 'right' }}>Nouvelles</th>
                  <th className={styles.th} style={{ textAlign: 'right' }}>Durée</th>
                  <th className={styles.th} style={{ textAlign: 'right' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <LogRow key={log.id} log={log} onClick={setSelectedLog} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
