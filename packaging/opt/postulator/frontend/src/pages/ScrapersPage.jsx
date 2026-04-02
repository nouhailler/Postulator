import { useEffect, useState } from 'react'
import {
  Play, RefreshCw, RotateCcw, Radio,
  CheckCircle, XCircle, Loader, Shield,
  ChevronDown, ChevronUp, AlertCircle, Wifi, WifiOff,
} from 'lucide-react'
import { useScraper }      from '../hooks/useScraper.js'
import { useAsync }        from '../hooks/useAsync.js'
import { fetchScrapeLogs } from '../api/scrapers.js'
import styles from './ScrapersPage.module.css'

// ── Constantes ────────────────────────────────────────────────────────────────

const ALL_SOURCES = [
  { id: 'indeed',       label: 'Indeed' },
  { id: 'linkedin',     label: 'LinkedIn' },
  { id: 'glassdoor',    label: 'Glassdoor' },
  { id: 'ziprecruiter', label: 'ZipRecruiter' },
  { id: 'google',       label: 'Google Jobs' },
]

const JOB_TYPES = [
  { id: 'fulltime',   label: 'CDI / Fulltime' },
  { id: 'contract',   label: 'Freelance / Contract' },
  { id: 'parttime',   label: 'Temps partiel' },
  { id: 'internship', label: 'Stage' },
]

const STATUS_META = {
  idle:    { color: 'var(--outline)',  label: 'Prêt' },
  queued:  { color: 'var(--primary)', label: 'En attente…' },
  running: { color: 'var(--primary)', label: 'Scraping en cours…' },
  success: { color: 'var(--tertiary)',label: 'Terminé avec succès' },
  error:   { color: 'var(--error)',   label: 'Erreur' },
}

// Proxies de test pré-remplis (format IP:PORT:USER:PASS)
const DEFAULT_PROXIES = `31.59.20.176:6754:nbnzyhqa:xmqbrwxlh5ov
23.95.150.145:6114:nbnzyhqa:xmqbrwxlh5ov
198.23.239.134:6540:nbnzyhqa:xmqbrwxlh5ov
45.38.107.97:6014:nbnzyhqa:xmqbrwxlh5ov
107.172.163.27:6543:nbnzyhqa:xmqbrwxlh5ov
198.105.121.200:6462:nbnzyhqa:xmqbrwxlh5ov
216.10.27.159:6837:nbnzyhqa:xmqbrwxlh5ov
142.111.67.146:5611:nbnzyhqa:xmqbrwxlh5ov
191.96.254.138:6185:nbnzyhqa:xmqbrwxlh5ov
31.58.9.4:6077:nbnzyhqa:xmqbrwxlh5ov`

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse les lignes proxy et retourne le nombre de lignes valides */
function countValidProxies(text) {
  return text.split('\n').filter(line => {
    const parts = line.trim().split(':')
    return parts.length === 4 && parts.every(p => p.trim().length > 0)
  }).length
}

/** Retourne les lignes proxy valides sous forme de tableau */
function parseProxyLines(text) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && l.split(':').length === 4)
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function StatusBadge({ status, proxyMode }) {
  const meta = STATUS_META[status] ?? STATUS_META.idle
  return (
    <span className={styles.statusBadge} style={{ color: meta.color }}>
      {(status === 'queued' || status === 'running') && (
        <Loader size={11} className={styles.spin} strokeWidth={2} />
      )}
      {status === 'success' && <CheckCircle size={11} strokeWidth={2} />}
      {status === 'error'   && <XCircle    size={11} strokeWidth={2} />}
      {meta.label}
      {proxyMode && status !== 'idle' && (
        <span className={styles.proxyIndicator}>
          <Shield size={9} strokeWidth={2} /> Proxy
        </span>
      )}
    </span>
  )
}

function LogRow({ log }) {
  const duration = log.duration_sec != null ? `${log.duration_sec.toFixed(1)}s` : '—'
  const d = new Date(log.started_at)
  const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  const dotColors = { success: 'var(--tertiary)', error: 'var(--error)', running: 'var(--primary)' }

  return (
    <tr className={styles.logRow}>
      <td className={styles.logCell}>
        <div className={styles.logSourceCell}>
          <span className={styles.logDot} style={{ background: dotColors[log.status] ?? 'var(--outline)' }} />
          <span className={styles.sourceLabel}>{log.source}</span>
          {log.proxy_used && (
            <span className={styles.proxyBadge} title={`Via proxy : ${log.proxy_used}`}>
              <Shield size={9} strokeWidth={2} /> proxy
            </span>
          )}
        </div>
      </td>
      <td className={styles.logCell}>
        <span style={{ fontSize: 11, color: log.status === 'success' ? 'var(--tertiary)' : log.status === 'error' ? 'var(--error)' : 'var(--primary)' }}>
          {log.status}
        </span>
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
  const [location,   setLocation]   = useState('')
  const [sources,    setSources]    = useState(['indeed', 'linkedin', 'glassdoor'])
  const [jobTypes,   setJobTypes]   = useState([])
  const [results,    setResults]    = useState(50)
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [hoursOld,   setHoursOld]   = useState('')

  // Proxy section
  const [proxyOpen,    setProxyOpen]    = useState(false)
  const [proxyText,    setProxyText]    = useState(DEFAULT_PROXIES)

  const validProxyCount = countValidProxies(proxyText)

  const { launch, launchWithProxies, status, result, launching, error, reset, proxyMode } = useScraper()
  const { data: logs, refetch: refetchLogs } = useAsync(() => fetchScrapeLogs({ limit: 30 }), [], { fallback: [] })

  useEffect(() => { if (status === 'success') refetchLogs() }, [status, refetchLogs])

  const toggleSource = id => setSources(p => p.includes(id) ? p.filter(s => s !== id) : [...p, id])
  const toggleType   = id => setJobTypes(p => p.includes(id) ? p.filter(t => t !== id) : [...p, id])

  const basePayload = () => ({
    keywords:           keywords.trim(),
    location:           location.trim() || null,
    sources,
    job_types:          jobTypes,
    results_per_source: results,
    remote_only:        remoteOnly,
    hours_old:          hoursOld ? parseInt(hoursOld, 10) : null,
  })

  const handleLaunch = async () => {
    if (!keywords.trim() || sources.length === 0) return
    await launch(basePayload())
  }

  const handleLaunchWithProxies = async () => {
    if (!keywords.trim() || sources.length === 0 || validProxyCount === 0) return
    await launchWithProxies({
      ...basePayload(),
      proxies: parseProxyLines(proxyText),
    })
  }

  const isRunning = status === 'queued' || status === 'running'
  const canLaunch = keywords.trim().length > 0 && sources.length > 0 && !isRunning
  const canLaunchProxy = canLaunch && validProxyCount > 0

  return (
    <div className={styles.page}>

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

        <div className={styles.formGrid}>
          <div className={styles.fieldFull}>
            <label className={styles.label}>Mots-clés *</label>
            <input className={styles.input} type="text"
              placeholder="Ex : senior react developer typescript"
              value={keywords} onChange={e => setKeywords(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canLaunch && handleLaunch()} />
          </div>
          <div>
            <label className={styles.label}>Localisation</label>
            <input className={styles.input} type="text" placeholder="Ex : Paris, France"
              value={location} onChange={e => setLocation(e.target.value)} />
          </div>
          <div>
            <label className={styles.label}>
              Résultats par source&nbsp;<span className={styles.labelHint}>({results})</span>
            </label>
            <input className={styles.range} type="range" min={5} max={200} step={5}
              value={results} onChange={e => setResults(Number(e.target.value))} />
            <div className={styles.rangeLabels}><span>5</span><span>200</span></div>
          </div>
          <div>
            <label className={styles.label}>Offres publiées depuis (heures)</label>
            <input className={styles.input} type="number" placeholder="Ex : 48 (vide = toutes)"
              min={1} value={hoursOld} onChange={e => setHoursOld(e.target.value)} />
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Sources *</label>
          <div className={styles.chips}>
            {ALL_SOURCES.map(s => (
              <button key={s.id} type="button"
                className={`${styles.chip} ${sources.includes(s.id) ? styles.chipActive : ''}`}
                onClick={() => toggleSource(s.id)}>{s.label}</button>
            ))}
          </div>
        </div>

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

        {/* Remote + boutons d'action */}
        <div className={styles.formFooter}>
          <label className={styles.toggleLabel}>
            <div className={`${styles.toggle} ${remoteOnly ? styles.toggleOn : ''}`}
              onClick={() => setRemoteOnly(p => !p)} role="switch" aria-checked={remoteOnly}>
              <span className={styles.toggleThumb} />
            </div>
            Remote uniquement
          </label>

          <div className={styles.actionBtns}>
            {status !== 'idle' && (
              <button className="btn-ghost" onClick={reset} disabled={isRunning}>
                <RotateCcw size={13} strokeWidth={2} /> Réinitialiser
              </button>
            )}
            <button
              className={`btn-primary ${!canLaunch ? styles.btnDisabled : ''}`}
              onClick={handleLaunch} disabled={!canLaunch}
            >
              {isRunning && !proxyMode
                ? <Loader size={13} className={styles.spin} strokeWidth={2.5} />
                : <Play size={13} strokeWidth={2.5} />
              }
              {isRunning && !proxyMode ? 'Scraping…' : 'Lancer le scraping'}
            </button>
          </div>
        </div>

        {/* ── Zone proxy résidentiel ── */}
        <div className={styles.proxySeparator} />

        <div className={styles.proxySection}>
          {/* Bouton toggle */}
          <button
            className={`${styles.proxyToggleBtn} ${proxyOpen ? styles.proxyToggleBtnOpen : ''}`}
            onClick={() => setProxyOpen(o => !o)}
          >
            <div className={styles.proxyToggleLeft}>
              <Shield size={14} strokeWidth={2} className={styles.proxyShieldIcon} />
              <div>
                <span className={styles.proxyToggleLabel}>Lancer le scraping avec Proxy</span>
                <span className={styles.proxyToggleSub}>
                  Rotation automatique de proxies résidentiels · Anti-blocage renforcé
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

          {/* Panneau proxy expandable */}
          {proxyOpen && (
            <div className={styles.proxyPanel}>
              <div className={styles.proxyHeader}>
                <div>
                  <p className={styles.proxyPanelTitle}>Proxies résidentiels</p>
                  <p className={styles.proxyPanelSub}>
                    Format requis : <code>IP:PORT:USERNAME:PASSWORD</code> — un proxy par ligne.
                    La rotation est automatique (round-robin) : chaque source utilise un proxy différent.
                  </p>
                </div>
                <div className={styles.proxyStats}>
                  {validProxyCount > 0 ? (
                    <span className={styles.proxyValid}>
                      <Wifi size={11} strokeWidth={2} />
                      {validProxyCount} valide{validProxyCount > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className={styles.proxyInvalid}>
                      <WifiOff size={11} strokeWidth={2} /> Aucun proxy valide
                    </span>
                  )}
                </div>
              </div>

              <textarea
                className={styles.proxyTextarea}
                value={proxyText}
                onChange={e => setProxyText(e.target.value)}
                placeholder={`31.59.20.176:6754:username:password\n23.95.150.145:6114:username:password\n...`}
                rows={8}
                spellCheck={false}
              />

              <div className={styles.proxyInfo}>
                <AlertCircle size={11} strokeWidth={2} style={{ flexShrink: 0, color: 'var(--outline)' }} />
                <p>
                  Les lignes mal formatées sont ignorées silencieusement.
                  Si un proxy échoue (blocage ou déconnexion), il est automatiquement retiré de la rotation.
                  Les logs indiquent quel proxy a été utilisé pour chaque source (colonne 🛡️).
                </p>
              </div>

              {/* Bouton lancer avec proxy */}
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

              {!keywords.trim() && (
                <p className={styles.proxyWarning}>
                  ⚠️ Renseignez les mots-clés et sélectionnez au moins une source avant de lancer.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Barre de progression ── */}
      {status !== 'idle' && (
        <div className={styles.progressCard}>
          <div className={styles.progressHeader}>
            <StatusBadge status={status} proxyMode={proxyMode} />
            {result && status === 'success' && (
              <span className={styles.resultSummary}>
                {result.message ?? `Terminé — task ${result.task_id?.slice(0, 8)}`}
              </span>
            )}
            {error && (
              <span style={{ fontSize: 12, color: 'var(--error)' }}>
                {error.detail ?? error.message}
              </span>
            )}
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

      {/* ── Audit Trail ── */}
      <div className={styles.logsSection}>
        <div className={styles.logsHeader}>
          <h2 className={`${styles.logsTitle} font-headline tracking-tight`}>Audit Trail</h2>
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
                  <th className={styles.th}>Source</th>
                  <th className={styles.th}>Statut</th>
                  <th className={styles.th} style={{ textAlign: 'right' }}>Trouvées</th>
                  <th className={styles.th} style={{ textAlign: 'right' }}>Nouvelles</th>
                  <th className={styles.th} style={{ textAlign: 'right' }}>Durée</th>
                  <th className={styles.th} style={{ textAlign: 'right' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => <LogRow key={log.id} log={log} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
